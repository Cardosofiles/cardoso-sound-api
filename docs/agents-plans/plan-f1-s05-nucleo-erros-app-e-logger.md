# Plano de Implementação — Sprint F1-S05: Núcleo: Erros, App Factory, Server e Logger

> **Status:** 🟡 Em Planejamento (Aguardando Autorização Explícita — Etapa 3 do Protocolo)  
> **Fase:** F1 — Fundação  
> **Branch Alvo:** `feature/f1s05-nucleo-erros-app-e-logger` (a partir de `develop`)  
> **Depende de:** F1-S04 (CI e status checks concluídos)  
> **Specs de Referência:**
>
> - [`docs/specs/01-arquitetura.md`](file:///run/media/joaocardoso/discoF/Cardosofiles/typescript/back-end/fastify/cardoso-sound-api/docs/specs/01-arquitetura.md) (§3, §4)
> - [`docs/specs/03-contrato-da-api.md`](file:///run/media/joaocardoso/discoF/Cardosofiles/typescript/back-end/fastify/cardoso-sound-api/docs/specs/03-contrato-da-api.md) (§1)
> - [`docs/specs/04-autenticacao-e-seguranca.md`](file:///run/media/joaocardoso/discoF/Cardosofiles/typescript/back-end/fastify/cardoso-sound-api/docs/specs/04-autenticacao-e-seguranca.md) (§5)
> - [`docs/specs/07-protocolo-dos-agentes.md`](file:///run/media/joaocardoso/discoF/Cardosofiles/typescript/back-end/fastify/cardoso-sound-api/docs/specs/07-protocolo-dos-agentes.md)
> - [`docs/sprints/fase-1-fundacao/F1-S05-nucleo-erros-app-e-logger.md`](file:///run/media/joaocardoso/discoF/Cardosofiles/typescript/back-end/fastify/cardoso-sound-api/docs/sprints/fase-1-fundacao/F1-S05-nucleo-erros-app-e-logger.md)

---

## 1. Contexto e Objetivos

A sprint **F1-S05** constrói o primeiro esqueleto executável da API `cardoso-sound-api`:

1. **Hierarquia de Erros Padronizada:** Implementar a classe base abstrata [`AppError`](file:///run/media/joaocardoso/discoF/Cardosofiles/typescript/back-end/fastify/cardoso-sound-api/src/shared/errors/app-error.ts) e suas 5 subclasses especializadas ([`NotFoundError`](file:///run/media/joaocardoso/discoF/Cardosofiles/typescript/back-end/fastify/cardoso-sound-api/src/shared/errors/not-found.error.ts), [`UnauthorizedError`](file:///run/media/joaocardoso/discoF/Cardosofiles/typescript/back-end/fastify/cardoso-sound-api/src/shared/errors/unauthorized.error.ts), [`ForbiddenError`](file:///run/media/joaocardoso/discoF/Cardosofiles/typescript/back-end/fastify/cardoso-sound-api/src/shared/errors/forbidden.error.ts), [`ConflictError`](file:///run/media/joaocardoso/discoF/Cardosofiles/typescript/back-end/fastify/cardoso-sound-api/src/shared/errors/conflict.error.ts), [`ValidationError`](file:///run/media/joaocardoso/discoF/Cardosofiles/typescript/back-end/fastify/cardoso-sound-api/src/shared/errors/validation.error.ts)) com envelope fixo compatível com RFC 7807.
2. **Tratamento Centralizado de Erros:** Configurar [`src/plugins/error-handler.plugin.ts`](file:///run/media/joaocardoso/discoF/Cardosofiles/typescript/back-end/fastify/cardoso-sound-api/src/plugins/error-handler.plugin.ts) (via `fastify-plugin`) com `setErrorHandler` e `setNotFoundHandler`, garantindo que nenhum erro 500 vaze mensagens internas, stack traces ou causas, enquanto erros Zod e Fastify recebem formatação homogênea.
3. **App Factory Pura:** Implementar `buildApp()` em [`src/app.ts`](file:///run/media/joaocardoso/discoF/Cardosofiles/typescript/back-end/fastify/cardoso-sound-api/src/app.ts) sem efeitos colaterais em tempo de import (sem `listen`, sem `process.exit`), com compiladores de validação e serialização do `fastify-type-provider-zod`.
4. **Logging Seguro e Redaction:** Configurar o logger Pino em `buildApp()` com redaction obrigatório dos 6 caminhos sensíveis (**D-22**), formatação `pino-pretty` estritamente restrita a `NODE_ENV === 'development'` (**D-18**) e identificador curto de requisições `genReqId`.
5. **Bootstrap & Graceful Shutdown:** Criar o ponto de entrada [`src/server.ts`](file:///run/media/joaocardoso/discoF/Cardosofiles/typescript/back-end/fastify/cardoso-sound-api/src/server.ts), que sobe na porta configurada, captura `SIGINT`/`SIGTERM` para encerramento gracioso via `app.close()`, possui timeout defensivo de 10s (`SHUTDOWN_TIMEOUT_MS`) e é o único arquivo do projeto autorizado a executar `process.exit`.
6. **Background Runner Stub:** Preencher [`src/jobs/runner.ts`](file:///run/media/joaocardoso/discoF/Cardosofiles/typescript/back-end/fastify/cardoso-sound-api/src/jobs/runner.ts) como noop (`export {};`), mantendo os entrypoints do `tsup` e script `pnpm jobs` compiláveis.
7. **Cobertura Completa de Testes:** Implementar suítes de testes unitários cobrindo nominalmente os casos obrigatórios T1 a T11, além da validação do mascaramento do Pino.

---

## 2. Blast Radius e Controle Estrito de Arquivos

Em total aderência à seção 4 da sprint F1-S05:

### Arquivos a Criar:

- [`src/shared/errors/forbidden.error.ts`](file:///run/media/joaocardoso/discoF/Cardosofiles/typescript/back-end/fastify/cardoso-sound-api/src/shared/errors/forbidden.error.ts) (subclasse de erro HTTP 403)
- [`src/shared/errors/conflict.error.ts`](file:///run/media/joaocardoso/discoF/Cardosofiles/typescript/back-end/fastify/cardoso-sound-api/src/shared/errors/conflict.error.ts) (subclasse de erro HTTP 409)
- [`src/shared/errors/index.ts`](file:///run/media/joaocardoso/discoF/Cardosofiles/typescript/back-end/fastify/cardoso-sound-api/src/shared/errors/index.ts) (barrel exportando todas as classes de erro)
- [`tests/unit/shared/errors.test.ts`](file:///run/media/joaocardoso/discoF/Cardosofiles/typescript/back-end/fastify/cardoso-sound-api/tests/unit/shared/errors.test.ts) (testes T1 a T5 da hierarquia de erros)
- [`tests/unit/plugins/error-handler.test.ts`](file:///run/media/joaocardoso/discoF/Cardosofiles/typescript/back-end/fastify/cardoso-sound-api/tests/unit/plugins/error-handler.test.ts) (testes T6 a T11 com `buildApp()` e `app.inject()`)
- [`docs/agents-plans/plan-f1-s05-nucleo-erros-app-e-logger.md`](file:///run/media/joaocardoso/discoF/Cardosofiles/typescript/back-end/fastify/cardoso-sound-api/docs/agents-plans/plan-f1-s05-nucleo-erros-app-e-logger.md) (persistência deste plano, Regra 6 do `AGENTS.md`)

### Arquivos a Preencher (atualmente com 0 bytes):

- [`src/shared/errors/app-error.ts`](file:///run/media/joaocardoso/discoF/Cardosofiles/typescript/back-end/fastify/cardoso-sound-api/src/shared/errors/app-error.ts)
- [`src/shared/errors/not-found.error.ts`](file:///run/media/joaocardoso/discoF/Cardosofiles/typescript/back-end/fastify/cardoso-sound-api/src/shared/errors/not-found.error.ts)
- [`src/shared/errors/unauthorized.error.ts`](file:///run/media/joaocardoso/discoF/Cardosofiles/typescript/back-end/fastify/cardoso-sound-api/src/shared/errors/unauthorized.error.ts)
- [`src/shared/errors/validation.error.ts`](file:///run/media/joaocardoso/discoF/Cardosofiles/typescript/back-end/fastify/cardoso-sound-api/src/shared/errors/validation.error.ts)
- [`src/plugins/error-handler.plugin.ts`](file:///run/media/joaocardoso/discoF/Cardosofiles/typescript/back-end/fastify/cardoso-sound-api/src/plugins/error-handler.plugin.ts)
- [`src/app.ts`](file:///run/media/joaocardoso/discoF/Cardosofiles/typescript/back-end/fastify/cardoso-sound-api/src/app.ts)
- [`src/server.ts`](file:///run/media/joaocardoso/discoF/Cardosofiles/typescript/back-end/fastify/cardoso-sound-api/src/server.ts)
- [`src/jobs/runner.ts`](file:///run/media/joaocardoso/discoF/Cardosofiles/typescript/back-end/fastify/cardoso-sound-api/src/jobs/runner.ts)

### Arquivos a Atualizar na Memória:

- [`.agents/memory/PROGRESS.md`](file:///run/media/joaocardoso/discoF/Cardosofiles/typescript/back-end/fastify/cardoso-sound-api/.agents/memory/PROGRESS.md)
- [`.agents/memory/F1-S05.md`](file:///run/media/joaocardoso/discoF/Cardosofiles/typescript/back-end/fastify/cardoso-sound-api/.agents/memory/F1-S05.md) (criado a partir de `_TEMPLATE.md`)

### Arquivos Estritamente Intocáveis nesta Sprint:

- `src/plugins/{cors,helmet,rate-limit,under-pressure,swagger}.plugin.ts` (escopo de F1-S06)
- `src/db/**` (escopo de F2-S01)
- `src/modules/**` (escopo a partir de F2-S03)
- `src/shared/types/fastify.d.ts` (escopo de F3-S01)

---

## 3. Especificação Técnica dos Componentes

### 3.1 Hierarquia de Erros (`src/shared/errors/`)

#### 1. [`src/shared/errors/app-error.ts`](file:///run/media/joaocardoso/discoF/Cardosofiles/typescript/back-end/fastify/cardoso-sound-api/src/shared/errors/app-error.ts)

Classe abstrata raiz de todas as exceções operacionais da aplicação:

```typescript
export abstract class AppError extends Error {
  abstract readonly statusCode: number;
  abstract readonly error: string;

  constructor(
    message: string,
    readonly details: unknown = null,
  ) {
    super(message);
    this.name = new.target.name;
    Error.captureStackTrace?.(this, new.target);
  }
}
```

#### 2. Subclasses Especializadas:

Todas importam `AppError` via `./app-error.js` e definem `statusCode` e `error` como propriedades literais `readonly`:

- [`not-found.error.ts`](file:///run/media/joaocardoso/discoF/Cardosofiles/typescript/back-end/fastify/cardoso-sound-api/src/shared/errors/not-found.error.ts):
  - `statusCode`: `404`
  - `error`: `'Not Found'`
  - Mensagem default: `'Resource not found'`
- [`unauthorized.error.ts`](file:///run/media/joaocardoso/discoF/Cardosofiles/typescript/back-end/fastify/cardoso-sound-api/src/shared/errors/unauthorized.error.ts):
  - `statusCode`: `401`
  - `error`: `'Unauthorized'`
  - Mensagem default: `'Authentication required'`
- [`forbidden.error.ts`](file:///run/media/joaocardoso/discoF/Cardosofiles/typescript/back-end/fastify/cardoso-sound-api/src/shared/errors/forbidden.error.ts):
  - `statusCode`: `403`
  - `error`: `'Forbidden'`
  - Mensagem default: `'Access forbidden'`
- [`conflict.error.ts`](file:///run/media/joaocardoso/discoF/Cardosofiles/typescript/back-end/fastify/cardoso-sound-api/src/shared/errors/conflict.error.ts):
  - `statusCode`: `409`
  - `error`: `'Conflict'`
  - Mensagem default: `'Resource already exists'`
- [`validation.error.ts`](file:///run/media/joaocardoso/discoF/Cardosofiles/typescript/back-end/fastify/cardoso-sound-api/src/shared/errors/validation.error.ts):
  - `statusCode`: `422`
  - `error`: `'Unprocessable Entity'`
  - Mensagem default: `'Validation failed'`

#### 3. [`src/shared/errors/index.ts`](file:///run/media/joaocardoso/discoF/Cardosofiles/typescript/back-end/fastify/cardoso-sound-api/src/shared/errors/index.ts)

Barrel exportando as 6 classes:

```typescript
export * from './app-error.js';
export * from './not-found.error.js';
export * from './unauthorized.error.js';
export * from './forbidden.error.js';
export * from './conflict.error.js';
export * from './validation.error.js';
```

---

### 3.2 Formatador Central de Erros (`src/plugins/error-handler.plugin.ts`)

Encapsulado com `fastify-plugin` (`fp`) para que os handlers se apliquem ao escopo raiz e a todos os módulos irmãos.

#### Envelope de Saída Fixo (RFC 7807-like):

```typescript
export interface ErrorResponseEnvelope {
  statusCode: number;
  error: string;
  message: string;
  details: unknown;
}
```

#### Ordem Estrita de Resolução (`setErrorHandler`):

1. **`error instanceof AppError`**:
   - `statusCode`: `error.statusCode`
   - `error`: `error.error`
   - `message`: `error.message`
   - `details`: `error.details`
2. **`hasZodFastifySchemaValidationErrors(error)`**:
   - Helper oficial de `fastify-type-provider-zod` v6.
   - `statusCode`: `400`
   - `error`: `'Bad Request'`
   - `message`: `error.message`
   - `details`: `error.validation` (array achatado de `FastifySchemaValidationError`)
3. **Erro Fastify com `statusCode` entre 400 e 499** (ex: 429 de `@fastify/rate-limit`, 415, etc.):
   - `statusCode`: `error.statusCode`
   - `error`: status text HTTP correspondente (via `STATUS_CODES[statusCode]` ou `error.name` / `error.error`)
   - `message`: `error.message`
   - `details`: `null`
4. **Fallback Geral (Erros Não Mapeados / 500)**:
   - Registra log de erro seguro: `request.log.error({ err: error }, 'unhandled error')`.
   - `statusCode`: `500`
   - `error`: `'Internal Server Error'`
   - `message`: `'Internal Server Error'`
   - `details`: `null`
   - **Garantia de Não Vazamento:** Jamais enviar `error.message`, `error.stack` ou `error.cause` ao cliente.

#### Handler de Rotas Não Encontradas (`setNotFoundHandler`):

Retorna exatamente o envelope de erro padronizado:

```typescript
fastify.setNotFoundHandler((request, reply) => {
  reply.status(404).send({
    statusCode: 404,
    error: 'Not Found',
    message: `Route ${request.method}:${request.url} not found`,
    details: null,
  });
});
```

---

### 3.3 Factory da Aplicação (`src/app.ts`)

Função `buildApp()` pura, assíncrona, que cria e devolve a instância Fastify:

- **Zero efeitos colaterais ao importar** — não executa `.listen()`, não chama `process.exit`, não abre pool.
- **Configuração do Logger Pino:**
  ```typescript
  const loggerConfig = {
    level: env.LOG_LEVEL,
    transport:
      env.NODE_ENV === 'development'
        ? {
            target: 'pino-pretty',
            options: {
              colorize: true,
              translateTime: 'HH:MM:ss',
            },
          }
        : undefined,
    redact: {
      paths: [
        'req.headers.authorization',
        'req.headers.cookie',
        'res.headers["set-cookie"]',
        'res.headers["set-auth-token"]',
        '*.password',
        '*.token',
      ],
      censor: '[REDACTED]',
    },
  };
  ```
- **Configuração do `genReqId`:**
  Utiliza o cabeçalho `x-request-id` se fornecido pelo cliente, ou gera um identificador curto de 8 caracteres via `randomUUID().slice(0, 8)`:
  ```typescript
  genReqId: (req) => (req.headers['x-request-id'] as string | undefined) ?? randomUUID().slice(0, 8),
  disableRequestLogging: false,
  ```
- **Compiladores Zod:**
  Chamados antes de registrar qualquer rota:
  ```typescript
  app.setValidatorCompiler(validatorCompiler);
  app.setSerializerCompiler(serializerCompiler);
  ```
- **Registro do Plugin de Erros:**
  ```typescript
  await app.register(errorHandlerPlugin);
  ```

---

### 3.4 Bootstrap e Graceful Shutdown (`src/server.ts`)

Ponto de entrada do processo Node.js em produção e desenvolvimento:

1. Constrói o app chamando `await buildApp()`.
2. Escuta na porta `env.PORT` e host `env.HOST`.
3. Registra graceful shutdown para `SIGINT` e `SIGTERM`:
   - Registra log informativo da recepção do sinal.
   - Dispara timer de emergência com `SHUTDOWN_TIMEOUT_MS` (10s) marcado com `.unref()`. Se o shutdown travar, encerra forçadamente com `process.exit(1)`.
   - Executa `await app.close()`.
   - _(Em F2-S01 receberá o encerramento do pool Postgres)_.
   - Encerra limpo com `process.exit(0)`.
4. Registra handlers de processo para `unhandledRejection` e `uncaughtException`, logando via `app.log.fatal` e saindo com código 1.
5. Único arquivo no projeto autorizado a invocar `process.exit`.

---

### 3.5 Background Jobs Stub (`src/jobs/runner.ts`)

Mantém compatibilidade com os scripts de compilação `tsup` e `pnpm jobs`:

```typescript
// Nenhuma rotina em background é necessária no MVP (ver docs/specs/00-visao-geral.md §3).
// Este arquivo existe para o entry point do tsup e para o script `pnpm jobs`.
export {};
```

---

## 4. Plano de Testes Detalhado

### 4.1 Testes Unitários de Erros (`tests/unit/shared/errors.test.ts`)

| ID     | Cenário / Ação                                           | Asserções Esperadas                                                                                                                                                                                            |
| ------ | -------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **T1** | `new NotFoundError('Track not found')`                   | `statusCode === 404`, `error === 'Not Found'`, `message === 'Track not found'`, `instanceof AppError`, `instanceof Error`                                                                                      |
| **T2** | Instanciação das 5 classes com mensagens padrão          | `NotFoundError`: 404 / 'Not Found'<br>`UnauthorizedError`: 401 / 'Unauthorized'<br>`ForbiddenError`: 403 / 'Forbidden'<br>`ConflictError`: 409 / 'Conflict'<br>`ValidationError`: 422 / 'Unprocessable Entity' |
| **T3** | Instanciação padrão sem argumento de detalhes            | `details === null` em todas as classes                                                                                                                                                                         |
| **T4** | Instanciação fornecendo payload customizado em `details` | `details` retém fielmente o valor/objeto passado                                                                                                                                                               |
| **T5** | Verificação de `error.name` nas 5 instâncias             | `error.name` é estritamente igual ao nome da classe correspondente                                                                                                                                             |

### 4.2 Testes Unitários de Integração HTTP (`tests/unit/plugins/error-handler.test.ts`)

Utiliza `await buildApp()` e executa requisições em memória através de `app.inject()`:

| ID      | Rota / Cenário de Teste                                           | Asserções Esperadas                                                                                                                                                                       |
| ------- | ----------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **T6**  | Rota que lança `new NotFoundError('Track not found')`             | HTTP 404, payload com `{ statusCode: 404, error: 'Not Found', message: 'Track not found', details: null }`                                                                                |
| **T7**  | Rota que lança `new ConflictError('Track already in playlist')`   | HTTP 409, payload com `{ statusCode: 409, error: 'Conflict', message: 'Track already in playlist', details: null }`                                                                       |
| **T8**  | Rota com schema Zod recebendo body incompatível                   | HTTP 400, `error === 'Bad Request'`, `details` não nulo contendo array de validações estruturadas                                                                                         |
| **T9**  | Rota que lança exceção não tratada `new Error('segredo interno')` | HTTP 500, payload genérico `{ statusCode: 500, error: 'Internal Server Error', message: 'Internal Server Error', details: null }`. O corpo **não** contém `"segredo interno"` nem `stack` |
| **T10** | Requisição para URL inexistente (`GET /api/v1/rota-fantasma`)     | HTTP 404, payload com envelope RFC 7807 idêntico (não o HTML/JSON padrão do Fastify)                                                                                                      |
| **T11** | Verificação estrutural do envelope em todas as respostas de erro  | O payload possui exatamente e apenas as chaves: `statusCode`, `error`, `message`, `details` (zero chaves espúrias)                                                                        |
| **T12** | Rota simulando erro HTTP 429 (Fastify rate-limit)                 | HTTP 429, payload normalizado contendo status e mensagem correspondentes sem vazar campos internos                                                                                        |
| **T13** | Verificação do mascaramento do Logger Pino (D-22)                 | Comprovação que os 6 caminhos de redaction (`authorization`, `cookie`, `set-cookie`, `set-auth-token`, `*.password`, `*.token`) são censurados para `[REDACTED]`                          |

---

## 5. Roteiro Sequencial de Execução (Passo a Passo)

### Fase 1 — Criação da Branch e Estrutura de Erros

1. Criar branch `feature/f1s05-nucleo-erros-app-e-logger` a partir de `develop` atualizado.
2. Criar e preencher a hierarquia de erros em `src/shared/errors/`:
   - `app-error.ts`
   - `not-found.error.ts`
   - `unauthorized.error.ts`
   - `forbidden.error.ts`
   - `conflict.error.ts`
   - `validation.error.ts`
   - `index.ts`
3. Criar a suíte de testes unitários `tests/unit/shared/errors.test.ts` cobrindo T1 a T5.
4. Executar Vitest e validar se T1 a T5 passam.

### Fase 2 — Implementação do Plugin de Erros e App Factory

5. Preencher `src/plugins/error-handler.plugin.ts` com o `errorHandlerPlugin` (usando `fastify-plugin`, `setErrorHandler` e `setNotFoundHandler`).
6. Preencher `src/app.ts` com `buildApp()`, integrando compiladores Zod, logger Pino com redaction e registro do plugin de erros.
7. Criar a suíte de testes `tests/unit/plugins/error-handler.test.ts` cobrindo T6 a T13.
8. Executar Vitest e validar se T1 a T13 passam.

### Fase 3 — Servidor e Jobs Runner

9. Preencher `src/server.ts` com inicialização `buildApp()`, `listen` e graceful shutdown com listeners `SIGINT`/`SIGTERM`.
10. Preencher `src/jobs/runner.ts` com stub `export {};`.
11. Testar subida local rápida e encerramento gracioso via processo de teste.

### Fase 4 — Pipeline de Validação Local

12. Executar portão de qualidade completo:
    ```bash
    pnpm typecheck && pnpm lint && pnpm format && pnpm test && pnpm build
    ```
13. Garantir 100% de sucesso sem erros de TypeScript ou violações de lint/boundaries.

### Fase 5 — Atualização de Memória e Abertura do PR

14. Preencher `.agents/memory/F1-S05.md` baseado no template.
15. Atualizar `.agents/memory/PROGRESS.md` marcando F1-S05 como concluído e apontando F1-S06 como próximo.
16. Comitar todas as alterações com mensagens convencionais (`feat(core): ...`, `test(core): ...`).
17. Fazer push da branch e abrir PR contra `develop` com o template padrão.
18. Monitorar e aguardar CI verde via `gh run watch --exit-status`.
19. Encerrar a sessão conforme o protocolo de duas paradas.

---

## 6. Critérios de Aceite (Definition of Done)

- [ ] Todos os testes T1 a T11 (e adicionais T12/T13) passam com sucesso no Vitest (`pnpm test`).
- [ ] Os novos erros `forbidden.error.ts` e `conflict.error.ts` existem e respeitam estritamente a tipagem e herança.
- [ ] O `redact` do Pino cobre os 6 caminhos exigidos por D-22 (`req.headers.authorization`, `req.headers.cookie`, `res.headers["set-cookie"]`, `res.headers["set-auth-token"]`, `*.password`, `*.token`).
- [ ] Encerramento gracioso em `SIGINT`/`SIGTERM` fecha o Fastify sem processo órfão.
- [ ] `buildApp()` é puro, sem efeito colateral no import.
- [ ] `pnpm typecheck`, `pnpm lint`, `pnpm format`, `pnpm test` e `pnpm build` executam sem advertências ou erros.
- [ ] Pipeline de CI verde no GitHub Actions.
- [ ] Memória do projeto atualizada em `.agents/memory/PROGRESS.md` e `.agents/memory/F1-S05.md`.
