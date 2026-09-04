#!/usr/bin/env bash
# UserPromptSubmit: never blocks the user. It warns when a live credential was
# pasted into the prompt, so it does not get written into a tracked file.
. "$(dirname "${BASH_SOURCE[0]}")/lib/adapter.sh"

cc_read_payload
PROMPT="$(cc_get_any '.user_input' '.prompt')"
[ -z "$PROMPT" ] && exit 0

agp_guard_content "user-prompt" "$PROMPT"
[ "$AGP_DECISION" = "allow" ] && exit 0

agp_log claude-code UserPromptSubmit "credential-shaped value in prompt"
cc_context UserPromptSubmit \
  "SECURITY: the user's message appears to contain a credential ($AGP_REASON). Do not write it into any file, commit, log line or outbound request. Reference it as an environment variable declared in .env.example and read through src/config/env.ts, and suggest rotating it if it is a live secret."
