#!/usr/bin/env bash
# ---------------------------------------------------------------------------
# Agent Security Policy - shared, harness-agnostic guardrails.
#
# This file is the SINGLE SOURCE OF TRUTH for what an AI coding agent is
# allowed to do in this repository. Both harnesses consume it:
#
#   .claude/hooks/*        -> Claude Code   (PreToolUse / PostToolUse / ...)
#   .agents/hooks/*        -> Antigravity CLI (PreToolUse / PostToolUse)
#
# Never put secrets in this file: it is versioned in Git.
#
# Contract
#   agp_guard_command <command-string>
#   agp_guard_path    <read|write> <path>
#   agp_guard_content <path> <content>
#   agp_guard_url     <url>
#   agp_scan_injection <text>
# All of them set:
#   AGP_DECISION  allow | ask | deny
#   AGP_REASON    human/model readable explanation ("" when allow)
#   AGP_RULES     comma separated rule ids that fired
# ---------------------------------------------------------------------------

AGP_VERSION="1.0.0"
AGP_REPO_ROOT="${AGP_REPO_ROOT:-$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." 2>/dev/null && pwd)}"
AGP_LOG_FILE="${AGP_LOG_FILE:-$AGP_REPO_ROOT/.agent-guard.log}"

# --------------------------- internal helpers ------------------------------

agp__reset() {
  AGP_DECISION="allow"
  AGP_REASON=""
  AGP_RULES=""
  AGP__SEVERITY=1
}

agp__severity() {
  case "$1" in
    deny) printf '3' ;;
    ask)  printf '2' ;;
    *)    printf '1' ;;
  esac
}

agp__record() { # <decision> <rule-id> <reason>
  local sev; sev="$(agp__severity "$1")"
  if [ "$sev" -gt "$AGP__SEVERITY" ]; then
    AGP__SEVERITY="$sev"
    AGP_DECISION="$1"
  fi
  AGP_RULES="${AGP_RULES:+$AGP_RULES,}$2"
  AGP_REASON="${AGP_REASON:+$AGP_REASON; }[$2] $3"
}

# Normalize the haystack so trivial obfuscation does not bypass the rules:
# collapse whitespace, and add a second variant with quotes/backslashes removed
# (defeats r"m" -rf / rm\ -rf / 'rm' -rf style evasion).
# A newline becomes ";" rather than a space: in a multi-line script each line
# is its own statement, and rules that scan "up to the next separator"
# ([^;&|]*) must not leak across lines. Collapsing newlines into spaces would
# let an early `rm -f x` match a path mentioned many lines later.
agp__haystack() { # <raw>
  local raw plain
  raw="$(printf '%s' "$1" | tr '\t' ' ' | tr '\n' ';' | tr -s ' ')"
  plain="$(printf '%s' "$raw" | tr -d "\\\\'\"" | tr -s ' ')"
  printf '%s\n%s' "$raw" "$plain"
}

agp__match() { # <regex> - matches against $AGP__HAYSTACK
  printf '%s' "$AGP__HAYSTACK" | grep -Eiq -- "$1"
}

agp__rule() { # <decision> <rule-id> <regex> <reason>
  agp__match "$3" && agp__record "$1" "$2" "$4"
  return 0
}

# JSON string escaping in pure bash - no jq dependency for OUTPUT, so a hook
# can always report a denial even on a machine without jq installed.
agp_json_escape() { # <text>
  local s="$1"
  s="${s//\\/\\\\}"
  s="${s//\"/\\\"}"
  s="${s//	/\\t}"
  s="${s//$'\r'/}"
  s="${s//$'\n'/\\n}"
  printf '%s' "$s"
}

# Append-only audit trail of every non-allow decision (gitignored).
agp_log() { # <harness> <event> <target>
  [ "${AGP_DECISION:-allow}" = "allow" ] && return 0
  local ts target
  ts="$(date -u +%Y-%m-%dT%H:%M:%SZ 2>/dev/null || printf 'unknown')"
  target="$(printf '%s' "${3:-}" | tr -d '\n' | cut -c1-400)"
  printf '{"ts":"%s","harness":"%s","event":"%s","decision":"%s","rules":"%s","target":"%s"}\n' \
    "$ts" "${1:-unknown}" "${2:-unknown}" "${AGP_DECISION:-unknown}" "${AGP_RULES:-}" \
    "$(agp_json_escape "$target")" >> "$AGP_LOG_FILE" 2>/dev/null || true
}

