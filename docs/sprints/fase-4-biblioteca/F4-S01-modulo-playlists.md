# F4-S01 — Módulo `playlists`

|                |                                                 |
| -------------- | ----------------------------------------------- |
| **Fase**       | F4 — Biblioteca                                 |
| **Branch**     | `feature/f4s01-modulo-playlists`                |
| **Depende de** | F3-S02                                          |
| **Entrega**    | R16–R22 — sete rotas, o maior módulo do projeto |

---

## 1. Prompt de abertura

```
Leia .agents/memory/PROGRESS.md e .agents/memory/DECISIONS.md para se contextualizar.
Leia também .agents/memory/F3-S02.md (padrão de rota protegida) e
.agents/memory/F2-S04.md (abordagem de join escolhida no catálogo).

Sprint alvo: docs/sprints/fase-4-biblioteca/F4-S01-modulo-playlists.md
Specs obrigatórias: docs/specs/03-contrato-da-api.md (§7),
                    docs/specs/04-autenticacao-e-seguranca.md (§3),
                    docs/specs/02-modelo-de-dados.md (§7)

Siga o protocolo de docs/specs/07-protocolo-dos-agentes.md:
entre em modo de planejamento, apresente o plano COMPLETO da sprint e
AGUARDE minha autorização explícita antes de escrever qualquer código.

Não toque em nenhum arquivo fora do blast radius declarado no sprint.
```

---

## 2. Objetivo

O módulo mais denso: CRUD de playlists mais gestão de faixas, com isolamento por usuário,
transações, conflitos e limites.

**A regra de ouro deste sprint: playlist de outro usuário responde 404, nunca 403** (D-31).
E o isolamento é feito **na cláusula `WHERE`**, nunca comparando em memória.

Escopo fixo por D-15: **sem `position`, sem reordenar, sem `isPublic`, sem compartilhar.**

---

## 3. Contratos esperados

Detalhamento completo por rota: **spec `03` §7**.

| Rota                                           | Status possíveis                           |
| ---------------------------------------------- | ------------------------------------------ |
| `GET /api/v1/playlists`                        | 200 · 401                                  |
| `POST /api/v1/playlists`                       | 201 · 400 · 401 · 422 (limite)             |
| `GET /api/v1/playlists/:id`                    | 200 · 401 · 404                            |
| `PATCH /api/v1/playlists/:id`                  | 200 · 400 · 401 · 404                      |
| `DELETE /api/v1/playlists/:id`                 | 204 · 401 · 404                            |
| `POST /api/v1/playlists/:id/tracks`            | 201 · 400 · 401 · 404 · 409 · 422 (limite) |
| `DELETE /api/v1/playlists/:id/tracks/:trackId` | 204 · 401 · 404                            |

Representações `Playlist` e `PlaylistDetail`: **spec `03` §3**. `PlaylistDetail.tracks`
ordenado por `addedAt ASC` (D-15).

Limites de `constants.ts`: `MAX_PLAYLISTS_PER_USER = 50` · `MAX_TRACKS_PER_PLAYLIST = 500`.

### Camadas

```ts
export class PlaylistsRepository {
  constructor(private readonly db: Database) {}
  listByUser(userId: string, p: { limit: number; offset: number }):
    Promise<{ rows: PlaylistRow[]; total: number }>;
  countByUser(userId: string): Promise<number>;
  findByIdForUser(id: string, userId: string): Promise<PlaylistDetailRow | null>;
  create(userId: string, data: { name: string; description?: string }): Promise<PlaylistRow>;
  update(id: string, userId: string, data: {...}): Promise<PlaylistRow | null>;
  delete(id: string, userId: string): Promise<boolean>;
  addTrack(playlistId: string, trackId: string): Promise<boolean>;   // false se já existia
  removeTrack(playlistId: string, trackId: string): Promise<boolean>;
  countTracks(playlistId: string): Promise<number>;
}
```

**Toda assinatura que toca uma playlist específica recebe `userId`.** Não existe
`findById(id)` sem dono — é assim que o 404 fica garantido por construção.

---

## 4. Blast radius

### Preencher (0 bytes hoje)

```
src/modules/playlists/playlists.schema.ts
src/modules/playlists/playlists.repository.ts
src/modules/playlists/playlists.service.ts
src/modules/playlists/playlists.routes.ts
```

### Criar

```
tests/unit/modules/playlists/playlists.service.test.ts
tests/integration/modules/playlists.repository.test.ts
```

### Editar

```
src/app.ts
.agents/memory/PROGRESS.md
.agents/memory/F4-S01.md
```

**Não toque em:** `src/modules/favorites/**` (F4-S02) · `src/db/**` · demais módulos.

