---
name: test-runner
description: >-
  Use this skill when running unit tests with Vitest, integration tests with
  Testcontainers, or full HTTP end-to-end tests with Playwright.
---

# Automated Test Runner Skill

Standardized instructions for executing and debugging the test suites.

## 1. Unit Tests (Vitest)

Execute fast unit tests that test services and utilities with mock dependencies:

```bash
pnpm test
```

For interactive watch mode during active development:

```bash
pnpm test:watch
```

To run a specific unit test file:

```bash
pnpm vitest run tests/unit/modules/tracks/tracks.service.spec.ts
```

## 2. Integration Tests (Testcontainers + Vitest)

Integration tests require Docker running on the host machine to spin up ephemeral PostgreSQL containers:

```bash
pnpm vitest run tests/setup/testcontainers.ts
```

- Verify that the database container initializes without port collisions.
- Check that migrations apply cleanly to the ephemeral database before assertions run.

## 3. End-to-End Tests (Playwright)

E2E tests validate complete HTTP workflows against the running Fastify server:

1. Ensure the development server is running:
   ```bash
   pnpm dev
   ```
2. Run Playwright tests in a separate terminal:
   ```bash
   pnpm playwright test
   ```

## 4. Troubleshooting Test Failures

- Review console logs and stack traces.
- Verify test environment variables in `.env` or `tests/setup/`.
- Ensure mock reset hooks (`beforeEach(() => { vi.clearAllMocks(); })`) are active.
