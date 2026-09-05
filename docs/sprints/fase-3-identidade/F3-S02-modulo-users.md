# F3-S02 — Módulo `users` (`/me`)

|                |                              |
| -------------- | ---------------------------- |
| **Fase**       | F3 — Identidade              |
| **Branch**     | `feature/f3s02-modulo-users` |
| **Depende de** | F3-S01                       |
| **Entrega**    | R13 · R14 · R15              |

---

## 1. Prompt de abertura

```
Leia .agents/memory/PROGRESS.md e .agents/memory/DECISIONS.md para se contextualizar.
Leia também .agents/memory/F2-S03.md (padrão de módulo) e .agents/memory/F3-S01.md
(como usar requireAuth e signUpAndGetToken).

Sprint alvo: docs/sprints/fase-3-identidade/F3-S02-modulo-users.md
Specs obrigatórias: docs/specs/03-contrato-da-api.md (§6),
                    docs/specs/04-autenticacao-e-seguranca.md (§3)

Siga o protocolo de docs/specs/07-protocolo-dos-agentes.md:
entre em modo de planejamento, apresente o plano COMPLETO da sprint e
AGUARDE minha autorização explícita antes de escrever qualquer código.

Não toque em nenhum arquivo fora do blast radius declarado no sprint.
```

---

## 2. Objetivo

Primeiro módulo **protegido**. Estabelece o padrão que F4-S01 e F4-S02 vão repetir:
`onRequest: [fastify.requireAuth]`, service recebendo **apenas `userId`**, e response
schema que garante que nada sensível vaza.

---

## 3. Contratos esperados

### R13 · `GET /api/v1/me`

`200` → `Me` · `401` sem sessão.

### R14 · `PATCH /api/v1/me`

```json
{ "name": "Novo Nome", "image": "https://..." }
```

Ambos opcionais; **corpo vazio → 400**. `name` 1..255 após `.trim()`;
`image` URL válida ou `null`.
`200` → `Me` atualizado · `400` · `401`.
**E-mail e senha não são alteráveis aqui** (fora do MVP, spec `00` §3).

### R15 · `DELETE /api/v1/me`

`204` sem corpo · `401`. Dentro de `db.transaction()`. Cascade leva sessões, contas,
playlists, itens e favoritos.

### `Me` — spec `03` §3

```json
{ "id": "string", "name": "string", "email": "string", "image": "string|null", "createdAt": "ISO" }
```

**Nunca** `password`, `emailVerified`, `session` ou `account`.

### Camadas

```ts
export class UsersRepository {
  constructor(private readonly db: Database) {}
  findById(userId: string): Promise<UserRow | null>;
  update(userId: string, data: { name?: string; image?: string | null }): Promise<UserRow | null>;
  delete(userId: string): Promise<boolean>;
}

export class UsersService {
  constructor(private readonly repo: UsersRepository) {}
  getMe(userId: string): Promise<Me>;
  updateMe(userId: string, input: UpdateMeInput): Promise<Me>;
  deleteMe(userId: string): Promise<void>;
}
```

---

## 4. Blast radius

### Preencher (0 bytes hoje)

```
src/modules/users/users.schema.ts
src/modules/users/users.repository.ts
src/modules/users/users.service.ts
src/modules/users/users.routes.ts
```

### Criar

```
tests/unit/modules/users/users.service.test.ts
tests/integration/modules/users.repository.test.ts
```

### Editar

```
src/app.ts
.agents/memory/PROGRESS.md
.agents/memory/F3-S02.md
```

**Não toque em:** `src/modules/auth/**` (pronto) · `src/db/**` · `src/plugins/**` ·
demais módulos.

---

## 5. Passo a passo

### 5.1 Schema

```ts
export const updateMeBodySchema = z
  .object({
    name: z.string().trim().min(1).max(255).optional(),
    image: z.url().nullable().optional(),
  })
  .refine((v) => v.name !== undefined || v.image !== undefined, {
    message: 'At least one field must be provided',
  });
```

O `.refine` é o que produz o **400 em corpo vazio**. Sem ele, `PATCH {}` responderia 200
sem alterar nada — comportamento confuso para o cliente.

`meSchema` declara exatamente as 5 chaves de `Me`. É a poda do serializer que garante a
não exposição — não confie em o repository "não selecionar" o campo.

### 5.2 Repository

- `findById`: `select` explícito das 5 colunas. **Nunca `select *` na tabela `"user"`** —
  ela contém o que o Better Auth guarda.
- `update`: `set` só com as chaves presentes, mais `updatedAt: new Date()`.
  `.returning()` com as mesmas 5 colunas. Retorna `null` se nada foi atualizado.
- `delete`: `delete(user).where(eq(user.id, userId)).returning({ id: user.id })`;
  devolve `true` se veio linha. Dentro de `db.transaction()`.

Lembre: `user` é palavra reservada no Postgres. O Drizzle escapa sozinho; SQL cru precisa
de `"user"`.

### 5.3 Service

- `getMe`: `null` → `NotFoundError('User not found')`. Na prática não acontece (o guard
  já validou a sessão), mas o caso existe se a conta for apagada em outra sessão.
- `updateMe`: delega e mapeia. Sem regra de negócio adicional.
- `deleteMe`: `false` do repository → `NotFoundError`.

### 5.4 Rotas

```ts
fastify.get(
  '/me',
  {
    onRequest: [fastify.requireAuth],
    schema: {
      tags: ['Profile'],
      summary: 'Retorna o perfil do usuário autenticado',
      operationId: 'getMe',
      security: [{ bearerAuth: [] }, { cookieAuth: [] }],
      response: { 200: meSchema, 401: errorSchema },
    },
  },
  async (request) => service.getMe(request.user!.id),
);
```

