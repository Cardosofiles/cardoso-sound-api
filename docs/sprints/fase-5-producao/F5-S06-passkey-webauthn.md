# F5-S06 — Passkey (WebAuthn / FIDO2)

|                |                                                          |
| -------------- | -------------------------------------------------------- |
| **Fase**       | F5 — Produção · **5º dos 6 sprints de blindagem** (D-49) |
| **Branch**     | `feature/f5s06-passkey-webauthn`                         |
| **Depende de** | F5-S05                                                   |
| **Entrega**    | R41–R45 · GAP-03 e a metade Passkey do GAP-09            |

> **Único sprint da blindagem com dependência nova de produção:** `@better-auth/passkey`,
> aprovada em **D-54**. Diferente do 2FA, o Passkey não vem no pacote `better-auth`.
>
> **Único sprint da blindagem cujo caminho feliz não é automatizável.** WebAuthn exige um
> autenticador real — biometria, chave de segurança ou o gerenciador de senhas do navegador. A
> §7 é verificação manual em navegador, e isso é **intencional**: não invente mock de
> autenticador para fingir cobertura.

---

## 0. Pré-requisitos humanos — confira ANTES de abrir a sessão

| Item                                                                                                  | Por quê                                                |
| ----------------------------------------------------------------------------------------------------- | ------------------------------------------------------ |
| Navegador com suporte a WebAuthn (Chrome, Firefox, Safari)                                            | O registro e a autenticação da §7 acontecem nele       |
| Um autenticador: TouchID/FaceID/Windows Hello, chave FIDO2, ou o **autenticador virtual do DevTools** | Sem isso a §7 não é executável                         |
| `localhost` — **não** um IP nem um túnel com domínio diferente                                        | `rpID` é derivado do host; IP puro não é `rpID` válido |

> **O autenticador virtual do Chrome DevTools resolve tudo isso sem hardware:**
> DevTools → ⋮ → More tools → WebAuthn → Enable virtual authenticator environment.
> É o caminho recomendado para a §7.

---

## 1. Prompt de abertura

```
Leia .agents/memory/PROGRESS.md e .agents/memory/DECISIONS.md para se contextualizar.
Leia D-54 (é a decisão que este sprint executa, e é a que aprova a dependência nova),
D-32 (política de scripts de build de dependências) e D-40 (schemas do Better Auth).
Leia .agents/memory/F5-S05.md — ele acabou de estender o mesmo auth.config.ts e o mesmo
schema, e registrou a versão do better-auth em que os callbacks foram validados.

Sprint alvo: docs/sprints/fase-5-producao/F5-S06-passkey-webauthn.md
Specs obrigatórias: docs/specs/08-blindagem-de-seguranca.md (§6.3, §7.2, §3.3),
                    docs/specs/02-modelo-de-dados.md

ANTES de instalar qualquer coisa, execute a §5.1: descubra a versão de @better-auth/passkey
compatível com o better-auth instalado, confirme o caminho de import, a assinatura de
passkey() e a lista de endpoints montados. `pnpm add` só depois de reportar isso.
Se a versão compatível não existir, PARE e reporte — não faça downgrade nem upgrade do
better-auth por conta própria.

Depois de instalar, confira se D-32 exige entrada em allowBuilds para o pacote novo.

O schema sai de `pnpm dlx @better-auth/cli generate` conferido contra a §3.2. A migração
sai de `pnpm db:generate`, é revisada por você linha a linha, e só então aplicada.
`pnpm db:push` é proibido.

Siga o protocolo de docs/specs/07-protocolo-dos-agentes.md:
entre em modo de planejamento, apresente o plano COMPLETO da sprint e
AGUARDE minha autorização explícita antes de escrever qualquer código.

Não toque em nenhum arquivo fora do blast radius declarado no sprint.
```

---

## 2. Objetivo

Entregar autenticação **resistente a phishing**.

É a diferença qualitativa deste sprint em relação a todos os anteriores: senha, OTP e TOTP podem
ser entregues a um site falso por um usuário convencido. Uma passkey **não pode** — a credencial
é ligada criptograficamente à origem, e o navegador se recusa a usá-la em outro domínio. Nenhuma
das defesas construídas em F5-S02 a F5-S05 cobre esse vetor.

Duas capacidades:

- **`POST /sign-in/passkey`** — entrar sem senha, com biometria ou chave de segurança.
- **Gestão de passkeys** — registrar, listar, renomear e remover credenciais da própria conta.

