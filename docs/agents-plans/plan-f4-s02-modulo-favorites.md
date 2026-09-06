# Plano de Implementação — Sprint F4-S02: Módulo `favorites`

> **Status:** 🟡 Em Planejamento (Aguardando Autorização Explícita — Parada 1 / Etapa 3 do Protocolo)  
> **Fase:** F4 — Biblioteca · **Segundo sprint da fase F4**  
> **Branch Alvo:** `feature/f4s02-modulo-favorites` (a partir de `develop`)  
> **Depende de:** F3-S02 (padrão canônico de autenticação e decorator `request.user`), F2-S04 (join relacional com catálogo de faixas) e F4-S01 (padrão de isolamento por `userId` no WHERE e mitigação de corrida)  
> **Contratos de Entrega:** R23 (`GET /api/v1/favorites`), R24 (`POST /api/v1/favorites/:trackId`), R25 (`DELETE /api/v1/favorites/:trackId`)  
> **Specs de Referência:**
>
> - [`docs/specs/03-contrato-da-api.md`](../specs/03-contrato-da-api.md) (§3 — Representação `FavoriteItem`, §8 — Favoritos R23–R25)
> - [`docs/specs/04-autenticacao-e-seguranca.md`](../specs/04-autenticacao-e-seguranca.md) (§3 — Guard de rotas `requireAuth`, decorators de sessão)
> - [`docs/specs/02-modelo-de-dados.md`](../specs/02-modelo-de-dados.md) (§4 — Tabela associativa `favorites`, PK composta, cascade)
> - [`docs/specs/07-protocolo-dos-agentes.md`](../specs/07-protocolo-dos-agentes.md) (Protocolo de 7 etapas e paradas mandatórias)
> - [`docs/sprints/fase-4-biblioteca/F4-S02-modulo-favorites.md`](../sprints/fase-4-biblioteca/F4-S02-modulo-favorites.md) (Brief canônico da sprint)
> - [`.agents/memory/DECISIONS.md`](../../.agents/memory/DECISIONS.md) (**D-01**, **D-06**, **D-07**, **D-13**, **D-14**, **D-16**, **D-19**, **D-22**, **D-23**, **D-24**, **D-25**, **D-27**, **D-31**, **D-34**, **D-35**, **D-36**, **D-40**, **D-41**, **D-42**, **D-47**)
> - [`.agents/memory/F4-S01.md`](../../.agents/memory/F4-S01.md) (Padrão de autocontenção de repositórios, tratamento de concorrência com `onConflictDoNothing` e isolamento estrito no `WHERE`)

---

## 1. Contexto e Objetivos Técnicos

O sprint **F4-S02** entrega o módulo de **favoritos** da API Cardoso Sound, compreendendo as rotas R23 a R25. O recurso permite aos usuários autenticados favoritar exclusivamente faixas do catálogo (não há favoritos de artistas nem playlists conforme Spec 00 §3), listar suas faixas favoritas de forma paginada e desfavoritá-las.

O módulo opera sobre a tabela relacional `favorites`, modelada em `src/db/schema/favorites.schema.ts` com chave primária composta `(user_id, track_id)`, garantindo integridade referencial com expurgo em cascata tanto na exclusão do usuário quanto na remoção da faixa do catálogo.

### Invariantes Arquiteturais e Regras Inegociáveis

1. **Favoritos Estritamente para Faixas (Spec 00 §3 e Sprint §2):**
   - Não existe favoritar artista nem playlist. Qualquer tentativa de estender o escopo viola o design fechado do MVP.
2. **Representação Completa `FavoriteItem` (Spec 03 §3 e Sprint §3):**
   - `FavoriteItem` é composto pela entidade `Track` integral (com `artist` embutido como `ArtistSummary`) acrescida da propriedade `favoritedAt` (ISO 8601 UTC).
   - O `POST /favorites/:trackId` responde `201 Created` com o `FavoriteItem` completo, nunca um simples `{ ok: true }` (Armadilha 5).
