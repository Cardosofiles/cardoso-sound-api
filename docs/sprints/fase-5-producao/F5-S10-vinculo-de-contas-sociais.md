# F5-S10 — Vínculo de Contas Sociais (área administrativa)

|                |                                                                                   |
| -------------- | --------------------------------------------------------------------------------- |
| **Fase**       | F5 — Produção · roda **entre F5-S07 e F5-S08** (o número é identidade, não ordem) |
| **Branch**     | `feature/f5s10-vinculo-de-contas-sociais`                                         |
| **Depende de** | F5-S04 (índice único de `account`, GAP-16) e F5-S07                               |
| **Entrega**    | R46, R47, R48 · D-58                                                              |

> **Sprint de política e contrato, não de implementação.** As três rotas **já respondem hoje** —
> a coringa de `auth.plugin.ts:33-38` monta o handler inteiro do Better Auth. O que falta é
> decisão gravada em `auth.config.ts`, contrato publicado e teste. A alteração de código-fonte é
> de **duas chaves**; o volume do sprint está nos testes e na documentação.
>
> **Nenhum handler novo. Nenhuma migração. Nenhuma dependência nova.**

---

## 0. Pré-requisitos

Nenhum trabalho humano. Docker rodando (a suíte de integração usa Testcontainers).

F5-S04 precisa estar **mergeada**: o índice `account_provider_account_unique` é a guarda de banco
da corrida de vínculo (D-58, consequência final). Se `pnpm db:migrate` não tiver aplicado esse
índice, **pare e reporte**.

---

## 1. Prompt de abertura

```
Leia .agents/memory/PROGRESS.md e .agents/memory/DECISIONS.md para se contextualizar.
Leia D-58 (é a decisão que este sprint implementa, inteira), D-31 (recurso de outro
usuário responde 404/indistinguível), D-13 (bearer e cookie simultâneos) e D-44
(ponte Set-Cookie) — as quatro governam este sprint.
Leia .agents/memory/F3-S03.md (entregou o login social e o padrão de teste com
overrideSocialProviders) e .agents/memory/F5-S04.md (entregou o índice único de
account e o envelope RFC 7807 que estas rotas passam a devolver).

Sprint alvo: docs/sprints/fase-5-producao/F5-S10-vinculo-de-contas-sociais.md
Specs obrigatórias: docs/specs/04-autenticacao-e-seguranca.md (§1.1 e §1.3),
                    docs/specs/03-contrato-da-api.md (§2 e §5.1),
                    docs/specs/05-testes.md

ANTES de escrever qualquer código, execute a §5.1: confirme no runtime instalado que
allowDifferentEmails, freshAge e as três rotas existem com a forma que este sprint
assume, e confirme que o índice account_provider_account_unique está aplicado no banco.
Reporte as duas coisas.

Este sprint NÃO escreve handler, NÃO gera migração e NÃO adiciona dependência.
Se você concluir que precisa de qualquer uma das três, PARE e reporte.

Siga o protocolo de docs/specs/07-protocolo-dos-agentes.md:
entre em modo de planejamento, apresente o plano COMPLETO da sprint e
AGUARDE minha autorização explícita antes de escrever qualquer código.

Não toque em nenhum arquivo fora do blast radius declarado no sprint.
```

---

## 2. Objetivo

Fechar a última superfície não documentada da API: as três rotas de vínculo de conta social que a
lib monta e que a área de conta do app Flutter precisa. Hoje elas respondem **sem política
decidida, sem contrato e sem teste** — o pior dos três estados.

Cinco entregas:

1. **`allowDifferentEmails: true`** (D-58 a). Sem isso, quem tem e-mail primário do GitHub
   diferente do e-mail de cadastro recebe `LINKING_DIFFERENT_EMAILS_NOT_ALLOWED` e não consegue
   vincular. É o caso comum, não a exceção.
2. **`session.freshAge` explícito** (D-58 c). O valor não muda — 24 h, igual ao default. O que
   muda é ele deixar de ser herdado silenciosamente e passar a ser contrato: R48 responde
   `403 SESSION_NOT_FRESH` e o app faz step-up.
3. **R46, R47 e R48 no contrato** (spec `03` §5.1), com o corpo de erro de cada caminho.
4. **Cobertura de teste** dos quatro invariantes que o app depende: isolamento entre usuários, a
   última conta não sai, e-mails diferentes passam, Facebook não passa.
