# F2-S01 — Schema Drizzle e Migração Inicial

|                |                                                                  |
| -------------- | ---------------------------------------------------------------- |
| **Fase**       | F2 — Catálogo                                                    |
| **Branch**     | `feature/f2s01-schema-e-migrations`                              |
| **Depende de** | F1-S06                                                           |
| **Entrega**    | 9 tabelas, `pg_trgm`, índices e o runner de migração de produção |

---

## 1. Prompt de abertura

```
Leia .agents/memory/PROGRESS.md e .agents/memory/DECISIONS.md para se contextualizar.

Sprint alvo: docs/sprints/fase-2-catalogo/F2-S01-schema-e-migrations.md
Specs obrigatórias: docs/specs/02-modelo-de-dados.md (INTEIRA)

Siga o protocolo de docs/specs/07-protocolo-dos-agentes.md:
entre em modo de planejamento, apresente o plano COMPLETO da sprint e
AGUARDE minha autorização explícita antes de escrever qualquer código.

Não toque em nenhum arquivo fora do blast radius declarado no sprint.
```

---

## 2. Objetivo

Materializar **todo** o modelo de dados em uma **única migração inicial**: as 4 tabelas do
Better Auth e as 5 de domínio, com FKs, PKs compostas, uniques e os índices — incluindo os
três GIN de `pg_trgm`, que exigem edição manual do SQL gerado.

Tudo de uma vez porque `playlists.user_id` e `favorites.user_id` referenciam `user.id`:
gerar em duas rodadas criaria um problema de ordenação de FK sem nenhum ganho.

**A spec `02` é a fonte normativa completa.** Este sprint não decide nada de modelagem —
só implementa.

---

## 3. Contratos esperados

| Tabela                                       | Arquivo                     | PK                                 |
| -------------------------------------------- | --------------------------- | ---------------------------------- |
| `user`, `session`, `account`, `verification` | `users.schema.ts`           | `text('id')`                       |
| `artists`                                    | `artists.schema.ts`         | `uuid` + `defaultRandom()`         |
| `tracks`                                     | `tracks.schema.ts`          | `uuid` + `defaultRandom()`         |
| `playlists`                                  | `playlists.schema.ts`       | `uuid` + `defaultRandom()`         |
| `playlist_tracks`                            | `playlist-tracks.schema.ts` | composta `(playlist_id, track_id)` |
| `favorites`                                  | `favorites.schema.ts`       | composta `(user_id, track_id)`     |

Colunas, tipos, nullability, `onDelete`, uniques e os 9 índices: **spec `02` §3, §4, §5**.

`src/db/schema/index.ts` passa de barrel vazio a barrel real: reexporta as 9 tabelas
**e as 5 `relations`** (spec `02` §6).

`src/db/migrate.ts`: `migrate()` de `drizzle-orm/node-postgres/migrator`, pool próprio
`max: 1`, aplica, fecha, encerra. Não reaproveita o pool da aplicação.

---

## 4. Blast radius

### Preencher (0 bytes hoje)

```
drizzle.config.ts
src/db/schema/users.schema.ts
src/db/schema/artists.schema.ts
src/db/schema/tracks.schema.ts
src/db/schema/playlists.schema.ts
src/db/schema/playlist-tracks.schema.ts
src/db/schema/favorites.schema.ts
src/db/migrate.ts
```

### Editar

```
src/db/schema/index.ts          # barrel vazio (F1-S06) → barrel real
.agents/memory/DECISIONS.md
.agents/memory/PROGRESS.md
.agents/memory/F2-S01.md
```

### Gerado (commitado)

```
drizzle/0000_*.sql
drizzle/meta/*
```

**Não toque em:** `src/db/client.ts` (pronto em F1-S06) · `src/db/seed/**` (F2-S02) ·
`src/modules/**` · `tests/**`.

---

## 5. Passo a passo

### 5.1 `drizzle.config.ts`

