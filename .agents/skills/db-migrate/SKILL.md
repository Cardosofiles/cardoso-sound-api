---
name: db-migrate
description: >-
  Use this skill when generating, reviewing, or applying database migrations
  with Drizzle Kit or running the production migration runner.
---

# Database Migration Skill

Guide for managing PostgreSQL database schema changes using Drizzle ORM and Drizzle Kit.

## Workflow Steps

### 1. Generate Schema Migrations

When schema files in `src/db/schema/*.schema.ts` have changed:

```bash
pnpm db:generate
```

This generates SQL migration files inside the `drizzle/` directory based on the configuration in `drizzle.config.ts`.

### 2. Inspect Migration Files

Check the newly generated migration file in `drizzle/` to ensure:

- Correct SQL statements (CREATE TABLE, ALTER TABLE, ADD CONSTRAINT).
- Proper foreign key constraints and cascade actions.
- No unexpected destructive drops.

### 3. Apply Migrations Locally

To execute pending migrations against the local PostgreSQL instance:

```bash
pnpm db:migrate
```

### 4. Push Schema Directly (Development Only)

If rapid prototyping in development without saving formal migration files:

```bash
pnpm db:push
```

### 5. Production Migration Runner

In production or CI deployment environments, execute:

```bash
pnpm db:migrate:deploy
```

This executes `src/db/migrate.ts` programmatically using Drizzle's node-postgres migrator.
