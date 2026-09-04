# Plano de Implementação — Sprint F1-S06: Plugins de Borda, Health e Swagger

> **Status:** 🟡 Em Planejamento (Aguardando Autorização Explícita — Etapa 3 do Protocolo)  
> **Fase:** F1 — Fundação · **último sprint da fase** (Meta: Tag `v0.1.0`)  
> **Branch Alvo:** `feature/f1s06-plugins-de-borda-e-health` (a partir de `develop`)  
> **Depende de:** F1-S05 (Núcleo de erros, app factory, server e logger concluídos)  
> **Specs de Referência:**
>
> - [`docs/specs/01-arquitetura.md`](file:///run/media/joaocardoso/discoF/Cardosofiles/typescript/back-end/fastify/cardoso-sound-api/docs/specs/01-arquitetura.md) (§3: ordem canônica de registro dos plugins)
> - [`docs/specs/02-modelo-de-dados.md`](file:///run/media/joaocardoso/discoF/Cardosofiles/typescript/back-end/fastify/cardoso-sound-api/docs/specs/02-modelo-de-dados.md) (§6: cliente Drizzle e pool Postgres)
> - [`docs/specs/03-contrato-da-api.md`](file:///run/media/joaocardoso/discoF/Cardosofiles/typescript/back-end/fastify/cardoso-sound-api/docs/specs/03-contrato-da-api.md) (§9: rotas R01/R02 de Health, §10: OpenAPI/Swagger)
> - [`docs/specs/04-autenticacao-e-seguranca.md`](file:///run/media/joaocardoso/discoF/Cardosofiles/typescript/back-end/fastify/cardoso-sound-api/docs/specs/04-autenticacao-e-seguranca.md) (§4: plugins de defesa e resiliência)
> - [`docs/specs/06-git-ci-cd-e-deploy.md`](file:///run/media/joaocardoso/discoF/Cardosofiles/typescript/back-end/fastify/cardoso-sound-api/docs/specs/06-git-ci-cd-e-deploy.md) (§6: preparação de release `v0.1.0`)
> - [`docs/specs/07-protocolo-dos-agentes.md`](file:///run/media/joaocardoso/discoF/Cardosofiles/typescript/back-end/fastify/cardoso-sound-api/docs/specs/07-protocolo-dos-agentes.md)
> - [`docs/sprints/fase-1-fundacao/F1-S06-plugins-de-borda-e-health.md`](file:///run/media/joaocardoso/discoF/Cardosofiles/typescript/back-end/fastify/cardoso-sound-api/docs/sprints/fase-1-fundacao/F1-S06-plugins-de-borda-e-health.md)

---

## 1. Contexto e Objetivos

O sprint **F1-S06** encerra formalmente a **Fase 1 (Fundação)**, preparando o repositório para a tag de release **`v0.1.0`**.

Os objetivos principais da entrega são:

1. **Infraestrutura de Banco e Conectividade (`src/db/`):**
   - Antecipar a criação do pool `pg.Pool` e da instância singleton `db` do Drizzle ORM em [`src/db/client.ts`](file:///run/media/joaocardoso/discoF/Cardosofiles/typescript/back-end/fastify/cardoso-sound-api/src/db/client.ts).
   - Criar o barrel vazio [`src/db/schema/index.ts`](file:///run/media/joaocardoso/discoF/Cardosofiles/typescript/back-end/fastify/cardoso-sound-api/src/db/schema/index.ts) (`export {};`), permitindo que `drizzle(pool, { schema })` exista e compile sem tabelas antes de F2-S01.
   - Fornecer a função canônica unificada `checkDatabase(): Promise<boolean>` executando `SELECT 1` para o readiness check e o under-pressure.
2. **Plugins de Borda e Segurança (`src/plugins/`):**
   - [`src/plugins/helmet.plugin.ts`](file:///run/media/joaocardoso/discoF/Cardosofiles/typescript/back-end/fastify/cardoso-sound-api/src/plugins/helmet.plugin.ts): Cabeçalhos HTTP defensivos com Content Security Policy desativado fora de produção para compatibilidade com o Swagger UI.
   - [`src/plugins/cors.plugin.ts`](file:///run/media/joaocardoso/discoF/Cardosofiles/typescript/back-end/fastify/cardoso-sound-api/src/plugins/cors.plugin.ts): Configuração CORS flexível em dev/test e estrita em produção, com exposição mandatória de `set-auth-token` (**D-13**, **D-19**).
   - [`src/plugins/rate-limit.plugin.ts`](file:///run/media/joaocardoso/discoF/Cardosofiles/typescript/back-end/fastify/cardoso-sound-api/src/plugins/rate-limit.plugin.ts): Rate limit global ativo apenas em produção (**D-19**), com `allowList` protegendo rotas `/health*` e chave por `user.id ?? ip`.
   - [`src/plugins/under-pressure.plugin.ts`](file:///run/media/joaocardoso/discoF/Cardosofiles/typescript/back-end/fastify/cardoso-sound-api/src/plugins/under-pressure.plugin.ts): Monitoramento de saúde de recursos do processo e banco de dados via `checkDatabase()`, com `exposeStatusRoute: false` (**D-26**).
   - [`src/plugins/swagger.plugin.ts`](file:///run/media/joaocardoso/discoF/Cardosofiles/typescript/back-end/fastify/cardoso-sound-api/src/plugins/swagger.plugin.ts): Documentação OpenAPI 3.0.3 dinâmica via `fastify-type-provider-zod` e interface interativa Swagger UI em `/docs`.
3. **Módulo de Health Checks (`src/plugins/health.plugin.ts`):**
   - Rota `R01`: `GET /health` (Liveness) — 200 sempre com `uptime` e `version`. Não toca no banco.
   - Rota `R02`: `GET /health/ready` (Readiness) — 200 (`ready`/`up`) ou 503 (`unavailable`/`down`) testando `SELECT 1`. Status próprio sem envelope de erro RFC 7807.
4. **Composição no Bootstrap e Graceful Shutdown:**
   - Ordem estrita de registro em [`src/app.ts`](file:///run/media/joaocardoso/discoF/Cardosofiles/typescript/back-end/fastify/cardoso-sound-api/src/app.ts): Zod provider → error-handler → helmet → cors → rate-limit → under-pressure → swagger + swagger-ui → health.
   - Fechamento gracioso do pool `pool.end()` em [`src/server.ts`](file:///run/media/joaocardoso/discoF/Cardosofiles/typescript/back-end/fastify/cardoso-sound-api/src/server.ts) após `app.close()`.
5. **Garantia de Qualidade e Testes:**
   - Suíte unitária `tests/unit/plugins/health.test.ts` cobrindo nominalmente T1 a T8 (sem banco, mock isolado).
   - Suíte de integração `tests/integration/health.test.ts` cobrindo T9 e T10 contra container real do PostgreSQL 17 (`postgres:17-alpine`) via Testcontainers.
6. **Memória e Fechamento da Fase:**
   - Registro das decisões técnicas D-37 e D-38 em `.agents/memory/DECISIONS.md`.
   - Atualização de `.agents/memory/PROGRESS.md` declarando F1 concluída e tag `v0.1.0` preparada.
   - Criação de `.agents/memory/F1-S06.md`.

---

## 2. Blast Radius e Controle Estrito de Arquivos

Em total conformidade com a seção 4 do documento de sprint:

### Arquivos a Preencher (atualmente com 0 bytes):

- [`src/plugins/helmet.plugin.ts`](file:///run/media/joaocardoso/discoF/Cardosofiles/typescript/back-end/fastify/cardoso-sound-api/src/plugins/helmet.plugin.ts)
- [`src/plugins/cors.plugin.ts`](file:///run/media/joaocardoso/discoF/Cardosofiles/typescript/back-end/fastify/cardoso-sound-api/src/plugins/cors.plugin.ts)
- [`src/plugins/rate-limit.plugin.ts`](file:///run/media/joaocardoso/discoF/Cardosofiles/typescript/back-end/fastify/cardoso-sound-api/src/plugins/rate-limit.plugin.ts)
- [`src/plugins/under-pressure.plugin.ts`](file:///run/media/joaocardoso/discoF/Cardosofiles/typescript/back-end/fastify/cardoso-sound-api/src/plugins/under-pressure.plugin.ts)
- [`src/plugins/swagger.plugin.ts`](file:///run/media/joaocardoso/discoF/Cardosofiles/typescript/back-end/fastify/cardoso-sound-api/src/plugins/swagger.plugin.ts)
- [`src/db/client.ts`](file:///run/media/joaocardoso/discoF/Cardosofiles/typescript/back-end/fastify/cardoso-sound-api/src/db/client.ts)
- [`src/db/schema/index.ts`](file:///run/media/joaocardoso/discoF/Cardosofiles/typescript/back-end/fastify/cardoso-sound-api/src/db/schema/index.ts)

### Arquivos a Criar:

- [`src/plugins/health.plugin.ts`](file:///run/media/joaocardoso/discoF/Cardosofiles/typescript/back-end/fastify/cardoso-sound-api/src/plugins/health.plugin.ts)
- [`tests/unit/plugins/health.test.ts`](file:///run/media/joaocardoso/discoF/Cardosofiles/typescript/back-end/fastify/cardoso-sound-api/tests/unit/plugins/health.test.ts)
- [`tests/integration/health.test.ts`](file:///run/media/joaocardoso/discoF/Cardosofiles/typescript/back-end/fastify/cardoso-sound-api/tests/integration/health.test.ts)
- [`docs/agents-plans/plan-f1-s06-plugins-de-borda-e-health.md`](file:///run/media/joaocardoso/discoF/Cardosofiles/typescript/back-end/fastify/cardoso-sound-api/docs/agents-plans/plan-f1-s06-plugins-de-borda-e-health.md) (persistência deste plano — Regra 6 do `AGENTS.md`)

### Arquivos a Editar:

- [`src/app.ts`](file:///run/media/joaocardoso/discoF/Cardosofiles/typescript/back-end/fastify/cardoso-sound-api/src/app.ts) (registro de todos os plugins na ordem canônica)
- [`src/server.ts`](file:///run/media/joaocardoso/discoF/Cardosofiles/typescript/back-end/fastify/cardoso-sound-api/src/server.ts) (fechamento do pool Postgres no shutdown gracioso)
- [`.agents/memory/DECISIONS.md`](file:///run/media/joaocardoso/discoF/Cardosofiles/typescript/back-end/fastify/cardoso-sound-api/.agents/memory/DECISIONS.md) (novas decisões D-37 e D-38)
- [`.agents/memory/PROGRESS.md`](file:///run/media/joaocardoso/discoF/Cardosofiles/typescript/back-end/fastify/cardoso-sound-api/.agents/memory/PROGRESS.md) (atualização do roadmap e conclusão da fase F1)
- [`.agents/memory/F1-S06.md`](file:///run/media/joaocardoso/discoF/Cardosofiles/typescript/back-end/fastify/cardoso-sound-api/.agents/memory/F1-S06.md) (resumo técnico da sprint)

### Arquivos Estritamente Intocáveis nesta Sprint:

- `src/db/schema/*.schema.ts` (escopo de F2-S01)
- `src/modules/**` (escopo de fases posteriores)
- `src/shared/errors/**` (já concluído em F1-S05)
- `src/shared/types/fastify.d.ts` (escopo de F3-S01)
- `tests/setup/testcontainers.ts` (escopo de F2-S02 — o teste de integração deste sprint é autossuficiente)
- `.github/**`

---

## 3. Especificação Detalhada dos Componentes

### 3.1 Infraestrutura de Banco (`src/db/`)

#### 1. [`src/db/schema/index.ts`](file:///run/media/joaocardoso/discoF/Cardosofiles/typescript/back-end/fastify/cardoso-sound-api/src/db/schema/index.ts)

Barrel intencionalmente vazio neste sprint:

```typescript
// As tabelas entram em F2-S01. Este barrel existe para `drizzle(pool, { schema })`
// funcionar desde F1-S06, quando /health/ready passou a precisar do pool.
export {};
```

#### 2. [`src/db/client.ts`](file:///run/media/joaocardoso/discoF/Cardosofiles/typescript/back-end/fastify/cardoso-sound-api/src/db/client.ts)

Instância centralizada do cliente PostgreSQL e Drizzle ORM conforme spec `02` §6:

```typescript
import { drizzle, type NodePgDatabase } from 'drizzle-orm/node-postgres';
import pg from 'pg';
import { env } from '../config/env.js';
import * as schema from './schema/index.js';

export let pool = new pg.Pool({
  connectionString: env.DATABASE_URL,
  max: 10,
  connectionTimeoutMillis: 2000,
});

export let db = drizzle(pool, { schema });
export type Database = typeof db;

export function setPool(newPool: pg.Pool): void {
  pool = newPool;
  db = drizzle(pool, { schema });
}

export async function checkDatabase(): Promise<boolean> {
  try {
    await pool.query('SELECT 1');
    return true;
  } catch {
    return false;
  }
}
```

_Observação de Design:_ O uso de `export let pool` e a função auxiliar `setPool` permite que a suíte de integração com Testcontainers substitua o pool de conexões em tempo de execução para apontar para a porta efêmera mapeada do container sem quebrar a imutabilidade do módulo nem exigir restarts de processos (D-36).

---

### 3.2 Plugins de Borda e Segurança (`src/plugins/`)

#### 1. [`src/plugins/helmet.plugin.ts`](file:///run/media/joaocardoso/discoF/Cardosofiles/typescript/back-end/fastify/cardoso-sound-api/src/plugins/helmet.plugin.ts)

Proteção de headers HTTP usando `@fastify/helmet`:

- `contentSecurityPolicy`: desativado (`false`) fora de produção para evitar quebras do Swagger UI com scripts inline; em produção assume os padrões restritos do Helmet.
- `crossOriginEmbedderPolicy: false`.
- Registrado com `fastify-plugin` sob o nome `helmet-plugin`.

#### 2. [`src/plugins/cors.plugin.ts`](file:///run/media/joaocardoso/discoF/Cardosofiles/typescript/back-end/fastify/cardoso-sound-api/src/plugins/cors.plugin.ts)

Políticas de Cross-Origin Resource Sharing conforme spec `04` §4 e decisões **D-13** e **D-19**:

- `origin`: em desenvolvimento/testes é `true` (permissivo); em produção valida contra `env.CORS_ORIGIN_LIST`.
- `credentials: true`.
- `methods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS']`.
- `exposedHeaders: ['set-auth-token']`: obrigatório para permitir leitura do token de autenticação pelo cliente browser.
- Registrado com `fastify-plugin` sob o nome `cors-plugin`.

#### 3. [`src/plugins/rate-limit.plugin.ts`](file:///run/media/joaocardoso/discoF/Cardosofiles/typescript/back-end/fastify/cardoso-sound-api/src/plugins/rate-limit.plugin.ts)

Mitigação de abuso e brute-force conforme spec `04` §4 e decisão **D-19**:

- `global: env.NODE_ENV === 'production'`: inativo em testes e desenvolvimento para eliminar 429 espúrios.
- `max: env.RATE_LIMIT_MAX` (100).
- `timeWindow: env.RATE_LIMIT_WINDOW` ('1 minute').
- `allowList: (req) => req.url.startsWith('/health')`: garante que probes de orquestração (Railway/Kubernetes) nunca sofram throttle.
- `keyGenerator: (req) => (req as unknown as { user?: { id?: string } }).user?.id ?? req.ip`.
- Registrado com `fastify-plugin` sob o nome `rate-limit-plugin`.

#### 4. [`src/plugins/under-pressure.plugin.ts`](file:///run/media/joaocardoso/discoF/Cardosofiles/typescript/back-end/fastify/cardoso-sound-api/src/plugins/under-pressure.plugin.ts)

Monitor de pressão do processo e saúde do banco conforme spec `04` §4 e decisão **D-26**:

- `maxEventLoopDelay: 1000`.
- `maxHeapUsedBytes: 512 * 1024 * 1024` (512MB).
- `maxRssBytes: 640 * 1024 * 1024` (640MB).
- `retryAfter: 50`.
- `healthCheck: checkDatabase`: reutiliza a mesma função de sondagem de banco (`SELECT 1`).
- `healthCheckInterval: 5000`.
- `exposeStatusRoute: false`: evita rota `/status` redundante com `/health/ready`.
- Registrado com `fastify-plugin` sob o nome `under-pressure-plugin`.

#### 5. [`src/plugins/swagger.plugin.ts`](file:///run/media/joaocardoso/discoF/Cardosofiles/typescript/back-end/fastify/cardoso-sound-api/src/plugins/swagger.plugin.ts)

Geração e visualização de documentação OpenAPI 3.0.3 conforme spec `03` §10:

- Registra `@fastify/swagger` com `transform: jsonSchemaTransform` (do `fastify-type-provider-zod`).
- Metadados:
  - `title`: `APP_NAME` ('cardoso-sound-api').
  - `version`: lido de `package.json` em tempo de execução via `createRequire`.
  - `description`: descrição canônica do serviço.
  - `tags`: `Health`, `Auth`, `Catalog`, `Profile`, `Library`.
  - `securitySchemes`:
    - `bearerAuth`: HTTP Bearer com formato JWT.
    - `cookieAuth`: API Key via cookie `better-auth.session_token`.
- Registra `@fastify/swagger-ui` no prefixo `/docs`, com expansão em lista e deep linking ativado.
- Registrado com `fastify-plugin` sob o nome `swagger-plugin`.

---

### 3.3 Módulo de Health (`src/plugins/health.plugin.ts`)

Rotas de observabilidade com contratos estritos validados via Zod Type Provider:

```typescript
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import fp from 'fastify-plugin';
import { createRequire } from 'node:module';
import { z } from 'zod';
import { checkDatabase } from '../db/client.js';

const require = createRequire(import.meta.url);
const pkg = require('../../package.json') as { version: string };

const healthResponseSchema = z.object({
  status: z.literal('ok'),
  uptime: z.number().nonnegative(),
  version: z.string(),
});

const readinessOkResponseSchema = z.object({
  status: z.literal('ready'),
  database: z.literal('up'),
});

const readinessUnavailableResponseSchema = z.object({
  status: z.literal('unavailable'),
  database: z.literal('down'),
});

const healthRoutes: FastifyPluginAsyncZod = async (fastify) => {
  // R01: Liveness — 200 sempre, nunca toca no banco
  fastify.get(
    '/health',
    {
      config: { pressureHandler: () => {} },
      schema: {
        tags: ['Health'],
        summary: 'Liveness health check',
        description:
          'Verifica se a instância da API está ativa e responsiva. Não toca no banco de dados.',
        operationId: 'getHealth',
        response: {
          200: healthResponseSchema,
        },
      },
    },
    async () => {
      return {
        status: 'ok' as const,
        uptime: process.uptime(),
        version: pkg.version,
      };
    },
  );

  // R02: Readiness — 200 (up) ou 503 (down), testando SELECT 1
  fastify.get(
    '/health/ready',
    {
      config: { pressureHandler: () => {} },
      schema: {
        tags: ['Health'],
        summary: 'Readiness health check',
        description:
          'Verifica a conectividade com o banco de dados PostgreSQL antes de receber tráfego.',
        operationId: 'getHealthReady',
        response: {
          200: readinessOkResponseSchema,
          503: readinessUnavailableResponseSchema,
        },
      },
    },
    async (_request, reply) => {
      const isDbHealthy = await checkDatabase();

      if (!isDbHealthy) {
        return reply.status(503).send({
          status: 'unavailable' as const,
          database: 'down' as const,
        });
      }

      return reply.status(200).send({
        status: 'ready' as const,
        database: 'up' as const,
      });
    },
  );
};

export const healthPlugin = fp(healthRoutes, {
  name: 'health-plugin',
});
```

_Detalhamento dos Contratos:_

- `GET /health` sempre devolve 200 e nunca toca no banco.
- `GET /health/ready` responde 200 `{ status: 'ready', database: 'up' }` se `checkDatabase()` for `true`, e 503 `{ status: 'unavailable', database: 'down' }` se for `false`.
- A propriedade `config: { pressureHandler: () => {} }` em ambas as rotas garante que o hook global do `under-pressure` ignore essas duas rotas de sondagem mesmo quando o banco estiver indisponível.

---

### 3.4 Composição em `src/app.ts` e `src/server.ts`

#### [`src/app.ts`](file:///run/media/joaocardoso/discoF/Cardosofiles/typescript/back-end/fastify/cardoso-sound-api/src/app.ts)

Ordem canônica de montagem sem efeitos colaterais de import:

1. `setValidatorCompiler` e `setSerializerCompiler` (Zod type provider)
2. `errorHandlerPlugin` (captura falhas globais)
3. `helmetPlugin`
4. `corsPlugin`
5. `rateLimitPlugin`
6. `underPressurePlugin`
7. `swaggerPlugin` (OpenAPI + Swagger UI)
8. `healthPlugin` (`/health` e `/health/ready`)

#### [`src/server.ts`](file:///run/media/joaocardoso/discoF/Cardosofiles/typescript/back-end/fastify/cardoso-sound-api/src/server.ts)

Adição do encerramento do pool Postgres no shutdown gracioso:

```typescript
try {
  await app.close();
  await pool.end();
  app.log.info('Server closed successfully.');
  process.exit(0);
} catch (error: unknown) {
  app.log.error({ err: error }, 'Error during graceful shutdown');
  process.exit(1);
}
```

---

## 4. Matriz Completa de Testes

### 4.1 Suíte Unitária: `tests/unit/plugins/health.test.ts`

Executada de forma rápida e sem dependência de banco de dados externo ou containers. Utiliza espionagem/mocking de `client.checkDatabase` ou do pool.

| ID     | Caso de Teste                      | Descrição da Validação                                                     | Resultado Esperado                                                                               |
| :----- | :--------------------------------- | :------------------------------------------------------------------------- | :----------------------------------------------------------------------------------------------- |
| **T1** | `GET /health`                      | Liveness padrão com processo em execução                                   | Status 200, `status: 'ok'`, `uptime` numérico > 0, `version: '1.0.0'`                            |
| **T2** | `GET /health` com banco inoperante | Simulação de falha de banco (`checkDatabase` retornando `false`)           | Status 200 mantido (liveness desacoplada do banco)                                               |
| **T3** | `GET /health/ready` saudável       | Conectividade bem-sucedida com o banco (`checkDatabase` retornando `true`) | Status 200, `status: 'ready'`, `database: 'up'`                                                  |
| **T4** | `GET /health/ready` com falha      | Conectividade indisponível (`checkDatabase` retornando `false`)            | Status 503, `status: 'unavailable'`, `database: 'down'` (sem envelope RFC 7807)                  |
| **T5** | `GET /docs/json`                   | Inspeção do schema OpenAPI cru gerado                                      | Status 200, JSON com `openapi: '3.0.3'`, `paths['/health']` e `paths['/health/ready']` presentes |
| **T6** | Headers Helmet presentes           | Verificação dos headers de proteção HTTP                                   | Presença de `x-content-type-options: nosniff` e `x-frame-options: SAMEORIGIN`                    |
| **T7** | Preflight `OPTIONS`                | Requisição OPTIONS em rota da API simulando browser CORS                   | Status 204 com headers `access-control-allow-origin` e `access-control-allow-methods`            |
| **T8** | Header exposto no CORS             | Exposição explícita do token para o client                                 | Presença de `set-auth-token` no header `access-control-expose-headers`                           |

---

### 4.2 Suíte de Integração: `tests/integration/health.test.ts`

Executada com PostgreSQL 17 real via `@testcontainers/postgresql` (`postgres:17-alpine`), sem necessidade de migrations:

| ID      | Caso de Teste                              | Procedimento de Validação                                            | Resultado Esperado                                      |
| :------ | :----------------------------------------- | :------------------------------------------------------------------- | :------------------------------------------------------ |
| **T9**  | `/health/ready` contra Postgres real ativo | Sobe container PostgreSqlContainer, aponta pool e dispara requisição | Status 200, `status: 'ready'`, `database: 'up'`         |
| **T10** | `/health/ready` após parar container       | Executa `await container.stop()` e dispara requisição imediatamente  | Status 503, `status: 'unavailable'`, `database: 'down'` |

_Ciclo de Vida do Teste de Integração:_

- `beforeAll`: instancia e inicia o container Docker `postgres:17-alpine`, cria um `pg.Pool` conectado à porta dinâmica gerada e injeta via `setPool(testPool)`.
- `afterAll`: encerra o `testPool`, restaura o pool default e encerra o container (`await container.stop()`).

---

## 5. Passos de Execução da Implementação

1. **Passo 1 — Branch de Trabalho:**
   - Confirmar checkout em `feature/f1s06-plugins-de-borda-e-health` a partir de `develop` atualizado.
2. **Passo 2 — Infraestrutura de Banco (`src/db/`):**
   - Preencher `src/db/schema/index.ts` com comentário explicativo e `export {};`.
   - Preencher `src/db/client.ts` com criação do pool `pg.Pool`, instância Drizzle `db`, `setPool` e `checkDatabase`.
3. **Passo 3 — Plugins de Borda e Documentação:**
   - Preencher `src/plugins/helmet.plugin.ts`.
   - Preencher `src/plugins/cors.plugin.ts`.
   - Preencher `src/plugins/rate-limit.plugin.ts`.
   - Preencher `src/plugins/under-pressure.plugin.ts`.
   - Preencher `src/plugins/swagger.plugin.ts`.
4. **Passo 4 — Módulo de Health Checks:**
   - Criar `src/plugins/health.plugin.ts` com rotas `/health` e `/health/ready` tipadas por Zod.
5. **Passo 5 — Composição e Bootstrap:**
   - Atualizar `src/app.ts` registrando os 6 novos plugins na ordem canônica.
   - Atualizar `src/server.ts` adicionando `await pool.end()` no shutdown gracioso.
6. **Passo 6 — Implementação das Suítes de Testes:**
   - Criar `tests/unit/plugins/health.test.ts` cobrindo casos T1 a T8.
   - Criar `tests/integration/health.test.ts` cobrindo casos T9 e T10 via Testcontainers.
7. **Passo 7 — Validação Rigorosa Local (Definition of Done):**
   - Executar `pnpm typecheck` (zero erros).
   - Executar `pnpm lint` e `pnpm format`.
   - Executar `pnpm test` (garantindo que todas as suítes unitárias e de integração passem com 100% de sucesso).
   - Executar `pnpm build` via `tsup`.
   - Testar comandos manuais do DoD (curl em `/health`, `/health/ready`, headers e docs).
8. **Passo 8 — Registro de Memória e Preparação de Release:**
   - Registrar decisões D-37 e D-38 em `.agents/memory/DECISIONS.md`.
   - Atualizar status e contratos entregues em `.agents/memory/PROGRESS.md`.
   - Criar `.agents/memory/F1-S06.md`.
   - Enviar branch, abrir PR e preparar release `release/v0.1.0`.

---

## 6. O que NÃO será feito neste sprint

- Não serão criadas tabelas relacionais em `src/db/schema/*.schema.ts` (escopo exclusivo de **F2-S01**).
- Não serão geradas nem aplicadas migrações Drizzle (`drizzle/`) (escopo de **F2-S01**).
- Não serão implementadas regras de autenticação nem plugins do Better Auth (`src/modules/auth/`) (escopo de **F3-S01**).
- Não serão criadas rotas de domínio de catálogo sob `/api/v1/` (escopo de **F2-S03** e **F2-S04**).
- O arquivo `tests/setup/testcontainers.ts` não será extraído como harness compartilhado neste sprint (escopo de **F2-S02**).

---

## 7. Registro de Decisões Técnicas a Incluir em `DECISIONS.md`

- **`D-37 · src/db/client.ts e pool Postgres antecipados para F1-S06`**:
  - _Contexto:_ O endpoint `/health/ready` e o monitor de resiliência `@fastify/under-pressure` exigem verificação de conectividade real contra o PostgreSQL através de `SELECT 1`.
  - _Decisão:_ Criar `src/db/client.ts` com `pg.Pool` e instância do Drizzle ORM já em F1-S06, mantendo `src/db/schema/index.ts` vazio (`export {};`). A definição de tabelas de domínio permanece em F2-S01.
  - _Consequência:_ A infraestrutura de conexão existe desde a fase de fundação sem violar a separação entre infraestrutura e schemas de domínio.
- **`D-38 · 503 global do under-pressure com bypass de liveness em rotas /health*`**:
  - _Contexto:_ Ao detectar falha no `healthCheck` de banco, o plugin `@fastify/under-pressure` assume estado degradado e responde HTTP 503 em todas as requisições. Contudo, sondas de liveness (`/health`) de orquestradores não devem falhar nem reiniciar processos caso apenas o banco esteja inacessível.
  - _Decisão:_ Configurar `pressureHandler` no route config das rotas de health para permitir execução direta do handler de liveness (200 fixo) e de readiness (503 com payload estruturado próprio).
  - _Consequência:_ Resiliência adequada: rotas de aplicação retornam 503 imediatamente quando o banco cai, sem crashar o processo nem induzir loops de reinicialização de contêineres.
