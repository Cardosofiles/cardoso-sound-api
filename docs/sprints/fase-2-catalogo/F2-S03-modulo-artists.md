# F2-S03 — Módulo `artists`

|                |                                                           |
| -------------- | --------------------------------------------------------- |
| **Fase**       | F2 — Catálogo                                             |
| **Branch**     | `feature/f2s03-modulo-artists`                            |
| **Depende de** | F2-S02                                                    |
| **Entrega**    | R04 `GET /api/v1/artists` · R05 `GET /api/v1/artists/:id` |

> **Este é o sprint de referência do padrão de módulo.** F2-S04, F3-S02, F4-S01 e F4-S02
> repetem exatamente esta forma. Faça-o bem.

---

## 1. Prompt de abertura

```
Leia .agents/memory/PROGRESS.md e .agents/memory/DECISIONS.md para se contextualizar.

Sprint alvo: docs/sprints/fase-2-catalogo/F2-S03-modulo-artists.md
Specs obrigatórias: docs/specs/01-arquitetura.md (§1, §7),
                    docs/specs/03-contrato-da-api.md (§1, §3, §4)

Siga o protocolo de docs/specs/07-protocolo-dos-agentes.md:
entre em modo de planejamento, apresente o plano COMPLETO da sprint e
AGUARDE minha autorização explícita antes de escrever qualquer código.

Não toque em nenhum arquivo fora do blast radius declarado no sprint.
```

---

## 2. Objetivo

Entregar o primeiro módulo de domínio completo, seguindo à risca as quatro camadas e a
injeção por construtor. A partir daqui o app Flutter já consegue listar artistas.

---

## 3. Contratos esperados

### R04 · `GET /api/v1/artists`

Query: `page` (≥1, default 1) · `limit` (1..100, default 20) · `search` (1..100, opcional).
`search` faz `ILIKE '%termo%'` em `artists.name`.
`200` → `{ data: Artist[], meta }` · `400` query inválida.

### R05 · `GET /api/v1/artists/:id`

`200` → `Artist & { tracks: Track[] }`, faixas ordenadas por `title ASC`, **sem paginação**.
`400` id não-UUID · `404` inexistente.

Representações `Artist`, `ArtistSummary` e `Track`: **spec `03` §3**.

### Camadas

```ts
// artists.schema.ts
export const listArtistsQuerySchema: ZodType;
export const artistParamsSchema: ZodType; // { id: uuid }
export const artistSchema: ZodType; // Artist
export const artistDetailSchema: ZodType; // Artist & { tracks: Track[] }
export const listArtistsResponseSchema: ZodType; // { data, meta }
export type ListArtistsQuery = z.infer<typeof listArtistsQuerySchema>;

// artists.repository.ts
export class ArtistsRepository {
  constructor(private readonly db: Database) {}
  list(input: {
    limit: number;
    offset: number;
    search?: string;
  }): Promise<{ rows: ArtistRow[]; total: number }>;
  findById(id: string): Promise<ArtistDetailRow | null>;
}

// artists.service.ts
export class ArtistsService {
  constructor(private readonly repo: ArtistsRepository) {}
  list(query: ListArtistsQuery): Promise<{ data: Artist[]; meta: PaginationMeta }>;
  getById(id: string): Promise<ArtistDetail>; // lança NotFoundError
}

// artists.routes.ts
export const artistsRoutes: FastifyPluginAsyncZod;
```

---

## 4. Blast radius

### Preencher (0 bytes hoje)

```
src/modules/artists/artists.schema.ts
src/modules/artists/artists.repository.ts
src/modules/artists/artists.service.ts
src/modules/artists/artists.routes.ts
```

### Criar

```
tests/unit/modules/artists/artists.service.test.ts
tests/integration/modules/artists.repository.test.ts
```

### Editar

```
src/app.ts                       # registrar artistsRoutes com prefix /api/v1
.agents/memory/PROGRESS.md
.agents/memory/F2-S03.md
```

**Não toque em:** `src/modules/tracks/**` (F2-S04) · `src/db/**` · `src/plugins/**` ·
`src/shared/**`.

---

## 5. Passo a passo

### 5.1 `artists.schema.ts`

Zod 4. Query com `z.coerce.number().int().min(1).default(1)` para `page` e
`.min(1).max(MAX_PAGE_SIZE).default(DEFAULT_PAGE_SIZE)` para `limit` — `coerce` porque
querystring chega como string.

Response schemas declarados **explicitamente**: o serializer do
`fastify-type-provider-zod` remove tudo que não estiver declarado. É essa poda que impede
vazamento de campo em qualquer módulo.

`.describe()` em cada campo — vira a documentação no Swagger sem esforço extra.

### 5.2 `artists.repository.ts`

- `list`: duas queries — a página e o `COUNT(*)` com o **mesmo** `where`. Extraia a
  condição para uma variável e reutilize; where divergente entre as duas é o bug mais
  comum de paginação.
- `trackCount`: subquery correlacionada ou `LEFT JOIN + GROUP BY`. Prefira a subquery —
  o `GROUP BY` com `LIMIT` sobre o join produz contagem errada quando um artista não tem
  faixas.
- `findById`: use `db.query.artists.findFirst({ where, with: { tracks: … } })`, com
  `orderBy` nas faixas. É para isso que as `relations` existem (F2-S01).
- **Repository devolve linha crua**; quem monta o DTO é o service.

### 5.3 `artists.service.ts`

- `list`: chama `toOffset`, delega, monta `buildPaginationMeta`, mapeia linha → DTO.
- `getById`: `null` do repository → `throw new NotFoundError('Artist not found')`.
- **Zero import de `fastify`.** Zero `request`, zero `reply`.