```ts
export default defineConfig({
  dialect: 'postgresql',
  schema: './src/db/schema/*.schema.ts',
  out: './drizzle',
  dbCredentials: { url: env.DATABASE_URL },
  verbose: true,
  strict: true,
});
```

> `strict: true` faz o drizzle-kit pedir confirmação antes de operação destrutiva.
> Mantenha ligado.

### 5.2 Tabelas do Better Auth — **valide, não invente**

Antes de escrever `users.schema.ts` à mão:

```bash
pnpm dlx @better-auth/cli@latest generate --config src/modules/auth/auth.config.ts
```

`auth.config.ts` ainda não existe (é F3-S01). Então:

1. Escreva `users.schema.ts` conforme a **spec `02` §3**.
2. Consulte a documentação da versão instalada via **context7** (`better-auth` core schema)
   e confirme coluna a coluna.
3. Registre no `F2-S01.md` a versão exata do `better-auth` conferida.

Se F3-S01 descobrir divergência, será uma migração corretiva — e uma entrada em
`DECISIONS.md`. Melhor conferir agora.

### 5.3 Tabelas de domínio

Spec `02` §4, literalmente. Os três pontos que mais quebram:

```ts
// playlists.schema.ts e favorites.schema.ts
userId: text('user_id').notNull().references(() => user.id, { onDelete: 'cascade' })
//      ^^^^ TEXT, não uuid. Ver spec 02 §2.

// artists.schema.ts — o unique é alvo do ON CONFLICT do seed
name: varchar('name', { length: 255 }).notNull().unique()

// tracks.schema.ts — unique composto, declarado no 2º argumento da pgTable
(table) => [ unique('tracks_artist_title_unique').on(table.artistId, table.title) ]
```

> Drizzle 0.45 aceita o segundo argumento de `pgTable` como **array** (forma nova) ou
> objeto (forma antiga, deprecada). Use array e mantenha consistência nos 6 arquivos.

### 5.4 Gerar e **editar** a migração — passo crítico

```bash
pnpm db:generate
```

Abra `drizzle/0000_*.sql` e faça as duas edições da **spec `02` §5**:

1. **Primeira linha do arquivo:**
   ```sql
   CREATE EXTENSION IF NOT EXISTS pg_trgm;
   ```
2. **Ao final:** os três `CREATE INDEX ... USING GIN (... gin_trgm_ops)`.

O Drizzle Kit não gera nem um nem outro. **Essas linhas são permanentes** — um
`db:generate` futuro não vai recriá-las. Registre em `DECISIONS.md`.

### 5.5 Aplicar e conferir

```bash
docker compose up -d
pnpm db:migrate
docker compose exec postgres psql -U cardoso -d cardoso_sound -c '\dt'
docker compose exec postgres psql -U cardoso -d cardoso_sound -c '\di'
docker compose exec postgres psql -U cardoso -d cardoso_sound \
  -c "select extname from pg_extension where extname='pg_trgm'"
```

### 5.6 `migrate.ts`

Runner de produção. Loga início e fim, aplica, fecha o pool, `process.exit(0)` no sucesso
e `exit(1)` com log no erro. Compilado para `dist/db/migrate.js` pelo tsup (F1-S02).

---

## 6. Casos de teste obrigatórios

Não há Vitest neste sprint — a suíte de integração é **F2-S02**. As provas são via `psql`:

