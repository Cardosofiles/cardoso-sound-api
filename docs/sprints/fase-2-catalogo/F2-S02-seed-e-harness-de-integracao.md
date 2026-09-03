# F2-S02 — Seed do Catálogo e Harness de Integração

|                |                                                                              |
| -------------- | ---------------------------------------------------------------------------- |
| **Fase**       | F2 — Catálogo                                                                |
| **Branch**     | `feature/f2s02-seed-e-harness-de-integracao`                                 |
| **Depende de** | F2-S01                                                                       |
| **Entrega**    | 8 artistas + 40 faixas idempotentes, e o harness Testcontainers reutilizável |

---

## 1. Prompt de abertura

```
Leia .agents/memory/PROGRESS.md e .agents/memory/DECISIONS.md para se contextualizar.

Sprint alvo: docs/sprints/fase-2-catalogo/F2-S02-seed-e-harness-de-integracao.md
Specs obrigatórias: docs/specs/02-modelo-de-dados.md (§9),
                    docs/specs/05-testes-e-qualidade.md (§3),
                    docs/specs/00-visao-geral.md (§6)

Siga o protocolo de docs/specs/07-protocolo-dos-agentes.md:
entre em modo de planejamento, apresente o plano COMPLETO da sprint e
AGUARDE minha autorização explícita antes de escrever qualquer código.

Não toque em nenhum arquivo fora do blast radius declarado no sprint.
```

---

## 2. Objetivo

Duas entregas que se provam mutuamente:

1. **O seed** — 8 artistas, 40 faixas, 6 gêneros, idempotente (D-28).
2. **O harness de integração** — `startTestDatabase()`, que sobe Postgres 17 efêmero,
   aplica as migrações e devolve um `db` tipado. **Todo sprint seguinte depende dele.**

O seed é o melhor primeiro cliente do harness: testar que ele é idempotente exige um banco
real com as constraints reais.

---

## 3. Contratos esperados

### `tests/setup/testcontainers.ts`

```ts
export interface TestDatabase {
  db: Database;
  pool: pg.Pool;
  connectionString: string;
  stop: () => Promise<void>;
}
export async function startTestDatabase(): Promise<TestDatabase>;
export async function truncateAll(db: Database): Promise<void>;
```

Comportamento normativo: **spec `05` §3**. Imagem `postgres:17-alpine`, migrações de
`drizzle/` aplicadas com `migrate()`, `truncateAll` fazendo
`TRUNCATE ... RESTART IDENTITY CASCADE` nas 9 tabelas.

### `src/db/seed/data/artists.data.ts`

```ts
export interface SeedArtist {
  name: string;
  bio: string;
  avatarUrl: string;
}
export const SEED_ARTISTS: readonly SeedArtist[]; // exatamente 8
```

### `src/db/seed/data/tracks.data.ts`

```ts
export interface SeedTrack {
  artistName: string; // referência POR NOME — nunca UUID literal
  title: string;
  album: string;
  genre: Genre; // do constants.ts
  durationSeconds: number;
  coverUrl: string;
  audioUrl: string;
}
export const SEED_TRACKS: readonly SeedTrack[]; // exatamente 40
```

### `src/db/seed/seed.ts`

```ts
export async function seed(database: Database): Promise<{
  artistsInserted: number;
  tracksInserted: number;
  artistsTotal: number;
  tracksTotal: number;
}>;
```

Exportar a função **e** executar quando chamado direto por `tsx`. Assim o teste chama
`seed(ctx.db)` sem side effect de processo.

---

## 4. Blast radius

### Criar

```
tests/integration/seed.test.ts
tests/integration/schema.test.ts
```

### Preencher (0 bytes hoje)

```
tests/setup/testcontainers.ts
src/db/seed/seed.ts
src/db/seed/data/artists.data.ts
src/db/seed/data/tracks.data.ts
```

### Editar

```
tests/integration/health.test.ts      # migrar para o harness (era container inline em F1-S06)
.agents/memory/PROGRESS.md
.agents/memory/F2-S02.md
```

**Não toque em:** `src/db/schema/**` e `drizzle/**` (prontos em F2-S01) ·
`src/modules/**` · `src/db/client.ts`.

---

## 5. Passo a passo

### 5.1 Harness

