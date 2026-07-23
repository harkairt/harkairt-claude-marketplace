#!/usr/bin/env bash
set -euo pipefail

# UserPromptSubmit hook: stdout is injected as context on every prompt, steering
# Claude away from writing unnecessary comments in the first place (zero API cost).
cat <<'POLICY'
Comment policy: do NOT write code comments unless they state a non-obvious constraint, invariant, or "why" that the code cannot express. Never write comments that restate what the code does, narrate the change, or act as section headers. Shebangs and tool directives (eslint-disable, @ts-ignore, noqa, ...) are fine. When a comment is genuinely warranted, write the code first without it, then add the comment in a separate, small Edit — never inline it into a large Write. This keeps any policy re-check cheap.
POLICY