**Não faz parte deste sprint:** fluxo passkey-first (registro sem sessão — D-54 fixa
`requireSession: true`) · autofill condicional / `mediation: 'conditional'` · sincronização
multi-dispositivo (é do provedor, não nossa) · o cliente Flutter.

---

## 3. Contratos esperados

### 3.1 Rotas — montadas pela lib

| #   | Rota                                       | Sessão exigida |
| --- | ------------------------------------------ | -------------- |
| R41 | `POST /api/auth/sign-in/passkey`           | não            |
| R42 | `POST /api/auth/passkey/add-passkey`       | **sim**        |
| R43 | `GET /api/auth/passkey/list-user-passkeys` | sim            |
| R44 | `POST /api/auth/passkey/delete-passkey`    | sim            |
| R45 | `POST /api/auth/passkey/update-passkey`    | sim            |

Todas passam pela coringa que F3-S01 entregou. **Você não escreve rota.** Confirme a lista na
§5.1; se a versão instalada montar outro conjunto, use o dela e **corrija esta tabela no PR**.

> **`['GET','POST','OPTIONS']` da coringa cobre as cinco.** `delete-passkey` é `POST`, não
> `DELETE` — a documentação oficial é explícita e uma auditoria anterior errou nisso
> (spec `08` §7.2). **Não mexa na lista de métodos.**

### 3.2 Schema — spec `08` §6.3

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

Mais a reexportação em `src/db/schema/index.ts` — o `drizzleAdapter` recebe `* as schema` e
**não enxerga tabela fora do barrel**.

Duas colunas que auditorias anteriores omitiram e que **não são opcionais**:

- **`UNIQUE(credential_id)`** — sem ela, a mesma credencial WebAuthn pode ser registrada sob dois
  usuários, e a resolução de identidade no `sign-in` fica ambígua. É a diferença entre "entrar
  como você" e "entrar como alguém".
- **`aaguid`** — identifica o modelo do autenticador; o plugin o consome em
  `registration.afterVerification`.

### 3.3 `auth.config.ts` — spec `08` §7.2

```ts
passkey({
  rpID: new URL(env.BETTER_AUTH_URL).hostname,
  rpName: 'Cardoso Sound',
  origin: env.BETTER_AUTH_URL,
  registration: { requireSession: true },
});
```

**`rpID` e `origin` são derivados de `BETTER_AUTH_URL`, nunca variáveis próprias** (D-54). Duas
fontes de verdade para o domínio é exatamente como nasce o bug em que a passkey registrada em
`localhost` não valida em produção.

### 3.4 `customRules` — 1 entrada nova

```ts
'/sign-in/passkey': { window: 60, max: 10 },
```

---

## 4. Blast radius

### Criar

```
drizzle/000X_*.sql                                # gerada, revisada
tests/unit/modules/auth/passkey-config.test.ts
tests/integration/auth-passkey.test.ts
tests/integration/schema-passkey.test.ts
```

### Editar

```
package.json                         # + @better-auth/passkey (D-54)
pnpm-lock.yaml                        # consequência do install
src/db/schema/users.schema.ts        # tabela passkey
src/db/schema/index.ts               # reexportação
src/modules/auth/auth.config.ts      # plugin passkey + 1 customRule
.agents/memory/PROGRESS.md
.agents/memory/F5-S06.md
```

**Não toque em:** `src/modules/auth/auth.plugin.ts` (**a lista de métodos da coringa
especialmente**) · `src/config/env.ts` (D-54 proíbe variável nova para `rpID`) · `src/app.ts` ·
`src/plugins/**` · `src/shared/**` · `src/modules/{users,playlists,favorites,artists,tracks}/**` ·
migrações já aplicadas · `tests/e2e/**`.

> **`DECISIONS.md` não está na lista.** D-54 já aprova a dependência e fixa a derivação de
> `rpID`. **Exceção autorizada:** se a §5.1 exigir entrada em `allowBuilds` por D-32, registre
> isso em `F5-S06.md`, não em `DECISIONS.md` — D-32 já é a decisão.

---

## 5. Passo a passo

### 5.1 Compatibilidade e instalação — antes de qualquer código

```bash
pnpm view @better-auth/passkey versions --json | tail -20
pnpm view @better-auth/passkey peerDependencies
cat node_modules/better-auth/package.json | grep '"version"'
```

Reporte **antes de instalar**: qual versão de `@better-auth/passkey` declara compatibilidade com
o `better-auth` instalado. Se nenhuma declarar, **pare e reporte** — fazer upgrade ou downgrade
do `better-auth` invalida tudo o que F5-S02 a F5-S05 validaram contra a versão atual, e é
decisão do dono, não do sprint.