5. **Registrar por escrito que o Facebook não vincula** (D-58 b) — resposta permanente, não bug a
   ser investigado depois.

**Não faz parte deste sprint:** confiar no Facebook · `allowUnlinkingAll` · `updateUserInfoOnLink`
· rota de step-up dedicada · qualquer alteração em `emailAndPassword`, `socialProviders` ou
`rateLimit` · qualquer alteração de schema.

---

## 3. Contratos esperados

### 3.1 `auth.config.ts` — duas chaves, e só

```ts
account: {
  accountLinking: {
    enabled: true,                    // inalterado
    trustedProviders: ['google', 'github'],  // INALTERADO — D-58 (b)
    allowDifferentEmails: true,       // novo — D-58 (a)
  },
},
session: {
  expiresIn: 60 * 60 * 24 * 7,        // inalterado
  updateAge: 60 * 60 * 24,            // inalterado
  freshAge: 60 * 60 * 24,             // novo — D-58 (c), mesmo valor do default
},
```

> **`trustedProviders` não recebe `'facebook'`.** Se você achar que deveria, leia a spec `04` §1.1
> e D-58 (b) e **pare e reporte** — não é decisão sua nem deste sprint.
>
> Se F5-S04 já tiver acrescentado `session.cookieCache`, **preserve-o**. `freshAge` é acrescentado
> ao lado, não no lugar.

### 3.2 Contrato HTTP — normativo em spec `03` §5.1

| Rota                            | Sucesso                            | Erros que o app trata                                                                                                       |
| ------------------------------- | ---------------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| `GET /api/auth/list-accounts`   | `200` array de contas              | `401` sem sessão                                                                                                            |
| `POST /api/auth/link-social`    | `200` `{ url, redirect, status? }` | `401` `LINKING_NOT_ALLOWED` · `404` `PROVIDER_NOT_FOUND` / `ID_TOKEN_NOT_SUPPORTED` · `409` `SOCIAL_ACCOUNT_ALREADY_LINKED` |
| `POST /api/auth/unlink-account` | `200` `{ status: true }`           | `400` `FAILED_TO_UNLINK_LAST_ACCOUNT` / `ACCOUNT_NOT_FOUND` · `403` `SESSION_NOT_FRESH`                                     |

Duas propriedades que **valem como contrato** e precisam de teste:

- **`list-accounts` devolve array cru, não o envelope de lista da spec `03` §1.** O corpo é da
  lib. Não invente `{ data, meta }` — isso exigiria handler próprio, que este sprint proíbe.
- **`unlink-account` com `accountId` de outro usuário responde `400 ACCOUNT_NOT_FOUND`**, o mesmo
  que `accountId` inexistente. Indistinguível, no espírito de D-31. A lib chega nisso sozinha:
  `account.mjs:277` procura o id **dentro** das contas do usuário da sessão.

### 3.3 Contrato de step-up para o Flutter

```
POST /unlink-account  →  403 { code: "SESSION_NOT_FRESH", ... }
   →  app pede a senha
   →  POST /sign-in/email  →  200 + set-auth-token novo
   →  POST /unlink-account (token novo)  →  200
```

**Nenhuma rota nova é criada.** O step-up é o próprio R10.

---

## 4. Blast radius

### Criar

```
tests/unit/modules/auth/auth-linking-config.test.ts
tests/integration/auth-account-linking.test.ts
```

### Editar

```
src/modules/auth/auth.config.ts     # allowDifferentEmails + freshAge (§3.1) — NADA MAIS
docs/openapi.json                   # SÓ se o export mudar; ver a nota abaixo
.agents/memory/PROGRESS.md
.agents/memory/F5-S10.md
```

**Não toque em:** `src/modules/auth/auth.plugin.ts` · `src/modules/auth/auth.routes.ts` ·
`src/db/schema/**` · `drizzle/**` · `src/config/env.ts` · `src/app.ts` · `src/plugins/**` ·
`src/modules/{users,playlists,favorites,artists,tracks}/**` · `package.json` ·
`docs/specs/**` · `.agents/memory/DECISIONS.md`.

