# Plano de Implementação — Sprint F2-S01: Schema Drizzle e Migração Inicial

> **Status:** 🟡 Em Planejamento (Aguardando Autorização Explícita — Etapa 3 do Protocolo)  
> **Fase:** F2 — Catálogo  
> **Branch Alvo:** `feature/f2s01-schema-e-migrations` (a partir de `develop`)  
> **Depende de:** F1-S06 (Fundação concluída e tag `v0.1.0` preparada)  
> **Specs de Referência:**
>
> - [`docs/specs/02-modelo-de-dados.md`](file:///run/media/joaocardoso/discoF/Cardosofiles/typescript/back-end/fastify/cardoso-sound-api/docs/specs/02-modelo-de-dados.md) (Normativa Completa)
> - [`docs/specs/06-git-ci-cd-e-deploy.md`](file:///run/media/joaocardoso/discoF/Cardosofiles/typescript/back-end/fastify/cardoso-sound-api/docs/specs/06-git-ci-cd-e-deploy.md)
> - [`docs/specs/07-protocolo-dos-agentes.md`](file:///run/media/joaocardoso/discoF/Cardosofiles/typescript/back-end/fastify/cardoso-sound-api/docs/specs/07-protocolo-dos-agentes.md)
> - [`docs/sprints/fase-2-catalogo/F2-S01-schema-e-migrations.md`](file:///run/media/joaocardoso/discoF/Cardosofiles/typescript/back-end/fastify/cardoso-sound-api/docs/sprints/fase-2-catalogo/F2-S01-schema-e-migrations.md)
> - [`.agents/rules/database.md`](file:///run/media/joaocardoso/discoF/Cardosofiles/typescript/back-end/fastify/cardoso-sound-api/.agents/rules/database.md)
> - [`.agents/rules/coding-standards.md`](file:///run/media/joaocardoso/discoF/Cardosofiles/typescript/back-end/fastify/cardoso-sound-api/.agents/rules/coding-standards.md)

---

## 1. Contexto e Objetivos

O sprint **F2-S01** inaugura a **Fase 2 (Catálogo)** da API `cardoso-sound-api`. Seu objetivo é materializar o modelo de dados relacional completo em uma **única migração inicial SQL**:

- **4 tabelas do Better Auth:** `user`, `session`, `account` e `verification` (com chave primária `text('id')`).
- **5 tabelas de domínio:** `artists`, `tracks`, `playlists`, `playlist_tracks` e `favorites` (com `uuid` aleatório ou PKs compostas).
- **Extensão e Índices GIN:** Ativação de `pg_trgm` e os 3 índices GIN (`tracks.title`, `tracks.album`, `artists.name`) para acelerar as buscas textuais `ILIKE` (**D-11**), aplicados via edição manual mandatória do SQL gerado.
- **Relacionamentos Drizzle:** Configuração das 5 `relations` em [`src/db/schema/index.ts`](file:///run/media/joaocardoso/discoF/Cardosofiles/typescript/back-end/fastify/cardoso-sound-api/src/db/schema/index.ts) para viabilizar queries relacionais via `db.query.*` (ex.: `db.query.tracks.findMany({ with: { artist: true } })`).
- **Runner de Migração de Produção:** Implementação de [`src/db/migrate.ts`](file:///run/media/joaocardoso/discoF/Cardosofiles/typescript/back-end/fastify/cardoso-sound-api/src/db/migrate.ts) utilizando o migrator do Drizzle ORM com pool isolado `max: 1`.

---

## 2. Blast Radius e Controle Estrito de Arquivos

Em total conformidade com a seção 4 de [`F2-S01-schema-e-migrations.md`](file:///run/media/joaocardoso/discoF/Cardosofiles/typescript/back-end/fastify/cardoso-sound-api/docs/sprints/fase-2-catalogo/F2-S01-schema-e-migrations.md):

### Arquivos a Preencher (atualmente com 0 bytes):

- [`drizzle.config.ts`](file:///run/media/joaocardoso/discoF/Cardosofiles/typescript/back-end/fastify/cardoso-sound-api/drizzle.config.ts)
- [`src/db/schema/users.schema.ts`](file:///run/media/joaocardoso/discoF/Cardosofiles/typescript/back-end/fastify/cardoso-sound-api/src/db/schema/users.schema.ts)
- [`src/db/schema/artists.schema.ts`](file:///run/media/joaocardoso/discoF/Cardosofiles/typescript/back-end/fastify/cardoso-sound-api/src/db/schema/artists.schema.ts)
- [`src/db/schema/tracks.schema.ts`](file:///run/media/joaocardoso/discoF/Cardosofiles/typescript/back-end/fastify/cardoso-sound-api/src/db/schema/tracks.schema.ts)
- [`src/db/schema/playlists.schema.ts`](file:///run/media/joaocardoso/discoF/Cardosofiles/typescript/back-end/fastify/cardoso-sound-api/src/db/schema/playlists.schema.ts)
- [`src/db/schema/playlist-tracks.schema.ts`](file:///run/media/joaocardoso/discoF/Cardosofiles/typescript/back-end/fastify/cardoso-sound-api/src/db/schema/playlist-tracks.schema.ts)
- [`src/db/schema/favorites.schema.ts`](file:///run/media/joaocardoso/discoF/Cardosofiles/typescript/back-end/fastify/cardoso-sound-api/src/db/schema/favorites.schema.ts)
- [`src/db/migrate.ts`](file:///run/media/joaocardoso/discoF/Cardosofiles/typescript/back-end/fastify/cardoso-sound-api/src/db/migrate.ts)

### Arquivos a Editar:

- [`src/db/schema/index.ts`](file:///run/media/joaocardoso/discoF/Cardosofiles/typescript/back-end/fastify/cardoso-sound-api/src/db/schema/index.ts) (transformação do barrel vazio de F1-S06 em barrel real exportando as 9 tabelas e 5 relations)
- [`.agents/memory/DECISIONS.md`](file:///run/media/joaocardoso/discoF/Cardosofiles/typescript/back-end/fastify/cardoso-sound-api/.agents/memory/DECISIONS.md) (registros D-39 e D-40)
- [`.agents/memory/PROGRESS.md`](file:///run/media/joaocardoso/discoF/Cardosofiles/typescript/back-end/fastify/cardoso-sound-api/.agents/memory/PROGRESS.md) (avanço para F2-S02)
- [`.agents/memory/F2-S01.md`](file:///run/media/joaocardoso/discoF/Cardosofiles/typescript/back-end/fastify/cardoso-sound-api/.agents/memory/F2-S01.md) (resumo técnico com saídas de `\d` e SQL manual)

### Arquivos a Gerar e Commitar:

- `drizzle/0000_*.sql` (com as edições manuais)
- `drizzle/meta/*` (`_journal.json`, etc.)
- [`docs/agents-plans/plan-f2-s01-schema-e-migrations.md`](file:///run/media/joaocardoso/discoF/Cardosofiles/typescript/back-end/fastify/cardoso-sound-api/docs/agents-plans/plan-f2-s01-schema-e-migrations.md) (persistência deste plano no repositório — Regra 6)

### Arquivos Estritamente Intocáveis nesta Sprint:

- `src/db/client.ts` (já finalizado em F1-S06)
- `src/db/seed/**` (escopo de F2-S02)
- `src/modules/**` (escopo de F2-S03, F2-S04, F3, F4)
- `tests/**` (nenhum teste Vitest a alterar neste sprint)

---

## 3. Especificação Detalhada dos Componentes e Contratos

### 3.1 `drizzle.config.ts`

Configuração oficial do Drizzle Kit apontando para schemas tipados e pasta de saída:

```typescript
import { defineConfig } from 'drizzle-kit';
import { env } from './src/config/env.js';

export default defineConfig({
  dialect: 'postgresql',
  schema: './src/db/schema/*.schema.ts',
  out: './drizzle',
  dbCredentials: {
    url: env.DATABASE_URL,
  },
  verbose: true,
  strict: true,
});
```

### 3.2 Schemas do Better Auth (`src/db/schema/users.schema.ts`)

Conforme a spec [`docs/specs/02-modelo-de-dados.md`](file:///run/media/joaocardoso/discoF/Cardosofiles/typescript/back-end/fastify/cardoso-sound-api/docs/specs/02-modelo-de-dados.md) §3 e validação contra `better-auth@1.7.2`:

```typescript
import { boolean, pgTable, text, timestamp } from 'drizzle-orm/pg-core';

export const user = pgTable('user', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  email: text('email').notNull().unique(),
  emailVerified: boolean('email_verified').notNull().default(false),
  image: text('image'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
});

export const session = pgTable('session', {
  id: text('id').primaryKey(),
  token: text('token').notNull().unique(),
  expiresAt: timestamp('expires_at').notNull(),
  ipAddress: text('ip_address'),
  userAgent: text('user_agent'),
  userId: text('user_id')
    .notNull()
    .references(() => user.id, { onDelete: 'cascade' }),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
});

export const account = pgTable('account', {
  id: text('id').primaryKey(),
  accountId: text('account_id').notNull(),
  providerId: text('provider_id').notNull(),
  userId: text('user_id')
    .notNull()
    .references(() => user.id, { onDelete: 'cascade' }),
  password: text('password'),
  accessToken: text('access_token'),
  refreshToken: text('refresh_token'),
  idToken: text('id_token'),
  scope: text('scope'),
  accessTokenExpiresAt: timestamp('access_token_expires_at'),
  refreshTokenExpiresAt: timestamp('refresh_token_expires_at'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
});

export const verification = pgTable('verification', {
  id: text('id').primaryKey(),
  identifier: text('identifier').notNull(),
  value: text('value').notNull(),
  expiresAt: timestamp('expires_at').notNull(),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
});

export type User = typeof user.$inferSelect;
export type NewUser = typeof user.$inferInsert;
export type Session = typeof session.$inferSelect;
export type NewSession = typeof session.$inferInsert;
export type Account = typeof account.$inferSelect;
export type NewAccount = typeof account.$inferInsert;
export type Verification = typeof verification.$inferSelect;
export type NewVerification = typeof verification.$inferInsert;
```

### 3.3 Schemas de Domínio

#### 1. [`src/db/schema/artists.schema.ts`](file:///run/media/joaocardoso/discoF/Cardosofiles/typescript/back-end/fastify/cardoso-sound-api/src/db/schema/artists.schema.ts)

- Chave primária UUID `defaultRandom()`.
- Nome com `varchar(255).notNull().unique()`, servindo como alvo do `ON CONFLICT` no seed de F2-S02.
- O índice GIN `artists_name_trgm_idx` será injetado no SQL de migração.

```typescript
import { pgTable, timestamp, uuid, varchar } from 'drizzle-orm/pg-core';

export const artists = pgTable('artists', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: varchar('name', { length: 255 }).notNull().unique(),
  bio: varchar('bio', { length: 1000 }),
  avatarUrl: varchar('avatar_url', { length: 500 }),
  createdAt: timestamp('created_at').notNull().defaultNow(),
});

export type Artist = typeof artists.$inferSelect;
export type NewArtist = typeof artists.$inferInsert;
```

#### 2. [`src/db/schema/tracks.schema.ts`](file:///run/media/joaocardoso/discoF/Cardosofiles/typescript/back-end/fastify/cardoso-sound-api/src/db/schema/tracks.schema.ts)

- `artist_id` referenciando `artists.id` com `onDelete: 'cascade'`.
- Constraint composta declarada no 2º argumento (array): `unique('tracks_artist_title_unique').on(table.artistId, table.title)`.
- Índices BTREE normais: `tracks_artist_id_idx` e `tracks_genre_idx`.
- Índices GIN (`tracks_title_trgm_idx` e `tracks_album_trgm_idx`) injetados no SQL.

```typescript
import { index, integer, pgTable, timestamp, unique, uuid, varchar } from 'drizzle-orm/pg-core';
import { artists } from './artists.schema.js';

export const tracks = pgTable(
  'tracks',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    title: varchar('title', { length: 255 }).notNull(),
    artistId: uuid('artist_id')
      .notNull()
      .references(() => artists.id, { onDelete: 'cascade' }),
    album: varchar('album', { length: 255 }),
    genre: varchar('genre', { length: 40 }).notNull(),
    durationSeconds: integer('duration_seconds').notNull(),
    coverUrl: varchar('cover_url', { length: 500 }),
    audioUrl: varchar('audio_url', { length: 500 }).notNull(),
    createdAt: timestamp('created_at').notNull().defaultNow(),
  },
  (table) => [
    unique('tracks_artist_title_unique').on(table.artistId, table.title),
    index('tracks_artist_id_idx').on(table.artistId),
    index('tracks_genre_idx').on(table.genre),
  ],
);

export type Track = typeof tracks.$inferSelect;
export type NewTrack = typeof tracks.$inferInsert;
```

#### 3. [`src/db/schema/playlists.schema.ts`](file:///run/media/joaocardoso/discoF/Cardosofiles/typescript/back-end/fastify/cardoso-sound-api/src/db/schema/playlists.schema.ts)

- **CRÍTICO:** `user_id` é `text('user_id')` referenciando `user.id` (`onDelete: 'cascade'`).
- Índice BTREE: `playlists_user_id_idx`.

```typescript
import { index, pgTable, text, timestamp, uuid, varchar } from 'drizzle-orm/pg-core';
import { user } from './users.schema.js';

export const playlists = pgTable(
  'playlists',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    name: varchar('name', { length: 120 }).notNull(),
    description: varchar('description', { length: 500 }),
    createdAt: timestamp('created_at').notNull().defaultNow(),
    updatedAt: timestamp('updated_at').notNull().defaultNow(),
  },
  (table) => [index('playlists_user_id_idx').on(table.userId)],
);

export type Playlist = typeof playlists.$inferSelect;
export type NewPlaylist = typeof playlists.$inferInsert;
```

#### 4. [`src/db/schema/playlist-tracks.schema.ts`](file:///run/media/joaocardoso/discoF/Cardosofiles/typescript/back-end/fastify/cardoso-sound-api/src/db/schema/playlist-tracks.schema.ts)

- FK para `playlists.id` e `tracks.id` com `onDelete: 'cascade'`.
- PK composta: `primaryKey({ columns: [table.playlistId, table.trackId] })`.
- `added_at` determina a ordenação temporal das faixas na playlist (**D-15**).

```typescript
import { pgTable, primaryKey, timestamp, uuid } from 'drizzle-orm/pg-core';
import { playlists } from './playlists.schema.js';
import { tracks } from './tracks.schema.js';

export const playlistTracks = pgTable(
  'playlist_tracks',
  {
    playlistId: uuid('playlist_id')
      .notNull()
      .references(() => playlists.id, { onDelete: 'cascade' }),
    trackId: uuid('track_id')
      .notNull()
      .references(() => tracks.id, { onDelete: 'cascade' }),
    addedAt: timestamp('added_at').notNull().defaultNow(),
  },
  (table) => [primaryKey({ columns: [table.playlistId, table.trackId] })],
);

export type PlaylistTrack = typeof playlistTracks.$inferSelect;
export type NewPlaylistTrack = typeof playlistTracks.$inferInsert;
```

#### 5. [`src/db/schema/favorites.schema.ts`](file:///run/media/joaocardoso/discoF/Cardosofiles/typescript/back-end/fastify/cardoso-sound-api/src/db/schema/favorites.schema.ts)

- **CRÍTICO:** `user_id` é `text('user_id')` referenciando `user.id` (`onDelete: 'cascade'`).
- PK composta: `primaryKey({ columns: [table.userId, table.trackId] })`.
- Índice BTREE: `favorites_user_id_idx`.

```typescript
import { index, pgTable, primaryKey, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { user } from './users.schema.js';
import { tracks } from './tracks.schema.js';

export const favorites = pgTable(
  'favorites',
  {
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    trackId: uuid('track_id')
      .notNull()
      .references(() => tracks.id, { onDelete: 'cascade' }),
    createdAt: timestamp('created_at').notNull().defaultNow(),
  },
  (table) => [
    primaryKey({ columns: [table.userId, table.trackId] }),
    index('favorites_user_id_idx').on(table.userId),
  ],
);

export type Favorite = typeof favorites.$inferSelect;
export type NewFavorite = typeof favorites.$inferInsert;
```

### 3.4 Barrel e Relações Drizzle (`src/db/schema/index.ts`)

Substitui o barrel provisório de F1-S06. Reexporta todas as 9 tabelas e adiciona as 5 `relations` do Drizzle:

```typescript
import { relations } from 'drizzle-orm';
import { artists } from './artists.schema.js';
import { favorites } from './favorites.schema.js';
import { playlistTracks } from './playlist-tracks.schema.js';
import { playlists } from './playlists.schema.js';
import { tracks } from './tracks.schema.js';
import { account, session, user, verification } from './users.schema.js';

// Reexportação das 9 tabelas
export * from './users.schema.js';
export * from './artists.schema.js';
export * from './tracks.schema.js';
export * from './playlists.schema.js';
export * from './playlist-tracks.schema.js';
export * from './favorites.schema.js';

// Relações do Drizzle ORM (Spec 02 §6)
export const artistsRelations = relations(artists, ({ many }) => ({
  tracks: many(tracks),
}));

export const tracksRelations = relations(tracks, ({ one, many }) => ({
  artist: one(artists, {
    fields: [tracks.artistId],
    references: [artists.id],
  }),
  playlistTracks: many(playlistTracks),
  favorites: many(favorites),
}));

export const playlistsRelations = relations(playlists, ({ one, many }) => ({
  user: one(user, {
    fields: [playlists.userId],
    references: [user.id],
  }),
  playlistTracks: many(playlistTracks),
}));

export const playlistTracksRelations = relations(playlistTracks, ({ one }) => ({
  playlist: one(playlists, {
    fields: [playlistTracks.playlistId],
    references: [playlists.id],
  }),
  track: one(tracks, {
    fields: [playlistTracks.trackId],
    references: [tracks.id],
  }),
}));

export const favoritesRelations = relations(favorites, ({ one }) => ({
  user: one(user, {
    fields: [favorites.userId],
    references: [user.id],
  }),
  track: one(tracks, {
    fields: [favorites.trackId],
    references: [tracks.id],
  }),
}));
```

### 3.5 Runner de Produção (`src/db/migrate.ts`)

Responsável pela aplicação automatizada de migrações em ambientes de deploy (Docker / Railway / CI):

```typescript
import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import pg from 'pg';
import { env } from '../config/env.js';

async function runMigrations(): Promise<void> {
  const pool = new pg.Pool({
    connectionString: env.DATABASE_URL,
    max: 1,
    connectionTimeoutMillis: 5000,
  });

  const db = drizzle(pool);

  try {
    process.stdout.write('[Database Migration] Starting database migration...\n');
    await migrate(db, { migrationsFolder: './drizzle' });
    process.stdout.write('[Database Migration] Database migration completed successfully.\n');
    await pool.end();
    process.exit(0);
  } catch (error: unknown) {
    process.stderr.write(
      `[Database Migration Error] Failed to apply migrations: ${String(error)}\n`,
    );
    await pool.end();
    process.exit(1);
  }
}

void runMigrations();
```

---

## 4. Edição Manual Mandatória da Migração Inicial

Após executar `pnpm db:generate`, o arquivo gerado `drizzle/0000_*.sql` será editado cirurgicamente:

1. **Primeira linha do arquivo:**
   ```sql
   CREATE EXTENSION IF NOT EXISTS pg_trgm;
   ```
2. **Ao final do arquivo:**
   ```sql
   CREATE INDEX IF NOT EXISTS "tracks_title_trgm_idx" ON "tracks" USING GIN ("title" gin_trgm_ops);
   CREATE INDEX IF NOT EXISTS "tracks_album_trgm_idx" ON "tracks" USING GIN ("album" gin_trgm_ops);
   CREATE INDEX IF NOT EXISTS "artists_name_trgm_idx" ON "artists" USING GIN ("name" gin_trgm_ops);
   ```

---

## 5. Casos de Teste e Validações Obrigatórias (T1 a T10)

Todas as verificações descritas na seção 6 da sprint serão executadas via `psql` e comprovadas:

| #       | Verificação                  | Comando de Prova                                                                                                              | Critério de Sucesso                                                                                                   |
| ------- | ---------------------------- | ----------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| **T1**  | 9 tabelas existem            | `docker compose exec postgres psql -U cardoso -d cardoso_sound -c '\dt'`                                                      | Lista: `user`, `session`, `account`, `verification`, `artists`, `tracks`, `playlists`, `playlist_tracks`, `favorites` |
| **T2**  | Extensão `pg_trgm` instalada | `docker compose exec postgres psql -U cardoso -d cardoso_sound -c "select extname from pg_extension where extname='pg_trgm'"` | Devolve linha com `pg_trgm`                                                                                           |
| **T3**  | 3 índices GIN existem        | `docker compose exec postgres psql -U cardoso -d cardoso_sound -c '\di'`                                                      | Lista: `tracks_title_trgm_idx`, `tracks_album_trgm_idx`, `artists_name_trgm_idx` com método `gin`                     |
| **T4**  | `playlists.user_id` é `text` | `docker compose exec postgres psql -U cardoso -d cardoso_sound -c '\d playlists'`                                             | Coluna `user_id` possui Type `text`                                                                                   |
| **T5**  | PK composta em `favorites`   | `docker compose exec postgres psql -U cardoso -d cardoso_sound -c '\d favorites'`                                             | `PRIMARY KEY (user_id, track_id)`                                                                                     |
| **T6**  | Cascade declarado            | `docker compose exec postgres psql -U cardoso -d cardoso_sound -c '\d tracks'`                                                | `ON DELETE CASCADE` na foreign key para `artists(id)`                                                                 |
| **T7**  | Unique de `artists.name`     | `docker compose exec postgres psql -U cardoso -d cardoso_sound -c '\d artists'`                                               | Constraint UNIQUE sobre `name`                                                                                        |
| **T8**  | Unique `(artist_id, title)`  | `docker compose exec postgres psql -U cardoso -d cardoso_sound -c '\d tracks'`                                                | Constraint `tracks_artist_title_unique` sobre `(artist_id, title)`                                                    |
| **T9**  | Idempotência da migração     | `pnpm db:migrate` rodado novamente                                                                                            | Sem alterações ou erros                                                                                               |
| **T10** | Base limpa aplica do zero    | `docker compose down -v && docker compose up -d && sleep 5 && pnpm db:migrate`                                                | Migração aplica com sucesso a partir do zero                                                                          |

---

## 6. Definition of Done (DoD) e Roteiro de Execução Passo a Passo

### Ordem de Execução:

1. **Branch de Trabalho:**
   - Criar e alternar para a branch: `git checkout -b feature/f2s01-schema-e-migrations` a partir de `develop`.
2. **Escrever Código nos 8 Arquivos Declarados:**
   - `drizzle.config.ts`
   - `src/db/schema/users.schema.ts`
   - `src/db/schema/artists.schema.ts`
   - `src/db/schema/tracks.schema.ts`
   - `src/db/schema/playlists.schema.ts`
   - `src/db/schema/playlist-tracks.schema.ts`
   - `src/db/schema/favorites.schema.ts`
   - `src/db/schema/index.ts` (barrel + relations)
   - `src/db/migrate.ts`
3. **Gerar Migração Inicial:**
   - Executar `pnpm db:generate`.
   - Inspecionar o SQL gerado para garantir integridade e ausência de operações destrutivas.
4. **Editar Manualmente o SQL da Migração:**
   - Inserir `CREATE EXTENSION IF NOT EXISTS pg_trgm;` no topo de `drizzle/0000_*.sql`.
   - Inserir os 3 índices GIN ao final de `drizzle/0000_*.sql`.
5. **Aplicar Migração no Banco Local:**
   - `pnpm db:migrate`.
6. **Verificar Sincronia de Schema:**
   - Rodar `pnpm db:generate` novamente: deve reportar que nenhuma nova migração é necessária.
7. **Executar Provas T1 a T10:**
   - Rodar todos os comandos `psql` e conferir a integridade das 9 tabelas, tipos, constraints e índices.
   - Testar idempotência (T9) e recriação do zero a partir de volume limpo (T10).
8. **Verificar Typecheck Relacional:**
   - Garantir que `db.query.tracks.findMany({ with: { artist: true } })` compila sem erros de tipos.
9. **Pipeline de Qualidade Completa:**
   - `pnpm typecheck`
   - `pnpm lint`
   - `pnpm format`
   - `pnpm test`
   - `pnpm build`
10. **Registro e Memória:**
    - Atualizar `.agents/memory/DECISIONS.md` com D-39 e D-40.
    - Atualizar `.agents/memory/PROGRESS.md`.
    - Criar `.agents/memory/F2-S01.md` com a saída de `\d` das tabelas de domínio.
11. **Entrega:**
    - Commit convencional: `feat(db): adiciona schema completo e migracao inicial com pg_trgm`.
    - Push para origin e abertura de PR apontando para `develop`.
    - Aguardar CI verde com `gh run watch --exit-status`.
    - Encerrar sessão e reportar o link do PR.
