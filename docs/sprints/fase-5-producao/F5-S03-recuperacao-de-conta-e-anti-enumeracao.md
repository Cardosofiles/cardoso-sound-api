# F5-S03 — Recuperação de Conta, Anti-Enumeração e Política de Senha

|                |                                                          |
| -------------- | -------------------------------------------------------- |
| **Fase**       | F5 — Produção · **2º dos 6 sprints de blindagem** (D-49) |
| **Branch**     | `feature/f5s03-recuperacao-de-conta`                     |
| **Depende de** | F5-S02                                                   |
| **Entrega**    | GAP-07, GAP-08, GAP-14, GAP-15, GAP-22, GAP-24, GAP-25   |

> **Este é o sprint de maior raio de impacto da blindagem, e o único que muda contrato de
> rota.** `POST /sign-in/email` passa a responder **403** enquanto o e-mail não for verificado, e
> `POST /sign-up/email` para de distinguir e-mail novo de e-mail já cadastrado.
>
> **Ele revoga duas decisões vigentes** — D-51 revoga D-46 (a), D-52 revoga D-46 (e) — e
> **reescreve três casos de teste que hoje afirmam o comportamento antigo** (T6, T8 e T20 de F3).
> Um teste que afirma o comportamento antigo, depois deste sprint, é regressão, não cobertura.
>
> **Leia D-51, D-52 e D-57 antes de planejar.** Elas já estão decididas; este sprint executa.

---

## 0. Pré-requisitos

Nenhum trabalho humano. Nenhuma credencial nova. Nenhuma dependência nova — a verificação de
senha vazada, se o plugin nativo não existir, é uma lista embutida sem rede (§5.6).

---

## 1. Prompt de abertura

```
Leia .agents/memory/PROGRESS.md e .agents/memory/DECISIONS.md para se contextualizar.
Leia com MUITA atenção D-46, D-51, D-52 e D-57. D-51 e D-52 REVOGAM partes de D-46:
o que este sprint faz contradiz de propósito o que F3-S03 entregou, e isso está decidido.
Leia .agents/memory/F3-S03.md — ele entregou o auth.config.ts, o mailer e os templates
que você vai alterar, e explica por que o outbox existe.

Sprint alvo: docs/sprints/fase-5-producao/F5-S03-recuperacao-de-conta-e-anti-enumeracao.md
Specs obrigatórias: docs/specs/08-blindagem-de-seguranca.md (§4, §5),
                    docs/specs/04-autenticacao-e-seguranca.md (§1.2 — leia o aviso de
                    supersessão no topo da subseção requireEmailVerification)

A spec 08 §4 SUBSTITUI a spec 04 §1.2. Onde as duas divergirem, vale a 08.

ANTES de escrever qualquer código, execute a §5.1 do sprint: confirme na versão instalada
(a) que `revokeSessionsOnPasswordReset` é chave de `emailAndPassword`,
(b) o predicado de resposta genérica em dist/api/routes/sign-up.mjs,
(c) se `better-auth/plugins` exporta `haveIBeenPwned`.
Reporte os três achados. Se (a) ou (b) divergir do que o sprint descreve, PARE e reporte.

Este sprint reescreve tests/e2e/helpers/auth.ts e os casos T6, T8 e T20 de F3.
Isso é intencional e está autorizado — está no blast radius.

Siga o protocolo de docs/specs/07-protocolo-dos-agentes.md:
entre em modo de planejamento, apresente o plano COMPLETO da sprint e
AGUARDE minha autorização explícita antes de escrever qualquer código.

Não toque em nenhum arquivo fora do blast radius declarado no sprint.
```

---

## 2. Objetivo

Fazer o fluxo de recuperação de conta **recuperar a conta**, e fechar o único endpoint da API que
ainda diz a um estranho quem tem cadastro.

Quatro problemas, três deles no mesmo bloco de configuração:

1. **O reset de senha não revoga sessão nenhuma** (GAP-07). Um atacante com cookie ou bearer
   roubado mantém acesso total por até 7 dias **depois** de a vítima trocar a senha — inclusive ao
   `DELETE /api/v1/me`. O caso T20 hoje **afirma isso como esperado**.
