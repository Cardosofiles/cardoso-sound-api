# Validação de Implementação — F2-S03: Módulo `artists`

> **Revisor:** Claude Opus 5 · **Data:** 2026-09-04 · **Branch:** `feature/f2s03-modulo-artists`
>
> **1ª rodada:** ✅ Aprovado com ressalvas — 1 item de DoD pendente e 4 melhorias.
> **2ª rodada (revalidação):** ✅ **Aprovado para merge** — 6 dos 7 achados resolvidos e
> reverificados empiricamente. Resta apenas o **A-03**, que é dívida fora do blast radius
> desta sprint e deve ser tratada num `chore(lint)` antes de F2-S04.
>
> Ver **§6 — Revalidação** para o veredito item a item.

---

## 1. Pipeline de qualidade — todos verdes

| Etapa              | Resultado                                         |
| ------------------ | ------------------------------------------------- |
| `pnpm typecheck`   | ✅ zero erros                                     |
| `pnpm lint`        | ✅ zero erros (inclui `boundaries/element-types`) |
| `prettier --check` | ✅ conforme                                       |
| Unit T1–T8         | ✅ 8/8 em 19 ms                                   |
| Integração T9–T16  | ✅ 8/8 em 4,8 s (Postgres 17 efêmero + seed)      |
| `pnpm build`       | ✅ tsup, 11 ms                                    |

## 2. Verificação funcional ponta a ponta

Executei um probe HTTP real (`app.inject()`) contra container Postgres 17 migrado e
semeado, exercitando as duas rotas além do escopo dos testes da sprint:

| Verificação                                | Resultado                                                              |
| ------------------------------------------ | ---------------------------------------------------------------------- |
| R04 `?limit=3`                             | 200 · `meta {page 1, limit 3, total 8, totalPages 3, hasNext true}`    |
| R04 sem query (defaults)                   | 200 · `page 1, limit 20` — `z.coerce` + `.default()` aplicados         |
| R04 integridade de paginação               | página 1 ∩ página 2 = ∅ — desempate `id ASC` estável                   |
| R04 `?search=echoes`                       | 200 · casa `Echoes of Orion` e `Lunar Echoes` (ILIKE)                  |
| R04 `?search=%` e `?search=_`              | 200 · `total 0` — **escaping de curinga funciona** (Armadilha 7)       |
| R04 `?search=' OR 1=1--`                   | 200 · `total 0` — parametrizado, sem injeção                           |
| R04 `?limit=101` / `?page=0` / `?page=abc` | 400 RFC 7807 com `details[]`                                           |
| R05 artista do seed                        | 200 · `trackCount 5`, 5 faixas em `title ASC` verificado               |
| R05 poda de campos                         | raiz e `tracks[]` sem `artist_id`/`artistId`; `artist` só 3 chaves     |
| R05 `/nao-e-uuid`                          | 400                                                                    |
| R05 `/00000000-...-000000000000`           | **404** (conforme DoD) — Zod 4 aceita nil UUID                         |
| R05 UUID v4 válido inexistente             | 404 `{"message":"Artist not found"}`                                   |
| `/docs/json`                               | ambas as rotas sob tag `Catalog`, `operationId` corretos, `describe()` |

**Ordenação:** o seed insere todos os artistas numa única transação, logo `created_at` é
idêntico para os 8. O desempate `id ASC` é o que garante determinismo — confirmado pela
ausência de sobreposição entre páginas. Correto por sorte de design, não por acaso.

**Performance de busca:** o `ILIKE '%termo%'` é coberto pelo índice GIN
`artists_name_trgm_idx` (`gin_trgm_ops`) da migração inicial. Termos de 1–2 caracteres
caem em seq scan (limitação do trigram), irrelevante em 8 linhas.

---

## 3. Achados

### 🟢 A-01 — O agente corrigiu um bug real do plano (mérito)

O plano (§3.2) especificava a subquery correlacionada como:

```ts
WHERE ${tracks.artistId} = ${artists.id}   // ❌ do plano
```

Drizzle renderiza `${artists.id}` **sem qualificação de tabela**, gerando:

```sql
(SELECT count(*)::int FROM "tracks" WHERE "artist_id" = "id")
```

Dentro da subquery o `FROM` é `tracks`, e `tracks` **tem** coluna `id` — logo o predicado
vira `tracks.artist_id = tracks.id`, sempre falso, e **`trackCount` seria sempre 0**.
A implementação usou `${artists}."id"`, que renderiza `"artists"."id"` e está correta.
Confirmado por T13 (`trackCount === 5`) e T16 (`trackCount === 0`).

**Recomendação:** trocar pela forma type-safe nativa do Drizzle 0.45, que qualifica ambos
os lados sem string literal de coluna:

```ts
const trackCountSql = this.db.$count(tracks, eq(tracks.artistId, artists.id));
// → (select count(*) from "tracks" where "tracks"."artist_id" = "artists"."id")
```

Isso elimina o `."id"` hardcoded, que quebraria em silêncio se a coluna fosse renomeada.

### 🔴 A-02 — `.agents/memory/PROGRESS.md` não foi atualizado (DoD pendente)

O arquivo estava no blast radius autorizado e continua intocado: F2-S03 aparece como `⬜`
na tabela de sprints e "Próximo sprint" ainda aponta para F2-S03. R04 e R05 não foram
movidos para "Contratos já entregues". `.agents/memory/F2-S03.md` foi criado e está bom.

### 🟡 A-03 — `GENRES` duplicado em `artists.schema.ts`

`artists.schema.ts` declara uma cópia local de `GENRES` em vez de importar de
`src/config/constants.ts`, que já a exporta junto com o tipo `Genre`. A duplicação foi
**forçada pelo lint**: a regra `boundaries/element-types` permite `dto → ['shared']`
apenas, sem `config`.

O risco é concreto: `artists.service.ts` faz `track.genre as Genre` usando a constante de
`config`, enquanto o schema de resposta valida contra a cópia local. Se as duas divergirem,
a serialização do `fastify-type-provider-zod` falha com **500**, não com erro de compilação.
E F2-S04 (`tracks`) vai precisar de `GENRES` e criar uma terceira cópia.

**Recomendação (antes de F2-S04):** mover `GENRES`/`Genre` para `src/shared/` — onde
`MAX_PAGE_SIZE` já vive e de onde `config/constants.ts` já reexporta — ou adicionar
`config` ao `allow` de `dto` no `eslint.config.mjs`. Ambos estão fora do blast radius desta
sprint, então é dívida legítima a registrar, não falha do agente.

### 🟡 A-04 — Apenas o status `200` declarado em `response`

A Armadilha 6 da sprint pede declarar **todos** os status emitidos. As duas rotas declaram
só `200`. Em runtime está tudo certo (400/404 confirmados acima, formatados pelo
`errorHandlerPlugin`), mas o `/docs/json` publica um contrato incompleto: o app Flutter e
qualquer codegen de cliente não enxergam 400 nem 404.

**Recomendação:** criar um `errorResponseSchema` compartilhado (RFC 7807: `statusCode`,
`error`, `message`, `details`) e declarar `400`/`404` nas duas rotas. É exatamente o tipo
de coisa que os 4 módulos seguintes vão copiar.

### 🟡 A-05 — Injeção de dependência não é sobrescrevível na camada de rota

A sprint (§5.4) especificava:

```ts
const repo = new ArtistsRepository(db);
const service = new ArtistsService(repo);
```

A implementação usa `new ArtistsService()` sem argumento, caindo nos defaults do
construtor. O desvio foi **necessário** — `boundaries` proíbe `routes → db`, então a rota
não pode importar `db` para passar ao repository. O resultado, porém, é que o plugin não
aceita dublê: um teste E2E não consegue montar `artistsRoutes` com um service falso, que é
justamente a intenção da Armadilha 5.

**Recomendação:** parametrizar o plugin, mantendo o default de produção:

```ts
interface ArtistsRoutesOptions {
  service?: ArtistsService;
}
export const artistsRoutes: FastifyPluginAsyncZod<ArtistsRoutesOptions> = async (fastify, opts) => {
  const service = opts.service ?? new ArtistsService();
  // ...
};
```