# ------------------------------ command guard ------------------------------

agp_guard_command() { # <command-string>
  agp__reset
  local cmd="${1:-}"
  [ -z "$cmd" ] && return 0
  AGP__HAYSTACK="$(agp__haystack "$cmd")"

  # --- destructive filesystem -------------------------------------------
  agp__rule deny fs.rm_critical \
    'rm[[:space:]]+[^;&|]*-[[:alnum:]]*[rf][^;&|]*[[:space:]](/([[:space:]]|$)|~|\$HOME|\*|/etc|/usr|/bin|/var|/boot|/home|\.\./)' \
    'Recursive/forced rm targeting the filesystem root, HOME, a glob or a system path.'
  agp__rule deny fs.rm_repo_core \
    'rm[[:space:]]+[^;&|]*-[[:alnum:]]*[rf][^;&|]*(\.git|\.env|\.claude|\.agents|\.husky|/?src|/?tests)([[:space:]/]|$)' \
    'Recursive/forced rm targeting source, tests, git metadata or agent guardrails.'
  agp__rule ask  fs.rm_recursive \
    'rm[[:space:]]+[^;&|]*-[[:alnum:]]*[rf]' \
    'Recursive/forced deletion. Confirm the target is a disposable build artifact.'
  agp__rule deny fs.disk_destroy \
    '(mkfs[.[:alnum:]]*[[:space:]]|shred[[:space:]]|wipefs|dd[[:space:]]+[^;&|]*of=/dev/|>[[:space:]]*/dev/(sd|nvme|disk))' \
    'Raw device / disk destruction command.'
  agp__rule deny fs.forkbomb \
    ':\(\)[[:space:]]*\{|\{[[:space:]]*:\|:' \
    'Fork bomb pattern.'
  agp__rule ask  fs.find_delete \
    'find[[:space:]]+[^;&|]*(-delete|-exec[[:space:]]+rm)' \
    'Bulk deletion via find.'

  # --- git history / remote integrity -----------------------------------
  agp__rule deny git.force_push \
    'git[[:space:]]+push[^;&|]*(--force([[:space:]]|$)|[[:space:]]-f([[:space:]]|$))' \
    'Force push rewrites published history. Use --force-with-lease and push from a human shell.'
  agp__rule deny git.delete_protected \
    'git[[:space:]]+(branch[^;&|]*(-D|--delete)|push[^;&|]*(--delete|[[:space:]]:))[^;&|]*(main|master|develop)' \
    'Deletion of a protected branch (main/master/develop).'
  agp__rule deny git.history_rewrite \
    'git[[:space:]]+(filter-branch|filter-repo)|git[[:space:]]+rebase[^;&|]*--root|git[[:space:]]+reflog[[:space:]]+expire|git[[:space:]]+update-ref[[:space:]]+-d' \
    'Irreversible git history rewrite.'
  agp__rule deny git.bypass_hooks \
    '(git[[:space:]]+(commit|push|merge)[^;&|]*--no-verify|HUSKY=0|git[[:space:]]+config[^;&|]*core\.hooksPath)' \
    'Bypassing commitlint/lint-staged/husky quality and secret gates is not allowed.'
  agp__rule deny git.add_secret \
    'git[[:space:]]+add[^;&|]*(\.env([^.a-z]|$)|\.env\.[a-z]*local|id_rsa|\.pem([[:space:]]|$)|\.p12|credentials)' \
    'Attempt to stage a secret-bearing file. Only .env.example belongs in Git.'
  agp__rule ask  git.hard_reset \
    'git[[:space:]]+reset[^;&|]*--hard|git[[:space:]]+checkout[[:space:]]+--[[:space:]]*\.' \
    'Discards uncommitted work irreversibly.'
  agp__rule ask  git.clean_force \
    'git[[:space:]]+clean[^;&|]*-[[:alnum:]]*[fx]' \
    'Deletes untracked files, including local .env files.'
  agp__rule ask  git.remote_change \
    'git[[:space:]]+remote[[:space:]]+(add|set-url)' \
    'Changing the git remote can redirect pushes to an attacker-controlled repo.'

  # --- remote code execution / supply chain ------------------------------
  agp__rule deny rce.pipe_to_shell \
    '(curl|wget|fetch)[^;&|]*\|[[:space:]]*(sudo[[:space:]]+)?(ba|z|k|da|c)?sh([[:space:]]|$)|(curl|wget)[^;&|]*\|[[:space:]]*(python3?|node|perl|ruby)([[:space:]]|$)' \
    'Piping a remote payload straight into an interpreter (curl|bash) is remote code execution.'
  agp__rule deny supply.registry \
    '(npm|pnpm|yarn|bun)[[:space:]]+config[[:space:]]+set[[:space:]]+registry|NPM_CONFIG_REGISTRY=' \
    'Repointing the package registry is a supply-chain compromise vector.'
  agp__rule deny supply.publish \
    '(npm|pnpm|yarn|bun)[[:space:]]+publish' \
    'This is a private API; publishing it to a package registry is never intended.'
  agp__rule ask  supply.remote_pkg \
    '(npm|pnpm|yarn|bun)[[:space:]]+(add|install|i)[[:space:]][^;&|]*(https?://|git\+|github:|file:)' \
    'Installing a dependency from a URL bypasses the lockfile and registry review.'
  agp__rule ask  supply.global_install \
    '(npm|pnpm|yarn|bun)[[:space:]]+(add|install|i)[[:space:]][^;&|]*(-g([[:space:]]|$)|--global)' \
    'Global package install mutates the machine outside the project.'

  # --- credential access --------------------------------------------------
  agp__rule deny cred.read_keys \
    '(cat|less|more|head|tail|bat|xxd|od|base64|cp|scp|mv|tar|zip)[^;&|]*(\.ssh/id_|\.ssh/[[:alnum:]_-]*\.pem|\.aws/credentials|\.gnupg|/etc/shadow|\.docker/config\.json|\.config/gh/hosts|\.netrc|\.npmrc)' \
    'Reading or copying credential material outside the project.'
  agp__rule deny cred.token_print \
    '(gh[[:space:]]+auth[[:space:]]+token|aws[[:space:]]+configure[[:space:]]+get[[:space:]]+aws_secret|gcloud[[:space:]]+auth[[:space:]]+print-(access|identity)-token|security[[:space:]]+find-generic-password|op[[:space:]]+read[[:space:]])' \
    'Printing a live credential into the transcript leaks it into model context and logs.'
  agp__rule ask  cred.env_dump \
    '(^|[;&|][[:space:]]*)(env|printenv|set)[[:space:]]*($|\|)' \
    'Dumping the whole environment exposes every secret to the model context.'

  # --- privilege escalation / host mutation -------------------------------
  agp__rule deny priv.escalate \
    '(^|[;&|][[:space:]]*)(sudo|doas|su)[[:space:]]' \
    'Privilege escalation is out of scope for an agent session.'
  agp__rule deny priv.chmod_world \
    'chmod[^;&|]*(777|a\+rwx|o\+w)' \
    'World-writable permissions.'
  agp__rule deny priv.system_mod \
    '(systemctl[[:space:]]|service[[:space:]]+[[:alnum:]_-]+[[:space:]]+(start|stop|restart)|iptables|nft[[:space:]]+|ufw[[:space:]]|usermod|useradd|visudo|/etc/sudoers|/etc/passwd)' \
    'Mutating host services, firewall or accounts.'
  agp__rule deny persist.autostart \
    '(>>?[[:space:]]*[^;&|]*(\.bashrc|\.zshrc|\.profile|\.bash_profile|\.zshenv)|crontab[[:space:]]+-|/etc/cron|launchctl[[:space:]]+load|systemd[^;&|]*enable)' \
    'Writing shell startup files or scheduled jobs is a persistence mechanism.'
  agp__rule deny mass.kill \
    'kill[[:space:]]+-9[[:space:]]+-1|pkill[[:space:]]+-9[[:space:]]+-u|killall5' \
    'Mass process termination.'

  # --- reverse shells / covert channels -----------------------------------
  agp__rule deny net.reverse_shell \
    '((^|[;&|[:space:]])(nc|ncat|netcat)[^;&|]*[[:space:]]-[[:alnum:]]*e[[:space:]]|/dev/tcp/|socat[^;&|]*exec:|(ba|z)?sh[[:space:]]+-i[[:space:]]*>&|telnet[^;&|]*\|[[:space:]]*(ba|z)?sh)' \
    'Reverse shell / covert command channel.'
  agp__rule deny net.exfil_sink \
    '(webhook\.site|requestbin|pipedream\.net|ngrok(-free)?\.(io|app|dev)|burpcollaborator|oastify|interact\.sh|transfer\.sh|0x0\.st|termbin\.com|pastebin\.com|paste\.ee|file\.io|bashupload|dpaste)' \
    'Known data-exfiltration / out-of-band sink.'
  agp__rule deny net.metadata \
    '169\.254\.169\.254|metadata\.google\.internal|metadata\.azure\.com|100\.100\.100\.200' \
    'Cloud instance metadata endpoint (SSRF credential theft target).'

  # --- guardrail tampering -------------------------------------------------
  agp__rule deny guard.tamper \
    '(rm|mv|truncate|shred|tee|sed[[:space:]]+-i|>[[:space:]]*)[^;&|]*(\.claude/(settings|hooks)|\.agents/hooks|scripts/agent-security|\.husky/|commitlint\.config|\.lintstagedrc)' \
    'Destroying or overwriting the security guardrails from a shell command.'
  agp__rule deny guard.disable \
    '(disableAllHooks|--dangerously-skip-permissions|--dangerously-bypass|CLAUDE_CODE_DISABLE|--no-sandbox)' \
    'Disabling the agent safety layer.'

  # --- database ------------------------------------------------------------
  agp__rule deny db.destructive_sql \
    '(drop[[:space:]]+(database|schema|table)|truncate[[:space:]]+table|delete[[:space:]]+from[[:space:]]+[[:alnum:]_.]+[[:space:]]*(;|$))' \
    'Destructive SQL. Schema changes go through drizzle-kit generate + reviewed migrations.'
  agp__rule deny db.drizzle_drop \
    '(drizzle-kit[[:space:]]+drop|db:push[^;&|]*--force|drizzle-kit[[:space:]]+push[^;&|]*--force)' \
    'Forced schema push drops columns/tables without a reviewed migration.'

  # --- composite: secret source + network sink in one command --------------
  if agp__match '(\.env([^.a-z]|$)|\.env\.[a-z]*local|id_rsa|\.aws/credentials|\.netrc|\.npmrc|printenv|process\.env|DATABASE_URL|BETTER_AUTH_SECRET)' \
     && agp__match '(curl|wget|nc[[:space:]]|ncat|socat|scp[[:space:]]|rsync[[:space:]]|ssh[[:space:]]|https?://|mail[[:space:]]|sendmail)'; then
    agp__record deny exfil.secret_to_network \
      'Command reads secret material and contacts the network in the same breath (exfiltration shape).'
  fi

  # --- composite: psql/pg_dump against a non-local host --------------------
  if agp__match '(psql|pg_dump|pg_restore|pgcli)[[:space:]]' \
     && agp__match 'postgres(ql)?://[^[:space:]/]*@' \
     && ! agp__match 'postgres(ql)?://[^[:space:]/]*@(localhost|127\.0\.0\.1|0\.0\.0\.0|db|postgres)[:/ ]'; then
    agp__record ask db.remote_target \
      'Database client pointed at a non-local host - this may be a production database.'
  fi

  return 0
}