---

## 5. Passo a passo

### 5.1 Isolamento por usuário — o ponto central

```ts
// ✅ o banco garante
.where(and(eq(playlists.id, id), eq(playlists.userId, userId)))

// ❌ nunca
const p = await repo.findById(id);
if (p.userId !== userId) throw new ForbiddenError();
```

Resultado vazio → `NotFoundError`. Playlist inexistente e playlist alheia são
**indistinguíveis** para o cliente (D-31).

Para as rotas de faixa, a verificação de posse acontece **antes** de tocar em
`playlist_tracks`: primeiro `findByIdForUser`, depois a mutação.

### 5.2 `POST /playlists` — limite

```ts
const count = await repo.countByUser(userId);
if (count >= MAX_PLAYLISTS_PER_USER) {
  throw new ValidationError('Playlist limit reached', { limit: MAX_PLAYLISTS_PER_USER });
}
```

`ValidationError` → **422** (regra de negócio), não 400 (que é erro de schema).

### 5.3 `POST /playlists/:id/tracks` — a rota mais complexa

Ordem obrigatória de verificação:

1. `findByIdForUser(playlistId, userId)` → `null` ⇒ **404**
2. a faixa existe? → `null` ⇒ **404**
3. `countTracks >= MAX_TRACKS_PER_PLAYLIST` ⇒ **422**
4. já está na playlist? ⇒ **409** (`ConflictError`)
5. inserir e devolver `PlaylistDetail` atualizado ⇒ **201**

O passo 4 usa uma consulta explícita mesmo com `onConflictDoNothing` disponível: só assim
o 409 é determinístico. Para evitar corrida entre 4 e 5, use `onConflictDoNothing()`
com `.returning()` — se voltar vazio, alguém inseriu no meio: responda 409 também.

Tudo dentro de `db.transaction()` (spec `02` §7).

**Esta rota precisa do repository de `tracks`.** Duas opções — escolha e registre:

- (a) `PlaylistsRepository.trackExists(trackId)` com um `select` simples
- (b) injetar `TracksRepository` no `PlaylistsService`

Prefira **(a)**: mantém o módulo autocontido e não cria acoplamento entre módulos, ao
custo de uma query trivial duplicada. **Repository não importa outro repository**
(spec `01` §1).

### 5.4 `DELETE /playlists/:id`

`db.transaction()`. O cascade da FK já apaga `playlist_tracks`, mas faça o `delete`
explícito dos itens antes para deixar a intenção legível — e porque um dia o cascade
pode mudar.

### 5.5 `PATCH /playlists/:id`

Mesmo padrão do `PATCH /me` (F3-S02): campos opcionais, `.refine` para rejeitar corpo
vazio com 400, `updatedAt: new Date()`.

### 5.6 Rotas

Todas com `onRequest: [fastify.requireAuth]`, `tags: ['Library']`, `security`,
`summary`, `operationId` e response schema de **todos** os status. Params com `z.uuid()`.

---

## 6. Casos de teste obrigatórios

### Unit — `playlists.service.test.ts`

| #   | Caso                                                         | Esperado                      |
| --- | ------------------------------------------------------------ | ----------------------------- |
| T1  | `list` monta `meta`                                          | igual ao padrão de F2-S03     |
| T2  | `create` com 49 playlists existentes                         | passa                         |
| T3  | `create` com 50                                              | lança `ValidationError` (422) |
| T4  | `getById` com repository `null`                              | `NotFoundError`               |
| T5  | `update` com `null`                                          | `NotFoundError`               |
| T6  | `delete` com `false`                                         | `NotFoundError`               |
| T7  | `addTrack` com playlist `null`                               | `NotFoundError`               |
| T8  | `addTrack` com faixa inexistente                             | `NotFoundError`               |
| T9  | `addTrack` com faixa já presente                             | `ConflictError`               |
| T10 | `addTrack` com 500 faixas                                    | `ValidationError`             |
| T11 | `removeTrack` com `false`                                    | `NotFoundError`               |
| T12 | Todo método que toca playlist repassa `userId` ao repository | asserção nos mocks            |

### Integração — `playlists.repository.test.ts` + rotas via `app.inject()`

