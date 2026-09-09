# F5-S05 — Two Factor: TOTP, OTP por E-mail e Backup Codes

|                |                                                          |
| -------------- | -------------------------------------------------------- |
| **Fase**       | F5 — Produção · **4º dos 6 sprints de blindagem** (D-49) |
| **Branch**     | `feature/f5s05-two-factor`                               |
| **Depende de** | F5-S04                                                   |
| **Entrega**    | R32–R40 · GAP-02 e a metade 2FA do GAP-09                |

> **Sprint de funcionalidade, não de correção.** Os quatro anteriores consertaram o que existia;
> este entrega um domínio inteiro que nunca foi iniciado. Grep por
> `twoFactor|otp|totp` em `src/` hoje: **zero ocorrências**.
>
> **Nenhuma dependência nova.** `twoFactor` vive em `better-auth/plugins`, pacote já instalado.
> A decisão está tomada em **D-53** — leia antes de planejar.

---

## 0. Pré-requisitos

Nenhum trabalho humano. Nenhuma credencial nova. O OTP sai pelo mailer já existente — no
transporte de memória em `test` e `development`, no Resend em produção.

Para a verificação manual da §7 você precisa de um app autenticador no celular
(Google Authenticator, Authy, 1Password, Aegis — qualquer um que leia `otpauth://`).

---

## 1. Prompt de abertura

```
Leia .agents/memory/PROGRESS.md e .agents/memory/DECISIONS.md para se contextualizar.
Leia D-53 (é a decisão que este sprint executa), D-13 (bearer + cookie),
D-39 (edição manual de migração) e D-40 (schemas do Better Auth).
Leia .agents/memory/F3-S03.md (entregou o mailer e os templates que você vai estender)
e .agents/memory/F5-S04.md (entregou o schema em que você vai acrescentar tabela).

Sprint alvo: docs/sprints/fase-5-producao/F5-S05-two-factor.md
Specs obrigatórias: docs/specs/08-blindagem-de-seguranca.md (§6.2, §7.1, §3.3),
                    docs/specs/02-modelo-de-dados.md,
                    docs/specs/04-autenticacao-e-seguranca.md (§1.2 — padrão do mailer)

Use o MCP context7 (ou leia node_modules/better-auth/dist/plugins/two-factor/) para
confirmar, na versão instalada, a assinatura de twoFactor(), de otpOptions.sendOTP,
e a lista exata de endpoints que o plugin monta. Confirme também o formato da resposta
de POST /sign-in/email quando o usuário tem 2FA ativo. Reporte antes de codar.

O schema é gerado por `pnpm dlx @better-auth/cli generate` e conferido contra a §3.2 do
sprint. A migração sai de `pnpm db:generate`, é revisada por você linha a linha, e só
então aplicada. `pnpm db:push` é proibido.

Siga o protocolo de docs/specs/07-protocolo-dos-agentes.md:
entre em modo de planejamento, apresente o plano COMPLETO da sprint e
AGUARDE minha autorização explícita antes de escrever qualquer código.

Não toque em nenhum arquivo fora do blast radius declarado no sprint.
```

---

## 2. Objetivo

Dar ao usuário um segundo fator — e dar à aplicação a **primeira defesa por conta** que ela terá.

Hoje toda proteção contra adivinhação de credencial é **por IP**. F5-S02 a tornou funcional, mas
IP não é identidade: uma botnet distribui, e a conta alvo não tem nenhum limite próprio. O plugin
`twoFactor` traz um contador compartilhado entre TOTP, OTP e backup codes que devolve
`429 ACCOUNT_TEMPORARILY_LOCKED` — é isso, tanto quanto o segundo fator em si, que este sprint
compra.

Três modalidades, uma decisão de produto em cada:

- **TOTP** — app autenticador, `otpauth://` via QR. É o fator forte e offline.
- **OTP por e-mail** — para quem não tem app autenticador. Mais fraco (o e-mail é o próprio canal
  de recuperação), mas é o que evita o usuário se trancar fora da conta.
