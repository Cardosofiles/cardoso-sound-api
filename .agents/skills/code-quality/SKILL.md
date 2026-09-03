---
name: code-quality
description: >-
  Use this skill when checking TypeScript compilation errors, running ESLint,
  formatting code with Prettier, or building the project bundle with tsup.
---

# Code Quality & Build Verification Skill

Standard procedure for validating type safety, linting rules, and production build readiness before finalizing code changes.

## Verification Pipeline

Always execute the following checks in order:

### 1. TypeScript Compilation (Typecheck)

Ensure there are no compile-time type errors:

```bash
pnpm typecheck
```

_Expected result:_ `tsc --noEmit` exits with 0 errors.

### 2. Static Code Analysis (Linting)

Run ESLint to catch stylistic inconsistencies, unused variables, and forbidden imports:

```bash
pnpm lint
```

To automatically fix autofixable lint errors:

```bash
pnpm lint --fix
```

### 3. Code Formatting

Format the codebase according to Prettier rules:

```bash
pnpm format
```

### 4. Production Build (tsup)

Verify that `tsup` bundles the application without packaging issues:

```bash
pnpm build
```

Check that output files are correctly generated in `dist/` (e.g., `dist/server.js`, `dist/jobs/runner.js`, `dist/db/migrate.js`).
