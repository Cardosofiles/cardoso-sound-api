# 08 — Blindagem de Segurança

> **Origem:** auditoria de `docs/issue/AUTHENTICATION.md` (2026-09-09), 27 GAPs, e o scorecard
> de `docs/report/SECURITY_SCORE.md`.
>
> **Autoridade:** esta spec é normativa e **substitui** os trechos da spec `04` indicados em
> cada seção. Onde a spec `04` e esta divergirem, **esta vence** — a `04` carrega o aviso de
> supersessão no ponto exato.
>
> **Quem entrega:** sprints `F5-S02` a `F5-S07` (D-49). Cada bloco abaixo está etiquetado com o
> sprint que o implementa. Um agente de `F5-S02` **não** implementa o que está marcado `F5-S05`.

---

## 1. Princípios

Quatro regras que decidem os casos que esta spec não enumera:

1. **Falha fechada e ruidosa.** Configuração de segurança ausente derruba o boot com
   `process.exit(1)`, nunca assume um default permissivo. Vale para topologia de proxy (§2),
   segredos (spec `04` §6) e origens confiáveis (§8.3).
2. **Confiança é declarada, nunca inferida.** Nenhum header controlado pelo cliente vira decisão
   de segurança sem uma lista explícita de quem pode enviá-lo.
3. **Registrar um comportamento não é aceitá-lo.** D-46 (e) descrevia o default da lib; D-52 o
   revogou. Uma decisão só aceita risco quando diz que aceita, com o porquê.
4. **O que não é testável não está entregue.** Toda regra desta spec tem um caso obrigatório
   correspondente na §9 do seu sprint. Configuração que só se prova em produção vira função pura
   testável (§2.3).

---

## 2. Topologia de proxy e identidade do cliente — **F5-S02** · D-50

> Substitui o `keyGenerator` da spec `04` §4 em conjunto com a §8 desta spec.

### 2.1 Variáveis novas

| Variável               | Tipo Zod                       | Default | Obrigatória           |
| ---------------------- | ------------------------------ | ------- | --------------------- |
| `TRUST_PROXY_HOPS`     | `coerce.number().int().min(0)` | `0`     | **sim em production** |
| `TRUSTED_PROXIES`      | `string()` (CSV de CIDRs)      | `""`    | **sim em production** |
| `RATE_LIMIT_REDIS_URL` | `url().optional()`             | —       | não (§8.2)            |

Derivado exportado, junto de `CORS_ORIGIN_LIST` e `SOCIAL_PROVIDERS`, **no mesmo módulo**:

```ts
export const TRUSTED_PROXY_LIST: string[]; // split ',', trim, sem vazios
```

Regra de obrigatoriedade, no mesmo `superRefine` que já cobre `RESEND_API_KEY`:

```ts
if (v.NODE_ENV === 'production') {
  if (v.TRUST_PROXY_HOPS < 1)
    ctx.addIssue({
      code: 'custom',
      path: ['TRUST_PROXY_HOPS'],
      message: 'TRUST_PROXY_HOPS must be >= 1 in production (D-50)',
    });
  if (!v.TRUSTED_PROXIES.trim())
    ctx.addIssue({
      code: 'custom',
      path: ['TRUSTED_PROXIES'],
      message: 'TRUSTED_PROXIES must list the edge CIDRs in production (D-50)',
    });
}
```

### 2.2 Fastify

```ts
const app = Fastify({
  trustProxy: env.TRUST_PROXY_HOPS, // número de hops — NUNCA `true`
  logger: {/* spec 04 §5 */},
  genReqId: (req) => resolveRequestId(req.headers['x-request-id']),
});
```

`trustProxy: true` faz o Fastify confiar na cadeia inteira de `X-Forwarded-For` e devolve ao
cliente a capacidade de forjar o próprio IP. O número de hops só confia nos `n` proxies mais
próximos da aplicação. `0` desliga — é o valor de `development` e `test`.

### 2.3 Better Auth

```ts
advanced: {
  disableOriginCheck: false,
  ipAddress: {
    ipAddressHeaders: ['x-forwarded-for'],
    trustedProxies: TRUSTED_PROXY_LIST,
  },
},
```

