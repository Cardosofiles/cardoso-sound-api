---
paths:
  - '.github/workflows/**'
  - 'Dockerfile'
  - '.dockerignore'
  - 'railway.json'
  - 'docker-compose.yml'
---

# CI (GitHub Actions), Docker and deploy

**Authority.** This rule sits at row 3 of the chain in `CLAUDE.md`. It is subordinate to
`.agents/memory/DECISIONS.md` (D-61, D-62, D-01, D-35, D-36) and to `docs/specs/06-git-ci-cd.md`.
Where this rule and an ADR disagree, the ADR wins and this file is the bug.

This rule **describes the pipeline that is enforced today**, plus the invariants the not-yet-written
deploy files must satisfy. Rule and workflow must never drift: a PR that changes
`.github/workflows/ci.yml` updates this file in the same PR, and vice-versa.

---

## 1. State of the pipeline

| File                           | State                       | Owner                                    |
| ------------------------------ | --------------------------- | ---------------------------------------- |
| `.github/workflows/ci.yml`     | **live**, 6 jobs + gate     | this rule                                |
| `.github/workflows/codeql.yml` | **live**, SAST + weekly     | this rule                                |
| `.github/dependabot.yml`       | live (npm, actions, docker) | this rule                                |
| `.gitleaks.toml`               | live                        | this rule                                |
| `.github/workflows/deploy.yml` | **0 bytes**, pending        | `docs/sprints/fase-7-deploy/F7-S01-*.md` |
| `Dockerfile`                   | **0 bytes**, pending        | F7-S01 §6.1                              |
| `railway.json`                 | **0 bytes**, pending        | F7-S01 §6.2                              |
| `.dockerignore`                | live                        | this rule                                |
| `docker-compose.yml`           | live (local Postgres)       | this rule                                |

Check that a file has content before assuming it does. The four pending files are authored by the
F7-S01 brief, not by this rule — this rule states the invariants that brief must satisfy.

## 2. The workflow as it stands

Six parallel jobs plus an aggregator, on `pull_request`, `push` (`develop`, `main`) and
`workflow_dispatch`:

| Job           | Gate                                                                  | Blocking |
| ------------- | --------------------------------------------------------------------- | -------- |
| `quality`     | matrix: `typecheck`, `lint`, `format:check`                           | yes      |
| `test`        | `pnpm test` (Testcontainers, no service container)                    | yes      |
| `build`       | `pnpm build` + the three entry points exist in `dist/`                | yes      |
| `contracts`   | `openapi:check`, then `db:generate` + `git diff --exit-code drizzle/` | yes      |
| `audit`       | `pnpm audit --prod --audit-level=high`                                | yes      |
| `secret-scan` | gitleaks over full history, checksum-verified binary                  | yes      |
| `ci`          | aggregator — the required status check                                | —        |

`quality` + `contracts` together are the six Definition-of-Done gates from `CLAUDE.md`.
Runner `ubuntu-latest` everywhere, Node 24, pnpm from `packageManager`, explicit `timeout-minutes`,
`concurrency` cancelling the previous run on the same ref, `permissions: contents: read`, actions
pinned by commit SHA, `persist-credentials: false` on every checkout.

**`ci` is the required status check.** Keep that job id and `name: ci` — branch protection is
configured against that exact name, and renaming it silently disables the gate. It fails when any
dependency reports `failure`, `cancelled` **or `skipped`**: a required gate that did not run has not
passed. All six jobs are in its `needs`.

CodeQL is a separate workflow (`codeql.yml`) rather than a job here: it carries its own weekly
`schedule`, so newly published queries reach existing code without waiting for a push. It runs
`security-extended` — this API carries sessions, passkeys and 2FA. `init` and `analyze` must stay on
the same version; Dependabot groups them for that reason.

### What is already right — do not "fix" these

- **Node 24** (D-01). Any suggestion to drop to 22 is wrong.
- **`ubuntu-latest` is load-bearing**, not a default. `tests/integration/**` and `tests/e2e/**`
  boot `postgres:17-alpine` through Testcontainers (`tests/setup/testcontainers.ts`) and need a
  Docker daemon on the runner. A container-based job or a self-hosted runner without Docker kills
  those two projects silently — they fail at the harness, not at an assertion.