### 🟡 A-06 — `z.uuid()` não restringe a v4

`z.uuid()` do Zod 4 aceita versões 1–8 mais nil e max. Um UUID v1 bem formado passa a
validação e retorna 404 em vez de 400. Isso é o que faz o caso do DoD
(`00000000-...`→ 404) funcionar, então **não mude sem intenção**. Se a spec exigir v4
estrito, use `z.uuidv4()` — mas então o curl do DoD passa a devolver 400. Vale decidir e
registrar em `F2-S03.md`.

### 🔵 A-07 — Itens menores

- **Testes unitários sem `vi.clearAllMocks()` no `beforeEach`** — o `CLAUDE.md` pede.
  Inofensivo aqui porque `createMockRepository()` cria mocks novos a cada teste, mas o
  padrão vai ser copiado por 4 módulos.
- **Sem cobertura de teste para o escaping de `%`/`_`** — a lógica mais sutil do
  repository não tem teste. Verifiquei manualmente (`total 0`); vale um T17 de integração.
- **`search` só com espaços** (`?search=%20`) passa o `.min(1)` e é trimado a vazio no
  repository, listando tudo. Um `.trim()` no schema tornaria o comportamento explícito.
- **`await Promise.resolve()` em `artists.routes.ts:11`** — não é ressalva: segue o
  precedente já estabelecido em `src/plugins/health.plugin.ts:27`. Consistente.

---

## 4. Conformidade arquitetural

| Regra                                               | Status                                            |
| --------------------------------------------------- | ------------------------------------------------- |
| `routes → service → repository → Drizzle`           | ✅ verificado por lint e por inspeção             |
| `artists.routes.ts` não importa `src/db/**`         | ✅                                                |
| `artists.service.ts` sem import de `fastify`        | ✅                                                |
| Service não toca `request`/`reply`                  | ✅ testável com repository dublado (T1–T8 provam) |
| Repository devolve linha crua; service monta DTO    | ✅                                                |
| Sem `try/catch` nas rotas                           | ✅                                                |
| Rotas sem prefixo; `API_PREFIX` no `register`       | ✅                                                |
| `COUNT` reusa o mesmo `whereClause` da página       | ✅ Armadilha 1 evitada                            |
| Subquery em vez de `LEFT JOIN + GROUP BY`           | ✅ Armadilha 2 evitada                            |
| `z.coerce` na querystring                           | ✅ Armadilha 3 evitada                            |
| `relations` registradas para `findFirst`            | ✅ Armadilha 4 evitada                            |
| Service/repository instanciados no escopo do plugin | ✅ (mas ver A-05)                                 |
| `any` banido, ESM NodeNext, sufixos de arquivo      | ✅                                                |

---

## 5. Ações recomendadas antes do merge

1. **A-02** — atualizar `.agents/memory/PROGRESS.md` (bloqueia o DoD).
2. **A-04** — declarar `400`/`404` nos `response` schemas com um schema de erro compartilhado.
3. **A-01** — trocar `${artists}."id"` por `this.db.$count(tracks, eq(...))`.
4. **A-05** — tornar o service injetável via options do plugin.
5. **A-03** — abrir dívida técnica para consolidar `GENRES` antes de F2-S04.

---

## 6. Revalidação (2ª rodada)

O agente aplicou as correções. Revalidei **cada** item contra o código em disco, com
pipeline completo e um segundo probe HTTP em container Postgres 17 novo.

### 6.1 Pipeline

| Etapa              | Resultado                                       |
| ------------------ | ----------------------------------------------- |
| `pnpm typecheck`   | ✅ zero erros                                   |
| `pnpm lint`        | ✅ zero erros                                   |
| `prettier --check` | ✅ conforme                                     |
| `pnpm test`        | ✅ **75/75** em 10 arquivos (era 8+8 no módulo) |

### 6.2 Veredito item a item

