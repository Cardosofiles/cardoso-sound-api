# F1-S05 — Núcleo: Erros, App Factory, Server e Logger

|                |                                                                                  |
| -------------- | -------------------------------------------------------------------------------- |
| **Fase**       | F1 — Fundação                                                                    |
| **Branch**     | `feature/f1s05-nucleo-erros-app-e-logger`                                        |
| **Depende de** | F1-S04                                                                           |
| **Entrega**    | `buildApp()` existe e responde; erros padronizados; logs seguros; shutdown limpo |

---

## 1. Prompt de abertura

```
Leia .agents/memory/PROGRESS.md e .agents/memory/DECISIONS.md para se contextualizar.

Sprint alvo: docs/sprints/fase-1-fundacao/F1-S05-nucleo-erros-app-e-logger.md
Specs obrigatórias: docs/specs/01-arquitetura.md (§3, §4),
                    docs/specs/03-contrato-da-api.md (§1),
                    docs/specs/04-autenticacao-e-seguranca.md (§5)

Siga o protocolo de docs/specs/07-protocolo-dos-agentes.md:
entre em modo de planejamento, apresente o plano COMPLETO da sprint e
AGUARDE minha autorização explícita antes de escrever qualquer código.

Não toque em nenhum arquivo fora do blast radius declarado no sprint.
```

---

## 2. Objetivo

Criar o **esqueleto executável** da aplicação: a hierarquia de erros, o formatador central,
a factory `buildApp()`, o bootstrap com shutdown gracioso e o logger com redaction.

A partir deste sprint existe um servidor que sobe. Ele ainda não tem rota de domínio —
isso é F1-S06 em diante.

**Dois arquivos de erro citados pelas rules não existem no scaffold** e são criados aqui:
`forbidden.error.ts` e `conflict.error.ts`.

---

## 3. Contratos esperados

### Hierarquia de erros — `src/shared/errors/`

