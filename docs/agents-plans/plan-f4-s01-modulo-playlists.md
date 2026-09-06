# Plano de Implementação — Sprint F4-S01: Módulo `playlists`

> **Status:** 🟡 Em Planejamento (Aguardando Autorização Explícita — Parada 1 / Etapa 3 do Protocolo)  
> **Fase:** F4 — Biblioteca · **Primeiro sprint da fase F4**  
> **Branch Alvo:** `feature/f4s01-modulo-playlists` (a partir de `develop`)  
> **Depende de:** F3-S02 (padrão canônico de rota protegida) e F2-S04 (projeção relacional estruturada D-41)  
> **Contratos de Entrega:** R16 (`GET /api/v1/playlists`), R17 (`POST /api/v1/playlists`), R18 (`GET /api/v1/playlists/:id`), R19 (`PATCH /api/v1/playlists/:id`), R20 (`DELETE /api/v1/playlists/:id`), R21 (`POST /api/v1/playlists/:id/tracks`), R22 (`DELETE /api/v1/playlists/:id/tracks/:trackId`)  
> **Specs de Referência:**
>
> - [`docs/specs/03-contrato-da-api.md`](../specs/03-contrato-da-api.md) (§3 — Representações `Playlist`, `PlaylistDetail`, `Track`, §7 — Playlists R16–R22)
> - [`docs/specs/04-autenticacao-e-seguranca.md`](../specs/04-autenticacao-e-seguranca.md) (§3 — Guard de rotas `requireAuth`, decorators de sessão)
> - [`docs/specs/02-modelo-de-dados.md`](../specs/02-modelo-de-dados.md) (§4 — Modelagem `playlists` e `playlist_tracks`, §5 — Índices, §7 — Transações)
> - [`docs/specs/07-protocolo-dos-agentes.md`](../specs/07-protocolo-dos-agentes.md) (Protocolo de 7 etapas e paradas mandatórias)
> - [`docs/sprints/fase-4-biblioteca/F4-S01-modulo-playlists.md`](../sprints/fase-4-biblioteca/F4-S01-modulo-playlists.md) (Brief canônico da sprint)
> - [`.agents/memory/DECISIONS.md`](../../.agents/memory/DECISIONS.md) (**D-01**, **D-06**, **D-07**, **D-13**, **D-14**, **D-15**, **D-16**, **D-19**, **D-22**, **D-23**, **D-24**, **D-25**, **D-27**, **D-31**, **D-34**, **D-35**, **D-36**, **D-40**, **D-41**, **D-42**, **D-45**)
> - [`.agents/memory/F3-S02.md`](../../.agents/memory/F3-S02.md) (Padrão de rota protegida com `getUserId`, tipagem Fastify v5 `204: z.void()`)
> - [`.agents/memory/F2-S04.md`](../../.agents/memory/F2-S04.md) (Projeção relacional estruturada nativa via Drizzle ORM — Decisão D-41)

---

## 1. Contexto e Objetivos Técnicos

A sprint **F4-S01** inaugura a Fase 4 (Biblioteca) entregando o módulo mais denso e de maior superfície de exposição da API Cardoso Sound: o gerenciamento completo de **playlists privadas** e a gestão de suas faixas associadas (R16–R22).

Este módulo consolida o aprendizado das fases anteriores — integrando a autenticação por Bearer/Cookie de F3 com as queries relacionais de catálogo de F2 — e estabelece padrões rigorosos que serão espelhados em F4-S02 (`favorites`).

### Invariantes Arquiteturais e Regras Inegociáveis

1. **A Regra de Ouro: Isolamento na Cláusula `WHERE` e Retorno 404 (D-31):**
   - Playlist de outro usuário responde impreterivelmente **HTTP 404 Not Found**, **nunca 403 Forbidden**. Recurso inexistente e recurso de outro usuário são estritamente indistinguíveis para mitigar ataques de enumeração por UUID v4.
   - O isolamento é executado compulsoriamente no banco de dados via `.where(and(eq(playlists.id, id), eq(playlists.userId, userId)))`.
   - É **terminantemente proibido** buscar a playlist sem o filtro de dono e inspecionar a posse em memória (`if (p.userId !== userId)`).
