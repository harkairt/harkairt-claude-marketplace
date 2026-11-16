---
name: jira-watch
description: Watch Jira cards for new comments and changes without polluting the session, with one sub-session per card and per subtask. Use when the user wants to track Jira cards, to be notified about comments or description changes, or to add or remove a tracked card.
argument-hint: "<project> [card keys...]"
---

This session is the host. A background script polls Jira and exits at the first event. The exit wakes this session. The session handles the events and starts the script again. While nothing happens, the transcript gets no lines.

Each tracked card has one sub-session. The title of a sub-session is `<KEY> - <card title>`.

Data lives in the plugin data directory, `${CLAUDE_PLUGIN_DATA}`. It survives plugin updates. Write no state in `${CLAUDE_PLUGIN_ROOT}`.

- `credentials.env` holds `JIRA_EMAIL`, `JIRA_API_TOKEN` and `JIRA_BASE` (for example `https://example.atlassian.net`). All projects share it.
- `projects/<project>/cards.txt` holds one card key per line. The user edits it by hand. A key with `(*)`, for example `MHA-231(*)`, also tracks every subtask of the card that is not done.
- `projects/<project>/child-brief.md` is optional. It holds rules that every sub-session gets in its brief.
- `projects/<project>/state/` is the script's memory. Do not edit it.
- `projects/<project>/project.env` is optional. It overrides `JIRA_BASE`, `INTERVAL` (seconds, default 300), `INCLUDE_MINE` (default 1, set 0 to skip the user's own changes), `WATCH_FIELDS` (default `description summary status assignee priority`) or `RETRY_AFTER` (seconds, default 600).

## 1. Check the set-up

`$ARGUMENTS` names the project. If it does not, ask the user.

Check that `credentials.env` exists with `ls -l`. Never read it, print it or ask for the token in chat. If it is missing, give the user this command for a real terminal (not the chat box), then wait:

```bash
umask 077; mkdir -p "${CLAUDE_PLUGIN_DATA}"; read "e?Atlassian email: "; read -s "t?API token: "; read "b?Jira base URL: "; printf 'JIRA_EMAIL=%s\nJIRA_API_TOKEN=%s\nJIRA_BASE=%s\n' "$e" "$t" "$b" > "${CLAUDE_PLUGIN_DATA}/credentials.env"; unset e t b; echo; echo saved
```

The user creates the token at https://id.atlassian.com/manage-profile/security/api-tokens.

## 2. Set the cards

Add each card key from `$ARGUMENTS` to `projects/<project>/cards.txt` (create the folder and file when missing). Do not add a key twice.

## 3. Reconcile the sub-sessions

Do this at the start and after each card event. List the sessions with `list_sessions`. A session belongs to a key when its title starts with the key and the next character is not a digit (`MHA-23` must not match `MHA-231`). A session whose title only contains the key elsewhere is ambiguous: ask the user and do not create a second session.

- A card in `cards.txt` without a session: create one (see "New card").
- A session whose key is not in `cards.txt`, and that is not the subtask of a `(*)` card: report it as stale (see "Removed card"). Report it once for each key per host session.
- Run `JIRA_WATCH_HOME="${CLAUDE_PLUGIN_DATA}" "${CLAUDE_PLUGIN_ROOT}/bin/jira-watch.sh" <project> pending`. It prints `<KEY> <PARENT>` for each subtask that waits for a session. Handle each one as a `SUBTASK PENDING` event.

## 4. Start the watch

Run this with Bash and `run_in_background: true`. Do not use Monitor: it stops after 30 minutes.

```bash
JIRA_WATCH_HOME="${CLAUDE_PLUGIN_DATA}" "${CLAUDE_PLUGIN_ROOT}/bin/jira-watch.sh" <project>
```

The script does not receive `CLAUDE_PLUGIN_DATA` from Claude Code, so the command passes it as `JIRA_WATCH_HOME`. The script notices a change of `cards.txt` within 5 seconds.

## 5. On exit

Read the output file. Each line is one event. Some events have indented lines below them. Handle all events, then start the watch again (step 4).

**`NEW COMMENT <KEY> id=<id> by <name>: <text>`** and **`EDITED COMMENT ...`**
1. Tell the user in one line: card, author, first words.
2. Send a PushNotification when the author is someone else.
3. Forward it to the session of the card with SendMessage.

**`CARD CHANGED <KEY> by <name>: <change>`**: the description, summary, status, assignee or priority changed. A description change comes with `-` (removed) and `+` (added) lines. Handle it as a comment: tell the user in one line what changed, for example "added requirement: ...", push when the author is someone else, and forward the full text to the session of the card.

**`CARDS ADDED: <KEY> ...`**: create a session for each key (see "New card").

**`CARDS REMOVED: <KEY> ...`**: report each key (see "Removed card").

**`SUBTASK PENDING: <PARENT> <KEY> (try <n>)`**: a subtask needs a session under the session of its parent.
1. If a session for `<KEY>` exists and was started by the parent session (`startedBy` in `list_sessions`), run `... <project> ack <KEY>`. Done.
2. If it exists with another parent, tell the user and run `ack`.
3. Otherwise find the session of `<PARENT>` and send it a message: start a sub-session for `<KEY>` with `start_session`, title `<KEY> - <card title>`, and the brief from "New card". Never create the session here: the app links a session to the session that started it, and that link is the hierarchy.
4. If `<PARENT>` has no session, create it first (see "New card") and ask it as soon as it exists.
5. Do not run `ack` after sending. The script repeats the event after `RETRY_AFTER` seconds, up to 3 tries. A session that now exists ends the retry (step 1).

**`SUBTASK STUCK: <PARENT> <KEY>`**: 3 tries did not create the session. Tell the user. Do not create a flat session. The user decides.

**`SUBTASK DONE: <PARENT> <KEY>`**: the subtask is resolved. Tell the user that its session gets no more updates and the user can archive it. Do not archive it.

**`SUBTASK GONE: <PARENT> <KEY>`** and **`SUBTASKS OFF: <PARENT>: <KEY> ...`**: the subtask is not under a tracked parent any more. Report each as a stale session (see "Removed card").

**`WATCHER ERROR ...`**: the set-up is wrong. Tell the user and do not restart in a loop.

## New card

1. Read the card title and description with the Atlassian tools.
2. Start a sub-session with `start_session`. Use `initiation: "user_asked"`, because the user asked for this by adding the key. Use `context: "fresh"` and `use_worktree: false`.
3. Set the title to `<KEY> - <card title>`. Rename it with `set_session_title` when `start_session` names it otherwise.
4. The brief must say that the sub-session owns this card for communication and description work only, and writes no code. It reads the card, reports what the card asks, its state and open questions, and drafts messages. It never edits or comments on Jira and never sends a message without a clear yes from the user. Add the rules from `child-brief.md` when the file exists.
5. Tell the user in one line that the card is tracked and which session handles it.

## Removed card

Find the session of the key. Tell the user in one line: the sub-session [title](#session-id) is stale because the card is not tracked any more, and it gets no more updates. The user decides: add the key back to `cards.txt`, or archive the session. Do not archive the session and do not edit `cards.txt` without a clear yes. If no session matches, say so and do nothing else.

The watch stops when the session or the app closes. Start it again in the next session.
