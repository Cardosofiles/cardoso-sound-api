# Database & Drizzle ORM Rules

Conventions for relational data modeling with PostgreSQL and Drizzle ORM.

## 1. Schema Design

- Tables are defined under `src/db/schema/*.schema.ts` and aggregated in `src/db/schema/index.ts`.
- Primary keys for domain entities (`artists`, `tracks`, `playlists`) use UUIDs with default random generation (`uuid('id').primaryKey().defaultRandom()`).
- Better Auth tables (`user`, `session`, `account`, `verification`) use text IDs matching Better Auth adapter specifications.
- Foreign keys must explicitly define onDelete actions (e.g. `{ onDelete: 'cascade' }`).
- Junction tables (e.g., `playlist_tracks`, `favorites`) use composite primary keys via `primaryKey({ columns: [...] })`.
- All timestamps should default to `defaultNow()` and remain non-null where required.

## 2. Client & Connection Pool

- Database client is instantiated once in `src/db/client.ts` wrapping `pg.Pool`.
- Connection string is parsed from validated environment variables (`env.DATABASE_URL`).
- Schema must be passed to the `drizzle(pool, { schema })` instantiation to support relational queries (`db.query.*`).

## 3. Migrations & Seed

- Migrations must be generated via `pnpm db:generate` (`drizzle-kit generate`).
- Seed files must maintain idempotent or clean-insert workflows to populate 30+ mock audio tracks with valid audio URLs (SoundHelix or similar) and realistic mock artists.
- Production migrations run through `src/db/migrate.ts` using `drizzle-orm/node-postgres/migrator`.