> **Obrigatório confirmar a forma exata desta chave** na versão instalada antes de codar
> (`node_modules/better-auth/dist/utils/ip.mjs`, ou context7). A auditoria a observou em
> `better-auth@1.7.2`; se a assinatura divergir, **pare e reporte** — não invente opção.
> **Fallback documentado**, se e somente se `trustedProxies` não existir na versão instalada:
> passar `advanced.ipAddress.getIP: (req) => resolveClientIp(req.headers)`, com
> `resolveClientIp` sendo a mesma função pura da §2.4.

### 2.4 Funções puras exigidas

A configuração de segurança precisa ser provável sem subir produção. Estas três funções vivem em
`src/shared/utils/` e são exportadas nomeadamente:

```ts
// src/shared/utils/request-id.ts
export function resolveRequestId(raw: unknown): string;
// - não-string, vazio ou fora de /^[A-Za-z0-9._-]{1,64}$/  → randomUUID().slice(0, 8)
// - string válida                                          → a própria, truncada em 64
```

```ts
// src/shared/utils/client-ip.ts
export function resolveClientIp(
  headers: Record<string, string | string[] | undefined>,
  trustedProxies: readonly string[],
  socketIp: string,
): string;
// - trustedProxies vazio                     → socketIp
// - x-forwarded-for ausente                  → socketIp
// - x-forwarded-for presente                 → primeiro IP da direita para a esquerda que
//                                              NÃO pertença a nenhum CIDR de trustedProxies
// - todos os saltos confiáveis               → socketIp
```

```ts
// src/plugins/rate-limit.plugin.ts — exportado para teste
export function buildRateLimitOptions(config: Env): RateLimitPluginOptions;
export function rateLimitKeyGenerator(req: FastifyRequest): string;
```

`resolveRequestId` fecha o GAP-27: o `x-request-id` do cliente vai para toda linha de log e hoje
entra sem limite de tamanho nem alfabeto.

---

## 3. Rate limiting — **F5-S02** e **F5-S07**

> Substitui integralmente o bloco `rate-limit.plugin.ts` da spec `04` §4 e o bloco
> `rateLimit.customRules` da spec `04` §1.2.

### 3.1 `@fastify/rate-limit` — F5-S02 corrige, F5-S07 distribui

```ts
export function buildRateLimitOptions(config: Env) {
  return {
    global: config.NODE_ENV === 'production', // D-19 — a condição estava NEGADA (GAP-01)
    max: config.RATE_LIMIT_MAX,
    timeWindow: config.RATE_LIMIT_WINDOW,
    allowList: (req: FastifyRequest) => req.url.startsWith('/health'),
    keyGenerator: rateLimitKeyGenerator,
    ...(config.RATE_LIMIT_REDIS_URL ? { redis: makeRedis(config.RATE_LIMIT_REDIS_URL) } : {}),
  };
}
```

`global: env.NODE_ENV === 'development'` é a **negação exata** de D-19 e o único achado crítico da
auditoria. Como nenhuma rota declara `config: { rateLimit }`, com `global: false` o plugin registra
e governa **zero rotas** em produção.

### 3.2 Chave — F5-S07 · D-55

O ramo `req.user?.id` é código morto: o hook do rate limit roda antes do hook que popula
`request.user`. **A ordem de registro do `buildApp()` não muda** — mover o limitador para depois do
`authPlugin` tiraria do teto a própria rota coringa `/api/auth/*`.

```ts
export function rateLimitKeyGenerator(req: FastifyRequest): string {
  const ip = req.ip; // já resolvido pelo trustProxy da §2.2
  if (req.url.startsWith('/api/auth')) return ip; // nunca por identidade: N contas ≠ N × cota
  const token = extractSessionToken(req.headers); // bearer ou cookie, sem tocar no banco
  return token ? `${ip}|${sha256(token).slice(0, 16)}` : ip;
}
```

O IP **permanece na chave** em todos os casos. Chavear só por sessão permitiria a um atacante
multiplicar a cota criando sessões; combinar as duas dimensões estreita a cota, nunca a alarga.

### 3.3 `customRules` do Better Auth — forma normativa completa

