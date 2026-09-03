# 03 — Contrato da API

> Este é o contrato que o app Flutter consome. **Nenhuma rota, campo ou código de status
> fora desta spec.** Se um sprint precisar de algo aqui inexistente, o agente para e pergunta.

---

## 1. Convenções globais

| Item                       | Valor                                                 |
| -------------------------- | ----------------------------------------------------- |
| Prefixo do domínio         | `/api/v1`                                             |
| Prefixo do Better Auth     | `/api/auth` (**sem versão** — basePath padrão da lib) |
| Health                     | `/health`, `/health/ready` (**sem prefixo**)          |
| Documentação               | `/docs` (Swagger UI), `/docs/json` (OpenAPI cru)      |
| Content-Type               | `application/json` na entrada e na saída              |
| Datas                      | ISO 8601 UTC — `2026-09-03T14:22:31.000Z`             |
| IDs de domínio             | UUID v4 em string                                     |
| ID de usuário              | **string opaca** (Better Auth), não é UUID            |
| Ordenação padrão de listas | `created_at DESC`, desempate por `id ASC`             |

### Envelope de lista — **fixo e obrigatório**

```json
{
  "data": [/* … */],
  "meta": {
    "page": 1,
    "limit": 20,
    "total": 40,
    "totalPages": 2,
    "hasNext": true,
    "hasPrev": false
  }
}
```

### Envelope de item único

O objeto puro, **sem** wrapper `data`.

### Query de paginação — comum a todas as listas

| Param   | Tipo    | Default | Regras                               |
| ------- | ------- | ------- | ------------------------------------ |
| `page`  | integer | `1`     | `>= 1`                               |
| `limit` | integer | `20`    | `1..100` (constante `MAX_PAGE_SIZE`) |

`src/shared/utils/pagination.ts` expõe `buildPaginationMeta({ page, limit, total })` e
`toOffset({ page, limit })`. Todo repository de lista devolve `{ rows, total }`.

### Envelope de erro — **fixo**

```json
{ "statusCode": 404, "error": "Not Found", "message": "Track not found", "details": null }
```

| Status | `error`                 | Origem                                         |
| ------ | ----------------------- | ---------------------------------------------- |
| 400    | `Bad Request`           | `ZodError` de schema; `details` traz as issues |
| 401    | `Unauthorized`          | `UnauthorizedError` — sem sessão               |
| 403    | `Forbidden`             | `ForbiddenError` — recurso de outro usuário    |
| 404    | `Not Found`             | `NotFoundError`                                |
| 409    | `Conflict`              | `ConflictError` — duplicidade                  |
| 422    | `Unprocessable Entity`  | `ValidationError` — regra de negócio           |
| 429    | `Too Many Requests`     | `@fastify/rate-limit`                          |
| 500    | `Internal Server Error` | Qualquer exceção não mapeada. Nunca vaza stack |
| 503    | `Service Unavailable`   | `under-pressure` ou banco fora                 |

---

## 2. Mapa completo de rotas

| #   | Método | Rota                                    | Auth | Sprint |
| --- | ------ | --------------------------------------- | ---- | ------ |
| R01 | GET    | `/health`                               | ❌   | F1-S06 |
| R02 | GET    | `/health/ready`                         | ❌   | F1-S06 |
| R03 | GET    | `/docs`                                 | ❌   | F1-S06 |
| R04 | GET    | `/api/v1/artists`                       | ❌   | F2-S03 |
| R05 | GET    | `/api/v1/artists/:id`                   | ❌   | F2-S03 |
| R06 | GET    | `/api/v1/tracks`                        | ❌   | F2-S04 |
| R07 | GET    | `/api/v1/tracks/:id`                    | ❌   | F2-S04 |
| R08 | GET    | `/api/v1/genres`                        | ❌   | F2-S04 |
| R09 | POST   | `/api/auth/sign-up/email`               | ❌   | F3-S01 |
| R10 | POST   | `/api/auth/sign-in/email`               | ❌   | F3-S01 |
| R11 | POST   | `/api/auth/sign-out`                    | ✅   | F3-S01 |
| R12 | GET    | `/api/auth/get-session`                 | ✅   | F3-S01 |
| R13 | GET    | `/api/v1/me`                            | ✅   | F3-S02 |
| R14 | PATCH  | `/api/v1/me`                            | ✅   | F3-S02 |
| R15 | DELETE | `/api/v1/me`                            | ✅   | F3-S02 |
| R16 | GET    | `/api/v1/playlists`                     | ✅   | F4-S01 |
| R17 | POST   | `/api/v1/playlists`                     | ✅   | F4-S01 |
| R18 | GET    | `/api/v1/playlists/:id`                 | ✅   | F4-S01 |
| R19 | PATCH  | `/api/v1/playlists/:id`                 | ✅   | F4-S01 |
| R20 | DELETE | `/api/v1/playlists/:id`                 | ✅   | F4-S01 |
| R21 | POST   | `/api/v1/playlists/:id/tracks`          | ✅   | F4-S01 |
| R22 | DELETE | `/api/v1/playlists/:id/tracks/:trackId` | ✅   | F4-S01 |
| R23 | GET    | `/api/v1/favorites`                     | ✅   | F4-S02 |
| R24 | POST   | `/api/v1/favorites/:trackId`            | ✅   | F4-S02 |
| R25 | DELETE | `/api/v1/favorites/:trackId`            | ✅   | F4-S02 |

