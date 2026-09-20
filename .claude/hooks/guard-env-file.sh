#!/usr/bin/env bash
# ---------------------------------------------------------------------------
# PreToolUse guard: real dotenv files are off limits.
#
# Denies any attempt to read, list, write, edit, move, copy, source or delete
# a .env file, whether through a file tool, a shell command or an MCP tool.
# Sharable templates (.env.example and friends) stay fully available.
#
# Self-contained: backed by lib/hook-io.sh, not by
# scripts/agent-security/policy.sh. It runs alongside the policy adapters, and
# is deliberately stricter than them - the policy treats a dotenv read as
# "ask", this denies it outright.
#
# Wired in .claude/settings.json to Read|Write|Edit|NotebookEdit|Glob|Grep|Bash
# and to mcp__.*.
# ---------------------------------------------------------------------------
. "$(dirname "${BASH_SOURCE[0]}")/lib/hook-io.sh"

hk_init

# Files that exist precisely to be shared. Everything else named .env* holds
# real secrets. Extend with HK_ENV_ALLOWED_EXTRA=".env.ci .env.test".
HK_ENV_ALLOWED=".env.example .env.sample .env.template .env.dist .env.defaults ${HK_ENV_ALLOWED_EXTRA:-}"

HK_ENV_HINT="Reading, writing or deleting a real .env file is blocked by .claude/hooks/guard-env-file.sh. Declare the variable in .env.example and consume it through src/config/env.ts instead. If you genuinely need the live value, ask the owner to read it in their own shell - never work around this hook."

hk_env_is_secret() { # <path or shell token>
  local base="${1##*/}" allowed
  base="${base//[*?]/}" # ".env*" and ".env?" mean the real file too
  case "$base" in
    .env | .env.*) ;;
    *) return 1 ;;
  esac
  for allowed in $HK_ENV_ALLOWED; do
    [ "$base" = "$allowed" ] && return 1
  done
  return 0
}

hk_env_check() { # <value> <what the value came from>
  [ -n "$1" ] || return 0
  hk_env_is_secret "$1" && hk_deny "Denied: \`$1\` (via $2) targets a real dotenv file. $HK_ENV_HINT"
  return 0
}

case "$HK_TOOL" in
  Bash)
    COMMAND="$(hk_get '.tool_input.command')"
    [ -n "$COMMAND" ] || exit 0
    # Every token in the command line that names a dotenv file - this catches
    # cat/rm/mv/cp/sed -i/tee/source/--env-file and redirections alike.
    while IFS= read -r token; do
      hk_env_check "$token" "the shell command"
    done <<EOF
$(printf '%s' "$COMMAND" | grep -Eo '[A-Za-z0-9_./~*?-]*\.env[A-Za-z0-9_.*?-]*' 2>/dev/null)
EOF
    ;;

  Read | Write | Edit | MultiEdit | NotebookEdit)
    # Only the target path is inspected: a file whose *content* mentions .env
    # (a doc, this very hook) is legitimate work.
    hk_env_check "$(hk_get_any '.tool_input.file_path' '.tool_input.notebook_path' '.tool_input.path')" "the tool target"
    ;;

  Glob)
    hk_env_check "$(hk_get '.tool_input.pattern')" "the glob pattern"
    hk_env_check "$(hk_get '.tool_input.path')" "the search path"
    ;;

  Grep)
    # The regex is not a path, but the search target is - and `grep -r X .env`
    # would stream the secrets straight into the context.
    hk_env_check "$(hk_get '.tool_input.path')" "the search path"
    hk_env_check "$(hk_get '.tool_input.glob')" "the file filter"
    ;;

  *)
    # Unknown or MCP tool: inspect only the fields that look like a path (or a
    # command), tokenised the same way as a shell command line.
    while IFS= read -r token; do
      hk_env_check "$token" "$HK_TOOL"
    done <<EOF
$(hk_tool_path_values | grep -Eo '[A-Za-z0-9_./~*?-]*\.env[A-Za-z0-9_.*?-]*' 2>/dev/null)
EOF
    ;;
esac

exit 0
