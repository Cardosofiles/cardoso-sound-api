# 01 — Arquitetura

> Clean Architecture simplificada, modular por domínio. As fronteiras abaixo são
> **verificadas por lint** (`eslint-plugin-boundaries`), não apenas convenção.

---

## 1. Fluxo de dependência

Uma única direção. Nunca o contrário, nunca atalho.

```
HTTP ──▶ *.routes.ts ──▶ *.service.ts ──▶ *.repository.ts ──▶ src/db/ ──▶ PostgreSQL
              │                │                  │
              └── *.schema.ts (Zod DTO) ──────────┘
```

| Camada              | Pode importar                         | **Nunca** pode                                     |
| ------------------- | ------------------------------------- | -------------------------------------------------- |
| `*.routes.ts`       | service, schema, shared, config       | `src/db/**`, Drizzle, SQL, outro `*.repository.ts` |
| `*.service.ts`      | repository, schema, shared, config    | `FastifyRequest`, `FastifyReply`, `fastify`        |
| `*.repository.ts`   | `src/db/**`, schema, shared, config   | outro repository, service, routes                  |
| `*.schema.ts` (DTO) | zod, shared                           | qualquer camada                                    |
| `src/plugins/**`    | shared, config, `src/modules/auth/**` | modules de domínio                                 |
| `src/shared/**`     | nada do projeto (folha)               | tudo                                               |

**Regra prática que resolve 90% das dúvidas:** se o arquivo precisa de `request` ou `reply`,
ele é uma rota. Se precisa de `db`, é um repository. O que sobra é service.

---

## 2. Estrutura de pastas

Já existe no scaffold. **Não crie pastas novas** sem uma decisão registrada em `DECISIONS.md`.

```
src/
├── config/          env.ts (Zod), constants.ts
├── db/              client.ts, migrate.ts, schema/*.schema.ts (Drizzle), seed/
├── modules/         artists · auth · favorites · playlists · tracks · users
├── plugins/         cors · error-handler · helmet · rate-limit · swagger · under-pressure
├── shared/          errors/ · types/ · utils/
├── jobs/            runner.ts — permanece VAZIO no MVP
├── app.ts           factory: monta e devolve a instância Fastify
└── server.ts        bootstrap: listen + graceful shutdown
```

### Armadilha de nomenclatura

`*.schema.ts` significa **duas coisas diferentes**:

- `src/db/schema/tracks.schema.ts` → definição de tabela **Drizzle**
- `src/modules/tracks/tracks.schema.ts` → **DTO Zod** de request/response

Nunca importe um no lugar do outro. O DTO **não** deriva da tabela via
`createSelectSchema`: a resposta da API é um contrato próprio e estável, escrito à mão.

---

## 3. Composição

### `src/app.ts` — factory pura

```ts
export async function buildApp(): Promise<FastifyInstance> {
  /* … */
}
```

- **Zero efeito colateral em tempo de import.** Nada de `listen`, nada de `process.exit`,
  nada de conexão aberta no topo do módulo. Isso é o que permite ao teste chamar
  `buildApp()` e usar `app.inject()`.
- Registra, **nesta ordem**:
  1. Type provider Zod (`setValidatorCompiler` / `setSerializerCompiler`)
  2. `error-handler.plugin` (primeiro, para capturar falhas dos demais)
  3. `helmet` → `cors` → `rate-limit` → `under-pressure`
  4. `swagger` + `swagger-ui`
  5. `auth.plugin` (monta `/api/auth/*` e decora `request.user` / `request.session`)
  6. Rotas de health (`/health`, `/health/ready`)
  7. Rotas de domínio, todas com `{ prefix: '/api/v1' }`
- Devolve a instância. Não escuta porta.

### `src/server.ts` — bootstrap

- `buildApp()` → `app.listen({ port: env.PORT, host: env.HOST })`
- Graceful shutdown em `SIGINT` e `SIGTERM`: `app.close()` → `pool.end()` → `process.exit(0)`
- Timeout de 10s no shutdown; se estourar, `process.exit(1)`
- Único lugar do projeto autorizado a chamar `process.exit`

---

## 4. Erros

Toda falha operacional é uma subclasse de `AppError`. **Rotas e services nunca montam
payload de erro** — só lançam. O `error-handler.plugin.ts` é o único formatador.

```ts
// src/shared/errors/app-error.ts
export abstract class AppError extends Error {
  abstract readonly statusCode: number;
  abstract readonly error: string;
  constructor(
    message: string,
    readonly details: unknown = null,
  ) {
    super(message);
  }
}
```