2. **Assinaturas do Repositório Sempre Recebem `userId`:**
   - Todo método que toca ou consulta uma playlist específica exige `userId` na assinatura (`findByIdForUser`, `update`, `delete`). Não existe `findById(id)` desprovido de dono no repositório.
3. **Escopo Fixo e Deliberadamente Restrito (D-15):**
   - Não há coluna `position`, não há reordenação de itens, não há coluna `is_public` e não há compartilhamento.
   - A ordem de faixas em `PlaylistDetail.tracks` é estritamente `added_at ASC`.
4. **Resolução da Opção da §5.3 (Acoplamento entre Repositórios):**
   - Adotada a **Opção (a)**: `PlaylistsRepository.trackExists(trackId)` com consulta direta em `tracks`. O módulo permanece autocontido, sem acoplamento entre repositórios e sem violar a regra fundamental de que _um repositório nunca importa outro repositório_ (Spec 01 §1 e `eslint-plugin-boundaries`).
5. **Prevenção de Corrida e Duplicidade Concorrente em `POST /:id/tracks`:**
   - A chave primária composta `(playlist_id, track_id)` do PostgreSQL emitiria erro `23505` (unique_violation), que viraria 500 sem tratamento.
   - O fluxo aplica verificação explícita prévia (`hasTrack`) para garantir HTTP 409 determinístico.
   - Para prevenir condições de corrida entre verificação e inserção concorrente, a inserção utiliza `.onConflictDoNothing().returning()`. Caso o retorno seja vazio, o serviço trata o conflito e responde HTTP 409.
6. **Controle Estrito de Limites de Negócio via HTTP 422 (`ValidationError`):**
   - Limite por usuário: `MAX_PLAYLISTS_PER_USER = 50` em `POST /api/v1/playlists`.
   - Limite por playlist: `MAX_TRACKS_PER_PLAYLIST = 500` em `POST /api/v1/playlists/:id/tracks`.
   - Limites excedidos lançam `ValidationError` (resultando em HTTP 422 Unprocessable Entity), diferenciando-se de erros sintáticos de schema Zod (HTTP 400 Bad Request).
7. **Atomicidade e Transações (`db.transaction()`):**
   - `DELETE /api/v1/playlists/:id`: executa em transação atômica. Embora a chave estrangeira possua `onDelete: 'cascade'`, a exclusão explícita dos itens em `playlist_tracks` é feita previamente para deixar a intenção documentada e legível.
   - Transações são mantidas em um único nível para evitar armadilhas de transações aninhadas (Armadilha 6).

---

## 2. Blast Radius e Conformidade com as Fronteiras Arquiteturais

O blast radius da sprint é fechado e estritamente delimitado às fronteiras do módulo `playlists` e seus testes:

```
blast-radius/
├── Preencher (arquivos atualmente vazios com 0 bytes):
│   ├── src/modules/playlists/playlists.schema.ts
│   ├── src/modules/playlists/playlists.repository.ts
│   ├── src/modules/playlists/playlists.service.ts
│   └── src/modules/playlists/playlists.routes.ts
│
├── Criar (novas suítes e planejamento):
│   ├── tests/unit/modules/playlists/playlists.service.test.ts
│   ├── tests/integration/modules/playlists.repository.test.ts
│   └── docs/agents-plans/plan-f4s01-modulo-playlists.md
│
├── Editar (registro do plugin e memória):
│   ├── src/app.ts                                    (registro de playlistsRoutes sob API_PREFIX)
│   ├── .agents/memory/PROGRESS.md                    (avanço do status para F4-S02)
│   └── .agents/memory/F4-S01.md                      (memória técnica canônica da sprint)
│
└── Fora do Escopo (Terminantemente Proibido Tocar):
    ├── src/modules/favorites/**                      (escopo do sprint F4-S02)
    ├── src/modules/tracks/** e src/modules/artists/** (catálogo público já estável)
    ├── src/modules/users/** e src/modules/auth/**     (identidade já estável)
    ├── src/db/** e drizzle/**                        (schema já possui playlists e playlist_tracks)
    └── src/config/** e src/shared/**                 (constantes e utilitários já consolidados)
```