- **`pnpm/action-setup` with no `version:`.** The action reads `packageManager` from
  `package.json` (`pnpm@11.25.0`), which is the single source of truth. Pinning a version in the
  workflow creates a second one.
- **`BETTER_AUTH_SECRET` minted per run** with `openssl rand -base64 32` into `$GITHUB_ENV`.
  `env.ts` demands `min(32)`; a generated value satisfies it without a credential literal living in
  a tracked file (which `scripts/agent-security/policy.sh` blocks anyway). Keep this over a
  hardcoded placeholder.
- **`permissions: contents: read`** declared explicitly at workflow level.
- **`concurrency` + `cancel-in-progress`** — saves runner minutes on successive pushes to a PR.
- **`pull_request`, never `pull_request_target`.** A fork PR runs sandboxed with no repository
  secrets. This is the correct trigger for a verification gate.
- **No `${{ }}` interpolation of untrusted data inside `run:`.** PR and issue titles are
  attacker-controlled free text; reaching them through a `run:` shell is script injection.
- **No secret is required for the job to pass.** Nothing in `ci` opens a network connection to a
  real database or signs anything.
- **Actions pinned to a full commit SHA** with the tag as a trailing comment. Verify a new pin
  against the API before committing it — `gh api repos/<owner>/<repo>/git/ref/tags/<tag>`, and if
  `.object.type` is `tag` (an annotated tag, as `pnpm/action-setup` uses), dereference it with
  `gh api repos/<owner>/<repo>/git/tags/<sha>` to get the commit. Pinning the tag object instead of
  the commit fails at runtime.
- **`persist-credentials: false` on checkout.** No step here pushes.
- **The secret-generation step runs before `db:generate` and `openapi:check`.** Both load
  `src/config/env.ts`, which requires `BETTER_AUTH_SECRET` at `min(32)`. Reordering it below them
  breaks CI with `Environment validation failed`.

### Why `DATABASE_URL` is set even though CI has no database

`openapi:check` loads `src/app.ts`, which imports `src/db/client.ts` and constructs a `pg.Pool`;
`drizzle.config.ts` imports `src/config/env.ts` directly. Both go through the fail-fast Zod schema,
where `DATABASE_URL` is `z.url()`. The variable must therefore be a **syntactically valid URL** —
it never has to be reachable. The pool is created lazily and no query is issued.

The consequence is a standing obligation: **any variable that becomes required at boot gets a
placeholder in this workflow in the same PR.** The symptom of forgetting is CI failing with
`Environment validation failed` in a step that touches neither the database nor the provider.

## 3. Gaps — closed and remaining

Closed on 2026-09-20, in the same change that added `"format:check": "prettier . --check"` to
`package.json`. Kept here so nobody reintroduces one as a "simplification".

| #   | Was                                                        | Now                                                      |
| --- | ---------------------------------------------------------- | -------------------------------------------------------- |
| G1  | No migration-drift gate                                    | `pnpm db:generate` + `git diff --exit-code drizzle/`     |
| G2  | No Prettier gate; `pnpm format` writes instead of checking | `pnpm format:check`, the sixth DoD gate                  |
| G4  | Actions on a mutable `@v4` tag                             | pinned by commit SHA, tag in a comment                   |
| G5  | Checkout leaked a write token to every later step          | `persist-credentials: false`                             |
| G6  | Gate order diverged from the DoD                           | typecheck → lint → format → test → build → openapi:check |
| G7  | Dev credential literal (`cardoso:cardoso_dev`) in `env:`   | obviously-inert `postgresql://ci:ci@localhost:5432/ci`   |
| G8  | `pnpm openapi:export -- --check`                           | `pnpm openapi:check`, the named script                   |

| G9 | Action pins three majors stale, with nothing to bump them | Dependabot (`npm`, `github-actions`, `docker`), pins refreshed |

**Still open — G3: `deploy.yml` is not gated on `ci.yml`.** Both would fire in parallel on a push to
`main`, so a red build could deploy. It is latent only because `deploy.yml` is 0 bytes. F7-S01 owns
the fix; the requirement is stated in §8.

Every gate was verified against the tree before being made blocking: `format:check` passes
repository-wide, `db:generate` reports "No schema changes, nothing to migrate" with a clean
`drizzle/`, and gitleaks reports no leaks across all 88 commits with `.gitleaks.toml` applied.