2. **O cadastro é um oráculo de enumeração** (GAP-08). 422 significa "existe", 200 significa
   "novo". Com o rate limit corrigido em F5-S02 isso fica mais lento, mas continua sendo um
   inventário público da base de usuários.
3. **A verificação de e-mail é enviada e nunca exigida** (GAP-14). Qualquer pessoa se cadastra com
   o endereço de um terceiro, recebe sessão de 7 dias, e — pelo `user_email_unique` — **impede o
   dono real de se cadastrar**.
4. **O mailer tem um logger próprio sem `redact` e loga o token de reset** (GAP-15). Junto,
   duas dívidas menores nos mesmos arquivos: interpolação sem escape nos templates (GAP-22) e
   `/change-password` sem nenhum teste (GAP-24).

**Não faz parte deste sprint:** `cookieCache` (F5-S04) · envelope de erro de `/api/auth/*`
(F5-S04) · qualquer coisa de 2FA ou Passkey · mudar `minPasswordLength` de 8.

---

## 3. Contratos esperados

### 3.1 `auth.config.ts` — o bloco `emailAndPassword`

Forma normativa: **spec `08` §4**.

```ts
emailAndPassword: {
  enabled: true,
  minPasswordLength: 8,
  maxPasswordLength: 128,                 // explícito, não herdado
  autoSignIn: true,                       // R09 preservado
  requireEmailVerification: true,         // D-51 — era false
  revokeSessionsOnPasswordReset: true,    // D-52 — não existia
  resetPasswordTokenExpiresIn: 60 * 60,
  sendResetPassword: async ({ user, url }) => { /* inalterado */ },
},
```

### 3.2 Mudança de contrato HTTP — **é o que torna este sprint diferente dos outros**

| Rota                   | Antes                         | Depois                                            |
| ---------------------- | ----------------------------- | ------------------------------------------------- |
| `POST /sign-up/email`  | 422 se o e-mail já existe     | **200 genérico**, indistinguível do cadastro novo |
| `POST /sign-in/email`  | 200 sem verificar             | **403** enquanto `emailVerified === false`        |
| `POST /reset-password` | sessões anteriores sobrevivem | **todas as sessões do usuário são revogadas**     |

A resposta genérica é emitida **pelo próprio Better Auth** quando `requireEmailVerification` ou
`autoSignIn === false` está ativo (`dist/api/routes/sign-up.mjs:163`). Não se implementa à mão, e
tentar implementar à mão por cima é como se introduz um vazamento por timing.

> Estas três linhas vão para a **spec `03` §5** na reconciliação de F5-S09. Aqui elas ficam
> registradas em `F5-S03.md` para o time do Flutter.

### 3.3 `tests/e2e/helpers/auth.ts` — assinatura preservada, corpo reescrito

```ts
export interface SignUpAndGetTokenResult {
  token: string;
  userId: string;
  cookie: string;
  email: string;
}
export async function signUpAndGetToken(
  app: FastifyInstance,
  email?: string,
): Promise<SignUpAndGetTokenResult>;
```

**A assinatura e o formato de retorno não mudam** — é isso que evita reescrever os 9 arquivos de
teste que o consomem. O corpo passa a ter quatro passos (§5.5).

### 3.4 `src/shared/email/mailer.ts` — logger injetado

```ts
export interface Mailer {
  send(input: { to: string; subject: string; html: string }): Promise<void>;
}
export function createMemoryMailer(logger?: Logger): Mailer;
export function createResendMailer(client: Resend, logger?: Logger): Mailer;
export const mailer: Mailer;
export const outbox: readonly SentEmail[];
export function clearOutbox(): void;
```

`Logger` é o tipo do Pino já usado pelo Fastify. Sem injeção, cai numa instância **com** os
`redact.paths` de D-22 acrescidos de `'*.url'`, `'url'` e `'to'` (D-57, spec `08` §5).

### 3.5 `src/shared/security/weak-passwords.ts` — só se a §5.1 (c) der negativo

```ts
export function isWeakPassword(password: string): boolean;
```

---

## 4. Blast radius

### Criar

