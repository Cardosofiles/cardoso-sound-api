# Plano de Implementação — F5-S05: Two Factor (TOTP, OTP e Backup Codes)

| Metadado              | Valor                                                                                                                                                                                                                                                                                                                                                                     |
| :-------------------- | :------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Sprint**            | **F5-S05** — Two Factor: TOTP, OTP por E-mail e Backup Codes                                                                                                                                                                                                                                                                                                              |
| **Fase**              | F5 — Produção · 4º dos 6 sprints de blindagem de segurança ([D-49](file:///.agents/memory/DECISIONS.md#d-49))                                                                                                                                                                                                                                                             |
| **Branch**            | `feature/f5s05-two-factor`                                                                                                                                                                                                                                                                                                                                                |
| **Depende de**        | F5-S04 (Endurecimento de Sessão, Schema e Contrato)                                                                                                                                                                                                                                                                                                                       |
| **Entrega**           | R32–R40 · **GAP-02** e metade 2FA do **GAP-09**                                                                                                                                                                                                                                                                                                                           |
| **Decisões Centrais** | [D-53](file:///.agents/memory/DECISIONS.md#d-53) (Two Factor mandatário), [D-13](file:///.agents/memory/DECISIONS.md#d-13) (Bearer + Cookie), [D-39](file:///.agents/memory/DECISIONS.md#d-39) (Edição manual de migrações), [D-40](file:///.agents/memory/DECISIONS.md#d-40) (Schemas Better Auth), [D-31](file:///.agents/memory/DECISIONS.md#d-31) (404 em vez de 403) |
| **Status do Plano**   | ⏸ **Aguardando autorização explícita do Staff / Usuário para codar (Etapa 3 do protocolo)**                                                                                                                                                                                                                                                                               |

---

## 1. Diagnóstico e Confirmações Prévias da Biblioteca (§5.1)

A inspeção detalhada do pacote instalado (`better-auth@1.7.2`) nos arquivos em `node_modules/better-auth/dist/plugins/two-factor/` revelou quatro fatos técnicos mandatórios que governam a implementação:

### 1.1 Assinatura de `twoFactor()` e Divergência de Propriedade

- **`issuer`**: Aceita `'Cardoso Sound'` perfeitamente.
- **`skipVerificationOnEnable: false`**: Suportado e ativo nativamente.
- **`totpOptions`**:
  - `digits: 6`, `period: 30`.
  - ⚠️ **Divergência detectada em `backupCodes`**: O sprint brief (§3.3) especificou `{ backupCodes: { count: 10 } }`. No TypeScript e na definição de tipo da versão 1.7.2 (`BackupCodeOptions` em `types.d.mts`), a propriedade chama-se **`amount`**, **não** `count`. Usar `count` resulta no erro de compilação `TS2353: Object literal may only specify known properties, and 'count' does not exist in type 'BackupCodeOptions'`. A configuração canônica corrigida é `{ backupCodes: { amount: 10 } }` (cujo valor default já é 10).
- **`otpOptions`**:
  - `digits: 6`.
  - `period: 10` (definido em **minutos** na lib, resultando em janela de validade de 10 minutos).
  - `sendOTP({ user, otp })`: Função assíncrona consumindo o mailer existente.
- **`trustDevice`**: Fica **desligado** por [D-53](file:///.agents/memory/DECISIONS.md#d-53) (não configurado).

### 1.2 Mapeamento Real de Endpoints vs §3.1

O sprint brief listou 9 endpoints HTTP (R32–R40). A introspecção em tempo de execução dos endpoints registrados pelo plugin revelou:

1. `POST /api/auth/two-factor/enable` (R32) — exige sessão ativa.
2. `POST /api/auth/two-factor/disable` (R33) — exige sessão ativa e senha.
3. `POST /api/auth/two-factor/get-totp-uri` (R34) — exige sessão ativa e senha.
4. `POST /api/auth/two-factor/verify-totp` (R35) — fluxo de sign-in (com cookie de desafio) ou ativação (com sessão).
5. `POST /api/auth/two-factor/send-otp` (R36) — fluxo de sign-in (com cookie de desafio).
6. `POST /api/auth/two-factor/verify-otp` (R37) — fluxo de sign-in (com cookie de desafio).
7. `POST /api/auth/two-factor/generate-backup-codes` (R38) — exige sessão ativa e senha.
8. `POST /api/auth/two-factor/verify-backup-code` (R39) — fluxo de sign-in (com cookie de desafio).

- ⚠️ **Divergência em R40 (`view-backup-codes`)**: No `better-auth@1.7.2`, `viewBackupCodes` é declarado como `createAuthEndpoint.serverOnly(...)`. Ele **não possui rota HTTP** e não tem método no cliente HTTP:

  > _"A server-only function that returns a user's decrypted two-factor backup codes. It is not exposed over HTTP and has no client method; call it from trusted server code with a userId taken from an authenticated session."_

  Conforme instrução expressa da §3.1 e §5.1 do sprint ("se a versão instalada montar um conjunto diferente, use o que ela monta e corrija esta tabela no PR"), o contrato HTTP expõe **8 rotas HTTP reais** (R32 a R39), e R40 é uma função interna do servidor (`auth.api.viewBackupCodes`).

### 1.3 Formato da Resposta de `/sign-in/email` com 2FA Ativo (§3.6)

Quando um usuário com `user.twoFactorEnabled: true` submete credenciais corretas em `POST /api/auth/sign-in/email`:

- A sessão temporária inicial é revogada imediatamente (`deleteSessionCookie`).
- Um token de desafio é gerado na tabela `verification` (`identifier: 2fa-<random20>`) com TTL de 600 segundos (10 minutos).
- Um cookie assinado `better-auth.two_factor` contendo o identifier é devolvido no header `Set-Cookie`.
- A rota responde HTTP 200 com payload JSON estrito:
  ```json
  {
    "twoFactorRedirect": true,
    "twoFactorMethods": ["totp", "otp"]
  }
  ```
- **Nenhum token Bearer (`set-auth-token`) nem objeto de sessão é devolvido** neste estágio. O cliente Flutter deve interceptar o marcador `twoFactorRedirect: true` e redirecionar para o desafio de 2FA, repassando o cookie `better-auth.two_factor` para `/verify-totp`, `/send-otp` + `/verify-otp`, ou `/verify-backup-code`.
- Ao concluir a verificação do segundo fator, a rota emite a sessão definitiva e devolve o Bearer token via header `set-auth-token` e body `{ token, user }`.

### 1.4 Bloqueio de Conta Nativo (Account Lockout)

- O bloqueio de conta é **nativo e ativado por padrão** no Better Auth (`accountLockout.enabled: true`).
- **Limiar real de fábrica:** 10 tentativas consecutivas incorretas somadas entre TOTP, OTP e backup codes (`maxFailedAttempts: 10`), com bloqueio temporário de 900 segundos / 15 minutos (`durationSeconds: 900`).
- Além disso, há um limite interno por desafio de **5 tentativas** no mesmo cookie (`beginAttempt(5)`), que expira o desafio com `TOO_MANY_ATTEMPTS_REQUEST_NEW_CODE` (HTTP 400).
- Quando o número de falhas acumuladas na conta atinge o teto, `assertTwoFactorNotLocked` lança erro HTTP **429** com código `ACCOUNT_TEMPORARILY_LOCKED`.
- Para harmonizar o teste T19 ("6+ tentativas de `verify-totp` erradas seguidas na mesma conta"), podemos manter o default da lib ou configurar `accountLockout: { maxFailedAttempts: 5 }` explicitamente no `auth.config.ts`, garantindo que na 6ª tentativa a conta responda 429.

### 1.5 Diagnóstico de Schema Drizzle: Colunas Mandatórias da Versão 1.7.2

O schema inicial de rascunho na §3.2 continha apenas 5 colunas em `two_factor` (`id`, `userId`, `secret`, `backupCodes`, `createdAt`).
A execução do adapter do Drizzle com o plugin `twoFactor` ativo demonstrou que o método `create()` valida os campos via `checkMissingFields` e lança a exceção:
`The field "verified" does not exist in the "twoFactor" Drizzle schema. Please update your drizzle schema or re-generate using "npx auth@latest generate".`

Adicionalmente, a lógica de bloqueio de conta e verificação consome:

- `verified: boolean`: Utilizado para implementar `skipVerificationOnEnable: false`. Inicia em `false` e passa para `true` apenas após o primeiro TOTP válido.
- `failedVerificationCount: integer`: Utilizado por `recordTwoFactorFailure` para contar tentativas erradas.
- `lockedUntil: timestamp`: Armazena a expiração do bloqueio temporário por conta.

Seguindo a regra de ouro da **§5.2** (_"Se o CLI acusar coluna faltando, é a §3.2 que está errada — corrija o schema, não o CLI"_), a tabela `two_factor` deve ser declarada com as colunas completas requeridas pelo Better Auth v1.7.2.

---

## 2. GAPs Alvo e Resolução

| GAP                       | Severidade | Domínio        | Descrição do Problema                                                                                                                                                    | Resolução neste Sprint                                                                                                                                                                                                       |
| :------------------------ | :--------- | :------------- | :----------------------------------------------------------------------------------------------------------------------------------------------------------------------- | :--------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **GAP-02**                | **ALTO**   | MFA            | Plugin `twoFactor` ausente na API. Falta de segundo fator para mitigação de roubo de senhas e ausência de bloqueio por conta contra ataques distribuídos de força bruta. | Registro de `twoFactor()` em [`src/modules/auth/auth.config.ts`](file:///src/modules/auth/auth.config.ts) com TOTP, OTP por e-mail, backup codes e bloqueio nativo `429 ACCOUNT_TEMPORARILY_LOCKED`.                         |
| **GAP-09** _(metade 2FA)_ | **MÉDIO**  | Banco de Dados | Inexistência da tabela `two_factor` e da coluna `user.two_factor_enabled` no schema Drizzle e no banco PostgreSQL.                                                       | Criação da coluna em `user` e da tabela `two_factor` com `onDelete: 'cascade'` em [`src/db/schema/users.schema.ts`](file:///src/db/schema/users.schema.ts), reexportação no barrel, migração `0003_*.sql` gerada e aplicada. |

---

## 3. Blast Radius Estrito

### 3.1 Arquivos a Criar

1. `drizzle/0003_*.sql`: Nova migração SQL gerada via `pnpm db:generate`, auditada e aplicada via `pnpm db:migrate`.
2. `tests/unit/shared/email/two-factor-otp.test.ts`: Suíte de testes unitários do template de e-mail OTP (T25 a T28).
3. `tests/integration/schema-two-factor.test.ts`: Suíte de validação de integridade relacional, colunas, índices e constraints de 2FA (T1 a T5).
4. `tests/integration/auth-two-factor.test.ts`: Suíte de fluxos HTTP de dois fatores via `app.inject()` (T6 a T24).
5. `docs/agents-plans/plan-f5-s05-two-factor.md`: Este plano de implementação persistido no repositório.
6. `.agents/memory/F5-S05.md`: Memória técnica da entrega e guia de contrato para o app Flutter.

### 3.2 Arquivos a Editar

1. [`src/db/schema/users.schema.ts`](file:///src/db/schema/users.schema.ts): Adição da coluna `twoFactorEnabled` na tabela `user` e definição da tabela `twoFactor`.
2. [`src/db/schema/index.ts`](file:///src/db/schema/index.ts): Reexportação de `twoFactor` no barrel do schema para visibilidade pelo `drizzleAdapter`.
3. [`src/shared/email/templates.ts`](file:///src/shared/email/templates.ts): Implementação da função pura `twoFactorOtpEmail({ name, otp })` com escape estrito de HTML.
4. [`src/modules/auth/auth.config.ts`](file:///src/modules/auth/auth.config.ts):
   - Adição de 4 regras em `AUTH_RATE_LIMIT_RULES` para endpoints de 2FA.
   - Registro do plugin `twoFactor(...)` na lista de plugins.
5. [`.agents/memory/PROGRESS.md`](file:///.agents/memory/PROGRESS.md): Atualização do roadmap com conclusão de F5-S05 e registro de contratos entregues.
6. [`docs/openapi.json`](file:///docs/openapi.json): Apenas se houver alteração detectada por `pnpm openapi:export -- --check` (como a rota coringa possui `hide: true`, não deve alterar).

### 3.3 Arquivos Intocáveis (Proibido Alterar)

- `src/modules/auth/auth.plugin.ts` — **Especialmente a lista de métodos `['GET', 'POST', 'OPTIONS']` da coringa `/api/auth/*`**. O Better Auth utiliza apenas `POST` para mutações de 2FA; adicionar `DELETE` é expressamente proibido (Armadilha 6 e spec 08 §7.2).
- `src/config/env.ts` — Nenhuma variável de ambiente nova é necessária.
- `src/app.ts` e `src/server.ts` — Inalterados.
- `src/plugins/**` — Inalterados.
- `src/modules/{artists,tracks,playlists,favorites,users}/**` — Inalterados.
- `src/shared/email/mailer.ts` — O mailer existente atende perfeitamente ao envio de OTP.
- `drizzle/` migrações anteriores (`0000_*.sql`, `0001_*.sql`, `0002_*.sql`) — Imutáveis.

---

## 4. Detalhamento Técnico da Implementação

### Passo 1: Criação e chaveamento de branch Git

- Garantir workspace limpo no `develop`.
- Criar e mudar para a branch:
  ```bash
  git checkout -b feature/f5s05-two-factor
  ```

### Passo 2: Extensão do Schema Drizzle

Em [`src/db/schema/users.schema.ts`](file:///src/db/schema/users.schema.ts):

```typescript
// 1. Coluna twoFactorEnabled na tabela user
export const user = pgTable('user', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  email: text('email').notNull().unique(),
  emailVerified: boolean('email_verified').notNull().default(false),
  image: text('image'),
  twoFactorEnabled: boolean('two_factor_enabled').notNull().default(false),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
});

// 2. Tabela twoFactor com integridade referencial em cascata e campos da lib
export const twoFactor = pgTable(
  'two_factor',
  {
    id: text('id').primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    secret: text('secret').notNull(),
    backupCodes: text('backup_codes').notNull(),
    verified: boolean('verified').notNull().default(false),
    failedVerificationCount: integer('failed_verification_count').notNull().default(0),
    lockedUntil: timestamp('locked_until'),
    createdAt: timestamp('created_at').notNull().defaultNow(),
  },
  (t) => [index('two_factor_user_id_idx').on(t.userId)],
);
```

Em [`src/db/schema/index.ts`](file:///src/db/schema/index.ts):

- Exportar `twoFactor` junto com as demais tabelas de autenticação.

### Passo 3: Geração, Auditoria e Aplicação da Migração

1. Executar `pnpm db:generate`.
2. Auditar linha a linha o SQL gerado em `drizzle/0003_*.sql`. Deve conter exclusivamente:
   - `ALTER TABLE "user" ADD COLUMN "two_factor_enabled" boolean DEFAULT false NOT NULL;`
   - `CREATE TABLE "two_factor" (...);`
   - `ALTER TABLE "two_factor" ADD CONSTRAINT ... FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE cascade;`
   - `CREATE INDEX "two_factor_user_id_idx" ON "two_factor" USING btree ("user_id");`
3. Aplicar localmente:
   ```bash
   pnpm db:migrate
   ```
4. O uso de `pnpm db:push` é estritamente proibido.

### Passo 4: Template de E-mail OTP

Em [`src/shared/email/templates.ts`](file:///src/shared/email/templates.ts):

```typescript
export function twoFactorOtpEmail(input: { name: string; otp: string }): {
  subject: string;
  html: string;
} {
  const safeName = escapeHtml(input.name.trim() || 'Usuário');
  const safeOtp = escapeHtml(input.otp.trim());

  return {
    subject: 'Seu código de verificação — Cardoso Sound',
    html: `
<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8">
  <title>Código de Verificação de Segundo Fator</title>
</head>
<body style="font-family: sans-serif; line-height: 1.5; color: #333;">
  <h2>Olá, ${safeName}!</h2>
  <p>Você solicitou um código de autenticação de dois fatores para acessar sua conta no Cardoso Sound.</p>
  <p style="margin: 24px 0; font-size: 28px; font-weight: bold; letter-spacing: 4px; color: #1db954;">
    ${safeOtp}
  </p>
  <p>Este código é válido por 10 minutos.</p>
  <p style="color: #666; font-size: 14px;">Se você não solicitou este código, altere sua senha imediatamente e encerre suas sessões ativas.</p>
</body>
</html>
`.trim(),
  };
}
```

_Regras inegociáveis de segurança:_

- O OTP fica no corpo de texto visível, **nunca** em um `<a href="...">` (Armadilha 8).
- O OTP **não** é colocado no campo `subject` do e-mail (evita vazamento em notificações de tela de bloqueio).
- Todas as variáveis interpoladas passam por `escapeHtml` (mitigação contra XSS / GAP-22).

### Passo 5: Configuração do Better Auth e Rate Limit

Em [`src/modules/auth/auth.config.ts`](file:///src/modules/auth/auth.config.ts):

1. Acrescentar as 4 regras relativas ao `basePath` em `AUTH_RATE_LIMIT_RULES`:
   ```typescript
   export const AUTH_RATE_LIMIT_RULES = {
     // ... regras existentes ...
     '/two-factor/verify-totp': { window: 60, max: 5 },
     '/two-factor/verify-otp': { window: 60, max: 5 },
     '/two-factor/send-otp': { window: 3600, max: 5 },
     '/two-factor/verify-backup-code': { window: 3600, max: 5 },
   } as const;
   ```
2. Adicionar o plugin `twoFactor` em `createAuth()`:
   ```typescript
   plugins: [
     bearer(),
     forgetPasswordPlugin(),
     weakPasswordPlugin(),
     twoFactor({
       issuer: 'Cardoso Sound',
       skipVerificationOnEnable: false,
       totpOptions: {
         digits: 6,
         period: 30,
         backupCodes: { amount: 10 },
       },
       otpOptions: {
         digits: 6,
         period: 10,
         async sendOTP({ user, otp }) {
           const { subject, html } = twoFactorOtpEmail({
             name: user.name || 'Usuário',
             otp,
           });
           await mailer.send({ to: user.email, subject, html });
         },
       },
       accountLockout: {
         enabled: true,
         maxFailedAttempts: 5,
         durationSeconds: 900,
       },
     }),
   ],
   ```

---

## 5. Estratégia de Testes (T1 a T30)

### 5.1 Testes Unitários de Template (`tests/unit/shared/email/two-factor-otp.test.ts`)

- **T25**: `twoFactorOtpEmail({ name, otp: '123456' })` produz `html` contendo `123456`.
- **T26**: O OTP **não** aparece dentro de nenhum atributo `href` (asserção regex `href="[^"]*123456[^"]*"` deve ser nula).
- **T27**: `name: '<script>alert(1)</script>'` é sanitizado para `&lt;script&gt;alert(1)&lt;/script&gt;` (GAP-22 preservado).
- **T28**: `subject` é não-vazio e não contém o código OTP.

### 5.2 Testes de Integração de Schema (`tests/integration/schema-two-factor.test.ts`)

Executados contra Testcontainers PostgreSQL:

- **T1**: Tabela `two_factor` existe no PostgreSQL e possui todas as colunas canônicas esperadas (`id`, `user_id`, `secret`, `backup_codes`, `verified`, `failed_verification_count`, `locked_until`, `created_at`).
- **T2**: Coluna `two_factor_enabled` na tabela `user` existe, é `NOT NULL` e tem default `false`.
- **T3**: Índice `two_factor_user_id_idx` está presente em `pg_indexes`.
- **T4**: Foreign key `two_factor_user_id_fkey` possui constraint `ON DELETE CASCADE`.
- **T5**: Validação programática de conformidade com `getAuthTables` do Better Auth (demonstrando zero divergência de colunas).

### 5.3 Testes de Integração de Autenticação (`tests/integration/auth-two-factor.test.ts`)

Utilizando `app.inject()` contra Testcontainers e gerador de TOTP determinístico via `auth.api.generateTOTP` ou HMAC-SHA1 nativo (`node:crypto`):

- **T6**: `POST /api/auth/two-factor/enable` sem sessão -> 401 Unauthorized.
- **T7**: `POST /api/auth/two-factor/get-totp-uri` com sessão ativa e senha válida -> 200 com URI `otpauth://` contendo `Cardoso%20Sound` ou `Cardoso Sound`.
- **T8**: `enable` seguido de `verify-totp` com código válido -> 200; `user.two_factor_enabled = true` no banco de dados.
- **T9**: `enable` com código TOTP inválido -> erro 4xx; `two_factor_enabled` permanece `false` (prova `skipVerificationOnEnable: false`).
- **T10**: `POST /api/auth/sign-in/email` de usuário com 2FA ativo -> não emite sessão; responde `{ twoFactorRedirect: true, twoFactorMethods: [...] }` e cookie `better-auth.two_factor`.
- **T11**: `POST /api/auth/two-factor/verify-totp` com cookie de desafio e código válido -> 200 com header `set-auth-token` e sessão criada.
- **T12**: `POST /api/auth/two-factor/send-otp` com cookie de desafio -> 200; `outbox` contém 1 e-mail com 6 dígitos.
- **T13**: `POST /api/auth/two-factor/verify-otp` com código recebido no `outbox` -> 200 com sessão e bearer token.
- **T14**: `POST /api/auth/two-factor/verify-otp` com código expirado (simulado ou relógio avançado > 10 min) -> erro 4xx.
- **T15**: `POST /api/auth/two-factor/generate-backup-codes` com sessão ativa -> retorna array de 10 códigos únicos.
- **T16**: `POST /api/auth/two-factor/verify-backup-code` com código válido -> 200 com sessão criada.
- **T17**: Submissão do **mesmo** backup code uma segunda vez -> erro 4xx (uso único).
- **T18**: Nova geração via `generate-backup-codes` seguida de tentativa com código anterior -> 4xx (invalidação de códigos prévios).
- **T19**: 6 tentativas consecutivas de `verify-totp` com códigos incorretos na mesma conta -> responde **429** com `ACCOUNT_TEMPORARILY_LOCKED`.
- **T20**: `POST /api/auth/two-factor/disable` com sessão e senha válida -> 200; `user.two_factor_enabled = false`.
- **T21**: Usuário comum **sem** 2FA ativo -> sign-in continua devolvendo sessão e token diretamente (regressão zero).
- **T22**: `DELETE /api/v1/me` de usuário com 2FA ativo -> 204 No Content; linha correspondente em `two_factor` é eliminada via cascata do banco (GAP-09 / T4).
- **T23**: Varredura de todos os e-mails enviados no `outbox` durante os testes -> nenhum e-mail contém o `secret` do TOTP.
- **T24**: Nenhuma resposta HTTP expõe o `secret` ou os `backupCodes` de outro usuário.

### 5.4 Testes E2E e Determinismo

- **T29**: Suíte E2E completa passando 100% verde.
- **T30**: Execução completa da suíte de testes sob `--sequence.shuffle` para garantia de isolamento e ausência de efeitos colaterais.

---

## 6. Runbook de Verificação Manual com Autenticador Real (§7)

Após a passagem de todos os testes automatizados, a verificação manual será conduzida em ambiente local de desenvolvimento com transporte de e-mail em memória:

```bash
# 1. Cadastrar e verificar um novo usuário via cURL
curl -s -X POST http://localhost:3333/api/auth/sign-up/email \
  -H "content-type: application/json" \
  -d '{"name":"Tester 2FA","email":"tester2fa@example.com","password":"SenhaForte!2026"}'

# 2. Obter link de confirmação do log do Pino / outbox e confirmar titularidade
curl -s "http://localhost:3333/api/auth/verify-email?token=<token-do-log>"

# 3. Autenticar para obter o Bearer token inicial
TOKEN=$(curl -s -X POST http://localhost:3333/api/auth/sign-in/email \
  -H "content-type: application/json" \
  -d '{"email":"tester2fa@example.com","password":"SenhaForte!2026"}' \
  | jq -r '.token')

# 4. Habilitar 2FA e obter a URI otpauth://
TOTP_URI=$(curl -s -X POST http://localhost:3333/api/auth/two-factor/enable \
  -H "Authorization: Bearer $TOKEN" \
  -H "content-type: application/json" \
  -d '{"password":"SenhaForte!2026","method":"totp"}' \
  | jq -r '.totpURI')

echo "Escaneie esta URI no Google Authenticator / 1Password / Aegis: $TOTP_URI"

# 5. Confirmar a ativação provando o primeiro código de 6 dígitos gerado pelo app
curl -s -X POST http://localhost:3333/api/auth/two-factor/verify-totp \
  -H "Authorization: Bearer $TOKEN" \
  -H "content-type: application/json" \
  -d '{"code":"<6-digitos-do-app>"}' | jq

# 6. Conferir status no PostgreSQL
docker compose exec -T postgres psql -U cardoso -d cardoso_sound \
  -c "SELECT email, two_factor_enabled FROM \"user\" WHERE email = 'tester2fa@example.com';"

# 7. Testar fluxo de sign-in: deve retornar twoFactorRedirect: true e Set-Cookie
curl -i -s -X POST http://localhost:3333/api/auth/sign-in/email \
  -H "content-type: application/json" \
  -d '{"email":"tester2fa@example.com","password":"SenhaForte!2026"}'
```

---

## 7. Critérios de Aceite e Definition of Done

- [ ] Branch `feature/f5s05-two-factor` criada a partir de `develop`.
- [ ] Schema Drizzle atualizado com `user.twoFactorEnabled` e tabela `twoFactor` com `onDelete: 'cascade'`.
- [ ] Reexportação de `twoFactor` presente em `src/db/schema/index.ts`.
- [ ] Migração `0003_*.sql` gerada via `pnpm db:generate`, auditada e aplicada via `pnpm db:migrate`.
- [ ] `pnpm db:push` **não** foi utilizado em nenhum momento.
- [ ] Template `twoFactorOtpEmail` criado em `src/shared/email/templates.ts`, com código no corpo, fora de tags `<a>`, sem OTP no `subject`, e variáveis escapadas com `escapeHtml`.
- [ ] 4 regras de rate limit de 2FA adicionadas em `AUTH_RATE_LIMIT_RULES` relativas ao `basePath`.
- [ ] Plugin `twoFactor` configurado em `src/modules/auth/auth.config.ts` com `skipVerificationOnEnable: false`, `trustDevice` ausente, e envio de OTP configurado.
- [ ] Rota coringa `/api/auth/*` em `src/modules/auth/auth.plugin.ts` permanece com métodos `['GET', 'POST', 'OPTIONS']` estritamente inalterados.
- [ ] Suíte de testes T1 a T30 verdes.
- [ ] Cinco portões de qualidade executados e aprovados:
  ```bash
  pnpm typecheck && pnpm lint && pnpm format && pnpm test && pnpm build
  ```
- [ ] Verificação de OpenAPI no CI aprovada:
  ```bash
  pnpm openapi:export -- --check
  ```
- [ ] Sincronização de schema validada sem discrepâncias:
  ```bash
  pnpm dlx @better-auth/cli@latest generate --config src/modules/auth/auth.config.ts
  ```
- [ ] Documentação de memória criada em `.agents/memory/F5-S05.md` e roadmap atualizado em `.agents/memory/PROGRESS.md`.
- [ ] PR aberto via `gh pr create` apontando para `develop` e aguardando CI verde.

---

> ⏸ **PAUSA OBRIGATÓRIA (Etapa 3 do Protocolo):** O planejamento está concluído. Nenhum código de produção ou teste foi modificado ainda. Aguardando autorização explícita do desenvolvedor para iniciar a implementação.
