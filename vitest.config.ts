import { defineConfig } from 'vitest/config';

// Vitest 4 removed `defineWorkspace` and the separate vitest.workspace.ts file;
// the three projects live here under `test.projects` instead. Project-level
// options no longer inherit from the root `test` block, so each one repeats
// what it needs.
const shared = {
  environment: 'node' as const,
  testTimeout: 15_000,
  hookTimeout: 120_000,
  // D-36: a single fork, so the Testcontainers Postgres is never shared by
  // two workers racing on the same schema.
  pool: 'forks' as const,
  poolOptions: { forks: { singleFork: true } },
};

export default defineConfig({
  test: {
    globals: false,
    reporters: ['default'],
    projects: [
      {
        test: {
          ...shared,
          name: 'unit',
          include: ['tests/unit/**/*.test.ts'],
        },
      },
      {
        test: {
          ...shared,
          name: 'integration',
          include: ['tests/integration/**/*.test.ts'],
        },
      },
      {
        test: {
          ...shared,
          name: 'e2e',
          include: ['tests/e2e/**/*.test.ts'],
        },
      },
    ],
  },
});
