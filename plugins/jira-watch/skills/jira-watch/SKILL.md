---
name: jira-watch
description: Watch Jira cards for new comments without polluting the session. Use when the user wants to be notified about new Jira comments on tracked cards, or to add a card to the watch list.
argument-hint: "<project> [card keys...]"
---

A background script polls Jira and exits at the first new comment. The exit wakes this session. The session reads the comment, tells the user, and starts the script again. While nobody comments, the transcript gets no lines.

Data lives outside the plugin, in `~/.config/harkairt-claude-marketplace/jira-watch/`:

- `credentials.env` holds `JIRA_EMAIL`, `JIRA_API_TOKEN` and `JIRA_BASE` (for example `https://example.atlassian.net`). All projects share it.
- `projects/<project>/cards.txt` holds one card key per line.
- `projects/<project>/state/` holds the comment IDs that the script already saw. Do not edit it.
- `projects/<project>/project.env` is optional. It overrides `JIRA_BASE`, `INTERVAL` (seconds, default 300) or `INCLUDE_MINE` (default 1, set 0 to skip the user's own comments).

## 1. Check the set-up

`$ARGUMENTS` names the project. If it does not, ask the user.

Check that `credentials.env` exists with `ls -l`. Never read it, print it or ask for the token in chat. If it is missing, give the user this command for a real terminal (not the chat box), then wait:

```bash
umask 077; mkdir -p ~/.config/harkairt-claude-marketplace/jira-watch; read "e?Atlassian email: "; read -s "t?API token: "; read "b?Jira base URL: "; printf 'JIRA_EMAIL=%s\nJIRA_API_TOKEN=%s\nJIRA_BASE=%s\n' "$e" "$t" "$b" > ~/.config/harkairt-claude-marketplace/jira-watch/credentials.env; unset e t b; echo; echo saved
```

The user creates the token at https://id.atlassian.com/manage-profile/security/api-tokens.

## 2. Set the cards

Add each card key from `$ARGUMENTS` to `projects/<project>/cards.txt` (create the folder and file when missing). Do not add a key twice. A new card is recorded silently on the first poll: its existing comments never raise an event.

## 3. Start the watch

Run this with Bash and `run_in_background: true`. Do not use Monitor: it stops after 30 minutes.

```bash
${CLAUDE_PLUGIN_ROOT}/bin/jira-watch.sh <project>
```

## 4. On exit

The task ends with output lines like `NEW COMMENT MHA-1 id=1 by Name: text`. Read the output file.

1. Tell the user in one line per comment: card, author, first words.
2. Send a PushNotification when the comment is from someone else.
3. If a session handles that card, forward the comment to it with SendMessage. Skip comments that the user wrote.
4. Start the watch again (step 3).

A line that starts with `WATCHER ERROR` means the set-up is wrong. Tell the user and do not restart in a loop.

The watch stops when the session or the app closes. Start it again in the next session.