### 5.4 `artists.routes.ts`

```ts
export const artistsRoutes: FastifyPluginAsyncZod = async (fastify) => {
  const repo = new ArtistsRepository(db);
  const service = new ArtistsService(repo);

  fastify.get(
    '/artists',
    {
      schema: {
        tags: ['Catalog'],
        summary: 'Lista artistas do catálogo',
        operationId: 'listArtists',
        querystring: listArtistsQuerySchema,
        response: { 200: listArtistsResponseSchema },
      },
    },
    async (request) => service.list(request.query),
  );
  // …
};
```

Handler = uma linha delegando. Sem `try/catch` — o error handler central resolve.
Rota declarada **sem** o prefixo (`/artists`, não `/api/v1/artists`); o prefixo vem do
`register` em `app.ts`.

### 5.5 `app.ts`

```ts
await app.register(artistsRoutes, { prefix: API_PREFIX });
```

Depois dos plugins de borda, antes de nada mais.

---

## 6. Casos de teste obrigatórios

### Unit — `artists.service.test.ts` (repository dublado, sem banco)

| #   | Caso                                                     | Esperado                                             |
| --- | -------------------------------------------------------- | ---------------------------------------------------- |
| T1  | `list` com 40 total, page 1 limit 20                     | `meta.totalPages 2`, `hasNext true`, `hasPrev false` |
| T2  | `list` page 2                                            | `hasNext false`, `hasPrev true`                      |
| T3  | `list` com total 0                                       | `data: []`, `totalPages 1`, `hasNext false`          |
| T4  | `list` repassa `search` ao repository                    | mock chamado com o termo                             |
| T5  | `list` calcula offset certo (page 3, limit 20)           | repository chamado com `offset: 40`                  |
| T6  | `getById` com repository devolvendo `null`               | lança `NotFoundError`                                |
| T7  | `getById` com linha válida                               | DTO no formato de `Artist & { tracks }`              |
| T8  | DTO **não** contém campo cru do banco (`artist_id` etc.) | asserção por chave                                   |

### Integração — `artists.repository.test.ts` (harness + seed)

| #   | Caso                                                | Esperado                                                          |
| --- | --------------------------------------------------- | ----------------------------------------------------------------- |
| T9  | `list` sem filtro após seed                         | `total === 8`                                                     |
| T10 | `list` com `limit: 5`                               | `rows.length === 5`, `total === 8`                                |
| T11 | `search` com termo parcial minúsculo                | casa artista com maiúscula (ILIKE)                                |
| T12 | `search` sem correspondência                        | `rows: []`, `total: 0`                                            |
| T13 | `trackCount` de um artista do seed                  | `5`                                                               |
| T14 | `findById` de id inexistente                        | `null`                                                            |
| T15 | `findById` traz as faixas ordenadas por `title ASC` | ordem verificada                                                  |
| T16 | Artista sem faixa nenhuma                           | `trackCount: 0` e `tracks: []` (insira um artista extra no teste) |

---

## 7. Definition of Done

```bash
docker compose up -d && pnpm db:migrate && tsx src/db/seed/seed.ts
pnpm typecheck && pnpm lint && pnpm format && pnpm test && pnpm build
pnpm dev
curl -s 'localhost:3333/api/v1/artists?limit=3' | jq
curl -s 'localhost:3333/api/v1/artists?search=xxx' | jq '.meta'
curl -s localhost:3333/api/v1/artists/<uuid-do-seed> | jq '.tracks | length'
curl -s -o /dev/null -w '%{http_code}\n' localhost:3333/api/v1/artists/nao-e-uuid   # 400
```

- [ ] T1–T16 verdes
- [ ] `/docs` mostra as duas rotas na tag `Catalog`, com schemas
- [ ] Lint de `boundaries` passa — prova de que routes não importa `src/db`
- [ ] `artists.service.ts` não importa nada de `fastify`
- [ ] Nenhuma chave inesperada na resposta (T8)
- [ ] PR verde; memória atualizada

---

## 8. Armadilhas conhecidas

1. **`COUNT` com `where` diferente do da página** faz `total` mentir e `hasNext` errar.
   Extraia a condição.
2. **`LEFT JOIN` + `GROUP BY` + `LIMIT`** conta errado. Use subquery para `trackCount`.
3. **Querystring é string.** Sem `z.coerce`, `page=2` chega como `"2"` e o `.min(1)`
   numérico rejeita com 400.
4. **`db.query.artists.findFirst` exige as `relations`** registradas no barrel (F2-S01).
   Sem elas: erro em runtime, não em compilação.
5. **Não instancie repository/service em escopo de módulo.** Dentro do plugin de rota,
   para que o teste possa construir a instância com um dublê.
6. **`response` schema não declarado = resposta não serializada pelo Zod**, e o campo cru
   vaza. Declare todos os status que a rota emite.
7. **ILIKE com `%` vindo do usuário** (`search=%`) casa tudo. Não é vulnerabilidade
   (é parâmetro preparado), mas escape `%` e `_` se quiser comportamento previsível —
   registre a escolha no `F2-S03.md`.

---

## 9. Registro na memória

- **`PROGRESS.md`** — F2-S03 ✅, R04 e R05 em "Contratos já entregues", próximo = F2-S04.
- **`F2-S03.md`** — a forma final das 4 camadas. **É o modelo que F2-S04, F3-S02, F4-S01
  e F4-S02 vão copiar** — descreva-a bem, incluindo como o `trackCount` foi resolvido.