---

## 3. Representações

### `ArtistSummary`

```json
{ "id": "uuid", "name": "string", "avatarUrl": "string|null" }
```

### `Artist`

```json
{
  "id": "uuid",
  "name": "string",
  "bio": "string|null",
  "avatarUrl": "string|null",
  "trackCount": 5,
  "createdAt": "ISO"
}
```

### `Track`

```json
{
  "id": "uuid",
  "title": "string",
  "album": "string|null",
  "genre": "rock",
  "durationSeconds": 214,
  "coverUrl": "string|null",
  "audioUrl": "https://www.soundhelix.com/examples/mp3/SoundHelix-Song-1.mp3",
  "artist": { "id": "uuid", "name": "string", "avatarUrl": "string|null" },
  "createdAt": "ISO"
}
```

> `artist` vem **sempre embutido** como `ArtistSummary`. Nunca devolva `artistId` cru.

### `Playlist`

```json
{
  "id": "uuid",
  "name": "string",
  "description": "string|null",
  "trackCount": 12,
  "createdAt": "ISO",
  "updatedAt": "ISO"
}
```

### `PlaylistDetail`

`Playlist` + `"tracks": [ { …Track, "addedAt": "ISO" } ]`, ordenado por `addedAt ASC`.

### `FavoriteItem`

`Track` + `"favoritedAt": "ISO"`.

### `Me`

```json
{ "id": "string", "name": "string", "email": "string", "image": "string|null", "createdAt": "ISO" }
```

> `Me` **nunca** inclui `password`, `emailVerified` nem dados de `session`/`account`.
> Isso é garantido pelo response schema Zod, que remove tudo que não declarou.

---

## 4. Catálogo (público)

### R06 · `GET /api/v1/tracks`

| Query            | Tipo    | Default  | Regras                                                                                     |
| ---------------- | ------- | -------- | ------------------------------------------------------------------------------------------ |
| `page` / `limit` | integer | 1 / 20   | padrão de paginação                                                                        |
| `search`         | string  | —        | 1..100 chars. `ILIKE '%termo%'` em `tracks.title`, `tracks.album` **e** `artists.name`     |
| `genre`          | enum    | —        | um dos 6 slugs; qualquer outro valor → **400**                                             |
| `artistId`       | uuid    | —        | inválido → 400; inexistente → lista vazia, **não** 404                                     |
| `sort`           | enum    | `recent` | `recent` (`created_at DESC`) · `title` (`title ASC`) · `duration` (`duration_seconds ASC`) |

- `200` → `{ data: Track[], meta }`
- Sempre faz `JOIN artists` — o `artist` embutido não é opcional.
- Busca e filtros **combinam** com `AND`.

### R07 · `GET /api/v1/tracks/:id`

- `200` → `Track` · `400` id não-UUID · `404` inexistente

### R04 · `GET /api/v1/artists`

- Query: `page`, `limit`, `search` (ILIKE em `artists.name`)
- `200` → `{ data: Artist[], meta }` — `trackCount` vem de subquery/`COUNT`

### R05 · `GET /api/v1/artists/:id`

- `200` → `Artist` + `"tracks": Track[]` (todas as faixas do artista, `title ASC`, **sem paginação** — são ≤ 5)
- `404` inexistente

### R08 · `GET /api/v1/genres`

```json
{
  "data": [
    { "genre": "rock", "trackCount": 8 },
    { "genre": "pop", "trackCount": 7 }
  ]
}
```

- `SELECT genre, COUNT(*) FROM tracks GROUP BY genre ORDER BY genre ASC`
- **Sem paginação** e **sem `meta`** — é lista fechada de 6 itens.

---

## 5. Autenticação

Rotas montadas pelo Better Auth. **Não escreva handler para elas** — `auth.plugin.ts`
delega tudo em `/api/auth/*` para `auth.handler`. Documentadas aqui só porque o Flutter
precisa do contrato.

### R09 · `POST /api/auth/sign-up/email`

```json
{ "name": "João", "email": "joao@exemplo.com", "password": "senha-de-8+" }
```

`200` → `{ token, user }` + header `set-auth-token` + `Set-Cookie`.
`422` senha < 8 chars · `409`/`400` e-mail já cadastrado (formato ditado pela lib).

### R10 · `POST /api/auth/sign-in/email`

```json
{ "email": "joao@exemplo.com", "password": "senha-de-8+" }
```

`200` → `{ token, user }` · `401` credencial inválida · `429` acima de 10 tentativas/min.