3. **Isolamento Estrito no WHERE (Decisão D-31 e Sprint §5.3):**
   - No `DELETE /favorites/:trackId`, a query deve compulsoriamente conter `and(eq(favorites.userId, userId), eq(favorites.trackId, trackId))`.
   - Se o vínculo não existir para aquele usuário, responde **HTTP 404 Not Found**, nunca 403. Um usuário jamais consegue remover o favorito de outro (Armadilha 1 / Caso T18).
4. **Ordenação Cronológica com Desempate Determinístico (Sprint §5.1 / Armadilha 3 e 4):**
   - Ordenado por `favorites.created_at DESC` (representado no DTO como `favoritedAt`), com desempate por `tracks.id ASC`.
   - `favoritedAt` reflete a data em que a faixa foi favoritada (`favorites.created_at`), e não a data de criação da faixa (`tracks.created_at`).
5. **Autocontenção de Repositório (Decisão D-47):**
   - `FavoritesRepository` implementa `trackExists(trackId)` diretamente contra a tabela `tracks`, mantendo o módulo desacoplado e respeitando a regra do ESLint boundaries onde repositórios não importam outros repositórios.
6. **Ordem de Execução e Dupla Mitigação de Corrida no `POST` (Sprint §5.2 e Decisão D-47):**
   - Ordem estrita:
     1. A faixa existe no catálogo? Caso negativo -> `404 Not Found` (`NotFoundError`).
     2. A faixa já está favoritada pelo usuário? Caso afirmativo -> `409 Conflict` (`ConflictError`).
     3. Inserção via `.onConflictDoNothing().returning()`. Se retornar vazio decorrente de corrida concorrente simultânea -> `409 Conflict` (`ConflictError`), prevenindo erro `23505` não tratado no PostgreSQL que viraria 500 (Armadilha 2).
     4. Retorna `FavoriteItem` com status `201 Created`.
7. **Nenhuma Rota Emite 403 (Decisão D-31):**
   - Nenhuma rota emite `403 Forbidden`. Recurso alheio e recurso inexistente são rigorosamente indistinguíveis (HTTP 404).

---

## 2. Blast Radius Fechado

Conforme especificado em `docs/sprints/fase-4-biblioteca/F4-S02-modulo-favorites.md` §4:

```
blast-radius/
├── Preencher (arquivos atualmente com 0 bytes):
│   ├── src/modules/favorites/favorites.schema.ts
│   ├── src/modules/favorites/favorites.repository.ts
│   ├── src/modules/favorites/favorites.service.ts
│   └── src/modules/favorites/favorites.routes.ts
│
├── Criar (novas suítes e documentação do plano):
│   ├── tests/unit/modules/favorites/favorites.service.test.ts
│   ├── tests/integration/modules/favorites.repository.test.ts
│   └── docs/agents-plans/plan-f4-s02-modulo-favorites.md
│
├── Editar (registro do plugin e atualização de memória):
│   ├── src/app.ts                                    (registro de favoritesRoutes sob API_PREFIX)
│   ├── .agents/memory/PROGRESS.md                    (avanço do status para F4-S03)
│   └── .agents/memory/F4-S02.md                      (memória técnica canônica da sprint)
│
└── Fora do Escopo (Terminantemente Proibido Tocar):
    ├── src/modules/playlists/**                      (módulo F4-S01 entregue e selado)
    ├── src/modules/tracks/** e src/modules/artists/** (catálogo público)
    ├── src/modules/users/** e src/modules/auth/**     (identidade e autenticação)
    ├── src/db/** e drizzle/**                        (schema favorites já modelado)
    └── src/config/** e src/shared/**                 (constantes e utilitários consolidados)
```

---

## 3. Especificação Detalhada dos Contratos e Camadas

### 3.1 Schemas Zod (`src/modules/favorites/favorites.schema.ts`)

