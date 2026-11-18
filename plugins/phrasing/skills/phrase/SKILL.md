---
name: phrase
description: Phrase a message from the current context in your own voice: an ask, an FYI, or a summary.
argument-hint: "[tone] [kind] [reader] [what to say]"
disable-model-invocation: false
---

A **message** is text that the user sends to one or more **readers**. Write one message in the user's **voice**, ready to paste. Each message has one **kind**:

- **Ask**: gets an answer, a decision, or an action.
- **FYI**: lets the readers know about a change, a result, or a plan.
- **Summary**: condenses a thread, a meeting, or a piece of work.

The voice lives in `${CLAUDE_PLUGIN_DATA}/reference/`, outside the plugin, because the plugin repo is public. Each subfolder is a **tone**, for example `informal/` or `formal/`. Files at the top level apply to every tone, and files in a subfolder apply to that tone only:

- `rules.md` holds rules. A rule wins over the samples and over the grammar fix in step 3. If the two `rules.md` files conflict, the tone's file wins.
- Every other file holds samples: messages that the user wrote.

## 1. Learn the voice

Pick the tone: the subfolder that `$ARGUMENTS` names, else the default tone that the top-level `rules.md` names. If neither names a tone, ask the user.

Read every top-level file of `reference/` and every file in the tone's subfolder.

If you find no samples, tell the user to add samples there, and stop.

Done when you can name the voice's traits: greeting and sign-off, length, structure (prose, bullets, numbered questions), directness, emoji, formatting, language, and every rule from both `rules.md` files.

## 2. Find the message

Take the kind, the readers, and the content from `$ARGUMENTS`. If `$ARGUMENTS` is empty, take them from the conversation:

- Ask: an open question, a blocker, or a decision that needs another person.
- FYI: a change, a result, or a plan that other people must know about.
- Summary: finished work, or a thread or meeting that other people did not follow.

Collect every fact the readers need to understand the message without a follow-up question: links, ticket ids, file paths, error text. Then collect the facts that the kind needs:

- Ask: the need, the options under decision, and what the user already tried.
- FYI: what changed, why, and what it changes for the readers, with the action they must take, if any.
- Summary: the outcome, the decisions, and the open items.

If you cannot tell the kind, the readers, or the content, ask the user, then continue.

Done when the kind, the readers, and every such fact are clear.

## 3. Write the message

- Copy the voice from step 1. It overrides the reply rules and the output style in context, for example Simple English: those govern your replies, and the message is the user's text.
- Apply every rule from both `rules.md` files.
- Keep the voice, fix the grammar: correct the spelling, grammar, and punctuation that the samples get wrong.
- Make the message self-contained: the readers did not see this conversation.
- Use only facts from the context. Mark each missing fact as `<placeholder>`.

## 4. Hand it over

Print the message in one fenced code block, so the user can copy it. Under the block, list the placeholders to fill, if any. The user sends the message.
