# F2-S04 — Módulo `tracks` com Busca e Filtros

|                |                                                  |
| -------------- | ------------------------------------------------ |
| **Fase**       | F2 — Catálogo · **último sprint da fase**        |
| **Branch**     | `feature/f2s04-modulo-tracks`                    |
| **Depende de** | F2-S02 (e o padrão de F2-S03)                    |
| **Entrega**    | R06 · R07 · R08 · busca `pg_trgm` · tag `v0.2.0` |

---

## 1. Prompt de abertura

```
Leia .agents/memory/PROGRESS.md e .agents/memory/DECISIONS.md para se contextualizar.
Leia também .agents/memory/F2-S03.md — este sprint repete o padrão de módulo dele.

Sprint alvo: docs/sprints/fase-2-catalogo/F2-S04-modulo-tracks.md
Specs obrigatórias: docs/specs/03-contrato-da-api.md (§3, §4),
                    docs/specs/02-modelo-de-dados.md (§5)

Siga o protocolo de docs/specs/07-protocolo-dos-agentes.md:
entre em modo de planejamento, apresente o plano COMPLETO da sprint e
AGUARDE minha autorização explícita antes de escrever qualquer código.

Não toque em nenhum arquivo fora do blast radius declarado no sprint.
```

---

## 2. Objetivo

O módulo central do produto: listagem paginada com busca textual, filtro por gênero e por
artista, ordenação, e a lista de gêneros que alimenta a home do app.

Ao fim, **o app Flutter tem tudo de que precisa para listar, buscar e tocar música** —
sem login. Fecha a fase com a tag `v0.2.0`.

---

## 3. Contratos esperados

### R06 · `GET /api/v1/tracks`

| Query      | Tipo                          | Default  | Regra                                                                       |
| ---------- | ----------------------------- | -------- | --------------------------------------------------------------------------- |
| `page`     | int ≥ 1                       | 1        |                                                                             |
| `limit`    | int 1..100                    | 20       |                                                                             |
| `search`   | string 1..100                 | —        | `ILIKE '%t%'` em `tracks.title` **OR** `tracks.album` **OR** `artists.name` |
| `genre`    | enum de `GENRES`              | —        | valor fora da lista → **400**                                               |
| `artistId` | uuid                          | —        | inválido → 400; inexistente → **lista vazia**, não 404                      |
| `sort`     | `recent`\|`title`\|`duration` | `recent` | `created_at DESC` · `title ASC` · `duration_seconds ASC`                    |

Filtros combinam com `AND`. `200` → `{ data: Track[], meta }`.

### R07 · `GET /api/v1/tracks/:id`

`200` → `Track` · `400` id não-UUID · `404` inexistente.

### R08 · `GET /api/v1/genres`

```json
{ "data": [{ "genre": "electronic", "trackCount": 7 }] }
```

`GROUP BY genre ORDER BY genre ASC`. **Sem paginação e sem `meta`** — lista fechada de 6.

Representação `Track` (com `artist` embutido, sempre): **spec `03` §3**.

### Camadas

```ts
export class TracksRepository {
  constructor(private readonly db: Database) {}
  list(input: {
    limit: number;
    offset: number;
    search?: string;
    genre?: Genre;
    artistId?: string;
    sort: 'recent' | 'title' | 'duration';
  }): Promise<{ rows: TrackRow[]; total: number }>;
  findById(id: string): Promise<TrackRow | null>;
  listGenres(): Promise<{ genre: string; trackCount: number }[]>;
}

export class TracksService {
  constructor(private readonly repo: TracksRepository) {}
  list(query: ListTracksQuery): Promise<{ data: Track[]; meta: PaginationMeta }>;
  getById(id: string): Promise<Track>; // lança NotFoundError
  listGenres(): Promise<{ genre: string; trackCount: number }[]>;
}
```

---

## 4. Blast radius

### Preencher (0 bytes hoje)

```
src/modules/tracks/tracks.schema.ts
src/modules/tracks/tracks.repository.ts
src/modules/tracks/tracks.service.ts
src/modules/tracks/tracks.routes.ts
```

### Criar

```
tests/unit/modules/tracks/tracks.service.test.ts
tests/integration/modules/tracks.repository.test.ts
```

### Editar