- **Backup codes** — 10 códigos de uso único, exibidos **uma vez**.

**O 2FA é opcional por usuário** (`user.twoFactorEnabled`), nunca imposto no cadastro (D-53).

**Não faz parte deste sprint:** Passkey (F5-S06) · `trustDevice` (D-53 o desliga
explicitamente) · SMS · tela de gestão de dispositivos · impor 2FA a qualquer perfil.

---

## 3. Contratos esperados

### 3.1 Rotas — montadas pela lib, não por você

| #   | Rota                                              | Sessão exigida         |
| --- | ------------------------------------------------- | ---------------------- |
| R32 | `POST /api/auth/two-factor/enable`                | sim                    |
| R33 | `POST /api/auth/two-factor/disable`               | sim                    |
| R34 | `POST /api/auth/two-factor/get-totp-uri`          | sim                    |
| R35 | `POST /api/auth/two-factor/verify-totp`           | não (fluxo de sign-in) |
| R36 | `POST /api/auth/two-factor/send-otp`              | não (fluxo de sign-in) |
| R37 | `POST /api/auth/two-factor/verify-otp`            | não (fluxo de sign-in) |
| R38 | `POST /api/auth/two-factor/generate-backup-codes` | sim                    |
| R39 | `POST /api/auth/two-factor/verify-backup-code`    | não (fluxo de sign-in) |
| R40 | `POST /api/auth/two-factor/view-backup-codes`     | sim                    |

Todas passam pela coringa `/api/auth/*` que F3-S01 entregou. **Você não escreve rota.**
Confirme a lista na §5.1 — se a versão instalada montar um conjunto diferente, use o que ela
monta e **corrija esta tabela no PR**.

> **O verbo `DELETE` não é necessário.** O Better Auth usa `POST` para toda mutação;
> `['GET','POST','OPTIONS']` (`auth.plugin.ts:35`) cobre 100 % destes endpoints. **Não mexa na
> lista de métodos da coringa** — uma auditoria anterior errou nisso (spec `08` §7.2).

### 3.2 Schema — spec `08` §6.2