# ------------------------------- path guard --------------------------------

agp_guard_path() { # <read|write> <path>
  agp__reset
  local op="${1:-read}" path="${2:-}"
  [ -z "$path" ] && return 0
  AGP__HAYSTACK="$(agp__haystack "$path")"

  # Never readable, never writable.
  agp__rule deny path.private_key \
    '(\.ssh/id_[[:alnum:]_]*|\.ssh/[[:alnum:]_-]+\.pem|\.gnupg/|\.aws/credentials|\.netrc|/etc/shadow|\.docker/config\.json|\.config/gh/hosts|(^|/)\.npmrc$|\.p12$|\.pfx$|(^|/)id_rsa)' \
    'Credential material. Agents must never read or write private keys and cloud credentials.'
  agp__rule deny path.system \
    '^/(etc|usr|bin|sbin|boot|sys|proc)(/|$)' \
    'System path outside the workspace.'

  if [ "$op" = "write" ]; then
    agp__rule deny path.write_env \
      '(^|/)\.env$|(^|/)\.env\.[[:alnum:]-]*local$|(^|/)\.env\.(production|prod|staging)$' \
      'Real secret files are never written by an agent. Document new variables in .env.example instead.'
    agp__rule ask  path.write_guardrail \
      '(\.claude/(settings|hooks)|\.agents/hooks|scripts/agent-security|(^|/)\.husky/|commitlint\.config|(^|/)\.gitignore$|\.github/workflows/)' \
      'This file is a security or CI guardrail; a human should review the change.'
    agp__rule ask  path.write_outside \
      '^(/|~)' \
      'Absolute path - confirm it is inside the workspace or a scratch directory.'
    agp__rule ask  path.node_modules \
      '(^|/)node_modules/' \
      'Editing installed dependencies is not reproducible; patch via the source instead.'
  else
    agp__rule ask  path.read_env \
      '(^|/)\.env$|(^|/)\.env\.[[:alnum:]-]*local$' \
      'Reading real secret values into model context. Prefer .env.example or src/config/env.ts.'
  fi

  # Path traversal out of the workspace.
  agp__rule ask path.traversal \
    '\.\./\.\./\.\.' \
    'Deep parent traversal leaves the workspace.'

  return 0
}