```ts
rateLimit: {
  enabled: isProduction,          // D-19, inalterado
  storage: 'database',            // D-55 — exige a tabela `rate_limit` (§6.4). F5-S07.
  window: 60,
  max: 10,
  customRules: {
    // e-mail transacional
    '/forget-password':             { window: 3600, max: 3 },
    '/request-password-reset':      { window: 3600, max: 3 },   // GAP-05 — endpoint NATIVO
    '/send-verification-email':     { window: 3600, max: 3 },
    '/reset-password':              { window: 3600, max: 5 },
    // credenciais
    '/sign-in/email':               { window: 60,   max: 5 },   // GAP-06
    '/sign-up/email':               { window: 3600, max: 10 },
    '/change-password':             { window: 3600, max: 10 },
    '/sign-in/social':              { window: 60,   max: 10 },
    // segundo fator — F5-S05
    '/two-factor/verify-totp':        { window: 60,   max: 5 },
    '/two-factor/verify-otp':         { window: 60,   max: 5 },
    '/two-factor/send-otp':           { window: 3600, max: 5 },
    '/two-factor/verify-backup-code': { window: 3600, max: 5 },
    // passkey — F5-S06
    '/sign-in/passkey':             { window: 60,   max: 10 },
  },
},
```

Três armadilhas, todas já custaram tempo neste projeto:

- **As chaves são relativas ao `basePath`.** `/forget-password`, nunca
  `/api/auth/forget-password`. Escrita errada, a regra não casa e **falha em silêncio** — o limite
  global assume o lugar dela.
- **Alias não protege o endpoint nativo.** `forgetPasswordPlugin` (`auth.config.ts:24-35`) expõe
  `/forget-password` reaproveitando `requestPasswordReset.options`, mas o core continua servindo
  `/request-password-reset`. O casamento de regra é por caminho exato: proteger só o alias deixa
  600 e-mails/hora disponíveis pelo caminho nativo (GAP-05). **As duas entradas são obrigatórias e
  devem ter valores idênticos.**
- **`enabled` continua preso a produção** (D-19), `customRules` inclusive. Ligado em teste, produz
  429 aleatório — a causa clássica de flake.

---

## 4. Ciclo de vida da conta — **F5-S03** · D-51, D-52

> **Substitui a spec `04` §1.2, subseção "`requireEmailVerification: false` é deliberado".**

```ts
emailAndPassword: {
  enabled: true,
  minPasswordLength: 8,
  maxPasswordLength: 128,                 // explícito, não herdado do default
  autoSignIn: true,                       // R09 preservado: cadastro devolve bearer
  requireEmailVerification: true,         // D-51 — era false
  revokeSessionsOnPasswordReset: true,    // D-52 — não existia
  resetPasswordTokenExpiresIn: 60 * 60,
  sendResetPassword: async ({ user, url }) => { /* mailer */ },
},
```

### 4.1 O que muda no contrato

| Rota                   | Antes                      | Depois                                              |
| ---------------------- | -------------------------- | --------------------------------------------------- |
| `POST /sign-up/email`  | 422 se e-mail já existe    | **200 genérico** em ambos os casos — sem enumeração |
| `POST /sign-in/email`  | 200 mesmo sem verificar    | **403** enquanto `emailVerified === false`          |
| `POST /reset-password` | sessões antigas sobrevivem | **todas as sessões do usuário são revogadas**       |

A resposta genérica de duplicidade é emitida pelo próprio Better Auth quando
`requireEmailVerification` **ou** `autoSignIn === false` está ativo
(`dist/api/routes/sign-up.mjs:163`). Não se implementa à mão.

### 4.2 Consequência obrigatória nos testes

`tests/e2e/helpers/auth.ts::signUpAndGetToken` passa a ter quatro passos, todos offline, usando o
`outbox` do transporte de memória:

```
POST /api/auth/sign-up/email
  → ler outbox, extrair o href do último e-mail
  → GET <href>            (verify-email)
  → POST /api/auth/sign-in/email
  → devolver o bearer de `set-auth-token`
```

**Os casos T6 e T8 de F3 mudam de expectativa e são reescritos no mesmo PR** — T6 passa a exigir
resposta idêntica para e-mail novo e existente; T8 passa a exigir 403 antes da verificação. Um
teste que afirma o comportamento antigo é regressão, não cobertura.

### 4.3 Política de senha