| #   | Verificação                  | Comando                                                                                                                    |
| --- | ---------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| T1  | 9 tabelas existem            | `\dt` lista `user`, `session`, `account`, `verification`, `artists`, `tracks`, `playlists`, `playlist_tracks`, `favorites` |
| T2  | Extensão instalada           | query da §5.5 devolve `pg_trgm`                                                                                            |
| T3  | 3 índices GIN existem        | `\di` mostra `tracks_title_trgm_idx`, `tracks_album_trgm_idx`, `artists_name_trgm_idx`                                     |
| T4  | `playlists.user_id` é `text` | `\d playlists` mostra `text`, não `uuid`                                                                                   |
| T5  | PK composta em `favorites`   | `\d favorites` mostra `PRIMARY KEY (user_id, track_id)`                                                                    |
| T6  | Cascade declarado            | `\d tracks` mostra `ON DELETE CASCADE` na FK de `artist_id`                                                                |
| T7  | Unique de `artists.name`     | `\d artists` mostra o unique                                                                                               |
| T8  | Unique `(artist_id, title)`  | `\d tracks` mostra `tracks_artist_title_unique`                                                                            |
| T9  | Migração é idempotente       | rodar `pnpm db:migrate` de novo não altera nada                                                                            |
| T10 | Base limpa aplica do zero    | `docker compose down -v && up -d && pnpm db:migrate` funciona                                                              |

**Cole a saída de `\d` das 5 tabelas de domínio no `F2-S01.md`.** É a referência que
F2-S03, F2-S04, F4-S01 e F4-S02 vão consultar.

---

## 7. Definition of Done

```bash
docker compose down -v && docker compose up -d && sleep 5
pnpm db:generate      # sem novas mudanças pendentes
pnpm db:migrate
pnpm typecheck && pnpm lint && pnpm format && pnpm test && pnpm build
```

- [ ] T1–T10 verificados
- [ ] `drizzle/0000_*.sql` **commitado**, com `CREATE EXTENSION` e os 3 GIN
- [ ] `db:generate` rodado de novo não gera migração nova (schema e SQL em sincronia)
- [ ] Barrel `index.ts` exporta 9 tabelas + 5 relations
- [ ] `db.query.tracks.findMany({ with: { artist: true } })` **typecheca** (não precisa rodar)
- [ ] Nenhum `db:push` foi usado
- [ ] `DECISIONS.md` registra a edição manual da migração
- [ ] PR verde; memória atualizada

---

## 8. Armadilhas conhecidas

1. **`uuid('user_id')` referenciando `user.id` (text)** falha com
   _"foreign key constraint cannot be implemented — key columns have incompatible types"_.
   É o erro nº 1 deste projeto. Spec `02` §2.
2. **A tabela do Better Auth chama-se `user`, no singular** — e `user` é palavra reservada
   no Postgres. O Drizzle escapa com aspas automaticamente; **você**, ao escrever SQL à
   mão em teste ou psql, precisa de `"user"`.
3. **`pnpm db:push` destrói dados** e pula a migração versionada. Proibido (spec `02` §8).
4. **Editar a migração e depois rodar `db:generate`** não reintroduz as linhas manuais —
   elas existem só no arquivo `0000`. Se alguém regenerar do zero, perde. Daí o registro
   em `DECISIONS.md`.
5. **`relations()` não gera SQL.** É só para `db.query.*`. Esquecer não quebra a migração,
   quebra o F2-S03 com "relation not found" em runtime.
6. **`.unique()` inline vs `unique()` no array** produzem nomes de constraint diferentes.
   Use o nome explícito (`tracks_artist_title_unique`) para o `onConflictDoNothing` de
   F2-S02 poder mirar nele.
7. **Timestamps sem timezone.** `timestamp('created_at')` gera `timestamp without time zone`.
   É o suficiente para o MVP; se quiser `timestamptz`, é `{ withTimezone: true }` — mas
   isso seria uma decisão nova, não faça sozinho.

---

## 9. Registro na memória

- **`DECISIONS.md`** — **obrigatório**: edição manual do `0000_*.sql` para `pg_trgm` e
  índices GIN, e a versão do `better-auth` cujo schema foi conferido.
- **`PROGRESS.md`** — F2-S01 ✅, próximo = F2-S02.
- **`F2-S01.md`** — a saída de `\d` das tabelas de domínio e o SQL das linhas manuais.