### The dependency tree, cleaned up on 2026-09-20

`audit` started advisory because the production tree reported 9 advisories — 1 critical, 2 high,
6 moderate. Two upgrades cleared everything above the threshold, and the job is now blocking:

- **`@fastify/swagger-ui` `^5.2.0` → `^6.1.1`.** The real one, and the only advisory in the API's
  own request path: `@fastify/swagger-ui@5` pins `@fastify/static@^9`, and the route-guard-bypass
  fix exists only in major 10, so an override could not reach it. Resolves `@fastify/static@10.1.4`.
- **`vitest` `^2.1.8` → `^4.1.11`.** `better-auth` lists `vitest` and `drizzle-kit` among its
  runtime dependencies, which is why `--prod` reaches them — but pnpm deduplicates to **our** copy,
  so the critical `vitest` advisory and the `vite` / `@vitest/mocker` chain under it were ours to
  fix, not better-auth's. One devDependency bump closed six findings. It also forced the Vitest 4
  config migration: `defineWorkspace` and `vitest.workspace.ts` are gone, and the three projects now
  live in `vitest.config.ts` under `test.projects`, each repeating `pool: 'forks'` +
  `singleFork: true` (D-36) because project options no longer inherit from the root `test` block.

**What remains, deliberately**: two `esbuild` advisories, one moderate and one low, both below the
`high` gate. One arrives through `drizzle-kit → @esbuild-kit/esm-loader → @esbuild-kit/core-utils`,
packages deprecated upstream and not bumpable without an override that risks drizzle-kit itself; the
other through `vite`. Both are dev-server issues that no production path reaches.

**Never raise `--audit-level` to silence a finding.** Patch the dependency, or record here why it is
accepted.

## 4. The two artifact gates

`.github/workflows/ci.yml` is the file. Do not paste a copy of it into this rule — a second copy is
drift waiting to happen. What follows is the reasoning the YAML cannot carry.

The pair at the end of the job is the **generate-and-check** pattern: regenerate the versioned
artifact, then let `git diff --exit-code` fail if the commit did not carry it. `openapi:check`
implements the same idea internally (`--check` compares and exits 1).

**`db:generate` does not connect to a database.** `drizzle-kit generate` diffs
`src/db/schema/*.schema.ts` against the snapshots in `drizzle/meta/`; it only needs `DATABASE_URL`
to parse because `drizzle.config.ts` imports `env.ts`.

**D-39 trap.** The `pg_trgm` extension and the GIN indexes are hand-written into
`drizzle/0000_overconfident_overlord.sql`. They are absent from the snapshots, so a regenerate never
reproduces them and never reports them as drift — the gate is safe. What is **not** safe is
"fixing" a red drift gate by deleting `drizzle/` and regenerating from scratch: that destroys the
hand-maintained DDL. The correct fix is always to run `pnpm db:generate` locally, review the emitted
SQL, and commit it.

**Rename prompts.** `drizzle-kit generate` asks interactively when it cannot tell a rename from a
drop+add. In a correct PR the generate is a no-op and never prompts; if it hangs, the commit is
missing its migration — `timeout-minutes` catches it, and the answer is to author the migration
locally, not to add a `--yes` flag.

## 5. Workflow security practices — apply to every new job

- **Minimum `permissions`, always explicit.** `contents: read` at workflow level; a job that needs
  more (comment on a PR, publish a package) declares it **in that job only**. Never inherit the
  repository default silently.
- **Third-party actions pinned to a full commit SHA**, tag in a trailing comment. Tags and branches
  are mutable. This applies to `actions/*` and `pnpm/action-setup` too. Dependabot
  (`.github/dependabot.yml`) is what keeps the pins current — without it they rot silently, which is
  exactly how they ended up three majors behind. Never hand-copy a SHA from another repository or a
  chat message; resolve it from the API, as §2 describes.
- **Secret scanning runs in CI, not only in `pre-commit`.** `.husky/pre-commit` is lint-staged only,
  and the agent-security hooks cover a Claude Code session, not a human's commit or a fork's PR. The
  `secret-scan` job closes that hole. Its allowlist lives in `.gitleaks.toml` and is scoped with
  `targetRules` so relaxing the heuristic `generic-api-key` rule on test fixtures does not also
  disable the provider-specific rules on those paths.