```ts
export const user = pgTable('user', {
  /* ... colunas existentes, intocadas ... */
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

Mais a reexportação em `src/db/schema/index.ts` — o `drizzleAdapter` recebe `* as schema` e
**não enxerga tabela que não esteja exportada no barrel**.

### 3.3 `auth.config.ts` — spec `08` §7.1

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

`trustDevice` **fica de fora** (D-53).

### 3.4 `templates.ts` — um template novo

```ts
export function twoFactorOtpEmail(input: { name: string; otp: string }): {
  subject: string;
  html: string;
};
```

Mesmo padrão de `verificationEmail` / `resetPasswordEmail`: função pura, HTML inline, sem
imagem externa, **escapando toda interpolação** (F5-S03 já corrigiu isso nos outros dois — não
reintroduza o defeito aqui).

### 3.5 `customRules` — 4 entradas novas

Acrescente ao `AUTH_RATE_LIMIT_RULES` que F5-S02 criou (spec `08` §3.3):

```ts
'/two-factor/verify-totp':        { window: 60,   max: 5 },
'/two-factor/verify-otp':         { window: 60,   max: 5 },
'/two-factor/send-otp':           { window: 3600, max: 5 },
'/two-factor/verify-backup-code': { window: 3600, max: 5 },
```

### 3.6 Mudança de contrato — o cliente Flutter precisa saber

Com 2FA ativo, `POST /sign-in/email` **deixa de devolver sessão** e passa a devolver algo como
`{ twoFactorRedirect: true }`. Confirme o formato exato na §5.1 e **documente em `F5-S05.md`**.
Sem isso, o app trata o login como falha.

---

## 4. Blast radius

### Criar

```
drizzle/000X_*.sql                                    # gerada, revisada
tests/unit/shared/email/two-factor-otp.test.ts
tests/integration/auth-two-factor.test.ts
tests/integration/schema-two-factor.test.ts
```

### Editar

```
src/db/schema/users.schema.ts        # coluna twoFactorEnabled + tabela twoFactor
src/db/schema/index.ts               # reexportação da tabela nova
src/modules/auth/auth.config.ts      # plugin twoFactor + 4 customRules
src/shared/email/templates.ts        # twoFactorOtpEmail
docs/openapi.json                    # SÓ se o spec mudar — confira o diff
.agents/memory/PROGRESS.md
.agents/memory/F5-S05.md
```

**Não toque em:** `src/modules/auth/auth.plugin.ts` (**especialmente a lista de métodos da
coringa** — §3.1) · `src/config/env.ts` · `src/app.ts` · `src/plugins/**` ·
`src/modules/{users,playlists,favorites,artists,tracks}/**` · `src/shared/email/mailer.ts` ·
`drizzle/` já aplicadas · `tests/e2e/**`.

> **`DECISIONS.md` não está na lista.** D-53 já registra tudo. Registre em `F5-S05.md` a versão
> exata do `better-auth` em que os callbacks foram validados.

> **`docs/openapi.json`**: os endpoints de `/api/auth/*` são `hide: true` na coringa
> (`auth.plugin.ts:37`), então o spec provavelmente **não muda**. Se o `--check` acusar diferença,
> entenda por quê antes de regenerar.

---

## 5. Passo a passo

### 5.1 Confirmar o plugin na versão instalada — antes de qualquer código

```bash
grep -rn "export.*twoFactor" node_modules/better-auth/dist/plugins/index.d.ts
ls node_modules/better-auth/dist/plugins/two-factor/
grep -rn "twoFactorRedirect" node_modules/better-auth/dist/ | head
grep -rn "ACCOUNT_TEMPORARILY_LOCKED\|maxAttempts" node_modules/better-auth/dist/plugins/two-factor/ | head
```

Reporte quatro coisas antes de codar:

1. A assinatura de `twoFactor()` — os nomes de `totpOptions`, `otpOptions`,
   `skipVerificationOnEnable` conferem?
2. A lista real de endpoints montados (compare com a §3.1).
3. O formato da resposta de `/sign-in/email` com 2FA ativo (§3.6).
4. O bloqueio de conta é mesmo padrão, e qual o limiar?

Divergência em (1) ou (2): **pare e reporte**. Divergência em (3) ou (4): registre e siga — são
observações, não bloqueios.

### 5.2 Schema, antes da config

Ordem importa: **schema primeiro, plugin depois**. Se você ligar o plugin com a tabela ausente, o
`drizzleAdapter` valida as propriedades e lança em runtime — sintoma obscuro, exatamente como o
que produziu D-43 (`account.issuer`).

```bash
# 1. escreva a coluna e a tabela conforme §3.2, e reexporte no barrel
# 2. gere e REVISE
pnpm db:generate
# 3. aplique
pnpm db:migrate
# 4. confira contra o que a lib espera
pnpm dlx @better-auth/cli@latest generate --config src/modules/auth/auth.config.ts
```

O passo 4 é o portão: rode-o **depois** de ligar o plugin na §5.3. Se o CLI acusar coluna
faltando, é a §3.2 que está errada — **corrija o schema, não o CLI**.

### 5.3 Ligar o plugin

```ts
plugins: [bearer(), forgetPasswordPlugin(), twoFactor({ /* §3.3 */ })],
```

Três escolhas, todas em D-53, todas com motivo:

- **`skipVerificationOnEnable: false`** — obriga o usuário a provar um TOTP válido antes de o 2FA
  ficar ativo. `true` é como alguém ativa 2FA com um segredo que o app dele não leu direito e
  **se tranca fora da própria conta**.
- **`trustDevice` ausente** — 30 dias de isenção por dispositivo é superfície que não temos como
  revogar sem uma tela de gestão de dispositivos, que não existe no MVP.
- **`period: 10` no OTP** — minutos de validade. Janela curta o suficiente para um código
  interceptado por e-mail valer pouco.

### 5.4 O template de OTP

Padrão de `verificationEmail`, com duas diferenças que importam:

- **O OTP vai no corpo visível**, não num `href`. Não construa link com o código na query string:
  a URL vaza em log, em `Referer` e no histórico do cliente de e-mail.
- **Diga a validade** ("válido por 10 minutos") e **o que fazer se não foi você**. É a única
  defesa do usuário contra um atacante que já tem a senha dele.

Escape toda interpolação. F5-S03 corrigiu esse defeito nos outros dois templates (GAP-22);
reintroduzi-lo aqui seria regressão.

### 5.5 Rate limit do segundo fator

As 4 entradas da §3.5. Elas são a defesa **por IP**; o bloqueio de conta do plugin é a defesa
**por conta**. As duas são necessárias e nenhuma substitui a outra.

Chaves relativas ao `basePath`: `/two-factor/verify-totp`, nunca
`/api/auth/two-factor/verify-totp`. Escrita errada, a regra não casa e **falha em silêncio**.

### 5.6 Cascade — confira, não presuma

`onDelete: 'cascade'` em `two_factor.user_id` é obrigatório. Sem ele, `DELETE /api/v1/me`
(`users.repository.ts:80-86`) passa a falhar com violação de FK **no primeiro usuário que ativar
2FA** — e o E2E de lifecycle de conta é o que pega isso. T14 existe para provar.

---

## 6. Casos de teste obrigatórios

### Integração — `tests/integration/schema-two-factor.test.ts`

| #   | Caso                                                          | Esperado      |
| --- | ------------------------------------------------------------- | ------------- |
| T1  | Tabela `two_factor` existe com as 5 colunas da §3.2           | sim           |
| T2  | `user.two_factor_enabled` existe, `NOT NULL`, default `false` | sim           |
| T3  | Índice `two_factor_user_id_idx` presente                      | sim           |
| T4  | FK de `two_factor.user_id` com `ON DELETE CASCADE`            | sim           |
| T5  | `@better-auth/cli generate` sem diferença                     | sem diferença |

### Integração — `tests/integration/auth-two-factor.test.ts`

> O TOTP é determinístico: dado o `secret` e o relógio, o código é calculável. Gere-o no teste a
> partir do segredo devolvido por `get-totp-uri` — **não** faça mock do verificador da lib, senão
> o teste não prova nada. Se precisar de um gerador, use o do próprio `better-auth` se ele
> exportar um; se não, `node:crypto` faz HMAC-SHA1 em poucas linhas. **Não instale dependência.**

| #   | Caso                                                                   | Esperado                                                                             |
| --- | ---------------------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| T6  | `POST /two-factor/enable` sem sessão                                   | 401                                                                                  |
| T7  | `POST /two-factor/get-totp-uri` com sessão                             | 200 com URI `otpauth://` contendo `Cardoso Sound`                                    |
| T8  | `enable` seguido de `verify-totp` com código **válido**                | 200; `user.two_factor_enabled = true` no banco                                       |
| T9  | `enable` com código **inválido**                                       | 4xx; `two_factor_enabled` continua `false` — prova `skipVerificationOnEnable: false` |
| T10 | `POST /sign-in/email` com 2FA ativo                                    | **não** devolve sessão; devolve o marcador da §3.6                                   |
| T11 | `verify-totp` no fluxo de sign-in com código válido                    | 200 com `set-auth-token`                                                             |
| T12 | `POST /two-factor/send-otp`                                            | 200; `outbox` com 1 e-mail contendo 6 dígitos                                        |
| T13 | `verify-otp` com o código do `outbox`                                  | 200 com sessão                                                                       |
| T14 | `verify-otp` com código expirado (avance o relógio > 10 min)           | 4xx                                                                                  |
| T15 | `generate-backup-codes` → 10 códigos                                   | 10, distintos                                                                        |
| T16 | `verify-backup-code` com um código válido                              | 200 com sessão                                                                       |
| T17 | O **mesmo** backup code uma segunda vez                                | 4xx — uso único                                                                      |
| T18 | `generate-backup-codes` de novo → códigos antigos                      | 4xx — regeneração invalida                                                           |
| T19 | 6+ tentativas de `verify-totp` erradas seguidas na mesma conta         | **429** com bloqueio de conta — registre o limiar real                               |
| T20 | `POST /two-factor/disable` com sessão e senha correta                  | 200; `two_factor_enabled = false`                                                    |
| T21 | Usuário **sem** 2FA: sign-in continua devolvendo sessão direto         | 200 — sem regressão                                                                  |
| T22 | `DELETE /api/v1/me` de usuário **com** 2FA ativo                       | 204; linha em `two_factor` sumiu — GAP-09/cascade                                    |
| T23 | Nenhum e-mail do `outbox` traz o `secret` do TOTP                      | asserção por substring                                                               |
| T24 | Nenhuma resposta HTTP expõe `secret` ou `backupCodes` de outro usuário | asserção explícita                                                                   |