`minPasswordLength: 8` é mantido — o NIST SP 800-63B aceita 8 **desde que** haja verificação
contra listas de senhas vazadas, que é o que se acrescenta aqui. Ordem de preferência:

1. Se `better-auth/plugins` exportar `haveIBeenPwned` na versão instalada, use-o. É k-anonymity:
   só os 5 primeiros caracteres do SHA-1 saem da aplicação, a senha nunca.
2. Caso contrário, `src/shared/security/weak-passwords.ts` — `Set<string>` com a lista das senhas
   mais comuns embutida no bundle, comparação em minúsculas, sem rede. Rejeição responde 400 com
   `ValidationError`, mensagem genérica, **sem** dizer que a senha está numa lista pública.

Não adicione exigência de composição (maiúscula, símbolo). O NIST desaconselha: aumenta a chance
de senha previsível e não mede força real.

---

## 5. Logging e e-mail transacional — **F5-S03** · D-57

> Estende a spec `04` §5, que passa a valer para **todo** `src/**`, não só para `app.ts`.

- **Um logger por aplicação.** `new pino()` em `src/**` fora do `buildApp()` é achado de auditoria
  (§9). O mailer recebe `Logger` por injeção; sem injeção, usa uma instância que aplica os seis
  `redact.paths` de D-22 **acrescidos de** `'*.url'`, `'url'` e `'to'`.
- **Nenhum transporte loga a URL fora de `development`.** O link de verificação e o de reset
  carregam o token na query string, e o `redact` do Pino não enxerga query string.
- **O transporte Resend nunca loga destinatário nem o objeto de erro cru do provedor.** Loga
  `{ provider: 'resend', status }` e a mensagem, não o payload.
- **`templates.ts` escapa tudo o que interpola.** A variável hoje chamada `safeUrl` não escapa
  nada (`templates.ts:15,44`); ou ela passa a escapar, ou perde o nome. O atributo `href` recebe a
  URL passada por `escapeHtmlAttribute`, e o texto visível por `escapeHtml`. Não é explorável hoje
  — `originCheck` e o URL-encoding do Better Auth barram — mas é a única defesa que resta se
  `disableOriginCheck` mudar.

---

## 6. Modelo de dados — **F5-S04**, **F5-S05**, **F5-S06**, **F5-S07**

> Estende a spec `02`. Toda alteração passa por `pnpm db:generate` → revisão do SQL →
> `pnpm db:migrate`. `pnpm db:push` continua proibido em PR, CI e produção.

### 6.1 Índices e unicidade das tabelas existentes — F5-S04

```ts
// session
(t) => [index('session_user_id_idx').on(t.userId)]
// account
(t) => [
  index('account_user_id_idx').on(t.userId),
  uniqueIndex('account_provider_account_unique').on(t.providerId, t.accountId), // GAP-16
]
// verification
(t) => [index('verification_identifier_idx').on(t.identifier)]
```

`UNIQUE(provider_id, account_id)` fecha a corrida de callback OAuth: a decisão de linking do Better
Auth é read-then-write sem guarda no banco (`dist/oauth2/link-account.mjs:78`), exatamente a classe
de corrida que D-47 tratou em `playlist_tracks` e `favorites`.

### 6.2 `two_factor` e `user.two_factor_enabled` — F5-S05

```ts
export const user = pgTable('user', {
  /* ... colunas existentes ... */
  twoFactorEnabled: boolean('two_factor_enabled').notNull().default(false),
});

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
```

### 6.3 `passkey` — F5-S06

```ts
export const passkey = pgTable(
  'passkey',
  {
    id: text('id').primaryKey(),
    name: text('name'),
    publicKey: text('public_key').notNull(),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    credentialID: text('credential_id').notNull().unique(), // D-54 — obrigatório
    counter: integer('counter').notNull().default(0),
    deviceType: text('device_type').notNull(),
    backedUp: boolean('backed_up').notNull().default(false),
    transports: text('transports'),
    aaguid: text('aaguid'), // D-54 — consumido pelo plugin
    createdAt: timestamp('created_at').notNull().defaultNow(),
  },
  (t) => [index('passkey_user_id_idx').on(t.userId)],
);
```

### 6.4 `rate_limit` — F5-S07