- **`persist-credentials: false` on checkout**, unless a later step genuinely pushes with the
  workflow token.
- **Never `pull_request_target` to run PR code.** It executes with the base repo's `GITHUB_TOKEN`
  and secrets even for fork PRs; checking out the PR head in that context is the classic secret-leak
  path. Only consider it for a job that comments on the PR and does **not** execute fork code — and
  even then without checking out the head.
- **No direct interpolation of untrusted data in `run:`.** Pass the value through `env:` and read
  the environment variable inside the shell.
- **Explicit `timeout-minutes` on every job.** Without it a hung Testcontainers pull burns the
  6-hour runner default before failing.
- **The CI command is the `package.json` script**, never an inline reimplementation with different
  flags. If a tool has no script, add the script in the same PR.
- **`pnpm install --frozen-lockfile`**, never a floating install.

## 6. Scripts that exist

```
dev  build  start  jobs  jobs:dev  typecheck  lint  format  format:check  test  test:watch
db:generate  db:migrate  db:migrate:deploy  db:push  db:studio
openapi:export  openapi:check  prepare
```

`format` writes (`prettier . --write`) and `format:check` verifies (`prettier . --check`). CI runs
the second; the first is the local fix.

Not in `package.json`, therefore not callable: `db:seed`, `test:cov`, and any `audit:*`. Seeding is
`tsx src/db/seed/seed.ts` — there is no npm script (D-28). Need a tool without a script? Use
`pnpm exec` rather than inventing a divergent name.

`build` is **tsup** with `bundle: false` (D-35), emitting one `dist/**` file per `src/**` file — it
does **not** type-check. The type gate is `pnpm typecheck`, which runs separately. Because
`entry: ['src/**/*.ts']`, `dist/db/migrate.js`, `dist/jobs/runner.js` and `dist/server.js` all exist
after a build without any extra entry configuration.

`test` is `vitest run` across the three projects in `vitest.config.ts` (`unit`, `integration`,
`e2e`), single-fork (D-36).

## 7. Docker — specification for F7-S01

The `Dockerfile` is 0 bytes. F7-S01 §6.1 is the authority; these are the invariants it must hold.

- **`node:24-alpine`** (D-01), multi-stage (`deps → build → runner`). Pin the base image; prefer a
  digest (`node:24-alpine@sha256:…`) for the same reason actions are pinned.
- **`pnpm-workspace.yaml` must be copied** into the build stage — omitting it was a recorded F7-S01
  failure.
- **`drizzle/` must be present in the runtime image.** The Railway `preDeployCommand` runs
  `node dist/db/migrate.js`, which fails with "no migrations folder" without it. Recorded as
  F7-S01 trap #2.
- **`HEALTHCHECK` and the Railway healthcheck target `/health/ready`, not `/ready` and not
  `/health`.** `src/plugins/health.plugin.ts` registers exactly `/health` and `/health/ready`;
  `/health/ready` is the one that reports `database: 'up'`.
- **Entrypoint is `node dist/server.js`.** Migration is **not** run from the container entrypoint
  here — see §8.
- **`.env` never enters the image** (`.dockerignore` already excludes `.env*`). Configuration comes
  from the platform's environment variables.

## 8. Railway

`railway.json` declares `builder: "DOCKERFILE"`; Railway builds from the `Dockerfile` and deploys on
each push to the configured branch.

**D-61 — production migrations run in Railway's `preDeployCommand` (`node dist/db/migrate.js`),
never on the GitHub runner.** `railway run` executes locally, and `DATABASE_URL` resolves to
`*.railway.internal`, unreachable from a runner. Do not "fix" a deploy by reintroducing a migration
step in the workflow.

**D-62 — the custom domain is configured before the first real deploy.** `BETTER_AUTH_URL` is
effectively immutable: shipping on `*.up.railway.app` and moving later invalidates every registered
passkey (the WebAuthn RP ID is bound to the origin).

`deploy.yml`, when F7-S01 writes it: checkout → install the Railway CLI →
`railway up --service cardoso-sound-api --detach` → poll `$RAILWAY_URL/health/ready`. It does
**not** install dependencies and does **not** build — the build happens on Railway from the
`Dockerfile`. It must also:

- **depend on the verification gate** — `needs: [ci]` in a merged workflow, or an equivalent
  `workflow_run` / required-status-check arrangement. Today the two workflows would race on a push
  to `main` (G3 / F7-S01 trap #15); a deploy must never start with a red build;
- carry `if: github.ref == 'refs/heads/main' && github.event_name == 'push'` — a PR never deploys;
- read the deploy token from a GitHub **Environment** (`production`) with required reviewers, so
  there is a human approval between "build is green" and "the deploy credential is released";
- always pass `--service cardoso-sound-api` — a project with more than one service will otherwise
  deploy into the wrong one (F7-S01 trap #12);
- **never run the seed.** The seed is idempotent (D-28) but it is a manual, one-time
  `railway run --service cardoso-sound-api tsx src/db/seed/seed.ts`. In `deploy.yml` it would
  rewrite production data on every push (F7-S01 trap #14).

`pnpm db:push` is forbidden against any shared database — PR, CI and production alike. The
`block-destructive-bash.sh` hook already blocks it inside a Claude Code session.

## 9. `docker-compose.yml`

Local development Postgres (`postgres:17-alpine`) only. It is **not** production and it is **not**
what the tests use — `tests/integration/**` and `tests/e2e/**` start an isolated, ephemeral
container through Testcontainers. Its values come from `.env` (`POSTGRES_USER`, `POSTGRES_PASSWORD`,
`POSTGRES_DB`, `POSTGRES_CONTAINER_NAME`).

## 10. Secrets

`DATABASE_URL` and `BETTER_AUTH_SECRET` are the minimum. Everything optional in `env.ts` follows the
same rule when it is enabled: OAuth providers (`GOOGLE_*`, `GITHUB_*`, `FACEBOOK_*`), `RESEND_API_KEY`
— which `env.ts` makes mandatory in production — and `RATE_LIMIT_REDIS_URL`.

Platform environment variables on Railway; GitHub Secrets only if CI genuinely needs them. Never
committed, never logged (D-22 redacts sensitive headers in Pino), never inline in a workflow.
Production credentials live in a protected GitHub Environment, not in a repository-wide secret that
any workflow can read.

## 11. Next level — one job at a time

Each item moves out of this list and into the sections above when it is actually implemented.

- **Container smoke test + Trivy** — the last big one, blocked until `Dockerfile` has content.
  A `docker` job with `needs: [quality, test, build, contracts]` that builds the image with
  `docker/build-push-action` (`load: true`, `cache-from/to: type=gha`), then:
  1. **Trivy twice.** First as the gate: `format: table`, `severity: CRITICAL,HIGH`,
     `ignore-unfixed: true`, `exit-code: '1'` — table so the offending CVE is printed in the log,
     which a SARIF-only scan hides. Then a second pass, `if: always()` and `exit-code: '0'`, writing
     SARIF for the Security tab. That pass needs `security-events: write` on the job.
  2. **Boot the container** with `--network host` against a `services:` Postgres (this is the one
     job where a service container is right — the image under test is not the test suite, so there
     is no Testcontainers conflict), then poll `/health/ready` with bounded retries. `--network
host` is what lets the container reach the service; without it, only `/health` can be probed,
     because `/health/ready` reports `database: 'up'`.
  3. `docker logs api || true` on `failure()` — tolerate a missing container, since the Trivy gate
     can fail before the container is ever started — and `docker rm -f api || true` on `always()`.
  - Use `target:` matching the stage F7-S01 names (`runner`), not `production`.
- **Clear the last two `esbuild` advisories**: both are below the `high` gate, so this is not
  urgent. It needs either drizzle-kit to drop the deprecated `@esbuild-kit` chain upstream, or an
  `esbuild` override here — which would have to be proven against `pnpm db:generate` and
  `db:migrate` before it is trusted.
- **Coverage gate**: deliberately absent. D-27 rejects a percentage target — what blocks a merge is
  the named list of mandatory cases in the sprint brief. Do not add a threshold without a new ADR.
  This also means no coverage artifact upload: an artifact nobody gates on is ceremony.
- **Build artifact upload**: also deliberately absent. Nothing downstream consumes `dist/` — Railway
  builds the image from the `Dockerfile`.