```
src/shared/security/weak-passwords.ts        # SÓ se §5.1 (c) der negativo
tests/unit/shared/security/weak-passwords.test.ts   # idem
tests/integration/auth-change-password.test.ts
```

### Editar

```
src/modules/auth/auth.config.ts              # bloco emailAndPassword (§3.1) + política de senha
src/shared/email/mailer.ts                   # logger injetado, sem pino() próprio (D-57)
src/shared/email/templates.ts                # escape real da URL (GAP-22)
tests/e2e/helpers/auth.ts                    # 4 passos (§5.5) — assinatura preservada
tests/integration/auth.test.ts               # T6 muda de expectativa
tests/integration/auth-email.test.ts         # T8 e T20 mudam de expectativa
tests/unit/shared/email/mailer.test.ts       # logger injetado, asserções de não-vazamento
tests/unit/shared/email/templates.test.ts    # escape
.agents/memory/PROGRESS.md
.agents/memory/F5-S03.md
```

**Editar apenas se a suíte quebrar por causa do fluxo novo** — e nesse caso, só a chamada de
cadastro, nada mais:

```
tests/e2e/specs/{auth-flow,account-lifecycle,favorites-flow,playlist-flow}.e2e.test.ts
tests/integration/modules/{users,playlists,favorites}.repository.test.ts
```

> Se `signUpAndGetToken` mantiver a assinatura da §3.3, **a maioria destes não precisa mudar** —
> é exatamente para isso que a assinatura é preservada. Toque só no que quebrar, e diga em
> `F5-S03.md` quais quebraram e por quê.

**Não toque em:** `src/modules/auth/auth.plugin.ts` · `src/plugins/**` · `src/db/**` ·
`drizzle/**` · `src/config/env.ts` · `src/modules/{users,playlists,favorites,artists,tracks}/**` ·
`src/app.ts` · `docs/openapi.json`.

> **`DECISIONS.md` não está na lista.** D-51, D-52 e D-57 já estão registradas. O que **falta**
> nelas é a nota de revogação dentro de D-46: acrescente, nas alíneas (a) e (e) de D-46, a marca
> `— revogada por D-51` e `— revogada por D-52`. **Essa é a única edição autorizada em
> `DECISIONS.md`**, e é uma anotação de duas linhas, não uma reescrita.

---

## 5. Passo a passo

### 5.1 Confirmar três coisas no pacote instalado — antes de qualquer código

```bash
# (a) revokeSessionsOnPasswordReset é chave de emailAndPassword?
grep -rn "revokeSessionsOnPasswordReset" node_modules/better-auth/dist/ | head

# (b) o predicado da resposta genérica de duplicidade
grep -n "shouldReturnGenericDuplicateResponse" -A 4 \
  node_modules/better-auth/dist/api/routes/sign-up.mjs

# (c) existe plugin nativo de senha vazada?
grep -rn "haveIBeenPwned\|hibp" node_modules/better-auth/dist/plugins/index.* | head
```

A auditoria observou, em `better-auth@1.7.2`:

```js
const shouldReturnGenericDuplicateResponse =
  ctx.context.options.emailAndPassword.requireEmailVerification ||
  ctx.context.options.emailAndPassword.autoSignIn === false;
```

**Reporte os três resultados antes de codar.** Se (a) ou (b) divergir, **pare** — o sprint inteiro
depende do comportamento da lib, não de código nosso. (c) apenas escolhe o caminho da §5.6.

> **`revokeOtherSessions` não é a chave.** É parâmetro do **corpo** de `POST /change-password`.
> Declará-lo em `emailAndPassword` é no-op silencioso — e foi o erro de uma auditoria anterior.

### 5.2 `revokeSessionsOnPasswordReset` (GAP-07)

Uma linha em `emailAndPassword`. O que dá trabalho é o teste: **T20 hoje afirma que o bearer
anterior ao reset continua válido**, e passa a afirmar o contrário.

Não "conserte" o T20 relaxando a asserção. Ele deve provar, com o mesmo bearer capturado antes do
reset, que `GET /api/auth/get-session` responde **401** depois dele.

### 5.3 `requireEmailVerification: true` (GAP-14 + GAP-08)

