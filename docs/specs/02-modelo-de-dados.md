# 02 — Modelo de Dados

> Esta spec é **normativa**. As 9 tabelas abaixo são geradas em uma **única migração
> inicial** (sprint F2-S01). Não crie tabela, coluna ou índice fora daqui.

---

## 1. Diagrama

```
┌──────────────┐        ┌──────────────┐
│   artists    │───1:N─▶│    tracks    │
│ id uuid PK   │        │ id uuid PK   │
│ name UNIQUE  │        │ artist_id FK │
└──────────────┘        │ genre        │
                        └──────┬───────┘
                               │
              ┌────────────────┼────────────────┐
              │                                 │
     ┌────────▼─────────┐              ┌────────▼────────┐
     │ playlist_tracks  │              │    favorites    │
     │ PK(playlist,     │              │ PK(user_id,     │
     │    track)        │              │    track_id)    │
     └────────▲─────────┘              └────────▲────────┘
              │                                 │
     ┌────────┴─────────┐                       │
     │    playlists     │                       │
     │ id uuid PK       │                       │
     │ user_id text FK  │───────────────────────┘
     └────────▲─────────┘                       │
              │                                 │
     ┌────────┴─────────────────────────────────┴────────┐
     │  user  (Better Auth — id TEXT)                    │
     │  ├── session   ├── account   └── verification     │
     └───────────────────────────────────────────────────┘
```

---

## 2. ⚠️ A armadilha número um deste projeto

**`user.id` é `text`, não `uuid`.** É o adaptador do Better Auth que dita isso.

Consequência inegociável:

```ts
// ✅ CERTO
userId: text('user_id')
  .notNull()
  .references(() => user.id, { onDelete: 'cascade' });

// ❌ ERRADO — quebra na migração com "foreign key constraint cannot be implemented"
userId: uuid('user_id')
  .notNull()
  .references(() => user.id, { onDelete: 'cascade' });
```

Vale para `playlists.user_id` e `favorites.user_id`. As entidades de domínio
(`artists`, `tracks`, `playlists`) usam `uuid('id').primaryKey().defaultRandom()`.
As tabelas do Better Auth usam `text('id').primaryKey()`.

---

## 3. Tabelas do Better Auth

Arquivo: `src/db/schema/users.schema.ts`. Os nomes de tabela são **singulares** e os de
coluna são ditados pelo adaptador — **não renomeie nada**.

### `user`

| Coluna           | Tipo        | Regras                    |
| ---------------- | ----------- | ------------------------- |
| `id`             | `text`      | PK                        |
| `name`           | `text`      | NOT NULL                  |
| `email`          | `text`      | NOT NULL, **UNIQUE**      |
| `email_verified` | `boolean`   | NOT NULL, default `false` |
| `image`          | `text`      | nullable                  |
| `created_at`     | `timestamp` | NOT NULL, `defaultNow()`  |
| `updated_at`     | `timestamp` | NOT NULL, `defaultNow()`  |

### `session`

| Coluna                      | Tipo        | Regras                                     |
| --------------------------- | ----------- | ------------------------------------------ |
| `id`                        | `text`      | PK                                         |
| `token`                     | `text`      | NOT NULL, **UNIQUE**                       |
| `expires_at`                | `timestamp` | NOT NULL                                   |
| `ip_address` / `user_agent` | `text`      | nullable                                   |
| `user_id`                   | `text`      | NOT NULL → `user.id` **ON DELETE CASCADE** |
| `created_at` / `updated_at` | `timestamp` | NOT NULL, `defaultNow()`                   |

### `account`

| Coluna                                                  | Tipo        | Regras                                     |
| ------------------------------------------------------- | ----------- | ------------------------------------------ |
| `id`                                                    | `text`      | PK                                         |
| `account_id` / `provider_id`                            | `text`      | NOT NULL                                   |
| `user_id`                                               | `text`      | NOT NULL → `user.id` **ON DELETE CASCADE** |
| `password`                                              | `text`      | nullable — hash do e-mail/senha vive aqui  |
| `access_token` / `refresh_token` / `id_token` / `scope` | `text`      | nullable                                   |
| `access_token_expires_at` / `refresh_token_expires_at`  | `timestamp` | nullable                                   |
| `created_at` / `updated_at`                             | `timestamp` | NOT NULL, `defaultNow()`                   |

### `verification`

| Coluna                      | Tipo        | Regras                   |
| --------------------------- | ----------- | ------------------------ |
| `id`                        | `text`      | PK                       |
| `identifier` / `value`      | `text`      | NOT NULL                 |
| `expires_at`                | `timestamp` | NOT NULL                 |
| `created_at` / `updated_at` | `timestamp` | NOT NULL, `defaultNow()` |

> **Verificação obrigatória antes de gerar a migração:** rode
> `pnpm dlx @better-auth/cli generate` e **compare** com o schema escrito à mão.
> Se divergir, o schema escrito à mão está errado. A versão da lib manda.

