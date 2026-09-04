# Release v0.1.0 — Fase 1: Fundação

> Primeira release da API **Cardoso Sound**, consolidando a fundação técnica completa, pipeline de entrega contínua, plugins de segurança de borda, rotas de health check e documentação OpenAPI.

---

## Destaques da Fase 1

### 1. Toolchain & Qualidade de Código (F1-S01, F1-S02)

- Node.js 24 LTS em modo ESM nativo (`"type": "module"`).
- TypeScript 5.7 em Strict Mode com `NodeNext` resolution e zero tipos inseguros (`any`).
- Linting arquitetural com ESLint 9 Flat Config e `eslint-plugin-boundaries` garantindo fronteiras estritas de Clean Architecture.
- Formatação padronizada via Prettier e empacotamento modular de alta performance via `tsup`.
- Suíte de testes com Vitest e Testcontainers.

### 2. Ambiente e Infraestrutura (F1-S03, F1-S04)

- PostgreSQL 17 gerenciado via Docker Compose com volume persistente e healthcheck nativo.
- Configuração de ambiente centralizada com validação em tempo de inicialização via Zod (`src/config/env.ts`).
- Pipeline de integração contínua (CI) no GitHub Actions executando lint, typecheck, testes unitários, testes de integração e build em todo PR para `develop` e `main`.

### 3. Núcleo da Aplicação & Tratamento de Erros (F1-S05)

- App factory pura Fastify v5 (`buildApp()`) sem efeitos colaterais no import.
- Hierarquia formal de exceções operacionais herdando de `AppError` com formatação RFC 7807 (`NotFoundError`, `UnauthorizedError`, `ForbiddenError`, `ConflictError`, `ValidationError`).
- Fallback seguro para 500 sem vazamento de detalhes internos, stack traces ou senhas.
- Logger Pino estruturado em JSON com mascaramento (_redaction_) mandatória de headers e campos sensíveis (`authorization`, `cookie`, `set-cookie`, `password`, `token`).
- Servidor HTTP com graceful shutdown garantido em `SIGINT`/`SIGTERM` e timeout defensivo de 10 segundos.

### 4. Plugins de Borda, Resiliência, Health e Swagger (F1-S06)

- **Segurança:** `@fastify/helmet` com Content Security Policy permissivo fora de produção e estrito em produção; `@fastify/cors` com origens configuráveis e exposição de `set-auth-token`.
- **Proteção contra Abuso:** `@fastify/rate-limit` ativo em produção por IP e usuário com bypass para probes de orquestração.
- **Resiliência do Processo:** `@fastify/under-pressure` monitorando consumo de memória, atraso de event loop e saúde do banco PostgreSQL.
- **Conectividade de Banco:** Cliente centralizado `pg.Pool` e Drizzle ORM em `src/db/client.ts` com barrel `src/db/schema/index.ts` preparado para tabelas relacionais.
- **Health Checks:**
  - `GET /health` (R01): Liveness check com status, uptime numérico e versão.
  - `GET /health/ready` (R02): Readiness check executando `SELECT 1` no PostgreSQL, respondendo 200 (`ready`/`up`) ou 503 (`unavailable`/`down`).
- **Documentação Interativa:** Interface Swagger UI disponível em `/docs` e especificação OpenAPI 3.0.3 gerada dinamicamente em `/docs/json` via `fastify-type-provider-zod`.

---

## Contratos Entregues

| Método | Endpoint        | Contrato | Descrição                           |
| :----- | :-------------- | :------- | :---------------------------------- |
| `GET`  | `/health`       | R01      | Liveness probe do processo          |
| `GET`  | `/health/ready` | R02      | Readiness probe contra PostgreSQL   |
| `GET`  | `/docs`         | R03      | Documentação interativa Swagger UI  |
| `GET`  | `/docs/json`    | R03      | Especificação OpenAPI 3.0.3 em JSON |

---

## Próximos Passos — Fase 2: Catálogo (`v0.2.0`)

- **F2-S01:** Definição dos schemas relacionais Drizzle (`artists`, `tracks`, etc.) e primeira migração SQL.
- **F2-S02:** Seed do catálogo musical e harness compartilhado de integração com Testcontainers.
- **F2-S03:** Módulo `artists` (rotas, service, repository).
- **F2-S04:** Módulo `tracks` com suporte a filtros, busca e paginação.
