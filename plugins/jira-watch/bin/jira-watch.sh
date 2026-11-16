#!/usr/bin/env bash
set -u

ROOT="${JIRA_WATCH_HOME:?set JIRA_WATCH_HOME to the plugin data directory}"
PROJECT="${1:?usage: jira-watch.sh <project> [ack <KEY> | pending]}"
PROJ_DIR="$ROOT/projects/$PROJECT"
CARDS_FILE="$PROJ_DIR/cards.txt"
STATE_DIR="$PROJ_DIR/state"
SNAP="$STATE_DIR/cards.snapshot"
PENDING_DIR="$STATE_DIR/pending"
SUB_DIR="$STATE_DIR/subtasks"

mkdir -p "$STATE_DIR" "$PENDING_DIR" "$SUB_DIR"

case "${2:-}" in
  ack)
    rm -f "$PENDING_DIR/${3:?usage: ack <KEY>}"
    exit 0
    ;;
  pending)
    for f in "$PENDING_DIR"/*; do
      [ -f "$f" ] && echo "$(basename "$f") $(cut -d' ' -f1 "$f")"
    done
    exit 0
    ;;
esac

[ -f "$CARDS_FILE" ] || { echo "WATCHER ERROR: missing $CARDS_FILE"; exit 1; }

[ -f "$ROOT/credentials.env" ] && . "$ROOT/credentials.env"
[ -f "$PROJ_DIR/project.env" ] && . "$PROJ_DIR/project.env"

: "${JIRA_EMAIL:?set JIRA_EMAIL in credentials.env}"
: "${JIRA_API_TOKEN:?set JIRA_API_TOKEN in credentials.env}"
: "${JIRA_BASE:?set JIRA_BASE in credentials.env or project.env}"

INTERVAL="${INTERVAL:-300}"
INCLUDE_MINE="${INCLUDE_MINE:-1}"
WATCH_FIELDS="${WATCH_FIELDS:-description summary status assignee priority}"
RETRY_AFTER="${RETRY_AFTER:-600}"

api() {
  curl -sS --fail --max-time 30 -u "$JIRA_EMAIL:$JIRA_API_TOKEN" -H "Accept: application/json" "$JIRA_BASE$1" 2>/dev/null
}

search() {
  curl -sS --fail --max-time 30 -G -u "$JIRA_EMAIL:$JIRA_API_TOKEN" -H "Accept: application/json" \
    --data-urlencode "jql=$1" --data-urlencode "fields=$2" --data-urlencode "maxResults=100" \
    "$JIRA_BASE/rest/api/3/search/jql" 2>/dev/null
}

tokens() {
  grep -vE '^[[:space:]]*(#|$)' "$CARDS_FILE" | awk '{print $1}' | sort -u
}

strip_flag() {
  sed 's/(\*)$//' | sort -u
}

flagged_of() {
  grep '(\*)$' | sed 's/(\*)$//' | sort -u
}

setdiff() {
  grep -vxFf <(printf '%s\n' "$2") <(printf '%s\n' "$1") | grep -v '^$'
}

known_subtasks() {
  [ -f "$SUB_DIR/$1.known" ] && awk '{print $1}' "$SUB_DIR/$1.known"
}

drop_subtasks() {
  parent="$1"
  keys="$(known_subtasks "$parent" | tr '\n' ' ')"
  rm -f "$SUB_DIR/$parent.known"
  for f in "$PENDING_DIR"/*; do
    [ -f "$f" ] || continue
    read -r p _ < "$f"
    [ "$p" = "$parent" ] && rm -f "$f"
  done
  [ -n "$keys" ] && echo "SUBTASKS OFF: $parent: ${keys% }"
  return 0
}

cards_changed() {
  tokens > "$SNAP.new"
  ! cmp -s "$SNAP" "$SNAP.new"
}

cards_events() {
  old_keys="$(strip_flag < "$SNAP")"
  new_keys="$(strip_flag < "$SNAP.new")"
  old_flags="$(flagged_of < "$SNAP")"
  new_flags="$(flagged_of < "$SNAP.new")"
  added="$(setdiff "$new_keys" "$old_keys" | tr '\n' ' ')"
  removed="$(setdiff "$old_keys" "$new_keys")"
  unflagged="$(setdiff "$old_flags" "$new_flags")"
  mv "$SNAP.new" "$SNAP"
  [ -n "$added" ] && echo "CARDS ADDED: ${added% }"
  if [ -n "$removed" ]; then
    echo "CARDS REMOVED: $(echo "$removed" | tr '\n' ' ' | sed 's/ $//')"
    for k in $removed; do drop_subtasks "$k"; done
  fi
  for k in $(setdiff "$unflagged" "$removed"); do drop_subtasks "$k"; done
  return 0
}

subtask_events() {
  flagged="$(tokens | flagged_of)"
  [ -z "$flagged" ] && return 0
  json="$(search "parent in ($(echo "$flagged" | paste -sd, -))" "status,parent")" || return 0
  now="$(date +%s)"
  for parent in $flagged; do
    known="$SUB_DIR/$parent.known"
    current="$(echo "$json" | jq -r --arg p "$parent" '.issues[] | select(.fields.parent.key == $p) | "\(.key) \(if .fields.status.statusCategory.key == "done" then "done" else "open" end)"' | sort)"
    while read -r key state; do
      [ -z "$key" ] && continue
      prev=""
      [ -f "$known" ] && prev="$(awk -v k="$key" '$1 == k {print $2}' "$known")"
      if [ "$state" = "open" ] && [ "$prev" != "open" ]; then
        printf '%s %s 0\n' "$parent" "$now" > "$PENDING_DIR/$key"
      elif [ "$state" = "done" ] && [ "$prev" = "open" ]; then
        rm -f "$PENDING_DIR/$key"
        echo "SUBTASK DONE: $parent $key"
      fi
    done <<< "$current"
    if [ -f "$known" ]; then
      for key in $(awk '$2 == "open" {print $1}' "$known"); do
        echo "$current" | grep -q "^$key " || { rm -f "$PENDING_DIR/$key"; echo "SUBTASK GONE: $parent $key"; }
      done
    fi
    printf '%s\n' "$current" | grep -v '^$' > "$known"
  done
  return 0
}

pending_events() {
  now="$(date +%s)"
  for f in "$PENDING_DIR"/*; do
    [ -f "$f" ] || continue
    key="$(basename "$f")"
    read -r parent epoch tries < "$f"
    if [ "$tries" -eq 0 ] || { [ "$tries" -lt 3 ] && [ $((now - epoch)) -ge "$RETRY_AFTER" ]; }; then
      echo "SUBTASK PENDING: $parent $key (try $((tries + 1)))"
      printf '%s %s %s\n' "$parent" "$now" $((tries + 1)) > "$f"
    elif [ "$tries" -eq 3 ] && [ $((now - epoch)) -ge "$RETRY_AFTER" ]; then
      echo "SUBTASK STUCK: $parent $key"
      printf '%s %s 99\n' "$parent" "$now" > "$f"
    fi
  done
  return 0
}

watch_keys() {
  {
    strip_flag < "$SNAP"
    for f in "$SUB_DIR"/*.known; do
      [ -f "$f" ] && awk '$2 == "open" {print $1}' "$f"
    done
  } | sort -u
}

is_mine() {
  [ "$INCLUDE_MINE" != 1 ] && [ "$1" = "$MY_ID" ]
}

process_comments() {
  key="$1"
  seen="$STATE_DIR/$key.seen"
  first=0
  [ -f "$seen" ] || first=1
  json="$(api "/rest/api/3/issue/$key/comment?orderBy=created&maxResults=100")" || return 0
  comments="$(echo "$json" | jq -c '.comments[] | {id, updated, author: .author.accountId, name: .author.displayName, text: ([.body | .. | .text? // empty] | join(" "))}')" || return 0
  : > "$seen.new"
  while read -r c; do
    [ -z "$c" ] && continue
    id="$(echo "$c" | jq -r .id)"
    updated="$(echo "$c" | jq -r .updated)"
    echo "$id $updated" >> "$seen.new"
    [ "$first" = 1 ] && continue
    prevline="$(grep -E "^$id( |\$)" "$seen" | head -1)"
    prevupdated=""
    case "$prevline" in *" "*) prevupdated="${prevline#* }" ;; esac
    if [ -z "$prevline" ]; then
      kind="NEW COMMENT"
    elif [ -n "$prevupdated" ] && [ "$prevupdated" != "$updated" ]; then
      kind="EDITED COMMENT"
    else
      continue
    fi
    is_mine "$(echo "$c" | jq -r .author)" && continue
    out+="$kind $key id=$id by $(echo "$c" | jq -r .name): $(echo "$c" | jq -r .text | cut -c1-300)"$'\n'
  done <<< "$comments"
  mv "$seen.new" "$seen"
}

describe_item() {
  entry="$1"
  i="$2"
  field="$(echo "$entry" | jq -r ".items[$i].field")"
  lower="$(echo "$field" | tr '[:upper:]' '[:lower:]')"
  case " $WATCH_FIELDS " in *" $lower "*) ;; *) return 0 ;; esac
  from="$(echo "$entry" | jq -r ".items[$i].fromString // \"\"")"
  to="$(echo "$entry" | jq -r ".items[$i].toString // \"\"")"
  if [ "$lower" = "description" ]; then
    echo "description:"
    diff <(printf '%s\n' "$from") <(printf '%s\n' "$to") | grep -E '^[<>]' | sed -e 's/^< /  - /' -e 's/^> /  + /' | cut -c1-200 | head -15
  else
    echo "$field: ${from:-(none)} → ${to:-(none)}"
  fi
}

process_history() {
  key="$1"
  hist="$STATE_DIR/$key.hist"
  first=0
  [ -f "$hist" ] || first=1
  touch "$hist"
  start=0
  while true; do
    page="$(api "/rest/api/3/issue/$key/changelog?startAt=$start&maxResults=100")" || return 0
    while read -r entry; do
      [ -z "$entry" ] && continue
      id="$(echo "$entry" | jq -r .id)"
      grep -qx "$id" "$hist" && continue
      echo "$id" >> "$hist"
      [ "$first" = 1 ] && continue
      is_mine "$(echo "$entry" | jq -r .author.accountId)" && continue
      count="$(echo "$entry" | jq '.items | length')"
      i=0
      while [ "$i" -lt "$count" ]; do
        text="$(describe_item "$entry" "$i")"
        [ -n "$text" ] && out+="CARD CHANGED $key by $(echo "$entry" | jq -r .author.displayName): $text"$'\n'
        i=$((i + 1))
      done
    done <<< "$(echo "$page" | jq -c '.values[]')"
    [ "$(echo "$page" | jq -r .isLast)" = "true" ] && break
    start=$((start + 100))
  done
}

poll_cards() {
  keys="$(watch_keys)"
  [ -z "$keys" ] && return 0
  last="$(cat "$STATE_DIR/last_poll" 2>/dev/null || echo 0)"
  now="$(date +%s)"
  mins=10080
  [ "$last" != 0 ] && mins=$(( (now - last) / 60 + 3 ))
  res="$(search "key in ($(echo "$keys" | paste -sd, -)) AND updated >= -${mins}m" "updated")" || return 0
  changed="$(echo "$res" | jq -r '.issues[].key')"
  for key in $keys; do
    if [ ! -f "$STATE_DIR/$key.seen" ] || [ ! -f "$STATE_DIR/$key.hist" ] || echo "$changed" | grep -qx "$key"; then
      process_comments "$key"
      process_history "$key"
    fi
  done
  echo "$now" > "$STATE_DIR/last_poll"
}

[ -f "$SNAP" ] || tokens > "$SNAP"

MY_ID=""
until MY_ID="$(api /rest/api/3/myself | jq -r .accountId)" && [ -n "$MY_ID" ] && [ "$MY_ID" != "null" ]; do
  sleep "$INTERVAL"
done

while true; do
  out=""
  if cards_changed; then
    out+="$(cards_events)"$'\n'
  fi
  out+="$(subtask_events)"$'\n'
  out+="$(pending_events)"$'\n'
  poll_cards
  if [ -n "$(echo "$out" | tr -d '[:space:]')" ]; then
    printf '%s\n' "$out" | grep -v '^$'
    exit 0
  fi
  waited=0
  while [ "$waited" -lt "$INTERVAL" ]; do
    sleep 5
    waited=$((waited + 5))
    cards_changed && break
  done
done