---

## 4. Tabelas de domínio

### `artists` — `src/db/schema/artists.schema.ts`

| Coluna       | Tipo            | Regras                                               |
| ------------ | --------------- | ---------------------------------------------------- |
| `id`         | `uuid`          | PK, `defaultRandom()`                                |
| `name`       | `varchar(255)`  | NOT NULL, **UNIQUE** ← alvo do `ON CONFLICT` do seed |
| `bio`        | `varchar(1000)` | nullable                                             |
| `avatar_url` | `varchar(500)`  | nullable                                             |
| `created_at` | `timestamp`     | NOT NULL, `defaultNow()`                             |

### `tracks` — `src/db/schema/tracks.schema.ts`

| Coluna             | Tipo           | Regras                                        |
| ------------------ | -------------- | --------------------------------------------- |
| `id`               | `uuid`         | PK, `defaultRandom()`                         |
| `title`            | `varchar(255)` | NOT NULL                                      |
| `artist_id`        | `uuid`         | NOT NULL → `artists.id` **ON DELETE CASCADE** |
| `album`            | `varchar(255)` | nullable                                      |
| `genre`            | `varchar(40)`  | NOT NULL — slug minúsculo, um dos 6 de `00`   |
| `duration_seconds` | `integer`      | NOT NULL, > 0                                 |
| `cover_url`        | `varchar(500)` | nullable                                      |
| `audio_url`        | `varchar(500)` | NOT NULL                                      |
| `created_at`       | `timestamp`    | NOT NULL, `defaultNow()`                      |

**Constraint composta:** `UNIQUE (artist_id, title)` ← alvo do `ON CONFLICT` do seed.

### `playlists` — `src/db/schema/playlists.schema.ts`

| Coluna                      | Tipo           | Regras                                     |
| --------------------------- | -------------- | ------------------------------------------ |
| `id`                        | `uuid`         | PK, `defaultRandom()`                      |
| `user_id`                   | **`text`**     | NOT NULL → `user.id` **ON DELETE CASCADE** |
| `name`                      | `varchar(120)` | NOT NULL                                   |
| `description`               | `varchar(500)` | nullable                                   |
| `created_at` / `updated_at` | `timestamp`    | NOT NULL, `defaultNow()`                   |

### `playlist_tracks` — `src/db/schema/playlist-tracks.schema.ts`

| Coluna        | Tipo        | Regras                                                   |
| ------------- | ----------- | -------------------------------------------------------- |
| `playlist_id` | `uuid`      | NOT NULL → `playlists.id` **ON DELETE CASCADE**          |
| `track_id`    | `uuid`      | NOT NULL → `tracks.id` **ON DELETE CASCADE**             |
| `added_at`    | `timestamp` | NOT NULL, `defaultNow()` ← **é a ordenação da playlist** |

PK composta: `primaryKey({ columns: [playlistId, trackId] })`

### `favorites` — `src/db/schema/favorites.schema.ts`

| Coluna       | Tipo        | Regras                                       |
| ------------ | ----------- | -------------------------------------------- |
| `user_id`    | **`text`**  | NOT NULL → `user.id` **ON DELETE CASCADE**   |
| `track_id`   | `uuid`      | NOT NULL → `tracks.id` **ON DELETE CASCADE** |
| `created_at` | `timestamp` | NOT NULL, `defaultNow()`                     |

PK composta: `primaryKey({ columns: [userId, trackId] })`

---

## 5. Índices

| Índice                       | Tabela    | Definição                      | Serve a                               |
| ---------------------------- | --------- | ------------------------------ | ------------------------------------- |
| `artists_name_unique`        | artists   | UNIQUE (`name`)                | seed idempotente                      |
| `tracks_artist_title_unique` | tracks    | UNIQUE (`artist_id`, `title`)  | seed idempotente                      |
| `tracks_artist_id_idx`       | tracks    | BTREE (`artist_id`)            | `GET /artists/:id`, filtro `artistId` |
| `tracks_genre_idx`           | tracks    | BTREE (`genre`)                | filtro `?genre=` e `GET /genres`      |
| `tracks_title_trgm_idx`      | tracks    | **GIN (`title` gin_trgm_ops)** | busca `?search=`                      |
| `tracks_album_trgm_idx`      | tracks    | **GIN (`album` gin_trgm_ops)** | busca `?search=`                      |
| `artists_name_trgm_idx`      | artists   | **GIN (`name` gin_trgm_ops)**  | busca `?search=`                      |
| `playlists_user_id_idx`      | playlists | BTREE (`user_id`)              | `GET /playlists`                      |
| `favorites_user_id_idx`      | favorites | BTREE (`user_id`)              | `GET /favorites`                      |

### ⚠️ pg_trgm exige edição manual da migração

O Drizzle Kit **não gera `CREATE EXTENSION`**. Procedimento obrigatório em F2-S01:

1. `pnpm db:generate`
2. Abrir o SQL gerado em `drizzle/0000_*.sql`
3. Inserir **como primeira linha do arquivo**:
   ```sql
   CREATE EXTENSION IF NOT EXISTS pg_trgm;
   ```
4. Acrescentar ao final os três índices GIN:
   ```sql
   CREATE INDEX IF NOT EXISTS "tracks_title_trgm_idx" ON "tracks" USING GIN ("title" gin_trgm_ops);
   CREATE INDEX IF NOT EXISTS "tracks_album_trgm_idx" ON "tracks" USING GIN ("album" gin_trgm_ops);
   CREATE INDEX IF NOT EXISTS "artists_name_trgm_idx" ON "artists" USING GIN ("name" gin_trgm_ops);
   ```
5. Registrar a edição manual em `DECISIONS.md` — futuros `db:generate` **não** vão
   recriar essas linhas, então elas nunca podem ser perdidas em um regenerate.

`pg_trgm` vem no `contrib` da imagem `postgres:17-alpine` e do Testcontainers — não requer
instalação extra, apenas o `CREATE EXTENSION`.

---

## 6. Cliente e pool

`src/db/client.ts`:

```ts
import { drizzle } from 'drizzle-orm/node-postgres';
import pg from 'pg';
import { env } from '../config/env.js';
import * as schema from './schema/index.js';

export const pool = new pg.Pool({ connectionString: env.DATABASE_URL, max: 10 });
export const db = drizzle(pool, { schema });
export type Database = typeof db;
```

- **Uma** instância por processo. `schema` passado no construtor — sem isso `db.query.*`
  (queries relacionais) não existe.
- `pool` exportado porque `server.ts` precisa fechá-lo no shutdown e `/health/ready`
  precisa dele para o `SELECT 1`.
- `src/db/schema/index.ts` é barrel: reexporta as 9 tabelas **e** as `relations` do Drizzle.

### Relations (necessárias para `db.query.*` com `with`)

```
artistsRelations:        many(tracks)
tracksRelations:         one(artists), many(playlistTracks), many(favorites)
playlistsRelations:      one(user), many(playlistTracks)
playlistTracksRelations: one(playlists), one(tracks)
favoritesRelations:      one(user), one(tracks)
```

---

## 7. Transações

`db.transaction()` é **obrigatório** quando há mais de uma mutação interdependente:

| Operação                | Por quê                                                                                           |
| ----------------------- | ------------------------------------------------------------------------------------------------- |
| `DELETE /playlists/:id` | remover itens e a playlist de forma atômica (mesmo com cascade, para deixar a intenção explícita) |
| Seed                    | artistas e faixas em um único bloco — ou entra tudo, ou nada                                      |
| `DELETE /me`            | encerrar sessões e apagar o usuário                                                               |

Leituras e mutações de uma linha só **não** usam transação.

---

## 8. Migrações

| Comando                  | Uso                                                                            |
| ------------------------ | ------------------------------------------------------------------------------ |
| `pnpm db:generate`       | Gera SQL em `drizzle/` a partir de `src/db/schema/*.schema.ts`                 |
| `pnpm db:migrate`        | Aplica localmente (drizzle-kit)                                                |
| `pnpm db:migrate:deploy` | Produção, via `dist/db/migrate.js`                                             |
| `pnpm db:push`           | **Proibido fora de exploração local.** Nunca em PR, nunca em CI, nunca em prod |

**Toda migração gerada é lida antes de ser aplicada.** Se o SQL contiver `DROP TABLE`,
`DROP COLUMN` ou `ALTER COLUMN ... TYPE` inesperado, o agente **para e reporta**.

`src/db/migrate.ts` usa `migrate()` de `drizzle-orm/node-postgres/migrator`, abre um pool
próprio de `max: 1`, aplica e encerra o processo — não reaproveita o pool da aplicação.

---

## 9. Seed — `src/db/seed/seed.ts`

- Dados em `src/db/seed/data/artists.data.ts` e `tracks.data.ts`, tipados com
  `z.infer` ou tipos explícitos (nada de `any`).
- **8 artistas**, **40 faixas** (5 por artista), **6 gêneros** com ≥ 5 faixas cada.
- Idempotência real:
  ```ts
  await tx.insert(artists).values(artistsData).onConflictDoNothing({ target: artists.name });
  await tx
    .insert(tracks)
    .values(rows)
    .onConflictDoNothing({ target: [tracks.artistId, tracks.title] });
  ```
- As faixas referenciam o artista **por nome**: o seed insere os artistas, relê os ids do
  banco e monta as linhas de `tracks`. Nunca gere UUID à mão no arquivo de dados.
- Tudo dentro de um `db.transaction()`.
- Ao final, loga o placar: `{ artistsInserted, tracksInserted, artistsTotal, tracksTotal }`.
- Executado por `tsx src/db/seed/seed.ts` (sem script npm, conforme o scaffold).