### Validação das Regras do ESLint (`boundaries/element-types`)

- `src/modules/playlists/playlists.schema.ts` (`dto`): importa unicamente `zod` e utilitários de paginação (`src/shared/utils/pagination.js`). Proibido importar de outros DTOs ou módulos.
- `src/modules/playlists/playlists.repository.ts` (`repository`): importa exclusivamente de `src/db/**`, `drizzle-orm` e tipos de `./playlists.schema.js`. Não importa de outros repositórios nem de `routes`/`service`.
- `src/modules/playlists/playlists.service.ts` (`service`): importa de `./playlists.repository.js`, `./playlists.schema.js`, `src/shared/errors/index.js` e `src/config/constants.js`. Não importa de `src/db/**` nem de objetos Fastify.
- `src/modules/playlists/playlists.routes.ts` (`routes`): importa de `fastify-type-provider-zod`, `./playlists.service.js`, `./playlists.schema.js` e `src/shared/errors/index.js`.
- `src/app.ts` (`app`): importa `playlistsRoutes` e o registra via `app.register(playlistsRoutes, { prefix: API_PREFIX })`.

---

## 3. Especificação Canônica dos Contratos

### 3.1 DTOs de Entrada e Saída (`playlists.schema.ts`)

#### Enums e Constantes Locais

```typescript
export const GENRES = ['rock', 'pop', 'electronic', 'hip-hop', 'jazz', 'lo-fi'] as const;
```

#### Schemas de Entrada (Query, Params e Body)

1. `listPlaylistsQuerySchema`:
   - `page`: `z.coerce.number().int().min(1).default(1)`
   - `limit`: `z.coerce.number().int().min(1).max(100).default(20)`
2. `playlistParamsSchema`:
   - `id`: `z.uuid()`
3. `playlistTrackParamsSchema`:
   - `id`: `z.uuid()`
   - `trackId`: `z.uuid()`
4. `createPlaylistBodySchema`:
   - `name`: `z.string().trim().min(1, 'Name must contain at least 1 character').max(120, 'Name must not exceed 120 characters')`
   - `description`: `z.string().trim().max(500, 'Description must not exceed 500 characters').nullable().optional()`
5. `updatePlaylistBodySchema`:
   - `name`: `z.string().trim().min(1).max(120).optional()`
   - `description`: `z.string().trim().max(500).nullable().optional()`
   - Refinamento: `.refine((data) => data.name !== undefined || data.description !== undefined, { message: 'At least one field must be provided' })`
6. `addTrackToPlaylistBodySchema`:
   - `trackId`: `z.uuid()`

#### Schemas de Saída e Envelopes

1. `artistSummarySchema`:
   - `id`: `z.uuid()`
   - `name`: `z.string()`
   - `avatarUrl`: `z.string().nullable()`
2. `playlistTrackItemSchema`:
   - `id`: `z.uuid()`
   - `title`: `z.string()`
   - `album`: `z.string().nullable()`
   - `genre`: `z.enum(GENRES)`
   - `durationSeconds`: `z.number().int().positive()`
   - `coverUrl`: `z.string().nullable()`
   - `audioUrl`: `z.url()`
   - `artist`: `artistSummarySchema`
   - `createdAt`: `z.iso.datetime()`
   - `addedAt`: `z.iso.datetime()`
3. `playlistSchema`:
   - `id`: `z.uuid()`
   - `name`: `z.string()`
   - `description`: `z.string().nullable()`
   - `trackCount`: `z.number().int().nonnegative()`
   - `createdAt`: `z.iso.datetime()`
   - `updatedAt`: `z.iso.datetime()`