```ts
const container = await new PostgreSqlContainer('postgres:17-alpine').start();
const pool = new pg.Pool({ connectionString: container.getConnectionUri(), max: 5 });
const db = drizzle(pool, { schema });
await migrate(db, { migrationsFolder: './drizzle' });
```

- `migrationsFolder: './drizzle'` — caminho relativo à **raiz do projeto**, que é o cwd
  do Vitest. Não use `import.meta.url` aqui.
- `stop()` encerra o pool **antes** de derrubar o container, senão o teste pendura.
- `truncateAll` monta um único `TRUNCATE "user", session, account, verification, artists,
tracks, playlists, playlist_tracks, favorites RESTART IDENTITY CASCADE`. Note as
  **aspas em `"user"`** (palavra reservada).
- A extensão `pg_trgm` vem junto porque está na migração `0000` (F2-S01). Se o teste de
  busca falhar em F2-S04 com "operator class does not exist", a causa é aqui.

### 5.2 Dados do catálogo

**8 artistas** fictícios, com nome, `bio` (1–2 frases) e `avatarUrl` plausível.
Não use nome de artista real.

**40 faixas**, 5 por artista, com:

| Campo             | Regra                                                                        |
| ----------------- | ---------------------------------------------------------------------------- |
| `title`           | único **dentro do artista** (é o unique composto)                            |
| `album`           | 2 álbuns por artista, ~2–3 faixas cada                                       |
| `genre`           | um dos 6 de `GENRES`; **cada gênero com ≥ 5 faixas**                         |
| `durationSeconds` | 120–380, plausível e variado                                                 |
| `coverUrl`        | URL estável de placeholder                                                   |
| `audioUrl`        | `https://www.soundhelix.com/examples/mp3/SoundHelix-Song-N.mp3`, N de 1 a 16 |

> O SoundHelix só tem ~16 áudios: com 40 faixas o áudio **repete**, e isso é esperado
> (D-28). O que não pode repetir é o par (artista, título).

Distribuição alvo dos gêneros: `rock` 8 · `pop` 7 · `electronic` 7 · `hip-hop` 6 ·
`jazz` 6 · `lo-fi` 6 = 40.

### 5.3 `seed.ts`

```ts
export async function seed(database: Database) {
  return database.transaction(async (tx) => {
    const insertedArtists = await tx
      .insert(artists)
      .values([...SEED_ARTISTS])
      .onConflictDoNothing({ target: artists.name })
      .returning({ id: artists.id, name: artists.name });

    // relê TODOS os artistas: numa 2ª execução, insertedArtists vem vazio
    const all = await tx.select({ id: artists.id, name: artists.name }).from(artists);
    const idByName = new Map(all.map((a) => [a.name, a.id]));

    const rows = SEED_TRACKS.map((t) => ({/* … artistId: idByName.get(t.artistName)! … */}));
    const insertedTracks = await tx
      .insert(tracks)
      .values(rows)
      .onConflictDoNothing({ target: [tracks.artistId, tracks.title] })
      .returning({ id: tracks.id });
    // …
  });
}
```

**A releitura dos artistas é o coração da idempotência.** Na segunda execução o
`onConflictDoNothing` não devolve nada, e sem o `SELECT` posterior o mapa fica vazio e as
faixas ficariam com `artistId` indefinido.

Se algum `idByName.get(...)` for `undefined`, **lance** com o nome do artista na mensagem —
é erro de dados, não deve passar silenciosamente.

Ao final, `console.log` **é permitido aqui** (é script CLI, não `src` de runtime — confirme
o override do ESLint; se o lint reclamar, use `process.stdout.write`).

### 5.4 Executar

```bash
tsx src/db/seed/seed.ts
tsx src/db/seed/seed.ts     # segunda vez: 0 inseridos, 0 erros
```

---

## 6. Casos de teste obrigatórios

### `tests/integration/schema.test.ts` — prova as constraints

