---
paths:
  - '.husky/**'
  - 'commitlint.config.*'
---

# Git Flow and Conventional Commits

> `docs/specs/06-git-ci-cd.md` is row 2 of the chain and outranks this file. `CLAUDE.md § Git`
> summarizes the same rules. This file is the operational detail.

## Branches

| Branch           | From      | Into                     | Purpose                                                        |
| ---------------- | --------- | ------------------------ | -------------------------------------------------------------- |
| `main`           | —         | —                        | Production. Always deployable. Never receives a direct commit. |
| `develop`        | `main`    | —                        | Integration. Base of every `feature/*`. **Default PR target.** |
| `feature/<slug>` | `develop` | `develop`                | One unit of work. `<slug>` in descriptive kebab-case.          |
| `release/vX.Y.Z` | `develop` | `main` **and** `develop` | Pre-production stabilization (fixes only, no new features).    |
| `hotfix/<slug>`  | `main`    | `main` **and** `develop` | Urgent production fix outside the normal cycle.                |

Never commit directly to `main` or `develop` — always through a PR, even working alone. The history
and the green CI check on the PR are what guarantee `main` stays deployable.

Remote is `Cardosofiles/cardoso-sound-api` over SSH (D-33).

## Conventional Commits

```
<type>(<optional scope>): <imperative description, no trailing period>

[optional body]

[optional footer]
```

Types: `feat` `fix` `refactor` `chore` `docs` `test` `perf` `build` `ci`.

Breaking change: `!` after the type/scope (`feat(auth)!: ...`) **or** a `BREAKING CHANGE:` footer.
Both are valid — pick one and be consistent across the repository.

The scope names the affected module or area, not the ticket (`feat(playlists): ...`, not
`feat(F5-S10): ...`). The sprint reference belongs in the footer, e.g. `Refs: F5-S10`.

## Husky

Installed via the `prepare` script (`husky || true`).

- `.husky/commit-msg` → `pnpm commitlint --edit "$1"`. A message that does not match the convention
  is rejected before it exists in history.
- `.husky/pre-commit` → `pnpm lint-staged`. Lint and format on staged files only.

**`--no-verify` is blocked** by `scripts/agent-security/policy.sh` via `.claude/hooks/*`, and that
is deliberate. A rejected commit is fixed by editing and re-staging. If a hook blocks something
legitimate, say what you needed and let the owner run or amend it — never disable the hook.

Secret scanning is not in `pre-commit`. It is enforced at the agent layer: the security policy
blocks writing a secret-looking literal into a file. Declare the variable in `.env.example` and read
it through `src/config/env.ts`.

## Pull requests

- Target: `develop` for `feature/*`; `main` (then merged back into `develop`) for `release/*` and
  `hotfix/*`.
- **One sprint = one PR = one complete module or layer (D-23).** Not one PR per file, not one PR
  spanning three sprints.
- If the repository policy is squash-merge, the PR title becomes the final commit — apply
  Conventional Commits to the title too.
- CI (`ci-deploy.md`) must be green before merge. Never force a merge past a failing check.
- **D-06: the agent pushes, opens the PR, waits for green CI, and stops. The merge is the owner's.**
  An agent that merges its own PR has violated the protocol regardless of the result.
- **D-08: a tag and a GitHub Release close each phase** (`v0.5.0` closed F5; `v1.0.0` closes F7).

Before opening the PR, run the review subagents on the diff: `architecture-review`, `code-review`,
`security-review` (`.claude/agents/`). They are read-only gates, not suggestions.

## Definition of Done before pushing

`pnpm typecheck` → `pnpm lint` → `pnpm format` → `pnpm test` → `pnpm build` → `pnpm openapi:check`.

CI enforces all six, in that order, plus two artifact gates (`git diff --exit-code drizzle/` after
`db:generate`, and `openapi:check`). The CI formatting gate is `pnpm format:check`, which verifies;
`pnpm format` is the local fix that writes. See `ci-deploy.md` §2.

**If you have not run the gates, say so.** Never declare a sprint done on the assumption that they
would pass.

## GitHub tooling

There is **no `.mcp.json` in this repository** — no GitHub MCP server is configured. Use the `gh`
CLI for PRs, issues and API queries. Mutating operations (opening a PR, pushing a branch) follow the
agent security policy: force pushes and history rewrites are blocked outright, and the merge is the
owner's (D-06).