# ------------------------------ content guard ------------------------------
# Secret detection on content the agent is about to write to disk.

agp_guard_content() { # <path> <content>
  agp__reset
  local path="${1:-}" content="${2:-}"
  [ -z "$content" ] && return 0
  AGP__HAYSTACK="$(agp__haystack "$content")"

  # Placeholders are fine - they are what .env.example is for.
  if agp__match '(changeme|change_me|example|placeholder|your[_-]|sua_|seu_|xxxx|<[[:alnum:]_ -]+>|\$\{[[:alnum:]_]+\}|dummy|fake|redacted)'; then
    AGP__PLACEHOLDER=1
  else
    AGP__PLACEHOLDER=0
  fi

  agp__rule deny secret.private_key \
    -----BEGIN'[[:space:]][[:upper:][:space:]]*'PRIVATE'[[:space:]]'KEY----- \
    'Private key block in file content.'
  agp__rule deny secret.aws \
    '(AKIA|ASIA)[0-9A-Z]{16}' \
    'AWS access key id.'
  agp__rule deny secret.github \
    '(gh[pousr]_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{20,})' \
    'GitHub token.'
  agp__rule deny secret.anthropic_openai \
    '(sk-ant-[A-Za-z0-9_-]{20,}|sk-[A-Za-z0-9]{32,}|sk-proj-[A-Za-z0-9_-]{20,})' \
    'LLM provider API key.'
  agp__rule deny secret.google \
    'AIza[0-9A-Za-z_-]{35}' \
    'Google API key.'
  agp__rule deny secret.slack \
    'xox[baprs]-[A-Za-z0-9-]{10,}' \
    'Slack token.'
  agp__rule deny secret.stripe \
    '(sk|rk)_live_[0-9A-Za-z]{20,}' \
    'Stripe live key.'
  agp__rule deny secret.jwt \
    'eyJ[A-Za-z0-9_-]{10,}\.eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}' \
    'Signed JWT.'
  # A connection string is only a secret when it points somewhere real:
  # postgres:postgres@localhost is the documented local docker-compose default.
  if agp__match '(postgres(ql)?|mysql|mongodb)(\+srv)?://[^:@/[:space:]"]+:[^@/[:space:]"]{6,}@' \
     && ! agp__match '://[^:@/[:space:]"]+:[^@/[:space:]"]+@(localhost|127\.0\.0\.1|0\.0\.0\.0|db|postgres|host\.docker\.internal)[:/]'; then
    agp__record deny secret.db_url \
      'Database connection string containing a password for a non-local host.'
  fi
  agp__rule ask  secret.generic \
    '(password|passwd|secret|token|api[_-]?key|client[_-]?secret)[[:space:]]*[:=][[:space:]]*["'"'"'][^"'"'"']{12,}["'"'"']' \
    'Hardcoded credential-looking literal.'

  # Downgrade in files that exist to hold fake values.
  if [ "$AGP_DECISION" = "deny" ]; then
    # .env.example / *.sample exist precisely to carry fake values.
    if printf '%s' "$path" | grep -Eiq '(\.example$|\.sample$|\.dist$)'; then
      AGP_DECISION="ask"
      AGP_REASON="$AGP_REASON; (downgraded: sample file - confirm the value is not a real credential)"
    elif [ "$AGP__PLACEHOLDER" = "1" ] \
         && printf '%s' "$path" | grep -Eiq '(\.md$|(^|/)tests?/|\.test\.|\.spec\.|/fixtures?/|/seed)'; then
      AGP_DECISION="ask"
      AGP_REASON="$AGP_REASON; (downgraded: placeholder-style value in a doc/test file - confirm it is not real)"
    fi
  fi

  return 0
}

