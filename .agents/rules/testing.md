# Testing & Quality Assurance Rules

Protocols for unit, integration, and end-to-end testing across the codebase.

## 1. Test Categories & Tools

1. **Unit Tests (Vitest)**:
   - Located in `tests/unit/modules/**`.
   - Test Services and Utilities in complete isolation.
   - Use mocks or in-memory stubs for Repositories and external clients.
   - Fast execution, zero network or database dependencies.

2. **Integration Tests (Vitest + Testcontainers)**:
   - Located in `tests/unit/modules/**` or `tests/integration/**`.
   - Spin up an ephemeral PostgreSQL instance via `@testcontainers/postgresql` defined in `tests/setup/testcontainers.ts`.
   - Run Drizzle migrations before test suites execute.
   - Test Repositories and real SQL queries with relational joins and transactions.

3. **E2E Tests (Playwright)**:
   - Located in `tests/e2e/specs/**`.
   - Execute full HTTP request/response flows against the running Fastify application.
   - Validate authentication sign-up/sign-in flows, cookie handling, playlist creation, track addition, and favorites lifecycle.

## 2. Best Practices

- Do not commit secrets, passwords, or production database credentials to test fixtures.
- Each test must clean up its state or run in an isolated transaction to prevent side effects.
- Test suites must be runnable both locally via `pnpm test` and in CI pipelines (`.github/workflows/ci.yml`).