4. `playlistDetailSchema`:
   - `...playlistSchema`
   - `tracks`: `z.array(playlistTrackItemSchema)`
5. `listPlaylistsResponseSchema`:
   - `data`: `z.array(playlistSchema)`
   - `meta`: `paginationMetaSchema`
6. `errorResponseSchema`:
   - `statusCode`: `z.number().int()`
   - `error`: `z.string()`
   - `message`: `z.string()`
   - `details`: `z.unknown().nullable()`

---

## 4. Desenho Detalhado por Camada

### 4.1 Camada de Dados: `PlaylistsRepository` (`src/modules/playlists/playlists.repository.ts`)

O repositório gerencia interações com `playlists`, `playlist_tracks` e verificação em `tracks`.

#### Tipos Internos de Retorno do Repositório:

```typescript
export interface PlaylistTrackRow {
  id: string;
  title: string;
  album: string | null;
  genre: string;
  durationSeconds: number;
  coverUrl: string | null;
  audioUrl: string;
  createdAt: Date;
  addedAt: Date;
  artist: {
    id: string;
    name: string;
    avatarUrl: string | null;
  };
}

export interface PlaylistRow {
  id: string;
  name: string;
  description: string | null;
  trackCount: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface PlaylistDetailRow extends PlaylistRow {
  tracks: PlaylistTrackRow[];
}
```

#### Métodos e Comportamento:

1. `listByUser(userId: string, p: { limit: number; offset: number }): Promise<{ rows: PlaylistRow[]; total: number }>`
   - `trackCountSql`: Subquery correlacionada `this.db.$count(playlistTracks, eq(playlistTracks.playlistId, playlists.id))` para evitar problemas com `LEFT JOIN` e `LIMIT` (Armadilha 5).
   - Cláusula `where`: `eq(playlists.userId, userId)`.
   - Ordenação: `orderBy(desc(playlists.createdAt), asc(playlists.id))`.
   - Contagem total: `this.db.select({ value: count() }).from(playlists).where(eq(playlists.userId, userId))`.
2. `countByUser(userId: string): Promise<number>`
   - Executa `SELECT count(*) FROM playlists WHERE user_id = $1`.
3. `findByIdForUser(id: string, userId: string): Promise<PlaylistDetailRow | null>`
   - Query 1: Seleciona playlist garantindo posse:
     `where(and(eq(playlists.id, id), eq(playlists.userId, userId)))`. Se `null`, retorna imediatamente `null`.
   - Query 2: Projeção estruturada com `innerJoin(tracks)` e `innerJoin(artists)` em `playlistTracks`:
     `where(eq(playlistTracks.playlistId, id))` ordenado por `asc(playlistTracks.addedAt)`.
   - Retorna objeto consolidado com `trackCount: trackRows.length` e `tracks: trackRows`.
4. `create(userId: string, data: { name: string; description?: string | null }): Promise<PlaylistRow>`
   - Insere na tabela `playlists` com `userId`, retornando os campos criados.
   - Devolve objeto com `trackCount: 0`.
5. `update(id: string, userId: string, data: { name?: string; description?: string | null }): Promise<PlaylistRow | null>`
   - Atualiza `name` e/ou `description`, sempre definindo `updatedAt: new Date()`.
   - Cláusula `where`: `and(eq(playlists.id, id), eq(playlists.userId, userId))`.
   - Se `!updated`, retorna `null`.
   - Calcula `trackCount` atual via `countTracks(id)` e retorna `PlaylistRow`.
6. `delete(id: string, userId: string): Promise<boolean>`
   - Executa em `this.db.transaction()`:
     1. Verifica existência e posse: `SELECT id FROM playlists WHERE id = $1 AND user_id = $2`. Se não existir, retorna `false`.
     2. Deleta explicitamente de `playlistTracks` onde `playlistId = $1`.
     3. Deleta de `playlists` onde `id = $1 AND user_id = $2`.
     4. Retorna `true`.