### Unit — `tests/unit/shared/email/two-factor-otp.test.ts`

| #   | Caso                                          | Esperado                       |
| --- | --------------------------------------------- | ------------------------------ |
| T25 | `twoFactorOtpEmail({ name, otp: '123456' })`  | `html` contém `123456`         |
| T26 | O OTP **não** aparece dentro de nenhum `href` | asserção por regex             |
| T27 | `name: '<script>alert(1)</script>'`           | escapado — não regredir GAP-22 |
| T28 | `subject` não vazio e sem o OTP               | o código não vai no assunto    |

### E2E

| #   | Caso                                      | Esperado |
| --- | ----------------------------------------- | -------- |
| T29 | Suíte E2E completa com o helper de F5-S03 | verde    |
| T30 | Suíte completa sob `--sequence.shuffle`   | verde    |

---

## 7. Definition of Done

```bash
docker compose up -d && pnpm db:migrate
pnpm typecheck && pnpm lint && pnpm format && pnpm test && pnpm build
pnpm dlx @better-auth/cli@latest generate --config src/modules/auth/auth.config.ts   # sem diferença
pnpm openapi:export -- --check
```

**Verificação manual com app autenticador real** (dev, transporte de memória):

```bash
pnpm dev
# 1. cadastre e verifique um usuário (fluxo de F5-S03), guarde o bearer
# 2. obtenha o URI e transforme em QR
curl -s -X POST localhost:3333/api/auth/two-factor/get-totp-uri \
  -H "Authorization: Bearer $TOKEN" -H 'content-type: application/json' \
  -d '{"password":"<a senha>"}' | jq -r '.totpURI'
# leia o otpauth:// no app autenticador (qualquer gerador de QR local serve)
# 3. ative com o código do app
curl -s -X POST localhost:3333/api/auth/two-factor/enable \
  -H "Authorization: Bearer $TOKEN" -H 'content-type: application/json' \
  -d '{"password":"<a senha>","code":"<6 dígitos do app>"}' | jq
# 4. faça sign-out e sign-in: deve pedir o segundo fator
# 5. conclua com verify-totp e confirme que veio set-auth-token
docker compose exec -T postgres psql -U cardoso -d cardoso_sound \
  -c 'select email, two_factor_enabled from "user";'
```

