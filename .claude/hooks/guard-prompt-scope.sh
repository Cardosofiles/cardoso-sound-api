#!/usr/bin/env bash
# ---------------------------------------------------------------------------
# UserPromptSubmit guard: the directory boundary, applied to what the owner
# types - not to what the model calls.
#
# Why this exists (D-75). An `@../other-project/` reference is resolved by
# Claude Code at submit time and injected into the turn as an `attachment`
# record. It is not a tool call, it carries no tool_name, and no PreToolUse
# matcher can ever see it - so guard-project-scope.sh, guard-env-file.sh and
# the policy adapters are all bypassed by construction. This hook is the only
# place where that path can still be judged.
#
# Only `@` references are inspected. A path merely written in prose is left
# alone: prose does not read a file, an attachment does.
#
# Blocking here stops the owner's own prompt, which the credential guard
# (guard-user-prompt.sh) deliberately never does. That is the accepted cost of
# a boundary without a convenient exception; widen it declaratively with
# HK_SCOPE_EXTRA_ALLOW, never by working around the hook.
# ---------------------------------------------------------------------------
. "$(dirname "${BASH_SOURCE[0]}")/lib/hook-io.sh"

. "$(dirname "${BASH_SOURCE[0]}")/lib/hook-scope.sh"

HK_SCOPE_DENY=hk_block_prompt
hk_init

# Set before hk_scope_init, which only fills a hint that is still empty, and
# after hk_init, which is what resolves HK_ROOT.
HK_SCOPE_HINT="The @ reference is resolved and read at submit time, before any tool runs, so the prompt was erased rather than the read denied. To work on that project, open Claude Code in its own directory. To bring material in, copy it under ${HK_ROOT}, or widen HK_SCOPE_EXTRA_ALLOW - never work around this hook."

hk_scope_init

PROMPT="$(hk_get_any '.prompt' '.user_input')"
[ -n "$PROMPT" ] || exit 0

# Markdown and prose glue punctuation onto a reference: `(@../x)`, "@../x",
# @../x. Opening punctuation becomes a space so the @ still starts a token;
# trailing punctuation is stripped per token below.
hk_prompt_scan() { # <prompt text>
  local token path
  while IFS= read -r token; do
    case "$token" in
      '@'?*) ;;
      *) continue ;;
    esac
    path="${token#@}"
    while :; do
      case "$path" in
        *[,\;:\!\?\)\]\}\>]) path="${path%?}" ;;
        *) break ;;
      esac
    done
    [ -n "$path" ] || continue
    hk_scope_check "$path" "the @ reference"
  done <<EOF
$(printf '%s' "$1" | tr '\042\047\140\050\133\173\074' '       ' | tr ' \t' '\n')
EOF
}

hk_prompt_scan "$PROMPT"

exit 0