Uma linha, e a metade do sprint. Ela resolve **dois** GAPs de uma vez: bloqueia o sign-in até a
verificação **e** liga a resposta genérica de duplicidade no cadastro (§5.1 (b)).

`autoSignIn` permanece `true` — assim `POST /sign-up/email` continua devolvendo `set-auth-token`
e **R09 não muda de forma**. O token devolvido no cadastro, porém, pertence a um usuário não
verificado; confirme no T7 o que ele consegue e o que não consegue fazer, e **registre o achado
em `F5-S03.md`**: o cliente Flutter precisa saber se guarda esse token ou se descarta e refaz o
sign-in depois da verificação.

### 5.4 O logger do mailer (GAP-15) — D-57

Hoje `mailer.ts:5-13` faz `pino({ level, transport })` **sem `redact`**, e `:45-55` extrai o
`href` do corpo e o registra. Num e-mail de reset, essa URL é o token válido por uma hora.

```ts
// nada de pino() novo em src/** fora do buildApp() — D-57
export function createMemoryMailer(logger: Logger = fallbackLogger): Mailer {
  /* ... */
}
```

Três regras, todas verificáveis:

- O `fallbackLogger` aplica os seis `redact.paths` de D-22 **mais** `'*.url'`, `'url'` e `'to'`.
- O transporte de memória só loga a URL quando `NODE_ENV === 'development'`. Em `test` e
  `production`, nunca. (Em dev é como se pega o link — mantenha.)
- O transporte Resend loga `{ provider: 'resend', status }` e a mensagem. **Nunca** o
  destinatário, **nunca** o objeto de erro cru do provedor.

`mailer.send` **continua nunca rejeitando** — armadilha 1 de F3-S03, que segue valendo: o Better
Auth chama `sendVerificationEmail` dentro do fluxo de criação do usuário, e propagar erro derruba
o sign-up inteiro quando o Resend estiver fora do ar.

### 5.5 O helper E2E — quatro passos, tudo offline

```
1. POST /api/auth/sign-up/email
2. ler o outbox, pegar o href do último e-mail  (regex já existente no mailer)
3. GET <href>                                    → verify-email
4. POST /api/auth/sign-in/email                  → bearer de `set-auth-token`
```

Nada disso toca a rede: o transporte de memória é o de `test`, e o `outbox` existe exatamente
para isto (spec `04` §1.2, "Transporte"). **`clearOutbox()` antes do passo 1**, senão o helper lê
o e-mail de outro teste e o fluxo fica não-determinístico sob `--sequence.shuffle`.

A justificativa de D-46 (a) — "quebraria `signUpAndGetToken`" — cai aqui, em ~15 linhas.

### 5.6 Política de senha (GAP-25)

`minPasswordLength` **continua 8**. O NIST SP 800-63B aceita 8 desde que haja verificação contra
listas de senhas vazadas, que é o que se acrescenta. `maxPasswordLength: 128` passa a ser
explícito — hoje é o default herdado, e explicitar é o que impede uma mudança de default virar
DoS por entrada longa.

Caminho conforme a §5.1 (c):

- **Plugin nativo existe** → use-o. É k-anonymity: só os 5 primeiros caracteres do SHA-1 saem da
  aplicação; a senha nunca sai. Configure para **falhar aberto** — indisponibilidade do serviço
  externo não pode impedir cadastro.
- **Não existe** → `src/shared/security/weak-passwords.ts`, com um `Set<string>` das senhas mais
  comuns embutido no bundle, comparação em minúsculas, **sem rede**. Ligue-o pelo hook de
  validação de senha do Better Auth confirmado na §5.1; se não houver hook, **pare e reporte** em
  vez de validar em outra camada.

A rejeição responde **400 genérico**. Não diga "esta senha aparece em vazamentos" — isso confirma
ao atacante que a senha é conhecida e não ajuda o usuário mais do que "escolha outra senha".

**Não acrescente exigência de composição** (maiúscula, dígito, símbolo). O NIST desaconselha:
produz senha previsível e não mede força real.

### 5.7 Escape nos templates (GAP-22)

