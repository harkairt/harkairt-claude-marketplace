---
name: jira-watch
description: Watch Jira cards for new comments without polluting the session, with one sub-session per card. Use when the user wants to track Jira cards, to be notified about new comments, or to add or remove a tracked card.
argument-hint: "<project> [card keys...]"
---

This session is the host. A background script polls Jira and exits at the first event. The exit wakes this session. The session handles the event and starts the script again. While nothing happens, the transcript gets no lines.

Each card in `cards.txt` has one sub-session. Its title is `<KEY> - <card title>`. The host finds the sub-session of a card by that `<KEY> - ` prefix.

Data lives in the plugin data directory, `${CLAUDE_PLUGIN_DATA}`. It survives plugin updates. Write no state in `${CLAUDE_PLUGIN_ROOT}`.

- `credentials.env` holds `JIRA_EMAIL`, `JIRA_API_TOKEN` and `JIRA_BASE` (for example `https://example.atlassian.net`). All projects share it.
- `projects/<project>/cards.txt` holds one card key per line. The user edits it by hand.
- `projects/<project>/child-brief.md` is optional. It holds rules that every sub-session gets in its brief.
- `projects/<project>/state/` holds the comment IDs and the card list that the script already saw. Do not edit it.
- `projects/<project>/project.env` is optional. It overrides `JIRA_BASE`, `INTERVAL` (seconds, default 300) or `INCLUDE_MINE` (default 1, set 0 to skip the user's own comments).

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

Do this at the start and after each card event. List the sessions with `list_sessions` and match them to the keys by title prefix.

- A card in `cards.txt` without a sub-session: create one (see "New card").
- A session with a `<KEY> - ` title prefix whose key is not in `cards.txt`: report it as stale (see "Removed card"). Report it once for each key per host session.

## 4. Start the watch

Run this with Bash and `run_in_background: true`. Do not use Monitor: it stops after 30 minutes.

```bash
JIRA_WATCH_HOME="${CLAUDE_PLUGIN_DATA}" "${CLAUDE_PLUGIN_ROOT}/bin/jira-watch.sh" <project>
```

The script does not receive `CLAUDE_PLUGIN_DATA` from Claude Code, so the command passes it as `JIRA_WATCH_HOME`. The script notices a change of `cards.txt` within 5 seconds.

## 5. On exit

Read the output file. Each line is one event. Handle all lines, then start the watch again (step 4).

**`NEW COMMENT <KEY> id=<id> by <name>: <text>`**
1. Tell the user in one line: card, author, first words.
2. Send a PushNotification when the comment is from someone else.
3. Forward the comment to the sub-session of the card with SendMessage. Skip comments that the user wrote.

**`CARDS ADDED: <KEY> ...`**: for each key, create a sub-session (see "New card"). The script records the existing comments of a new card silently on its next poll, so they raise no event.

**`CARDS REMOVED: <KEY> ...`**: for each key, report a stale sub-session (see "Removed card").

**`WATCHER ERROR ...`**: the set-up is wrong. Tell the user and do not restart in a loop.

## New card

1. Read the card title and description with the Atlassian tools.
2. Start a sub-session with `start_session`. Use `initiation: "user_asked"`, because the user asked for this by adding the key. Use `context: "fresh"` and `use_worktree: false`.
3. Set the title to `<KEY> - <card title>`. Rename it with `set_session_title` when `start_session` names it otherwise.
4. The brief must say that the sub-session owns this card for communication and description work only, and writes no code. It reads the card, reports what the card asks, its state and open questions, and drafts messages. It never edits or comments on Jira and never sends a message without a clear yes from the user. Add the rules from `child-brief.md` when the file exists.
5. Tell the user in one line that the card is tracked and which session handles it.

## Removed card

Find the session with the `<KEY> - ` title prefix. Tell the user in one line: the sub-session [title](#session-id) is stale because the card is not in `cards.txt` any more, and it gets no more comments. The user decides: add the key back to `cards.txt`, or archive the session. Do not archive the session and do not edit `cards.txt` without a clear yes. If no session has that prefix, say so and do nothing else.

The watch stops when the session or the app closes. Start it again in the next session.