7. `trackExists(trackId: string): Promise<boolean>`
   - `SELECT id FROM tracks WHERE id = $1 LIMIT 1`. Retorna boolean.
8. `hasTrack(playlistId: string, trackId: string): Promise<boolean>`
   - `SELECT playlist_id FROM playlist_tracks WHERE playlist_id = $1 AND track_id = $2 LIMIT 1`.
9. `addTrack(playlistId: string, trackId: string): Promise<boolean>`
   - Insere com `.onConflictDoNothing().returning({ playlistId: playlistTracks.playlistId })`.
   - Retorna `result.length > 0` (falso caso já existisse).
10. `removeTrack(playlistId: string, trackId: string): Promise<boolean>`
    - Remove de `playlistTracks` onde `playlistId = $1 AND trackId = $2` com `.returning()`.
    - Retorna `result.length > 0`.
11. `countTracks(playlistId: string): Promise<number>`
    - `SELECT count(*) FROM playlist_tracks WHERE playlist_id = $1`.

---

### 4.2 Camada de Negócio: `PlaylistsService` (`src/modules/playlists/playlists.service.ts`)

Contém as regras de negócio puras, desacopladas do framework Fastify, gerenciando limites e lançando exceções da hierarquia `AppError`.

#### Métodos e Fluxos:

1. `listPlaylists(userId: string, query: ListPlaylistsQuery): Promise<ListPlaylistsResponseDto>`
   - Converte paginação via `toOffset({ page: query.page, limit: query.limit })`.
   - Invoca `this.repo.listByUser(userId, { limit, offset })`.
   - Mapeia linhas para `PlaylistDto` convertendo datas em ISO string.
   - Constrói envelope com `buildPaginationMeta({ page, limit, total })`.
2. `createPlaylist(userId: string, input: CreatePlaylistInput): Promise<PlaylistDto>`
   - Valida limite: `const count = await this.repo.countByUser(userId)`.
   - Se `count >= MAX_PLAYLISTS_PER_USER` (50): lança `new ValidationError('Playlist limit reached', { limit: MAX_PLAYLISTS_PER_USER })` (HTTP 422).
   - Invoca `this.repo.create(userId, input)` e retorna o DTO.
3. `getPlaylistById(userId: string, id: string): Promise<PlaylistDetailDto>`
   - Invoca `this.repo.findByIdForUser(id, userId)`.
   - Se `null`: lança `new NotFoundError('Playlist not found')` (HTTP 404).
   - Retorna o DTO com `tracks` mapeadas e datas em ISO string.
4. `updatePlaylist(userId: string, id: string, input: UpdatePlaylistInput): Promise<PlaylistDto>`
   - Invoca `this.repo.update(id, userId, input)`.
   - Se `null`: lança `new NotFoundError('Playlist not found')` (HTTP 404).
   - Retorna o DTO atualizado.
5. `deletePlaylist(userId: string, id: string): Promise<void>`
   - Invoca `this.repo.delete(id, userId)`.
   - Se `false`: lança `new NotFoundError('Playlist not found')` (HTTP 404).
6. `addTrack(userId: string, playlistId: string, trackId: string): Promise<PlaylistDetailDto>`
   - **Passo 1 (Posse da playlist):** `await this.repo.findByIdForUser(playlistId, userId)` -> se `null`, lança `new NotFoundError('Playlist not found')` (HTTP 404).
   - **Passo 2 (Existência da faixa):** `await this.repo.trackExists(trackId)` -> se `false`, lança `new NotFoundError('Track not found')` (HTTP 404).
   - **Passo 3 (Limite de faixas):** `await this.repo.countTracks(playlistId)` -> se `>= MAX_TRACKS_PER_PLAYLIST` (500), lança `new ValidationError('Playlist track limit reached', { limit: MAX_TRACKS_PER_PLAYLIST })` (HTTP 422).
   - **Passo 4 (Verificação de duplicidade):** `await this.repo.hasTrack(playlistId, trackId)` -> se `true`, lança `new ConflictError('Track already in playlist')` (HTTP 409).
   - **Passo 5 (Inserção atômica com salvaguarda de corrida):** `const added = await this.repo.addTrack(playlistId, trackId)`. Se `!added` (corrida concorrente), lança `new ConflictError('Track already in playlist')` (HTTP 409).
   - **Passo 6 (Retorno atualizado):** Recarrega `await this.repo.findByIdForUser(playlistId, userId)` e devolve o `PlaylistDetailDto` atualizado (HTTP 201).
