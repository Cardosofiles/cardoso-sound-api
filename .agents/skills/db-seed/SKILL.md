---
name: db-seed
description: >-
  Use this skill when seeding the PostgreSQL database with mock data,
  including artists, 30+ audio tracks, and initial development accounts.
---

# Database Seed Skill

Procedure for populating the database with mock catalog data for the streaming API.

## Requirements

- PostgreSQL service must be running (e.g. `docker compose up -d`).
- Database migrations must be up-to-date (`pnpm db:migrate`).
- Valid environment variables configured in `.env` (`DATABASE_URL`).

## Execution Steps

### 1. Run Seed Script

Execute the seed script using `tsx`:

```bash
tsx src/db/seed/seed.ts
```

### 2. Verify Seed Content

Verify that the seed was successful:

- At least 5–8 mock artists inserted into the `artists` table.
- 30+ playable mock tracks inserted into the `tracks` table with durations and SoundHelix audio URLs.
- Foreign keys between tracks and artists are properly resolved.

### 3. Idempotency Check

Running the seed script multiple times should not create duplicate entries or crash with unique constraint violations. The script should either clear mock data beforehand or perform upserts (`ON CONFLICT DO NOTHING`).