Exigida por `rateLimit.storage: 'database'` (D-55). A forma exata das colunas é ditada pelo
adapter: **rode `pnpm dlx @better-auth/cli@latest generate` e use o que ele produzir**, não o que
você imagina. Se o CLI não gerar a tabela, `storage: 'database'` não está suportado na versão
instalada — **pare e reporte**.

### 6.5 Regra que vale para as três tabelas novas

`onDelete: 'cascade'` no `userId` é **obrigatório**. Sem ele, `DELETE /api/v1/me`
(`users.repository.ts:80-86`) passa a falhar com violação de chave estrangeira no primeiro usuário
que tiver 2FA ou passkey — e o teste que prova isso é o E2E de lifecycle de conta.

---

## 7. Segundo fator e passwordless

### 7.1 Two Factor — F5-S05 · D-53

```ts
twoFactor({
  issuer: 'Cardoso Sound',
  skipVerificationOnEnable: false, // exige provar o TOTP antes de ativar
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

- **`trustDevice` fica desligado** (D-53): 30 dias de isenção por dispositivo é superfície que não
  temos como revogar sem tela de gestão de dispositivos.
- **`skipVerificationOnEnable: false`** impede ativar 2FA com um segredo que o usuário não
  consegue usar — o cenário em que a pessoa se tranca fora da própria conta.
- **Os backup codes são de uso único** e regenerar invalida todos os anteriores. Eles são exibidos
  **uma vez**; o cliente Flutter precisa saber disso.
- O plugin traz **bloqueio de conta nativo** com contador compartilhado entre TOTP, OTP e backup
  codes (`429 ACCOUNT_TEMPORARILY_LOCKED`). É a primeira e única defesa **por conta** do projeto —
  o rate limit é por IP.

**Contrato novo:** com 2FA ativo, `POST /sign-in/email` responde `{ twoFactorRedirect: true }` em
vez de sessão. Sem isso documentado, o cliente Flutter trata como falha de login.

### 7.2 Passkey — F5-S06 · D-54

```ts
passkey({
  rpID: new URL(env.BETTER_AUTH_URL).hostname, // 'localhost' em dev; nunca TLD nu, nunca URL
  rpName: 'Cardoso Sound',
  origin: env.BETTER_AUTH_URL, // sem barra final
  registration: { requireSession: true },
});
```

`rpID` e `origin` são **derivados**, nunca variáveis próprias — é o que elimina a classe de bug em
que o passkey registrado em `localhost` não valida em produção.

Endpoints: `POST /sign-in/passkey` · `POST /passkey/add-passkey` ·
`GET /passkey/list-user-passkeys` · `POST /passkey/delete-passkey` · `POST /passkey/update-passkey`.

> **O verbo `DELETE` não é necessário na rota coringa.** O Better Auth usa `POST` para toda
> mutação e `GET` para leitura; `['GET','POST','OPTIONS']` (`auth.plugin.ts:35`) cobre 100 % dos
> endpoints dos dois plugins. Auditorias anteriores erraram nisso — não "corrija" o que não está
> quebrado.

---

## 8. Superfície e origens

### 8.1 Swagger UI — F5-S02 · D-56

`@fastify/swagger` (geração do spec) permanece sempre registrado; `@fastify/swagger-ui` passa a
ser condicional a `!isProduction`. `scripts/export-openapi.ts` roda com `NODE_ENV !== 'production'`.

### 8.2 Armazenamento compartilhado — F5-S07 · D-55

`RATE_LIMIT_REDIS_URL` presente liga o store Redis do `@fastify/rate-limit`; ausente mantém o
contador local. **Enquanto a variável não existir em produção, a aplicação roda com réplica
única** — restrição que F7-S01 registra no runbook de deploy, porque com `k` réplicas o limite
efetivo vira `k × max`.

### 8.3 Origens confiáveis — F5-S07

`trustedOrigins` alimenta o `originCheck`, que é o que sustenta a proteção contra open redirect
(T24/T25 de F3-S03). Hoje `MOBILE_DEEP_LINK` entra ali como `z.string().optional()`: um `*`, uma
string vazia significativa ou um domínio de terceiro passam pelo Zod sem nenhum sinal no boot.

```ts
MOBILE_DEEP_LINK: z
  .string()
  .regex(/^[a-z][a-z0-9+.-]*:\/\/[^*\s]*$/, 'must be a scheme URL without wildcards')
  .optional(),