7. `removeTrack(userId: string, playlistId: string, trackId: string): Promise<void>`
   - **Passo 1 (Posse da playlist):** `await this.repo.findByIdForUser(playlistId, userId)` -> se `null`, lança `new NotFoundError('Playlist not found')` (HTTP 404).
   - **Passo 2 (Remoção da faixa):** `const removed = await this.repo.removeTrack(playlistId, trackId)`. Se `!removed`, lança `new NotFoundError('Track not found in playlist')` (HTTP 404).

---

### 4.3 Camada de Transporte: `PlaylistsRoutes` (`src/modules/playlists/playlists.routes.ts`)

Plugin Fastify com tipagem Zod que intercepta requisições HTTP, executa `fastify.requireAuth` e delega ao serviço:

- Utilitário local `getUserId(request)` para extração segura de `request.user.id` sem non-null assertions (`!`).
- Tag OpenAPI: `tags: ['Library']`.
- Esquema de segurança: `security: [{ bearerAuth: [] }, { cookieAuth: [] }]`.
- Declaração de todos os status HTTP possíveis em `response` para cada rota.
- Respostas 204 com `z.void()` e `reply.status(204).send()`.

---

## 5. Matriz Completa de Testes Obrigatórios

### 5.1 Testes Unitários (`tests/unit/modules/playlists/playlists.service.test.ts`)

Cobrem a lógica pura do serviço com mock do repositório:

| Caso    | Descrição do Cenário                                                                   | Comportamento Esperado                                                   |
| :------ | :------------------------------------------------------------------------------------- | :----------------------------------------------------------------------- |
| **T1**  | `listPlaylists` calcula e monta envelope `meta` de paginação                           | `meta` idêntico ao padrão F2-S03/F2-S04 com `hasNext`/`hasPrev` corretos |
| **T2**  | `createPlaylist` quando o usuário já possui 49 playlists                               | Cria com sucesso (`trackCount: 0`) e chama `repo.create`                 |
| **T3**  | `createPlaylist` quando o usuário já possui 50 playlists                               | Lança `ValidationError` com mensagem `'Playlist limit reached'` (422)    |
| **T4**  | `getPlaylistById` quando repositório devolve `null`                                    | Lança `NotFoundError('Playlist not found')` (404)                        |
| **T5**  | `updatePlaylist` quando repositório devolve `null`                                     | Lança `NotFoundError('Playlist not found')` (404)                        |
| **T6**  | `deletePlaylist` quando repositório devolve `false`                                    | Lança `NotFoundError('Playlist not found')` (404)                        |
| **T7**  | `addTrack` quando `findByIdForUser` retorna `null`                                     | Lança `NotFoundError('Playlist not found')` (404)                        |
| **T8**  | `addTrack` quando `trackExists` retorna `false`                                        | Lança `NotFoundError('Track not found')` (404)                           |
| **T9**  | `addTrack` quando faixa já está presente (`hasTrack === true` ou `addTrack === false`) | Lança `ConflictError('Track already in playlist')` (409)                 |
| **T10** | `addTrack` quando playlist possui 500 faixas (`countTracks >= 500`)                    | Lança `ValidationError('Playlist track limit reached')` (422)            |
| **T11** | `removeTrack` quando `removeTrack` retorna `false`                                     | Lança `NotFoundError('Track not found in playlist')` (404)               |
| **T12** | Asserção em todos os métodos que tocam playlist repassando `userId`                    | Mock confirma que `userId` recebido no service foi repassado ao repo     |