```bash
pnpm add @better-auth/passkey
pnpm install    # se acusar ERR_PNPM_IGNORED_BUILDS, aplique D-32
```

Depois:

```bash
grep -rn "export.*passkey" node_modules/@better-auth/passkey/dist/index.d.ts
grep -rn "rpID\|rpName\|requireSession\|aaguid" node_modules/@better-auth/passkey/dist/*.d.ts | head -20
```

Confirme a assinatura da §3.3 e a lista de endpoints da §3.1. Divergência: **pare e reporte**.

### 5.2 Schema, antes da config

Mesma ordem e mesmo motivo de F5-S05: ligar o plugin com a tabela ausente faz o `drizzleAdapter`
lançar em runtime com mensagem obscura — foi assim que nasceu D-43.

```bash
# 1. escreva a tabela conforme §3.2 e reexporte no barrel
pnpm db:generate      # 2. gere
# 3. REVISE o SQL: CREATE TABLE + UNIQUE em credential_id + índice em user_id + FK CASCADE
pnpm db:migrate       # 4. aplique
pnpm dlx @better-auth/cli@latest generate --config src/modules/auth/auth.config.ts   # 5. confira
```

O passo 5 roda **depois** da §5.3. Se o CLI acusar coluna faltando, é a §3.2 que está errada —
**corrija o schema**, e diga em `F5-S06.md` qual coluna o CLI pediu que a spec não previa.

### 5.3 Ligar o plugin

```ts
plugins: [bearer(), forgetPasswordPlugin(), twoFactor({ /* F5-S05 */ }), passkey({ /* §3.3 */ })],
```

Três armadilhas de configuração, todas silenciosas — o registro simplesmente falha no navegador,
sem erro claro no servidor:

| Campo          | Certo                           | Errado                                           |
| -------------- | ------------------------------- | ------------------------------------------------ |
| `rpID`         | `localhost`, `api.exemplo.com`  | `http://localhost:3333`, `localhost:3333`, `com` |
| `origin`       | `http://localhost:3333`         | `http://localhost:3333/` (barra final)           |
| `rpID` em prod | o hostname de `BETTER_AUTH_URL` | um valor fixo escrito à mão                      |

`rpID` é **hostname puro**: sem esquema, sem porta, sem barra. E não pode ser um TLD nu. Por isso
a derivação `new URL(env.BETTER_AUTH_URL).hostname` é obrigatória (D-54) — ela produz o valor
certo nos três ambientes sem ninguém precisar lembrar da regra.

### 5.4 `requireSession: true` — e por que não o contrário

D-54 fixa `registration.requireSession: true`: só um usuário **já autenticado** registra passkey.

`false` habilitaria o fluxo passkey-first, e exigiria um `resolveUser` que identifica o usuário
**sem sessão** — ou seja, um endpoint público que aceita um identificador e devolve um desafio
ligado a uma conta. Isso é superfície de enumeração de usuários, exatamente o que F5-S03 acabou
de fechar no `/sign-up/email`. Não reabra pela porta dos fundos.

### 5.5 O que dá para testar automaticamente, e o que não dá

**Dá:** que os endpoints existem e exigem sessão onde devem; que o desafio é gerado com o `rpID`
correto; que o schema tem as restrições certas; que a derivação de `rpID`/`origin` é correta em
cada ambiente; que a lista, a renomeação e a remoção respeitam o dono (D-31 — **passkey de outro
usuário responde 404, nunca 403**).

**Não dá:** completar um registro ou uma autenticação WebAuthn. Isso exige um autenticador real
assinando um desafio.

**Não invente mock de autenticador.** Um teste que finge a assinatura não prova nada sobre
WebAuthn e dá falsa confiança justamente na parte criptográfica. A verificação é manual, na §7,
como F3-S03 fez com o round trip de OAuth — e pelo mesmo motivo.

### 5.6 Isolamento por usuário — D-31 vale aqui também

`delete-passkey` e `update-passkey` recebem um id de credencial. Confirme na §5.1 que o plugin
filtra por `userId` **na query**, e não só depois de buscar. Se a lib não filtrar, **pare e
reporte**: seria um IDOR dentro de uma dependência, e a correção não é deste sprint. O T14 e o
T15 existem para provar isso empiricamente.

---

## 6. Casos de teste obrigatórios

### Unit — `tests/unit/modules/auth/passkey-config.test.ts`