# -------------------------------- url guard --------------------------------

agp_guard_url() { # <url>
  agp__reset
  local url="${1:-}"
  [ -z "$url" ] && return 0
  AGP__HAYSTACK="$(agp__haystack "$url")"

  agp__rule deny url.metadata \
    '169\.254\.169\.254|metadata\.google\.internal|metadata\.azure\.com|100\.100\.100\.200' \
    'Cloud instance metadata endpoint - classic SSRF credential theft target.'
  agp__rule deny url.local_file \
    '^(file|gopher|dict|ftp)://' \
    'Non-HTTP scheme.'
  agp__rule deny url.exfil_sink \
    '(webhook\.site|requestbin|pipedream\.net|ngrok(-free)?\.(io|app|dev)|burpcollaborator|oastify|interact\.sh|transfer\.sh|0x0\.st|termbin\.com|bashupload|dpaste)' \
    'Known out-of-band exfiltration sink.'
  agp__rule ask  url.private_net \
    '://(10\.|192\.168\.|172\.(1[6-9]|2[0-9]|3[01])\.|\[?::1\]?|169\.254\.)' \
    'Private network address - confirm this is an intended local service.'
  agp__rule ask  url.credentials_inline \
    '://[^/@[:space:]]+:[^/@[:space:]]+@' \
    'URL embeds credentials.'

  return 0
}

