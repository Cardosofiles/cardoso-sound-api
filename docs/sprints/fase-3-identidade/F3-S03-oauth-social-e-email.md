# F3-S03 — OAuth Social e E-mail Transacional

|                |                                                            |
| -------------- | ---------------------------------------------------------- |
| **Fase**       | F3 — Identidade · **último sprint da fase**                |
| **Branch**     | `feature/f3s03-oauth-social-e-email`                       |
| **Depende de** | F3-S02                                                     |
| **Entrega**    | R26–R31 · Google, GitHub, Facebook · Resend · tag `v0.3.0` |

> **Dois recursos num sprint só, de propósito.** OAuth social e e-mail transacional
> tocam o **mesmo arquivo** (`auth.config.ts`), a **mesma** função de env e a **mesma**
> checagem de schema do Better Auth. Separados, seriam duas rodadas de `env.ts`, dois PRs
> mexendo no mesmo objeto de config e dois `generate` do CLI. Juntos, é um PR coerente.
>
> **Em compensação, este sprint depende de terceiros.** Sem as credenciais da §5.1 ele
> não roda — e a §5.1 é trabalho humano, não do agente.

---

## 0. Pré-requisitos humanos — confira ANTES de abrir a sessão

O agente **não consegue** obter nada desta lista. Se faltar qualquer item, ou você
providencia, ou remove o provedor correspondente do escopo deste sprint.