- `request.user!.id` é seguro **depois** do guard. Se o `!` incomodar, um type guard
  explícito serve — mas não use `any`.
- **Passe só o `id`.** Nunca `request` inteiro ao service (spec `04` §3).
- `DELETE` responde `204`: `reply.status(204).send()`, sem corpo, e o response schema
  do 204 é `z.null()` ou ausente.

---

## 6. Casos de teste obrigatórios

### Unit — `users.service.test.ts`

| #   | Caso                                              | Esperado                                          |
| --- | ------------------------------------------------- | ------------------------------------------------- |
| T1  | `getMe` com linha válida                          | DTO com as 5 chaves                               |
| T2  | `getMe` com `null`                                | lança `NotFoundError`                             |
| T3  | DTO **não** contém `password` nem `emailVerified` | asserção por chave                                |
| T4  | `updateMe` só com `name`                          | repository recebe só `name`                       |
| T5  | `updateMe` com `image: null`                      | repository recebe `image: null` (não `undefined`) |
| T6  | `updateMe` com `null` do repository               | lança `NotFoundError`                             |
| T7  | `deleteMe` com `false`                            | lança `NotFoundError`                             |
| T8  | `deleteMe` com `true`                             | resolve sem valor                                 |

### Integração — `users.repository.test.ts` + rotas via `app.inject()`

| #   | Caso                                                    | Esperado                                                         |
| --- | ------------------------------------------------------- | ---------------------------------------------------------------- |
| T9  | `GET /me` com Bearer válido                             | 200 com o e-mail do sign-up                                      |
| T10 | `GET /me` **sem** Authorization                         | **401** com o envelope `{statusCode,error,message,details}`      |
| T11 | `GET /me` com Bearer inválido                           | 401                                                              |
| T12 | `GET /me` com **cookie**                                | 200 (D-13)                                                       |
| T13 | Resposta de `/me` tem exatamente 5 chaves               | nenhuma extra                                                    |
| T14 | `PATCH /me` com `{name}`                                | 200, nome novo; `GET /me` confirma                               |
| T15 | `PATCH /me` com `{}`                                    | **400**                                                          |
| T16 | `PATCH /me` com `image` não-URL                         | 400                                                              |
| T17 | `PATCH /me` com `image: null`                           | 200, `image` fica `null`                                         |
| T18 | `PATCH /me` sem token                                   | 401                                                              |
| T19 | `PATCH /me` não altera e-mail mesmo se enviado no corpo | e-mail intacto                                                   |
| T20 | `DELETE /me`                                            | 204 sem corpo                                                    |
| T21 | Após `DELETE /me`, o token antigo                       | 401                                                              |
| T22 | Após `DELETE /me`, linhas de `session` do usuário       | zero (cascade)                                                   |
| T23 | Usuário A não consegue ler o perfil de B                | não há rota para isso — **confirme que não existe `/users/:id`** |

---

## 7. Definition of Done

```bash
docker compose up -d && pnpm db:migrate
pnpm typecheck && pnpm lint && pnpm format && pnpm test && pnpm build
pnpm dev
# use o $TOKEN do fluxo de F3-S01
curl -s localhost:3333/api/v1/me -H "authorization: Bearer $TOKEN" | jq
curl -s -o /dev/null -w '%{http_code}\n' localhost:3333/api/v1/me            # 401
curl -s -X PATCH localhost:3333/api/v1/me -H "authorization: Bearer $TOKEN" \
  -H 'content-type: application/json' -d '{"name":"Outro"}' | jq
curl -s -o /dev/null -w '%{http_code}\n' -X PATCH localhost:3333/api/v1/me \
  -H "authorization: Bearer $TOKEN" -H 'content-type: application/json' -d '{}'   # 400
```

- [ ] T1–T23 verdes
- [ ] Resposta de `/me` com exatamente 5 chaves (T13)
- [ ] `DELETE /me` limpa sessões por cascade (T22)
- [ ] Nenhuma rota expõe perfil de terceiro
- [ ] `/docs` mostra as 3 rotas em `Profile` com o cadeado de segurança
- [ ] PR verde (a tag `v0.3.0` fecha a fase em **F3-S03**, não aqui)
- [ ] Memória atualizada

---

## 8. Armadilhas conhecidas

1. **`select *` na tabela `"user"`** traz `emailVerified` e o que mais o Better Auth
   guardar. Selecione colunas explicitamente **e** deixe o response schema podar. Duas
   camadas de defesa.
2. **`image: null` vs `image: undefined`.** Zod `.nullable().optional()` distingue os dois:
   `null` limpa o campo, `undefined` não mexe. O repository precisa respeitar a diferença.
3. **204 com corpo** faz o Fastify avisar e alguns clientes quebrarem. `send()` sem
   argumento.
4. **`request.user!` sem o guard** é `null` em runtime e vira `TypeError` → 500. O
   `onRequest` é obrigatório em toda rota protegida.
5. **`.refine` em `z.object()` com `.partial()`** roda depois do parse — funciona, mas a
   mensagem de erro aparece em `details` com `path: []`. Aceitável; documente.
6. **Cascade de `DELETE /me` depende das FKs de F2-S01.** Se T22 falhar, o problema está
   na migração, não aqui — pare e reporte.

---

## 9. Registro na memória

- **`PROGRESS.md`** — F3-S02 ✅, R13/R14/R15 nos contratos, próximo = **F3-S03**.
- **`F3-S02.md`** — o padrão de rota protegida (`onRequest` + `request.user!.id`) e a
  forma do `updateMeBodySchema` com `.refine`. **F4-S01 e F4-S02 copiam daqui.**
