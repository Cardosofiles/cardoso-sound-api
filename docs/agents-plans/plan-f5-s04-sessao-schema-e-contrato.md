# Plano de Implementação — Sprint F5-S04: Endurecimento de Sessão, Schema e Contrato

> **Status:** 🟡 Planejamento Concluído · Aguardando Autorização do Usuário (Etapa 3 do Protocolo)  
> **Fase:** F5 — Produção · **3º dos 6 sprints de blindagem** ([D-49](file:///.agents/memory/DECISIONS.md#d-49))  
> **Branch Alvo:** `feature/f5s04-sessao-schema-e-contrato`  
> **Depende de:** F5-S03 (Recuperação de conta, anti-enumeração e senha entregues)  
> **Entrega:** GAP-13, GAP-16, GAP-19, GAP-20, GAP-23, GAP-26 · **achado R-01**  
> **Specs de Referência:**
>
> - [`docs/sprints/fase-5-producao/F5-S04-sessao-schema-e-contrato.md`](file:///docs/sprints/fase-5-producao/F5-S04-sessao-schema-e-contrato.md) (Sprint Brief Normativo)
> - [`docs/specs/08-blindagem-de-seguranca.md`](file:///docs/specs/08-blindagem-de-seguranca.md) (§6.1, §8.4, §8.5, §9)
> - [`docs/specs/02-modelo-de-dados.md`](file:///docs/specs/02-modelo-de-dados.md) (Modelo relacional e tipos)
> - [`docs/specs/04-autenticacao-e-seguranca.md`](file:///docs/specs/04-autenticacao-e-seguranca.md) (§2, §5)
> - [`docs/specs/07-protocolo-dos-agentes.md`](file:///docs/specs/07-protocolo-dos-agentes.md) (Protocolo de 7 etapas)
> - [`.agents/memory/DECISIONS.md`](file:///.agents/memory/DECISIONS.md) (**D-22**, **D-39**, **D-40**, **D-44**, **D-47**, **D-60**)
> - [`.agents/memory/F2-S01.md`](file:///.agents/memory/F2-S01.md) e [`.agents/memory/F3-S01.md`](file:///.agents/memory/F3-S01.md) (Origem do schema e da ponte Fastify↔Fetch)
> - [`.agents/memory/F5-S02.md`](file:///.agents/memory/F5-S02.md) §5 e [`docs/agents-reviews/review-f5-s02-validacao-ponta-a-ponta.md`](file:///docs/agents-reviews/review-f5-s02-validacao-ponta-a-ponta.md) (Achado R-01 medido)

---

## 1. Relatório Mandatório Pré-Implementação (§5.1)

Em estrita conformidade com a §5.1 do sprint brief, foram executadas inspeções diretas no runtime instalado (`better-auth@1.7.2` / `@better-auth/core@1.7.2`), no gerador de schemas e no banco de dados ativo antes de qualquer escrita de código:

### 1.1 Verificação (a): Assinatura de `session.cookieCache`

- **Comando:** `grep -rn -C 10 "cookieCache" node_modules/.pnpm/@better-auth+core@1.7.2*/node_modules/@better-auth/core/dist/types/init-options.d.mts`
- **Evidência no runtime:**
  ```typescript
  // @better-auth/core/dist/types/init-options.d.mts:952-962
  cookieCache?: {
    /**
     * max age of the cookie
     * @default 5 minutes (5 * 60)
     */
    maxAge?: number;
    /**
     * Enable caching session in cookie
     * @default false
     */
    enabled?: boolean;
    strategy?: "jwt" | "compact";
  };
  ```
- **Conclusão:** `session.cookieCache` **existe exatamente com essa forma**. Aceita `{ enabled: boolean, maxAge?: number }` e tem default de 5 minutos (300 segundos). A configuração `{ enabled: true, maxAge: 5 * 60 }` é 100% canônica e compatível.

### 1.2 Verificação (b): Assinatura de `logger` nas opções do `betterAuth`

- **Comando:** `grep -rn "logger" node_modules/.pnpm/@better-auth+core@1.7.2*/node_modules/@better-auth/core/dist/types/init-options.d.mts` e inspeção de `dist/env/logger.d.mts`
- **Evidência no runtime:**
  ```typescript
  // @better-auth/core/dist/types/init-options.d.mts:1226
  logger?: Logger | undefined;

  // @better-auth/core/dist/env/logger.d.mts:32-40
  type LogLevel = "debug" | "info" | "success" | "warn" | "error";
  interface Logger {
    disabled?: boolean | undefined;
    disableColors?: boolean | undefined;
    level?: Exclude<LogLevel, "success"> | undefined;
    log?: ((level: Exclude<LogLevel, "success">, message: string, ...args: any[]) => void) | undefined;
  }
  ```
- **Conclusão:** `betterAuth` aceita a opção `logger: { level: 'error' }`, onde `level` aceita `'debug' | 'info' | 'warn' | 'error'`. A configuração `logger: { level: 'error' }` é estritamente tipada e válida.

### 1.3 Verificação (c): Sincronização do Schema com `@better-auth/cli generate`

- **Comando:**
  ```bash
  pnpm dlx @better-auth/cli@latest generate --config src/modules/auth/auth.config.ts --output <scratch-file> -y
  ```
- **Resultado:** A geração concluiu com sucesso (`🚀 Schema was generated successfully!`). O schema gerado contém exatamente as quatro tabelas canônicas: `user`, `session`, `account`, `verification`. Não houve detecção de novas tabelas (2FA ou passkey, que pertencem aos sprints F5-S05 e F5-S06). Todas as colunas existentes coincidem byte a byte com [`src/db/schema/users.schema.ts`](file:///src/db/schema/users.schema.ts) (com a coluna adicional `issuer` em `account` introduzida deliberadamente por [D-43](file:///.agents/memory/DECISIONS.md#d-43)).
- **Conclusão:** O schema está **perfeitamente sincronizado** antes do sprint. As adições deste sprint consistem **exclusivamente em 3 índices e 1 restrição única**, que o CLI não gera por padrão e que não alteram a definição de colunas.

### 1.4 Verificação Prévia de Duplicidade de Dados (Prevenção de Falha de Constraint)

- **Comando SQL no Postgres ativo:**
  ```sql
  SELECT provider_id, account_id, count(*)
  FROM account GROUP BY 1, 2 HAVING count(*) > 1;
  ```
- **Resultado:** `(0 rows)`. Não existem contas duplicadas no banco de dados local. A restrição única `account_provider_account_unique` poderá ser aplicada de forma segura e imediata.

---

## 2. Diagnóstico dos GAPs e Achado R-01

| Item       | Gravidade | Onde atua                                                                                                                 | Defeito e Impacto                                                                                                                                                                                                                                                                   | Resolução Neste Sprint                                                                                                                                                                                                                                                             |
| :--------- | :-------- | :------------------------------------------------------------------------------------------------------------------------ | :---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | :--------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **GAP-13** | MÉDIA     | [`auth.config.ts`](file:///src/modules/auth/auth.config.ts) / [`auth.plugin.ts`](file:///src/modules/auth/auth.plugin.ts) | O hook `onRequest` global consulta o banco em toda requisição, inclusive em `/health` (sonda liveness sem rate limit por D-20) e `/api/auth/*` (que resolve sessão novamente no handler).                                                                                           | Ativar `session.cookieCache: { enabled: true, maxAge: 5 * 60 }` e curto-circuitar o hook com `shouldResolveSession(url)` para bypass em `/health*` e `/api/auth*`.                                                                                                                 |
| **GAP-16** | MÉDIA     | [`users.schema.ts`](file:///src/db/schema/users.schema.ts)                                                                | A tabela `account` não possui restrição única em `(provider_id, account_id)`. Callbacks concorrentes de linking OAuth (read-then-write) criam linhas duplicadas (D-47).                                                                                                             | Adicionar `uniqueIndex('account_provider_account_unique').on(t.providerId, t.accountId)` em `account`.                                                                                                                                                                             |
| **GAP-19** | BAIXO     | [`users.schema.ts`](file:///src/db/schema/users.schema.ts)                                                                | Ausência de índices em colunas percorridas em cascades de deleção de usuário e buscas de token: `session.userId`, `account.userId` e `verification.identifier`.                                                                                                                     | Adicionar `index('session_user_id_idx').on(t.userId)`, `index('account_user_id_idx').on(t.userId)` e `index('verification_identifier_idx').on(t.identifier)`.                                                                                                                      |
| **GAP-20** | BAIXO     | [`swagger.plugin.ts`](file:///src/plugins/swagger.plugin.ts)                                                              | O `securityScheme` declara estaticamente `better-auth.session_token`. Em produção (ou HTTPS), o Better Auth prefixa com `__Secure-`. Clientes Swagger UI enviam cookie inexistente.                                                                                                 | Criar função utilitária `sessionCookieName(nodeEnv, baseUrl)` que aplica o prefixo `__Secure-` quando `nodeEnv === 'production'` ou `baseUrl` inicia com `https://`.                                                                                                               |
| **GAP-23** | BAIXO     | [`auth.config.ts`](file:///src/modules/auth/auth.config.ts)                                                               | Métodos nativos de sign-up e sign-in da lib registram e-mails em plaintext via `console.info`/`console.warn`, vazando dados sensíveis no stdout fora da redaction do Pino (D-22).                                                                                                   | Configurar `logger: { level: 'error' }` nas opções do `betterAuth`.                                                                                                                                                                                                                |
| **GAP-26** | MÉDIA     | [`auth.plugin.ts`](file:///src/modules/auth/auth.plugin.ts)                                                               | Respostas de erro em `/api/auth/*` devolviam JSON cru `{ code, message }` do Better Auth sem o envelope RFC 7807 `{ statusCode, error, message, details }` adotado pelo resto da API.                                                                                               | Implementar `toRfc7807(status, rawBody)` de forma puramente aditiva: preserva `code` e `message`, adiciona o envelope para status >= 400 em JSONs de objeto, e remove `content-length` antigo para evitar truncamento (Armadilha 1).                                               |
| **R-01**   | MÉDIA     | [`auth.plugin.ts`](file:///src/modules/auth/auth.plugin.ts)                                                               | A ponte Fastify↔Fetch repassa `x-forwarded-for` cru do cliente sem socket. Como o Better Auth resolve o IP por header da direita para a esquerda, requisições que chegam fora da borda falsificam `session.ip_address` no banco e contornam as 8 regras de `AUTH_RATE_LIMIT_RULES`. | Parametrizar `toFetchHeaders(incoming, clientIp?)` para sobrescrever incondicionalmente `headers.set('x-forwarded-for', clientIp)`. Repassar `request.ip` (validado por D-60) nos dois call sites da ponte. Manter `advanced.ipAddress.trustedProxies` por defesa em profundidade. |

---

## 3. Blast Radius e Governança de Arquivos

### 3.1 Arquivos a Criar

- [`drizzle/0002_*.sql`](file:///drizzle/) — Migração gerada por `pnpm db:generate`, auditada linha a linha para conter exatamente os 4 comandos de criação de índices.
- [`tests/unit/modules/auth/auth.plugin.test.ts`](file:///tests/unit/modules/auth/auth.plugin.test.ts) — Suíte unitária cobrindo `shouldResolveSession` (T1–T4), `toRfc7807` (T5–T10) e `toFetchHeaders` com `clientIp` (T29–T31).
- [`tests/unit/plugins/swagger-cookie.test.ts`](file:///tests/unit/plugins/swagger-cookie.test.ts) — Suíte unitária cobrindo `sessionCookieName` (T11–T13).
- [`tests/integration/schema-auth-indexes.test.ts`](file:///tests/integration/schema-auth-indexes.test.ts) — Suíte de integração com Testcontainers validando `pg_indexes`, constraint 23505 e cascade (T14–T17).
- [`tests/integration/auth-error-envelope.test.ts`](file:///tests/integration/auth-error-envelope.test.ts) — Suíte de integração validando envelope RFC 7807, preservação de `code`/`message`, recálculo de `content-length`, bypass de `/health` e cache de sessão (T18–T28).
- [`tests/integration/auth-client-ip.test.ts`](file:///tests/integration/auth-client-ip.test.ts) — Suíte de integração validando que `session.ip_address` grava `request.ip` e não o header falsificado (T32) e teste de ancoragem de comportamento da lib para IPs internos (T33).
- [`docs/agents-plans/plan-f5-s04-sessao-schema-e-contrato.md`](file:///docs/agents-plans/plan-f5-s04-sessao-schema-e-contrato.md) — Este documento de planejamento versionado.
- [`.agents/memory/F5-S04.md`](file:///.agents/memory/F5-S04.md) — Memória executiva e técnica da sprint.

### 3.2 Arquivos a Editar

- [`src/db/schema/users.schema.ts`](file:///src/db/schema/users.schema.ts) — Adição do 3º argumento de `pgTable` em `session`, `account` e `verification` definindo os 3 índices e o uniqueIndex.
- [`src/modules/auth/auth.config.ts`](file:///src/modules/auth/auth.config.ts) — Adição de `cookieCache` em `session` e `logger: { level: 'error' }`. `advanced.ipAddress` permanece estritamente intocado.
- [`src/modules/auth/auth.plugin.ts`](file:///src/modules/auth/auth.plugin.ts) — Implementação de `shouldResolveSession`, `toRfc7807`, extensão de `toFetchHeaders(incoming, clientIp?)`, remoção do repasse de `content-length` e injeção de `request.ip` nos dois call sites.
- [`src/plugins/swagger.plugin.ts`](file:///src/plugins/swagger.plugin.ts) — Exportação de `sessionCookieName` e aplicação no `cookieAuth` securityScheme.
- [`docs/openapi.json`](file:///docs/openapi.json) — Regeneração controlada via `pnpm openapi:export`.
- [`.agents/memory/PROGRESS.md`](file:///.agents/memory/PROGRESS.md) — Atualização do status do roadmap (F5-S04 ✅, próximo F5-S05, resolução da pendência P6 e novo contrato de índices).

### 3.3 Arquivos Intocáveis (Blast Radius Proibido)

- `src/config/env.ts` (nenhuma variável nova)
- `src/app.ts` (nenhum plugin ou middleware novo)
- `src/plugins/{rate-limit,cors,helmet,under-pressure,error-handler,health}.plugin.ts`
- `src/modules/{users,playlists,favorites,artists,tracks}/**`
- `src/shared/email/**`
- `drizzle/0000_*.sql` e `drizzle/0001_*.sql` (migrações aplicadas são estritamente imutáveis por D-39)
- `tests/e2e/**` (deve continuar verde sem modificações)
- `advanced.ipAddress` dentro de `src/modules/auth/auth.config.ts` (preservado intencionalmente conforme §5.7 e Armadilha 14)

---

## 4. Detalhamento Técnico das Modificações

### 4.1 Schema Drizzle e Migração 0002 ([GAP-16](file:///docs/issue/AUTHENTICATION.md#gap-16), [GAP-19](file:///docs/issue/AUTHENTICATION.md#gap-19))

Em [`src/db/schema/users.schema.ts`](file:///src/db/schema/users.schema.ts):

```typescript
import { boolean, index, pgTable, text, timestamp, uniqueIndex } from 'drizzle-orm/pg-core';

export const session = pgTable('session', {/* colunas existentes inalteradas */}, (t) => [
  index('session_user_id_idx').on(t.userId),
]);

export const account = pgTable('account', {/* colunas existentes inalteradas */}, (t) => [
  index('account_user_id_idx').on(t.userId),
  uniqueIndex('account_provider_account_unique').on(t.providerId, t.accountId),
]);

export const verification = pgTable('verification', {/* colunas existentes inalteradas */}, (t) => [
  index('verification_identifier_idx').on(t.identifier),
]);
```

**Migração SQL Esperada (`drizzle/0002_*.sql`):**
Ao executar `pnpm db:generate`, o Drizzle Kit deve emitir exatamente:

```sql
CREATE INDEX "session_user_id_idx" ON "session" USING btree ("user_id");
CREATE INDEX "account_user_id_idx" ON "account" USING btree ("user_id");
CREATE UNIQUE INDEX "account_provider_account_unique" ON "account" USING btree ("provider_id","account_id");
CREATE INDEX "verification_identifier_idx" ON "verification" USING btree ("identifier");
```

A migração será inspecionada linha a linha antes da execução de `pnpm db:migrate`. O uso de `pnpm db:push` é terminantemente proibido.

---

### 4.2 Configuração do Better Auth ([GAP-13](file:///docs/issue/AUTHENTICATION.md#gap-13), [GAP-23](file:///docs/issue/AUTHENTICATION.md#gap-23))

Em [`src/modules/auth/auth.config.ts`](file:///src/modules/auth/auth.config.ts):

```typescript
    session: {
      expiresIn: 60 * 60 * 24 * 7, // 7 dias em segundos (inalterado)
      updateAge: 60 * 60 * 24, // 24 horas em segundos (inalterado)
      cookieCache: { enabled: true, maxAge: 5 * 60 }, // GAP-13: 5 minutos
    },
    logger: { level: 'error' }, // GAP-23: suprime logs de info/warn com e-mails em stdout
    rateLimit: {
      /* inalterado */
    },
    advanced: {
      disableOriginCheck: false,
      ipAddress: {
        ipAddressHeaders: ['x-forwarded-for'],
        trustedProxies: TRUSTED_PROXY_LIST, // MANTIDO INALTERADO conforme §5.7 e Armadilha 14
      },
    },
```

---

### 4.3 Ponte Fastify↔Fetch, Envelope de Erro e Sobrescrita de IP ([GAP-13](file:///docs/issue/AUTHENTICATION.md#gap-13), [GAP-26](file:///docs/issue/AUTHENTICATION.md#gap-26), R-01)

Em [`src/modules/auth/auth.plugin.ts`](file:///src/modules/auth/auth.plugin.ts):

1. **Curto-circuito do Hook `onRequest`:**

   ```typescript
   export function shouldResolveSession(url: string): boolean {
     return !url.startsWith('/health') && !url.startsWith('/api/auth');
   }
   ```

   No hook `onRequest`:

   ```typescript
   fastify.addHook('onRequest', async (request) => {
     if (!shouldResolveSession(request.url)) {
       request.user = null;
       request.session = null;
       return;
     }

     try {
       const result = await auth.api.getSession({
         headers: toFetchHeaders(request.headers, request.ip),
       });

       request.user = result?.user ?? null;
       request.session = result?.session ?? null;
     } catch {
       request.user = null;
       request.session = null;
     }
   });
   ```

2. **Sobrescrita do IP em `toFetchHeaders` (R-01):**

   ```typescript
   export function toFetchHeaders(incoming: IncomingHttpHeaders, clientIp?: string): Headers {
     const headers = new Headers();
     for (const [key, value] of Object.entries(incoming)) {
       if (value === undefined) continue;
       if (Array.isArray(value)) {
         for (const item of value) {
           headers.append(key, item);
         }
       } else {
         headers.append(key, value);
       }
     }
     if (clientIp) {
       headers.set('x-forwarded-for', clientIp); // SET mandatório, nunca append (T30)
     }
     return headers;
   }
   ```

3. **Envelope RFC 7807 Aditivo e Remoção de `content-length` Antigo ([GAP-26](file:///docs/issue/AUTHENTICATION.md#gap-26)):**
   ```typescript
   import { STATUS_CODES } from 'node:http';

   export function toRfc7807(status: number, rawBody: string): string {
     if (status < 400) return rawBody;
     let parsed: unknown;
     try {
       parsed = JSON.parse(rawBody);
     } catch {
       return rawBody; // não-JSON (HTML, vazio, texto plano) repassado intacto
     }
     if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
       return rawBody;
     }
     return JSON.stringify({
       ...parsed, // code e message originais preservados byte a byte
       statusCode: status,
       error: STATUS_CODES[status] ?? 'Error',
       details: null,
     });
   }
   ```
   Na rota curinga `/api/auth/*`:
   ```typescript
   const headers = toFetchHeaders(request.headers, request.ip); // R-01 nos 2 call sites
   // ...
   const res = await auth.handler(req);
   reply.status(res.status);

   const setCookies = res.headers.getSetCookie();
   if (setCookies.length > 0) {
     void reply.header('set-cookie', setCookies);
   }

   // Repassa headers exceto set-cookie e content-length (Fastify recalcula após o envelope)
   res.headers.forEach((value, key) => {
     const lower = key.toLowerCase();
     if (lower !== 'set-cookie' && lower !== 'content-length') {
       void reply.header(key, value);
     }
   });

   const bodyText = await res.text();
   const transformedBody = toRfc7807(res.status, bodyText);
   return reply.send(transformedBody || null);
   ```

---

### 4.4 Swagger Plugin e Nome do Cookie ([GAP-20](file:///docs/issue/AUTHENTICATION.md#gap-20))

Em [`src/plugins/swagger.plugin.ts`](file:///src/plugins/swagger.plugin.ts):

```typescript
export function sessionCookieName(nodeEnv: string, baseUrl: string): string {
  const isSecure = nodeEnv === 'production' || baseUrl.startsWith('https://');
  return isSecure ? '__Secure-better-auth.session_token' : 'better-auth.session_token';
}
```

E na configuração de `securitySchemes`:

```typescript
            cookieAuth: {
              type: 'apiKey',
              in: 'cookie',
              name: sessionCookieName(env.NODE_ENV, env.BETTER_AUTH_URL),
            },
```

---

## 5. Matriz de Casos de Teste (T1 a T33)

### 5.1 Testes Unitários: `tests/unit/modules/auth/auth.plugin.test.ts`

- **T1:** `shouldResolveSession('/health')` e `('/health/ready')` retornam `false`.
- **T2:** `shouldResolveSession('/api/auth/get-session')` retorna `false`.
- **T3:** `shouldResolveSession('/api/v1/me')` e `('/api/v1/tracks')` retornam `true`.
- **T4:** `shouldResolveSession('/docs')` retorna `true`.
- **T5:** `toRfc7807(401, '{"code":"X","message":"Y"}')` mantém `code` e `message` e acrescenta `statusCode: 401`, `error: "Unauthorized"`, `details: null`.
- **T6:** `toRfc7807(200, '{"user":{...},"token":"t"}')` retorna string idêntica à entrada (respostas 2xx intactas).
- **T7:** `toRfc7807(400, '<html>erro</html>')` retorna string idêntica à entrada (não-JSON intacto).
- **T8:** `toRfc7807(500, '')` retorna string vazia intacta.
- **T9:** `toRfc7807(400, '[1,2,3]')` retorna string idêntica à entrada (arrays não são envelopes).
- **T10:** `toRfc7807(404, '{"message":"m"}')` produz objeto com `error === 'Not Found'`.
- **T29:** `toFetchHeaders({ 'x-forwarded-for': '6.6.6.6' }, '198.51.100.9')` resulta em `headers.get('x-forwarded-for') === '198.51.100.9'`.
- **T30:** Contagem de valores de `x-forwarded-for` no caso anterior é estritamente 1 (prova que foi `set` e não `append`).
- **T31:** `toFetchHeaders({ 'x-forwarded-for': '6.6.6.6' })` sem `clientIp` preserva `'6.6.6.6'` (retrocompatibilidade).

### 5.2 Testes Unitários: `tests/unit/plugins/swagger-cookie.test.ts`

- **T11:** `sessionCookieName('production', 'http://x')` retorna `'__Secure-better-auth.session_token'`.
- **T12:** `sessionCookieName('development', 'https://x')` retorna `'__Secure-better-auth.session_token'`.
- **T13:** `sessionCookieName('development', 'http://localhost:3333')` retorna `'better-auth.session_token'`.

### 5.3 Testes de Integração: `tests/integration/schema-auth-indexes.test.ts`

- **T14:** Query em `pg_indexes` comprova a existência de `session_user_id_idx`, `account_user_id_idx` e `verification_identifier_idx`.
- **T15:** Query em `pg_indexes` comprova que `account_provider_account_unique` existe e possui `indisunique = true` no PostgreSQL.
- **T16:** Tentativa de inserir duas linhas em `account` com o mesmo `(provider_id, account_id)` rejeita com erro `23505` (unique_violation).
- **T17:** `DELETE FROM "user"` em cascata remove sessões e contas associadas sem erros e sem deixar órfãos.

### 5.4 Testes de Integração: `tests/integration/auth-error-envelope.test.ts`

- **T18:** `POST /api/auth/sign-in/email` com senha incorreta responde status 401 e o corpo parseado possui `code`, `message`, `statusCode`, `error` e `details`.
- **T19:** No teste anterior, o valor da propriedade `code` permanece inalterado em relação ao contrato nativo do Better Auth.
- **T20:** Sign-in bem-sucedido não recebe acréscimo de `statusCode` ou `error` no corpo de sucesso.
- **T21:** O cabeçalho `content-length` na resposta de erro coincide exatamente com `Buffer.byteLength(body)` (sem truncamento de payload).
- **T22:** Fluxo de autenticação completo de F3 (`sign-up` -> verificação offline -> `sign-in` -> `get-session`) permanece 100% verde (ponte sem regressões).
- **T23:** Múltiplos cabeçalhos `Set-Cookie` retornam intactos em array (D-44 preservado).
- **T24:** `GET /health` enviado com `Authorization: Bearer <token>` resulta em **zero** consultas SQL direcionadas à tabela `session` (medido via spy no `pool.query` do Testcontainers).
- **T25:** `GET /api/v1/me` com bearer token válido responde 200 com perfil do usuário.
- **T26:** `GET /api/v1/me` com bearer inválido responde 401 Unauthorized com RFC 7807.
- **T27:** Duas requisições seguidas a `GET /api/v1/me` dentro de 5 minutos com o mesmo cookie de sessão utilizam o `cookieCache`, executando zero consultas SQL à tabela `session` na segunda requisição.
- **T28:** Suíte E2E completa de `tests/e2e/specs/` roda e passa sem qualquer regressão.

### 5.5 Testes de Integração: `tests/integration/auth-client-ip.test.ts` (R-01)

- **T32:** Requisição de `sign-up` enviada via `app.inject({ remoteAddress: '198.51.100.9', headers: { 'x-forwarded-for': '6.6.6.6' } })`. Consulta subsequente `SELECT ip_address FROM session` retorna estritamente `'198.51.100.9'`, comprovando que o `X-Forwarded-For` forjado pelo cliente foi descartado.
- **T33:** Teste de premissa do `@better-auth/core`: `getIPFromHeader('10.0.0.5', { trustedProxies: ['10.0.0.0/8'] })` importado diretamente do pacote instalado retorna `null` (garantindo que se o comportamento da lib mudar em atualizações futuras, a suíte acusará).

---

## 6. Plano de Execução Passo a Passo (Etapa 4 do Protocolo)

1. **Criação da Branch de Trabalho:**
   - `git checkout -b feature/f5s04-sessao-schema-e-contrato` (a partir de `develop` atualizado).
2. **Implementação do Schema e Geração da Migração:**
   - Editar [`src/db/schema/users.schema.ts`](file:///src/db/schema/users.schema.ts) com os índices e a restrição única.
   - Executar `pnpm db:generate`.
   - Inspecionar minuciosamente o arquivo `drizzle/0002_*.sql` gerado (esperados exatamente os 4 comandos de criação de índice).
   - Executar `pnpm db:migrate` localmente.
3. **Criação da Suíte de Integração de Schema:**
   - Criar [`tests/integration/schema-auth-indexes.test.ts`](file:///tests/integration/schema-auth-indexes.test.ts) cobrindo T14–T17.
   - Validar execução verde com Vitest e Testcontainers.
4. **Atualização da Configuração do Better Auth:**
   - Editar [`src/modules/auth/auth.config.ts`](file:///src/modules/auth/auth.config.ts): adicionar `session.cookieCache` e `logger: { level: 'error' }`.
   - Garantir que `advanced.ipAddress` não foi tocado.
5. **Atualização da Ponte Fastify↔Fetch no Auth Plugin:**
   - Editar [`src/modules/auth/auth.plugin.ts`](file:///src/modules/auth/auth.plugin.ts):
     - Exportar e implementar `shouldResolveSession`.
     - Exportar e estender `toFetchHeaders(incoming, clientIp?)`.
     - Exportar e implementar `toRfc7807`.
     - Filtrar `content-length` junto com `set-cookie` no repasse de headers.
     - Injetar `request.ip` nos dois call sites da ponte.
6. **Criação dos Testes Unitários de Auth Plugin e Swagger:**
   - Criar [`tests/unit/modules/auth/auth.plugin.test.ts`](file:///tests/unit/modules/auth/auth.plugin.test.ts) (T1–T10, T29–T31).
   - Criar [`tests/unit/plugins/swagger-cookie.test.ts`](file:///tests/unit/plugins/swagger-cookie.test.ts) (T11–T13).
   - Executar suítes unitárias e verificar cobertura.
7. **Implementação da Derivação do Cookie no Swagger Plugin:**
   - Editar [`src/plugins/swagger.plugin.ts`](file:///src/plugins/swagger.plugin.ts) aplicando `sessionCookieName`.
   - Executar `pnpm openapi:export`.
   - Verificar `git diff docs/openapi.json` (apenas a chave `name` do cookie deve alterar, caso aplicável).
8. **Criação das Suítes de Integração de Envelope e Client IP:**
   - Criar [`tests/integration/auth-error-envelope.test.ts`](file:///tests/integration/auth-error-envelope.test.ts) (T18–T28).
   - Criar [`tests/integration/auth-client-ip.test.ts`](file:///tests/integration/auth-client-ip.test.ts) (T32–T33).
   - Validar execução integral verde.
9. **Validações Manuais Obrigatórias (§7 do Brief):**
   - Validação da resposta com curl no servidor local para confirmação dos 5 campos do envelope.
   - Validação de R-01 com processo compilado `node dist/server.js` e 12 requisições em curl rotacionando IP para confirmação de 429 a partir da 6ª tentativa.
   - Inspeção no Postgres das definições de índices em `session`, `account` e `verification`.
10. **Portões de Qualidade:**
    - `pnpm typecheck`
    - `pnpm lint`
    - `pnpm format`
    - `pnpm test`
    - `pnpm build`
    - `pnpm dlx @better-auth/cli@latest generate --config src/modules/auth/auth.config.ts` (sem diferenças)
11. **Registro na Memória e Encerramento:**
    - Atualizar [`docs/openapi.json`](file:///docs/openapi.json) se necessário.
    - Criar [`.agents/memory/F5-S04.md`](file:///.agents/memory/F5-S04.md) com todas as seções obrigatórias e saídas reais dos testes.
    - Atualizar [`.agents/memory/PROGRESS.md`](file:///.agents/memory/PROGRESS.md) marcando F5-S04 ✅ e P6 resolvida.
    - Abrir PR via `gh pr create` e aguardar CI verde no GitHub Actions.

---

## 7. Mapeamento e Prevenção das 14 Armadilhas Conhecidas

1. **`content-length` repassado com o corpo reescrito:** No loop de repasse de resposta da ponte, remover explicitamente `content-length` (além de `set-cookie`) para que o Fastify recalcule o tamanho do payload RFC 7807 aumentado. Testado por T21.
2. **Reescrever corpo de sucesso:** `toRfc7807` aplica curto-circuito em `status < 400`, devolvendo `rawBody` intocado. Testado por T6 e T20.
3. **Substituir `code`/`message`:** O envelope utiliza `...parsed` mantendo as propriedades originais no topo do objeto. Testado por T5 e T19.
4. **Editar migrações antigas:** Somente a nova migração `0002_*.sql` é gerada e auditada; `0000` e `0001` permanecem intocadas por [D-39](file:///.agents/memory/DECISIONS.md#d-39).
5. **Uso de `db:push`:** Terminantemente proibido; migrações executadas estritamente via `pnpm db:migrate`.
6. **Restrição única falhar por dados preexistentes:** Já auditado na §1.4 (`count > 1` = 0 linhas).
7. **Curto-circuitar rotas de domínio:** `shouldResolveSession` valida apenas `/health` e `/api/auth`. Rotas de catálogo e `/api/v1/*` continuam resolvendo sessão normalmente. Testado por T1–T4.
8. **Achar que `cookieCache` dispensa curto-circuito:** As duas metades são implementadas juntas (GAP-13 completo).
9. **Importar `src/app.ts` dentro de `auth.config.ts`:** Proibido por boundary rules. Utiliza-se `logger: { level: 'error' }` nativo.
10. **Regenerar `openapi.json` sem checar o diff:** Diff auditado para garantir que nenhuma alteração não intencional de schemas ocorra.
11. **Usar `append` em vez de `set` no `x-forwarded-for` (R-01):** Utiliza-se estritamente `headers.set('x-forwarded-for', clientIp)` para substituir o cabeçalho forjado. Testado por T30.
12. **Sobrescrever IP em apenas um call site:** `request.ip` é passado obrigatoriamente tanto na rota curinga (`:43`) quanto no hook `onRequest` (`:78`).
13. **Achar que R-01 dispensa `TRUST_PROXY_HOPS` correto:** Comportamento documentado em P3 e travado pelo caso T33.
14. **Remover `advanced.ipAddress.trustedProxies` por achar redundante:** Mantido intacto deliberadamente como defesa em profundidade caso o `clientIp` seja omitido no futuro.

---

## 8. Definition of Done (DoD)

- [ ] Branch `feature/f5s04-sessao-schema-e-contrato` criada a partir de `develop`.
- [ ] Casos de teste T1 a T33 implementados e 100% verdes.
- [ ] `grep -n "toFetchHeaders(request.headers)" src/modules/auth/auth.plugin.ts` retorna vazio (ambos passam `request.ip`).
- [ ] `advanced.ipAddress` em `auth.config.ts` inalterado.
- [ ] Migração `drizzle/0002_*.sql` gerada com exatamente 4 comandos SQL e aplicada com sucesso.
- [ ] `pnpm db:push` nunca executado.
- [ ] `@better-auth/cli generate` sem diferenças de schema.
- [ ] `docs/openapi.json` regenerado e em conformidade.
- [ ] Respostas de erro de `/api/auth/*` contêm o envelope RFC 7807 preservando `code` e `message`.
- [ ] Verificação manual de R-01 em socket real executada e registrada em `F5-S04.md` com 429 na 6ª requisição.
- [ ] Cinco portões de qualidade passando: `typecheck`, `lint`, `format`, `test`, `build`.
- [ ] Documentação de memória atualizada: `PROGRESS.md` e `F5-S04.md`.
- [ ] PR criado e CI verde no GitHub Actions.
