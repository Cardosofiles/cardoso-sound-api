# Plano de Implementação — Sprint F5-S03: Recuperação de Conta, Anti-Enumeração e Política de Senha

> **Status:** 🟡 Planejamento Concluído · Aguardando Autorização do Usuário (Etapa 3 do Protocolo)  
> **Fase:** F5 — Produção · **2º dos 6 sprints de blindagem** ([D-49](file:///.agents/memory/DECISIONS.md#d-49))  
> **Branch Alvo:** `feature/f5s03-recuperacao-de-conta`  
> **Depende de:** F5-S02 (Blindagem de Borda, Rate Limit e D-60 concluídos)  
> **Entrega:** GAP-07, GAP-08, GAP-14, GAP-15, GAP-22, GAP-24, GAP-25  
> **Specs de Referência:**
>
> - [`docs/sprints/fase-5-producao/F5-S03-recuperacao-de-conta-e-anti-enumeracao.md`](file:///docs/sprints/fase-5-producao/F5-S03-recuperacao-de-conta-e-anti-enumeracao.md) (Sprint Brief Normativo)
> - [`docs/specs/08-blindagem-de-seguranca.md`](file:///docs/specs/08-blindagem-de-seguranca.md) (§4, §5)
> - [`docs/specs/04-autenticacao-e-seguranca.md`](file:///docs/specs/04-autenticacao-e-seguranca.md) (§1.2 — aviso de supersessão)
> - [`docs/specs/07-protocolo-dos-agentes.md`](file:///docs/specs/07-protocolo-dos-agentes.md) (Protocolo de 7 etapas e paradas mandatórias)
> - [`.agents/memory/DECISIONS.md`](file:///.agents/memory/DECISIONS.md) (**D-46**, **D-51**, **D-52**, **D-57**)
> - [`.agents/memory/F3-S03.md`](file:///.agents/memory/F3-S03.md) (Memória histórica da entrega original de e-mail e auth)

---

## 1. Relatório Mandatório Pré-Implementação (§5.1)

Antes da escrita de qualquer código de produção ou teste, foram executadas e auditadas as verificações no pacote instalado (`better-auth@1.7.2`):

### 1.1 Verificação (a): `revokeSessionsOnPasswordReset` em `emailAndPassword`

- **Comando:** `grep -rn "revokeSessionsOnPasswordReset" node_modules/better-auth/dist/`
- **Evidência no runtime:**
  ```javascript
  // node_modules/better-auth/dist/api/routes/password.mjs:173
  if (ctx.context.options.emailAndPassword?.revokeSessionsOnPasswordReset)
    await ctx.context.internalAdapter.deleteUserSessions(userId);
  ```
- **Conclusão:** `revokeSessionsOnPasswordReset` **é uma chave legítima e funcional** de `emailAndPassword` no Better Auth v1.7.2. Quando ativada, invoca `deleteUserSessions(userId)` imediatamente após a troca de senha no endpoint `/reset-password`, revogando todas as sessões ativas do usuário. (Nota: `revokeOtherSessions` é parâmetro do corpo de `/change-password` e não opção de configuração).

### 1.2 Verificação (b): Predicado de resposta genérica em `dist/api/routes/sign-up.mjs`

- **Comando:** `grep -n "shouldReturnGenericDuplicateResponse" -A 4 node_modules/better-auth/dist/api/routes/sign-up.mjs`
- **Evidência no runtime:**
  ```javascript
  // node_modules/better-auth/dist/api/routes/sign-up.mjs:163-164
  const shouldReturnGenericDuplicateResponse =
    ctx.context.options.emailAndPassword.requireEmailVerification ||
    ctx.context.options.emailAndPassword.autoSignIn === false;
  const shouldSkipAutoSignIn =
    ctx.context.options.emailAndPassword.autoSignIn === false ||
    shouldReturnGenericDuplicateResponse;
  ```
  E na linha 268 de `sign-up.mjs`:
  ```javascript
  if (shouldSkipAutoSignIn)
    return ctx.json({
      token: null,
      user: parseUserOutput(ctx.context.options, createdUser),
    });
  ```
- **Conclusão e Achado Crítico de Runtime:**
  1. O predicado coincide rigorosamente com o brief: `requireEmailVerification: true` ativa automaticamente `shouldReturnGenericDuplicateResponse: true`. Na tentativa de cadastro com e-mail duplicado, a lib executa hash de senha para neutralizar timing attacks e retorna 200 com payload sintético genérico (GAP-08).
  2. **Achado Crítico:** A linha 164 estipula que `shouldSkipAutoSignIn` é forçado para `true` sempre que `shouldReturnGenericDuplicateResponse` for `true`. Isso significa que, mesmo com `autoSignIn: true` no `auth.config.ts`, o Better Auth **não emite sessão nem cookie no `sign-up`** quando `requireEmailVerification: true` está ativo; ele devolve `{ token: null, user: ... }`.
  3. Essa constatação de runtime valida diretamente o desenho de quatro passos do helper E2E (§5.5) e responde com precisão milimétrica à investigação requerida para o caso **T7** e para o time do Flutter (§5.3): o token retornado no `POST /sign-up/email` é `null`, de modo que o cliente Flutter não armazena sessão no cadastro e deve aguardar a confirmação de e-mail para autenticar via `POST /sign-in/email`.

### 1.3 Verificação (c): Export de `haveIBeenPwned` em `better-auth/plugins`

- **Comando:** `grep -rn "haveIBeenPwned\|hibp" node_modules/better-auth/dist/plugins/index.*`
- **Evidência no runtime:** `better-auth/plugins` exporta `haveIBeenPwned`.
- **Auditoria de Código em `node_modules/better-auth/dist/plugins/haveibeenpwned/index.mjs`:**
  ```javascript
  const { data, error } = await betterFetch(`https://api.pwnedpasswords.com/range/${prefix}`, ...);
  if (error) throw new APIError("INTERNAL_SERVER_ERROR", { message: `Failed to check password. Status: ${error.status}` });
  // ...
  } catch (error) {
    if (isAPIError(error)) throw error;
    throw new APIError("INTERNAL_SERVER_ERROR", { message: "Failed to check password. Please try again later." });
  }
  ```
- **Conclusão e Decisão Técnica de Implementação:**
  1. O plugin nativo `haveIBeenPwned` **não suporta fail-open**: em caso de erro na requisição externa (DNS, queda de rede, HTTP 503 do Cloudflare/HIBP), ele lança incondicionalmente HTTP 500 (`INTERNAL_SERVER_ERROR`), violando frontalmente a **Armadilha 10** do brief ("Falha aberta: loga warn, deixa passar; se o serviço externo cair, ninguém se cadastra").
  2. Adicionalmente, invocar uma API externa real em suítes de teste (Vitest local e CI) viola o isolamento offline, causa latência e induz flakes por rate limit externo.
  3. Portanto, em conformidade com a §5.6 e os testes **T26–T29** da §6, adota-se a solução offline sem rede: criação de [`src/shared/security/weak-passwords.ts`](file:///src/shared/security/weak-passwords.ts) contendo um `Set<string>` embutido das senhas mais comuns (em minúsculas), integrado ao Better Auth através de um plugin customizado `weakPasswordsPlugin` com hook `hooks.before` em `/sign-up/email`, `/reset-password` e `/change-password`, rejeitando com **HTTP 400 genérico** sem vazar que a senha é pública.

---

## 2. Diagnóstico dos GAPs e Mudanças de Contrato

| GAP        | Descrição                                                           | Onde atua                                                  | Como resolve                                                                                                                                                       |
| ---------- | ------------------------------------------------------------------- | ---------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **GAP-07** | Reset de senha não revoga sessões anteriores                        | `src/modules/auth/auth.config.ts`                          | Configurar `revokeSessionsOnPasswordReset: true`. Bearers e cookies antigos respondem **401** após o reset (T8, T9).                                               |
| **GAP-08** | Cadastro é oráculo de enumeração de contas (422 vs 200)             | Better Auth core via `requireEmailVerification: true`      | `POST /sign-up/email` passa a responder **200 genérico** idêntico para e-mail novo ou já cadastrado (T1–T4).                                                       |
| **GAP-14** | Verificação de e-mail nunca era exigida no login                    | `src/modules/auth/auth.config.ts`                          | Configurar `requireEmailVerification: true`. `POST /sign-in/email` passa a responder **403** enquanto `emailVerified === false` (T5, T6).                          |
| **GAP-15** | Mailer cria logger Pino próprio sem `redact` e vaza token de reset  | `src/shared/email/mailer.ts`                               | Eliminar `new pino()` próprio (D-57). Injetar `Logger` opcional; fallback sanitiza `*.url`, `url` e `to`. URL só logada se `NODE_ENV === 'development'` (T20–T22). |
| **GAP-22** | Interpolação sem escape nos templates de e-mail                     | `src/shared/email/templates.ts`                            | Sanitizar atributo `href` com `escapeHtmlAttribute` contra aspas e `<>` (T23–T25).                                                                                 |
| **GAP-24** | Rota `/change-password` sem testes automatizados                    | `tests/integration/auth-change-password.test.ts`           | Criação de suíte de integração cobrindo 401 desautenticado, senha incorreta, troca com sucesso, senha antiga invalidada e `revokeOtherSessions` (T14–T19).         |
| **GAP-25** | Ausência de política de senha forte e proteção contra senhas fracas | `src/shared/security/weak-passwords.ts` + `auth.config.ts` | `maxPasswordLength: 128` explícito; verificação contra lista de senhas fracas com rejeição em HTTP 400 genérico (T26–T29).                                         |

### Contratos HTTP — Antes vs. Depois

| Rota                            | Antes                      | Depois                                                     | Justificativa                 |
| ------------------------------- | -------------------------- | ---------------------------------------------------------- | ----------------------------- |
| `POST /api/auth/sign-up/email`  | 422 se o e-mail já existe  | **200 genérico** (corpo com synthetic user, `token: null`) | GAP-08 (Anti-enumeração)      |
| `POST /api/auth/sign-in/email`  | 200 sem verificar e-mail   | **403 Forbidden** enquanto `emailVerified === false`       | GAP-14 (Anti-squatting)       |
| `POST /api/auth/reset-password` | Sessões antigas persistiam | **Todas as sessões ativas são destruídas no Postgres**     | GAP-07 (Revogação mandatória) |

---

## 3. Blast Radius Estrito

```
docs/agents-plans/plan-f5-s03-recuperacao-de-conta-e-anti-enumeracao.md
```

### Arquivos a Criar

1. [`src/shared/security/weak-passwords.ts`](file:///src/shared/security/weak-passwords.ts) — Utilitário de checagem de senhas comuns/vazadas em memória (Set em minúsculas, sem rede).
2. [`tests/unit/shared/security/weak-passwords.test.ts`](file:///tests/unit/shared/security/weak-passwords.test.ts) — Testes unitários T26 a T29.
3. [`tests/integration/auth-change-password.test.ts`](file:///tests/integration/auth-change-password.test.ts) — Testes de integração T14 a T19 para `/change-password`.
4. [`.agents/memory/F5-S03.md`](file:///.agents/memory/F5-S03.md) — Documentação executiva do sprint para o time do backend e Flutter.

### Arquivos a Editar

1. [`src/modules/auth/auth.config.ts`](file:///src/modules/auth/auth.config.ts):
   - Bloco `emailAndPassword`: adicionar `requireEmailVerification: true`, `revokeSessionsOnPasswordReset: true`, `maxPasswordLength: 128`.
   - Adicionar plugin customizado `weakPasswordsPlugin` para validação em `hooks.before`.
2. [`src/shared/email/mailer.ts`](file:///src/shared/email/mailer.ts):
   - Remover chamada direta `pino({...})` (conforme D-57 e DoD).
   - `createMemoryMailer(logger?: MailerLogger)` e `createResendMailer(resendClient: Resend, from: string, logger?: MailerLogger)`.
   - `defaultLogger` seguro: aplica sanitização, suprime URLs fora de `development`, e no Resend loga apenas `{ provider: 'resend', status }` e mensagem, sem `to` nem erro cru.
3. [`src/shared/email/templates.ts`](file:///src/shared/email/templates.ts):
   - Adicionar função `escapeHtmlAttribute(str: string): string`.
   - Aplicar `safeUrl = escapeHtmlAttribute(input.url)` em ambos os templates (`verificationEmail` e `resetPasswordEmail`).
4. [`tests/e2e/helpers/auth.ts`](file:///tests/e2e/helpers/auth.ts):
   - Reescrever o corpo preservando rigorosamente a assinatura e interface `SignUpAndGetTokenResult`.
   - Usar senha forte fora da lista de senhas fracas (ex: `StrongP@ssw0rd!2026#F5S03`).
   - Implementar os 4 passos offline com `clearOutbox()`, regex do `href`, `GET /verify-email` e `POST /sign-in/email`.
5. [`tests/integration/auth.test.ts`](file:///tests/integration/auth.test.ts):
   - Apagar o antigo caso T6 (que esperava 4xx em e-mail duplicado) e substituí-lo pelos casos T1 a T4 do brief.
   - Ajustar testes legados de F3-S01 que esperavam tokens diretos de `sign-up` para utilizar o fluxo verificado ou `signUpAndGetToken`.
6. [`tests/integration/auth-email.test.ts`](file:///tests/integration/auth-email.test.ts):
   - Apagar o antigo caso T8 (que esperava sign-in com 200 sem verificar e-mail) e substituir por T5 (espera 403) e T6.
   - Apagar o antigo caso T20 (que afirmava persistência de sessões pós-reset) e substituir por T8 a T11 (afirma revogação mandatória com 401).
   - Adicionar asserção T7 sobre o comportamento do token de sign-up.
7. [`tests/unit/shared/email/mailer.test.ts`](file:///tests/unit/shared/email/mailer.test.ts):
   - Atualizar para injetar logger mock e validar não-vazamento de `url` em `test` (T20), sanitização de erro no Resend (T21) e prova estática de ausência de `pino(` fora de `app.ts` (T22).
8. [`tests/unit/shared/email/templates.test.ts`](file:///tests/unit/shared/email/templates.test.ts):
   - Adicionar asserções de escape de aspas e caracteres HTML em `url` (T23–T25).
9. [`.agents/memory/DECISIONS.md`](file:///.agents/memory/DECISIONS.md):
   - Inserir **apenas** as anotações pontuais em D-46 (a) (`— revogada por D-51`) e D-46 (e) (`— revogada por D-52`).
10. [`.agents/memory/PROGRESS.md`](file:///.agents/memory/PROGRESS.md):
    - Atualizar F5-S03 para ✅ e próximo para F5-S04, adicionando nota de atualização de contrato para a spec `03` §5.

### Arquivos Condicionais (apenas se quebrarem pelo novo fluxo de cadastro)

- `tests/e2e/specs/{auth-flow,account-lifecycle,favorites-flow,playlist-flow}.e2e.test.ts`
- `tests/integration/modules/{users,playlists,favorites}.repository.test.ts`
  _(Como a assinatura de `signUpAndGetToken` é mantida, espera-se impacto zero nestes arquivos)._

### Arquivos com Modificação Estritamente Proibida

- `src/modules/auth/auth.plugin.ts`
- `src/plugins/**`
- `src/db/**`
- `drizzle/**`
- `src/config/env.ts`
- `src/modules/{users,playlists,favorites,artists,tracks}/**`
- `src/app.ts`
- `docs/openapi.json`

---

## 4. Detalhamento Técnico da Implementação

### 4.1 Utilitário de Senhas Fracas (`src/shared/security/weak-passwords.ts`)

- Implementar lista `WEAK_PASSWORDS` contendo as senhas comumente vazadas/fracas em minúsculas:
  `['password', '12345678', '123456789', '1234567890', 'qwertyuiop', 'admin123', 'cardososound', ...]`
- Normalização: `password.toLowerCase().trim()`.
- Exportar:
  ```typescript
  export function isWeakPassword(password: string): boolean;
  ```
- Criar suíte [`tests/unit/shared/security/weak-passwords.test.ts`](file:///tests/unit/shared/security/weak-passwords.test.ts) validando T26, T27, T28.

### 4.2 Configuração do Better Auth (`src/modules/auth/auth.config.ts`)

- Atualizar o bloco `emailAndPassword`:
  ```typescript
  emailAndPassword: {
    enabled: true,
    minPasswordLength: 8,
    maxPasswordLength: 128,                 // Explícito contra DoS por payload longo
    autoSignIn: true,                       // R09 preservado
    requireEmailVerification: true,         // D-51 (Revoga D-46 a) — GAP-14 e GAP-08
    revokeSessionsOnPasswordReset: true,    // D-52 (Revoga D-46 e) — GAP-07
    resetPasswordTokenExpiresIn: 60 * 60,
    sendResetPassword: async ({ user, url }) => {
      const { subject, html } = resetPasswordEmail({ name: user.name || 'Usuário', url });
      await mailer.send({ to: user.email, subject, html });
    },
  },
  ```
- Integrar hook de verificação de senhas fracas:
  ```typescript
  const weakPasswordPlugin = () => ({
    id: 'weak-passwords',
    hooks: {
      before: [
        {
          matcher(context: { path: string }) {
            return (
              context.path === '/sign-up/email' ||
              context.path === '/reset-password' ||
              context.path === '/change-password'
            );
          },
          handler: createAuthMiddleware(async (ctx) => {
            const body = ctx.body as Record<string, unknown> | undefined;
            const password = (body?.password ?? body?.newPassword) as string | undefined;
            if (typeof password === 'string' && isWeakPassword(password)) {
              throw APIError.from('BAD_REQUEST', {
                message: 'Invalid password. Please choose a different password.',
              });
            }
          }),
        },
      ],
    },
  });
  ```
- Adicionar `weakPasswordPlugin()` à lista de `plugins` do `createAuth`.

### 4.3 Logger Sanitizado no Mailer (`src/shared/email/mailer.ts` — D-57)

- **Zero instâncias Pino locais:** remover `import { pino } from 'pino'` e `const logger = pino(...)`.
- Definir interface tipada para o logger:
  ```typescript
  export type MailerLogger = {
    info(obj: Record<string, unknown>, msg?: string): void;
    warn(obj: Record<string, unknown>, msg?: string): void;
    error(obj: Record<string, unknown>, msg?: string): void;
  };
  ```
- Criar `defaultLogger` com fallback seguro:
  - Em `development`, pode emitir log no console com a URL extraída para conveniência do desenvolvedor local.
  - Em `test` e `production`, **nunca** loga URL nem tokens.
- No `createMemoryMailer(logger?: MailerLogger)`:
  - Logar URL extraída do `href` **somente** se `env.NODE_ENV === 'development'`.
  - Em outros ambientes, logar apenas `{ to: input.to, subject: input.subject }`.
- No `createResendMailer(resendClient: Resend, from: string, logger?: MailerLogger)`:
  - Em falha (`error` retornado ou `catch`), logar apenas `{ provider: 'resend', status: error?.status ?? 'error' }` e mensagem genérica.
  - **Nunca** logar o e-mail `to` nem o objeto de erro cru do SDK da Resend.
  - Nunca rejeitar a promise (`send` resolve silenciosamente com log defensivo, prevenindo interrupção do sign-up).

### 4.4 Escape nos Templates de E-mail (`src/shared/email/templates.ts` — GAP-22)

- Implementar função de escape de atributos HTML:
  ```typescript
  function escapeHtmlAttribute(str: string): string {
    return str
      .replace(/&/g, '&amp;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  }
  ```
- Atualizar `verificationEmail` e `resetPasswordEmail`:
  - `const safeUrl = escapeHtmlAttribute(input.url);`
  - Manter `const safeName = escapeHtml(input.name.trim() || 'Usuário');`
  - Interpolar `href="${safeUrl}"`.

### 4.5 Helper E2E (`tests/e2e/helpers/auth.ts`)

- Reimplementar `signUpAndGetToken` com 4 passos offline atômicos:
  ```typescript
  export async function signUpAndGetToken(
    app: FastifyInstance,
    email?: string,
  ): Promise<SignUpAndGetTokenResult> {
    clearOutbox(); // Mandatório antes de começar para evitar contaminação cruzada sob shuffle

    const userEmail = email ?? `test-${randomUUID().slice(0, 8)}@example.com`;
    const password = 'StrongP@ssw0rd!2026#F5S03'; // Fora de qualquer lista de senhas fracas

    // 1. POST /api/auth/sign-up/email
    const signUpRes = await app.inject({
      method: 'POST',
      url: '/api/auth/sign-up/email',
      headers: { 'content-type': 'application/json' },
      payload: { name: 'E2E Test User', email: userEmail, password },
    });
    if (signUpRes.statusCode !== 200) {
      throw new Error(`Falha no sign-up: ${signUpRes.statusCode} - ${signUpRes.body}`);
    }
    const userId = signUpRes.json<{ user: { id: string } }>().user.id;

    // 2. Ler outbox e extrair href do último e-mail
    const lastEmail = outbox[outbox.length - 1];
    if (!lastEmail) throw new Error('Outbox vazio após sign-up');
    const urlMatch = /href="([^"]+)"/.exec(lastEmail.html);
    if (!urlMatch?.[1]) throw new Error('Link de verificação não encontrado no outbox');
    const verifyUrl = new URL(urlMatch[1]);
    const verifyPath = `${verifyUrl.pathname}${verifyUrl.search}`;

    // 3. GET /verify-email
    const verifyRes = await app.inject({ method: 'GET', url: verifyPath });
    if (verifyRes.statusCode >= 400) {
      throw new Error(`Falha na verificação de e-mail: ${verifyRes.statusCode}`);
    }

    // 4. POST /api/auth/sign-in/email
    const signInRes = await app.inject({
      method: 'POST',
      url: '/api/auth/sign-in/email',
      headers: { 'content-type': 'application/json' },
      payload: { email: userEmail, password },
    });
    if (signInRes.statusCode !== 200) {
      throw new Error(
        `Falha no sign-in pós-verificação: ${signInRes.statusCode} - ${signInRes.body}`,
      );
    }

    const tokenHeader = signInRes.headers['set-auth-token'];
    const token =
      typeof tokenHeader === 'string'
        ? tokenHeader
        : (signInRes.json<{ token?: string }>().token ?? '');
    const rawCookies = signInRes.headers['set-cookie'];
    const cookie = (Array.isArray(rawCookies) ? rawCookies : [rawCookies])
      .filter((c): c is string => typeof c === 'string')
      .map((c) => c.split(';')[0])
      .join('; ');

    return { token, userId, cookie, email: userEmail };
  }
  ```

---

## 5. Matriz de Casos de Teste (T1 a T32)

### 5.1 Suíte de Integração: Cadastro e Anti-Enumeração (`tests/integration/auth.test.ts`)

- **T1:** `POST /sign-up/email` com e-mail novo -> 200 e objeto `user`.
- **T2 (Substitui T6 antigo):** `POST /sign-up/email` com e-mail já existente -> 200 e payload sintético genérico (GAP-08).
- **T3:** Comparação estrita entre T1 e T2: status, code e message rigorosamente idênticos.
- **T4:** Consulta direta `SELECT count(*) FROM "user" WHERE email = ...` após T2 -> continua exatamente 1 linha (sem duplicata).
- **Adequações dos testes legados:** Testes que requerem usuário autenticado (T7, T9, T10, T12, T16, T17, T18) passam a utilizar o helper `signUpAndGetToken` ou verificar o e-mail antes do login.

### 5.2 Suíte de Integração: E-mail, Verificação e Sessões Pós-Reset (`tests/integration/auth-email.test.ts`)

- **T5 (Substitui T8 antigo):** `POST /sign-in/email` antes de verificar e-mail -> **HTTP 403 Forbidden** (GAP-14).
- **T6:** `GET /verify-email` com token válido seguido de `POST /sign-in/email` -> HTTP 200 com `set-auth-token`.
- **T7:** Asserção de runtime no `POST /sign-up/email`: confirma que `token` retornado no corpo é `null` e nenhum `set-auth-token` é emitido.
- **T8 (Substitui T20 antigo):** Reset de senha -> Bearer token capturado ANTES do reset responde **HTTP 401** em `/api/auth/get-session` (GAP-07).
- **T9:** Reset de senha -> Cookie de sessão capturado ANTES do reset responde **HTTP 401** em `/api/auth/get-session`.
- **T10:** Reset de senha -> Sign-in imediato com a senha NOVA responde HTTP 200.
- **T11:** `SELECT count(*) FROM session WHERE user_id = ...` após o reset -> somente 1 sessão ativa (a nova).
- **T12:** `POST /forget-password` para e-mail inexistente -> responde HTTP 200 genérico e outbox permanece vazio.
- **T13:** Varredura no outbox: nenhum e-mail contém tokens soltos fora do atributo `href`.

### 5.3 Suíte de Integração: Troca de Senha Autenticada (`tests/integration/auth-change-password.test.ts` — Novo)

- **T14:** `POST /api/auth/change-password` sem autenticação -> HTTP 401.
- **T15:** `POST /api/auth/change-password` com senha atual incorreta -> HTTP 400; senha inalterada.
- **T16:** `POST /api/auth/change-password` com senha atual correta -> HTTP 200; sign-in com a nova senha funciona.
- **T17:** Sign-in com a senha antiga após a troca -> HTTP 401.
- **T18:** `POST /api/auth/change-password` com `revokeOtherSessions: true` no corpo -> um segundo Bearer token pré-existente da mesma conta passa a responder HTTP 401.
- **T19:** `POST /api/auth/change-password` com senha nova de 5 caracteres (< 8) -> HTTP 400; senha inalterada.

### 5.4 Suíte Unitária: Mailer e Templates (`tests/unit/shared/email/**`)

- **T20:** `createMemoryMailer(fakeLogger)` em `NODE_ENV=test` -> zero chamadas de log contendo `url`.
- **T21:** `createResendMailer` sob falha do provedor -> resolve sem rejeitar e loga aviso sem o e-mail do destinatário nem o erro cru.
- **T22:** Varredura estática de conformidade: `grep -rn "pino(" src/` fora de `app.ts` deve retornar vazio (D-57).
- **T23:** `verificationEmail({ name, url: 'https://x/?t=1&a="><b>' })` -> aspas e `<>` devidamente escapados no `href`.
- **T24:** `resetPasswordEmail` com caracteres perigosos na URL -> sanitizados no `href`.
- **T25:** Ambos os templates com `name: '<script>alert(1)</script>'` -> sanitizados no HTML legível.

### 5.5 Suíte Unitária: Política de Senhas Fracas (`tests/unit/shared/security/weak-passwords.test.ts` — Novo)

- **T26:** `isWeakPassword('password')` -> `true`.
- **T27:** `isWeakPassword('PASSWORD')` -> `true` (comparação em minúsculas).
- **T28:** `isWeakPassword('MinhaSenhaSuperForte!2026')` -> `false`.
- **T29:** `POST /api/auth/sign-up/email` com senha fraca ('password') -> HTTP 400 genérico sem vazar que a senha consta em lista.

### 5.6 Testes E2E e Determinismo

- **T30:** Execução dos 5 fluxos E2E (`auth-flow`, `catalog-flow`, `account-lifecycle`, `favorites-flow`, `playlist-flow`) com o novo helper -> 100% verdes.
- **T31:** Execução consecutiva de toda a suíte de integração e E2E duas vezes sem alteração no banco -> determinismo do `clearOutbox()`.
- **T32:** Execução completa com aleatorização: `pnpm vitest run --sequence.shuffle` -> 100% verde.

---

## 6. Definition of Done (DoD) e Portões de Qualidade

A conclusão da sprint exigirá a validação dos seguintes critérios:

```bash
# 1. Pipeline de checagem estática, formatação e suíte completa
pnpm typecheck
pnpm lint
pnpm format
pnpm test
pnpm build

# 2. Teste de determinismo estrito
pnpm vitest run --sequence.shuffle
```

### Comandos de Validação Manual em Desenvolvimento (Portão §7 do Brief):

```bash
# Iniciar servidor local
pnpm dev

# 1. Cadastro devolve 200 genérico e envia verificação (sem expor token no corpo)
curl -s -X POST http://localhost:3333/api/auth/sign-up/email -H 'content-type: application/json' \
  -d '{"name":"Joao","email":"joao+f5s03@teste.com","password":"uma-senha-longa-e-unica"}' | jq

# 2. Tentativa de sign-in ANTES de verificar e-mail -> deve responder HTTP 403
curl -s -o /dev/null -w '%{http_code}\n' -X POST http://localhost:3333/api/auth/sign-in/email \
  -H 'content-type: application/json' \
  -d '{"email":"joao+f5s03@teste.com","password":"uma-senha-longa-e-unica"}'

# 3. Cadastro repetido com mesmo e-mail -> status e corpo idênticos ao novo (GAP-08)
curl -s -X POST http://localhost:3333/api/auth/sign-up/email -H 'content-type: application/json' \
  -d '{"name":"Outro","email":"joao+f5s03@teste.com","password":"outra-senha-longa"}' \
  -w '\nHTTP %{http_code}\n'

# 4. Verificar e-mail pelo link gerado no log dev, efetuar login, capturar bearer antigo,
# disparar reset de senha e validar que o bearer antigo passa a responder 401
curl -s -o /dev/null -w '%{http_code}\n' http://localhost:3333/api/auth/get-session \
  -H "Authorization: Bearer $BEARER_ANTIGO" # Esperado: 401
```

### Checklist Final:

- [ ] T1 a T32 verdes.
- [ ] Nenhum `it.skip` / `describe.skip` no repositório (`grep -rn '\.skip(' tests/` vazio).
- [ ] Casos de teste obsoletos T6, T8 e T20 de F3 formalmente apagados.
- [ ] `grep -rn "pino(" src/ | grep -v app.ts` rigorosamente vazio (D-57).
- [ ] `safeUrl` nos templates devidamente sanitizada com `escapeHtmlAttribute`.
- [ ] `docs/openapi.json` permanece inalterado.
- [ ] Registro das revogações em `.agents/memory/DECISIONS.md` (D-46 a e e).
- [ ] Atualização de `.agents/memory/PROGRESS.md`.
- [ ] Criação de `.agents/memory/F5-S03.md` com as orientações contratuais para o cliente Flutter.

---

## 7. Próxima Ação Mandatória (Protocolo de Agentes — Etapa 3)

⏸ **PARADA MANDATÓRIA:** O planejamento técnico ponta a ponta está concluído e detalhado. Conforme a **Regra 6 do `AGENTS.md`** e a **Etapa 3 do `07-protocolo-dos-agentes.md`**, nenhuma linha de código em `src/**` ou `tests/**` será escrita até que o usuário revise este plano e emita a sua **autorização explícita**.