CORS_ORIGIN: z.string().default(''),   // cada item validado no derivado:
// CORS_ORIGIN_LIST rejeita '*' e qualquer item que não case /^https?:\/\/[^*\s]+$/
// quando NODE_ENV === 'production'
```

### 8.4 Envelope de erro em `/api/auth/*` — F5-S04

A ponte devolve o corpo cru do Better Auth (`auth.plugin.ts:68-69`), então erros de `/api/auth/*`
não têm a forma `{ statusCode, error, message, details }` do resto da API e o cliente Flutter
precisa de dois parsers.

**A correção é aditiva, nunca substitutiva.** Para respostas com `status >= 400` e
`content-type: application/json`, o corpo passa a ser:

```jsonc
{
  // ── chaves originais do Better Auth, preservadas byte a byte ──
  "code": "INVALID_EMAIL_OR_PASSWORD",
  "message": "Invalid email or password",
  // ── envelope RFC 7807 acrescentado ──
  "statusCode": 401,
  "error": "Unauthorized",
  "details": null,
}
```

Preservar `code` e `message` no topo é inegociável: o SDK oficial do Better Auth e o cliente
Flutter já os leem. Se o corpo não for JSON parseável, repasse-o **intacto** — não invente
envelope sobre HTML ou texto.

### 8.5 Nome do cookie no OpenAPI — F5-S04

`swagger.plugin.ts:50` declara `better-auth.session_token`. Em produção o Better Auth prefixa:
`__Secure-better-auth.session_token`, sempre que `baseURL` for https **ou** `NODE_ENV=production`
(`dist/cookies/index.mjs:23,275`). O `securityScheme` passa a derivar o nome do mesmo predicado,
para não documentar um cookie que não existe.

---

## 9. Checklist de auditoria — substitui e amplia a spec `04` §7

Portão de **F7-S02** (renumerado de `F5-S09` por D-64). Cada item precisa de evidência; item sem
evidência conta como falha.

### Herdados da spec `04` §7 — continuam valendo

- [ ] `.env` fora do git em todo o histórico; nenhum segredo em `git log -p`
- [ ] `/me` não expõe `password`, `emailVerified`, `session` nem `account`
- [ ] 500 nunca devolve `stack` nem `err.message` cru
- [ ] `redact` do Pino cobre os seis caminhos de D-22
- [ ] Toda rota protegida tem `onRequest: [fastify.requireAuth]` — 13 de 13
- [ ] Todo acesso a recurso de usuário filtra por `user_id` **na query SQL**
- [ ] Recurso de outro usuário responde **404**, nunca 403 (D-31)
- [ ] `trustedProviders` só com provedor que verifica e-mail; `callbackURL` validado
- [ ] Nenhum `any` nem `@ts-expect-error` sem justificativa
- [ ] `pnpm audit --prod` sem alta ou crítica

### Acrescentados por esta spec

- [ ] `buildRateLimitOptions({ NODE_ENV: 'production' }).global === true` (GAP-01)
- [ ] `TRUST_PROXY_HOPS` e `TRUSTED_PROXIES` derrubam o boot se ausentes em produção (GAP-04/10)
- [ ] `resolveClientIp` ignora `X-Forwarded-For` de origem não confiável (GAP-04)
- [ ] `customRules` contém **as 13 entradas** da §3.3, `/request-password-reset` inclusive (GAP-05/06)
- [ ] `POST /sign-up/email` responde **idêntico** para e-mail novo e existente (GAP-08)
- [ ] `POST /sign-in/email` responde 403 antes da verificação de e-mail (GAP-14)
- [ ] Bearer anterior ao reset de senha responde 401 depois dele (GAP-07)
- [ ] Nenhum `pino(` em `src/**` fora de `buildApp()` (GAP-15/D-57)
- [ ] Nenhum token de verificação, reset ou OTP em log, em nenhum transporte (GAP-15)
- [ ] `templates.ts` escapa toda interpolação, `href` inclusive (GAP-22)
- [ ] `session.cookieCache` ativo; o hook de sessão não consulta o banco em `/health` (GAP-13)
- [ ] Índices da §6.1 presentes na migração e no banco (GAP-19)
- [ ] `UNIQUE(provider_id, account_id)` em `account` (GAP-16)
- [ ] `UNIQUE(credential_id)` e coluna `aaguid` em `passkey` (GAP-09/D-54)
- [ ] `onDelete: 'cascade'` em `two_factor.user_id` e `passkey.user_id`; `DELETE /me` verde (GAP-09)
- [ ] Erro de `/api/auth/*` traz `code`, `message` **e** o envelope RFC 7807 (GAP-26)
- [ ] `securityScheme` do cookie usa o prefixo `__Secure-` quando aplicável (GAP-20)
- [ ] `/docs` responde 404 com `NODE_ENV=production`; `docs/openapi.json` continua íntegro (GAP-17)
- [ ] Logger do Better Auth em `level: 'error'` — sem e-mail em stdout (GAP-23)
- [ ] `.github/workflows/ci.yml` sem literal com forma de segredo (GAP-21)
- [ ] `resolveRequestId` trunca em 64 e rejeita alfabeto inválido (GAP-27)
- [ ] `MOBILE_DEEP_LINK` e `CORS_ORIGIN` rejeitam `*` em produção (GAP-18)
- [ ] Senha em lista de vazadas é recusada com mensagem genérica (GAP-25)
- [ ] `/change-password` coberto por teste, incluindo revogação de sessão (GAP-24)
- [ ] 2FA: TOTP, OTP e backup codes com casos verdes; bloqueio de conta observado (GAP-02)
- [ ] Passkey: registro e autenticação verificados manualmente em navegador real (GAP-03)

---

## 10. Rastreabilidade — GAP × sprint × seção

| GAP    | Sev.    | Sprint     | Seção normativa |
| ------ | ------- | ---------- | --------------- |
| GAP-01 | CRÍTICO | F5-S02     | §3.1            |
| GAP-04 | ALTO    | F5-S02     | §2.1, §2.3      |
| GAP-05 | ALTO    | F5-S02     | §3.3            |
| GAP-06 | ALTO    | F5-S02     | §3.3            |
| GAP-10 | MÉDIO   | F5-S02     | §2.1, §2.2      |
| GAP-17 | MÉDIO   | F5-S02     | §8.1            |
| GAP-21 | BAIXO   | F5-S02     | §9              |
| GAP-27 | BAIXO   | F5-S02     | §2.4            |
| GAP-07 | ALTO    | F5-S03     | §4              |
| GAP-08 | ALTO    | F5-S03     | §4.1            |
| GAP-14 | MÉDIO   | F5-S03     | §4.1            |
| GAP-15 | MÉDIO   | F5-S03     | §5              |
| GAP-22 | BAIXO   | F5-S03     | §5              |
| GAP-24 | BAIXO   | F5-S03     | §9              |
| GAP-25 | BAIXO   | F5-S03     | §4.3            |
| GAP-13 | MÉDIO   | F5-S04     | §6, §9          |
| GAP-16 | MÉDIO   | F5-S04     | §6.1            |
| GAP-19 | MÉDIO   | F5-S04     | §6.1            |
| GAP-20 | BAIXO   | F5-S04     | §8.5            |
| GAP-23 | BAIXO   | F5-S04     | §9              |
| GAP-26 | BAIXO   | F5-S04     | §8.4            |
| GAP-02 | ALTO    | F5-S05     | §7.1            |
| GAP-09 | MÉDIO   | F5-S05/S06 | §6.2, §6.3      |
| GAP-03 | ALTO    | F5-S06     | §7.2            |
| GAP-11 | MÉDIO   | F5-S07     | §3.2            |
| GAP-12 | MÉDIO   | F5-S07     | §3.3, §8.2      |
| GAP-18 | MÉDIO   | F5-S07     | §8.3            |

**27 GAPs · 6 sprints · nenhum órfão.** GAP-22 e GAP-25 não constavam do encaminhamento original de
`docs/issue/AUTHENTICATION.md` §9 e foram alocados aqui em F5-S03, por afinidade de arquivo
(`templates.ts` com GAP-15) e de bloco de configuração (`emailAndPassword` com GAP-07/08).