> **`docs/specs/**` está fora do blast radius de propósito.** A spec `03` §5.1 e a spec `04` §1.3
> **já foram escritas** com o contrato deste sprint. Sua tarefa é fazer o código e os testes
> baterem com elas, não reescrevê-las. Divergência entre spec e runtime é motivo de **parar e
> reportar**, nunca de editar a spec.
>
> **`DECISIONS.md` está fora.** D-58 já existe e cobre tudo. Se você precisou decidir algo,
> **pare e reporte**.
>
> **`docs/openapi.json`**: a coringa registra as rotas com `schema: { hide: true }`, então R46–R48
> **não devem aparecer** no export. Rode `pnpm openapi:export` e confirme que o diff é **vazio**.
> Diff não-vazio significa que você mexeu em algo fora do escopo.

---

## 5. Passo a passo

### 5.1 Confirmar o runtime e o banco — antes de qualquer código

```bash
# (a) as três rotas existem e com que middleware?
grep -nE 'createAuthEndpoint\("/(list-accounts|link-social|unlink-account)"' \
  node_modules/better-auth/dist/api/routes/account.mjs
grep -n "freshSessionMiddleware" node_modules/better-auth/dist/api/routes/account.mjs

# (b) as duas chaves são lidas onde este sprint assume?
grep -rn "allowDifferentEmails" node_modules/better-auth/dist/api/routes/ node_modules/better-auth/dist/oauth2/
grep -rn "freshAge" node_modules/better-auth/dist/context/create-context.mjs

# (c) o índice único de F5-S04 está aplicado?
docker compose exec -T postgres psql -U cardoso -d cardoso_sound \
  -c "SELECT indexname FROM pg_indexes WHERE tablename = 'account';"
```

Esperado em (a): `/unlink-account` usa `freshSessionMiddleware`; as outras duas usam
`sessionMiddleware`. Esperado em (c): `account_provider_account_unique` na lista. **Qualquer
divergência: pare e reporte.**

### 5.2 As duas chaves

Aplique a §3.1. É a única alteração em `src/**` deste sprint. Confira o diff:

```bash
git diff --stat src/
# esperado: 1 file changed, ~2 insertions
```

Se `git diff --stat src/` mostrar mais de um arquivo, você saiu do escopo.

### 5.3 Teste unitário de configuração (T1–T4)

`createAuth()` devolve o objeto com `.options`. Asserte contra as opções resolvidas, não contra o
texto do arquivo:

```ts
const options = createAuth().options;
expect(options.account?.accountLinking?.allowDifferentEmails).toBe(true);
expect(options.account?.accountLinking?.trustedProviders).toEqual(['google', 'github']);
expect(options.session?.freshAge).toBe(60 * 60 * 24);
```

O terceiro caso é o que trava a regressão que importa: **`trustedProviders` não pode ganhar
`'facebook'` sem revogar D-58 (b)**. O teste é a guarda.

### 5.4 Testes de integração (T5–T18)

Reaproveite integralmente o padrão de `tests/integration/auth-social.test.ts`: `startTestDatabase`
→ `setPool` → `setAuthInstanceForTest(createAuth({ overrideSocialProviders: { ... } }))` →
`buildApp()`, com `truncateAll` em `beforeEach` e `resetAuthInstanceForTest()` em `afterAll`.

Registre **google, github e facebook** no override — o teste do Facebook (T13) precisa que ele
esteja registrado, senão você mede `PROVIDER_NOT_FOUND` em vez de `LINKING_NOT_ALLOWED`, que é
outra coisa.

**Como forjar uma segunda conta vinculada** (para T9, T10 e T12), sem falar com provedor nenhum:
insira a linha em `account` direto pelo Drizzle, com `providerId: 'google'`, `accountId` qualquer e
`userId` do usuário da sessão. É o mesmo estado que o callback deixaria.

**Como forjar sessão velha** (T14):

```sql
UPDATE session SET created_at = now() - interval '25 hours' WHERE token = $1;
```

`freshSessionMiddleware` lê `session.session.createdAt` do banco. **Se F5-S04 já ligou
`cookieCache`, o `createdAt` pode vir do cookie e o teste passa quando não deveria** — nesse caso
force a leitura do banco usando o header `Authorization: Bearer`, que não carrega o cache de
cookie. Se ainda assim não reproduzir, degrade para asserção direta sobre o middleware e
**declare isso em `F5-S10.md`**.

### 5.5 E-mails diferentes (T11) — o caso que justifica D-58 (a)

O caminho honesto sem rede: crie o usuário com `a@exemplo.com`, insira em `account` uma linha
`providerId: 'github'` para ele, e verifique via R46 que a conta aparece — o que prova que o
estado é alcançável. Para exercitar a **regra** de `allowDifferentEmails`, o alvo é
`POST /link-social` com `idToken` de um provedor que a lib aceita (`google`), com o e-mail do
perfil diferente do e-mail da sessão.