| Classe              | Arquivo                           | Status | Quando                               |
| ------------------- | --------------------------------- | ------ | ------------------------------------ |
| `NotFoundError`     | `not-found.error.ts`              | 404    | Recurso inexistente                  |
| `UnauthorizedError` | `unauthorized.error.ts`           | 401    | Sem sessão válida                    |
| `ForbiddenError`    | `forbidden.error.ts` ⚠️ **criar** | 403    | Recurso de outro usuário             |
| `ConflictError`     | `conflict.error.ts` ⚠️ **criar**  | 409    | Faixa já na playlist / já favoritada |
| `ValidationError`   | `validation.error.ts`             | 422    | Regra de negócio violada (≠ schema)  |

> ⚠️ `forbidden.error.ts` e `conflict.error.ts` **não existem no scaffold** e são citados
> pelas rules. O sprint **F1-S05** os cria.

### Payload de saída (RFC 7807-like, fixo)

```json
{ "statusCode": 404, "error": "Not Found", "message": "Track not found", "details": null }
```

### Tratamento no `error-handler.plugin.ts`

| Entrada                                                   | Saída                                                                                                                                      |
| --------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| `AppError`                                                | `statusCode` / `error` / `message` / `details` da própria instância                                                                        |
| `ZodError` (validação de schema)                          | **400**, `error: "Bad Request"`, `details` = issues achatadas                                                                              |
| Erro do Fastify com `statusCode` (ex.: 429 do rate-limit) | Repassa o status, normaliza o corpo                                                                                                        |
| Qualquer outro                                            | **500**, `message: "Internal Server Error"`, `details: null`. O erro real vai para `request.log.error({ err })` e **nunca** para o cliente |

---

## 5. Fronteiras no ESLint

`eslint.config.mjs` declara os tipos de elemento e as permissões. Esboço normativo:

```js
'boundaries/elements': [
  { type: 'routes',     pattern: 'src/modules/*/*.routes.ts' },
  { type: 'service',    pattern: 'src/modules/*/*.service.ts' },
  { type: 'repository', pattern: 'src/modules/*/*.repository.ts' },
  { type: 'dto',        pattern: 'src/modules/*/*.schema.ts' },
  { type: 'plugin',     pattern: 'src/plugins/*.plugin.ts' },
  { type: 'db',         pattern: 'src/db/**' },
  { type: 'shared',     pattern: 'src/shared/**' },
  { type: 'config',     pattern: 'src/config/**' },
]
```

Regra `boundaries/element-types` em `error`, com `default: 'disallow'` e allow explícito
conforme a tabela da seção 1. O módulo `auth` é a **única** exceção: `auth.plugin.ts` pode
ser importado por `src/app.ts` e por rotas protegidas.

---

## 6. Convenções de código

- Arquivos **kebab-case** com sufixo obrigatório: `*.routes.ts`, `*.service.ts`,
  `*.repository.ts`, `*.schema.ts`, `*.plugin.ts`, `*.error.ts`
- Classes e tipos **PascalCase** · funções e variáveis **camelCase** ·
  constantes **UPPER_SNAKE_CASE** · tabelas e colunas **snake_case**
- Tipos de DTO derivados com `z.infer<typeof schema>` — nunca interface escrita à mão
- `any` proibido. Use `unknown` + type guard.
- Log estruturado do Fastify (`request.log`, `fastify.log`). **`console.*` é erro de lint.**
- `async/await` sempre; nunca `.then()` encadeado, nunca `catch` vazio.
- Import de módulo local **sempre com extensão `.js`** (exigência de `NodeNext` + ESM):
  `import { tracksService } from './tracks.service.js'`

---

## 7. Padrão de módulo

Todo módulo de domínio segue exatamente esta forma. `tracks` é o modelo de referência.

```
src/modules/tracks/
├── tracks.schema.ts       Zod: query, params, body, response + z.infer
├── tracks.repository.ts   classe TracksRepository, recebe `db` por construtor
├── tracks.service.ts      classe TracksService, recebe repository por construtor
└── tracks.routes.ts       FastifyPluginAsyncZod, instancia e delega
```

**Injeção por construtor é obrigatória** — é o que torna o service testável com um
repository dublê, sem mock de módulo:

```ts
export class TracksService {
  constructor(private readonly repo: TracksRepository) {}
}
```

Instanciação acontece **no arquivo de rotas**, não em singleton global.
