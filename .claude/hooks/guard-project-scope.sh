#!/usr/bin/env bash
# ---------------------------------------------------------------------------
# PreToolUse guard: the agent stays inside this project.
#
# Denies any tool call whose target resolves outside CLAUDE_PROJECT_DIR -
# `../../other-project`, `~/`, an absolute path elsewhere on the machine, a
# `cd` out of the tree, or a symlink inside the repo that points outside it.
# A short allow-list keeps the toolchain working (/usr, /bin, /dev/null, the
# agent scratchpad and this project's own Claude Code state).
#
# Self-contained: backed by lib/hook-io.sh, not by
# scripts/agent-security/policy.sh. The policy has no directory boundary of its
# own; this is the only thing that enforces one.
#
# Wired in .claude/settings.json to Read|Write|Edit|NotebookEdit|Glob|Grep|Bash
# and to mcp__.*.
# ---------------------------------------------------------------------------
. "$(dirname "${BASH_SOURCE[0]}")/lib/hook-io.sh"

hk_init

# Read-only system paths the toolchain legitimately needs, plus the agent
# scratchpad. Extend with HK_SCOPE_EXTRA_ALLOW="/opt/homebrew /srv/cache".
HK_SCOPE_ALLOW="/usr /bin /sbin /lib /lib64 /opt /proc /etc/ssl /etc/ca-certificates
/dev/null /dev/zero /dev/urandom /dev/random /dev/stdin /dev/stdout /dev/stderr /dev/tty /dev/fd
/tmp/claude- /var/tmp/claude- /var/folders /private/var/folders
${TMPDIR:-} ${HK_SCOPE_EXTRA_ALLOW:-}"

# Claude Code keeps this project's own state (memory, transcripts) under
# ~/.claude/projects/<project-dir-with-slashes-as-dashes>. That directory is
# part of working on *this* project; the sibling directories are not.
[ -n "${HOME:-}" ] && HK_SCOPE_ALLOW="$HK_SCOPE_ALLOW ${HOME}/.claude/projects/${HK_ROOT//\//-}"

HK_SCOPE_HINT=".claude/hooks/guard-project-scope.sh confines this session to ${HK_ROOT}. Work from paths relative to the project root. If the task genuinely needs something outside it, say what you need and let the owner run it or widen HK_SCOPE_EXTRA_ALLOW - never work around this hook."

# An entry ending in "-" (e.g. /tmp/claude-) is a literal string prefix; every
# other entry is a directory, matching itself and anything below it.
hk_scope_allowed() { # <absolute path>
  local prefix
  for prefix in $HK_SCOPE_ALLOW; do
    [ -n "$prefix" ] || continue
    case "$prefix" in
      *-)
        case "$1" in "$prefix"*) return 0 ;; esac
        ;;
      *)
        prefix="${prefix%/}"
        [ "$1" = "$prefix" ] && return 0
        case "$1" in "$prefix"/*) return 0 ;; esac
        ;;
    esac
  done
  return 1
}

hk_scope_check() { # <raw path or token> <what it came from>
  local raw="$1" origin="$2" abs real
  [ -n "$raw" ] || return 0

  abs="$(hk_abs "$raw")"
  hk_inside "$abs" && {
    # Inside by name - make sure it is not a symlink pointing back out.
    real="$(hk_real "$abs")"
    hk_inside "$real" && return 0
    hk_deny "Denied: \`$raw\` (via $origin) is a link that resolves to $real, outside this project. $HK_SCOPE_HINT"
  }

  hk_scope_allowed "$abs" && return 0
  hk_deny "Denied: \`$raw\` (via $origin) resolves to $abs, outside this project. $HK_SCOPE_HINT"
}

# A token is worth resolving when it is absolute, home-relative, or walks up
# with a real `..` segment. `git diff HEAD~1..HEAD` and `main..develop` are not
# paths and must not trip the guard.
hk_scope_is_candidate() { # <token>
  case "$1" in
    -*) return 1 ;; # a flag, not a path
    /* | '~' | '~/'*) return 0 ;;
  esac
  case "/$1/" in
    */../*) return 0 ;;
  esac
  return 1
}

hk_scope_scan_command() { # <command line>
  local token
  # Quotes become spaces, shell punctuation becomes newlines, then whitespace
  # splits the rest: --out=../x and `cd ..;ls` both end up as their own tokens.
  while IFS= read -r token; do
    [ -n "$token" ] || continue
    hk_scope_is_candidate "$token" && hk_scope_check "$token" "the shell command"
  done <<EOF
$(printf '%s' "$1" | tr '\042\047\140' '   ' | tr ';|&(){}<>=,' '\n' | tr ' \t' '\n')
EOF
}

case "$HK_TOOL" in
  Bash)
    COMMAND="$(hk_get '.tool_input.command')"
    [ -n "$COMMAND" ] || exit 0
    hk_scope_check "$(hk_get '.tool_input.cwd')" "the working directory"
    hk_scope_scan_command "$COMMAND"
    ;;

  Read | Write | Edit | MultiEdit | NotebookEdit)
    hk_scope_check "$(hk_get_any '.tool_input.file_path' '.tool_input.notebook_path' '.tool_input.path')" "the tool target"
    ;;

  Glob)
    hk_scope_check "$(hk_get '.tool_input.path')" "the search path"
    # A glob pattern is path-shaped: **/../../etc would escape just as well.
    PATTERN="$(hk_get '.tool_input.pattern')"
    hk_scope_is_candidate "$PATTERN" && hk_scope_check "$PATTERN" "the glob pattern"
    ;;

  Grep)
    # Only the search root, never the regex - `\.\./` is a valid pattern.
    hk_scope_check "$(hk_get '.tool_input.path')" "the search path"
    ;;

  *)
    # Unknown or MCP tool: only fields whose key looks like a path or command,
    # so a document body that merely mentions ../ is not mistaken for a target.
    while IFS= read -r value; do
      [ -n "$value" ] || continue
      if hk_scope_is_candidate "$value"; then
        hk_scope_check "$value" "$HK_TOOL"
      else
        hk_scope_scan_command "$value"
      fi
    done <<EOF
$(hk_tool_path_values)
EOF
    ;;
esac

exit 0