---

### 5.2 Testes de Integração e E2E via `app.inject()` (`tests/integration/modules/playlists.repository.test.ts`)

Executados contra PostgreSQL efêmero via Testcontainers:

#### Testes Diretos de `PlaylistsRepository`:

- **Repo 1:** `create` e `findByIdForUser` recuperam playlist com `trackCount: 0` e campos preenchidos.
- **Repo 2:** `findByIdForUser` isola por usuário (usuário B recebe `null` para ID de A).
- **Repo 3:** `listByUser` lista apenas playlists do usuário solicitado com `trackCount` correto.
- **Repo 4:** `countByUser` reflete a quantidade real de playlists criadas.
- **Repo 5:** `update` altera `name` e `description`, atualizando `updatedAt`.
- **Repo 6:** `delete` remove a playlist e purga itens de `playlist_tracks` em transação.
- **Repo 7:** `trackExists` retorna `true` para faixa existente e `false` para ausente.
- **Repo 8:** `hasTrack` detecta presença e ausência de faixa na playlist.
- **Repo 9:** `addTrack` insere faixa e retorna `false` em caso de conflito (idempotente).
- **Repo 10:** `removeTrack` remove faixa e retorna `false` se ela não estiver na playlist.
- **Repo 11:** `countTracks` conta precisamente as faixas da playlist.

#### Testes de Rotas HTTP via `app.inject()` (T13 a T35):

| Caso    | Rota e Ação                                                   | Status Esperado e Asserção                                                 |
| :------ | :------------------------------------------------------------ | :------------------------------------------------------------------------- |
| **T13** | `POST /api/v1/playlists` válido                               | HTTP 201, corpo com `id`, `name`, `trackCount: 0`                          |
| **T14** | `POST /api/v1/playlists` com `name: ""`                       | HTTP 400 Bad Request com envelope RFC 7807                                 |
| **T15** | `POST /api/v1/playlists` com `name` de 121 caracteres         | HTTP 400 Bad Request (tamanho máximo 120 excedido)                         |
| **T16** | `POST /api/v1/playlists` sem token de autenticação            | HTTP 401 Unauthorized                                                      |
| **T17** | `GET /api/v1/playlists` isolamento                            | Usuário A cria 2, B cria 1. GET de A retorna exatamente 2                  |
| **T18** | `GET /api/v1/playlists/:id` de **outro** usuário              | **HTTP 404 Not Found**, **nunca 403** (D-31)                               |
| **T19** | `GET /api/v1/playlists/:id` inexistente                       | HTTP 404 Not Found                                                         |
| **T20** | `PATCH /api/v1/playlists/:id` de playlist alheia              | **HTTP 404 Not Found**                                                     |
| **T21** | `PATCH /api/v1/playlists/:id` com corpo vazio `{}`            | HTTP 400 Bad Request                                                       |
| **T22** | `DELETE /api/v1/playlists/:id` de playlist alheia             | **HTTP 404 Not Found**; playlist de B permanece intacta no banco           |
| **T23** | `DELETE /api/v1/playlists/:id` própria                        | HTTP 204 No Content; GET subsequente responde 404                          |
| **T24** | `DELETE /api/v1/playlists/:id` limpa itens                    | Contagem em `playlist_tracks` para a playlist resulta em zero              |
| **T25** | `POST /api/v1/playlists/:id/tracks` válido                    | HTTP 201 Created; retorna `PlaylistDetail` contendo a faixa                |
| **T26** | `POST /api/v1/playlists/:id/tracks` repetido                  | **HTTP 409 Conflict**                                                      |
| **T27** | `POST /api/v1/playlists/:id/tracks` com `trackId` inexistente | HTTP 404 Not Found                                                         |
| **T28** | `POST /api/v1/playlists/:id/tracks` em playlist alheia        | HTTP 404 Not Found                                                         |
| **T29** | `POST /api/v1/playlists/:id/tracks` com `trackId` não-UUID    | HTTP 400 Bad Request                                                       |
| **T30** | `DELETE /api/v1/playlists/:id/tracks/:trackId` presente       | HTTP 204 No Content                                                        |
| **T31** | `DELETE /api/v1/playlists/:id/tracks/:trackId` ausente        | HTTP 404 Not Found                                                         |
| **T32** | 3 faixas adicionadas sucessivamente                           | Array `tracks` vem estritamente ordenado por `addedAt ASC`                 |
| **T33** | `trackCount` em `GET /playlists`                              | Reflete contagem precisa após adições e remoções                           |
| **T34** | Faixa apagada do catálogo                                     | Some automaticamente da playlist por efeito cascata da foreign key         |
| **T35** | Paginação de `GET /playlists` com 25 playlists                | Página 1 (20 itens, `hasNext: true`), Página 2 (5 itens, `hasNext: false`) |

