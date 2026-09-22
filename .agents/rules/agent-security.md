# Agent security boundaries

Two boundaries bind every agent working in this repository: **the project directory** and
**the real `.env`**. They are recorded as `D-74` in `.agents/memory/DECISIONS.md`, extended by
`D-75` to the `@` reference the owner types.

> **Enforcement is asymmetric, and that matters.** For Claude Code they are hooks
> (`.claude/hooks/guard-project-scope.sh`, `.claude/hooks/guard-prompt-scope.sh`,
> `.claude/hooks/guard-env-file.sh`) — a violation is refused before the tool runs. For the Antigravity agents nothing intercepts the call, so here
> the same boundaries are a **convention you are responsible for keeping**. An agent that steps
> outside has not found a loophole; it has produced a defect.

## 1. Stay inside the project

Everything you read, write, list or execute resolves under the repository root.

Forbidden, whatever the tool:

- a relative path that climbs out — `../../other-project/src/x.ts`;
- a home-relative path — `~/notes.md`, `~/.ssh/`, `~/.aws/`;
- an absolute path elsewhere on the machine — `/etc/passwd`, `/srv/repo`;
- `cd ..`, `cd ~`, `git -C <path outside>`, `--outDir=../../x`;
- a symlink inside the repo whose target resolves outside it.

Allowed anyway, because the toolchain needs them: read-only system paths (`/usr`, `/bin`, `/sbin`,
`/lib`, `/lib64`, `/opt`, `/proc`, `/etc/ssl`, the standard `/dev/*`), `$TMPDIR`, the agent
scratchpad, and **this** project's own state directory. Another project's state is not.

Git refs that merely look like paths are fine — `git diff HEAD~1..HEAD`, `git log main..develop`.

**Need something outside?** Say what you need and why, and let the owner fetch it or widen
`HK_SCOPE_EXTRA_ALLOW`. Comparing this repository against a sibling project, for instance, is a
legitimate task that this boundary blocks by design: ask, do not reach.

## 2. The real `.env` is off limits

Never read, write, edit, copy, move, `source`, list or delete `.env`, `.env.local`,
`.env.production` or any other real dotenv file — not through a file tool, not through a shell
command, not through an MCP server, not as a `Glob` pattern or a `Grep` search root.

Open as usual: `.env.example`, `.env.sample`, `.env.template`, `.env.dist`, `.env.defaults`, and
`src/config/env.ts`. A document that _mentions_ `.env` in its body is ordinary work.

**A new configuration variable is always three edits**, never a peek at the live file:

1. declare it in `src/config/env.ts` (the Zod schema — fail-fast at boot);
2. add it to `.env.example` with a placeholder, never a real value;
3. add a placeholder to the CI jobs that load `env.ts` (see `.github/README.md`).

`src/config/env.ts` is the only file in `src/**` allowed to touch `process.env`; everywhere else it
is a hard ESLint error. If you need the _live_ value of a secret, you do not — ask the owner to run
the command in their own shell.

## 3. The broad policy still applies

`scripts/agent-security/policy.sh` runs alongside these two boundaries and covers what they do not:
destructive commands, force pushes, history rewrites, `--no-verify`, `curl | bash`, cloud metadata
endpoints, known exfiltration sinks, and secret-shaped literals reaching a file. One denial from
any of them stops the call.

That policy is what catches an **indirect** leak the dotenv guard cannot see: `grep -r DATABASE_URL .`
never names `.env`, but it can still pull the value into context. Do not try it.

## 4. Never route around a denial

If a guard or the policy refuses something you believe is legitimate:

1. state plainly what you needed and why;
2. let the owner run it, or amend the policy;
3. carry on with the rest of the task.

Do not disable a hook, do not edit `policy.sh` to make your call pass, do not rephrase a command to
slip past a pattern, and do not move a file out of the way. Working around a guardrail is a worse
outcome than the blocked task, every time.

Tests: `bash scripts/agent-security/test-guards.sh` (these two boundaries),
`test-hooks.sh` and `test-policy.sh` (the broad policy).