```
src/app.ts                      # registrar tracksRoutes
.agents/memory/PROGRESS.md
.agents/memory/F2-S04.md
```

**Não toque em:** `src/modules/artists/**` (pronto) · `src/db/**` · `src/plugins/**`.

---

## 5. Passo a passo

### 5.1 Schema Zod

`genre` é `z.enum(GENRES)` — reusa a constante de `constants.ts` (F1-S03), não redeclara
a lista. `sort` idem, com `.default('recent')`. `artistId` é `z.uuid()`.

O response de `Track` embute `artist` como objeto — **nunca** exponha `artistId` cru
(spec `03` §3).

### 5.2 Repository — a busca

```ts
const conditions: SQL[] = [];
if (input.genre) conditions.push(eq(tracks.genre, input.genre));
if (input.artistId) conditions.push(eq(tracks.artistId, input.artistId));
if (input.search) {
  const term = `%${input.search}%`;
  conditions.push(
    or(ilike(tracks.title, term), ilike(tracks.album, term), ilike(artists.name, term))!,
  );
}
const where = conditions.length ? and(...conditions) : undefined;
```

- **`JOIN artists` é sempre feito** — a busca precisa dele e o DTO embute o artista.
  Um `innerJoin` serve: toda faixa tem artista (FK NOT NULL).
- O `COUNT(*)` usa **o mesmo join e o mesmo `where`**.
- `ilike(tracks.album, term)` sobre coluna nullable: `NULL ILIKE '%x%'` é `NULL`, o
  `OR` continua funcionando. Não precisa de `COALESCE`.
- **Ordenação sempre com desempate por `id`**, senão `page=2` pode repetir ou pular linha:
  ```ts
  orderBy: [desc(tracks.createdAt), asc(tracks.id)];
  ```

### 5.3 Repository — gêneros

```sql
SELECT genre, COUNT(*)::int AS track_count FROM tracks GROUP BY genre ORDER BY genre ASC
```

`COUNT` volta como `string` do `node-postgres` em `bigint`. Faça o cast (`::int`) ou
converta no repository — **não deixe string chegar ao DTO**, o schema Zod vai rejeitar.

### 5.4 Service e rotas

Iguais em forma a F2-S03. Consulte `.agents/memory/F2-S03.md` para copiar o padrão exato.
Três rotas, todas com `tags: ['Catalog']`, `summary`, `operationId` e response schemas.

Registrar em `app.ts` com `{ prefix: API_PREFIX }`.

### 5.5 Verificar que o índice está sendo usado

```sql
EXPLAIN ANALYZE
SELECT * FROM tracks WHERE title ILIKE '%love%';
```

Com 40 linhas o planejador vai preferir _Seq Scan_ mesmo com índice — isso é **normal e
correto**. O que importa é o índice existir e a query estar certa. Cole o `EXPLAIN` no
`F2-S04.md` e registre a observação, para ninguém "consertar" isso depois.

---

## 6. Casos de teste obrigatórios

### Unit — `tracks.service.test.ts`

| #   | Caso                             | Esperado                                                |
| --- | -------------------------------- | ------------------------------------------------------- |
| T1  | `list` monta `meta` corretamente | igual a F2-S03 T1–T3                                    |
| T2  | `sort` default                   | repository recebe `'recent'`                            |
| T3  | `genre` repassado                | repository recebe o valor                               |
| T4  | `artistId` repassado             | idem                                                    |
| T5  | `getById` com `null`             | lança `NotFoundError`                                   |
| T6  | DTO embute `artist` como objeto  | tem `artist.id` e `artist.name`, **não** tem `artistId` |
| T7  | `listGenres` repassa e devolve   | array com `genre` e `trackCount` numérico               |

### Integração — `tracks.repository.test.ts` (harness + seed)