| #   | Caso                                                  | Esperado                 |
| --- | ----------------------------------------------------- | ------------------------ |
| T1  | `rpID` derivado de `http://localhost:3333`            | `'localhost'`            |
| T2  | `rpID` derivado de `https://api.cardososound.com`     | `'api.cardososound.com'` |
| T3  | `rpID` nunca contém `:`, `/` nem esquema              | asserção por regex       |
| T4  | `origin` é igual a `BETTER_AUTH_URL`, sem barra final | asserção estrita         |
| T5  | `registration.requireSession`                         | `true` — D-54            |

### Integração — `tests/integration/schema-passkey.test.ts`

| #   | Caso                                            | Esperado        |
| --- | ----------------------------------------------- | --------------- |
| T6  | Tabela `passkey` com as 11 colunas da §3.2      | todas presentes |
| T7  | `credential_id` tem restrição **UNIQUE**        | sim             |
| T8  | Inserir duas linhas com o mesmo `credential_id` | erro `23505`    |
| T9  | Coluna `aaguid` existe                          | sim             |
| T10 | FK de `passkey.user_id` com `ON DELETE CASCADE` | sim             |
| T11 | Índice `passkey_user_id_idx` presente           | sim             |
| T12 | `@better-auth/cli generate` sem diferença       | sem diferença   |

### Integração — `tests/integration/auth-passkey.test.ts`

| #   | Caso                                                                                         | Esperado                     |
| --- | -------------------------------------------------------------------------------------------- | ---------------------------- |
| T13 | `POST /passkey/add-passkey` **sem** sessão                                                   | 401 — prova `requireSession` |
| T14 | `GET /passkey/list-user-passkeys` com sessão, sem passkey registrada                         | 200 com lista vazia          |
| T15 | Usuário B tenta `delete-passkey` de credencial do usuário A (linha inserida direto no banco) | **404**, nunca 403 — D-31    |
| T16 | Usuário B tenta `update-passkey` de credencial do usuário A                                  | **404**, nunca 403 — D-31    |
| T17 | Após T15/T16, a linha do usuário A continua no banco                                         | intacta                      |
| T18 | `POST /sign-in/passkey` sem corpo válido                                                     | 4xx, **não** 500             |
| T19 | O desafio gerado traz `rpId` igual ao configurado                                            | asserção no corpo            |
| T20 | `DELETE /api/v1/me` de usuário com passkey (linha inserida direto)                           | 204; linha sumiu — cascade   |
| T21 | Nenhuma resposta expõe `public_key` ou `counter` de outro usuário                            | asserção explícita           |
| T22 | Usuário sem passkey: sign-in por senha continua funcionando                                  | 200 — sem regressão          |

### E2E

| #   | Caso                                    | Esperado |
| --- | --------------------------------------- | -------- |
| T23 | Suíte E2E completa                      | verde    |
| T24 | Suíte completa sob `--sequence.shuffle` | verde    |

---

## 7. Definition of Done

```bash
docker compose up -d && pnpm db:migrate
pnpm typecheck && pnpm lint && pnpm format && pnpm test && pnpm build
pnpm dlx @better-auth/cli@latest generate --config src/modules/auth/auth.config.ts   # sem diferença
pnpm audit --prod                    # a dependência nova não pode trazer alta/crítica
pnpm openapi:export -- --check
```

**Verificação manual em navegador — obrigatória, é o único caminho que prova o sprint:**

```
1. pnpm dev
2. Chrome → http://localhost:3333/docs
   DevTools → ⋮ → More tools → WebAuthn → Enable virtual authenticator environment
   Add authenticator: ctap2, internal, resident key ON, user verification ON
3. Faça sign-in (fluxo de F5-S03) e guarde o cookie de sessão
4. Registre a passkey: POST /api/auth/passkey/add-passkey
   → o DevTools mostra a credencial nova em "Credentials"
5. Confirme no banco:
   select id, name, user_id, device_type, backed_up, aaguid from passkey;
6. Sign-out. Depois: POST /api/auth/sign-in/passkey
   → o navegador pede a credencial, o autenticador virtual assina
   → confirme que veio `set-auth-token`
7. GET /api/auth/passkey/list-user-passkeys → a credencial aparece
8. POST /api/auth/passkey/delete-passkey → a linha some do banco
```

> Se preferir hardware real (TouchID, Windows Hello, YubiKey), melhor ainda — mas o autenticador
> virtual é suficiente e é o que o CI de outra pessoa vai conseguir reproduzir.