### R11 · `POST /api/auth/sign-out` → `200` e invalida a sessão.

### R12 · `GET /api/auth/get-session` → `200` `{ session, user }` ou `null`.

**Como o cliente autentica** (D-13, ambos aceitos simultaneamente):

- `Authorization: Bearer <token>` — usado pelo Flutter (`flutter_secure_storage`)
- Cookie `better-auth.session_token` — usado pelo Swagger UI no browser

---

## 6. Perfil

### R13 · `GET /api/v1/me` → `200` `Me` · `401` sem sessão

### R14 · `PATCH /api/v1/me`

```json
{ "name": "Novo Nome", "image": "https://..." }
```

- Ambos opcionais; **corpo vazio → 400**. `name`: 1..255. `image`: URL válida ou `null`.
- `200` → `Me` atualizado · `401`
- **E-mail e senha não são alteráveis por esta rota** — fora do MVP.

### R15 · `DELETE /api/v1/me`

- `204` sem corpo · `401`
- Apaga o usuário; cascade leva sessões, contas, playlists, itens de playlist e favoritos.
- Roda em `db.transaction()`.

---

## 7. Playlists (todas privadas)

**Regra de autorização única:** playlist de outro usuário responde **`404 Not Found`**, não 403. Não vazamos a existência de recurso alheio por enumeração de UUID.
`ForbiddenError` fica reservado para casos em que o recurso é comprovadamente visível ao
usuário mas a ação não é permitida — **nenhuma rota do MVP usa 403**, e isso é intencional.

### R16 · `GET /api/v1/playlists`

Query `page`, `limit`. `200` → `{ data: Playlist[], meta }` (só as do dono) · `401`

### R17 · `POST /api/v1/playlists`

```json
{ "name": "Treino", "description": "opcional" }
```

- `name`: 1..120, obrigatório, `.trim()` não-vazio · `description`: ≤ 500 ou ausente
- `201` → `Playlist` (`trackCount: 0`) · `400` · `401`
- Limite `MAX_PLAYLISTS_PER_USER = 50`; ao exceder → **422** `"Playlist limit reached"`

### R18 · `GET /api/v1/playlists/:id`

`200` → `PlaylistDetail` · `401` · `404` (inexistente **ou** de outro usuário)

### R19 · `PATCH /api/v1/playlists/:id`

Corpo igual ao POST, campos opcionais, vazio → 400. Atualiza `updated_at`.
`200` → `Playlist` · `400` · `401` · `404`

### R20 · `DELETE /api/v1/playlists/:id`

`204` · `401` · `404`. Em `db.transaction()`.

### R21 · `POST /api/v1/playlists/:id/tracks`

```json
{ "trackId": "uuid" }
```

- `201` → `PlaylistDetail` atualizado
- `400` uuid inválido · `401`
- `404` playlist inexistente/alheia **ou** faixa inexistente
- `409` faixa **já está** na playlist
- Limite `MAX_TRACKS_PER_PLAYLIST = 500` → **422**

### R22 · `DELETE /api/v1/playlists/:id/tracks/:trackId`

`204` · `401` · `404` playlist alheia/inexistente ou faixa não presente nela

---

## 8. Favoritos

### R23 · `GET /api/v1/favorites`

Query `page`, `limit`. `200` → `{ data: FavoriteItem[], meta }` ordenado por
`favoritedAt DESC` · `401`

### R24 · `POST /api/v1/favorites/:trackId`

- `201` → `FavoriteItem` · `400` · `401`
- `404` faixa inexistente · `409` já favoritada
- Insere com `onConflictDoNothing`, mas **verifica antes** para conseguir devolver 409
  de forma determinística.

### R25 · `DELETE /api/v1/favorites/:trackId`

`204` · `401` · `404` não estava nos favoritos

---

## 9. Health

### R01 · `GET /health` — liveness, **não toca no banco**

```json
{ "status": "ok", "uptime": 1234.5, "version": "1.0.0" }
```

### R02 · `GET /health/ready` — readiness, faz `SELECT 1`

- `200` → `{ "status": "ready", "database": "up" }`
- `503` → `{ "status": "unavailable", "database": "down" }` (envelope de erro **não** se aplica)

Ambas ficam **fora** do rate limit e **fora** do prefixo `/api/v1`.

---

## 10. OpenAPI

- `@fastify/swagger` com `transform` do `fastify-type-provider-zod` — os schemas Zod das
  rotas **são** a documentação. Nenhum schema JSON escrito à mão.
- Toda rota declara `schema.tags`, `schema.summary`, `schema.operationId`
  e o response de **todos** os status que pode emitir.
- Tags: `Health`, `Auth`, `Catalog`, `Profile`, `Library`.
- `securitySchemes`: `bearerAuth` (http/bearer) e `cookieAuth` (apiKey em cookie).
- `scripts/export-openapi.ts` gera `docs/openapi.json`; o CI regenera e **falha se houver
  diff** (F5-S01).