| #   | Caso                                     | Esperado                                         |
| --- | ---------------------------------------- | ------------------------------------------------ |
| T8  | `list` sem filtro                        | `total === 40`                                   |
| T9  | `limit: 20, offset: 20`                  | `rows.length === 20`, sem repetir id da página 1 |
| T10 | `genre: 'rock'`                          | só faixas de rock, `total` bate com o seed       |
| T11 | `genre` + `search` combinados            | `AND`, não `OR`                                  |
| T12 | `search` por trecho do título, minúsculo | casa título com maiúscula                        |
| T13 | `search` por **nome do artista**         | devolve as faixas dele                           |
| T14 | `search` por trecho do **álbum**         | devolve as faixas do álbum                       |
| T15 | `search` sem correspondência             | `rows: []`, `total: 0`                           |
| T16 | `artistId` inexistente (uuid válido)     | `rows: []`, `total: 0` — **não** lança           |
| T17 | `sort: 'title'`                          | ordem alfabética ascendente                      |
| T18 | `sort: 'duration'`                       | ordem crescente de `durationSeconds`             |
| T19 | Paginar as 40 faixas em 2 páginas de 20  | união = 40 ids distintos                         |
| T20 | `findById` de id inexistente             | `null`                                           |
| T21 | `findById` traz `artist`                 | join presente                                    |
| T22 | `listGenres`                             | 6 entradas, `trackCount` numérico, cada uma ≥ 5  |

---

## 7. Definition of Done

```bash
docker compose up -d && pnpm db:migrate && tsx src/db/seed/seed.ts
pnpm typecheck && pnpm lint && pnpm format && pnpm test && pnpm build
pnpm dev
curl -s 'localhost:3000/api/v1/tracks?limit=2' | jq '.data[0], .meta'
curl -s 'localhost:3000/api/v1/tracks?genre=rock&limit=100' | jq '.meta.total'
curl -s 'localhost:3000/api/v1/tracks?search=lo' | jq '.meta.total'
curl -s 'localhost:3000/api/v1/tracks?sort=duration&limit=3' | jq '.data[].durationSeconds'
curl -s localhost:3000/api/v1/genres | jq
curl -s -o /dev/null -w '%{http_code}\n' 'localhost:3000/api/v1/tracks?genre=funk'   # 400
curl -s -o /dev/null -w '%{http_code}\n' 'localhost:3000/api/v1/tracks?limit=101'    # 400
```

- [ ] T1–T22 verdes
- [ ] `audioUrl` presente e tocável em todo item de `data` (abra um no player)
- [ ] `artist` embutido; `artistId` **ausente** da resposta
- [ ] `genre=funk` → 400 · `limit=101` → 400 · `limit=100` → 200
- [ ] `EXPLAIN ANALYZE` registrado no `F2-S04.md`
- [ ] `/docs` com as 3 rotas documentadas
- [ ] PR verde; `release/v0.2.0` preparada e PR para `main` aberto
- [ ] Memória atualizada

---

## 8. Armadilhas conhecidas

1. **Paginação sem desempate estável** faz linhas repetirem ou sumirem entre páginas.
   Sempre `orderBy: [<critério>, asc(tracks.id)]`.
2. **`COUNT(*)` do `node-postgres` volta como string.** Sem cast, o Zod do response
   rejeita com erro de tipo — e o erro aparece como 500, não como validação.
3. **`or(...)` do Drizzle pode retornar `undefined`** se receber lista vazia. Garanta que
   `search` está definido antes de montar o `or`, e trate o tipo.
4. **`innerJoin` com `db.select()` devolve linha achatada** em `{ tracks: {...}, artists: {...} }`.
   Mapeie explicitamente no service. Alternativa: `db.query.tracks.findMany({ with: { artist: true } })`,
   que já aninha — mas aí a busca por `artists.name` fica mais difícil. **Escolha uma
   abordagem e registre no `F2-S04.md`.**
5. **`z.enum(GENRES)` exige `GENRES` como `readonly [string, ...string[]]`.** O
   `as const` em `constants.ts` (F1-S03) garante isso.
6. **`ilike` em coluna nullable não quebra**, mas `COALESCE(album,'')` mudaria a semântica.
   Não adicione.
7. **Não implemente `/tracks/:id/stream`.** Está explicitamente fora de escopo (D-10).

---

## 9. Registro na memória

- **`DECISIONS.md`** — a abordagem de join escolhida (armadilha 4), se você julgar que
  F4-S01 e F4-S02 devem seguir a mesma.
- **`PROGRESS.md`** — F2-S04 ✅, **fase F2 concluída**, tag `v0.2.0`, R06/R07/R08 nos
  contratos entregues, próximo = F3-S01.
- **`F2-S04.md`** — a montagem do `where` com filtros combinados e o `EXPLAIN ANALYZE`.