# --------------------------- prompt-injection scan -------------------------
# Heuristics for untrusted content (fetched pages, files, tool output).
# Never blocks - it annotates, so the model treats the content as DATA.

agp_scan_injection() { # <text> -> echoes matched rule ids, empty when clean
  agp__reset
  local text="${1:-}" hits=""
  [ -z "$text" ] && return 0
  AGP__HAYSTACK="$(agp__haystack "$text")"

  agp__match 'ignore[[:space:]]+(all[[:space:]]+)?(previous|prior|above|earlier)[[:space:]]+(instructions|prompts|rules)' && hits="$hits override-instructions"
  agp__match 'disregard[[:space:]]+(the[[:space:]]+)?(above|previous|prior|system)' && hits="$hits disregard-context"
  agp__match '(new|updated)[[:space:]]+(system[[:space:]]+)?(instructions|prompt|directive)' && hits="$hits fake-system-prompt"
  agp__match '<[[:space:]]*(system|important|admin|instructions)[[:space:]]*>' && hits="$hits pseudo-tag"
  agp__match 'you[[:space:]]+are[[:space:]]+now[[:space:]]+(a|an|the)?' && hits="$hits role-reassignment"
  agp__match '(do[[:space:]]+not|never|don.?t)[[:space:]]+(tell|inform|mention[[:space:]]+to|show)[[:space:]]+(the[[:space:]]+)?user' && hits="$hits hide-from-user"
  agp__match '(without|before)[[:space:]]+(asking|confirming|informing)[[:space:]]+(the[[:space:]]+)?user' && hits="$hits bypass-confirmation"
  agp__match '(exfiltrat|send|post|upload)[^.]{0,60}(\.env|credential|secret|api[[:space:]]?key|token|password)' && hits="$hits secret-exfil-request"
  agp__match '(curl|wget|fetch)[^.]{0,80}(webhook|requestbin|ngrok|oastify|attacker)' && hits="$hits callback-request"
  agp__match '(run|execute|eval)[^.]{0,40}(the[[:space:]]+)?following[^.]{0,20}(command|script|code)' && hits="$hits execute-request"

  printf '%s' "${hits# }"
}