- **Constantes locais:**
  - `GENRES`: reuso do array de tuplas `['rock', 'pop', 'electronic', 'hip-hop', 'jazz', 'lo-fi'] as const`.
- **Entrada:**
  - `favoriteTrackParamsSchema`: `{ trackId: z.uuid() }`
  - `listFavoritesQuerySchema`:
    - `page`: `z.coerce.number().int().min(1).default(1)`
    - `limit`: `z.coerce.number().int().min(1).max(100).default(20)`
- **Saída:**
  - `artistSummarySchema`: `{ id: z.uuid(), name: z.string(), avatarUrl: z.string().nullable() }`
  - `favoriteItemSchema`:
    - `id: z.uuid()`
    - `title: z.string()`
    - `album: z.string().nullable()`
    - `genre: z.enum(GENRES)`
    - `durationSeconds: z.number().int().positive()`
    - `coverUrl: z.string().nullable()`
    - `audioUrl: z.url()`
    - `artist: artistSummarySchema`
    - `createdAt: z.iso.datetime()` (data de criação da faixa)
    - `favoritedAt: z.iso.datetime()` (data da inclusão em favoritos)
  - `paginationMetaSchema`: `{ page, limit, total, totalPages, hasNext, hasPrev }`
  - `listFavoritesResponseSchema`: `{ data: z.array(favoriteItemSchema), meta: paginationMetaSchema }`
  - `errorResponseSchema`: `{ statusCode: z.number().int(), error: z.string(), message: z.string(), details: z.unknown().nullable() }`

### 3.2 Repositório (`src/modules/favorites/favorites.repository.ts`)

```typescript
export interface FavoriteRow {
  id: string;
  title: string;
  album: string | null;
  genre: string;
  durationSeconds: number;
  coverUrl: string | null;
  audioUrl: string;
  createdAt: Date;
  favoritedAt: Date;
  artist: {
    id: string;
    name: string;
    avatarUrl: string | null;
  };
}

export class FavoritesRepository {
  constructor(private readonly db: Database = defaultDb) {}

  async listByUser(
    userId: string,
    p: { limit: number; offset: number },
  ): Promise<{ rows: FavoriteRow[]; total: number }>;

  async exists(userId: string, trackId: string): Promise<boolean>;

  async trackExists(trackId: string): Promise<boolean>;

  async add(userId: string, trackId: string): Promise<FavoriteRow | null>;

  async remove(userId: string, trackId: string): Promise<boolean>;
}
```

- **Query `listByUser`:**
  - `db.select({ ...trackFields, favoritedAt: favorites.createdAt, artist: { ... } }).from(favorites).innerJoin(tracks, eq(favorites.trackId, tracks.id)).innerJoin(artists, eq(tracks.artistId, artists.id)).where(eq(favorites.userId, userId)).orderBy(desc(favorites.createdAt), asc(tracks.id)).limit(p.limit).offset(p.offset)`
  - Total com `db.select({ value: count() }).from(favorites).where(eq(favorites.userId, userId))`.
- **Query `add`:**
  - Inserção com `.onConflictDoNothing().returning({ userId: favorites.userId })`. Se vazio, retorna `null`.
  - Se inserido, executa a busca com join de `tracks` e `artists` onde `userId` e `trackId` coincidem, devolvendo o `FavoriteRow` completo.
- **Query `remove`:**
  - `db.delete(favorites).where(and(eq(favorites.userId, userId), eq(favorites.trackId, trackId))).returning({ userId: favorites.userId })`. Retorna `boolean`.

### 3.3 Serviço (`src/modules/favorites/favorites.service.ts`)

- `listFavorites(userId: string, query: ListFavoritesQuery): Promise<ListFavoritesResponseDto>`:
  - Calcula `offset = toOffset(query)`.
  - Chama `repo.listByUser(userId, { limit: query.limit, offset })`.
  - Converte datas para ISO 8601 UTC string.
  - Monta `meta` com `buildPaginationMeta`.
