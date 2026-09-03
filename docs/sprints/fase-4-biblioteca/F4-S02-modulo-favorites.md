# F4-S02 — Módulo `favorites`

|                |                                  |
| -------------- | -------------------------------- |
| **Fase**       | F4 — Biblioteca                  |
| **Branch**     | `feature/f4s02-modulo-favorites` |
| **Depende de** | F3-S02 (independente de F4-S01)  |
| **Entrega**    | R23 · R24 · R25                  |

---

## 1. Prompt de abertura

```
Leia .agents/memory/PROGRESS.md e .agents/memory/DECISIONS.md para se contextualizar.
Leia também .agents/memory/F4-S01.md — favorites repete o padrão de isolamento e de
conflito estabelecido lá, em escala menor.

Sprint alvo: docs/sprints/fase-4-biblioteca/F4-S02-modulo-favorites.md
Specs obrigatórias: docs/specs/03-contrato-da-api.md (§8)

Siga o protocolo de docs/specs/07-protocolo-dos-agentes.md:
entre em modo de planejamento, apresente o plano COMPLETO da sprint e
AGUARDE minha autorização explícita antes de escrever qualquer código.

Não toque em nenhum arquivo fora do blast radius declarado no sprint.
```

---

## 2. Objetivo

O módulo mais simples da fase — três rotas sobre uma junção com PK composta. Deve sair
rápido **se** o padrão de F4-S01 for reaproveitado.

Favoritar vale **só para faixas**. Não existe favoritar artista nem playlist (spec `00` §3).

---

## 3. Contratos esperados

### R23 · `GET /api/v1/favorites`

Query `page`, `limit`. `200` → `{ data: FavoriteItem[], meta }` ordenado por
`favoritedAt DESC` · `401`.

### R24 · `POST /api/v1/favorites/:trackId`

`201` → `FavoriteItem` · `400` uuid inválido · `401` · `404` faixa inexistente ·
`409` já favoritada.

### R25 · `DELETE /api/v1/favorites/:trackId`

`204` · `400` · `401` · `404` não estava nos favoritos.

`FavoriteItem` = `Track` + `favoritedAt` (spec `03` §3).

### Camadas

```ts
export class FavoritesRepository {
  constructor(private readonly db: Database) {}
  listByUser(
    userId: string,
    p: { limit: number; offset: number },
  ): Promise<{ rows: FavoriteRow[]; total: number }>;
  exists(userId: string, trackId: string): Promise<boolean>;
  trackExists(trackId: string): Promise<boolean>;
  add(userId: string, trackId: string): Promise<FavoriteRow | null>; // null se já existia
  remove(userId: string, trackId: string): Promise<boolean>;
}
```

---

## 4. Blast radius

### Preencher (0 bytes hoje)

```
src/modules/favorites/favorites.schema.ts
src/modules/favorites/favorites.repository.ts
src/modules/favorites/favorites.service.ts
src/modules/favorites/favorites.routes.ts
```

### Criar

```
tests/unit/modules/favorites/favorites.service.test.ts
tests/integration/modules/favorites.repository.test.ts
```

### Editar

```
src/app.ts
.agents/memory/PROGRESS.md
.agents/memory/F4-S02.md
```

**Não toque em:** `src/modules/playlists/**` · `src/db/**` · demais módulos.

---

## 5. Passo a passo

### 5.1 Listagem

`favorites` × `tracks` × `artists`, filtrado por `favorites.user_id`, ordenado por
`favorites.created_at DESC` com desempate por `tracks.id ASC`.

O DTO é um `Track` completo (com `artist` embutido) mais `favoritedAt`. Reaproveite a
mesma abordagem de join escolhida em F2-S04 — consulte `.agents/memory/F2-S04.md`.

`COUNT(*)` com o **mesmo** `where`.

### 5.2 `POST /favorites/:trackId`

Ordem obrigatória:

1. faixa existe? → **404**
2. já favoritada? → **409**
3. inserir com `onConflictDoNothing().returning()`; vazio ⇒ corrida ⇒ **409**
4. devolver o `FavoriteItem` completo ⇒ **201**

Sem transação: é uma única inserção.

### 5.3 `DELETE /favorites/:trackId`

`delete().where(and(eq(userId), eq(trackId))).returning({ userId })`.
Vazio ⇒ `NotFoundError` (404). O `userId` no `where` é o isolamento — sem ele, um usuário
apagaria o favorito de outro.

### 5.4 Rotas

`onRequest: [fastify.requireAuth]`, `tags: ['Library']`, params com `z.uuid()`,
response schema de todos os status.

---

## 6. Casos de teste obrigatórios

### Unit — `favorites.service.test.ts`