`templates.ts:15` e `:44` fazem `const safeUrl = input.url;` — uma variável chamada "safe" que
não escapa nada, interpolada em `href="${safeUrl}"` (`:30`, `:59`), enquanto `name` **é** escapado.

Não é explorável hoje: `redirectTo` passa pelo `originCheck` e é URL-encoded antes da
concatenação. É defesa em profundidade — e o nome da variável é ativamente enganoso, que é o tipo
de coisa que faz a próxima pessoa confiar no que não deve.

Escape o atributo (`&`, `"`, `<`, `>`), ou renomeie para `rawUrl` e escape na interpolação. As
duas resolvem; escolha uma e aplique nos **dois** templates.

### 5.8 `/change-password` (GAP-24)

O endpoint existe desde F3-S01 e **nunca teve um teste**. Cobertura mínima no T15–T19.
Não escreva rota nova: ele já é servido pela coringa.

---

## 6. Casos de teste obrigatórios

### Integração — `tests/integration/auth.test.ts` (T6 reescrito)

| #   | Caso                                                             | Esperado                                    |
| --- | ---------------------------------------------------------------- | ------------------------------------------- |
| T1  | `POST /sign-up/email` com e-mail **novo**                        | 200                                         |
| T2  | `POST /sign-up/email` com e-mail **já cadastrado**               | **status e corpo idênticos ao T1** — GAP-08 |
| T3  | T1 vs T2: nenhuma diferença de `statusCode`, `code` ou `message` | asserção de igualdade estrita               |
| T4  | Depois do T2, `SELECT count(*) FROM "user" WHERE email = ...`    | continua **1** — não criou duplicata        |

> **T2 substitui o T6 de F3**, que afirmava 4xx em e-mail duplicado. O caso antigo é apagado, não
> comentado nem `.skip`.

### Integração — `tests/integration/auth-email.test.ts` (T8 e T20 reescritos)

| #   | Caso                                                            | Esperado                                           |
| --- | --------------------------------------------------------------- | -------------------------------------------------- |
| T5  | `POST /sign-in/email` **antes** de verificar                    | **403** — GAP-14 (era 200 no T8)                   |
| T6  | `GET /verify-email` com token válido → `POST /sign-in/email`    | 200 com `set-auth-token`                           |
| T7  | Token devolvido no `sign-up` de usuário não verificado          | **registre o comportamento** em `F5-S03.md` (§5.3) |
| T8  | Reset de senha → bearer **anterior** ao reset em `/get-session` | **401** — GAP-07 (era 200 no T20)                  |
| T9  | Reset de senha → cookie **anterior** ao reset em `/get-session` | 401                                                |
| T10 | Reset de senha → sign-in com a senha **nova**                   | 200                                                |
| T11 | `SELECT count(*) FROM session WHERE user_id = ...` após o reset | só a sessão nova                                   |
| T12 | `POST /forget-password` de e-mail inexistente                   | 200 idêntico; `outbox` vazio (sem regressão)       |
| T13 | Nenhum e-mail do `outbox` tem o token fora do `href`            | asserção por substring                             |

> **T5 substitui o T8 de F3** ("sign-in succeeds without verifying email") e **T8 substitui o
> T20** ("sessões prévias persistem"). Os dois casos antigos são apagados.

### Integração — `tests/integration/auth-change-password.test.ts` (novo)

| #   | Caso                                                                     | Esperado                         |
| --- | ------------------------------------------------------------------------ | -------------------------------- |
| T14 | `POST /change-password` sem autenticação                                 | 401                              |
| T15 | Com senha atual **incorreta**                                            | 4xx; senha inalterada            |
| T16 | Com senha atual correta                                                  | 200; sign-in com a nova funciona |
| T17 | Sign-in com a senha **antiga** depois da troca                           | 401                              |
| T18 | Com `revokeOtherSessions: true` no corpo → segundo bearer da mesma conta | 401                              |
| T19 | Com senha nova de 5 caracteres                                           | 4xx; senha inalterada            |

### Unit — `tests/unit/shared/email/**`

