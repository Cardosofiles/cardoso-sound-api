# Plano de Implementação — Sprint F3-S03: OAuth Social e E-mail Transacional

| Campo           | Valor                                                      |
| --------------- | ---------------------------------------------------------- |
| **Fase**        | F3 — Identidade (último sprint da fase)                    |
| **Sprint**      | F3-S03                                                     |
| **Branch**      | `feature/f3s03-oauth-social-e-email`                       |
| **Dependência** | F3-S02 (PR #23 aguardando merge em `develop`)              |
| **Entrega**     | R26–R31 · Google, GitHub, Facebook · Resend · Tag `v0.3.0` |
| **Status**      | ⏸ Aguardando autorização explícita (Etapa 3 do protocolo)  |

---

## 1. Inventário de Credenciais (.env — §5.1)

Conforme instrução obrigatória da seção §5.1 do sprint brief, foi executada a inspeção das credenciais no arquivo `.env`:

```bash
grep -c '^GOOGLE_CLIENT_ID=.\+'   .env # Retornou 0
grep -c '^GITHUB_CLIENT_ID=.\+'   .env # Retornou 0
grep -c '^FACEBOOK_CLIENT_ID=.\+' .env # Retornou 0
grep -c '^RESEND_API_KEY=re_'     .env # Retornou 0
```

### Diagnóstico e Impacto

- **Nenhuma credencial de terceiro está cadastrada no `.env` local.**
- **Impacto no E-mail:** Sem `RESEND_API_KEY`, o `src/shared/email/mailer.ts` seleciona automaticamente o transporte em memória (`memoryMailer`), acumulando e-mails enviados em `outbox` e permitindo a execução de todos os testes unitários e de integração sem falha e sem tráfego de rede externa (§5.4). Em ambiente `production`, a chave é estritamente obrigatória e derrubará o processo se ausente.
- **Impacto no OAuth Social:** Sem as credenciais de Google, GitHub e Facebook, o array derivado `SOCIAL_PROVIDERS` em `src/config/env.ts` fica vazio (`[]`). Dessa forma, `socialProviders` em `auth.config.ts` não registra nenhum provedor. Conforme especificado na §5.5 e no caso de teste T23, requisições a provedores sem credenciais responderão com erro 4xx da biblioteca (recurso não configurado), nunca erro 500 por `clientId: undefined`.
- **Testes com Provedores Configuráveis:** Para os testes de integração que exigem validar a inicialização da URL de redirecionamento (T21 - Google), os testes poderão fornecer credenciais simuladas/temporárias de teste isoladas para o Better Auth ou via harness específico sem vazar para commits.

---

## 2. Blast Radius Declarado

### Arquivos a Criar

1. `src/shared/email/mailer.ts` — Contratos `Mailer`, `SentEmail`, transporte `memory` com `outbox` e transporte `resend` sem vazamento de URL.
2. `src/shared/email/templates.ts` — Templates puros `verificationEmail` e `resetPasswordEmail` com URLs estritamente em `href`.
3. `tests/unit/shared/email/mailer.test.ts` — Testes unitários do transporte (T1 a T3).
4. `tests/unit/shared/email/templates.test.ts` — Testes unitários de templates e sanitização de token (T4 a T6).
5. `tests/integration/auth-email.test.ts` — Suíte de integração com Testcontainers para verificação de e-mail e reset de senha (T7 a T20).
6. `tests/integration/auth-social.test.ts` — Suíte de integração para rotas sociais, callbacks, rate limit e validação de `trustedOrigins` (T21 a T26).
7. `docs/agents-plans/plan-f3s03-oauth-social-e-email.md` — Este documento de planejamento persistido (Regra 6 do `AGENTS.md`).

### Arquivos a Editar

1. `package.json` — Adicionar dependência de produção `"resend": "^6.26.0"`.
2. `src/config/env.ts` — Novas variáveis da spec `04` §6, validação de pares OAuth, exigência condicional de `RESEND_API_KEY` em produção e exportação de `SOCIAL_PROVIDERS`.
3. `src/modules/auth/auth.config.ts` — Extensão cirúrgica de `auth` com `socialProviders`, `account.accountLinking`, `emailVerification`, callbacks em `emailAndPassword`, `rateLimit.customRules` e expansão de `trustedOrigins`.
4. `.env.example` — Documentação dos novos placeholders seguros.
5. `.agents/memory/DECISIONS.md` — Registro das decisões `D-46` (verificação opcional, provedores, rate limits, versões).
6. `.agents/memory/PROGRESS.md` — Conclusão de F3-S03, fechamento da Fase 3 e tag `v0.3.0`.
7. `.agents/memory/F3-S03.md` — Registro executivo com fluxos mobile Flutter (`idToken` vs deep link).

### Ponto de Atenção fora do Blast Radius Estrito

- `tests/unit/config/env.test.ts`: O teste unitário de ambiente valida `parseEnv` comparando o objeto completo (`.toEqual(...)`). Com a adição de `EMAIL_FROM` (default) e `SOCIAL_PROVIDERS`, o teste unitário T1 existente falharia se não refletir as novas chaves. Incluiremos a extensão correspondente em `tests/unit/config/env.test.ts` mantendo alinhamento com os padrões de teste.

### Arquivos Intocáveis

- `src/modules/auth/auth.plugin.ts` (a rota coringa `/api/auth/*` montada em F3-S01 já atende todas as novas rotas sem alteração).
- `src/modules/users/**`
- `src/db/**` e `drizzle/**` (nenhuma migration necessária — tabelas `account` e `verification` suportam integralmente as operações).
- `src/plugins/**`

---

## 3. Contratos e Implementações Detalhadas

### 3.1 Dependência `resend`

- Instalação via `pnpm add resend`.
- Pacote na versão estável 6.x (`^6.26.0`), operando como cliente oficial da API de envio de e-mails.

### 3.2 Extensão do `src/config/env.ts`

Novos campos no schema Zod 4:

```ts
GOOGLE_CLIENT_ID: z.string().min(1).optional(),
GOOGLE_CLIENT_SECRET: z.string().min(1).optional(),
GITHUB_CLIENT_ID: z.string().min(1).optional(),
GITHUB_CLIENT_SECRET: z.string().min(1).optional(),
FACEBOOK_CLIENT_ID: z.string().min(1).optional(),
FACEBOOK_CLIENT_SECRET: z.string().min(1).optional(),
RESEND_API_KEY: z.string().startsWith('re_').optional(),
EMAIL_FROM: z.string().min(1).default('Cardoso Sound <onboarding@resend.dev>'),
MOBILE_DEEP_LINK: z.string().optional(),
```

Regras de validação via `.superRefine`:

1. **Validação de Pares:** Cada provedor OAuth exige que o par `*_CLIENT_ID` e `*_CLIENT_SECRET` esteja simultaneamente presente ou ausente. Fornecer apenas um resulta em `ctx.addIssue`.
2. **Obrigatoriedade em Produção:** Quando `NODE_ENV === 'production'`, `RESEND_API_KEY` torna-se estritamente obrigatória (`ctx.addIssue` se ausente).
3. **Derivação de `SOCIAL_PROVIDERS`:**
   Array readonly tipado contendo apenas provedores com credenciais completas:
   ```ts
   export const SOCIAL_PROVIDERS: ReadonlyArray<'google' | 'github' | 'facebook'>;
   ```

### 3.3 Módulo de E-mail (`src/shared/email/`)

#### Templates (`src/shared/email/templates.ts`)

- `verificationEmail(input: { name: string; url: string })`:
  Retorna `{ subject: 'Verifique seu e-mail no Cardoso Sound', html: string }`.
- `resetPasswordEmail(input: { name: string; url: string })`:
  Retorna `{ subject: 'Redefinição de senha no Cardoso Sound', html: string }`.
- **Invariante de Segurança (T6):** O link/token gerado é inserido estritamente no atributo `href="..."` da tag `<a>`, jamais exibido em texto corrido ou aberto fora do link. Sem dependências externas, CSS inline limpo.

#### Mailer (`src/shared/email/mailer.ts`)

- Interface `SentEmail`: `{ to: string; subject: string; html: string; sentAt: Date }`.
- Interface `Mailer`: `{ send(input: { to: string; subject: string; html: string }): Promise<void> }`.
- Singleton `mailer: Mailer`, resolvido na importação:
  - Se `env.RESEND_API_KEY` estiver definida: instância `resendMailer` com `new Resend(env.RESEND_API_KEY)`.
  - Se ausente: instância `memoryMailer`.
- **Resiliência (Armadilha 1 & T3):** `send` nunca rejeita (`Promise.resolve()`). Falhas do Resend são capturadas e logadas em nível `warn`. O transporte Resend **nunca loga a URL** para proteger tokens de autenticação.
- `outbox: readonly SentEmail[]` e `clearOutbox(): void`: gerenciamento do buffer para testes e inspeção em desenvolvimento.

### 3.4 Configuração do Better Auth (`src/modules/auth/auth.config.ts`)

Extensão do objeto de configuração existente mantendo o singleton e o `dynamicDb`:

1. **`socialProviders`:** Registro dinâmico mapeando `SOCIAL_PROVIDERS` para os escopos mínimos autorizados:
   - Google: `openid email profile`
   - GitHub: `user:email` (imprescindível para garantir retorno de e-mails privados)
   - Facebook: `email public_profile`
2. **`account.accountLinking`:**
   - `enabled: true`
   - `trustedProviders: ['google', 'github']` (Facebook explicitamente fora para evitar sequestro de conta por provedores sem verificação mandatória).
3. **`emailAndPassword`:**
   - Adição de `requireEmailVerification: false` (evita bloqueio prematuro de sign-in e preserva funcionamento do helper `signUpAndGetToken`).
   - `resetPasswordTokenExpiresIn: 3600` (1 hora).
   - `sendResetPassword: async ({ user, url }) => { ... }`.
4. **`emailVerification`:**
   - `sendOnSignUp: true`
   - `autoSignInAfterVerification: true`
   - `expiresIn: 86400` (24 horas).
   - `sendVerificationEmail: async ({ user, url }) => { ... }`.
5. **`rateLimit.customRules`:**
   - `/forget-password`: `{ window: 3600, max: 3 }`
   - `/send-verification-email`: `{ window: 3600, max: 3 }`
   - `/reset-password`: `{ window: 3600, max: 5 }`
   - `/sign-in/social`: `{ window: 60, max: 10 }`
   - Mantido `enabled: isProduction` (D-19).
6. **`trustedOrigins`:**
   - `[...env.CORS_ORIGIN_LIST, ...(env.MOBILE_DEEP_LINK ? [env.MOBILE_DEEP_LINK] : [])]`. Previne ataques de Open Redirect com captura de tokens via `callbackURL` (T25).

---

## 4. Matriz de Cobertura de Testes (T1 a T26)

### 4.1 Testes Unitários (`tests/unit/shared/email/`)

- [ ] **T1:** `mailer.ts` — `memoryMailer` com chave ausente acumula mensagem em `outbox`.
- [ ] **T2:** `mailer.ts` — `resendMailer` chama `emails.send` com `from`, `to`, `subject` e `html`.
- [ ] **T3:** `mailer.ts` — Quando a chamada do provedor lança exceção, `mailer.send` resolve sem rejeição e emite log `warn`.
- [ ] **T4:** `templates.ts` — `verificationEmail` renderiza `html` contendo exatamente a URL informada em `href`.
- [ ] **T5:** `templates.ts` — `resetPasswordEmail` renderiza `html` com a URL e assunto não vazio.
- [ ] **T6:** `templates.ts` — Token não é exposto fora do atributo `href` (asserção textual defensiva).

### 4.2 Testes de Integração de E-mail (`tests/integration/auth-email.test.ts`)

- [ ] **T7:** `POST /api/auth/sign-up/email` dispara envio automático de verificação (`outbox` recebe 1 e-mail com link contendo token).
- [ ] **T8:** Usuário recém-criado consegue autenticar imediatamente via `POST /api/auth/sign-in/email` com 200 (comprova `requireEmailVerification: false`).
- [ ] **T9:** `GET /api/auth/verify-email?token=...` com token válido atualiza `user.emailVerified` para `true` no banco PostgreSQL.
- [ ] **T10:** Reutilização do mesmo token de verificação responde com status 4xx (token de uso único).
- [ ] **T11:** `GET /api/auth/verify-email` com token inválido responde 4xx e mantém `emailVerified: false`.
- [ ] **T12:** `POST /api/auth/send-verification-email` com e-mail existente responde 200 e empilha novo e-mail no `outbox`.
- [ ] **T13:** `POST /api/auth/send-verification-email` com e-mail inexistente responde 200 e mantém `outbox` inalterado (prevenção contra enumeração).
- [ ] **T14:** `POST /api/auth/forget-password` para usuário existente responde 200 e empilha e-mail com link de recuperação.
- [ ] **T15:** `POST /api/auth/forget-password` para e-mail inexistente responde 200 idêntico ao T14 e mantém `outbox` vazio.
- [ ] **T16:** `POST /api/auth/reset-password` com token válido altera a senha com sucesso (200), permitindo login com a nova senha.
- [ ] **T17:** Tentativa de sign-in utilizando a senha antiga após redefinição responde 401.
- [ ] **T18:** Tentativa de reutilização do token de redefinição de senha responde 4xx.
- [ ] **T19:** `POST /api/auth/reset-password` fornecendo senha inferior a 8 caracteres responde 4xx e preserva a senha antiga.
- [ ] **T20:** Inspeção do comportamento das sessões ativas prévias após redefinição de senha com registro em `DECISIONS.md`.

### 4.3 Testes de Integração Social e Segurança (`tests/integration/auth-social.test.ts`)

- [ ] **T21:** `POST /api/auth/sign-in/social` com `provider: 'google'` retorna 200 contendo URL de redirecionamento para o Google.
- [ ] **T22:** `POST /api/auth/sign-in/social` com provedor não suportado retorna 4xx (não 500).
- [ ] **T23:** Chamada para provedor sem credencial no ambiente responde 4xx da biblioteca sem exceção 500 (prova da configuração condicional §5.5).
- [ ] **T24:** `GET /api/auth/callback/google` com parâmetro `state` inválido responde 4xx e nenhuma linha é adicionada à tabela `user`.
- [ ] **T25:** `callbackURL` apontando para domínio não autorizado (`https://evil.example`) é rejeitado, protegendo contra Open Redirect.
- [ ] **T26:** Envio de 10 requisições seguidas a `/api/auth/forget-password` em ambiente de testes não emite 429 (prova de D-19).

---

## 5. Passos de Execução

1. **Pré-condição:** Aguardar autorização do usuário e conferência da branch base (`develop` sincronizada com PR #23).
2. **Criação da Branch:** `git checkout -b feature/f3s03-oauth-social-e-email`.
3. **Instalação do Pacote:** `pnpm add resend`.
4. **Configuração de Ambiente:** Atualizar `src/config/env.ts`, `.env.example` e estender `tests/unit/config/env.test.ts`.
5. **Módulo de E-mail:** Implementar `src/shared/email/templates.ts` e `src/shared/email/mailer.ts`.
6. **Suítes Unitárias:** Criar `tests/unit/shared/email/templates.test.ts` e `tests/unit/shared/email/mailer.test.ts`.
7. **Better Auth Config:** Atualizar `src/modules/auth/auth.config.ts`.
8. **Reconfirmação de Schema:** Executar `pnpm dlx @better-auth/cli generate` e validar ausência de alterações nas tabelas existentes.
9. **Suítes de Integração:** Implementar `tests/integration/auth-email.test.ts` e `tests/integration/auth-social.test.ts`.
10. **Validação Completa:** Executar pipeline de portões:
    `pnpm typecheck && pnpm lint && pnpm format && pnpm test && pnpm build`.
11. **Registro e Memória:** Atualizar `DECISIONS.md` (decisão D-46), `PROGRESS.md` e criar `F3-S03.md`.
12. **Abertura do Pull Request:** Enviar branch ao GitHub e monitorar CI via `gh run watch --exit-status`.
