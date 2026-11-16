#!/usr/bin/env bash
set -u

ROOT="${JIRA_WATCH_HOME:?set JIRA_WATCH_HOME to the plugin data directory}"
PROJECT="${1:?usage: jira-watch.sh <project>}"
PROJ_DIR="$ROOT/projects/$PROJECT"
CARDS_FILE="$PROJ_DIR/cards.txt"
STATE_DIR="$PROJ_DIR/state"

[ -f "$CARDS_FILE" ] || { echo "WATCHER ERROR: missing $CARDS_FILE"; exit 1; }

[ -f "$ROOT/credentials.env" ] && . "$ROOT/credentials.env"
[ -f "$PROJ_DIR/project.env" ] && . "$PROJ_DIR/project.env"

: "${JIRA_EMAIL:?set JIRA_EMAIL in credentials.env}"
: "${JIRA_API_TOKEN:?set JIRA_API_TOKEN in credentials.env}"
: "${JIRA_BASE:?set JIRA_BASE in credentials.env or project.env}"

INTERVAL="${INTERVAL:-300}"
INCLUDE_MINE="${INCLUDE_MINE:-1}"

mkdir -p "$STATE_DIR"

api() {
  curl -sS --fail --max-time 30 -u "$JIRA_EMAIL:$JIRA_API_TOKEN" -H "Accept: application/json" "$JIRA_BASE$1" 2>/dev/null
}

MY_ID=""
until MY_ID="$(api /rest/api/3/myself | jq -r .accountId)" && [ -n "$MY_ID" ] && [ "$MY_ID" != "null" ]; do
  sleep "$INTERVAL"
done

while true; do
  out=""
  while read -r KEY; do
    case "$KEY" in ""|\#*) continue ;; esac
    seen="$STATE_DIR/$KEY.seen"
    first=0
    [ -f "$seen" ] || first=1
    json="$(api "/rest/api/3/issue/$KEY/comment?orderBy=created&maxResults=100")" || continue
    comments="$(echo "$json" | jq -c '.comments[] | {id, author: .author.accountId, name: .author.displayName, text: ([.body | .. | .text? // empty] | join(" "))}')" || continue
    [ "$first" = 1 ] && : > "$seen"
    while read -r c; do
      [ -z "$c" ] && continue
      id="$(echo "$c" | jq -r .id)"
      grep -qx "$id" "$seen" && continue
      echo "$id" >> "$seen"
      [ "$first" = 1 ] && continue
      if [ "$INCLUDE_MINE" != 1 ] && [ "$(echo "$c" | jq -r .author)" = "$MY_ID" ]; then continue; fi
      out+="NEW COMMENT $KEY id=$id by $(echo "$c" | jq -r .name): $(echo "$c" | jq -r .text | cut -c1-300)"$'\n'
    done <<< "$comments"
  done < "$CARDS_FILE"
  if [ -n "$out" ]; then
    printf '%s' "$out"
    exit 0
  fi
  sleep "$INTERVAL"
done
