#!/usr/bin/env bash
# ---------------------------------------------------------------------------
# The directory boundary, shared by the two guards that enforce it:
#
#   guard-project-scope.sh  PreToolUse       - the tools the model calls
#   guard-prompt-scope.sh   UserPromptSubmit - the @ references the owner types
#
# It lives here because an allow-list that exists twice drifts: widening one
# copy and not the other is a hole that nothing reports. Source lib/hook-io.sh
# first, call hk_init, then hk_scope_init (which needs HK_ROOT).
#
# The caller chooses how a denial is emitted, because the two hook events do
# not share a protocol:
#   HK_SCOPE_DENY=hk_deny          -> PreToolUse JSON decision, exit 0
#   HK_SCOPE_DENY=hk_block_prompt  -> stderr + exit 2 (UserPromptSubmit)
# ---------------------------------------------------------------------------

HK_SCOPE_DENY="${HK_SCOPE_DENY:-hk_deny}"
HK_SCOPE_GUARD="${HK_SCOPE_GUARD:-.claude/hooks/guard-project-scope.sh}"
HK_SCOPE_HINT="${HK_SCOPE_HINT:-}"
HK_SCOPE_ALLOW=""

# Read-only system paths the toolchain legitimately needs, plus the agent
# scratchpad. Extend with HK_SCOPE_EXTRA_ALLOW="/opt/homebrew /srv/cache".
hk_scope_init() {
  HK_SCOPE_ALLOW="/usr /bin /sbin /lib /lib64 /opt /proc /etc/ssl /etc/ca-certificates
/dev/null /dev/zero /dev/urandom /dev/random /dev/stdin /dev/stdout /dev/stderr /dev/tty /dev/fd
/tmp/claude- /var/tmp/claude- /var/folders /private/var/folders
${TMPDIR:-} ${HK_SCOPE_EXTRA_ALLOW:-}"

  # Claude Code keeps this project's own state (memory, transcripts) under
  # ~/.claude/projects/<project-dir-with-slashes-as-dashes>. That directory is
  # part of working on *this* project; the sibling directories are not.
  [ -n "${HOME:-}" ] && HK_SCOPE_ALLOW="$HK_SCOPE_ALLOW ${HOME}/.claude/projects/${HK_ROOT//\//-}"

  [ -n "$HK_SCOPE_HINT" ] ||
    HK_SCOPE_HINT="$HK_SCOPE_GUARD confines this session to ${HK_ROOT}. Work from paths relative to the project root. If the task genuinely needs something outside it, say what you need and let the owner run it or widen HK_SCOPE_EXTRA_ALLOW - never work around this hook."
}

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
    "$HK_SCOPE_DENY" "Denied: \`$raw\` (via $origin) is a link that resolves to $real, outside this project. $HK_SCOPE_HINT"
  }

  hk_scope_allowed "$abs" && return 0
  "$HK_SCOPE_DENY" "Denied: \`$raw\` (via $origin) resolves to $abs, outside this project. $HK_SCOPE_HINT"
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