---

## 6. Procedimento de Execução Passo a Passo (Etapas 4 a 7 do Protocolo)

Ao receber a autorização explícita do usuário (Etapa 3 ⏸):

1. **Criação da Branch de Trabalho (Git Flow):**
   - Garantir sincronização com `origin/develop`.
   - Criar e mudar para a branch: `git checkout -b feature/f4s01-modulo-playlists`.
2. **Implementação dos Arquivos do Módulo (Etapa 4):**
   - Preencher `src/modules/playlists/playlists.schema.ts`.
   - Preencher `src/modules/playlists/playlists.repository.ts`.
   - Preencher `src/modules/playlists/playlists.service.ts`.
   - Preencher `src/modules/playlists/playlists.routes.ts`.
   - Registrar `playlistsRoutes` em `src/app.ts`.
3. **Implementação das Suítes de Testes:**
   - Criar `tests/unit/modules/playlists/playlists.service.test.ts` (T1 a T12).
   - Criar `tests/integration/modules/playlists.repository.test.ts` (Repo 1 a 11 e T13 a T35).
4. **Validação Completa de Qualidade (Etapa 5):**
   - `pnpm typecheck` (zero erros).
   - `pnpm lint` e `pnpm format`.
   - `pnpm test` (unitários + integração Testcontainers).
   - `pnpm build` (`tsup` empacotamento).
5. **Entrega via GitHub CLI (Etapa 6):**
   - Commit semântico convencional: `feat(playlists): implementa modulo de playlists com isolamento por usuario e gestao de faixas`.
   - `git push -u origin feature/f4s01-modulo-playlists`.
   - `gh pr create --base develop --title "feat(playlists): implementa módulo de playlists (R16–R22)" ...`.
   - Acompanhamento do CI via `gh run watch --exit-status`.
6. **Atualização da Memória e Encerramento (Etapa 7):**
   - Registrar decisões e detalhes no `.agents/memory/F4-S01.md`.
   - Atualizar `.agents/memory/PROGRESS.md` (marcar F4-S01 ✅ e apontar F4-S02).
   - Registrar na branch e commit final. Parada mandatória: o merge é responsabilidade do dono (D-06).

---

## 7. Definition of Done (DoD)

- [ ] Arquivos preenchidos estritamente dentro do blast radius delimitado.
- [ ] Casos de teste T1 a T35 aprovados e verdes.
- [ ] Isolamento estrito por usuário: nenhuma rota responde 403 (D-31 comprovado nos testes T18, T20, T22, T28).
- [ ] Assinaturas de mutação e consulta individual no repositório exigem `userId`.
- [ ] Transações configuradas em `delete` e inserção de faixa.
- [ ] Documentação OpenAPI em `/docs` expondo as 7 novas rotas na tag `Library`.
- [ ] Todos os 5 portões de qualidade (`typecheck`, `lint`, `format`, `test`, `build`) 100% verdes.
- [ ] PR aberto com CI remoto verde e memória atualizada.
