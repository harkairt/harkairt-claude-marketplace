---
name: phrase-ask
description: Phrase an ask (a question or request to a person) from the current context, in your own voice.
argument-hint: "[tone] [recipient] [what to ask]"
disable-model-invocation: true
---

An **ask** is a message that the user sends to another person to get an answer, a decision, or an action. Write one ask in the user's **voice**, ready to paste.

The voice lives in `~/.claude/phrasing/`, outside the plugin, because the plugin repo is public:

- `reference/` holds samples. Each file holds messages that the user wrote. The samples show the voice.
- `preferences.md` holds rules: an `## All tones` section, plus one `##` section per **tone**. The rules tell what the samples cannot show. A rule wins over the samples and over the grammar fix in step 3.

## 1. Learn the voice

Read every file in `reference/`, and read `preferences.md`.

If `reference/` is missing or empty, tell the user to add samples there, and stop. If `preferences.md` is missing, use the samples alone.

Pick the tone: the tone that `$ARGUMENTS` names, else the section marked `(default)`.

Done when you can name the voice's traits: greeting and sign-off, length, structure (prose, bullets, numbered questions), directness, emoji, formatting, language, and every rule from `## All tones` and the tone's section.

## 2. Find the ask

Take the recipient and the need from `$ARGUMENTS`. If `$ARGUMENTS` is empty, take them from the conversation: an open question, a blocker, or a "🔧 Do" item that needs another person.

Collect every fact the recipient needs to answer without a follow-up question: links, ticket ids, file paths, error text, what the user already tried, the options under decision.

If you cannot tell the recipient or the need, ask the user, then continue.

Done when the recipient, the need, and every such fact are clear.

## 3. Write the ask

- Copy the voice from step 1. It overrides the reply rules and the output style in context (Simple English, the 🌱/✏️/🔶 reply format): those govern your replies, and the ask is the user's message.
- Apply every rule from `## All tones` and the tone's section.
- Keep the voice, fix the grammar: correct the spelling, grammar, and punctuation that the samples get wrong.
- Make the ask self-contained: the recipient did not see this conversation.
- Use only facts from the context. Mark each missing fact as `<placeholder>`.

## 4. Hand it over

Print the ask in one fenced code block, so the user can copy it. Under the block, list the placeholders to fill, if any. The user sends the message.