- [ ] T1–T30 verdes
- [ ] Fluxo manual concluído **com app autenticador real** — TOTP aceito
- [ ] OTP por e-mail recebido e aceito; código de 6 dígitos, fora de `href`
- [ ] Backup code funciona uma vez e falha na segunda
- [ ] Bloqueio de conta observado no T19, com o limiar real registrado
- [ ] `DELETE /api/v1/me` de usuário com 2FA responde 204 e limpa `two_factor`
- [ ] `@better-auth/cli generate` sem diferença de schema
- [ ] Migração revisada linha a linha; `pnpm db:push` **não** usado
- [ ] Usuário sem 2FA continua entrando normalmente (T21)
- [ ] `grep -n "'DELETE'" src/modules/auth/auth.plugin.ts` — **inalterado**
- [ ] PR verde; memória atualizada com o contrato da §3.6 para o Flutter

---

## 8. Armadilhas conhecidas

1. **Ligar o plugin antes de criar a tabela.** O `drizzleAdapter` valida as propriedades do schema
   e lança em runtime, com mensagem obscura — foi assim que nasceu D-43. Schema primeiro, sempre.
2. **Esquecer a reexportação no barrel** `src/db/schema/index.ts`. O adapter recebe `* as schema`;
   tabela não exportada é tabela inexistente para ele. Sintoma idêntico ao da armadilha 1.