Se stubar o `getUserInfo` do provedor no `overrideSocialProviders` for viável (a lib aceita
`options.getUserInfo`, `google.mjs:93`), use isso e asserte `200`. **Se não for viável sem sair do
blast radius, asserte o inverso e diga por quê em `F5-S10.md`**: com a chave desligada a resposta
seria `401 LINKING_DIFFERENT_EMAILS_NOT_ALLOWED`, e o teste unitário T2 já garante que a chave
está ligada. Asserção fraca declarada vale mais que asserção forte fingida.

---

## 6. Casos de teste obrigatórios

### Unit — `tests/unit/modules/auth/auth-linking-config.test.ts`

| #   | Caso                                                  | Esperado                                              |
| --- | ----------------------------------------------------- | ----------------------------------------------------- |
| T1  | `options.account.accountLinking.enabled`              | `true`                                                |
| T2  | `options.account.accountLinking.allowDifferentEmails` | `true`                                                |
| T3  | `options.account.accountLinking.trustedProviders`     | **exatamente** `['google','github']` — sem `facebook` |
| T4  | `options.session.freshAge`                            | `86400`                                               |

### Integração — `tests/integration/auth-account-linking.test.ts`

| #   | Caso                                                              | Esperado                                                    |
| --- | ----------------------------------------------------------------- | ----------------------------------------------------------- |
| T5  | `GET /list-accounts` sem sessão                                   | `401`                                                       |
| T6  | `GET /list-accounts` após sign-up por e-mail                      | `200`, array com **1** item, `providerId: 'credential'`     |
| T7  | O corpo de T6                                                     | é **array**, não `{ data, meta }`                           |
| T8  | `GET /list-accounts` com bearer do usuário B                      | só as contas de B — zero vazamento                          |
| T9  | `POST /unlink-account` com a única conta                          | `400` `FAILED_TO_UNLINK_LAST_ACCOUNT`                       |
| T10 | Com 2 contas, `unlink` de uma                                     | `200` `{ status: true }`, R46 passa a devolver 1            |
| T11 | `link-social` google com e-mail diferente do da sessão            | `200` — ou asserção degradada declarada (§5.5)              |
| T12 | `unlink-account` com `accountId` **de outro usuário**             | `400` `ACCOUNT_NOT_FOUND` — nunca `403`, nunca vazamento    |
| T13 | `link-social` `{ provider: 'facebook' }`                          | `401` `LINKING_NOT_ALLOWED` — **contrato, D-58 b**          |
| T14 | `unlink-account` com sessão de 25 h                               | `403` `SESSION_NOT_FRESH`                                   |
| T15 | Após T14, sign-in novo e repetir o `unlink`                       | `200` — o step-up de §3.3 funciona                          |
| T16 | `link-social` `{ provider: 'github', idToken: {...} }`            | `404` `ID_TOKEN_NOT_SUPPORTED`                              |
| T17 | `link-social` `{ provider: 'google', callbackURL }` sem `idToken` | `200`, `redirect: true`, `url` contém `accounts.google.com` |
| T18 | `link-social` com provedor não registrado (`twitter`)             | `4xx`, **nunca 500**                                        |
| T19 | Suíte E2E completa (`tests/e2e/**`)                               | verde — nada regrediu                                       |

> **T12 é o caso de segurança do sprint.** Ele prova que a área administrativa não é IDOR: um
> `accountId` válido de terceiro é indistinguível de um inexistente.

---

## 7. Definition of Done

```bash
docker compose up -d
pnpm typecheck && pnpm lint && pnpm format && pnpm test && pnpm build
pnpm openapi:export && git diff --stat docs/openapi.json   # diff VAZIO
git diff --stat src/                                        # 1 arquivo, ~2 linhas
```

**Verificação manual do contrato:**

```bash
pnpm dev
TOKEN=$(curl -s -D- -o/dev/null -X POST localhost:3333/api/auth/sign-in/email \
  -H 'content-type: application/json' \
  -d '{"email":"...","password":"..."}' | grep -i set-auth-token | cut -d' ' -f2 | tr -d '\r')

curl -s localhost:3333/api/auth/list-accounts -H "Authorization: Bearer $TOKEN" | jq
# esperado: array, 1 item, providerId "credential"

curl -s -X POST localhost:3333/api/auth/link-social -H "Authorization: Bearer $TOKEN" \
  -H 'content-type: application/json' -d '{"provider":"facebook"}' | jq
# esperado: 401 LINKING_NOT_ALLOWED — é contrato, não defeito
```