| #   | Caso                                           | Esperado                                    |
| --- | ---------------------------------------------- | ------------------------------------------- |
| T13 | `POST /playlists`                              | 201, `trackCount: 0`                        |
| T14 | `POST` com `name: ""`                          | 400                                         |
| T15 | `POST` com `name` de 121 chars                 | 400                                         |
| T16 | `POST` sem token                               | 401                                         |
| T17 | `GET /playlists` só traz as do usuário         | A cria 2, B cria 1 → A vê 2                 |
| T18 | `GET /playlists/:id` de **outro** usuário      | **404**, não 403                            |
| T19 | `GET /playlists/:id` inexistente               | 404                                         |
| T20 | `PATCH` de playlist alheia                     | **404**                                     |
| T21 | `PATCH` com `{}`                               | 400                                         |
| T22 | `DELETE` de playlist alheia                    | **404**; a playlist de B continua existindo |
| T23 | `DELETE` própria                               | 204; `GET` seguinte 404                     |
| T24 | `DELETE` remove as linhas de `playlist_tracks` | contagem zero                               |
| T25 | `POST /:id/tracks` válido                      | 201; `PlaylistDetail` com a faixa           |
| T26 | `POST /:id/tracks` repetido                    | **409**                                     |
| T27 | `POST /:id/tracks` com `trackId` inexistente   | 404                                         |
| T28 | `POST /:id/tracks` em playlist alheia          | 404                                         |
| T29 | `POST /:id/tracks` com `trackId` não-UUID      | 400                                         |
| T30 | `DELETE /:id/tracks/:trackId` presente         | 204                                         |
| T31 | `DELETE /:id/tracks/:trackId` ausente          | 404                                         |
| T32 | 3 faixas adicionadas em sequência              | `tracks` ordenado por `addedAt ASC`         |
| T33 | `trackCount` reflete o número real             | após add/remove                             |
| T34 | Faixa apagada do catálogo                      | some da playlist (cascade)                  |
| T35 | Paginação de `GET /playlists` com 25 playlists | 2 páginas, `hasNext` correto                |

---

## 7. Definition of Done

```bash
docker compose up -d && pnpm db:migrate && tsx src/db/seed/seed.ts
pnpm typecheck && pnpm lint && pnpm format && pnpm test && pnpm build
pnpm dev
P=$(curl -s -X POST localhost:3000/api/v1/playlists -H "authorization: Bearer $TOKEN" \
  -H 'content-type: application/json' -d '{"name":"Treino"}' | jq -r .id)
T=$(curl -s 'localhost:3000/api/v1/tracks?limit=1' | jq -r '.data[0].id')
curl -s -X POST "localhost:3000/api/v1/playlists/$P/tracks" -H "authorization: Bearer $TOKEN" \
  -H 'content-type: application/json' -d "{\"trackId\":\"$T\"}" | jq '.tracks | length'
curl -s -o /dev/null -w '%{http_code}\n' -X POST "localhost:3000/api/v1/playlists/$P/tracks" \
  -H "authorization: Bearer $TOKEN" -H 'content-type: application/json' -d "{\"trackId\":\"$T\"}"  # 409
```

- [ ] T1–T35 verdes
- [ ] **Nenhuma rota devolve 403** (D-31) — confirme lendo os testes de isolamento
- [ ] Nenhum `findById` sem `userId` na assinatura do repository
- [ ] `addTrack` e `delete` dentro de `db.transaction()`
- [ ] `/docs` com as 7 rotas em `Library`
- [ ] PR verde; memória atualizada

---

## 8. Armadilhas conhecidas

1. **Buscar e comparar em memória** em vez de filtrar no `WHERE` é a falha de segurança
   mais provável deste sprint. Se você escreveu `if (p.userId !== userId)`, está errado.
2. **403 em vez de 404** vaza a existência do recurso. D-31 é explícito.
3. **PK composta transforma insert repetido em erro do Postgres** (`23505`), que sem
   tratamento vira 500. Verifique **antes** e devolva 409.
4. **`ValidationError` (422) vs erro de schema (400).** Limite excedido é regra de
   negócio: 422. Nome vazio é schema: 400.
5. **`trackCount` via `LEFT JOIN` + `GROUP BY` com `LIMIT`** conta errado. Subquery,
   como em F2-S03.
6. **Transação aninhada** — se `addTrack` já roda em `db.transaction()`, não abra outra
   dentro do repository. Passe o `tx` adiante ou mantenha a transação num nível só.
7. **`onConflictDoNothing().returning()` vazio** significa "já existia": trate como 409,
   não como sucesso silencioso.
8. **Não implemente `position` nem `isPublic`.** Fora de escopo (D-15). Se parecer
   necessário, pare e pergunte.

---

## 9. Registro na memória

- **`DECISIONS.md`** — a escolha da §5.3 (a ou b) e como a corrida do passo 4/5 foi tratada.
- **`PROGRESS.md`** — F4-S01 ✅, R16–R22 nos contratos, próximo = F4-S02.
- **`F4-S01.md`** — a ordem de verificação de `POST /:id/tracks` e a forma final do
  isolamento por `WHERE`. F4-S02 repete o padrão em escala menor.