| #   | Caso                                                   | Esperado                                   |
| --- | ------------------------------------------------------ | ------------------------------------------ |
| T1  | Inserir 2 artistas com o mesmo `name`                  | violação de unique                         |
| T2  | 2 faixas com mesmo `(artist_id, title)`                | violação de unique                         |
| T3  | 2 faixas com mesmo título e artistas diferentes        | **ok**                                     |
| T4  | Apagar artista                                         | faixas dele somem (cascade)                |
| T5  | Apagar `"user"`                                        | playlists e favorites dele somem (cascade) |
| T6  | Apagar playlist                                        | linhas de `playlist_tracks` somem          |
| T7  | Duplicar `(playlist_id, track_id)`                     | violação de PK composta                    |
| T8  | Duplicar `(user_id, track_id)` em favorites            | violação de PK composta                    |
| T9  | `track.genre` NOT NULL                                 | insert sem genre falha                     |
| T10 | `db.query.tracks.findMany({ with: { artist: true } })` | devolve o artista aninhado                 |

### `tests/integration/seed.test.ts` — prova a idempotência

| #   | Caso                                                               | Esperado                                               |
| --- | ------------------------------------------------------------------ | ------------------------------------------------------ |
| T11 | `seed()` em base limpa                                             | `artistsInserted: 8`, `tracksInserted: 40`             |
| T12 | `seed()` uma 2ª vez                                                | `artistsInserted: 0`, `tracksInserted: 0`, sem exceção |
| T13 | Totais após 2 execuções                                            | `artistsTotal: 8`, `tracksTotal: 40`                   |
| T14 | Toda faixa tem `artistId` válido                                   | join não devolve nulo                                  |
| T15 | Cada um dos 6 gêneros                                              | `count >= 5`                                           |
| T16 | Todo `audioUrl` casa `soundhelix.com/.../SoundHelix-Song-\d+\.mp3` | regex                                                  |
| T17 | Toda `durationSeconds`                                             | `> 0`                                                  |
| T18 | Nenhum par `(artistName, title)` duplicado em `SEED_TRACKS`        | verificação em memória, sem banco                      |

---

## 7. Definition of Done

```bash
pnpm typecheck && pnpm lint && pnpm format
pnpm test                                   # unit + integração
pnpm build
docker compose up -d && pnpm db:migrate
tsx src/db/seed/seed.ts && tsx src/db/seed/seed.ts
```

- [ ] T1–T18 verdes
- [ ] Segunda execução do seed: `0 inseridos`, sem erro
- [ ] `tests/integration/health.test.ts` migrado para o harness
- [ ] Suíte de integração completa em menos de 90 s (registre o tempo real)
- [ ] `SEED_ARTISTS.length === 8` e `SEED_TRACKS.length === 40`, verificados em teste
- [ ] Nenhum UUID literal nos arquivos `.data.ts`
- [ ] PR verde no CI (Testcontainers roda no runner); memória atualizada

---

## 8. Armadilhas conhecidas

1. **Primeira execução do Testcontainers baixa a imagem** e pode levar > 60 s. O
   `hookTimeout: 120_000` de F1-S02 cobre isso. No CI o pull também acontece — se o job
   estourar 15 min, é sinal de outro problema.
2. **`TRUNCATE user` sem aspas é erro de sintaxe.** Sempre `"user"`.
3. **`onConflictDoNothing().returning()` devolve só as linhas inseridas.** Contar o
   `returning` como "total" é o bug clássico de seed idempotente — daí a releitura.
4. **Container não parado pendura a suíte.** `afterAll` sempre chama `stop()`, mesmo se
   o teste falhou. Use `try/finally` se necessário.
5. **`singleFork: true`** (F1-S02) é o que impede N containers simultâneos. Se alguém
   remover, a suíte fica lenta e instável.
6. **`migrationsFolder` relativo ao cwd.** Rodar o Vitest de dentro de `tests/` quebra.
   Sempre da raiz.
7. **Docker precisa estar rodando.** Se `docker info` falhar, os testes de integração
   falham com mensagem obscura de socket. Verifique antes e reporte com clareza.

---

## 9. Registro na memória

- **`DECISIONS.md`** — só se a distribuição de gêneros ou o volume mudar do acordado.
- **`PROGRESS.md`** — F2-S02 ✅, próximo = F2-S03 (ou F2-S04, são independentes).
- **`F2-S02.md`** — a assinatura de `startTestDatabase` e `truncateAll`, a lista dos 8
  artistas com a contagem por gênero, e o tempo da suíte de integração. **Os quatro
  sprints seguintes vão consultar este arquivo.**
