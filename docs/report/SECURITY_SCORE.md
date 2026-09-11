# Score de Segurança — Cardoso Sound API

**Projeto:** `cardoso-sound-api`
**Data:** 2026-09-09
**Autoria:** Staff Engineer (Claude Opus 5) + subagente `security-review`
**Escopo:** autenticação (Better Auth 1.7.2), autorização, proteção de borda, modelagem de dados, privacidade
**Método:** duas passagens estáticas independentes, incluindo leitura de `node_modules/better-auth/dist/**` para confirmar comportamento de runtime. Sem execução, sem alteração de código.
**Documento irmão:** [`docs/issue/AUTHENTICATION.md`](../issue/AUTHENTICATION.md) — 27 GAPs e plano de remediação

> **Nota de 2026-09-11 — este relatório é um retrato de 2026-09-09 e não foi reescrito.**
> Duas coisas que ele afirma mudaram depois, e a leitura precisa saber disso:
>
> 1. **Os 27 GAPs foram fechados** (F5-S02 … F5-S07 e F5-S10, PRs #29–#36). O score atual do
>    `develop` não é mais o 58.3 registrado abaixo; o número aqui é o do código de 2026-09-09.
> 2. **A numeração dos sprints mudou por D-64.** Onde se lê `F5-S08` (deploy), leia **`F7-S01`**;
>    onde se lê `F5-S09` (auditoria e release `v1.0.0`), leia **`F7-S02`**. A F5 encerrou-se como
>    fase de autenticação e fecha em `v0.5.0`; deploy e release formam a F7, a última fase.
>
> O corpo fica como estava: reescrever um relatório datado apaga o registro em vez de corrigi-lo.

---

## 1. Score

|                     |                                                                            |
| :------------------ | :------------------------------------------------------------------------- |
| **SCORE ATUAL**     | **58.3 / 100** — nível **D · ação requerida**                              |
| **SCORE PROJETADO** | **99.1 / 100** — nível **A+ · fortificado**, após **F5-S02 … F5-S07** (§6) |

> **Remediação planejada e autorizada.** Os 27 GAPs estão distribuídos em seis sprints de
> blindagem — `F5-S02` a `F5-S07` — que rodam **antes** do deploy por **D-49**. A spec normativa é
> [`docs/specs/08-blindagem-de-seguranca.md`](../specs/08-blindagem-de-seguranca.md), cuja §10
> mapeia cada GAP ao sprint e à seção que o corrige, e cuja §9 é o checklist que fecha a `v1.0.0`
> em `F5-S09`. As cinco decisões que estavam pendentes do dono foram tomadas e registradas em
> **D-49 … D-57**. **Nenhuma linha de código foi alterada** — o `develop` continua com os 27 GAPs
> abertos, e o score atual é o do código que está lá.

O número é puxado para baixo por três fatores independentes:

1. **Um defeito crítico de uma linha** que desliga o rate limit global exatamente em produção.
2. **A ausência integral do domínio multifator** (2FA e Passkey), 20 % do peso, hoje em zero.
3. **A cadeia de rate limit de autenticação que não funciona em nenhuma topologia** — ou é
   contornável por `X-Forwarded-For` forjado, ou colapsa todos os usuários num bucket único.

O restante é sólido, e um domínio é excepcional. O controle de acesso a objetos — historicamente o
vetor nº 1 do OWASP API Top 10 — está implementado com rigor incomum: filtro por `userId` dentro
do SQL, 404 uniforme para recurso alheio, guard em 13 de 13 rotas, e defesa dupla contra vazamento
de credencial. **Esse não é o problema desta aplicação e não deve ser tocado.**

---

## 2. Metodologia

Sete domínios, ponderados segundo o **OWASP API Security Top 10 (2023)**, o modelo **STRIDE** e os
contratos normativos do próprio projeto (`.agents/memory/DECISIONS.md`, `docs/specs/**`).

Nota 0–100 por domínio. Um GAP crítico consome até 60 pontos do domínio; alto, até 25; médio, até
12; baixo, até 5. Conformidade pontua apenas com evidência `arquivo:linha` verificada — alegação
sem evidência não conta.

|  #  | Domínio                                       |   Peso    |  Nota   |    Ponderado     |
| :-: | :-------------------------------------------- | :-------: | :-----: | :--------------: |
|  1  | Autenticação core e gestão de sessões         |   20 %    | **70**  |      14.00       |
|  2  | Federação de identidade e OAuth 2.0           |   15 %    | **90**  |      13.50       |
|  3  | Multifator (2FA) e passwordless (Passkey)     |   20 %    |  **0**  |       0.00       |
|  4  | Autorização, IDOR e propriedade de objetos    |   20 %    | **100** |      20.00       |
|  5  | Proteção de borda, headers e rate limiting    |   10 %    | **20**  |       2.00       |
|  6  | Modelagem relacional e integridade de schema  |   10 %    | **55**  |       5.50       |
|  7  | Privacidade, anti-enumeração, logs e segredos |    5 %    | **65**  |       3.25       |
|     | **TOTAL**                                     | **100 %** |         | **58.25 ≈ 58.3** |

---

## 3. Avaliação por domínio

### 3.1 · Autenticação core e sessões — **70 / 100** (peso 20 %)

**Sustentando a nota:**

- `scrypt` nativo do Better Auth (`create-context.mjs:182-183`), sem hasher custom — adequado.
- `minPasswordLength: 8` explícito; `maxPasswordLength` no default 128 (`create-context.mjs:185-186`),
  o que já limita DoS por entrada longa.
- Sessão de 7 dias com rotação a cada 24 h (`auth.config.ts:94-97`), conforme D-13.
- Atributos de cookie corretos por padrão: `httpOnly`, `sameSite: 'lax'`, host-only, e `Secure` +
  prefixo `__Secure-` derivados de `NODE_ENV=production` **ou** baseURL https
  (`cookies/index.mjs:23,34-35`).
- Bearer **e** cookie compartilham um único `auth.api.getSession()` (`auth.plugin.ts:76`) — não há
  ramo separado para bearer, então divergência de autorização entre os dois é estruturalmente
  impossível. Provado por `auth.test.ts:247` × `:277`.
- Tipos derivados de `auth.$Infer.Session` (`auth.config.ts:145-146`), sem interface manual que
  possa divergir do runtime.
- Ponte Fastify ↔ Fetch tratando múltiplos `Set-Cookie` via `getSetCookie()` (`:56-59`) — armadilha
  que o exemplo da documentação oficial não cobre.

**Penalizações (−30):**

| Peso | GAP       | Fato                                                                                                                                                                             |
| :--: | :-------- | :------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| −14  | GAP-07    | Sessões sobrevivem ao reset de senha — **afirmado pelo teste T20**: o bearer anterior ao reset continua válido depois dele. O fluxo de recuperação de conta não recupera a conta |
|  −8  | GAP-13    | Sessão resolvida do banco em toda requisição, sem `cookieCache`, inclusive em `/health` (isento de rate limit) e no catálogo público                                             |
|  −5  | GAP-14    | `requireEmailVerification: false` — cadastro com e-mail de terceiro concede sessão de 7 dias imediata                                                                            |
|  −3  | GAP-24/25 | `/change-password` sem cobertura de teste; sem checagem de senha vazada                                                                                                          |

---

### 3.2 · Federação de identidade e OAuth 2.0 — **90 / 100** (peso 15 %)

O domínio mais bem executado depois da autorização, e o que mais mostra decisão consciente em vez
de configuração copiada.

- **`accountLinking` verificado e seguro.** `allowDifferentEmails` não habilitado e
  `requireLocalEmailVerified` com default `true` (`link-account.mjs:82`): uma conta local não
  verificada **não** pode ser absorvida por um sign-in OAuth. **A hipótese de account takeover por
  linking foi investigada e descartada.** Recomenda-se apenas fixar `requireLocalEmailVerified: true`
  explicitamente, para que uma mudança futura de default não abra isso em silêncio.
- `trustedProviders: ['google','github']` com Facebook **deliberadamente fora**, porque a Meta não
  garante verificação de e-mail (D-46-b).
- Escopos mínimos: Google `openid email profile`, GitHub `user:email` (garante o e-mail mesmo
  quando privado, fechando o buraco clássico de linking), Facebook `email public_profile`.
- **Open redirect protegido e testado**, não apenas configurado: `disableOriginCheck: false`
  (`auth.config.ts:114`), `trustedOrigins` fechado, `redirectTo`/`callbackURL` guardados por
  `originCheck` (`password.mjs:50,97`), com T24 (state inválido) e T25 (callbackURL não confiável)
  em `auth-social.test.ts:100,119`. **Nenhum open redirect encontrado.**
- Falha fechada na configuração: `env.ts:37-59` recusa o boot com par de credenciais incompleto;
  `SOCIAL_PROVIDERS` só monta o provedor com o par completo (`:92-101`).

**Penalização (−10):** GAP-18 — `MOBILE_DEEP_LINK` entra em `trustedOrigins` como
`z.string().optional()`. `trustedOrigins` alimenta o `originCheck` que sustenta toda a proteção
acima; um valor mal configurado (`*`) a desarma sem nenhum sinal no boot.

---

### 3.3 · Multifator e passwordless — **0 / 100** (peso 20 %)

Grep por `twoFactor|passkey|otp|totp|webauthn` em todo o código-fonte: **zero arquivos**. Só há
menções em documentação e no lockfile. `plugins: [bearer(), forgetPasswordPlugin()]`
(`auth.config.ts:116`) é a lista completa.

| Exigido                                                            | Status                                         |
| :----------------------------------------------------------------- | :--------------------------------------------- |
| TOTP (app autenticador)                                            | ausente                                        |
| OTP por e-mail                                                     | ausente                                        |
| Backup codes                                                       | ausente                                        |
| Passkey / WebAuthn / FIDO2                                         | ausente — `@better-auth/passkey` não instalado |
| Tabelas `two_factor` e `passkey`, coluna `user.two_factor_enabled` | ausentes                                       |

Perde-se junto o **bloqueio de conta nativo** do plugin 2FA — contador compartilhado entre TOTP,
OTP e backup codes que devolveria `429 ACCOUNT_TEMPORARILY_LOCKED`. Hoje **não há nenhum bloqueio
por conta**, apenas o limite por IP, que o §3.5 mostra ser frouxo _e_ contornável.

Não é implementação parcial: é ausência integral. Domínio zerado sem atenuante.

---

### 3.4 · Autorização, IDOR e propriedade de objetos — **100 / 100** (peso 20 %)

O ponto mais forte do código, e o único domínio sem ressalva — confirmado por duas passagens
independentes.

- **Propriedade filtrada dentro do SQL, nunca depois do fetch.** `playlists.repository.ts:105,206,239,250`
  e `favorites.repository.ts:54,62,77,132,146` usam `and(eq(id, …), eq(userId, …))` no `WHERE`. O
  padrão perigoso "buscar por id e comparar o dono em memória" não ocorre em lugar nenhum.
  Operações aninhadas em `playlist_tracks` verificam o pai antes (`playlists.service.ts:128-132,174-178`).
- **D-31 aplicado literalmente.** `ForbiddenError` existe na hierarquia e **não é importado por
  nenhuma rota**. Todo caminho de recurso alheio termina em 404
  (`playlists.service.ts:89,103,111,131,163,182`; `favorites.service.ts:89`), provado em E2E para
  GET, PATCH e DELETE (`playlist-flow.e2e.test.ts:152-199`).
- **Guard em 13 de 13 rotas de usuário**, verificadas uma a uma —
  `playlists.routes.ts:41,65,92,118,145,172,206`, `favorites.routes.ts:36,60,88`,
  `users.routes.ts:27,50,75` — com `getUserId()` re-verificando: defesa em profundidade, não
  redundância inútil.
- **Sem mass assignment (OWASP API3).** `updateMeBodySchema` (`users.schema.ts:5-22`) aceita só
  `name` e `image`; `id`, `email`, `emailVerified` e qualquer noção de papel são inalcançáveis, e
  `setValues` é montado campo a campo (`users.repository.ts:44-58`).
- **Defesa dupla contra vazamento de credencial:** response schemas explícitos em toda rota **e**
  projeção explícita de colunas no repositório (`users.repository.ts:22-28,64-70`). `account.password`,
  `account.access_token` e `session.token` são inalcançáveis por duas camadas independentes.
- **Validação de entrada completa:** todo `:id` é `z.uuid()` antes de tocar a query, `limit`
  limitado a `MAX_PAGE_SIZE = 100`, `page ≥ 1`, gênero como enum fechado. Nenhum `sql.raw`; todo
  Drizzle paramétrico. Nenhum caminho de arquivo, comando de shell ou destino de redirect recebe
  entrada do usuário.

---

### 3.5 · Proteção de borda, headers e rate limiting — **20 / 100** (peso 10 %)

O domínio mais deficiente. Contém o único achado crítico e o achado mais grave em severidade
combinada.

**Sustentando os 20 pontos:**

- `@fastify/helmet` registrado primeiro entre os plugins de borda (`app.ts:62`), HSTS ativo por
  default, CSP ativa em produção.
- `@fastify/cors` com allowlist fechada em produção e `origin: true` só fora dela (D-19). **Sem o
  antipadrão `origin: '*'` com `credentials: true`** (`cors.plugin.ts:8-9`).
- `@fastify/under-pressure` com health check no pool (D-26); `/health*` fora do rate limit (D-20).
- Ordem de registro do `buildApp()` correta quanto a compiladores Zod e error handler.

**Penalizações (−80):**

| Peso | GAP          | Fato                                                                                                                                                                                                                                                                                                                                                                                            |
| :--: | :----------- | :---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| −32  | **GAP-01**   | `global: NODE_ENV === 'development'` desliga o rate limit global **em produção** — negação exata de D-19. Como **nenhuma rota declara `config.rateLimit`**, o plugin registra e governa **zero rotas** em produção                                                                                                                                                                              |
| −20  | **GAP-04**   | A chave de rate limit do Better Auth vem de `X-Forwarded-For` não validado (`ip.mjs:188-192,204`, `trustedProxies` não configurado). Sem proxy: header rotativo → bucket novo a cada requisição → **todos os limites de auth contornados**. Atrás da Railway: header com dois valores → `null` → **todo o tráfego num bucket único**, e um atacante tranca todos os usuários fora do `/sign-in` |
| −12  | GAP-05       | A regra de 3/h cobre só o alias `/forget-password`; o endpoint nativo `/request-password-reset` fica em 10/min — 600 e-mails de reset por hora contra qualquer vítima                                                                                                                                                                                                                           |
|  −8  | GAP-06       | `/sign-in/email` sem regra dedicada: 10 tentativas de senha por minuto, sem 2FA e sem bloqueio por conta                                                                                                                                                                                                                                                                                        |
|  −4  | GAP-10       | Sem `trustProxy`: corrigir o GAP-01 isoladamente converteria o rate limit em auto-DoS global, e `session.ip_address` grava o IP do proxy, inutilizando a trilha de auditoria                                                                                                                                                                                                                    |
|  −4  | GAP-12/11/17 | Contadores em memória (limite = `k × max` réplicas); `keyGenerator` com ramo morto; Swagger público em produção — e a CSP padrão do helmet quebra a própria UI                                                                                                                                                                                                                                  |

> A leitura importante: **o rate limit de autenticação não funciona em nenhuma topologia atual.**
> Ou está desarmado (GAP-04, sem proxy) ou convertido em vetor de negação de serviço (GAP-04, com
> proxy). GAP-01 remove o que sobraria de proteção fora do `/api/auth`.

---

### 3.6 · Modelagem relacional e integridade de schema — **55 / 100** (peso 10 %)

**Sustentando a nota:**

- IDs `text` nas tabelas do Better Auth e `uuid` no catálogo, exatamente como D-40 determina.
- `onDelete: 'cascade'` em `session.user_id` e `account.user_id` (`users.schema.ts:21,32`) e em
  `playlists.user_id` / `favorites.user_id` (`drizzle/0000:96,100`): `DELETE /me` purga sessões e
  tokens OAuth, dentro de transação.
- `UNIQUE(email)` em `user` e `UNIQUE(token)` em `session` — este último é o índice do caminho
  quente de resolução de sessão.
- Coluna `issuer` em `account` presente e registrada em D-43 — divergência decidida, não deriva.

**Penalizações (−45):**

| Peso | GAP    | Fato                                                                                                                                                                                                                                                                                                                       |
| :--: | :----- | :------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| −25  | GAP-09 | Tabelas `two_factor` e `passkey` e coluna `user.two_factor_enabled` inexistentes — a modelagem bloqueia o domínio 3 mesmo que a configuração fosse adicionada                                                                                                                                                              |
| −12  | GAP-19 | Sem índice em `session.user_id`, `account.user_id`, `verification.identifier`: cascade de exclusão e consulta de verificação fazem sequential scan                                                                                                                                                                         |
|  −8  | GAP-16 | `account` sem `UNIQUE(provider_id, account_id)`. O linking do Better Auth é read-then-write sem guarda no banco (`link-account.mjs:78`), então callbacks OAuth concorrentes duplicam a identidade do provedor — a mesma classe de corrida que o projeto tratou deliberadamente em `playlist_tracks` e `favorites` por D-47 |

**Requisitos que auditorias anteriores omitiram:** `passkey.credential_id` precisa de `unique` —
sem ele o mesmo credential WebAuthn pode ser registrado sob dois usuários, tornando ambígua a
resolução de identidade no `sign-in` — e `aaguid` é exigido pelo plugin.

---

### 3.7 · Privacidade, anti-enumeração, logs e segredos — **65 / 100** (peso 5 %)

**Sustentando a nota:**

- **Redaction D-22 completa no logger da aplicação** (`app.ts:38-48`): `authorization`, `cookie`,
  `set-cookie`, `set-auth-token`, `*.password`, `*.token`.
- **Handler de erro sem vazamento** (`error-handler.plugin.ts:64-72`): string fixa,
  `details: null`, sem stack, `cause`, fragmento SQL ou mensagem de driver. `details` só carrega
  `error.validation` do Zod.
- **Sign-in e forgot-password não enumeram** — dummy hash e resposta única
  (`sign-in.mjs:319-338`), provado pelo T15 (`auth-email.test.ts:255`).
- **Higiene de segredos:** mínimo real de 32 caracteres sem default de produção (`env.ts:10`),
  `process.exit(1)` no boot (`:113-123`), leitura exclusiva via `env` (`auth.config.ts:62`),
  `.env.example` só com placeholders, ESLint barrando `process.env` fora de `src/config/env.ts`.

**Penalizações (−35):**

| Peso | GAP       | Fato                                                                                                                                                                                                                                                              |
| :--: | :-------- | :---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| −15  | GAP-08    | `/sign-up/email` é oráculo de enumeração: 422 = cadastrado, 200 = novo. A resposta genérica só é emitida quando `requireEmailVerification` **ou** `autoSignIn: false` (`sign-up.mjs:163`) — nenhum dos dois está configurado. O teste T6 consagra o comportamento |
| −10  | GAP-15    | `mailer.ts:5-13` cria um **segundo logger Pino sem `redact`**, fora do alcance de D-22, e loga a URL de reset com **token válido por 1 hora** (`:45-55`). O caminho Resend loga destinatário e erro cru do provedor em produção                                   |
|  −6  | GAP-23    | O logger interno do Better Auth emite endereços de e-mail em stdout (`sign-up.mjs:202`, `sign-in.mjs:323/330/337`), fora da redaction do Pino                                                                                                                     |
|  −4  | GAP-21/27 | `BETTER_AUTH_SECRET` literal em `ci.yml:23` (é o placeholder, nada real vaza, mas viola a política do repositório); `x-request-id` do cliente logado sem truncar                                                                                                  |

---

## 4. Aderência à documentação oficial do Better Auth

| Referência                                                                     | Aderência | Observação                                                                                                                                                                                                                                                                                                                 |
| :----------------------------------------------------------------------------- | :-------: | :------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [Fastify Integration](https://better-auth.com/docs/integrations/fastify)       | **90 %**  | Rota curinga com ponte Fetch correta; o tratamento de múltiplos `Set-Cookie` via `getSetCookie()` (D-44) é **superior** ao exemplo oficial. CORS registrado antes do handler, como recomendado. _Falta:_ `advanced.ipAddress.trustedProxies` para que o repasse literal de headers não vire bypass de rate limit (GAP-04). |
| [Email & Password](https://better-auth.com/docs/authentication/email-password) | **75 %**  | Sign-up/in/out, verificação e reset funcionais; `scrypt` padrão; limites de senha corretos. _Falta:_ `revokeSessionsOnPasswordReset` (GAP-07); proteção de enumeração no sign-up, que a própria documentação condiciona a `requireEmailVerification` ou `autoSignIn: false` (GAP-08); `/change-password` sem teste.        |
| [Google OAuth](https://better-auth.com/docs/authentication/google)             | **100 %** | Escopos mínimos, provedor confiável, par validado no boot.                                                                                                                                                                                                                                                                 |
| [GitHub OAuth](https://better-auth.com/docs/authentication/github)             | **100 %** | `user:email` garante o e-mail mesmo quando privado no perfil.                                                                                                                                                                                                                                                              |
| [Facebook OAuth](https://better-auth.com/docs/authentication/facebook)         | **100 %** | Escopo mínimo e exclusão consciente de `trustedProviders` (D-46-b).                                                                                                                                                                                                                                                        |
| [Two Factor](https://better-auth.com/docs/plugins/2fa)                         |  **0 %**  | Plugin não registrado; nenhum dos 9 endpoints existe; schema ausente.                                                                                                                                                                                                                                                      |
| [Passkey](https://better-auth.com/docs/plugins/passkey)                        |  **0 %**  | Pacote não instalado; plugin não registrado; schema ausente.                                                                                                                                                                                                                                                               |

**Retificações desta auditoria** (alegações anteriores não confirmadas na verificação):

- **Verbo `DELETE` na rota curinga — improcedente.** A documentação do Passkey lista
  `POST /passkey/delete-passkey`; o Better Auth usa `POST` para toda mutação.
  `['GET','POST','OPTIONS']` é suficiente.
- **`revokeOtherSessions` — nome incorreto.** É parâmetro do corpo de `/change-password`, não chave
  de configuração. A correta é `revokeSessionsOnPasswordReset`.
- **Cookies sem `Secure` em produção — improcedente.** `cookies/index.mjs:23,34-35` deriva `secure`
  de baseURL https **ou** `NODE_ENV === 'production'`. O único problema real do bloco de cookies é
  a deriva do nome no OpenAPI, que ignora o prefixo `__Secure-` (GAP-20).
- **`accountLinking` como account takeover — improcedente.** Ver §3.2.

---

## 5. Mapeamento de ameaças

| Ameaça                                        | OWASP / STRIDE  | Mitigação atual                                                                 |                           Risco residual                           |
| :-------------------------------------------- | :-------------: | :------------------------------------------------------------------------------ | :----------------------------------------------------------------: |
| Broken Object Level Authorization (IDOR)      |      API1       | `userId` no `WHERE` + 404 uniforme (D-31), 13/13 rotas com guard                |                             **Mínimo**                             |
| Broken Object Property Level Auth.            |      API3       | Zod estrito na entrada; response schema + projeção explícita na saída           |                             **Mínimo**                             |
| Account takeover via OAuth linking            |    Spoofing     | `requireLocalEmailVerified` default `true`; Facebook fora de `trustedProviders` |                             **Mínimo**                             |
| Open redirect                                 |      API8       | `disableOriginCheck: false`, `trustedOrigins` fechado, T24/T25                  |                             **Mínimo**                             |
| SQL injection                                 |      API8       | Drizzle paramétrico, zero `sql.raw`, ids validados como UUID                    |                             **Mínimo**                             |
| Unrestricted Resource Consumption             |      API4       | Rate limit presente e **inerte em produção**                                    |                        **Crítico** — GAP-01                        |
| Bypass de rate limit / DoS por header forjado |      API4       | Nenhuma — `X-Forwarded-For` aceito sem `trustedProxies`                         |                        **Crítico** — GAP-04                        |
| Credential stuffing / brute force             |      API2       | 10/min por IP, só em produção, e contornável                                    |         **Alto** — GAP-06, sem 2FA, sem bloqueio por conta         |
| Mail bombing / abuso de reset                 |      API4       | Regra 3/h **só no alias**                                                       |                         **Alto** — GAP-05                          |
| Broken Authentication                         |      API2       | Sessão opaca, 7 d, rotação 24 h                                                 | **Alto** — sem 2FA (GAP-02/03), sessão sobrevive ao reset (GAP-07) |
| Enumeração de usuários                        | Info disclosure | Correta em sign-in e forgot-password; **ausente no sign-up**                    |                         **Alto** — GAP-08                          |
| Vazamento de token em log                     | Info disclosure | D-22 no logger da app; **mailer tem logger próprio sem redaction**              |                         **Médio** — GAP-15                         |
| Squatting de e-mail / relay de spam           |      Abuso      | Nenhuma — verificação não é exigida                                             |                         **Médio** — GAP-14                         |
| Sequestro de sessão em trânsito               | Info disclosure | Cookie `httpOnly` + `Secure` + `__Secure-` em produção                          |                             **Mínimo**                             |
| Reconhecimento de superfície                  | Info disclosure | Nenhuma                                                                         |                         **Médio** — GAP-17                         |

---

## 6. Roteiro de recuperação do score — sprints autorizados

| Sprint     | Título                                                                                                                | GAPs                           | Ganho | Acumulado |
| :--------- | :-------------------------------------------------------------------------------------------------------------------- | :----------------------------- | :---: | :-------: |
| **F5-S02** | [Blindagem de borda e rate limiting](../sprints/fase-5-producao/F5-S02-blindagem-de-borda-e-rate-limit.md)            | 01, 04, 05, 06, 10, 17, 21, 27 | +7.2  | **65.5**  |
| **F5-S03** | [Recuperação de conta e anti-enumeração](../sprints/fase-5-producao/F5-S03-recuperacao-de-conta-e-anti-enumeracao.md) | 07, 08, 14, 15, 22, 24, 25     | +5.4  | **70.9**  |
| **F5-S04** | [Sessão, schema e contrato](../sprints/fase-5-producao/F5-S04-sessao-schema-e-contrato.md)                            | 13, 16, 19, 20, 23, 26         | +4.2  | **75.1**  |
| **F5-S05** | [Two Factor](../sprints/fase-5-producao/F5-S05-two-factor.md)                                                         | 02, 09 (2FA)                   | +13.5 | **88.6**  |
| **F5-S06** | [Passkey / WebAuthn](../sprints/fase-5-producao/F5-S06-passkey-webauthn.md)                                           | 03, 09 (passkey)               | +8.5  | **97.1**  |
| **F5-S07** | [Rate limit distribuído e origens](../sprints/fase-5-producao/F5-S07-rate-limit-distribuido.md)                       | 11, 12, 18                     | +2.0  | **99.1**  |

### Nota por domínio, antes e depois

|  #  | Domínio                                       | Peso | Hoje | Projetado | Por quê o projetado não é 100                                        |
| :-: | :-------------------------------------------- | :--: | :--: | :-------: | :------------------------------------------------------------------- |
|  1  | Autenticação core e gestão de sessões         | 20 % |  70  |  **98**   | sem tela de gestão de dispositivos; `trustDevice` desligado por D-53 |
|  2  | Federação de identidade e OAuth 2.0           | 15 % |  90  |  **100**  | —                                                                    |
|  3  | Multifator e passwordless                     | 20 % |  0   |  **100**  | —                                                                    |
|  4  | Autorização, IDOR e propriedade de objetos    | 20 % | 100  |  **100**  | já era o ponto forte; nenhum sprint o toca                           |
|  5  | Proteção de borda, headers e rate limiting    | 10 % |  20  |  **95**   | réplica única até `RATE_LIMIT_REDIS_URL` existir (D-55)              |
|  6  | Modelagem relacional e integridade de schema  | 10 % |  55  |  **100**  | —                                                                    |
|  7  | Privacidade, anti-enumeração, logs e segredos | 5 %  |  65  |  **100**  | —                                                                    |
|     | **TOTAL**                                     | 100% | 58.3 | **99.1**  |                                                                      |

**Os 0.9 que faltam são declarados, não esquecidos.** Enquanto a aplicação rodar com uma única
réplica, o limitador global do Fastify conta em memória e isso é suficiente; ligar o Redis
(`pnpm add ioredis` + `RATE_LIMIT_REDIS_URL`) leva o domínio 5 a 100 e o total a **100.0**, e o
seam para isso é entregue por F5-S07 sem custo de código futuro. Preferimos declarar a restrição
a fingir que ela não existe.

### Ordem: por que ela é rígida

**F5-S02 é a de maior retorno por esforço** — configuração, nenhum contrato novo, nenhuma
migração — e elimina o achado crítico e o bypass de rate limit de uma vez. Dentro dela,
**GAP-01, GAP-04 e GAP-10 entram no mesmo commit**: corrigir o `global` sem `trustProxy` e sem
`trustedProxies` troca um problema por outro (auto-DoS global).

As dependências entre sprints estão em [`docs/sprints/README.md`](../sprints/README.md). A regra
que as ancora é **D-49**: `F5-S08` (deploy) só roda depois de `F5-S07`. **Não se coloca em
produção uma aplicação com 27 achados abertos, um deles crítico.**

---

## 7. Conclusão

A aplicação acerta, com margem confortável, aquilo que a maioria das APIs erra: **o controle de
acesso a objetos**. Isolamento por `userId` na cláusula `WHERE`, 404 uniforme de D-31, guard em
todas as rotas privadas, defesa dupla contra vazamento de credencial e validação Zod integral
formam uma base que não precisa ser reescrita — precisa ser preservada. Duas passagens
independentes procuraram IDOR e nenhuma encontrou.

O que reprova o score é assimétrico e concentrado em três frentes, nenhuma delas arquitetural:

- **Uma linha invertida** em `rate-limit.plugin.ts:8` desliga a proteção contra consumo de recursos
  exatamente no ambiente onde ela existe para atuar.
- **Uma configuração ausente** (`advanced.ipAddress.trustedProxies`) faz o rate limit de
  autenticação falhar nas duas topologias possíveis — desarmado sem proxy, auto-DoS com proxy.
- **Um domínio inteiro de 20 % de peso** — multifator — não foi iniciado.

Corrigidos F5-S02 a F5-S04 e entregues 2FA e Passkey, a API alcança **99.1/100** sem tocar em
nenhuma decisão de arquitetura — só de configuração, schema e cobertura.

Três GAPs colidiam com ADRs vigentes e com testes que consagravam o comportamento atual. **Essas
decisões foram tomadas** e estão registradas, com contexto, opções e consequência:

| Questão pendente na auditoria            | Decisão                                                         | ADR                      |
| :--------------------------------------- | :-------------------------------------------------------------- | :----------------------- |
| Sessões sobrevivem ao reset de senha?    | Não. `revokeSessionsOnPasswordReset: true`; T20 é invertido     | **D-52** (revoga D-46-e) |
| Verificação de e-mail continua opcional? | Não. `requireEmailVerification: true`; o helper E2E é reescrito | **D-51** (revoga D-46-a) |
| Aprovar `@better-auth/passkey`?          | Sim; `rpID` derivado de `BETTER_AUTH_URL`                       | **D-54**                 |
| Redis ou PostgreSQL no rate limit?       | PostgreSQL no Better Auth; Redis como seam opcional             | **D-55**                 |
| Swagger em produção: Basic Auth ou fora? | Fora; o spec continua versionado em `docs/openapi.json`         | **D-56**                 |

Mais **D-49** (ordem da Fase 5), **D-50** (topologia de proxy) e **D-57** (logger único).

A justificativa de D-46-a — "quebraria `signUpAndGetToken`" — não sobreviveu ao exame: o helper é
reescrito em quinze linhas usando o `outbox` que já existe, e o custo do contrário eram dois
vetores de abuso permanentes em produção. **Conveniência de teste não paga risco de produção.**

**Nenhuma linha de código foi alterada nesta auditoria nem no replanejamento.** O que existe são
artefatos: nove ADRs, uma spec normativa e seis sprint briefs. Quem toca em código são os agentes
do Antigravity, um sprint por PR, com o portão da spec `08` §9 em `F5-S09`.