| Item                                                 | Onde se obtém                                          |
| ---------------------------------------------------- | ------------------------------------------------------ |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET`          | Google Cloud Console → APIs & Services → Credentials   |
| `GITHUB_CLIENT_ID` / `GITHUB_CLIENT_SECRET`          | GitHub → Settings → Developer settings → OAuth Apps    |
| `FACEBOOK_CLIENT_ID` / `FACEBOOK_CLIENT_SECRET`      | Meta for Developers → App → Facebook Login             |
| **App Review da Meta** liberando a permissão `email` | Meta for Developers → App Review — **pode levar dias** |
| `RESEND_API_KEY`                                     | resend.com → API Keys                                  |
| **Domínio verificado no Resend** (SPF + DKIM no DNS) | resend.com → Domains                                   |

Redirect URIs a cadastrar em cada provedor (as três, em cada um):

```
http://localhost:3333/api/auth/callback/<provider>
https://<dominio-railway>/api/auth/callback/<provider>
```

> **Facebook sem App Review não devolve e-mail**, e o Better Auth precisa de e-mail para
> criar o usuário: o sign-in falha em runtime, não em compilação. Se o review não saiu,
> **entregue Google e GitHub e deixe o Facebook para um sprint corretivo** — está previsto
> na §5.5. Isso é preferível a segurar o sprint inteiro.
>
> **Resend sem domínio verificado** só envia de `onboarding@resend.dev` e **só para o
> e-mail dono da conta**. Dá para desenvolver assim; não dá para ir a produção.

---

## 1. Prompt de abertura

```
Leia .agents/memory/PROGRESS.md e .agents/memory/DECISIONS.md para se contextualizar.
Leia também .agents/memory/F3-S01.md — você vai editar o auth.config.ts que ele criou,
e precisa saber por que a rota coringa /api/auth/* fica fora da validação Zod.
Leia .agents/memory/F1-S03.md — você vai estender src/config/env.ts, que é entrega dele.

Sprint alvo: docs/sprints/fase-3-identidade/F3-S03-oauth-social-e-email.md
Specs obrigatórias: docs/specs/04-autenticacao-e-seguranca.md (§1, §1.1, §1.2, §6),
                    docs/specs/03-contrato-da-api.md (§5)

Use o MCP context7 para confirmar, na versão instalada do better-auth, a assinatura de
socialProviders, emailVerification, sendResetPassword e rateLimit.customRules ANTES de
codar. Confirme também a API do pacote resend na major que você for instalar.

Antes de qualquer código, rode a §5.1 e me diga quais credenciais existem no .env.
Se faltar alguma, PARE e reporte — não invente placeholder que passe na validação.

Siga o protocolo de docs/specs/07-protocolo-dos-agentes.md:
entre em modo de planejamento, apresente o plano COMPLETO da sprint e
AGUARDE minha autorização explícita antes de escrever qualquer código.

Não toque em nenhum arquivo fora do blast radius declarado no sprint.
```

---

## 2. Objetivo

Três coisas, nesta ordem de importância:

1. **Entrar com Google, GitHub e Facebook** — sem senha, com a conta social ligada ao
   mesmo usuário quando o e-mail bate e o provedor garante que o e-mail é verificado.
2. **Verificação de conta por e-mail** — link enviado no sign-up, `user.emailVerified`
   vira `true` ao clicar. **Não bloqueia o login** (§5.6, decisão registrada).
3. **Recuperação de senha** — `forget-password` → e-mail → `reset-password`, sem
   vazar quais e-mails existem na base.

Tudo continua saindo de **um único** `auth.config.ts` (spec `04` §1). Este sprint **não
escreve rota** — as seis rotas novas são montadas pela lib na coringa `/api/auth/*` que
o F3-S01 já entregou.

**Não faz parte deste sprint:** mudar o DTO `Me` (spec `03` §3 continua com 5 chaves — o
cliente lê `emailVerified` do `GET /api/auth/get-session`, R12) · trocar senha logado ·
2FA · magic link · convite por e-mail.

---

## 3. Contratos esperados

### Rotas (montadas pela lib, não por você) — spec `03` §5

| #   | Rota                                     |
| --- | ---------------------------------------- |
| R26 | `POST /api/auth/sign-in/social`          |
| R27 | `GET /api/auth/callback/:providerId`     |
| R28 | `POST /api/auth/send-verification-email` |
| R29 | `GET /api/auth/verify-email`             |
| R30 | `POST /api/auth/forget-password`         |
| R31 | `POST /api/auth/reset-password`          |

### `src/modules/auth/auth.config.ts` — **estende**, não reescreve

O objeto da spec `04` §1 permanece **inteiro**. Somam-se a ele quatro chaves:
`socialProviders`, `emailVerification`, `account.accountLinking` e
`rateLimit.customRules`, mais dois callbacks dentro de `emailAndPassword`. Forma
normativa: spec `04` §1.1 e §1.2.

### `src/shared/email/mailer.ts`

```ts
export interface SentEmail {
  to: string;
  subject: string;
  html: string;
  sentAt: Date;
}

export interface Mailer {
  send(input: { to: string; subject: string; html: string }): Promise<void>;
}

export const mailer: Mailer; // resolvido uma vez, na importação
export const outbox: readonly SentEmail[]; // preenchido SÓ pelo transporte de memória
export function clearOutbox(): void;
```

Dois transportes, escolhidos por `env.RESEND_API_KEY` estar presente ou não:

- **`resend`** — chave presente. Envia de verdade.
- **`memory`** — chave ausente. Empilha em `outbox` e loga. É o transporte de `test` e o
  de `development` sem conta no Resend.

`send` **nunca rejeita**. Falha de provedor é logada como `warn` e engolida — ver
armadilha 3.

### `src/shared/email/templates.ts`

```ts
export function verificationEmail(input: { name: string; url: string }): {
  subject: string;
  html: string;
};
export function resetPasswordEmail(input: { name: string; url: string }): {
  subject: string;
  html: string;
};
```

HTML inline, sem dependência de template engine, sem imagem externa.

### `src/config/env.ts` — variáveis novas

Tabela normativa completa: spec `04` §6. Derivados exportados:

```ts
export const SOCIAL_PROVIDERS: ReadonlyArray<'google' | 'github' | 'facebook'>;
// só os provedores cujo par CLIENT_ID + CLIENT_SECRET está presente
```

---

## 4. Blast radius

### Criar

```
src/shared/email/mailer.ts
src/shared/email/templates.ts
tests/unit/shared/email/mailer.test.ts
tests/unit/shared/email/templates.test.ts
tests/integration/auth-email.test.ts
tests/integration/auth-social.test.ts
```

### Editar

```
src/modules/auth/auth.config.ts     # estende; não reescreve o que F3-S01 entregou
src/config/env.ts                   # variáveis da spec 04 §6 + SOCIAL_PROVIDERS
.env.example                        # placeholders, NUNCA valor real
package.json                        # + resend
.agents/memory/DECISIONS.md
.agents/memory/PROGRESS.md
.agents/memory/F3-S03.md
```

**Não toque em:** `src/modules/auth/auth.plugin.ts` (a ponte está pronta e testada — as
rotas novas passam por ela sem alteração) · `src/modules/users/**` · `src/db/**` ·
`src/plugins/**` · qualquer outro módulo · `drizzle/**`.

> **Nenhuma migração nova é esperada.** As tabelas `account` (com `access_token`,
> `refresh_token`, `id_token`, `scope`) e `verification` já existem desde F2-S01 e são
> exatamente o que estes fluxos usam. Se a §5.2 acusar divergência, **pare e reporte** —
> vira sprint corretivo, não se resolve aqui.

---

## 5. Passo a passo

### 5.1 Inventário de credenciais — antes de tudo

```bash
grep -c '^GOOGLE_CLIENT_ID=.\+'   .env
grep -c '^GITHUB_CLIENT_ID=.\+'   .env
grep -c '^FACEBOOK_CLIENT_ID=.\+' .env
grep -c '^RESEND_API_KEY=re_'     .env
```

Reporte o resultado **antes de escrever código**. Provedor sem credencial não entra em
`socialProviders` — e é isso que a §5.5 resolve sem `if` espalhado.

### 5.2 Reconfirmar o schema

```bash
pnpm dlx @better-auth/cli@latest generate --config src/modules/auth/auth.config.ts
```

Rode **antes** e **depois** de editar a config. `socialProviders` e `emailVerification`
não devem acrescentar coluna nenhuma. **Diferença = pare e reporte.**

### 5.3 `env.ts`

Acrescente as variáveis da spec `04` §6. Três cuidados:

- Todas são **opcionais** no schema base. A obrigatoriedade é condicional:

  ```ts
  .superRefine((v, ctx) => {
    if (v.NODE_ENV !== 'production') return;
    if (!v.RESEND_API_KEY) ctx.addIssue({ code: 'custom', path: ['RESEND_API_KEY'],
      message: 'RESEND_API_KEY is required in production' });
  })
  ```

  Mesmo padrão já usado para `BETTER_AUTH_SECRET` (spec `04` §6). Em `test` e
  `development` a ausência é legítima: cai no transporte de memória.

- `SOCIAL_PROVIDERS` é derivado **no mesmo módulo**, junto de `CORS_ORIGIN_LIST`
  (F1-S03 §5). Não espalhe a lógica.

- `MOBILE_DEEP_LINK` entra em `trustedOrigins` na §5.9. Sem ele, o Flutter não recebe o
  callback — e **com ele mal validado, você abre um open redirect** (armadilha 8).

`.env.example` recebe todas, com placeholder óbvio (`GOOGLE_CLIENT_ID=seu_client_id_aqui`).
**Nenhum valor real** — o repositório é público (spec `04` §6).

### 5.4 `mailer.ts` e `templates.ts`

```ts
const transport: Mailer = env.RESEND_API_KEY
  ? resendMailer(new Resend(env.RESEND_API_KEY))
  : memoryMailer();
```

- O `outbox` do transporte de memória é o que torna a §6 testável sem rede. Ele é
  **inerte** quando o transporte é o Resend: fica vazio, ninguém lê.
- O transporte de memória loga `{ to, subject, url }` em `info` — é assim que você pega
  o link em desenvolvimento. **O transporte Resend nunca loga a URL**: ela contém o token,
  e o `redact` do Pino (spec `04` §5) não enxerga query string.
- `templates.ts` é função pura: entra `{ name, url }`, sai `{ subject, html }`. Sem env
  dentro, sem `Date`, sem I/O — por isso o teste unitário é trivial.

### 5.5 `socialProviders` — registro condicional

```ts
socialProviders: Object.fromEntries(
  SOCIAL_PROVIDERS.map((p) => [p, PROVIDER_CONFIG[p]]),
),
```

Provedor sem credencial simplesmente **não existe** na config. O efeito é o certo:
`POST /sign-in/social` com `provider: 'facebook'` responde 4xx da lib em vez de 500 por
`clientId: undefined`. É o que o T23 prova, e é o que permite entregar o sprint sem o
App Review da Meta.

Escopos mínimos — **não peça mais do que usa**:

| Provedor | Escopo                 | Por quê                                                              |
| -------- | ---------------------- | -------------------------------------------------------------------- |
| Google   | `openid email profile` | padrão da lib; não adicione Drive, Calendar nem nada                 |
| GitHub   | `user:email`           | **obrigatório** — sem ele, e-mail privado volta `null` (armadilha 6) |
| Facebook | `email public_profile` | `email` depende do App Review                                        |

### 5.6 `emailVerification` e reset de senha

```ts
emailAndPassword: {
  enabled: true,
  minPasswordLength: 8,
  autoSignIn: true,
  requireEmailVerification: false,       // ← decisão, ver abaixo
  resetPasswordTokenExpiresIn: 60 * 60,  // 1 h
  sendResetPassword: async ({ user, url }) => { /* mailer.send(resetPasswordEmail(...)) */ },
},
emailVerification: {
  sendOnSignUp: true,
  autoSignInAfterVerification: true,
  expiresIn: 60 * 60 * 24,               // 24 h
  sendVerificationEmail: async ({ user, url }) => { /* mailer.send(verificationEmail(...)) */ },
},
```

**`requireEmailVerification: false` é decisão deste sprint e vai para `DECISIONS.md`.**
O motivo é concreto: `true` faz o `sign-in/email` responder 403 até o clique no link, o
que **quebra `signUpAndGetToken`** — o helper de que F3-S02, F4-S01, F4-S02 e a suíte E2E
inteira dependem (spec `05` §4). Verificar e-mail vira requisito de negócio quando houver
uma feature que exija; hoje não há. O estado fica visível ao cliente em R12.

Se você discordar e quiser exigir verificação, **pare e pergunte** — é mudança de contrato,
não escolha de implementação.

### 5.7 Rate limit específico — o mais importante do sprint

Estas rotas mandam e-mail e testam senha. O limite global de 10/min (spec `04` §1) é
frouxo demais para elas:

```ts
rateLimit: {
  enabled: env.NODE_ENV === 'production',   // D-19, inalterado
  window: 60,
  max: 10,
  customRules: {
    '/forget-password':        { window: 3600, max: 3 },
    '/send-verification-email': { window: 3600, max: 3 },
    '/reset-password':         { window: 3600, max: 5 },
    '/sign-in/social':         { window: 60,   max: 10 },
  },
},
```

3 por hora em `forget-password` é o que impede transformar a sua conta do Resend em
canhão de spam com o e-mail de outra pessoa. `enabled` continua preso a produção (D-19) —
ligado em teste, derruba a suíte, e o T26 existe para provar que está desligado.

### 5.8 `accountLinking` — leia antes de habilitar

```ts
account: {
  accountLinking: {
    enabled: true,
    trustedProviders: ['google', 'github'],
  },
},
```

Ligação automática de contas pelo e-mail só é segura com provedor que **comprovadamente
verifica** o e-mail. Google e GitHub (com `user:email`) verificam. **Facebook não entra
na lista de confiáveis**, mesmo depois do App Review.

O ataque que isso evita: alguém cria conta social com o e-mail da vítima num provedor que
não verifica e-mail e passa a entrar na conta dela. Se ficar em dúvida sobre algum
provedor, **deixe-o fora de `trustedProviders`** — o usuário ainda consegue ligar a conta
manualmente depois de autenticado.

### 5.9 Callback do Flutter e `trustedOrigins`

```ts
trustedOrigins: [...env.CORS_ORIGIN_LIST, env.MOBILE_DEEP_LINK].filter(Boolean),
```

O app nativo tem dois caminhos, e vale documentar os dois em `F3-S03.md`:

- **`idToken`** (recomendado) — o SDK nativo do Google/Facebook faz o login no aparelho e
  o app manda o `idToken` para `POST /sign-in/social`. Não há redirect, não há deep link,
  não há browser. É o fluxo mais simples e o mais confiável no mobile.
- **Redirect + deep link** — `POST /sign-in/social` devolve `{ url }`, o app abre no
  navegador do sistema, o provedor redireciona para `/api/auth/callback/<provider>` e a
  lib devolve o controle para `callbackURL`, que precisa ser o deep link.

`callbackURL` **é validado contra `trustedOrigins`**. Se aceitar qualquer valor, vira
open redirect com token na URL. O T25 prova que uma origem externa é rejeitada.

### 5.10 Registrar a versão da lib

`better-auth` muda rápido (é o motivo do context7 no prompt). Anote em `DECISIONS.md` a
versão exata em que estes callbacks foram validados, junto da major do `resend`.

---

## 6. Casos de teste obrigatórios

### Unit — `tests/unit/shared/email/**`

| #   | Caso                                               | Esperado                                          |
| --- | -------------------------------------------------- | ------------------------------------------------- |
| T1  | Transporte de memória com `RESEND_API_KEY` ausente | `send` empilha 1 item em `outbox`                 |
| T2  | Transporte Resend com chave presente               | `emails.send` chamado com `from`, `to`, `subject` |
| T3  | Provedor rejeita (`throw`) dentro de `send`        | **resolve mesmo assim**; loga `warn`              |
| T4  | `verificationEmail({ name, url })`                 | `html` contém a URL **exata** recebida            |
| T5  | `resetPasswordEmail`                               | idem, e `subject` não vazio                       |
| T6  | Nenhum template expõe o token fora do `href`       | asserção por substring                            |

### Integração — `tests/integration/auth-email.test.ts`

| #   | Caso                                                  | Esperado                                        |
| --- | ----------------------------------------------------- | ----------------------------------------------- |
| T7  | Sign-up dispara verificação                           | `outbox` com 1 e-mail contendo link com `token` |
| T8  | Sign-in **sem** verificar                             | 200 — prova `requireEmailVerification: false`   |
| T9  | `GET /verify-email` com token válido                  | `user.emailVerified === true` no banco          |
| T10 | Mesmo token uma segunda vez                           | 4xx — token é de uso único                      |
| T11 | `GET /verify-email` com token inválido                | 4xx; `emailVerified` continua `false`           |
| T12 | `POST /send-verification-email` de e-mail existente   | 200 e novo e-mail em `outbox`                   |
| T13 | `POST /send-verification-email` de e-mail inexistente | 200, `outbox` **vazio** — sem enumeração        |
| T14 | `POST /forget-password` de e-mail existente           | 200 e e-mail com link de reset                  |
| T15 | `POST /forget-password` de e-mail inexistente         | 200 **idêntico** ao T14, `outbox` vazio         |
| T16 | `POST /reset-password` com token válido               | 200; sign-in com a senha nova funciona          |
| T17 | Sign-in com a senha antiga depois do reset            | 401                                             |
| T18 | Token de reset reutilizado                            | 4xx                                             |
| T19 | Reset com senha de 5 chars                            | 4xx; senha antiga continua válida               |
| T20 | Sessões anteriores após o reset                       | registre o comportamento da lib em `DECISIONS`  |

### Integração — `tests/integration/auth-social.test.ts`

| #   | Caso                                                     | Esperado                                 |
| --- | -------------------------------------------------------- | ---------------------------------------- |
| T21 | `POST /sign-in/social` com `provider: 'google'`          | 200 com `url` para `accounts.google.com` |
| T22 | `POST /sign-in/social` com provider inexistente          | 4xx (**não** 500)                        |
| T23 | Provider sem credencial no env                           | 4xx (**não** 500) — prova a §5.5         |
| T24 | `GET /callback/google` com `state` inválido              | 4xx e **nenhuma** linha nova em `"user"` |
| T25 | `callbackURL` de origem externa (`https://evil.example`) | rejeitado — prova `trustedOrigins`       |
| T26 | 10 `forget-password` seguidos em ambiente de teste       | nenhum 429 (D-19)                        |

> **O round trip real de OAuth não é testado automaticamente.** Sem credencial em CI não
> há como. A verificação é manual, na §7, e isso é intencional — não invente mock do
> provedor para fingir cobertura.

---

## 7. Definition of Done

```bash
docker compose up -d && pnpm db:migrate
pnpm typecheck && pnpm lint && pnpm format && pnpm test && pnpm build
pnpm dev
```

**Verificação de e-mail** (dev, transporte de memória — o link sai no log):

```bash
curl -s -X POST localhost:3333/api/auth/sign-up/email \
  -H 'content-type: application/json' \
  -d '{"name":"Joao","email":"joao+verif@teste.com","password":"senha-de-teste-123"}' | jq
# copie a URL do stdout do servidor e:
curl -s -o /dev/null -w '%{http_code}\n' "<url-de-verificacao>"
docker compose exec -T postgres psql -U postgres -d cardoso_sound \
  -c 'select email, email_verified from "user";'
```

**Recuperação de senha:**

```bash
curl -s -o /dev/null -w '%{http_code}\n' -X POST localhost:3333/api/auth/forget-password \
  -H 'content-type: application/json' -d '{"email":"joao+verif@teste.com"}'   # 200
curl -s -o /dev/null -w '%{http_code}\n' -X POST localhost:3333/api/auth/forget-password \
  -H 'content-type: application/json' -d '{"email":"nao-existe@teste.com"}'   # 200 idêntico
```

**Social** (manual, com browser):

```bash
curl -s -X POST localhost:3333/api/auth/sign-in/social \
  -H 'content-type: application/json' -d '{"provider":"google"}' | jq -r .url
# abra a URL no browser, conclua o login, confirme o redirect de volta
docker compose exec -T postgres psql -U postgres -d cardoso_sound \
  -c 'select provider_id, user_id from account;'
```

- [ ] T1–T26 verdes
- [ ] Login social concluído no browser **em cada provedor entregue**, com linha em `account`
- [ ] Segunda entrada pelo mesmo provedor **não** cria usuário duplicado
- [ ] `forget-password` responde igual para e-mail existente e inexistente (T14 vs T15)
- [ ] Nenhum token de verificação ou reset aparece no log com o transporte Resend
- [ ] Nenhum `CLIENT_SECRET` nem `RESEND_API_KEY` no repositório — `git log -p | grep -i secret`
- [ ] `.env.example` com as variáveis novas, só placeholders
- [ ] `pnpm dlx @better-auth/cli generate` sem diferença de schema (§5.2)
- [ ] `/docs` continua abrindo; suíte de F3-S02 e F4 continua verde
- [ ] PR verde; `release/v0.3.0` preparada e PR para `main` aberto
- [ ] Memória atualizada

**CI vermelho:** protocolo da spec `06` §5 — até 3 tentativas, depois **para e reporta**.
Falha de teste social em CI é quase sempre credencial ausente no ambiente: confira antes
de mexer no código.

---

## 8. Armadilhas conhecidas

1. **`sendVerificationEmail` que rejeita derruba o sign-up.** O Better Auth chama o
   callback dentro do fluxo de criação. Se o Resend estiver fora do ar e você propagar o
   erro, ninguém consegue se cadastrar. Por isso `mailer.send` engole a falha (T3) — o
   usuário pede reenvio depois.
2. **`resend` instalado sem domínio verificado** entrega só para o e-mail dono da conta.
   O envio "funciona" (200 da API) e o e-mail nunca chega ao usuário de teste. Sintoma
   clássico de meia hora perdida.
3. **Chamar `new Resend(undefined)` na importação** quebra em `test`, onde não há chave.
   A escolha do transporte acontece **uma vez**, com a chave já validada pelo `env.ts`.
4. **`emailVerified` no `/me`.** A tentação é expor para o app saber se verificou. **Não.**
   O checklist de auditoria (spec `04` §7) proíbe, o T13 de F3-S02 quebra, e o dado já vem
   em `GET /api/auth/get-session`.
5. **Redirect URI divergente por um caractere** (barra final, `http` vs `https`, porta) é
   `redirect_uri_mismatch` no provedor, não erro do seu código. Compare literalmente.
6. **GitHub com e-mail privado devolve `email: null`** sem o escopo `user:email`, e a
   criação do usuário falha com erro obscuro de constraint. É a falha mais provável do
   sprint depois do Facebook.
7. **Facebook exige HTTPS no redirect** mesmo em desenvolvimento em várias configurações
   de app. Se travar aí, entregue sem Facebook (§5.5) em vez de furar o localhost.
8. **`callbackURL` sem validação é open redirect** — e o token vai na URL. Nunca aceite
   `callbackURL` do corpo sem que a origem esteja em `trustedOrigins` (T25).
9. **`accountLinking` com provedor não confiável** é sequestro de conta, não conveniência.
   Releia a §5.8 antes de acrescentar qualquer provedor a `trustedProviders`.
10. **`customRules` usa o caminho relativo ao `basePath`** (`/forget-password`, não
    `/api/auth/forget-password`). Escrito errado, a regra simplesmente não casa — e falha
    em silêncio, porque o limite global assume o lugar dela.
11. **Rate limit ligado em teste** produz 429 aleatório e é a causa clássica de flake
    (D-19). Vale para `customRules` também.
12. **Não reescreva `auth.plugin.ts`.** As seis rotas novas já passam pela coringa
    `/api/auth/*`. Se algo não funcionar por ali, o problema está na config, não na ponte —
    ela está coberta por T1–T19 de F3-S01.

---

## 9. Registro na memória

- **`DECISIONS.md`** — **obrigatório**: (a) `requireEmailVerification: false` e o motivo
  (§5.6); (b) quais provedores entraram e quais ficaram fora, com o motivo; (c)
  `trustedProviders` do `accountLinking` e por que o Facebook não está nele; (d) os valores
  de `customRules`; (e) versões de `better-auth` e `resend` em que isso foi validado;
  (f) o comportamento da lib quanto a sessões após reset de senha (T20).
- **`PROGRESS.md`** — F3-S03 ✅, **fase F3 concluída**, tag `v0.3.0`, R26–R31 nos contratos
  entregues, próximo = F4-S01.
- **`F3-S03.md`** — a forma final do `auth.config.ts` comentada, o contrato do `Mailer`,
  como ler o `outbox` num teste, e **os dois fluxos de callback do Flutter** (`idToken` vs
  deep link) com o exemplo de payload de cada um. O time do app lê isto.