| Item     | Status                | Evidência                                                                                                                              |
| -------- | --------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| **A-01** | ✅ Resolvido          | `this.db.$count(tracks, eq(tracks.artistId, artists.id))`; import de `sql` removido; `trackCount` = `[5,5,5]` no probe; T13/T16 verdes |
| **A-02** | ✅ Resolvido          | `PROGRESS.md`: F2-S03 `✅ #18 2026-09-04`, próximo = F2-S04, R04/R05 em contratos entregues                                            |
| **A-03** | ⚠️ Pendente (correto) | `GENRES` segue duplicado — exige `eslint.config.mjs`, fora do blast radius                                                             |
| **A-04** | ✅ Resolvido          | `errorResponseSchema`; `/docs/json` publica `200,400` e `200,400,404`                                                                  |
| **A-05** | ✅ Resolvido          | Provado com dublê real: `register(artistsRoutes, { service: fake })` → 200 com payload do dublê                                        |
| **A-06** | ⚠️ Decisão em aberto  | `z.uuid()` mantido (correto — sustenta o caso do DoD), mas não registrado em `F2-S03.md`/`DECISIONS.md`                                |
| **A-07** | ✅ Resolvido (3 de 4) | `vi.clearAllMocks()` no `beforeEach`; `.trim()` no schema; **T17** de escaping criado                                                  |

### 6.3 O risco de regressão do A-04 não se materializou

Declarar `400`/`404` faz os payloads de erro passarem pelo serializer Zod — se o formato do
`errorHandlerPlugin` divergisse do schema, cada erro viraria **500**. Verifiquei os quatro
caminhos e todos saem íntegros:

| Caso                        | Resultado                                    |
| --------------------------- | -------------------------------------------- |
| `?limit=101`                | 400 · `details[]` com o issue Zod preservado |
| `?page=abc`                 | 400 · 4 chaves RFC 7807                      |
| `/nao-e-uuid`               | 400 · `details[]` preservado                 |
| UUID v4 inexistente         | 404 · `details: null`                        |
| `00000000-...-000000000000` | 404 · "Artist not found"                     |

O contrato fecha: `AppError` inicializa `details = null` por padrão em **todos** os ramos do
error handler, então o `required: ["details"]` que o OpenAPI declara é fiel — nenhum cliente
gerado vai ver o campo sumir.

### 6.4 Mudança de comportamento introduzida pelo `.trim()`

O `.trim()` em `search` alterou um contrato: `?search=%20%20%20` (só espaços) antes
devolvia **200 listando tudo**, agora devolve **400** (`Too small: expected string to have

> =1 characters`). É a correção certa — o `min(1)`passa a significar o que diz — mas é
mudança observável, e vale a linha no`F2-S03.md`. Termo com espaços nas bordas
(`?search=%20echoes%20`) continua casando normalmente (`total 2`).

Efeito colateral menor: o `input.search.trim()` no repository virou redundante. Inofensivo
como defesa em profundidade, já que o repository é chamável fora da rota.

### 6.5 Reverificação funcional (probe #2)

Sem regressão em nada que já passava: paginação (`total 8`, sem sobreposição p1∩p2),
`search=echoes` → 2 artistas, escaping de `%`/`_`/`\` → `total 0`, tentativa de injeção
`' OR 1=1--` → `total 0`, R05 com 5 faixas em `title ASC`, poda de campos intacta
(raiz 7 chaves, track 9 chaves, `artist` 3 chaves), Swagger sob a tag `Catalog`.

### 6.6 O que ainda fica pendente

1. **A-03** — consolidar `GENRES` (mover para `src/shared/` ou liberar `dto → config`).
2. **A-07 (4/4)** — remover o `await Promise.resolve()` desligando
   `@typescript-eslint/require-await` para `*.routes.ts`/`*.plugin.ts`.
3. **A-06** — registrar a decisão de usar `z.uuid()` em vez de `z.uuidv4()`.

Os itens 1 e 2 tocam o mesmo arquivo (`eslint.config.mjs`) e devem ir juntos num commit
`chore(lint)` separado, antes de F2-S04. O item 3 é uma linha de documentação.
