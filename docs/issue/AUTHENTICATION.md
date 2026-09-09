# GAPs de Autenticação e Segurança — Better Auth

**Projeto:** `cardoso-sound-api`
**Data:** 2026-09-09
**Autoria:** Staff Engineer (Claude Opus 5) + subagente `security-review`
**Versão auditada:** `better-auth@1.7.2` · `fastify@5.12.1` · `@fastify/rate-limit@10.1.1`
**Status:** **remediação planejada e autorizada** — 27 GAPs distribuídos em `F5-S02`…`F5-S07` (§9, D-49).
**Nenhuma linha de código foi alterada**: o `develop` segue com os 27 GAPs abertos.

---

## 1. Escopo e método

Auditoria estática em duas passagens independentes — a minha e a do subagente `security-review`,
que leu inclusive o código de `node_modules/better-auth/dist/**` para confirmar comportamento de
runtime em vez de inferi-lo da documentação.

| Arquivo                                                           | Papel                                                      |
| ----------------------------------------------------------------- | ---------------------------------------------------------- |
| `src/modules/auth/auth.config.ts`                                 | Instância única do Better Auth                             |
| `src/modules/auth/auth.plugin.ts`                                 | Ponte Fastify ↔ Fetch, hook de sessão, guard `requireAuth` |
| `src/modules/auth/auth.routes.ts`                                 | Vazio por D-45 (rota curinga vive no plugin)               |
| `src/plugins/rate-limit.plugin.ts`                                | `@fastify/rate-limit`                                      |
| `src/plugins/{cors,helmet,error-handler,swagger}.plugin.ts`       | Borda e formatação de erro                                 |
| `src/db/schema/users.schema.ts` · `drizzle/**`                    | Tabelas `user`, `session`, `account`, `verification`       |
| `src/config/env.ts` · `.env.example` · `.github/workflows/ci.yml` | Configuração e segredos                                    |
| `src/shared/email/{mailer,templates}.ts`                          | E-mail transacional                                        |
| `src/app.ts`                                                      | Ordem de registro (load-bearing)                           |
| `src/modules/{users,playlists,favorites}`                         | Guard e isolamento por `userId`                            |
| `tests/**`                                                        | Cobertura efetiva do comportamento de segurança            |