| #   | Caso                                                         | Esperado                                         |
| --- | ------------------------------------------------------------ | ------------------------------------------------ |
| T20 | `createMemoryMailer(fakeLogger)` com `NODE_ENV=test`         | **nenhuma** chamada de log com `url`             |
| T21 | Transporte Resend em falha                                   | resolve; loga `warn` **sem** `to` nem o erro cru |
| T22 | `grep -rn "pino(" src/` fora de `app.ts`                     | **vazio** — D-57                                 |
| T23 | `verificationEmail({ name, url: 'https://x/?t=1&a="><b>' })` | aspas e `<` escapados no `href`                  |
| T24 | `resetPasswordEmail` idem                                    | idem                                             |
| T25 | Ambos os templates com `name: '<script>'`                    | escapado (não regredir)                          |

### Unit — `weak-passwords` (só no caminho §5.6 sem plugin nativo)

| #   | Caso                                     | Esperado                            |
| --- | ---------------------------------------- | ----------------------------------- |
| T26 | `isWeakPassword('password')`             | `true`                              |
| T27 | `isWeakPassword('PASSWORD')`             | `true` — comparação em minúsculas   |
| T28 | Senha aleatória de 24 caracteres         | `false`                             |
| T29 | `POST /sign-up/email` com senha da lista | 400 genérico, **sem** citar a lista |

### E2E

| #   | Caso                                                  | Esperado                                |
| --- | ----------------------------------------------------- | --------------------------------------- |
| T30 | Os 5 arquivos de `tests/e2e/specs/` com o helper novo | verdes, sem mudança de asserção         |
| T31 | Suíte completa duas vezes seguidas                    | mesmo resultado — `clearOutbox` correto |
| T32 | `pnpm vitest run --sequence.shuffle`                  | verde                                   |

---

## 7. Definition of Done

```bash
docker compose up -d && pnpm db:migrate
pnpm typecheck && pnpm lint && pnpm format && pnpm test && pnpm build
pnpm vitest run --sequence.shuffle     # determinismo do outbox
```

**Verificação manual do fluxo novo** (dev, transporte de memória — o link sai no log):

```bash
pnpm dev
# 1. cadastro devolve 200 e envia verificação
curl -s -X POST localhost:3333/api/auth/sign-up/email -H 'content-type: application/json' \
  -d '{"name":"Joao","email":"joao+f5s03@teste.com","password":"uma-senha-longa-e-unica"}' | jq

# 2. sign-in ANTES de verificar → 403 (GAP-14)
curl -s -o /dev/null -w '%{http_code}\n' -X POST localhost:3333/api/auth/sign-in/email \
  -H 'content-type: application/json' \
  -d '{"email":"joao+f5s03@teste.com","password":"uma-senha-longa-e-unica"}'

# 3. cadastro repetido responde IGUAL ao novo (GAP-08)
curl -s -X POST localhost:3333/api/auth/sign-up/email -H 'content-type: application/json' \
  -d '{"name":"Outro","email":"joao+f5s03@teste.com","password":"outra-senha-longa"}' \
  -w '\nHTTP %{http_code}\n'

# 4. verifique pelo link do log, faça sign-in, guarde o bearer, resete a senha,
#    e confirme que o bearer ANTIGO responde 401 (GAP-07)
curl -s -o /dev/null -w '%{http_code}\n' localhost:3333/api/auth/get-session \
  -H "Authorization: Bearer $BEARER_ANTIGO"     # 401
```

- [ ] T1–T32 verdes
- [ ] Os 4 comandos manuais com a saída esperada
- [ ] **Nenhum** `it.skip` / `describe.skip` — `grep -rn '\.skip(' tests/` vazio
- [ ] Os casos antigos T6, T8 e T20 de F3 foram **apagados**, não desativados
- [ ] `grep -rn "pino(" src/ | grep -v app.ts` **vazio** (D-57)
- [ ] `grep -n "safeUrl" src/shared/email/templates.ts` vazio, ou a variável realmente escapa
- [ ] Nenhum token de verificação ou reset em log com `NODE_ENV=test`
- [ ] D-46 (a) e (e) marcadas como revogadas em `DECISIONS.md` (duas linhas)
- [ ] `docs/openapi.json` **não mudou** — a forma das rotas é a mesma; só os status possíveis
- [ ] PR verde; memória atualizada com a mudança de contrato para o time do Flutter