- [ ] T1–T24 verdes
- [ ] **Registro e autenticação por passkey concluídos em navegador real** (§7, passos 4 e 6)
- [ ] Linha em `passkey` com `aaguid` e `device_type` preenchidos
- [ ] `credential_id` duplicado rejeitado pelo banco (T8)
- [ ] Passkey de outro usuário responde **404** em delete e update (T15, T16) — D-31
- [ ] `DELETE /api/v1/me` limpa `passkey` em cascata (T20)
- [ ] `@better-auth/cli generate` sem diferença de schema
- [ ] `pnpm audit --prod` sem alta ou crítica **depois** da dependência nova
- [ ] `grep -n "'DELETE'" src/modules/auth/auth.plugin.ts` — **inalterado**
- [ ] `grep -rn "rpID" src/` — **só** a derivação de `BETTER_AUTH_URL`, nenhum literal
- [ ] Migração revisada linha a linha; `pnpm db:push` **não** usado
- [ ] Sign-in por senha e por 2FA continuam funcionando (T22)
- [ ] PR verde; memória atualizada

---

## 8. Armadilhas conhecidas

1. **`rpID` com esquema ou porta.** `http://localhost:3333` e `localhost:3333` são inválidos; o
   valor é `localhost`. O navegador rejeita **silenciosamente** — o servidor não acusa nada, e a
   meia hora perdida é procurando no lugar errado.
2. **`origin` com barra final.** `http://localhost:3333/` não bate com o que o navegador envia.
   Mesmo sintoma silencioso.
3. **`rpID` fixo em vez de derivado.** Funciona em dev e falha em produção, ou pior: a passkey
   registrada em `localhost` simplesmente não existe no domínio real, e o usuário perde acesso ao
   método que ele acha que cadastrou. D-54 exige a derivação.
4. **Acessar por IP em vez de `localhost`.** WebAuthn exige contexto seguro e um `rpID` que seja
   um domínio. `127.0.0.1` não serve; `localhost` tem exceção.
5. **Mockar o autenticador para "cobrir" o caminho feliz.** Não prova nada sobre a parte
   criptográfica, que é justamente o que faz uma passkey valer mais que uma senha.
6. **Instalar `@better-auth/passkey` sem conferir compatibilidade.** Uma incompatibilidade pode
   arrastar upgrade do `better-auth`, e isso invalida tudo o que F5-S02 a F5-S05 validaram contra
   a versão atual. §5.1 é obrigatória.
7. **Esquecer `UNIQUE(credential_id)`.** A mesma credencial sob dois usuários torna a resolução
   de identidade ambígua no `sign-in` — o pior tipo de defeito de autenticação, porque parece
   funcionar.
8. **Esquecer a reexportação no barrel.** O adapter recebe `* as schema`; tabela fora do barrel é
   tabela inexistente para ele. Sintoma obscuro em runtime.
9. **`requireSession: false`** reabre a enumeração de usuários que F5-S03 fechou. D-54 é explícita.
10. **Mexer na lista de métodos da coringa** para "suportar `DELETE /passkey/delete-passkey`". O
    endpoint é `POST`. A documentação oficial é clara e a spec `08` §7.2 registra que auditorias
    anteriores erraram exatamente aqui.
11. **Passkey alheia respondendo 403.** D-31 vale para todo recurso de usuário, e passkey é um.
    404, sempre. T15 e T16 provam.

---

## 9. Registro na memória

- **`DECISIONS.md`** — **nada a acrescentar.** D-54 aprova a dependência e fixa a derivação de
  `rpID`. Se a §5.1 revelar incompatibilidade que exija mexer na versão do `better-auth`,
  **pare e pergunte** — isso é ADR novo e é decisão do dono.
- **`PROGRESS.md`** — F5-S06 ✅, próximo = F5-S07. Acrescente **R41–R45** em **Contratos já
  entregues**, a migração nova e a dependência nova.
- **`F5-S06.md`** — (a) versão de `@better-auth/passkey` instalada e contra qual `better-auth` foi
  validada; (b) o passo a passo do autenticador virtual do DevTools, com as opções exatas — a
  próxima pessoa vai precisar reproduzir; (c) a saída de `select ... from passkey` depois do
  registro; (d) o que o plugin faz e o que **não** faz quanto a isolamento por usuário (§5.6);
  (e) o que o cliente Flutter precisa para consumir passkey em app nativo, ou o registro explícito
  de que isso ficou fora e por quê.

---

## 10. Depois deste sprint

**O domínio multifator está completo** — TOTP, OTP, backup codes e passkey. Os 20 % do scorecard
que estavam em zero passam a pontuar integralmente, e a API ganha o único método de autenticação
resistente a phishing que existe.

Resta **F5-S07**: fazer o rate limit sobreviver a mais de uma réplica. Enquanto ele não entrar,
produção continua restrita a **réplica única** (D-55).