3. **`skipVerificationOnEnable: true`** deixa o usuário ativar 2FA com um segredo que ele não
   consegue usar. É o caminho direto para "perdi o acesso à minha conta" — e o projeto não tem
   fluxo de suporte para desfazer isso.
4. **Mockar o verificador de TOTP no teste.** O teste passa e não prova nada. TOTP é
   determinístico: gere o código a partir do segredo, com o relógio do teste.
5. **Acrescentar dependência de TOTP.** `node:crypto` faz HMAC-SHA1. Dependência nova exige ADR,
   e este sprint não tem nenhuma aprovada.
6. **Mexer na lista de métodos da coringa** para "suportar o `DELETE` do 2FA". Não existe: o
   Better Auth usa `POST` para toda mutação. Auditorias anteriores erraram aqui (spec `08` §7.2).
7. **`customRules` com caminho absoluto.** `/two-factor/verify-totp`, relativo ao `basePath`.
   Errado, não casa e não avisa.
8. **OTP em `href`.** A URL vaza em log, em `Referer` e no histórico do cliente de e-mail. O
   código vai no corpo visível. T26 existe para isso.
9. **Não testar o caminho sem 2FA.** A maioria dos usuários não vai ativar. T21 garante que o
   fluxo comum não regrediu — e é o teste que a suíte inteira depende.
10. **Esquecer `onDelete: 'cascade'`.** `DELETE /api/v1/me` passa a quebrar com violação de FK no
    primeiro usuário que ativar 2FA, e o sintoma só aparece no E2E de lifecycle.
11. **Achar que o bloqueio de conta dispensa o rate limit por IP.** São defesas de eixos
    diferentes: uma protege a conta, a outra protege o serviço. As duas.

---

## 9. Registro na memória

- **`DECISIONS.md`** — **nada a acrescentar.** D-53 cobre este sprint. Se a §5.1 revelar que a
  versão instalada exige uma escolha que D-53 não previu, **pare e pergunte**.
- **`PROGRESS.md`** — F5-S05 ✅, próximo = F5-S06. Acrescente **R32–R40** em
  **Contratos já entregues** e a migração nova.
- **`F5-S05.md`** — o time do Flutter lê: (a) o formato exato da resposta de `/sign-in/email` com
  2FA ativo e como o app deve reagir (§3.6); (b) os três fluxos de segundo fator, com o payload de
  cada endpoint; (c) que os backup codes são **exibidos uma vez** e regenerar invalida os
  anteriores; (d) o limiar real do bloqueio de conta observado no T19; (e) a versão do
  `better-auth` em que isso foi validado.

---

## 10. Depois deste sprint

Metade do domínio multifator está entregue — o que valia **0 % de 20 %** do scorecard começa a
pontuar. A conta passa a ter defesa própria, independente do IP.

Próximo: **F5-S06**, Passkey — o único sprint da blindagem com **dependência nova**
(`@better-auth/passkey`, aprovada em D-54).
