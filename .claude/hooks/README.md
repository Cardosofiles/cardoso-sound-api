# Claude Code security hooks

Two families, both registered in `.claude/settings.json` (project scope, versioned):

1. **Policy adapters** — thin bridges between the
   [Claude Code hook protocol](https://code.claude.com/docs/en/hooks) and the shared
   policy in `scripts/agent-security/policy.sh`. Broad coverage: destructive
   commands, exfiltration, secrets in content.
2. **Self-contained guards** (`guard-env-file.sh`, `guard-project-scope.sh`) —
   narrower and stricter, backed by `lib/hook-io.sh` and depending on nothing
   but `bash` plus `jq` **or** `python3`.

They run together on the same call; one denial is enough to stop it.

| Hook                          | Event              | Matcher                                    | What it does                                                                                                            |
| ----------------------------- | ------------------ | ------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------- |
| `session-security-context.sh` | `SessionStart`     | –                                          | States the active policy once, so a denial is understood instead of worked around                                       |
| `guard-user-prompt.sh`        | `UserPromptSubmit` | –                                          | Warns when a live credential was pasted into the prompt. **Never blocks the user**                                      |
| `guard-bash.sh`               | `PreToolUse`       | `Bash`                                     | Destructive commands, force pushes, `--no-verify`, `curl \| bash`, credential reads, exfiltration, privilege escalation |
| `guard-file-write.sh`         | `PreToolUse`       | `Write\|Edit\|NotebookEdit`                | Protects `.env` and guardrail files; blocks secret literals before they reach disk                                      |
| `guard-file-read.sh`          | `PreToolUse`       | `Read\|Glob\|Grep`                         | Keeps `~/.ssh`, `~/.aws`, `/etc/shadow` and friends out of the model context                                            |
| `guard-web-access.sh`         | `PreToolUse`       | `WebFetch\|WebSearch`                      | Cloud metadata endpoints, exfiltration sinks, credentials inside a query                                                |
| `guard-mcp.sh`                | `PreToolUse`       | `mcp__.*`                                  | Runs every string argument through the command and URL policy                                                           |
| `inspect-untrusted-output.sh` | `PostToolUse`      | `WebFetch\|WebSearch\|Read\|Bash\|mcp__.*` | Flags prompt-injection shaped content so it is treated as data                                                          |
| `guard-env-file.sh`           | `PreToolUse`       | file tools, `Bash`, `mcp__.*`              | **Denies** every read, write, copy, move, `source` or delete of a real dotenv file                                      |
| `guard-project-scope.sh`      | `PreToolUse`       | file tools, `Bash`, `mcp__.*`              | **Denies** any path resolving outside `CLAUDE_PROJECT_DIR`, symlinks included                                           |

## The two self-contained guards

`guard-env-file.sh` denies **any** operation whose target is a real dotenv file —
`Read`/`Write`/`Edit`, `cat`/`rm`/`cp`/`mv`/`sed -i`/`source`/`--env-file`, a `Glob`
pattern, a `Grep` search root, or an MCP argument. `.env.example`, `.env.sample`,
`.env.template`, `.env.dist`, `.env.defaults` and `src/config/env.ts` stay open, and
only the **target** is inspected — a document that merely mentions `.env` in its body
is fine. Widen with `HK_ENV_ALLOWED_EXTRA=".env.ci .env.test"`.

This is deliberately stricter than the policy, which treats a dotenv read as `ask`.

`guard-project-scope.sh` denies any path resolving outside the project root: `../../`,
`~/`, an absolute path elsewhere, a `cd` out of the tree, a glob that climbs out, or a
symlink inside the repo pointing out. The policy has no directory boundary of its own;
this is the only thing that enforces one. Allowed anyway: read-only system paths
(`/usr`, `/bin`, `/lib`, `/opt`, `/proc`, `/etc/ssl`, the standard `/dev/*`), `$TMPDIR`,
the agent scratchpad (`/tmp/claude-*`), and **this** project's own state under
`~/.claude/projects/<root-with-dashes>` — sibling projects' state is not. Widen with
`HK_SCOPE_EXTRA_ALLOW="/opt/homebrew /srv/cache"`.

Git refs that only look like paths (`git diff HEAD~1..HEAD`, `main..develop`), a `Grep`
regex containing `\.\./`, and redirections like `2>/dev/null` do not trip it.

**Known limits.** Indirect reads are not caught: `grep -r DATABASE_URL .` can surface a
value without naming `.env` — blocking the leak of the _content_ is the policy's job
(`cred.*`). A flag glued to a path (`-I../include`) is treated as a flag. `bash
script.sh` is judged by the invocation, not by what the script contains.

**Open false positive.** `guard-project-scope.sh` tokenises a shell command by stripping
quotes first, so a `sed`/`awk` address that starts with `/` is indistinguishable from an
absolute path and gets denied:

```bash
sed -n '/^### D-70/,/^### D-73/p' file.md   # denied: "/^###" reads as an absolute path
```

Workarounds that do **not** weaken the guard: use the `Read` tool, or an address that does
not start with `/` (`awk 'NR>10'`, `grep -n '^### D-'`). A narrowing fix — skipping tokens
that carry regex metacharacters (`^`, `$`, `[`, `(`) — would loosen the matcher, so it has
not been applied without the owner's decision. Recorded in `D-74`.

## Protocol notes

- **Deny/ask** is emitted as
  `{"hookSpecificOutput":{"hookEventName":"PreToolUse","permissionDecision":"deny","permissionDecisionReason":"..."}}`.
- **Allow is silence.** The hooks exit 0 with no output when the policy is
  quiet. Emitting `"permissionDecision":"allow"` would auto-approve the call and
  bypass the permission settings the user configured — a guard may only
  tighten, never loosen.
- `PostToolUse` cannot block (the tool already ran), so it returns
  `additionalContext` plus a `systemMessage`.
- Every hook resolves the project root from `$CLAUDE_PROJECT_DIR`.

## Conventions

- `lib/adapter.sh` owns payload parsing (jq, falling back to python3) and JSON
  emission for the policy adapters. `lib/hook-io.sh` does the same for the two
  self-contained guards, plus lexical path resolution. Hook scripts stay short
  enough to audit at a glance.
- JSON output escaping is pure bash, so a denial can still be reported on a
  host without `jq`.
- **Fail closed.** If `scripts/agent-security/policy.sh` is missing, the adapter
  denies rather than failing open. If neither `jq` nor `python3` is on `PATH`, or
  the payload will not parse, the guards deny too — a guard that cannot validate
  does not wave the call through.

## Tests

```bash
bash scripts/agent-security/test-policy.sh   # the policy rules
bash scripts/agent-security/test-hooks.sh    # the policy adapters
bash scripts/agent-security/test-guards.sh   # the two self-contained guards
```

A single case by hand:

```bash
printf '{"tool_name":"Read","tool_input":{"file_path":".env"}}' \
  | .claude/hooks/guard-env-file.sh
```

Empty output with exit 0 means "no objection". To watch decisions during a
session: `claude --debug`. Hooks are read at session start, so a change to
`.claude/settings.json` needs a restart, and `/hooks` shows what is registered.

If a legitimate task is blocked, say what you needed and let the owner run it or
widen the variables above. Never work around a guard and never disable one.