Referência oficial consultada em 2026-09-09:
[Fastify](https://better-auth.com/docs/integrations/fastify) ·
[Email & Password](https://better-auth.com/docs/authentication/email-password) ·
[Google](https://better-auth.com/docs/authentication/google) ·
[GitHub](https://better-auth.com/docs/authentication/github) ·
[Facebook](https://better-auth.com/docs/authentication/facebook) ·
[2FA](https://better-auth.com/docs/plugins/2fa) ·
[Passkey](https://better-auth.com/docs/plugins/passkey).

---

## 2. Cobertura funcional exigida × implementada

| Capacidade solicitada         | Endpoint canônico                                       | Status                        | Evidência                        |
| ----------------------------- | ------------------------------------------------------- | ----------------------------- | -------------------------------- |
| Sign up                       | `POST /api/auth/sign-up/email`                          | **Implementado**              | `auth.config.ts:74-84`           |
| Sign in                       | `POST /api/auth/sign-in/email`                          | **Implementado**              | `auth.config.ts:74-84`           |
| Sign out                      | `POST /api/auth/sign-out`                               | **Implementado**              | nativo                           |
| Email verification            | `POST /send-verification-email` · `GET /verify-email`   | **Implementado, não exigido** | `auth.config.ts:85-93` + GAP-14  |
| Recuperação de senha          | `POST /request-password-reset` · `POST /reset-password` | **Implementado**              | `auth.config.ts:79-83`, `:24-35` |
| Update password               | `POST /api/auth/change-password`                        | **Implementado, sem teste**   | GAP-24                           |
| OAuth Google                  | `POST /sign-in/social`                                  | **Implementado**              | `auth.config.ts:38-42`           |
| OAuth GitHub                  | `POST /sign-in/social`                                  | **Implementado**              | `auth.config.ts:43-47`           |
| OAuth Facebook                | `POST /sign-in/social`                                  | **Implementado**              | `auth.config.ts:48-52`           |
| **Two Factor — TOTP**         | `POST /two-factor/verify-totp`                          | **AUSENTE**                   | GAP-02                           |
| **Two Factor — OTP**          | `POST /two-factor/send-otp` · `/verify-otp`             | **AUSENTE**                   | GAP-02                           |
| **Two Factor — backup codes** | `POST /two-factor/generate-backup-codes`                | **AUSENTE**                   | GAP-02                           |
| **Passkey (WebAuthn/FIDO2)**  | `POST /sign-in/passkey` · `/passkey/add-passkey`        | **AUSENTE**                   | GAP-03                           |

Busca literal por `twoFactor|passkey|otp|totp|webauthn` em `src/`, `tests/`, `drizzle/` e
`package.json`: **zero ocorrências em código**. Só aparecem em documentação e no lockfile.
`plugins: [bearer(), forgetPasswordPlugin()]` (`auth.config.ts:116`) é a lista completa.

**9 de 13 capacidades entregues.** As 4 ausentes formam a totalidade do domínio multifator.

---

## 3. Matriz de GAPs

| ID         |    Sev.     | Categoria         | Resumo                                                                                                         |
| :--------- | :---------: | :---------------- | :------------------------------------------------------------------------------------------------------------- |
| **GAP-01** | **CRÍTICO** | Rate limiting     | `global: NODE_ENV === 'development'` desliga o rate limit global **em produção** — negação exata de D-19       |
| **GAP-02** |  **ALTO**   | MFA               | Plugin `twoFactor` (TOTP + OTP + backup codes) não registrado                                                  |
| **GAP-03** |  **ALTO**   | Passwordless      | `@better-auth/passkey` não instalado, plugin não registrado                                                    |
| **GAP-04** |  **ALTO**   | Rate limiting     | Chave de rate limit do Better Auth derivada de `X-Forwarded-For` não validado — bypass total ou DoS coletivo   |
| **GAP-05** |  **ALTO**   | Rate limiting     | Regra de 3/h protege só o alias `/forget-password`; o endpoint nativo `/request-password-reset` fica em 10/min |
| **GAP-06** |  **ALTO**   | Brute force       | `/sign-in/email` sem `customRule` dedicada — 10 tentativas/min por IP                                          |
| **GAP-07** |  **ALTO**   | Sessão            | Sessões ativas sobrevivem ao reset de senha (`revokeSessionsOnPasswordReset` ausente)                          |
| **GAP-08** |  **ALTO**   | Enumeração        | `/sign-up/email` distingue e-mail cadastrado (422) de novo (200)                                               |
| **GAP-09** |  **MÉDIO**  | Banco de dados    | Tabelas `two_factor` e `passkey` e coluna `user.two_factor_enabled` inexistentes                               |
| **GAP-10** |  **MÉDIO**  | Infra             | `trustProxy` não configurado                                                                                   |
| **GAP-11** |  **MÉDIO**  | Rate limiting     | `keyGenerator` lê `req.user.id` antes do hook que o popula: ramo morto                                         |
| **GAP-12** |  **MÉDIO**  | Rate limiting     | Contadores em memória nos dois limitadores — limite efetivo = `k × max` réplicas                               |
| **GAP-13** |  **MÉDIO**  | DoS               | Hook `onRequest` global resolve sessão em toda requisição, inclusive `/health` (isento de rate limit)          |
| **GAP-14** |  **MÉDIO**  | Verificação       | `requireEmailVerification: false` — cadastro com e-mail de terceiro, relay de spam e squatting de endereço     |
| **GAP-15** |  **MÉDIO**  | Vazamento em log  | `mailer.ts` cria um segundo logger Pino **sem `redact`** e loga a URL de reset com token válido                |
| **GAP-16** |  **MÉDIO**  | Banco de dados    | `account` sem `UNIQUE(provider_id, account_id)` — corrida de callback OAuth duplica identidade                 |
| **GAP-17** |  **MÉDIO**  | Exposição         | Swagger UI (`/docs`) público em produção — e a CSP padrão do helmet quebra a própria UI                        |
| **GAP-18** |  **MÉDIO**  | Validação         | `MOBILE_DEEP_LINK` entra em `trustedOrigins` sem validação de formato                                          |
| **GAP-19** |  **MÉDIO**  | Banco de dados    | Sem índice em `session.user_id`, `account.user_id`, `verification.identifier`                                  |
| **GAP-20** |  **BAIXO**  | Contrato          | Nome do cookie no OpenAPI diverge em produção (prefixo `__Secure-`)                                            |
| **GAP-21** |  **BAIXO**  | Segredos          | `BETTER_AUTH_SECRET` literal em `.github/workflows/ci.yml:23`                                                  |
| **GAP-22** |  **BAIXO**  | Injeção           | `templates.ts` interpola `url` sem escapar, em variável chamada `safeUrl`                                      |
| **GAP-23** |  **BAIXO**  | Privacidade       | Logger interno do Better Auth emite endereços de e-mail em stdout                                              |
| **GAP-24** |  **BAIXO**  | Testes            | `/change-password` sem nenhuma cobertura                                                                       |
| **GAP-25** |  **BAIXO**  | Política de senha | Mínimo de 8 caracteres, sem checagem de vazamento                                                              |
| **GAP-26** |  **BAIXO**  | Contrato          | Erros de `/api/auth/*` não seguem o envelope RFC 7807 do resto da API                                          |
| **GAP-27** |  **BAIXO**  | Logs              | `genReqId` adota o `x-request-id` do cliente sem truncar                                                       |

---

## 4. Detalhamento — CRÍTICO e ALTO

### GAP-01 · Rate limit global desligado em produção — **CRÍTICO**

**Local:** `src/plugins/rate-limit.plugin.ts:8`

```ts
global: env.NODE_ENV === 'development',
```

**Contrato violado:** D-19 — _"fora de produção, rate limit desligado (global e o do Better
Auth). Em produção, 100 req/min por IP/usuário"_. A condição implementada é a negação exata.

| `NODE_ENV`    | `global` | Rate limit Fastify | Rate limit Better Auth (`enabled: isProduction`) |
| ------------- | -------- | ------------------ | ------------------------------------------------ |
| `development` | `true`   | ativo              | desligado                                        |
| `test`        | `false`  | desligado          | desligado                                        |
| `production`  | `false`  | **DESLIGADO**      | ativo, só sob `/api/auth`                        |

Agravante confirmado: **nenhuma rota declara `config: { rateLimit: ... }`** — as únicas ocorrências
de `rateLimit` em `src/` são `auth.config.ts:98`, o próprio plugin e o import em `app.ts:64`. Com
`global: false`, o plugin registra e governa **zero rotas** em produção.

**Cenário:** `GET /api/v1/tracks?search=<termo>`, que executa `ILIKE` sobre índice GIN `pg_trgm`,
sem teto de requisições. Um cliente satura o pool do PostgreSQL até o `under-pressure` devolver
503 para todos. Cada requisição ainda dispara uma consulta de sessão (GAP-13).

**Correção:** `global: env.NODE_ENV === 'production',`

---

### GAP-02 · Two Factor ausente (TOTP + OTP + backup codes) — **ALTO**

**Local:** `src/modules/auth/auth.config.ts:116`

O plugin `twoFactor` vive em `better-auth/plugins`, pacote **já instalado** — não há dependência
nova a aprovar. Nenhum dos nove endpoints existe (`/two-factor/enable`, `/disable`,
`/get-totp-uri`, `/verify-totp`, `/send-otp`, `/verify-otp`, `/generate-backup-codes`,
`/verify-backup-code`, `/view-backup-codes`).

Perde-se junto o **bloqueio de conta nativo** do plugin: a documentação descreve um contador
compartilhado entre TOTP, OTP e backup codes que devolve `429 ACCOUNT_TEMPORARILY_LOCKED` após
verificações falhas repetidas. Hoje **não existe nenhum bloqueio por conta** — só o limite por IP,
que o GAP-06 mostra ser frouxo e o GAP-04 mostra ser contornável.

```ts
twoFactor({
  issuer: 'Cardoso Sound',
  skipVerificationOnEnable: false,
  totpOptions: { digits: 6, period: 30, backupCodes: { count: 10 } },
  otpOptions: {
    digits: 6,
    period: 10,
    async sendOTP({ user, otp }) {
      const { subject, html } = twoFactorOtpEmail({ name: user.name || 'Usuário', otp });
      await mailer.send({ to: user.email, subject, html });
    },
  },
});
```

`twoFactorOtpEmail` precisa ser criado em `src/shared/email/templates.ts`, no padrão de
`verificationEmail` / `resetPasswordEmail`.

---

### GAP-03 · Passkey (WebAuthn/FIDO2) ausente — **ALTO**

**Local:** `package.json` e `auth.config.ts:116`

Diferente do 2FA, o Passkey mora em pacote separado: `@better-auth/passkey`. **É dependência nova
e exige ADR** (`D-NN`) antes de qualquer sprint.

```ts
import { passkey } from '@better-auth/passkey';

passkey({
  rpID: new URL(env.BETTER_AUTH_URL).hostname,
  rpName: 'Cardoso Sound',
  origin: env.BETTER_AUTH_URL,
  registration: { requireSession: true },
});
```

**Armadilha:** `rpID` aceita `example.com` ou `www.example.com`, nunca TLD nu nem URL com esquema;
`origin` não admite barra final. Em `localhost`, `rpID` deve ser literalmente `localhost`.
Endpoints ganhos: `POST /sign-in/passkey`, `/passkey/add-passkey`,
`GET /passkey/list-user-passkeys`, `POST /passkey/delete-passkey`, `/passkey/update-passkey`.

---

### GAP-04 · Chave de rate limit derivada de `X-Forwarded-For` não confiável — **ALTO**

**Local:** `src/modules/auth/auth.plugin.ts:40` × `src/modules/auth/auth.config.ts:113-115`

A ponte repassa **todos os headers do cliente literalmente** para o `Request` entregue a
`auth.handler`:

```ts
const headers = toFetchHeaders(request.headers);
```

O Better Auth então resolve a chave de rate limit via `getIP`, cuja lista padrão de headers é
`["x-forwarded-for"]` e que — com `advanced.ipAddress.trustedProxies` **não configurado** — aceita
o header de valor único como veio
(`better-auth@1.7.2/dist/utils/ip.mjs:188-192,204`; chave montada como `ip|path` em `:226`).

Dois modos de falha, ambos ativos hoje:

- **Sem proxy à frente:** o atacante envia `X-Forwarded-For: <IP arbitrário>` e rotaciona a cada
  requisição. Cada requisição cai num bucket novo → **os limites de `/sign-in`, `/forget-password`
  e `/reset-password` são integralmente contornados.** Junto com o GAP-01, credential stuffing e
  bombardeio de e-mail de reset ficam sem nenhum teto em produção.
- **Atrás da Railway (o proxy anexa à cadeia):** o header passa a ter dois valores →
  `getIPFromHeader` devolve `null` (`ip.mjs:188`) → **todo o tráfego colapsa num único bucket
  compartilhado** `no-trusted-ip|<path>` (`rate-limiter/index.mjs:233,245`). Um atacante sozinho
  esgota o orçamento de 10/60s e **tranca todos os usuários legítimos fora do `/sign-in`** —
  negação de serviço.

Ou seja: o rate limit de autenticação hoje está ou desarmado ou convertido em vetor de DoS,
dependendo da topologia. Não há configuração em que funcione como pretendido.

**Correção — precisa das duas metades, na mesma mudança:**

```ts
// auth.config.ts
advanced: {
  disableOriginCheck: false,
  ipAddress: {
    ipAddressHeaders: ['x-forwarded-for'],
    trustedProxies: [/* CIDRs da borda da Railway */],
  },
},
```

```ts
// app.ts — número de hops, nunca `true`
const app = Fastify({ trustProxy: 1, logger: { /* ... */ }, genReqId: /* ... */ });
```

> Achado do subagente, confirmado no código do pacote. Não constava em auditorias anteriores.

---

### GAP-05 · Limite de recuperação de senha contornável pelo endpoint nativo — **ALTO**

**Local:** `src/modules/auth/auth.config.ts:24-35` e `:102-107`

O projeto registra um alias que expõe `/forget-password` reaproveitando
`requestPasswordReset.options`, e aplica a regra estrita **só ao alias**:

```ts
customRules: { '/forget-password': { window: 3600, max: 3 }, ... }
```

O endpoint nativo `/request-password-reset` continua registrado pelo core
(`better-auth/dist/api/routes/password.mjs:21`) e não está em `customRules`. O casamento de regra
é por caminho exato (`rate-limiter/index.mjs:260-263`), então ele cai no default
`{ window: 60, max: 10 }`.

**Cenário:** o teto pretendido é 3 e-mails/hora. Trocando a URL para
`POST /api/auth/request-password-reset`, o atacante obtém **600 e-mails/hora** contra a caixa de
qualquer vítima — mail bombing com o domínio de remetente do projeto e risco direto de queima de
reputação no Resend. Somado ao GAP-04, sem teto algum.

**Correção:** `'/request-password-reset': { window: 3600, max: 3 },`

---

### GAP-06 · `/sign-in/email` sem regra dedicada — **ALTO**

**Local:** `src/modules/auth/auth.config.ts:102-107`

D-46-c enumera as regras estritas configuradas — `/forget-password`, `/send-verification-email`,
`/reset-password`, `/sign-in/social` — e **o login por senha não está na lista**. Herda
`{ window: 60, max: 10 }`.

**Cenário:** 10 tentativas de senha por minuto por IP, 14 400/dia; com botnet, linear no número de
IPs; com o GAP-04, sem limite algum. Sem 2FA (GAP-02) e sem bloqueio por conta, é o caminho mais
direto para credential stuffing.

```ts
'/sign-in/email': { window: 60, max: 5 },
'/sign-up/email': { window: 3600, max: 10 },
'/two-factor/verify-totp': { window: 60, max: 5 },        // após GAP-02
'/two-factor/verify-otp': { window: 60, max: 5 },         // após GAP-02
'/two-factor/verify-backup-code': { window: 3600, max: 5 },
```

---

### GAP-07 · Sessões sobrevivem ao reset de senha — **ALTO**

**Local:** `src/modules/auth/auth.config.ts:74-84` — sem `revokeSessionsOnPasswordReset`
(default `false`).

Não é hipótese: o teste **T20** (`tests/integration/auth-email.test.ts:520-534`) **afirma** que o
bearer anterior ao reset continua resolvendo sessão depois que o reset é concluído.

**Cenário:** conta comprometida. O atacante mantém cookie ou bearer válido (7 dias, D-13). A
vítima executa "esqueci minha senha" — a ação de recuperação por excelência. A senha muda; **a
sessão do atacante permanece válida por até 7 dias**, com acesso a `/api/v1/me`, playlists,
favoritos e ao `DELETE /api/v1/me`, que apaga a conta em cascata. Na prática, o fluxo de
recuperação de conta não recupera a conta.

**Correção:**

```ts
emailAndPassword: { /* ... */ revokeSessionsOnPasswordReset: true },
```

> **Retificação de auditoria anterior:** a opção **não** se chama `revokeOtherSessions` — esse é o
> nome de um parâmetro do corpo de `POST /change-password`, não uma chave de configuração.
> Declará-lo em `emailAndPassword` seria no-op silencioso, provavelmente com erro de
> `pnpm typecheck`. O nome correto, também usado em D-46-e, é `revokeSessionsOnPasswordReset`.

**Decisão do owner:** D-46-e **registra** o comportamento como inspecionado no caso T20, sem
declarar aceite do risco. Escolher entre (a) corrigir e emendar D-46 + T20, ou (b) registrar
aceite formal. Não é decisão minha.

---

### GAP-08 · `/sign-up/email` é oráculo de enumeração de usuários — **ALTO**

**Local:** `src/modules/auth/auth.config.ts:77-78`

```ts
autoSignIn: true,
requireEmailVerification: false,
```

O Better Auth só emite a resposta genérica de duplicidade quando uma das duas está no valor
oposto (`better-auth/dist/api/routes/sign-up.mjs:163`):

```js
const shouldReturnGenericDuplicateResponse =
  ctx.context.options.emailAndPassword.requireEmailVerification ||
  ctx.context.options.emailAndPassword.autoSignIn === false;
```

Com esta configuração é `false`, então a linha 212 lança
`422 USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL`. O teste **T6**
(`tests/integration/auth.test.ts:162-188`) consagra o comportamento ao afirmar 4xx em e-mail
duplicado.

**Cenário:** POST de um e-mail em `/api/auth/sign-up/email` — 422 significa cadastrado, 200
significa não cadastrado. Com o GAP-01 e o GAP-04, a base inteira de usuários é enumerável a
partir de um endpoint público, sem limite de taxa.

Vale registrar o contraste: `/sign-in/email` e `/forget-password` **estão corretos** — o sign-in
faz dummy hash e devolve `INVALID_EMAIL_OR_PASSWORD` único (`sign-in.mjs:319-338`), e o T15
(`auth-email.test.ts:255`) prova resposta idêntica para e-mail desconhecido. O sign-up é o único
vazamento.

**Correção:** `autoSignIn: false` **ou** `requireEmailVerification: true` (que resolve também o
GAP-14). A primeira é a de menor impacto sobre o helper `signUpAndGetToken` invocado pelas suítes
E2E — e é exatamente esse helper que D-46-a cita como razão da configuração atual, então a
alternativa precisa ser avaliada contra ele no sprint brief.

---

## 5. Detalhamento — MÉDIO

### GAP-09 · Schema Drizzle sem as tabelas de 2FA e Passkey

**Local:** `src/db/schema/users.schema.ts` · `drizzle/0000_overconfident_overlord.sql`

Faltam `user.twoFactorEnabled`, a tabela `two_factor` e a tabela `passkey`.

```ts
export const twoFactor = pgTable(
  'two_factor',
  {
    id: text('id').primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    secret: text('secret').notNull(),
    backupCodes: text('backup_codes').notNull(),
    createdAt: timestamp('created_at').notNull().defaultNow(),
  },
  (t) => [index('two_factor_user_id_idx').on(t.userId)],
);

export const passkey = pgTable(
  'passkey',
  {
    id: text('id').primaryKey(),
    name: text('name'),
    publicKey: text('public_key').notNull(),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    credentialID: text('credential_id').notNull().unique(),
    counter: integer('counter').notNull().default(0),
    deviceType: text('device_type').notNull(),
    backedUp: boolean('backed_up').notNull().default(false),
    transports: text('transports'),
    aaguid: text('aaguid'),
    createdAt: timestamp('created_at').notNull().defaultNow(),
  },
  (t) => [index('passkey_user_id_idx').on(t.userId)],
);
```

Dois pontos de segurança que auditorias anteriores omitiram:

- **`credential_id` precisa de `unique`.** Sem a restrição, o mesmo credential WebAuthn poderia
  ser registrado sob dois usuários, tornando ambígua a resolução de identidade no `sign-in`.
- **`aaguid`** é exigido pelo plugin (`registration.afterVerification` o consome).

`onDelete: 'cascade'` é obrigatório em ambas — sem ele, `DELETE /api/v1/me`
(`users.repository.ts:80-86`) passa a falhar com violação de FK assim que o usuário tiver 2FA ou
passkey.

---

### GAP-10 · `trustProxy` ausente

**Local:** `src/app.ts:25-52` — zero ocorrências de `trustProxy` em `src/`.

Na Railway (D-17), `req.ip` devolve o IP do balanceador para **todos** os clientes. Duas
consequências: (a) corrigir o GAP-01 sem isto converte o rate limit em auto-DoS global, com todo
o tráfego num único bucket de 100/min; (b) `session.ip_address` (`users.schema.ts:18`) grava o IP
do proxy, inutilizando a trilha de auditoria de sessão.

Usar `trustProxy: 1` — **o número de hops, não `true`**. Com `true` o Fastify confia cegamente na
cadeia `X-Forwarded-For` e o cliente volta a poder forjar o IP. Deve entrar na mesma mudança que
o GAP-01 e o GAP-04.

---

### GAP-11 · `keyGenerator` nunca enxerga o usuário autenticado

**Local:** `src/plugins/rate-limit.plugin.ts:12` × `src/app.ts:64` e `:74`

`rateLimitPlugin` registra no passo 2, `authPlugin` no passo 5. Hooks `onRequest` de instância
disparam em ordem de registro, então o `keyGenerator` roda antes do hook de sessão
(`auth.plugin.ts:74`). `request.user` é sempre o default `null` do decorator (`auth.plugin.ts:30`)
— o ramo `req.user?.id` é **morto**, e o cast `as unknown as` esconde isso do type checker.

**Não corrija apenas invertendo a ordem:** mover o rate limit para depois do auth também tira do
teto a própria rota curinga `/api/auth/*`, que é registrada dentro do `authPlugin`. E chavear por
`user.id` em rotas de autenticação seria regressão — um atacante com N contas obteria N × a cota.
O comportamento correto é chave por usuário **só** em `/api/v1/**`:

```ts
keyGenerator: (req) => (req.url.startsWith('/api/auth') ? req.ip : (req.user?.id ?? req.ip)),
```

Isso **altera a ordem load-bearing do `buildApp()`** e portanto exige plano escrito e ADR.

---

### GAP-12 · Rate limit em memória com múltiplas réplicas

**Local:** `src/plugins/rate-limit.plugin.ts:7-13` · `auth.config.ts:98-108`

Nenhum dos dois limitadores declara `store`/`storage`. Com `k` réplicas na Railway o limite
efetivo é `k × max`, e o round-robin distribui as tentativas entre réplicas sem esforço nenhum.

`rateLimit.storage: 'database'` reaproveita o PostgreSQL já existente e não adiciona serviço — é a
opção de menor custo de reversão. Enquanto não existir: **réplica única em produção**, registrado
no runbook de deploy.

---

### GAP-13 · Sessão resolvida do banco em toda requisição

**Local:** `src/modules/auth/auth.plugin.ts:74-86` · `auth.config.ts:94-97` (sem `cookieCache`)

O plugin é embrulhado em `fastify-plugin` (`:97`), então o hook é global: roda em `/health`,
`/health/ready`, `/docs`, no catálogo público (D-29) e na própria rota `/api/auth/*` — que em
seguida chama `auth.handler`, resolvendo a sessão uma segunda vez.

**Cenário de amplificação:** `/health` está no `allowList` do rate limit
(`rate-limit.plugin.ts:11`) — é a rota deliberadamente sem teto, por D-20, e a que a Railway usa
como liveness. Uma requisição a `/health` com qualquer `Authorization` em formato de token vira
uma consulta à tabela `session`. Sem índice em `session.user_id` (GAP-19) e sem limite de taxa
(GAP-01), a sonda de liveness vira canal de carga direta contra o banco — e o `under-pressure`
responde 503 para todos.

```ts
session: {
  expiresIn: 60 * 60 * 24 * 7,
  updateAge: 60 * 60 * 24,
  cookieCache: { enabled: true, maxAge: 5 * 60 },
}
```

Somado a um early-return no hook para `/health` e `/api/auth`.

---

### GAP-14 · Verificação de e-mail nunca exigida

**Local:** `auth.config.ts:78,87` — `requireEmailVerification: false` com `sendOnSignUp: true` e
`autoSignIn: true`. Afirmado pelo teste **T8** (`auth-email.test.ts:52`: "sign-in succeeds without
verifying email").

**Cenário:** qualquer pessoa se cadastra com o endereço de um terceiro e recebe sessão de 7 dias
imediatamente; a vítima recebe um e-mail de verificação não solicitado. Em escala — com os limites
do GAP-01 e do GAP-04 — a API vira **relay de bombardeio de e-mail a partir do domínio Resend do
projeto**, e polui a tabela `user` com endereços de terceiros que, pelo `user_email_unique`
(`drizzle/0000:84`), **impedem o dono real de se cadastrar** (squatting de endereço).

Aceito em **D-46-a**, com justificativa explícita (quebraria o helper `signUpAndGetToken` das
suítes E2E das fases 3 a 5). Fica registrado aqui como risco residual conhecido — mas a
justificativa é de conveniência de teste, e o custo é de segurança. Merece reavaliação junto do
GAP-08, já que uma única mudança resolve os dois.

---

### GAP-15 · Logger do mailer sem redaction, logando token de reset válido

**Local:** `src/shared/email/mailer.ts:5-13` e `:45-55`

```ts
const logger = pino({ level: env.LOG_LEVEL, transport: /* ... */ });   // sem `redact`
```

É uma **segunda instância Pino, independente**, e os paths de redaction declarados em
`app.ts:38-48` (D-22) **não se aplicam a ela**. Em seguida:

```ts
const urlMatch = /href="([^"]+)"/.exec(input.html);
const extractedUrl = urlMatch ? urlMatch[1] : undefined;
logger.info({ to: input.to, subject: input.subject, url: extractedUrl }, ...);
```

Num e-mail de reset, essa URL contém o **token de redefinição válido por uma hora**
(`auth.config.ts:79`). Esse caminho é o mailer em memória, restrito a dev/test — `RESEND_API_KEY`
é obrigatório em produção (`env.ts:29-35`). Mas o caminho Resend (`mailer.ts:74-92`) continua
logando o endereço do destinatário e o objeto de erro cru do provedor em `warn`, **em produção,
sem redaction**.

O repositório é público e o stdout da Railway é o coletor de logs — daí a severidade média e não
baixa. Correção: aplicar o mesmo bloco `redact` (`'*.token'`, `'*.url'`, `'to'`) ou, melhor,
injetar `fastify.log` em vez de instanciar um logger paralelo.

---

### GAP-16 · `account` sem restrição única na identidade do provedor

**Local:** `src/db/schema/users.schema.ts:26-43` · `drizzle/0000_overconfident_overlord.sql:48-62`

`account` declara só a PK em `id`. Não há `UNIQUE(provider_id, account_id)` nem
`UNIQUE(user_id, provider_id)`. A decisão de linking do Better Auth
(`dist/oauth2/link-account.mjs:78`) é um read-then-write sem guarda no banco, então callbacks OAuth
concorrentes podem gerar linhas duplicadas para a mesma identidade de provedor.

É exatamente a classe de corrida contra a qual o projeto se protegeu deliberadamente em
`playlist_tracks` e `favorites` (D-47) — a mesma disciplina deve valer aqui.

```sql
CREATE UNIQUE INDEX "account_provider_account_unique" ON "account" ("provider_id","account_id");
```

---

### GAP-17 · Swagger UI público em produção

**Local:** `src/app.ts:68` · `src/plugins/swagger.plugin.ts:59-65`

Registro incondicional. Em produção, `/docs` e o spec OpenAPI entregam o inventário completo de
rotas, schemas de corpo e códigos de erro — reconhecimento gratuito. A rota curinga de auth está
protegida por `schema: { hide: true }` (`auth.plugin.ts:37`), mas todo o `/api/v1/**` está descrito.

**Detalhe adicional:** `helmet.plugin.ts:8` passa `undefined` em produção, ou seja, ativa a CSP
padrão do helmet — que **bloqueia os scripts inline do próprio Swagger UI**. Hoje a UI está
publicamente montada e provavelmente quebrada em produção. Decidir explicitamente: desligar em
produção (`if (!isProduction)`) ou proteger com Basic Auth e liberar a CSP para `/docs`. A escolha
afeta o fluxo de D-21 e merece ADR.

---

### GAP-18 · `MOBILE_DEEP_LINK` sem validação de formato

**Local:** `src/config/env.ts:26` → `auth.config.ts:109-112`

```ts
MOBILE_DEEP_LINK: z.string().optional(),
```

`trustedOrigins` é o mecanismo que sustenta a proteção contra open redirect nos fluxos OAuth e nos
callbacks (D-46), e alimenta o middleware `originCheck`. O valor entra sem restrição de forma: um
`*`, uma string vazia significativa ou um domínio de terceiro passam pelo Zod e viram origem
confiável, sem nenhum sinal no boot.

```ts
MOBILE_DEEP_LINK: z
  .string()
  .regex(/^[a-z][a-z0-9+.-]*:\/\/[^*\s]*$/, 'MOBILE_DEEP_LINK must be a scheme URL without wildcards')
  .optional(),
```

O mesmo raciocínio vale para `CORS_ORIGIN`, hoje um CSV de strings livres (`env.ts:12`, `:88-90`).

---

### GAP-19 · Índices ausentes nas tabelas de autenticação

**Local:** `src/db/schema/users.schema.ts:13-52`

`session.user_id`, `account.user_id` e `verification.identifier` não têm índice. `session.token`
tem `unique` (`:15`), o que cobre o caminho quente de resolução por token — mas não os demais.

`DELETE /api/v1/me` dispara cascade em `session`, `account`, `playlists` e `favorites`; sem índice
nas FKs, cada tabela filha faz sequential scan. `verification` cresce sem poda e é consultada por
`identifier` a cada verificação e reset. Combinado com GAP-13 e GAP-01, é o degrau que converte
carga em indisponibilidade. Índices em `two_factor.user_id` e `passkey.user_id` devem entrar já na
migração do GAP-09.

---

## 6. Detalhamento — BAIXO

**GAP-20 — nome do cookie divergente no OpenAPI.** `swagger.plugin.ts:50` declara
`better-auth.session_token`. Em produção o Better Auth prefixa o cookie
(`dist/cookies/index.mjs:23,275`): vira `__Secure-better-auth.session_token` sempre que `baseURL`
for https **ou** `NODE_ENV=production`. O Swagger UI e qualquer cliente gerado a partir do spec
enviam um cookie que não existe. Deriva de contrato contra o documento consumido pelo cliente
Flutter.

**GAP-21 — segredo literal no CI.** `.github/workflows/ci.yml:23` define
`BETTER_AUTH_SECRET: troque-por-um-segredo-de-no-minimo-32-caracteres`. É o placeholder do
`.env.example`, então nada real vaza; mas é um literal com forma de segredo em arquivo versionado,
o que a própria política do repositório proíbe. Usar `${{ secrets.CI_BETTER_AUTH_SECRET }}` ou
gerar no passo.

**GAP-22 — `safeUrl` que não é escapada.** `src/shared/email/templates.ts:15` e `:44`:
`const safeUrl = input.url;` — nomeada "safe", nunca escapada, e interpolada em `href="${safeUrl}"`
(`:30`, `:59`), enquanto `name` **é** escapada por `escapeHtml` (`:1-8`). **Não é explorável
hoje:** `redirectTo` passa pelo `originCheck` (`password.mjs:50`) e é URL-encoded antes da
concatenação (`:81`), então nenhuma aspa crua alcança o atributo. Fica como defesa em
profundidade — uma única mudança de configuração (`disableOriginCheck: true`) a transformaria em
injeção de HTML em e-mail de saída. O nome da variável é ativamente enganoso.

**GAP-23 — logger interno do Better Auth emite PII.**
`dist/api/routes/sign-up.mjs:202` loga `Sign-up attempt for existing email: ${email}` em `info`;
`sign-in.mjs:323/330/337` logam `"User not found"` / `"Invalid password"` em `warn`. Passam pelo
logger de console do próprio Better Auth, **fora da redaction do Pino**. Endereços de e-mail em
stdout de produção. Mitigar com `logger: { level: 'error' }` nas opções de `betterAuth()`.

**GAP-24 — `/change-password` sem teste.** Zero ocorrências em `tests/`. Faltam casos
obrigatórios (D-27): senha atual incorreta → 4xx; troca bem-sucedida invalidando a sessão antiga
com `revokeOtherSessions: true` no corpo; bearer antigo → 401 após a troca.

**GAP-25 — política de senha.** `minPasswordLength: 8`; `maxPasswordLength` fica no default 128
(`create-context.mjs:185-186`), o que já limita DoS por entrada longa. Sem exigência de composição
e sem verificação contra listas de senhas vazadas. Hash `scrypt` nativo — adequado, não trocar.

**GAP-26 — envelope de erro divergente.** `auth.plugin.ts:68-69` devolve o corpo cru do Better
Auth; erros de `/api/auth/*` não passam pelo `errorHandlerPlugin` e não têm a forma
`{ statusCode, error, message, details }`. Não é vazamento — o Better Auth não emite stack. É
dívida de contrato: o cliente Flutter precisa de dois parsers de erro.

**GAP-27 — `x-request-id` do cliente.** `app.ts:50-51` adota o header do cliente como ID de
requisição sem limite de tamanho, gravado em toda linha de log. Truncar em ~64 caracteres e
validar o alfabeto.

---

## 7. Achados retificados

Alegações de auditorias anteriores que a verificação **não** confirmou:

| Alegação                                                                             |      Veredito      | Fundamento                                                                                                                                                                                                                                                                                                                                                                  |
| :----------------------------------------------------------------------------------- | :----------------: | :-------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Rota curinga precisa aceitar `DELETE` (`/passkey/delete-passkey`, `/session/delete`) |  **Improcedente**  | A documentação do Passkey lista `POST /passkey/delete-passkey`; o Better Auth usa `POST` para toda mutação e `GET` para leitura. `['GET','POST','OPTIONS']` (`auth.plugin.ts:35`) é suficiente — a integração oficial sugere `["GET","POST"]`. Risco residual só num bump de versão que introduza outro verbo, quando cairia no `setNotFoundHandler` com mensagem enganosa. |
| Corrigir com `revokeOtherSessions: true` em `emailAndPassword`                       | **Nome incorreto** | Não é chave de configuração; é parâmetro do corpo de `POST /change-password`. A chave correta é `revokeSessionsOnPasswordReset` (GAP-07).                                                                                                                                                                                                                                   |
| Tabela `passkey` conforme proposta anterior                                          |   **Incompleta**   | Faltavam `aaguid` e `unique` em `credential_id` (GAP-09).                                                                                                                                                                                                                                                                                                                   |
| Cookies podem sair sem `Secure` em produção se `BETTER_AUTH_URL` for `http://`       |  **Improcedente**  | `dist/cookies/index.mjs:23,34-35` deriva `secure` de `baseURL` https **ou** `NODE_ENV === 'production'` — a segunda condição cobre o caso. `httpOnly: true`, `sameSite: 'lax'` e ausência de `domain` (host-only) também são corretos por padrão. O problema real do bloco de cookies é apenas a deriva de nome no OpenAPI (GAP-20).                                        |
| `accountLinking` como vetor de account takeover                                      |  **Improcedente**  | `allowDifferentEmails` não está habilitado e `requireLocalEmailVerified` tem default `true` (`link-account.mjs:82`), então uma conta local não verificada não pode ser absorvida por um sign-in OAuth. Vale fixar `requireLocalEmailVerified: true` explicitamente para que uma mudança futura de default não abra isso em silêncio.                                        |

---

## 8. O que está correto — não regredir

Verificado de forma independente nas duas passagens:

1. **Isolamento por usuário na cláusula `WHERE`, nunca depois do fetch** — `playlists.repository.ts:105,206,239,250`
   e `favorites.repository.ts:54,62,77,132,146`. Operações aninhadas em `playlist_tracks` verificam
   o pai primeiro (`playlists.service.ts:128-132,174-178`).
2. **D-31 aplicado literalmente** — zero `ForbiddenError` alcançável; recurso alheio responde 404
   em GET, PATCH e DELETE, provado por E2E (`tests/e2e/specs/playlist-flow.e2e.test.ts:152-199`).
3. **`requireAuth` em 13 de 13 rotas de usuário** — `playlists.routes.ts:41,65,92,118,145,172,206`,
   `favorites.routes.ts:36,60,88`, `users.routes.ts:27,50,75`.
4. **Defesa dupla contra vazamento de credencial** — response schemas explícitos **e** projeção
   explícita de colunas no repositório (`users.repository.ts:22-28,64-70`). `account.password`,
   `account.access_token` e `session.token` são inalcançáveis por qualquer rota.
5. **Sem mass assignment** — `updateMeBodySchema` (`users.schema.ts:5-22`) admite só `name` e
   `image`; `setValues` é montado campo a campo.
6. **Zod em todo params/query/body** — `:id` sempre `z.uuid()`, `limit` limitado a
   `MAX_PAGE_SIZE = 100`, `page ≥ 1`, gênero como enum fechado. Nenhum `sql.raw` nos módulos
   auditados; todo Drizzle é paramétrico.
7. **Bearer e cookie compartilham um único caminho de autenticação e autorização**
   (`auth.plugin.ts:76`) — divergência entre eles é estruturalmente impossível (D-13).
8. **Handler de erro não vaza nada** — `error-handler.plugin.ts:64-72` devolve string fixa,
   `details: null`, sem stack, `cause`, fragmento SQL ou mensagem de driver.
9. **Redaction D-22 completa no logger da aplicação** (`app.ts:38-48`).
10. **Segredos só via `src/config/env.ts`** — mínimo real de 32 caracteres, sem default de
    produção, `process.exit(1)` no boot, `superRefine` exigindo pares OAuth completos.
11. **Sign-in e forgot-password não enumeram** — dummy hash e resposta constante, provado por T15.
12. **Open redirect protegido e testado** — `disableOriginCheck: false`, `trustedOrigins` fechado,
    T24 (state inválido) e T25 (callbackURL não confiável) em `auth-social.test.ts:100,119`.
13. **Múltiplos `Set-Cookie` tratados via `getSetCookie()`** (D-44, T5) — solução **superior** ao
    exemplo da documentação oficial, que perde cookies no `headers.forEach`.
14. **Cascade de sessões e contas OAuth na exclusão de usuário**, dentro de transação.
15. **Escopos OAuth mínimos e `trustedProviders` decidido** — Facebook fora por D-46-b, GitHub com
    `user:email`.
16. **Cobertura de teste de autenticação substantiva** — 19 casos em `auth.test.ts`, 14 em
    `auth-email.test.ts`, 6 em `auth-social.test.ts`, 4 fluxos E2E, incluindo isolamento
    cross-user com 404.

---

## 9. Encaminhamento

> **Status: planejado e autorizado (2026-09-09).** Os seis sprints abaixo existem, com anatomia
> D-30 e blast radius fechado. A spec normativa é
> [`docs/specs/08-blindagem-de-seguranca.md`](../specs/08-blindagem-de-seguranca.md) — a §10 dela
> mapeia GAP × sprint × seção, e a §9 é o checklist que fecha a `v1.0.0` em `F5-S09`.
> Por **D-49**, a blindagem inteira roda **antes** do deploy (`F5-S08`).

| Sprint     | Brief                                                                                                                 | GAPs                           |
| :--------- | :-------------------------------------------------------------------------------------------------------------------- | :----------------------------- |
| **F5-S02** | [Blindagem de borda e rate limiting](../sprints/fase-5-producao/F5-S02-blindagem-de-borda-e-rate-limit.md)            | 01, 04, 05, 06, 10, 17, 21, 27 |
| **F5-S03** | [Recuperação de conta e anti-enumeração](../sprints/fase-5-producao/F5-S03-recuperacao-de-conta-e-anti-enumeracao.md) | 07, 08, 14, 15, 22, 24, 25     |
| **F5-S04** | [Sessão, schema e contrato](../sprints/fase-5-producao/F5-S04-sessao-schema-e-contrato.md)                            | 13, 16, 19, 20, 23, 26         |
| **F5-S05** | [Two Factor](../sprints/fase-5-producao/F5-S05-two-factor.md)                                                         | 02, 09 (2FA)                   |
| **F5-S06** | [Passkey / WebAuthn](../sprints/fase-5-producao/F5-S06-passkey-webauthn.md)                                           | 03, 09 (passkey)               |
| **F5-S07** | [Rate limit distribuído e origens](../sprints/fase-5-producao/F5-S07-rate-limit-distribuido.md)                       | 11, 12, 18                     |

> **GAP-22 e GAP-25 não constavam do encaminhamento original desta seção** e teriam ficado
> órfãos. Foram alocados em F5-S03, por afinidade de arquivo (`templates.ts`, com GAP-15) e de
> bloco de configuração (`emailAndPassword`, com GAP-07/08). Cobertura atual: **27 de 27**.

### As cinco decisões pendentes — resolvidas

| Questão                                                              | Decisão                                                          | ADR                      |
| :------------------------------------------------------------------- | :--------------------------------------------------------------- | :----------------------- |
| GAP-07 — corrigir ou aceitar o risco?                                | Corrigir. `revokeSessionsOnPasswordReset: true`; T20 é invertido | **D-52** (revoga D-46-e) |
| GAP-08/14 — `autoSignIn: false` ou `requireEmailVerification: true`? | A segunda: resolve os dois GAPs e preserva R09                   | **D-51** (revoga D-46-a) |
| GAP-03 — aprovar `@better-auth/passkey`?                             | Sim; `rpID` e `origin` derivados de `BETTER_AUTH_URL`            | **D-54**                 |
| GAP-12 — `storage: 'database'` ou Redis?                             | PostgreSQL no Better Auth; Redis como seam opcional por env      | **D-55**                 |
| GAP-17 — Swagger fora ou com Basic Auth?                             | Fora de produção; o spec segue versionado em `docs/openapi.json` | **D-56**                 |

Mais **D-49** (ordem da Fase 5), **D-50** (topologia de proxy) e **D-57** (logger único).

Sobre a mais delicada, GAP-08/14: a justificativa de D-46-a era que `requireEmailVerification:
true` quebraria o helper `signUpAndGetToken`. É verdade — e o helper é reescrito em quinze linhas
usando o `outbox` que já existe, offline e determinístico (spec `08` §4.2). **Conveniência de
teste não paga risco de produção**, e o risco aqui eram dois vetores permanentes: enumeração da
base de usuários e squatting de endereço de e-mail.

Scorecard quantitativo e projeção pós-remediação (**99.1/100**) em
[`docs/report/SECURITY_SCORE.md`](../report/SECURITY_SCORE.md).