```ts
// app-error.ts
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

| Classe              | Arquivo                      | `statusCode` | `error`                |
| ------------------- | ---------------------------- | ------------ | ---------------------- |
| `NotFoundError`     | `not-found.error.ts`         | 404          | `Not Found`            |
| `UnauthorizedError` | `unauthorized.error.ts`      | 401          | `Unauthorized`         |
| `ForbiddenError`    | `forbidden.error.ts` ⚠️ novo | 403          | `Forbidden`            |
| `ConflictError`     | `conflict.error.ts` ⚠️ novo  | 409          | `Conflict`             |
| `ValidationError`   | `validation.error.ts`        | 422          | `Unprocessable Entity` |

### `src/app.ts`

```ts
export async function buildApp(): Promise<FastifyInstance>;
```

Sem efeito colateral em tempo de import (spec `01` §3). Neste sprint registra: type
provider Zod, error handler, e **nada mais**. Os plugins de borda entram em F1-S06.

### `src/server.ts`

Bootstrap + `listen` + shutdown em `SIGINT`/`SIGTERM` com `SHUTDOWN_TIMEOUT_MS`.
Único arquivo autorizado a chamar `process.exit`.

### `src/plugins/error-handler.plugin.ts`

`setErrorHandler` conforme a tabela da **spec `01` §4**. Também `setNotFoundHandler`
devolvendo o mesmo envelope com 404.

---

## 4. Blast radius

### Criar

```
src/shared/errors/forbidden.error.ts
src/shared/errors/conflict.error.ts
src/shared/errors/index.ts                  # barrel
tests/unit/shared/errors.test.ts
tests/unit/plugins/error-handler.test.ts
```

### Preencher (0 bytes hoje)

```
src/shared/errors/app-error.ts
src/shared/errors/not-found.error.ts
src/shared/errors/unauthorized.error.ts
src/shared/errors/validation.error.ts
src/plugins/error-handler.plugin.ts
src/app.ts
src/server.ts
src/jobs/runner.ts                          # só `export {};` + comentário (sem jobs no MVP)
```

### Editar

```
.agents/memory/PROGRESS.md
.agents/memory/F1-S05.md
```

**Não toque em:** `src/plugins/{cors,helmet,rate-limit,under-pressure,swagger}.plugin.ts`
(F1-S06) · `src/db/**` (F2-S01) · `src/modules/**` · `src/shared/types/fastify.d.ts` (F3-S01).

---

## 5. Passo a passo

### 5.1 Erros

Cada classe em seu arquivo, com `statusCode` e `error` como `readonly` literais.
Mensagem default sensata (`'Resource not found'`, `'Authentication required'`, …) mas
sempre sobrescrevível pelo construtor. `index.ts` reexporta tudo.

### 5.2 Logger

Configuração completa na **spec `04` §5**. Os três pontos obrigatórios:

1. `transport: pino-pretty` **somente** com `NODE_ENV === 'development'` (D-18)
2. `level: env.LOG_LEVEL`
3. **`redact`** cobrindo `req.headers.authorization`, `req.headers.cookie`,
   `res.headers["set-cookie"]`, `res.headers["set-auth-token"]`, `*.password`, `*.token`
   (D-22 — baseline de segurança, não opcional)

Também: `genReqId` gerando um id curto por requisição, e `disableRequestLogging: false`.

### 5.3 `error-handler.plugin.ts`

```ts
fastify.setErrorHandler((error, request, reply) => {
  /* … */
});
fastify.setNotFoundHandler((request, reply) => {
  /* … */
});
```

Ordem de checagem, do mais específico ao mais genérico:

1. `error instanceof AppError` → usa `statusCode`, `error`, `message`, `details`
2. `hasZodFastifySchemaValidationErrors(error)` (helper do `fastify-type-provider-zod`)
   → **400**, `details` = issues achatadas
3. `error.statusCode` numérico entre 400 e 499 (ex.: 429 do rate-limit) → repassa,
   normalizando o corpo
4. Resto → **500**, corpo genérico, `request.log.error({ err: error }, 'unhandled error')`

**O corpo do 500 nunca contém `error.message`, `error.stack` nem `cause`.** Essa é a
diferença entre um erro de aplicação e um vazamento de informação.

### 5.4 `app.ts`

```ts
export async function buildApp(): Promise<FastifyInstance> {
  const app = Fastify({ logger, genReqId, disableRequestLogging: false });
  app.setValidatorCompiler(validatorCompiler);
  app.setSerializerCompiler(serializerCompiler);
  await app.register(errorHandlerPlugin);
  return app;
}
```

`setValidatorCompiler` / `setSerializerCompiler` vêm do `fastify-type-provider-zod` e
precisam ser chamados **antes** de qualquer rota. Tipe a instância com
`.withTypeProvider<ZodTypeProvider>()` onde necessário.

### 5.5 `server.ts`

```ts
const app = await buildApp();
await app.listen({ port: env.PORT, host: env.HOST });

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.once(signal, () => {
    void shutdown(signal);
  });
}
```

`shutdown`: loga a intenção → `app.close()` → fecha o pool quando ele existir (F2-S01) →
`process.exit(0)`. Um `setTimeout(SHUTDOWN_TIMEOUT_MS).unref()` força `exit(1)` se travar.

Também: `process.on('unhandledRejection')` e `'uncaughtException'` logando e saindo com 1.

### 5.6 `jobs/runner.ts`

Nenhum job existe no MVP (spec `00` §3). Preencha com:

```ts
// Nenhuma rotina em background é necessária no MVP (ver docs/specs/00-visao-geral.md §3).
// Este arquivo existe para o entry point do tsup e para o script `pnpm jobs`.
export {};
```

---

## 6. Casos de teste obrigatórios

`tests/unit/shared/errors.test.ts`:

| #   | Caso                                   | Esperado                                                     |
| --- | -------------------------------------- | ------------------------------------------------------------ |
| T1  | `new NotFoundError('Track not found')` | `statusCode 404`, `error 'Not Found'`, `instanceof AppError` |
| T2  | Cada uma das 5 classes                 | par `statusCode`/`error` correto                             |
| T3  | `details` default                      | `null`                                                       |
| T4  | `details` passado no construtor        | preservado                                                   |
| T5  | `error.name`                           | igual ao nome da classe                                      |

`tests/unit/plugins/error-handler.test.ts` — usa `buildApp()` + rotas de teste
registradas no próprio arquivo e `app.inject()`:

| #   | Caso                                                                | Esperado                                                     |
| --- | ------------------------------------------------------------------- | ------------------------------------------------------------ |
| T6  | Rota que lança `NotFoundError`                                      | 404 com os 4 campos do envelope                              |
| T7  | Rota que lança `ConflictError`                                      | 409                                                          |
| T8  | Rota com body inválido pelo schema Zod                              | **400**, `details` não-nulo                                  |
| T9  | Rota que lança `new Error('segredo interno')`                       | 500 e o corpo **não** contém `"segredo interno"` nem `stack` |
| T10 | URL inexistente                                                     | 404 com o mesmo envelope (não o HTML/JSON padrão do Fastify) |
| T11 | Envelope tem exatamente `statusCode`, `error`, `message`, `details` | nenhuma chave extra                                          |

---

## 7. Definition of Done

```bash
pnpm typecheck && pnpm lint && pnpm format && pnpm test && pnpm build
pnpm dev     # sobe, loga com pino-pretty, responde 404 no envelope em qualquer rota
```

- [ ] T1–T11 verdes
- [ ] `forbidden.error.ts` e `conflict.error.ts` criados
- [ ] `redact` do Pino cobre os 6 caminhos (D-22) — prove com um log manual
- [ ] `Ctrl+C` em `pnpm dev` encerra limpo, sem stack trace e sem processo órfão
- [ ] `buildApp()` não abre porta nem conexão ao ser importado
- [ ] PR verde no CI; memória atualizada

---

## 8. Armadilhas conhecidas

1. **`setValidatorCompiler` depois de registrar rota não tem efeito.** Tem que ser a
   primeira coisa depois de criar a instância.
2. **`instanceof` com classe que estende `Error` em ESM/ES2023** funciona, mas exige
   `super(message)` na primeira linha. Se o `target` do tsconfig fosse ES5 quebraria —
   é ES2023 (F1-S02), então está seguro.
3. **`hasZodFastifySchemaValidationErrors` é o helper correto** do
   `fastify-type-provider-zod` v6. Não faça `error instanceof ZodError` no error handler:
   o Fastify embrulha o erro de validação e o `instanceof` falha.
4. **Redaction do Pino usa caminhos com sintaxe própria.** `res.headers["set-cookie"]`
   precisa das aspas dentro dos colchetes. Teste que funciona — um redact escrito errado
   não avisa, só não redige.
5. **`process.exit` dentro de `app.ts`** mata a suíte de testes. Ele vive só em `server.ts`.
6. **`setNotFoundHandler` só pode ser chamado uma vez por escopo.** Chame no plugin de
   erro, não também em `app.ts`.
7. **`pino-pretty` como `transport` em produção** cria uma worker thread desnecessária e
   quebra a saída JSON esperada pela Railway. Só em `development` (D-18).

---

## 9. Registro na memória

- **`PROGRESS.md`** — F1-S05 ✅, próximo = F1-S06.
- **`F1-S05.md`** — a ordem final de checagem do error handler e a lista de caminhos do
  `redact`. Sprints futuros vão consultar as duas coisas.
