---
name: propose-commit-message
description: This skill should be used when proposing commit messages for code changes.
---

Propose a short commit message for the current uncommitted changes. Do not run `git commit`.

1. Check for changes:
   - `git diff --cached --stat` (staged)
   - `git diff --stat` (unstaged)
   - `git ls-files --others --exclude-standard` (untracked)

   If all three are empty, there is nothing to propose — say so and stop.

2. Look at the actual diff content for context: `git diff --cached -U3` and `git diff -U3`.

3. Print a single short commit message summarizing the changes. Do not execute `git commit` or any other git command that would create a commit.