---

## 8. Armadilhas conhecidas

1. **A senha dos testes pode estar na lista de vazadas.** O helper usa `'Password123!'`, que é
   candidata óbvia. Se a §5.6 entrar em vigor, **a suíte inteira morre de uma vez** com um 400
   genérico e a causa não é óbvia no log. Troque por uma senha longa e não-óbvia **no mesmo
   commit** em que ligar a verificação, e verifique o helper antes de rodar a suíte.
2. **`clearOutbox()` esquecido no helper** faz o passo 2 ler o e-mail de outro teste. Passa
   localmente e falha sob `--sequence.shuffle` e em CI — o pior tipo de flake.
3. **Relaxar T20 em vez de invertê-lo.** "Não sei se revoga, então só checo que não dá 500" não
   prova nada. O caso é: mesmo bearer, capturado antes, **401** depois.
4. **`revokeOtherSessions` em `emailAndPassword`.** Não é chave de configuração; é parâmetro do
   corpo de `/change-password`. No-op silencioso, provavelmente erro de `pnpm typecheck`.
5. **Implementar a resposta genérica de duplicidade à mão.** Ela vem da lib quando a flag certa
   está ligada. Fazer à mão por cima é como se cria vazamento por timing — o caminho "usuário
   existe" fica mensuravelmente mais lento.
6. **Achar que `autoSignIn: true` deixou de valer.** Ele continua ligado, e é por isso que R09
   não muda de forma. O que muda é o que aquele token consegue fazer — investigue no T7 e
   **registre**, porque o time do Flutter depende dessa resposta.
7. **Tocar nos 9 arquivos de teste que chamam o helper.** A assinatura foi preservada de
   propósito. Toque só no que quebrar, e diga em `F5-S03.md` o que quebrou.
8. **Reescrever D-46.** Ela é registro histórico e continua descrevendo o que F3-S03 entregou. A
   edição autorizada é acrescentar `— revogada por D-51` / `— revogada por D-52` nas alíneas (a) e
   (e). Nada além disso.
9. **Deixar o mailer logar a URL em `test`.** Em `development` é útil e fica; em `test` polui e
   pode vazar em log de CI, que é público neste repositório.
10. **Fazer a verificação de senha vazada falhar fechado.** Se o serviço externo cair, ninguém se
    cadastra. Falha aberta: loga `warn`, deixa passar.
11. **Mensagem específica na rejeição de senha.** "Esta senha apareceu em vazamentos" confirma ao
    atacante que a senha é conhecida. 400 genérico.

---

## 9. Registro na memória

- **`DECISIONS.md`** — **uma anotação, não uma decisão nova**: marcar D-46 (a) como
  `revogada por D-51` e D-46 (e) como `revogada por D-52`. Se a §5.1 (c) levar ao caminho da lista
  local, isso é detalhe de implementação e vai para `F5-S03.md`, **não** para `DECISIONS.md`.
- **`PROGRESS.md`** — F5-S03 ✅, próximo = F5-S04. Acrescente às pendências: _"contrato de
  `/sign-in/email` (403 antes da verificação) e de `/sign-up/email` (200 genérico) a refletir na
  spec `03` §5 em F5-S09"_.
- **`F5-S03.md`** — **a seção mais importante deste sprint**, porque o time do Flutter lê:
  (a) o que muda no contrato das três rotas, com exemplo de corpo antes e depois;
  (b) o que o token devolvido no cadastro de usuário não verificado consegue e não consegue fazer
  (T7); (c) os quatro passos do helper novo, com o trecho de código; (d) quais dos 9 arquivos de
  teste quebraram e por quê; (e) o caminho escolhido na §5.6 e por quê.

---

## 10. Depois deste sprint

Os dois vetores de abuso de conta estão fechados e a recuperação de senha realmente recupera.
O que continua aberto do domínio de autenticação: a sessão ainda é resolvida do banco a cada
requisição (GAP-13) e ainda não há segundo fator.

Próximo: **F5-S04**, endurecimento de sessão, schema e contrato — o primeiro sprint da blindagem
que gera migração.