- `addFavorite(userId: string, trackId: string): Promise<FavoriteItemDto>`:
  - 1. `trackExists = await repo.trackExists(trackId)`; se falso -> `NotFoundError('Track not found')` (404).
  - 2. `alreadyFavorited = await repo.exists(userId, trackId)`; se verdadeiro -> `ConflictError('Track already in favorites')` (409).
  - 3. `row = await repo.add(userId, trackId)`; se nulo (corrida concorrente) -> `ConflictError('Track already in favorites')` (409).
  - 4. Mapeia para `FavoriteItemDto` e retorna.
- `removeFavorite(userId: string, trackId: string): Promise<void>`:
  - `removed = await repo.remove(userId, trackId)`; se falso -> `NotFoundError('Favorite not found')` (404).

### 3.4 Rotas Fastify (`src/modules/favorites/favorites.routes.ts`)

- Plugin `FastifyPluginAsyncZod`.
- Todas as três rotas utilizam `onRequest: [fastify.requireAuth]`, tag `['Library']`, e security `[{ bearerAuth: [] }, { cookieAuth: [] }]`.
- **R23: `GET /favorites`**:
  - `operationId: 'listFavorites'`, `querystring: listFavoritesQuerySchema`.
  - Respostas: `200` (`listFavoritesResponseSchema`), `401` (`errorResponseSchema`).
- **R24: `POST /favorites/:trackId`**:
  - `operationId: 'addFavorite'`, `params: favoriteTrackParamsSchema`.
  - Respostas: `201` (`favoriteItemSchema`), `400` (`errorResponseSchema`), `401` (`errorResponseSchema`), `404` (`errorResponseSchema`), `409` (`errorResponseSchema`).
- **R25: `DELETE /favorites/:trackId`**:
  - `operationId: 'removeFavorite'`, `params: favoriteTrackParamsSchema`.
  - Respostas: `204` (`z.void()`), `400` (`errorResponseSchema`), `401` (`errorResponseSchema`), `404` (`errorResponseSchema`).

### 3.5 Registro no App Factory (`src/app.ts`)

- Importação de `favoritesRoutes` de `./modules/favorites/favorites.routes.js`.
- Registro via `await app.register(favoritesRoutes, { prefix: API_PREFIX });`.

---

## 4. Estratégia e Casos de Teste Obrigatórios

### 4.1 Testes Unitários (`tests/unit/modules/favorites/favorites.service.test.ts`)

| #      | Caso                                      | Comportamento Esperado                                                     |
| :----- | :---------------------------------------- | :------------------------------------------------------------------------- |
| **T1** | `list` monta `meta`                       | Constrói envelope `meta` canônico com total, totalPages, hasNext e hasPrev |
| **T2** | `add` com faixa inexistente               | Lança `NotFoundError` ('Track not found' - 404)                            |
| **T3** | `add` já favoritada                       | Lança `ConflictError` ('Track already in favorites' - 409)                 |
| **T4** | `add` com `null` do repository (corrida)  | Lança `ConflictError` ('Track already in favorites' - 409)                 |
| **T5** | `remove` com `false`                      | Lança `NotFoundError` ('Favorite not found' - 404)                         |
| **T6** | Todo método repassa `userId`              | Asserções nos mocks comprovam repasse correto de `userId`                  |
| **T7** | DTO tem `favoritedAt` e `artist` embutido | Asserção por chave no resultado retornado                                  |

### 4.2 Testes de Integração e Rotas (`tests/integration/modules/favorites.repository.test.ts`)

Execução com Testcontainers PostgreSQL real e requisições HTTP via `app.inject()`:

| #             | Caso                                      | Comportamento Esperado                                                   |
| :------------ | :---------------------------------------- | :----------------------------------------------------------------------- |
| **Repo 1..5** | Testes diretos do Repositório             | Validação de `listByUser`, `exists`, `trackExists`, `add` e `remove`     |
| **T8**        | `POST /favorites/:trackId`                | Retorna 201 com o `FavoriteItem` completo (com `artist` e `favoritedAt`) |
| **T9**        | `POST` repetido                           | Retorna **409 Conflict**                                                 |
| **T10**       | `POST` com uuid inexistente               | Retorna 404 Not Found                                                    |
| **T11**       | `POST` com id não-UUID                    | Retorna 400 Bad Request                                                  |
| **T12**       | `POST` sem token                          | Retorna 401 Unauthorized                                                 |
| **T13**       | `GET /favorites` isola por usuário        | A favorita 2 faixas, B favorita 1 faixa -> A enxerga 2, B enxerga 1      |
| **T14**       | `GET /favorites` ordenação cronológica    | Ordenado por `favoritedAt DESC` com desempate determinístico             |
| **T15**       | `GET /favorites` vazio                    | Retorna `data: []`, `meta.total: 0`                                      |
| **T16**       | `DELETE` de favorito existente            | Retorna 204 No Content                                                   |
| **T17**       | `DELETE` de favorito inexistente          | Retorna 404 Not Found                                                    |
| **T18**       | **B tenta apagar o favorito de A**        | Retorna 404 Not Found; favorito de A permanece intacto (D-31)            |
| **T19**       | **Mesma faixa favoritada por 2 usuários** | Ambos os registros coexistem (validação da PK composta)                  |
| **T20**       | Faixa apagada do catálogo                 | Some dos favoritos (expurgo por foreign key cascade)                     |
| **T21**       | Usuário apagado (`DELETE /api/v1/me`)     | Favoritos do usuário somem (cascade)                                     |
| **T22**       | Paginação com 25 favoritos                | 2 páginas (20 e 5), metadados de paginação precisos                      |

---

## 5. Plano de Execução Passo a Passo (Após Autorização da Parada 1)

1. **Criação da Branch:**
   - `git checkout -b feature/f4s02-modulo-favorites` a partir de `develop`.
2. **Implementação do DTO Schema (`favorites.schema.ts`):**
   - Param schemas, query schemas, representações e envelopes tipados com Zod 4.
3. **Implementação do Repositório (`favorites.repository.ts`):**
   - Métodos Drizzle com projeção relacional estruturada, subqueries de contagem e filtros com isolamento por usuário.
4. **Implementação do Serviço (`favorites.service.ts`):**
   - Ordem estrita de checagens, conversão de DTOs e lançamento de exceções de domínio.
5. **Implementação das Rotas (`favorites.routes.ts`):**
   - Rotas R23, R24 e R25 com guards `requireAuth`, tipagem Zod e metadados OpenAPI.
6. **Integração no App Factory (`src/app.ts`):**
   - Registro de `favoritesRoutes` sob `API_PREFIX`.
7. **Construção das Suítes de Teste:**
   - `tests/unit/modules/favorites/favorites.service.test.ts` (T1–T7).
   - `tests/integration/modules/favorites.repository.test.ts` (Repo 1–5 e T8–T22).
8. **Validação dos 5 Portões da Pipeline de Qualidade:**
   - `pnpm typecheck`
   - `pnpm lint`
   - `pnpm format`
   - `pnpm test`
   - `pnpm build`
9. **Entrega via Git Flow e GitHub CLI (`gh`):**
   - Commit semântico: `feat(favorites): adiciona modulo de favoritos com isolamento por usuario e ordenacao cronologica`.
   - Push para origin e abertura de Pull Request apontando para `develop`.
   - Monitoramento do CI via `gh run watch --exit-status`.
10. **Registro Canônico na Memória:**
    - Atualização de `.agents/memory/PROGRESS.md`.
    - Criação de `.agents/memory/F4-S02.md`.
    - Encerramento da sessão (Parada 2 — D-06).
