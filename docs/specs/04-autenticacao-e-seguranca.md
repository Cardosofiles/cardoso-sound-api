# 04 — Autenticação e Segurança

> **Estado:** F5 completa e mergeada (D-73). Salvo onde marcado, **cada bloco desta spec descreve
> configuração que está no código**, com o arquivo de origem, a ADR que a decidiu e o GAP de
> auditoria que a motivou.
>
> **Relação com a spec `08`.** A `08` é o registro da auditoria de 2026-09-09 (27 GAPs) e o
> portão de `F7-S02`. Os blocos normativos dela foram entregues em `F5-S02`…`F5-S07` e `F5-S10` e
> estão **consolidados aqui**, na forma em que rodam. A `08` continua valendo para rastreabilidade
> (GAP × sprint) e para o checklist de release. Divergência entre as duas é bug a reportar, não
> margem de escolha.
>
> **Uso como referência para outras APIs.** Esta spec é escrita para ser copiada. A §1 são os
> princípios portáveis; a **§19 é o catálogo de armadilhas medidas** — é a seção que economiza
> tempo em qualquer API que use Better Auth atrás de um proxy. O que é específico deste projeto
> está marcado com _(projeto)_.

---

## Sumário

| §                                                    | Assunto                                                            |
| ---------------------------------------------------- | ------------------------------------------------------------------ |
| [1](#1-princípios)                                   | Princípios                                                         |
| [2](#2-better-auth--configuração-única)              | Better Auth: objeto único, ordem dos plugins, seams de teste       |
| [3](#3-ciclo-de-vida-da-conta--e-mail-e-senha)       | Verificação obrigatória, anti-enumeração, reset, política de senha |
| [4](#4-oauth-social-e-vínculo-de-contas)             | Provedores, escopos, `accountLinking`, step-up                     |
| [5](#5-segundo-fator--2fa)                           | TOTP, OTP por e-mail, backup codes, bloqueio de conta              |
| [6](#6-passkey--webauthn--fido2)                     | `rpID` derivado, endpoints, runbook de verificação                 |
| [7](#7-e-mail-transacional)                          | Transportes, não vazamento de token, templates                     |
| [8](#8-a-ponte-fastify--better-auth)                 | Rota coringa, IP validado, sessão, envelope RFC 7807               |
| [9](#9-guard-de-rotas-e-autorização-de-recurso)      | `requireAuth`, isolamento por `user_id`, 404 sempre                |
| [10](#10-topologia-de-proxy-e-identidade-do-cliente) | `trustProxy` por predicado, `TRUSTED_PROXIES`, `x-request-id`      |
| [11](#11-rate-limiting--dois-limitadores)            | Fastify e Better Auth, 13 `customRules`, Redis opcional            |
| [12](#12-plugins-de-defesa-de-borda)                 | helmet, cors, rate-limit, under-pressure, swagger condicional      |
| [13](#13-logging-seguro)                             | Logger único, `redact`, nada de `console`                          |
| [14](#14-variáveis-de-ambiente)                      | Tabela completa e regras de falha fechada                          |
| [15](#15-modelo-de-dados-de-autenticação)            | Migrações `0002`–`0005`                                            |
| [16](#16-o-que-precisa-de-teste)                     | Casos obrigatórios por área                                        |
| [17](#17-checklist-de-auditoria--portão-de-f7-s02)   | Checklist de release                                               |
| [18](#18-rastreabilidade--gap--sprint--seção)        | GAP × sprint × seção                                               |
| [19](#19-catálogo-de-armadilhas-medidas)             | **Armadilhas reais, com sintoma e regra**                          |

---

## 1. Princípios

Quatro regras decidem os casos que esta spec não enumera.

1. **Falha fechada e ruidosa.** Configuração de segurança ausente derruba o boot com
   `process.exit(1)`; nunca assume um default permissivo. Vale para topologia de proxy (§10),
   segredos (§14) e origens confiáveis (§14).
2. **Confiança é declarada, nunca inferida.** Nenhum header controlado pelo cliente vira decisão
   de segurança sem uma lista explícita de quem pode enviá-lo. `trustProxy: true` é a violação
   canônica desse princípio.
3. **Registrar um comportamento não é aceitá-lo.** D-46 (e) apenas _documentava_ que sessões
   sobreviviam ao reset de senha; D-52 revogou. Uma decisão só aceita risco quando diz que aceita,
   com o porquê.
4. **O que não é testável não está entregue.** Configuração que só se prova em produção vira
   função pura exportada e testada — `buildRateLimitOptions`, `buildTrustProxy`, `resolveClientIp`,
   `resolveRequestId`, `shouldExposeSwaggerUi`, `sessionCookieName`, `shouldResolveSession`,
   `toRfc7807`, `rateLimitKeyGenerator`, `extractSessionToken`.

---

## 2. Better Auth — configuração única

`src/modules/auth/auth.config.ts` é o **único** lugar que configura autenticação. Não existe um
segundo `betterAuth()` nem um segundo arquivo.

### 2.1 O objeto entregue

```ts
export function createAuth(options?: CreateAuthOptions) {
  return betterAuth({
    appName: 'Cardoso Sound',
    database: drizzleAdapter(dynamicDb, { provider: 'pg', schema }),
    secret: env.BETTER_AUTH_SECRET,
    baseURL: env.BETTER_AUTH_URL,
    basePath: '/api/auth', // não versionado, padrão da lib (D-16)

    socialProviders:
      options?.overrideSocialProviders ??
      Object.fromEntries(SOCIAL_PROVIDERS.map((p) => [p, PROVIDER_CONFIG[p]])),

    account: {
      accountLinking: {
        enabled: true,
        trustedProviders: ['google', 'github'], // D-58 (b) — Facebook fora, §4.4
        allowDifferentEmails: true, // D-58 (a)
      },
    },

    emailAndPassword: {
      enabled: true,
      minPasswordLength: 8,
      maxPasswordLength: 128, // explícito, anti-DoS de hash
      autoSignIn: true,
      requireEmailVerification: true, // D-51 — era false
      revokeSessionsOnPasswordReset: true, // D-52 — não existia
      resetPasswordTokenExpiresIn: 60 * 60,
      sendResetPassword: async ({ user, url }) => {
        /* mailer, §7 */
      },
    },

    emailVerification: {
      sendOnSignUp: true,
      autoSignInAfterVerification: true,
      expiresIn: 60 * 60 * 24,
      sendVerificationEmail: async ({ user, url }) => {
        /* mailer, §7 */
      },
    },

    session: {
      expiresIn: 60 * 60 * 24 * 7, // 7 dias
      updateAge: 60 * 60 * 24,
      freshAge: 60 * 60 * 24, // D-58 (c) — explícito, governa só R48
      cookieCache: { enabled: true, maxAge: 5 * 60 }, // GAP-13
    },

    logger: { level: 'error' }, // GAP-23 — sem e-mail em stdout

    rateLimit: {
      enabled: isProduction, // D-19
      storage: 'database', // D-55 — exige a tabela `rate_limit`
      window: 60,
      max: 10,
      customRules: AUTH_RATE_LIMIT_RULES, // as 13 entradas da §11.2
    },

    trustedOrigins: [
      ...env.CORS_ORIGIN_LIST,
      ...(env.MOBILE_DEEP_LINK ? [env.MOBILE_DEEP_LINK] : []),
    ],

    advanced: {
      disableOriginCheck: false,
      ipAddress: {
        ipAddressHeaders: ['x-forwarded-for'],
        trustedProxies: TRUSTED_PROXY_LIST, // D-50 — defesa em profundidade, §10.3
      },
    },

    plugins: [
      twoFactor({/* §5 */}),
      passkey({/* §6 */}),
      bearer(),
      forgetPasswordPlugin(),
      weakPasswordPlugin(),
    ],
  });
}

export type Session = typeof auth.$Infer.Session.session;
export type User = typeof auth.$Infer.Session.user;
```

Não negociáveis:

- **`bearer()`** é o que faz a API aceitar `Authorization: Bearer <token>` e devolver
  `set-auth-token` no sign-in. Sem ele o Flutter não autentica (**D-13**). O cookie httpOnly
  continua funcionando em paralelo.
- **`basePath: '/api/auth'`**, não versionado (**D-16**). As chaves de `customRules` são
  **relativas a ele** — §11.2.
- **`rateLimit.enabled` preso a produção** (**D-19**): ligado em teste produz 429 aleatório, que é
  a causa clássica de flake.
- `Session` e `User` saem de `auth.$Infer` — **nunca** escritos à mão.

### 2.2 A ordem dos plugins é load-bearing

> **Armadilha de severidade alta, medida em F5-S05.** Ver §19.1.

```
twoFactor  →  passkey  →  bearer  →  forgetPasswordPlugin  →  weakPasswordPlugin
```

`bearer()` tem um hook `after` que emite `set-auth-token` a partir da sessão presente na resposta.
Se `bearer()` for registrado **antes** de `twoFactor()`, ele intercepta a sessão temporária do
desafio 2FA antes de o `twoFactor` removê-la: `POST /sign-in/email` passa a devolver um bearer
válido para um usuário com 2FA ativo — **segundo fator contornado por ordem de array**.

Com `twoFactor` primeiro, ele remove a sessão e o cookie e responde `{ twoFactorRedirect: true }`;
`bearer` não encontra sessão e não emite header nenhum.

**Regra portável:** qualquer plugin que _materialize credencial_ (bearer, JWT, cookie custom) vem
**depois** de todo plugin que possa _interromper_ o fluxo de autenticação (2FA, step-up, device
check).

### 2.3 Plugins próprios

Dois plugins locais, ambos declarados no mesmo array:

| Plugin                 | Endpoint / hook                                                          | Por quê                                                                                    |
| ---------------------- | ------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------ |
| `forgetPasswordPlugin` | `POST /forget-password`, reusando `requestPasswordReset.options`         | Alias histórico do contrato. **Não substitui o endpoint nativo** `/request-password-reset` |
| `weakPasswordPlugin`   | hook `before` em `/sign-up/email`, `/reset-password`, `/change-password` | Recusa senha de lista de vazadas com `400 INVALID_PASSWORD`, mensagem genérica (§3.4)      |

O alias é a origem do **GAP-05**: proteger só `/forget-password` no rate limit deixava 600
e-mails/hora abertos pelo caminho nativo. As duas entradas existem e têm valores idênticos (§11.2).

### 2.4 Seams de teste — _(projeto)_

- `dynamicDb` é um `Proxy` sobre `db`, para que a troca de pool feita pelo harness de
  Testcontainers seja vista pelo `drizzleAdapter` sem recriar a instância de auth.
- `auth` exportado é um `Proxy` sobre `currentAuth`; `setAuthInstanceForTest` /
  `resetAuthInstanceForTest` permitem sobrepor provedores sociais sem tocar em `env`.
- `createAuth({ overrideSocialProviders })` é o ponto de injeção usado pelos testes de OAuth.

Nenhum desses seams altera comportamento em produção: `createAuth()` sem argumento é o caminho real.

---

## 3. Ciclo de vida da conta — e-mail e senha

> D-51 e D-52. Substitui integralmente a política de F3-S03, que era
> `requireEmailVerification: false`.

### 3.1 Verificação de e-mail é obrigatória — D-51

`requireEmailVerification: true`. A justificativa antiga (`false` facilitava o helper de teste) não
se sustenta: o transporte de memória expõe o link no `outbox`, então o helper faz o fluxo real,
offline e determinístico (§16).

Sem isso, dois vetores permanentes:

- **GAP-14 — squatting.** Qualquer pessoa se cadastra com o e-mail de um terceiro, ganha sessão de
  7 dias e, por `user_email_unique`, **impede o dono real de se cadastrar**. Somado ao envio de
  verificação, vira relay de spam com o domínio da aplicação.
- **GAP-08 — enumeração.** O Better Auth só emite a resposta genérica de duplicidade quando
  `requireEmailVerification` **ou** `autoSignIn === false` está ativo
  (`dist/api/routes/sign-up.mjs:163`). Sem isso, `422` significa "cadastrado" e `200` significa
  "novo": o sign-up vira oráculo de contas.

### 3.2 O que mudou no contrato

| Rota                   | Antes (F3)                       | Agora (F5-S03)                                                        |
| ---------------------- | -------------------------------- | --------------------------------------------------------------------- |
| `POST /sign-up/email`  | 200 com token · 4xx se duplicado | **200 idêntico** nos dois casos, `token: null`, sem `Set-Cookie`      |
| `POST /sign-in/email`  | 200 sem verificar                | **403 `EMAIL_NOT_VERIFIED`** enquanto `emailVerified === false`       |
| `POST /reset-password` | sessões antigas sobreviviam      | **todas as sessões do usuário são revogadas** (bearer anterior → 401) |

`shouldSkipAutoSignIn = true` (`sign-up.mjs:164`) é o que zera o token no cadastro — não é bug, é
consequência de `requireEmailVerification: true`. **O cliente não deve assumir sessão após o
sign-up**: a tela seguinte é "confira sua caixa de entrada", nunca a Home.

### 3.3 Reset revoga tudo — D-52

`revokeSessionsOnPasswordReset: true`. Sem isso o fluxo de recuperação não recupera a conta: quem
roubou um bearer mantém acesso por até 7 dias depois de a vítima trocar a senha, inclusive ao
`DELETE /api/v1/me`.

> A chave é `revokeSessionsOnPasswordReset`. **`revokeOtherSessions` não existe** como opção de
> `emailAndPassword` — é parâmetro do corpo de `POST /change-password`. Escrevê-la ali é no-op
> silencioso.

### 3.4 Política de senha — NIST SP 800-63B

- `minPasswordLength: 8`, `maxPasswordLength: 128`. O teto é anti-DoS: hashing de senha de 1 MB é
  trabalho de CPU pago pelo servidor.
- **Nenhuma exigência de composição** (maiúscula, símbolo). O NIST desaconselha: aumenta a chance
  de senha previsível e não mede força real.
- 8 caracteres só é aceitável **com** verificação contra listas de vazadas. Aqui isso é
  `src/shared/security/weak-passwords.ts`: `Set<string>` embutido no bundle, comparação em
  minúsculas e `trim`, custo O(1), **sem rede**.
- Rejeição responde `400` com mensagem genérica — **sem** dizer que a senha está numa lista
  pública, o que seria um oráculo a mais.

> **Por que não `haveIBeenPwned`.** O plugin nativo consulta a API pública Pwned Passwords por
> HTTP no caminho do sign-up. Indisponibilidade do terceiro vira 500 no cadastro (_fail-closed_
> não tolerante) e a suíte de teste passa a depender de rede. A lista offline é menor em cobertura
> e infinitamente mais previsível. Numa API com orçamento para isso, o k-anonymity do HIBP é
> melhor — mas então trate a falha de rede como _fail-open_ explícito e registre a decisão.

---

## 4. OAuth social e vínculo de contas

### 4.1 Provedor só existe se o par de credenciais existir

`SOCIAL_PROVIDERS` (derivado em `src/config/env.ts`) contém **apenas** os provedores cujo par
`*_CLIENT_ID` + `*_CLIENT_SECRET` está presente. Provedor sem credencial não é registrado: o efeito
é um 4xx da lib em vez de um 500 por `clientId: undefined`, e é o que permite rodar o projeto
localmente sem as seis credenciais. Meia credencial (`ID` sem `SECRET`) é **erro de validação de
env**, não provedor meio-configurado (§14).

### 4.2 Escopos — mínimos, e não mais que isso

| Provedor | Escopo                 | Observação                                            |
| -------- | ---------------------- | ----------------------------------------------------- |
| Google   | `openid email profile` | padrão da lib                                         |
| GitHub   | `user:email`           | **obrigatório**: sem ele, e-mail privado volta `null` |
| Facebook | `email public_profile` | `email` só é liberado após **App Review** da Meta     |

Redirect URIs cadastradas uma por ambiente:

```
http://localhost:3333/api/auth/callback/<provider>
https://<dominio-de-producao>/api/auth/callback/<provider>
```

### 4.3 `accountLinking` — a política inteira em cinco chaves

| Chave                  | Valor                  | Por quê                                                         |
| ---------------------- | ---------------------- | --------------------------------------------------------------- |
| `enabled`              | `true`                 | A área de conta lista, acrescenta e remove métodos de login     |
| `trustedProviders`     | `['google', 'github']` | Só provedor que **comprovadamente** verifica e-mail. D-58 (b)   |
| `allowDifferentEmails` | `true`                 | O e-mail primário do GitHub raramente é o do cadastro. D-58 (a) |
| `allowUnlinkingAll`    | ausente (`false`)      | Ninguém fica sem método de login                                |
| `updateUserInfoOnLink` | ausente (`false`)      | Vincular não reescreve `name`/`image` do perfil                 |

**`trustedProviders` é a chave perigosa.** O auto-vínculo liga a conta social ao usuário existente
de mesmo e-mail. Ligar um provedor que não verifica e-mail permite que alguém crie uma conta social
com o e-mail da vítima e passe a entrar na conta dela. Isso é sequestro de conta, não conveniência.
Provedor em dúvida fica **fora** — o usuário ainda pode vincular manualmente depois de autenticado.

**`allowDifferentEmails: true` não abre o que parece abrir.** Vincular nunca altera a identidade da
conta: `applyUpdateUserInfoOnLink` (`better-auth/dist/oauth2/link-account.mjs:319-331`) retorna cedo
enquanto `updateUserInfoOnLink !== true` e, mesmo ligado, desestrutura `email` e `emailVerified`
para fora do update. A chave também **não** afeta o auto-vínculo do `/sign-in/social`: lá o
casamento é por e-mail (`link-account.mjs:63`), então os e-mails são iguais por construção. Ela é
lida só em `/link-social` e no callback que carrega `state.link` (`account.mjs:213`,
`callback.mjs:177`).

Risco residual aceito: o usuário perde o controle do provedor vinculado (e-mail corporativo
devolvido, conta reciclada). Mitigação é o próprio `unlink` (R48).

### 4.4 Facebook fica fora — com evidência de runtime

Não é precaução genérica. Em `@better-auth/core/dist/social-providers/facebook.mjs`:

- caminho do `idToken` (Limited Login) **fixa `emailVerified: false`** (linha 102);
- caminho do access token lê `profile.email_verified ?? false` (linha 130), enquanto o `fields` da
  chamada ao Graph (linha 110) pede apenas `id,name,email,picture` — **o campo nunca chega**.

Como o teste da lib é `!trustedProviders.includes(provider) && !userInfo.emailVerified`, o Facebook
é recusado nos dois caminhos de vínculo. `POST /link-social` com Facebook responde sempre
`401 LINKING_NOT_ALLOWED`. **Isso é contrato, não defeito** (spec `03` §5.1, R47). O Facebook
continua registrado como provedor de **sign-in**; só não é elegível a vínculo.

### 4.5 Cliente nativo — dois caminhos, e o que cada provedor suporta

| Caminho                  | Como funciona                                                                                                  |
| ------------------------ | -------------------------------------------------------------------------------------------------------------- |
| **`idToken`** (preferir) | SDK nativo autentica no aparelho; o app envia o `idToken` em `POST /sign-in/social`. Sem redirect, sem browser |
| Redirect + deep link     | `POST /sign-in/social` devolve `{ url }`; o retorno cai em `callbackURL`, que precisa ser o deep link          |

| Provedor | Vincular por `idToken`          | Vincular por redirect    |
| -------- | ------------------------------- | ------------------------ |
| Google   | ✅ preferir                     | ✅                       |
| GitHub   | ❌ `404 ID_TOKEN_NOT_SUPPORTED` | ✅ único caminho         |
| Facebook | ❌ `401 LINKING_NOT_ALLOWED`    | ❌ `LINKING_NOT_ALLOWED` |

`supportsIdTokenSignIn` exige que o provedor declare configuração de `idToken`. Google
(`google.mjs:110`) e Facebook (`facebook.mjs:74`) declaram; **GitHub não**.

Quatro regras para o app:

1. **`callbackURL` é validado contra `trustedOrigins`.** `callbackURL` aceito sem essa validação é
   open redirect com token na URL. `trustedOrigins` = `CORS_ORIGIN_LIST` + `MOBILE_DEEP_LINK`.
2. **O `aud` do id_token tem de bater com `GOOGLE_CLIENT_ID` do servidor.** `google.mjs:113` fixa
   `audience: options.clientId`, um valor só: no Flutter, `google_sign_in` precisa de
   `serverClientId` igual ao **web client ID** do ambiente da API. O client ID de Android/iOS não
   passa na verificação.
3. **Nenhum client secret vai no binário.** No caminho `idToken` o app usa só o client ID, que é
   público. Um APK é descompilável.
4. **Deep link por App Links / Universal Links**, com `assetlinks.json` e AASA — não por scheme
   customizado puro, que no Android pode ser reivindicado por outro app instalado e sequestrar o
   callback.

### 4.6 Step-up de sessão para desvincular

`freshSessionMiddleware` é usado por **duas rotas em toda a lib**: `/unlink-account`
(`account.mjs:266` — R48) e `/list-sessions` (`session.mjs:343`, responde pela coringa mas não está
no contrato). O terceiro consumidor de `freshAge` é o `/delete-user` nativo
(`update-user.mjs:335`), que este projeto não usa — `DELETE /api/v1/me` (R15) é código próprio.

`freshAge: 86400` contra sessão de 7 dias significa: desvincular no 3º dia responde
`403 SESSION_NOT_FRESH`. Contrato para o app: pedir a senha, chamar `POST /sign-in/email`, repetir
o `unlink` com o token novo. **Nenhuma rota nova é criada para isso.**

### 4.7 Pré-requisito de banco

A decisão de linking do Better Auth é _read-then-write sem guarda no banco_
(`link-account.mjs:78`). Sem `UNIQUE(provider_id, account_id)` em `account`, dois callbacks OAuth
concorrentes duplicam a identidade do provedor. O índice existe desde a migração `0002` (§15).

---

## 5. Segundo fator — 2FA

> D-53 · GAP-02. Plugin `twoFactor` de `better-auth/plugins` — sem dependência nova.

```ts
twoFactor({
  issuer: 'Cardoso Sound',
  skipVerificationOnEnable: false,
  totpOptions: { issuer: 'Cardoso Sound', digits: 6, period: 30, backupCodes: { amount: 10 } },
  otpOptions: {
    digits: 6,
    period: 10,
    async sendOTP({ user, otp }) {
      /* twoFactorOtpEmail via mailer */
    },
  },
  accountLockout: { enabled: true, maxFailedAttempts: 5, durationSeconds: 900 },
});
```

- **2FA é opcional por usuário** (`user.two_factor_enabled`), nunca imposto no cadastro.
- **`skipVerificationOnEnable: false`** impede ativar 2FA com um segredo que o usuário não consegue
  usar — o cenário em que a pessoa se tranca fora da própria conta.
- **`trustDevice` fica desligado.** 30 dias de isenção por dispositivo é superfície que não temos
  como revogar sem uma tela de gestão de dispositivos.
- **`accountLockout`** é a **única defesa por conta** do projeto: contador compartilhado entre
  TOTP, OTP e backup codes, `429 ACCOUNT_TEMPORARILY_LOCKED` após 5 falhas, por 15 min. O rate
  limit é por IP e não protege uma conta contra um atacante distribuído.
- **Backup codes são de uso único**; regenerar invalida todos os anteriores; são exibidos **uma
  vez**. O cliente precisa saber disso.

**Contrato novo:** com 2FA ativo, `POST /sign-in/email` responde `{ twoFactorRedirect: true }` em
vez de sessão — **sem** `set-auth-token`, **sem** `Set-Cookie` de sessão. O cliente que trata isso
como falha de login quebra. Fluxo: `sign-in` → `verify-totp` | `send-otp` + `verify-otp` |
`verify-backup-code` → sessão real.

Particularidades de runtime medidas (`better-auth@1.7.2`):

1. **Segredo cru vs. URI Base32.** A coluna `two_factor.secret` guarda o segredo cru de 32
   caracteres e o HMAC-SHA1 é calculado sobre os bytes dessa string; o `totpURI` devolvido por
   `/two-factor/enable` traz o segredo em Base32 (RFC 4648). São representações diferentes da
   mesma chave — não "conserte" uma pela outra.
2. **CSRF por `origin`.** Toda mutação por cookie valida a origem. Teste que usa
   `app.inject({ cookie })` em rota de 2FA **precisa** mandar `origin: env.BETTER_AUTH_URL`.
3. **`send-otp` com corpo vazio.** Com `content-type: application/json`, o Fastify exige JSON
   válido: use `payload: {}`, senão vem `FST_ERR_CTP_EMPTY_JSON_BODY` (400).
4. **Ativar 2FA renova a sessão.** `verify-totp` bem-sucedido invalida a sessão temporária e emite
   outra. Cliente e suíte precisam capturar o novo `set-auth-token` / `set-cookie`.

---

## 6. Passkey — WebAuthn / FIDO2

> D-54 · GAP-03. Dependência de produção nova: `@better-auth/passkey@1.7.2`, pareada com
> `better-auth@1.7.2`.

```ts
passkey({
  rpID: new URL(env.BETTER_AUTH_URL).hostname, // 'localhost' em dev; nunca TLD nu, nunca URL
  rpName: 'Cardoso Sound',
  origin: env.BETTER_AUTH_URL, // sem barra final
});
```

- **`rpID` e `origin` são derivados**, nunca variáveis próprias. Duas fontes de verdade para o
  domínio é a classe de bug em que a passkey registrada em `localhost` não valida em produção.
- `registration.requireSession` fica no default `true`: registro exige usuário autenticado. `false`
  exigiria um `resolveUser` que identifica usuário sem sessão — superfície que o MVP não precisa.
- **`BETTER_AUTH_URL` vira imutável na prática** (D-62). O `rpID` é parte da identidade da
  credencial no autenticador: trocar o host faz o autenticador deixar de devolver **toda** passkey
  registrada sob o host anterior. Não há migração, só novo registro. Decida o domínio **antes** do
  primeiro deploy.

Endpoints: `POST /sign-in/passkey` · `GET /passkey/generate-register-options` ·
`POST /passkey/verify-registration` · `GET /passkey/generate-authenticate-options` ·
`GET /passkey/list-user-passkeys` · `POST /passkey/delete-passkey` · `POST /passkey/update-passkey`.

> **O verbo `DELETE` não é necessário na rota coringa.** O Better Auth usa `POST` para toda mutação
> e `GET` para leitura; `['GET','POST','OPTIONS']` cobre 100 % dos endpoints dos dois plugins.
> Auditorias anteriores erraram nisso — não "corrija" o que não está quebrado.

**Isolamento (D-31):** excluir ou renomear credencial de outro usuário responde **404**, nunca 403.
`list-user-passkeys` devolve só as do usuário autenticado.

**Runbook de verificação** (não há como automatizar WebAuthn na suíte):
`pnpm dev` → Chrome em `/docs` → DevTools → More tools → **WebAuthn** → _Enable virtual
authenticator environment_ → autenticador `ctap2` / `internal` / resident keys / user verification
→ registrar por `generate-register-options` + `navigator.credentials.create` +
`verify-registration` → autenticar por `generate-authenticate-options` +
`navigator.credentials.get` + `POST /sign-in/passkey`.

---

## 7. E-mail transacional

### 7.1 Dois transportes, escolhidos uma vez

`src/shared/email/mailer.ts`, por `env.RESEND_API_KEY` existir ou não:

| Transporte | Quando         | Comportamento                                                               |
| ---------- | -------------- | --------------------------------------------------------------------------- |
| `resend`   | chave presente | envia de verdade; **nunca loga URL nem destinatário**                       |
| `memory`   | chave ausente  | empilha em `outbox`; loga `{to, subject, url}` **somente em `development`** |

`memory` é o transporte de `test` (é o que torna os fluxos testáveis sem rede) e de `development`
sem conta no Resend. Em `production` a chave é obrigatória (§14).

### 7.2 O que nunca vai para o log — D-57 · GAP-15

- **Um logger por aplicação.** `new pino()` em `src/**` fora do `buildApp()` é achado de auditoria.
  O mailer recebe `MailerLogger` por injeção e, sem injeção, usa um **logger silencioso** — não uma
  segunda instância Pino sem `redact`.
- **Nenhum transporte loga a URL fora de `development`.** O link de verificação e o de reset
  carregam o token na query string, e **o `redact` do Pino não enxerga query string**. Em dev,
  logar o link é como se pega o token; em test e production, nunca.
- **O transporte Resend nunca loga destinatário nem o erro cru do provedor.** Loga
  `{ provider: 'resend', status, message }`.
- **`mailer.send` nunca rejeita.** O Better Auth chama `sendVerificationEmail` dentro do fluxo de
  criação do usuário: propagar erro do provedor derruba o sign-up inteiro quando o Resend cai.
  Falha vira `warn`; o usuário pede reenvio.

### 7.3 Não vazar quais e-mails existem

`POST /forget-password`, `POST /request-password-reset` e `POST /send-verification-email` respondem
**200 idêntico** para e-mail existente e inexistente. A diferença é só que, no segundo caso, nenhum
e-mail sai. Resposta diferenciada transforma a rota em oráculo de enumeração.

### 7.4 Templates escapam tudo o que interpolam — GAP-22

`src/shared/email/templates.ts` tem `escapeHtml` (texto) e `escapeHtmlAttribute` (atributo), e
ambos são aplicados: `safeName = escapeHtml(...)`, `safeUrl = escapeHtmlAttribute(...)`. Uma
variável chamada `safeUrl` que não escapa nada é pior do que nenhuma — mente para quem lê.

Não é explorável hoje (`originCheck` e o URL-encoding do Better Auth barram), mas é a única defesa
que resta se `disableOriginCheck` mudar.

O template de OTP (§5) **não tem `<a>`**: gateways de e-mail e scanners de segurança que clicam em
links não podem consumir nem invalidar um código de segundo fator.

---

## 8. A ponte Fastify ↔ Better Auth

`src/modules/auth/auth.plugin.ts`, registrado com `fastify-plugin` (precisa vazar os decorators
para o escopo global). Centralizar a coringa aqui é D-45 — é o que mantém o `eslint-plugin-boundaries`
satisfeito.

### 8.1 A rota coringa

`['GET','POST','OPTIONS'] /api/auth/*`, `schema: { hide: true }` — o corpo é da lib, não nosso, e
fica fora do OpenAPI (por isso R46–R48 não geram diff em `docs/openapi.json`).

Quatro cuidados, todos já custaram tempo:

1. **`set-cookie` pode vir múltiplo.** Use `res.headers.getSetCookie()` e passe o array inteiro de
   uma vez (**D-44**). `reply.header()` em loop sobrescreve e você perde cookies.
2. **`content-length` é excluído do repasse.** O valor vindo do Better Fetch é o do JSON
   **pré-transformação** (§8.4); repassado, o corpo trunca ou o cliente espera timeout. Excluído, o
   Fastify recalcula.
3. **URL absoluta** montada de `env.BETTER_AUTH_URL` + `request.url`.
4. **Body como string** só quando existe e o método não é GET/HEAD.

### 8.2 O `x-forwarded-for` é sobrescrito pelo IP validado — achado R-01

```ts
toFetchHeaders(request.headers, request.ip); // set(), nunca append()
```

**Esta é a correção mais importante da fase.** A ponte monta um `Request` da Fetch API **só com
headers** — o Better Auth não tem socket, então ele lê o `x-forwarded-for` **cru do cliente**. Sem
sobrescrever, um cliente fora da borda:

- escolhe o próprio bucket de rate limit girando o salto mais à direita —
  `getIPFromHeader` (`@better-auth/core@1.7.2`, `dist/utils/ip.mjs:171-197`) varre da direita para a
  esquerda e confia **incondicionalmente** no primeiro salto fora de `trustedProxies`;
- **grava IP falso em `session.ip_address`** — e isso, ao contrário de um bucket efêmero, é
  registro de auditoria persistido.

Medido antes da correção: 12 `POST /sign-in/email` com `X-Forwarded-For` rotativo → 12 × 401,
**nenhum 429**, com a regra de 5/60 s ativa. Depois: `401 401 401 429 429 …`.

Ambos os call sites (a coringa e o hook `onRequest`) passam `request.ip`, já validado pelo
predicado do D-60 (§10.2).

### 8.3 Resolução de sessão

```ts
fastify.decorateRequest('user', null);
fastify.decorateRequest('session', null);

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

- **O hook nunca lança.** Sessão ausente ou inválida = `null`. Quem decide se isso é erro é o guard
  da rota (§9).
- **`shouldResolveSession` faz curto-circuito** em `/health*` e `/api/auth*` (GAP-13). Sem ele, um
  `Authorization` forjado numa probe de liveness vira uma consulta a `session` por requisição —
  amplificação de banco gratuita sob DDoS. Medido: `GET /health` com bearer forjado → **0 queries**
  tocando `session`.
- **`session.cookieCache`** (5 min) elimina a consulta em requisições sucessivas: a 1ª lê o banco,
  a 2ª usa o `better-auth.session_data` assinado. Medido: 2 × `/api/v1/me` dentro de 5 min → 1
  query.

> O `cookieCache` tem um preço que precisa ser conhecido: **revogação de sessão demora até
> `maxAge` para ser sentida pelo caminho do cookie.** O caminho Bearer consulta o banco sempre — é
> por isso que o teste de step-up (§4.6) usa Bearer, não cookie.

### 8.4 Envelope de erro RFC 7807 — aditivo, nunca substitutivo — GAP-26

Sem isso, erros de `/api/auth/*` não têm a forma `{ statusCode, error, message, details }` do resto
da API e o cliente precisa de dois parsers.

`toRfc7807(status, rawBody)`:

- só atua com `status >= 400`;
- **preserva `code` e `message` byte a byte** — o SDK oficial do Better Auth e o app já os leem;
- acrescenta `statusCode`, `error` (texto canônico de `http.STATUS_CODES`) e `details: null`;
- se o corpo não for JSON parseável (HTML de proxy, texto), **repassa intacto** — não se inventa
  envelope sobre o que não é JSON.

```jsonc
{
  "code": "INVALID_EMAIL_OR_PASSWORD",
  "message": "Invalid email or password",
  "statusCode": 401,
  "error": "Unauthorized",
  "details": null,
}
```

Catálogo medido, útil como contrato do cliente:

| Situação                              | Status | `code`                                 |
| ------------------------------------- | ------ | -------------------------------------- |
| Credenciais inválidas                 | 401    | `INVALID_EMAIL_OR_PASSWORD`            |
| E-mail não verificado                 | 403    | `EMAIL_NOT_VERIFIED`                   |
| Vínculo com provedor não confiável    | 401    | `LINKING_NOT_ALLOWED`                  |
| E-mails diferentes com a chave off    | 401    | `LINKING_DIFFERENT_EMAILS_NOT_ALLOWED` |
| `idToken` em provedor sem suporte     | 404    | `ID_TOKEN_NOT_SUPPORTED`               |
| Provedor não configurado              | 404    | `PROVIDER_NOT_FOUND`                   |
| Sessão velha em `unlink-account`      | 403    | `SESSION_NOT_FRESH`                    |
| `accountId` alheio **ou** inexistente | 400    | `ACCOUNT_NOT_FOUND`                    |
| Senha em lista de vazadas             | 400    | `INVALID_PASSWORD`                     |
| Conta bloqueada por falhas de 2FA     | 429    | `ACCOUNT_TEMPORARILY_LOCKED`           |

### 8.5 Augmentation de tipos

`src/shared/types/fastify.d.ts`:

```ts
declare module 'fastify' {
  interface FastifyRequest {
    user: User | null;
    session: Session | null;
  }
  interface FastifyInstance {
    requireAuth: (request: FastifyRequest, reply: FastifyReply) => Promise<void>;
  }
}
```

---

## 9. Guard de rotas e autorização de recurso

```ts
fastify.decorate('requireAuth', async (request: FastifyRequest): Promise<void> => {
  if (!request.user || !request.session) throw new UnauthorizedError('Authentication required');
});
```

```ts
fastify.get('/playlists', { onRequest: [fastify.requireAuth], schema: {/* … */} }, handler);
```

**Contrato de identidade dentro do handler.** Depois do guard, `request.user` é não-nulo. Passe
**apenas `request.user.id`** ao service — nunca o `request` inteiro, nunca `reply`. É isso que
mantém o service testável (spec `01`).

```ts
return service.listPlaylists(request.user!.id, request.query); // ✅
return service.listPlaylists(request); // ❌
```

**Autorização de recurso é filtro na query, não comparação em memória:**

```ts
.where(and(eq(playlists.id, id), eq(playlists.userId, userId)))   // ✅ o banco garante
const p = await repo.findById(id); if (p.userId !== userId) …     // ❌ vaza em log, em erro, em race
```

Resultado vazio → `NotFoundError` (**404**). **Recurso de outro usuário é indistinguível de recurso
inexistente** (D-31). `ForbiddenError` existe na hierarquia; nenhuma rota do MVP o emite. Os 403
que aparecem vêm do Better Auth (`EMAIL_NOT_VERIFIED`, `SESSION_NOT_FRESH`) e são estado de sessão,
não autorização de recurso.

---

## 10. Topologia de proxy e identidade do cliente

> D-50 e D-60 · GAP-04, GAP-10, GAP-27. Atrás de um balanceador, **`req.ip` é a base de tudo**:
> rate limit, logs e `session.ip_address`. Errar aqui desarma as três coisas ao mesmo tempo.

### 10.1 Confiança declarada, com falha fechada

Duas variáveis, **ambas obrigatórias em produção** (§14):

- `TRUST_PROXY_HOPS` — profundidade máxima de saltos confiáveis. `0` = sem proxy (dev/test).
- `TRUSTED_PROXIES` — CSV de CIDRs da borda. Derivado exportado: `TRUSTED_PROXY_LIST`.

Boot real sem elas, com `NODE_ENV=production`:

```text
[Config Error] Invalid environment variables:
  - TRUST_PROXY_HOPS: TRUST_PROXY_HOPS must be >= 1 in production (D-50)
  - TRUSTED_PROXIES: TRUSTED_PROXIES must list the edge CIDRs in production (D-50)
```

Exit code 1. Um deploy sem topologia declarada **não sobe**, em vez de subir com rate limit
desarmado.

### 10.2 `trustProxy` é um predicado — número e `true` são proibidos

```ts
const app = Fastify({
  trustProxy: buildTrustProxy(env), // (address, hop) => hop < HOPS && isTrustedProxy(address, LIST)
  genReqId: (req) => resolveRequestId(req.headers['x-request-id']),
  logger: {/* §13 */},
});
```

As três formas erradas, todas medidas:

| Forma                  | O que acontece                                                                                                                                                  |
| ---------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `trustProxy: true`     | Confia na cadeia inteira. O cliente escolhe o próprio IP via `X-Forwarded-For`                                                                                  |
| `trustProxy: <número>` | `fastify@5.12.1` (`lib/request.js:51-55`) trata número como **fail closed** e devolve `false` sempre: todo cliente vira o IP do LB — um bucket só, DoS coletivo |
| predicado só com `hop` | Sem validar o peer, cliente direto forja: socket `198.51.100.9` + `XFF: 9.9.9.9` → `req.ip = 9.9.9.9`                                                           |

A forma correta valida **as duas dimensões**: profundidade E endereço. `buildTrustProxy` devolve
`false` quando `TRUST_PROXY_HOPS === 0` ou a lista está vazia.

`src/shared/utils/client-ip.ts` implementa `isTrustedProxy` com `net.BlockList` (IPv4 e IPv6,
CIDR ou endereço solto), memoizado por chave da lista. `resolveClientIp(headers, trusted, socketIp)`
existe testada para consumidores manuais: varre da **direita para a esquerda** e devolve o primeiro
salto fora dos CIDRs confiáveis; se o próprio socket não for confiável, devolve o socket — o XFF
foi forjado.

### 10.3 `advanced.ipAddress` é defesa em profundidade — não remova

Com a ponte já sobrescrevendo `x-forwarded-for` por `request.ip` (§8.2), a chave
`advanced.ipAddress.trustedProxies` parece redundante. **Não é.** Se um call site futuro deixar de
passar `request.ip`, a validação de CIDR no Better Auth impede que valores arbitrários sejam
aceitos. Removê-la por "limpeza" reabre o R-01 silenciosamente.

Assinatura confirmada em `@better-auth/core@1.7.2`
(`dist/types/init-options.d.mts:272`):

```ts
ipAddress?: { ipAddressHeaders?: string[]; disableIpTracking?: boolean; ipv6Subnet?: number; trustedProxies?: string[] };
```

> Antes de copiar este bloco para outra API, **confirme a assinatura na versão instalada**. Se
> divergir, pare e reporte — não invente opção.

### 10.4 `x-request-id` higienizado — GAP-27

`resolveRequestId(raw)` em `src/shared/utils/request-id.ts`: não-string, vazio ou fora de
`/^[A-Za-z0-9._-]+$/` → `randomUUID().slice(0, 8)`; válido → a própria string **truncada em 64**.
O valor vai para **toda linha de log**; sem limite de tamanho e alfabeto, o cliente injeta o que
quiser no seu agregador.

---

## 11. Rate limiting — dois limitadores

São **dois limitadores independentes**, e é preciso saber qual protege o quê:

| Limitador             | Cobre                       | Armazenamento                          | Chave        |
| --------------------- | --------------------------- | -------------------------------------- | ------------ |
| `@fastify/rate-limit` | **tudo**, `/health` à parte | memória, ou Redis por env              | §11.1        |
| Better Auth interno   | só `/api/auth/*`            | **PostgreSQL** (`storage: 'database'`) | IP + caminho |

### 11.1 `@fastify/rate-limit` — `src/plugins/rate-limit.plugin.ts`

```ts
export function buildRateLimitOptions(config: Env): RateLimitPluginOptions {
  return {
    global: config.NODE_ENV === 'production', // D-19
    max: config.RATE_LIMIT_MAX,
    timeWindow: config.RATE_LIMIT_WINDOW,
    allowList: (req) => req.url.startsWith('/health'),
    keyGenerator: rateLimitKeyGenerator,
    ...(config.RATE_LIMIT_REDIS_URL
      ? { redis: createRedisClient(config.RATE_LIMIT_REDIS_URL) }
      : {}),
  };
}
```

> **GAP-01, o único achado crítico da auditoria**, era uma palavra: o código trazia
> `global: env.NODE_ENV === 'development'` — a **negação exata** de D-19. Como nenhuma rota declara
> `config: { rateLimit }`, com `global: false` o plugin registra e governa **zero rotas em
> produção**. Por isso a opção é uma função pura: `buildRateLimitOptions({ NODE_ENV: 'production' }).global === true`
> é um teste unitário, não uma inspeção visual.

**Chave — GAP-11 · D-55:**

```ts
export function rateLimitKeyGenerator(req: FastifyRequest): string {
  const ip = req.ip; // já validado pelo predicado do §10.2
  if (req.url.startsWith('/api/auth')) return ip; // nunca por identidade
  const token = extractSessionToken(req.headers); // bearer ou cookie, sem tocar no banco
  return token ? `${ip}|${sha256(token).slice(0, 16)}` : ip;
}
```

Três decisões embutidas:

1. **`req.user` não existe aqui.** O hook do rate limit roda **antes** do hook que popula
   `request.user`. O ramo `req.user?.id ?? req.ip` era código morto, escondido do type checker por
   um `as unknown as`.
2. **A ordem de registro não muda.** Mover o limitador para depois do `authPlugin` tiraria do teto
   a própria rota coringa `/api/auth/*`, que é registrada dentro dele.
3. **Em `/api/auth/*` a chave é só o IP.** Chavear por identidade numa rota de autenticação daria a
   um atacante com N contas N × a cota. Fora dela, IP + hash do token **estreita** a cota (separa
   sessões atrás de um mesmo NAT), nunca a alarga — o IP permanece na chave sempre.

**Redis — seam, não dependência (D-55 · §8.2 da spec `08`).** `RATE_LIMIT_REDIS_URL` presente liga
o store compartilhado; `createRedisClient` carrega `ioredis` por `createRequire` e, se o pacote não
estiver instalado, **derruba o boot com mensagem prescritiva** em vez de rodar em memória achando
que está distribuído. Enquanto a variável não existir em produção, a aplicação **roda com réplica
única** — com `k` réplicas o limite efetivo vira `k × max`. F7-S01 registra isso no runbook.

### 11.2 `customRules` do Better Auth — as 13 entradas

`AUTH_RATE_LIMIT_RULES` em `auth.config.ts` (exportada, para ser asseverada em teste):

```ts
{
  // e-mail transacional
  '/forget-password':               { window: 3600, max: 3 },
  '/request-password-reset':        { window: 3600, max: 3 },  // GAP-05 — endpoint NATIVO
  '/send-verification-email':       { window: 3600, max: 3 },
  '/reset-password':                { window: 3600, max: 5 },
  // credenciais
  '/sign-in/email':                 { window: 60,   max: 5 },  // GAP-06
  '/sign-up/email':                 { window: 3600, max: 10 },
  '/change-password':               { window: 3600, max: 10 },
  '/sign-in/social':                { window: 60,   max: 10 },
  // segundo fator
  '/two-factor/verify-totp':        { window: 60,   max: 5 },
  '/two-factor/verify-otp':         { window: 60,   max: 5 },
  '/two-factor/send-otp':           { window: 3600, max: 5 },
  '/two-factor/verify-backup-code': { window: 3600, max: 5 },
  // passkey
  '/sign-in/passkey':               { window: 60,   max: 10 },
}
```

Três armadilhas, todas já custaram tempo:

- **As chaves são relativas ao `basePath`.** `/forget-password`, nunca
  `/api/auth/forget-password`. Escrita errada, a regra **não casa e falha em silêncio** — o limite
  global de 10/min assume o lugar dela e ninguém percebe.
- **Alias não protege o endpoint nativo.** O `forgetPasswordPlugin` expõe `/forget-password`
  reusando `requestPasswordReset.options`, mas o core continua servindo `/request-password-reset`.
  O casamento é por caminho exato: proteger só o alias deixava 600 e-mails/hora pelo caminho nativo
  (GAP-05). **As duas entradas são obrigatórias e têm valores idênticos.**
- **`enabled` continua preso a produção** (D-19), `customRules` inclusive.

Verificação real em `dist/server.js` com `NODE_ENV=production`:

```bash
for i in $(seq 1 6); do curl -s -o /dev/null -w '%{http_code} ' -X POST \
  localhost:3333/api/auth/request-password-reset \
  -H 'content-type: application/json' -d '{"email":"a@b.com"}'; done
# 200 200 200 429 429 429
```

### 11.3 O que o rate limit **não** resolve

Rate limit é por IP. Um atacante distribuído contra **uma conta** passa por ele. A defesa por conta
é o `accountLockout` do 2FA (§5) — e ela só cobre os fatores do 2FA. Uma API que precise de defesa
por conta no `sign-in/email` precisa adicionar isso explicitamente.

---

## 12. Plugins de defesa de borda

Ordem de registro em `src/app.ts` — **é load-bearing**:

```
compiladores Zod → errorHandlerPlugin → helmet → cors → rate-limit → under-pressure
→ swagger → health → auth → rotas de domínio ({ prefix: API_PREFIX })
```

`errorHandlerPlugin` vem primeiro para capturar as falhas de todo o resto.

### `helmet.plugin.ts`

```ts
await fastify.register(helmet, {
  contentSecurityPolicy: env.NODE_ENV === 'production' ? undefined : false,
  crossOriginEmbedderPolicy: false,
});
```

CSP desligado fora de produção porque quebra o Swagger UI. Em produção o CSP padrão vale — e como
o Swagger UI **não é registrado em produção** (§ abaixo), não há mais exceção a abrir.

### `cors.plugin.ts` — D-19

```ts
await fastify.register(cors, {
  origin: env.NODE_ENV === 'production' ? env.CORS_ORIGIN_LIST : true,
  credentials: true,
  methods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
  exposedHeaders: ['set-auth-token'],
});
```

`exposedHeaders: ['set-auth-token']` é obrigatório — sem ele um cliente browser não consegue ler o
token. App Flutter nativo **não envia `Origin`**, então CORS não o afeta; isso protege Swagger UI e
um eventual front web.

### `under-pressure.plugin.ts` — D-26

```ts
await fastify.register(underPressure, {
  maxEventLoopDelay: 1000,
  maxHeapUsedBytes: 512 * 1024 * 1024,
  maxRssBytes: 640 * 1024 * 1024,
  retryAfter: 50,
  healthCheck: env.NODE_ENV === 'test' ? undefined : checkDatabase,
  healthCheckInterval: 5000,
  exposeStatusRoute: false,
});
```

`exposeStatusRoute: false` porque `/health/ready` já é a rota pública de readiness e usa o **mesmo**
`checkDatabase`. Uma checagem, dois consumidores. Em `test` o health check fica desligado: ele
abriria conexão fora do ciclo de vida do container efêmero.

### Swagger UI só fora de produção — D-56 · GAP-17

`@fastify/swagger` (geração do spec) **permanece sempre registrado** — é dele que
`scripts/export-openapi.ts` depende, e `docs/openapi.json` é portão de CI.
`@fastify/swagger-ui` é condicional a `shouldExposeSwaggerUi(env.NODE_ENV)`.

Em produção, `/docs` responde **404** e `/health` continua 200. O contrato segue publicado,
versionado e verificado — sem superfície em produção e sem exceção de CSP. Basic Auth foi
descartado: seria uma segunda forma de autenticação na API para servir documentação que já é
pública no repositório.

**Nome do cookie no OpenAPI — GAP-20.** O Better Auth prefixa o cookie com `__Secure-` sempre que
`baseURL` for https **ou** `NODE_ENV=production` (`dist/cookies/index.mjs:23,275`). O
`securityScheme` deriva do mesmo predicado (`sessionCookieName(nodeEnv, baseUrl)`), para não
documentar um cookie que não existe.

---

## 13. Logging seguro

Repositório público + API pública. Um `request.log.error` num erro de auth despeja
`Authorization: Bearer <token>` no stdout do provedor de hospedagem.

```ts
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
}
```

- `pino-pretty` **só** em `development`; JSON puro em test e production (**D-18**).
- `LOG_LEVEL` vem do env: `info` em prod, `debug` em dev, `silent` em test.
- **`console.*` é erro de lint** em `src/**`; logue por `request.log.*` / `fastify.log.*`.
- **`logger: { level: 'error' }` no Better Auth** (GAP-23): o default despeja e-mails de usuário em
  stdout.
- **Um `pino()` novo em `src/**` fora do `buildApp()` é achado de auditoria** (D-57). Quem precisa
  logar recebe o logger por injeção.
- **`redact` não enxerga query string.** Um token em `?token=…` passa inteiro. Por isso a regra da
  §7.2 é sobre **não logar a URL**, não sobre redigi-la.

---

## 14. Variáveis de ambiente

`src/config/env.ts` — Zod 4, validado uma vez no import. Falha imprime as issues e chama
`process.exit(1)` **antes** de o servidor subir. **Nenhum arquivo fora dele lê `process.env`** —
isso é regra de lint.

### Núcleo

| Variável             | Tipo Zod                                                         | Default                 | Obrigatória |
| -------------------- | ---------------------------------------------------------------- | ----------------------- | ----------- |
| `NODE_ENV`           | `enum(['development','test','production'])`                      | `development`           | não         |
| `PORT`               | `coerce.number().int().positive()`                               | `3333`                  | não         |
| `HOST`               | `string()`                                                       | `0.0.0.0`               | não         |
| `DATABASE_URL`       | `url()`                                                          | —                       | **sim**     |
| `BETTER_AUTH_SECRET` | `string().min(32)`                                               | —                       | **sim**     |
| `BETTER_AUTH_URL`    | `url()`                                                          | `http://localhost:3333` | não         |
| `CORS_ORIGIN`        | `string()` (CSV)                                                 | `""`                    | não         |
| `LOG_LEVEL`          | `enum(['fatal','error','warn','info','debug','trace','silent'])` | `info`                  | não         |

### Rate limit e topologia de rede

| Variável               | Tipo Zod                           | Default    | Obrigatória           |
| ---------------------- | ---------------------------------- | ---------- | --------------------- |
| `RATE_LIMIT_MAX`       | `coerce.number().int().positive()` | `100`      | não                   |
| `RATE_LIMIT_WINDOW`    | `string()`                         | `1 minute` | não                   |
| `RATE_LIMIT_REDIS_URL` | `url().optional()`                 | —          | não (réplica única)   |
| `TRUST_PROXY_HOPS`     | `coerce.number().int().min(0)`     | `0`        | **sim em production** |
| `TRUSTED_PROXIES`      | `string()` (CSV de CIDRs)          | `""`       | **sim em production** |

### OAuth, e-mail e deep link

| Variável                 | Tipo Zod                                | Default                                 | Obrigatória           |
| ------------------------ | --------------------------------------- | --------------------------------------- | --------------------- |
| `GOOGLE_CLIENT_ID`       | `string().min(1).optional()`            | —                                       | **par**               |
| `GOOGLE_CLIENT_SECRET`   | `string().min(1).optional()`            | —                                       | **par**               |
| `GITHUB_CLIENT_ID`       | `string().min(1).optional()`            | —                                       | **par**               |
| `GITHUB_CLIENT_SECRET`   | `string().min(1).optional()`            | —                                       | **par**               |
| `FACEBOOK_CLIENT_ID`     | `string().min(1).optional()`            | —                                       | **par**               |
| `FACEBOOK_CLIENT_SECRET` | `string().min(1).optional()`            | —                                       | **par**               |
| `RESEND_API_KEY`         | `string().startsWith('re_').optional()` | —                                       | **sim em production** |
| `EMAIL_FROM`             | `string().min(1)`                       | `Cardoso Sound <onboarding@resend.dev>` | não                   |
| `MOBILE_DEEP_LINK`       | regex `^[a-z][a-z0-9+.-]*:\/\/[^*\s]*$` | —                                       | não                   |

### Derivados exportados

`CORS_ORIGIN_LIST`, `TRUSTED_PROXY_LIST` (CSV → split, trim, sem vazios) e `SOCIAL_PROVIDERS`
(só provedores com o par completo). Mais os atalhos `isProduction`, `isTest`, `isDevelopment`.

### Regras de falha fechada

Tudo abaixo roda no mesmo `superRefine` e derruba o boot:

1. **"Par" significa par.** Só `CLIENT_ID` sem `CLIENT_SECRET` é erro, não provedor meio-configurado.
2. **`RESEND_API_KEY` ausente em production** derruba. Fora de production, ausente é legítimo: cai
   no transporte de memória (§7.1).
3. **`TRUST_PROXY_HOPS < 1` ou `TRUSTED_PROXIES` vazio em production** derrubam (§10.1).
4. **Coringa em `CORS_ORIGIN` em production** derruba: cada item é validado contra
   `^https?://[^*\s]+$` (GAP-18). `*` com `credentials: true` é a combinação que anula CORS.
5. **`MOBILE_DEEP_LINK` com `*` ou espaço** é rejeitado pelo regex **em qualquer ambiente** — ele
   entra em `trustedOrigins`, que é o que sustenta a proteção contra open redirect. Vazio = só o
   fluxo `idToken` funciona no app.
6. **`BETTER_AUTH_SECRET` com menos de 32 chars** derruba em qualquer ambiente.

### Segredos

`.env` está no `.gitignore`; `.env.example` é commitado, documentado e **sem valores reais**. Em
produção vivem em Railway Variables e GitHub Secrets. Nunca no repo, nunca em `mcp_config.json`,
nunca em fixture de teste. **Nem no CI**: o `ci.yml` gera o `BETTER_AUTH_SECRET` efêmero com
`openssl rand -base64 32` em vez de carregar um literal com forma de segredo (GAP-21).

`EMAIL_FROM` com o domínio padrão do Resend só entrega ao dono da conta. Produção exige domínio
verificado (SPF + DKIM).

---

## 15. Modelo de dados de autenticação

Estende a spec `02`. Toda alteração passa por `pnpm db:generate` → revisão do SQL → `pnpm db:migrate`.
`pnpm db:push` é proibido em PR, CI e produção — e não foi executado em nenhuma das migrações abaixo.

| Migração | Sprint | Conteúdo                                  |
| -------- | ------ | ----------------------------------------- |
| `0002`   | F5-S04 | Índices e unicidade do schema Better Auth |
| `0003`   | F5-S05 | `two_factor` + `user.two_factor_enabled`  |
| `0004`   | F5-S06 | `passkey`                                 |
| `0005`   | F5-S07 | `rate_limit`                              |

### 15.1 Índices e unicidade — `0002` · GAP-16, GAP-19

```sql
CREATE INDEX "account_user_id_idx"  ON "account"  USING btree ("user_id");
CREATE UNIQUE INDEX "account_provider_account_unique" ON "account" USING btree ("provider_id","account_id");
CREATE INDEX "session_user_id_idx"  ON "session"  USING btree ("user_id");
CREATE INDEX "verification_identifier_idx" ON "verification" USING btree ("identifier");
```

Os três índices simples existem porque o expurgo de conta (`DELETE /api/v1/me`) e a revogação em
cascata do reset de senha (D-52) faziam `Seq Scan`; e `verification` é consultada por `identifier`
em todo fluxo de verificação e reset.

`UNIQUE(provider_id, account_id)` fecha a corrida de callback OAuth (§4.7).

### 15.2 `two_factor` — `0003`

Colunas: `id` (text PK), `secret`, `backup_codes`, `user_id` → `user(id)` **`ON DELETE CASCADE`**,
`failed_attempts` (int, default 0), `last_attempt`, `created_at`, `updated_at`. Mais
`user.two_factor_enabled boolean NOT NULL DEFAULT false` — flag consultada no `sign-in` sem JOIN.

`failed_attempts` e `last_attempt` são o que sustenta o `accountLockout` (§5).

### 15.3 `passkey` — `0004` · D-54

Colunas: `id`, `name`, `public_key`, `user_id` → `user(id)` **`ON DELETE CASCADE`**,
**`credential_id` com `UNIQUE`**, `counter`, `device_type`, `backed_up`, `transports`, `created_at`,
`aaguid`. Índice `passkey_user_id_idx`.

- Sem `UNIQUE(credential_id)`, o mesmo credential WebAuthn pode ser registrado sob dois usuários e a
  resolução de identidade no `sign-in` fica ambígua.
- `counter` é o contador monotônico do autenticador — é o que permite detectar clone.
- `aaguid` identifica o modelo do autenticador e é consumido por `registration.afterVerification`.

### 15.4 `rate_limit` — `0005` · D-55

```sql
CREATE TABLE "rate_limit" (
  "id" text PRIMARY KEY NOT NULL,
  "key" text NOT NULL,
  "count" integer NOT NULL,
  "last_request" bigint NOT NULL,
  CONSTRAINT "rate_limit_key_unique" UNIQUE("key")
);
```

Exigida por `rateLimit.storage: 'database'`. A forma das colunas é ditada pelo adapter: **rode
`pnpm dlx @better-auth/cli@latest generate` e use o que ele produzir**, não o que você imagina, e
asseverar a conformidade com `getAuthTables(auth.options)` num teste de integração. `last_request`
é `bigint` mapeado com `{ mode: 'number' }` no Drizzle.

### 15.5 A regra que vale para as três tabelas novas

**`onDelete: 'cascade'` no `userId` é obrigatório.** Sem ele, `DELETE /api/v1/me` falha com violação
de FK no primeiro usuário que tiver 2FA ou passkey — e o teste que prova isso é o E2E de ciclo de
vida de conta.

---

## 16. O que precisa de teste

Não há meta de cobertura percentual (D-27). O que bloqueia merge é a lista nomeada. Por área:

**Configuração provável sem subir produção (unitário, sem banco):**
`buildRateLimitOptions({NODE_ENV:'production'}).global === true` · `buildTrustProxy` devolve `false`
com hops 0 e predicado que rejeita peer fora do CIDR · `resolveClientIp` ignora XFF de origem não
confiável e varre da direita para a esquerda · `resolveRequestId` trunca em 64 e rejeita alfabeto
inválido · `shouldExposeSwaggerUi` · `sessionCookieName` com e sem `__Secure-` ·
`shouldResolveSession` · `toRfc7807` (JSON, não-JSON, `status < 400`) · `extractSessionToken`
(bearer, cookie simples, cookie `__Secure-`, cookie malformado) · `isWeakPassword` · escaping dos
templates · `env` com cada uma das seis regras de falha fechada da §14 · as **13** chaves de
`AUTH_RATE_LIMIT_RULES` · `rpID` derivado em dev e em prod.

**Fluxo real (integração, com Testcontainers):** sign-up idêntico para e-mail novo e existente ·
403 antes de verificar · bearer anterior ao reset responde 401 depois dele · `change-password`
incluindo `revokeOtherSessions` · ciclo completo de 2FA (enable, verify-totp, challenge no sign-in,
backup code consumido, regeneração, OTP por e-mail, disable, lockout após 5 falhas) · passkey
(rotas protegidas sem sessão, listagem isolada, delete/update cruzado = 404, cascade no
`DELETE /me`) · vínculo de contas (R46–R48, incluindo `LINKING_NOT_ALLOWED` do Facebook e
`SESSION_NOT_FRESH`) · presença dos índices da §15.1 no banco · conformidade de schema via
`getAuthTables`.

**Helper E2E — quatro passos, todos offline** (é o que `requireEmailVerification: true` exige):

```
POST /api/auth/sign-up/email
  → ler o outbox do transporte de memória, extrair o href do último e-mail
  → GET <href>                  (verify-email)
  → POST /api/auth/sign-in/email
  → devolver o bearer de `set-auth-token`
```

**Um teste que afirma o comportamento antigo é regressão, não cobertura.** Quando D-51/D-52 mudaram
o contrato, os casos T6, T8 e T20 de F3 foram reescritos no mesmo PR.

Duas exigências de ambiente que não são óbvias: rotas de 2FA chamadas por cookie precisam de
`origin: env.BETTER_AUTH_URL`; envelhecer sessão para provar step-up se faz com
`UPDATE session SET created_at = now() - interval '25 hours'` **e requisição por Bearer** (o
`cookieCache` mascararia a mudança).

---

## 17. Checklist de auditoria — portão de F7-S02

Cada item precisa de evidência; item sem evidência conta como falha.

**Segredos e superfície**

- [ ] `.env` fora do git em todo o histórico; nenhum segredo em `git log -p`
- [ ] Nenhum `*_CLIENT_SECRET`, `RESEND_API_KEY` ou token real no repositório; `mcp_config.json` só com placeholders
- [ ] `.github/workflows/ci.yml` sem literal com forma de segredo (GAP-21)
- [ ] `/docs` responde 404 com `NODE_ENV=production`; `docs/openapi.json` continua íntegro (GAP-17)
- [ ] `helmet` ativo; headers conferidos com `curl -I`
- [ ] `pnpm audit --prod` sem vulnerabilidade alta ou crítica

**Identidade e autorização**

- [ ] Toda rota protegida tem `onRequest: [fastify.requireAuth]` — conferir uma a uma
- [ ] Todo acesso a recurso de usuário filtra por `user_id` **na query SQL**
- [ ] Recurso de outro usuário responde **404**, nunca 403 (D-31)
- [ ] `/me` não expõe `password`, `emailVerified`, `session` nem `account`
- [ ] `trustedProviders` só com provedor que verifica e-mail; `callbackURL` validado contra `trustedOrigins`

**Borda e rate limit**

- [ ] `buildRateLimitOptions({ NODE_ENV: 'production' }).global === true` (GAP-01)
- [ ] `TRUST_PROXY_HOPS` e `TRUSTED_PROXIES` derrubam o boot se ausentes em produção (GAP-04/10)
- [ ] `trustProxy` é predicado — nunca `true`, nunca número (D-60)
- [ ] `resolveClientIp` ignora `X-Forwarded-For` de origem não confiável (GAP-04)
- [ ] A ponte sobrescreve `x-forwarded-for` com `request.ip` nos **dois** call sites (R-01)
- [ ] `customRules` contém **as 13 entradas** da §11.2, `/request-password-reset` inclusive (GAP-05/06)
- [ ] `MOBILE_DEEP_LINK` e `CORS_ORIGIN` rejeitam `*` em produção (GAP-18)

**Ciclo de vida da conta**

- [ ] `POST /sign-up/email` responde **idêntico** para e-mail novo e existente (GAP-08)
- [ ] `POST /sign-in/email` responde 403 antes da verificação de e-mail (GAP-14)
- [ ] Bearer anterior ao reset de senha responde 401 depois dele (GAP-07)
- [ ] `forget-password` e `request-password-reset` respondem **igual** para e-mail existente e inexistente
- [ ] Senha em lista de vazadas é recusada com mensagem genérica (GAP-25)
- [ ] `/change-password` coberto por teste, incluindo revogação de sessão (GAP-24)

**Segundo fator e passkey**

- [ ] `twoFactor` registrado **antes** de `bearer` — `sign-in` com 2FA ativo não emite `set-auth-token` (§2.2)
- [ ] 2FA: TOTP, OTP e backup codes com casos verdes; bloqueio de conta observado (GAP-02)
- [ ] Passkey: registro e autenticação verificados manualmente em navegador real (GAP-03)
- [ ] `UNIQUE(credential_id)` e coluna `aaguid` em `passkey` (GAP-09)
- [ ] `onDelete: 'cascade'` em `two_factor.user_id` e `passkey.user_id`; `DELETE /me` verde (GAP-09)

**Observabilidade e contrato**

- [ ] 500 nunca devolve `stack` nem `err.message` cru
- [ ] `redact` do Pino cobre os seis caminhos de D-22
- [ ] Nenhum `pino(` em `src/**` fora de `buildApp()` (GAP-15/D-57)
- [ ] Nenhum token de verificação, reset ou OTP em log, em nenhum transporte (GAP-15)
- [ ] Logger do Better Auth em `level: 'error'` — sem e-mail em stdout (GAP-23)
- [ ] `templates.ts` escapa toda interpolação, `href` inclusive (GAP-22)
- [ ] `session.cookieCache` ativo; o hook de sessão não consulta o banco em `/health` (GAP-13)
- [ ] Erro de `/api/auth/*` traz `code`, `message` **e** o envelope RFC 7807 (GAP-26)
- [ ] `securityScheme` do cookie usa o prefixo `__Secure-` quando aplicável (GAP-20)
- [ ] Índices da §15.1 presentes na migração e no banco (GAP-19)
- [ ] `UNIQUE(provider_id, account_id)` em `account` (GAP-16)
- [ ] `resolveRequestId` trunca em 64 e rejeita alfabeto inválido (GAP-27)
- [ ] Nenhum `any` nem `@ts-expect-error` sem justificativa

---

## 18. Rastreabilidade — GAP × sprint × seção

| GAP    | Sev.    | Sprint     | Seção desta spec    |
| ------ | ------- | ---------- | ------------------- |
| GAP-01 | CRÍTICO | F5-S02     | §11.1               |
| GAP-02 | ALTO    | F5-S05     | §5                  |
| GAP-03 | ALTO    | F5-S06     | §6                  |
| GAP-04 | ALTO    | F5-S02/S04 | §10.1, §10.3, §8.2  |
| GAP-05 | ALTO    | F5-S02     | §11.2, §2.3         |
| GAP-06 | ALTO    | F5-S02     | §11.2               |
| GAP-07 | ALTO    | F5-S03     | §3.3                |
| GAP-08 | ALTO    | F5-S03     | §3.1, §3.2          |
| GAP-09 | MÉDIO   | F5-S05/S06 | §15.2, §15.3, §15.5 |
| GAP-10 | MÉDIO   | F5-S02     | §10.1, §10.2        |
| GAP-11 | MÉDIO   | F5-S07     | §11.1               |
| GAP-12 | MÉDIO   | F5-S07     | §11.1, §15.4        |
| GAP-13 | MÉDIO   | F5-S04     | §8.3                |
| GAP-14 | MÉDIO   | F5-S03     | §3.1, §3.2          |
| GAP-15 | MÉDIO   | F5-S03     | §7.2, §13           |
| GAP-16 | MÉDIO   | F5-S04     | §15.1, §4.7         |
| GAP-17 | MÉDIO   | F5-S02     | §12                 |
| GAP-18 | MÉDIO   | F5-S07     | §14                 |
| GAP-19 | MÉDIO   | F5-S04     | §15.1               |
| GAP-20 | BAIXO   | F5-S04     | §12                 |
| GAP-21 | BAIXO   | F5-S02     | §14                 |
| GAP-22 | BAIXO   | F5-S03     | §7.4                |
| GAP-23 | BAIXO   | F5-S04     | §13                 |
| GAP-24 | BAIXO   | F5-S03     | §16                 |
| GAP-25 | BAIXO   | F5-S03     | §3.4                |
| GAP-26 | BAIXO   | F5-S04     | §8.4                |
| GAP-27 | BAIXO   | F5-S02     | §10.4               |
| R-01   | ALTO    | F5-S04     | §8.2                |

**27 GAPs + 1 achado de revisão · 7 sprints · nenhum órfão.**

---

## 19. Catálogo de armadilhas medidas

> Esta é a seção para levar a outra API. Cada item tem **sintoma → causa → regra**, e todos foram
> medidos neste projeto, não deduzidos.

### 19.1 `bearer()` antes de `twoFactor()` desliga o segundo fator

**Sintoma:** usuário com 2FA ativo faz `sign-in/email` e recebe `set-auth-token` válido.
**Causa:** o hook `after` do `bearer` lê a sessão temporária do desafio antes de o `twoFactor`
removê-la.
**Regra:** plugin que materializa credencial vem por último. Teste isso explicitamente — não é
visível em code review.

### 19.2 `trustProxy` numérico faz _fail closed_ silencioso

**Sintoma:** todo cliente vira o IP do balanceador; um bucket de rate limit para o mundo inteiro.
**Causa:** `fastify@5.12.1` (`lib/request.js:51-55`) devolve `function(){return false}` para
`trustProxy` numérico, de propósito.
**Regra:** predicado que valida **profundidade E peer**. Nunca `true`, nunca número.

### 19.3 A ponte Fetch não tem socket — o XFF chega cru

**Sintoma:** rate limit de `/api/auth/*` nunca dispara; `session.ip_address` guarda `6.6.6.6`.
**Causa:** converter `FastifyRequest` em `Request` da Fetch API leva **só headers**. O IP validado
pelo Fastify fica para trás.
**Regra:** sobrescreva `x-forwarded-for` com `request.ip` (`set()`, nunca `append()`) em **todos**
os call sites da ponte. Mantenha `advanced.ipAddress.trustedProxies` como segunda barreira.

### 19.4 Regra de rate limit com caminho errado falha em silêncio

**Sintoma:** a rota continua aceitando o volume do limite global.
**Causa:** as chaves de `customRules` são relativas ao `basePath`; `/api/auth/forget-password` não
casa com nada e não avisa.
**Regra:** chave relativa, sempre. E asseverar o dicionário inteiro em teste, por contagem e
conteúdo.

### 19.5 Alias de endpoint não protege o endpoint nativo

**Sintoma:** 600 e-mails/hora por um caminho que ninguém lembrava que existia.
**Causa:** criar `/forget-password` reusando `requestPasswordReset.options` **não remove**
`/request-password-reset` do core.
**Regra:** todo alias exige entrada de rate limit própria, com valores idênticos. E audite a lista
real de rotas montadas pela coringa, não a lista que está no seu contrato.

### 19.6 `keyGenerator` que lê `req.user` é código morto

**Sintoma:** nenhum. É o pior tipo: parece que existe uma cota por usuário.
**Causa:** o hook do rate limit roda antes do hook que popula `request.user`. Um `as unknown as`
esconde isso do type checker.
**Regra:** a chave só pode usar o que existe em `onRequest` sem tocar no banco — IP e headers. E em
rota de autenticação, **só IP**: chavear por identidade dá N × cota a quem tem N contas.

### 19.7 `requireEmailVerification: false` custa dois vetores, não um

**Sintoma:** sign-up é oráculo de enumeração **e** permite squatting do e-mail de terceiros.
**Causa:** a resposta genérica de duplicidade da lib é condicionada a
`requireEmailVerification || !autoSignIn`.
**Regra:** verificação obrigatória desde o primeiro dia. O custo é um helper de teste de quatro
passos, feito uma vez.

### 19.8 Reset de senha que não revoga sessão não recupera a conta

**Sintoma:** bearer roubado continua funcionando dias depois da troca de senha.
**Causa:** default da lib. **Registrar o comportamento num teste não é aceitá-lo** — foi
exatamente o que D-46 (e) fez, e o teste afirmava o vazamento como esperado.
**Regra:** `revokeSessionsOnPasswordReset: true`. E cuidado: `revokeOtherSessions` **não** é opção
de `emailAndPassword` — escrever ali é no-op silencioso.

### 19.9 O `redact` do Pino não enxerga query string

**Sintoma:** token de reset, válido por uma hora, inteiro no stdout.
**Causa:** o link de verificação carrega o token em `?token=`; `redact` opera sobre caminhos de
objeto, não sobre o conteúdo de uma string.
**Regra:** não logue a URL. Em `development`, tudo bem — é como se pega o token sem caixa de
entrada. Em test e production, nunca, e nunca pelo transporte real.

### 19.10 Um segundo `pino()` escapa de toda a política de log

**Sintoma:** o mailer logava destinatário e link com zero `redact`.
**Causa:** `new pino()` num módulo de infraestrutura, fora do `buildApp()`.
**Regra:** um logger por aplicação, injetado. `pino(` em `src/**` fora da app factory é achado de
auditoria, verificável por `grep`.

### 19.11 `content-length` repassado trunca a resposta transformada

**Sintoma:** corpo cortado ou cliente em timeout, só quando o envelope de erro é aplicado.
**Causa:** o header vem do payload **pré-transformação**.
**Regra:** exclua `content-length` (e `set-cookie`) do repasse; deixe o Fastify recalcular.

### 19.12 `getSetCookie()` existe porque `Set-Cookie` é múltiplo

**Sintoma:** cookie de sessão perdido quando a lib emite mais de um.
**Causa:** copiar headers em loop com `reply.header()` sobrescreve.
**Regra:** `res.headers.getSetCookie()` → um `reply.header('set-cookie', array)`.

### 19.13 O hook de sessão roda em `/health` se você deixar

**Sintoma:** uma consulta a `session` por probe, amplificada por qualquer flood.
**Causa:** hook `onRequest` global sem predicado.
**Regra:** curto-circuito explícito em rotas de sonda e na própria coringa de auth. Meça com
`vi.spyOn(pool, 'query')` — é o único jeito de provar "zero queries".

### 19.14 `cookieCache` acelera e atrasa revogação

**Sintoma:** sessão revogada continua aceita por até `maxAge`.
**Causa:** é o que o cache é.
**Regra:** aceite conscientemente e mantenha o `maxAge` curto (5 min). Teste de step-up e de
revogação usa **Bearer**, que consulta o banco.

### 19.15 Swagger UI em produção com CSP padrão: público **e** quebrado

**Sintoma:** `/docs` acessível, inventário completo de rotas exposto, interface não carrega.
**Causa:** registro incondicional do `swagger-ui` + CSP do helmet bloqueando script inline.
**Regra:** registre só o gerador do spec em produção; a UI é condicional. Não abra exceção de CSP
para servir documentação que já está versionada no repositório.

### 19.16 Provedor social sem credencial derruba o boot com 500 opaco

**Sintoma:** `clientId: undefined` vira 500 na primeira tentativa de login social.
**Causa:** registrar o provedor incondicionalmente.
**Regra:** derive a lista de provedores do par de credenciais presente, e trate meia credencial
como erro de env.

### 19.17 `allowDifferentEmails` parece maior do que é — e `trustedProviders` parece menor

**Sintoma:** medo da chave errada. Times bloqueiam `allowDifferentEmails` (que não altera
identidade) e liberam `trustedProviders` (que permite sequestro por e-mail não verificado).
**Regra:** leia o runtime antes de decidir. `allowDifferentEmails` é lido só em `/link-social` e no
callback com `state.link`; `trustedProviders` desliga a exigência de `emailVerified`. E confirme
que o provedor **de fato** devolve `emailVerified: true` — o Facebook, neste stack, nunca devolve.

### 19.18 Derivar `rpID` de `BETTER_AUTH_URL` torna a URL imutável

**Sintoma:** trocar o domínio depois do lançamento invalida **todas** as passkeys registradas.
**Causa:** `rpID` é parte da identidade da credencial no autenticador. Não há migração.
**Regra:** derivar continua certo (elimina a divergência dev/prod), mas **decida o domínio antes do
primeiro deploy**. Registre a imutabilidade onde o time vai ler.

### 19.19 Rate limit em memória com `k` réplicas é `k × max`

**Sintoma:** limite efetivo silenciosamente multiplicado ao escalar.
**Causa:** contador local por processo.
**Regra:** armazenamento compartilhado (banco para o limitador da lib, Redis para o do framework) —
e, enquanto não houver, **registre no runbook que a aplicação roda com réplica única**. Se a URL do
Redis estiver configurada mas o driver não instalado, **derrube o boot**: rodar em memória achando
que está distribuído é pior que não ter Redis.

### 19.20 Testes de auth quebram por detalhes de protocolo, não por lógica

Quatro que custaram tempo: mutação por cookie exige header `origin`; `POST` com
`content-type: application/json` e corpo vazio precisa de `payload: {}`; ativar 2FA **renova** a
sessão (capture o token novo); envelhecer sessão exige `UPDATE` no banco **e** requisição por
Bearer para furar o `cookieCache`.