- [ ] T1–T19 verdes
- [ ] `git diff --stat src/` mostra **um** arquivo
- [ ] `trustedProviders` continua `['google', 'github']`
- [ ] Nenhuma migração gerada; `drizzle/` intocado
- [ ] `package.json` intocado — nenhuma dependência nova
- [ ] `docs/specs/**` intocado
- [ ] `docs/openapi.json` sem diff
- [ ] Suítes de F3, F4 e a E2E verdes
- [ ] PR verde; memória atualizada

**CI vermelho:** protocolo da spec `06` §5 — até 3 tentativas, depois **para e reporta**.

---

## 8. Armadilhas conhecidas

1. **Acrescentar `'facebook'` a `trustedProviders` "para o teste passar".** T13 espera `401`. O
   Facebook nunca devolve `emailVerified: true` neste stack (spec `04` §1.1, com as linhas do
   provider). Passar a confiar nele é revogar D-58 (b) e a spec `04` §1.1 — decisão do dono.
2. **Escrever handler próprio para `/list-accounts` "para padronizar o envelope".** A coringa já
   responde. Um handler novo em `/api/auth/*` colide com D-45 e com a rota da lib.
3. **Sobrescrever `session` em vez de acrescentar `freshAge`.** Se F5-S04 já pôs `cookieCache` ali,
   substituir o bloco derruba a otimização e regride GAP-13.
4. **`cookieCache` mascarando T14.** Sessão cacheada no cookie pode devolver um `createdAt` que
   não é o do banco. Use bearer, ou degrade a asserção e declare.
5. **Esperar `403` em T12.** É `400 ACCOUNT_NOT_FOUND`. A lib procura o id dentro das contas da
   sessão, então "de outro usuário" e "inexistente" são o mesmo caminho — e é o comportamento
   correto por D-31.
6. **Achar que `allowDifferentEmails` conserta o `/sign-in/social`.** Não conserta: lá o casamento
   é por e-mail e a chave nem é lida. O que governa aquele caminho é
   `requireEmailVerification` (D-51, F5-S03).
7. **Testar o Facebook sem registrá-lo no `overrideSocialProviders`.** Você mede
   `PROVIDER_NOT_FOUND` e acredita ter provado `LINKING_NOT_ALLOWED`.
8. **Tentar vincular GitHub por `idToken`.** A lib não declara `idToken` para o GitHub; a resposta
   é `404 ID_TOKEN_NOT_SUPPORTED` e isso é T16, não um bug a corrigir.
9. **Gerar migração.** Este sprint não toca em schema. `pnpm db:generate` aqui só pode produzir
   ruído — se produzir SQL, alguma coisa está errada e você deve **parar e reportar**.
10. **Editar a spec para caber no código.** É o inverso do fluxo. Spec diverge do runtime ⇒ pare e
    reporte.

---

## 9. Registro na memória

- **`DECISIONS.md`** — **nada a acrescentar.** D-58 já cobre as cinco decisões. Se você precisou
  decidir algo, **pare e reporte**.
- **`PROGRESS.md`** — F5-S10 ✅, próximo = F5-S08. Acrescente R46–R48 em **Contratos já
  entregues**.
- **`F5-S10.md`** — (a) o resultado literal da §5.1, incluindo se o índice de F5-S04 estava
  aplicado; (b) como T11 e T14 foram medidos, ou por que a asserção precisou ser degradada — **o
  time do Flutter lê isto**; (c) o corpo de erro exato de cada caso de T13, T16 e T18, copiado da
  resposta real; (d) se o `openapi.json` teve diff e por quê.

---

## 10. Depois deste sprint

A área de conta do Flutter tem contrato fechado e testado, e a última superfície não documentada
da API deixa de existir. F5-S08 leva ao ar uma configuração de vínculo **decidida**, e a auditoria
de F5-S09 (spec `08` §9) passa a cobrir R46–R48 como qualquer outra rota.

Fica registrado como trabalho **não** feito, para quem vier depois: o Facebook não vincula. Mudar
isso exige um ADR novo que revogue D-58 (b) e a spec `04` §1.1 — e, antes dele, evidência de que o
provedor devolve um sinal de verificação de e-mail, que hoje ele não devolve.