| #   | Caso                                      | Esperado           |
| --- | ----------------------------------------- | ------------------ |
| T1  | `list` monta `meta`                       | padrão             |
| T2  | `add` com faixa inexistente               | `NotFoundError`    |
| T3  | `add` já favoritada                       | `ConflictError`    |
| T4  | `add` com `null` do repository (corrida)  | `ConflictError`    |
| T5  | `remove` com `false`                      | `NotFoundError`    |
| T6  | Todo método repassa `userId`              | asserção nos mocks |
| T7  | DTO tem `favoritedAt` e `artist` embutido | asserção por chave |

### Integração — `favorites.repository.test.ts` + rotas via `app.inject()`

| #   | Caso                                             | Esperado                            |
| --- | ------------------------------------------------ | ----------------------------------- |
| T8  | `POST /favorites/:trackId`                       | 201 com o `FavoriteItem`            |
| T9  | `POST` repetido                                  | **409**                             |
| T10 | `POST` com uuid inexistente                      | 404                                 |
| T11 | `POST` com id não-UUID                           | 400                                 |
| T12 | `POST` sem token                                 | 401                                 |
| T13 | `GET /favorites` só traz os do usuário           | A favorita 2, B favorita 1 → A vê 2 |
| T14 | `GET /favorites` ordenado por `favoritedAt DESC` | mais recente primeiro               |
| T15 | `GET /favorites` vazio                           | `data: []`, `meta.total: 0`         |
| T16 | `DELETE` de favorito existente                   | 204                                 |
| T17 | `DELETE` de favorito inexistente                 | 404                                 |
| T18 | **B tenta apagar o favorito de A**               | 404; o de A continua lá             |
| T19 | Mesma faixa favoritada por 2 usuários            | ambos os registros coexistem        |
| T20 | Faixa apagada do catálogo                        | some dos favoritos (cascade)        |
| T21 | Usuário apagado (`DELETE /me`)                   | favoritos somem (cascade)           |
| T22 | Paginação com 25 favoritos                       | 2 páginas, `hasNext` correto        |

> **T18 e T19 são o coração deste módulo.** A PK composta `(user_id, track_id)` precisa
> permitir a mesma faixa para usuários diferentes e impedir a mesma faixa duas vezes para
> o mesmo usuário.

---

## 7. Definition of Done

```bash
docker compose up -d && pnpm db:migrate && tsx src/db/seed/seed.ts
pnpm typecheck && pnpm lint && pnpm format && pnpm test && pnpm build
pnpm dev
T=$(curl -s 'localhost:3000/api/v1/tracks?limit=1' | jq -r '.data[0].id')
curl -s -X POST "localhost:3000/api/v1/favorites/$T" -H "authorization: Bearer $TOKEN" | jq
curl -s -o /dev/null -w '%{http_code}\n' -X POST "localhost:3000/api/v1/favorites/$T" \
  -H "authorization: Bearer $TOKEN"                                              # 409
curl -s localhost:3000/api/v1/favorites -H "authorization: Bearer $TOKEN" | jq '.meta'
curl -s -o /dev/null -w '%{http_code}\n' -X DELETE "localhost:3000/api/v1/favorites/$T" \
  -H "authorization: Bearer $TOKEN"                                              # 204
```

- [ ] T1–T22 verdes
- [ ] T18 e T19 conferidos com atenção
- [ ] `FavoriteItem` traz `artist` embutido, igual ao `Track` do catálogo
- [ ] Nenhuma rota devolve 403
- [ ] `/docs` com as 3 rotas em `Library`
- [ ] PR verde; memória atualizada

---

## 8. Armadilhas conhecidas

1. **`DELETE` sem `userId` no `where`** deixa um usuário apagar favorito de outro. T18
   existe para pegar isso. É a falha de segurança mais provável aqui.
2. **PK composta lança `23505` no insert repetido**; sem verificação prévia vira 500 em
   vez de 409.
3. **`favoritedAt` vem de `favorites.created_at`**, não de `tracks.created_at`. Confundir
   os dois quebra a ordenação de forma silenciosa (T14).
4. **Ordenação sem desempate** repete linha entre páginas. `[desc(favorites.createdAt), asc(tracks.id)]`.
5. **`POST` devolvendo só `{ok: true}`** em vez do `FavoriteItem` obriga o app a fazer
   outra requisição. A spec pede o item completo.
6. **Não crie favoritar artista nem playlist.** Fora de escopo (spec `00` §3).

---

## 9. Registro na memória

- **`PROGRESS.md`** — F4-S02 ✅, R23/R24/R25 nos contratos, próximo = F4-S03.
- **`F4-S02.md`** — como a PK composta foi usada para o 409 e o join do `FavoriteItem`.
