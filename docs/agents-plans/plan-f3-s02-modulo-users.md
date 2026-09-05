# Plano de Implementação — Sprint F3-S02: Módulo `users` (`/me`)

> **Status:** 🟡 Em Planejamento (Aguardando Autorização Explícita — Parada 1 / Etapa 3 do Protocolo)  
> **Fase:** F3 — Identidade · **Segundo sprint da fase F3**  
> **Branch Alvo:** `feature/f3s02-modulo-users` (a partir de `develop`)  
> **Depende de:** F3-S01 (Better Auth, infraestrutura de sessão, plugin, guard `requireAuth` e helper `signUpAndGetToken`)  
> **Contratos de Entrega:** R13 (`GET /api/v1/me`), R14 (`PATCH /api/v1/me`), R15 (`DELETE /api/v1/me`)  
> **Specs de Referência:**
>
> - [`docs/specs/03-contrato-da-api.md`](../specs/03-contrato-da-api.md) (§3 — Representação `Me`, §6 — Perfil R13, R14, R15)
> - [`docs/specs/04-autenticacao-e-seguranca.md`](../specs/04-autenticacao-e-seguranca.md) (§3 — Guard de rotas, contrato de identidade, §7 — Checklist de segurança)
> - [`docs/specs/07-protocolo-dos-agentes.md`](../specs/07-protocolo-dos-agentes.md) (Protocolo de 7 etapas e paradas mandatórias)
> - [`docs/sprints/fase-3-identidade/F3-S02-modulo-users.md`](../sprints/fase-3-identidade/F3-S02-modulo-users.md) (Brief canônico da sprint)
> - [`.agents/memory/DECISIONS.md`](../../.agents/memory/DECISIONS.md) (**D-01**, **D-06**, **D-07**, **D-13**, **D-16**, **D-22**, **D-25**, **D-31**, **D-34**, **D-35**, **D-40**, **D-42**, **D-44**, **D-45**)
> - [`.agents/memory/F2-S03.md`](../../.agents/memory/F2-S03.md) (Padrão de módulo em 4 camadas e injeção por construtor)
> - [`.agents/memory/F3-S01.md`](../../.agents/memory/F3-S01.md) (Consumo de `fastify.requireAuth` e `signUpAndGetToken`)

---

## 1. Contexto e Objetivos Técnicos (Visão Staff Software Engineer)

A sprint **F3-S02** consolida o primeiro módulo **protegido** da API Cardoso Sound (`/api/v1/me`), consumindo diretamente as fundações estabelecidas em F3-S01. Este módulo é o **padrão arquitetural de referência** que as sprints subsequentes de biblioteca privada (**F4-S01** — Playlists e **F4-S02** — Favoritos) irão replicar.

Na qualidade de Staff Software Engineer, este desenho estabelece três invariantes estruturais e inegociáveis:

1. **Defesa em Profundidade Contra Vazamento de Dados (Two-Tier Data Scrubbing):**
   A entidade `user` no banco de dados armazena credenciais e metadados sensíveis gerenciados pelo Better Auth (colunas `emailVerified`, `updatedAt`, além de ligações com tabelas `account` e `session`). Para mitigar qualquer risco de exfiltração de dados (Spec 04 §7 e Armadilha 1):
   - **Tier 1 (Database / Repository):** O repositório executa exclusivamente projeção SQL explícita com `.select({ id, name, email, image, createdAt })`. A instrução `select *` na tabela `"user"` é **terminantemente proibida**.
   - **Tier 2 (Serialization / Fastify Zod):** O schema de resposta `meSchema` atua como barreira estrita no `serializerCompiler` do Fastify, podando silenciosamente qualquer propriedade excedente que porventura chegue da camada de serviço.

2. **Contrato Estrito de Identidade e Fronteiras Fastify ↔ Domínio:**
   O guard `onRequest: [fastify.requireAuth]` atesta a autenticidade da requisição. Handlers Fastify **nunca** repassam os objetos de transporte (`request`, `reply`, `headers`) para a camada de serviço. O service recebe estritamente a identidade atômica `userId: string` e o payload tipado `UpdateMeInput`. Isso garante isolamento do framework, desacoplamento puro e máxima testabilidade unitária.

3. **Política Antienumeração e Ausência Total de 403 (D-31):**
   Em conformidade com a decisão **D-31** e Spec 03 §7, nenhuma rota do MVP emite código HTTP 403 Forbidden. Um usuário nunca deve ser capaz de descobrir a existência de perfis ou recursos alheios. Para garantir essa diretriz:
   - A API não possui rota `/users/:id` ou endpoints administrativos de perfil.
   - O único ponto de acesso cadastral é `GET/PATCH/DELETE /api/v1/me`, onde o escopo de autorização é resolvido nativamente pelo token ou cookie da sessão ativa do próprio emissor.

4. **Deleção Atômica em Cascata (Cascade Delete via Postgres 17):**
   Ao excluir a própria conta (`DELETE /api/v1/me`), a operação deve rodar dentro de `db.transaction()`. As foreign keys com `onDelete: 'cascade'` modeladas em F2-S01 asseguram que a exclusão da linha em `"user"` expurgue automaticamente sessões ativas (`session`), credenciais vinculadas (`account`), playlists particulares (`playlists`), itens de playlists (`playlist_tracks`) e faixas favoritadas (`favorites`).

---

## 2. Blast Radius e Conformidade de Arquitetura

O blast radius da sprint é cirúrgico e rigorosamente fechado. Nenhum arquivo de infraestrutura (`src/db/**`, `src/config/**`), plugins centrais (`src/plugins/**`) ou módulo de autenticação (`src/modules/auth/**`) será alterado.

```
blast-radius/
├── Preencher (atualmente com 0 bytes no repositório):
│   ├── src/modules/users/users.schema.ts
│   ├── src/modules/users/users.repository.ts
│   ├── src/modules/users/users.service.ts
│   └── src/modules/users/users.routes.ts
│
├── Criar (novas suítes e artefato de planejamento):
│   ├── tests/unit/modules/users/users.service.test.ts
│   ├── tests/integration/modules/users.repository.test.ts
│   └── docs/agents-plans/plan-f3-s02-modulo-users.md
│
├── Editar (integração e memória do repositório):
│   ├── src/app.ts                                    (registro de usersRoutes sob API_PREFIX)
│   ├── .agents/memory/PROGRESS.md                    (avanço para F3-S03 e novos contratos)
│   └── .agents/memory/F3-S02.md                      (memória técnica canônica do sprint)
│
└── Fora do Escopo (Proibido Tocar):
    ├── src/modules/auth/**                           (estabilizado em F3-S01)
    ├── src/db/** e drizzle/**                        (sem novas migrações necessárias)
    ├── src/plugins/**                                (estabilizados)
    └── tests/integration/auth.test.ts e outros módulos
```

### Validação de Regras de Boundaries (`eslint-plugin-boundaries`):

Conforme as restrições declaradas em `eslint.config.mjs`:

- `src/modules/users/users.schema.ts` (`dto`): importa unicamente `zod`. Proibido importar de `config` (Armadilha de F2-S03).
- `src/modules/users/users.repository.ts` (`repository`): importa de `db` (`../../db/client.js`, `../../db/schema/index.js`) e `drizzle-orm`. Não importa de `routes` ou `service`.
- `src/modules/users/users.service.ts` (`service`): importa de `repository`, `dto` (`./users.schema.js`) e `shared` (`../../shared/errors/index.js`). Não importa de `db` nem `fastify`.
- `src/modules/users/users.routes.ts` (`routes`): importa de `service`, `dto`, `shared` e `fastify-type-provider-zod`. Não importa de `db` nem `repository`.
- `src/app.ts` (`app`): importa `usersRoutes` e registra sob `/api/v1`.

---

## 3. Especificação Canônica dos Contratos

### 3.1 DTO de Representação: `Me` (Spec 03 §3)

```json
{
  "id": "string",
  "name": "string",
  "email": "string",
  "image": "string | null",
  "createdAt": "2026-09-05T18:00:00.000Z"
}
```

- **Invariante:** Exatamente estas 5 chaves. Proibida a inclusão de `password`, `emailVerified`, `updatedAt`, `session`, `account` ou IDs de infraestrutura.
- `createdAt` é emitido como string ISO 8601 UTC.

### 3.2 R13 · `GET /api/v1/me`

- **Finalidade:** Retorna o perfil completo do usuário associado à sessão corrente.
- **Autenticação:** Obrigatória (`onRequest: [fastify.requireAuth]`). Suporta `Authorization: Bearer <token>` e cookie `better-auth.session_token` (D-13).
- **Respostas:**
  - `200 OK`: Payload `Me`.
  - `401 Unauthorized`: Sessão ausente, inválida ou expirada (`{ statusCode: 401, error: "Unauthorized", message: "Authentication required", details: null }`).

### 3.3 R14 · `PATCH /api/v1/me`

- **Finalidade:** Atualiza dados cadastrais mutáveis (nome e foto de perfil).
- **Autenticação:** Obrigatória (`onRequest: [fastify.requireAuth]`).
- **Entrada (`UpdateMeInput`):**
  ```json
  {
    "name": "Novo Nome de Exibição",
    "image": "https://cdn.cardososound.com/avatars/user-123.jpg"
  }
  ```
  - `name`: string opcional, `trim()`, comprimento entre 1 e 255 caracteres.
  - `image`: URL válida opcional ou `null` explícito para remover o avatar existente.
  - **Refinamento:** O corpo não pode ser vazio. Pelo menos um campo (`name` ou `image`) deve ser fornecido. Caso contrário, responde **400 Bad Request**.
  - **Proteção:** E-mail, senha e status de verificação **não** são alteráveis por esta rota. Se enviados no corpo, são ignorados pelo schema ou geram 400 se isolados.
- **Respostas:**
  - `200 OK`: Payload `Me` atualizado refletindo as mudanças.
  - `400 Bad Request`: Violação de validação Zod (corpo vazio `{}`, `name` vazio após trim, `image` não-URL).
  - `401 Unauthorized`: Sem sessão ativa.
  - `404 Not Found`: Usuário deletado concorrentemente em outra sessão.

### 3.4 R15 · `DELETE /api/v1/me`

- **Finalidade:** Exclusão definitiva e irrevogável da conta do usuário autenticado.
- **Autenticação:** Obrigatória (`onRequest: [fastify.requireAuth]`).
- **Comportamento Transacional:** Executa `DELETE FROM "user" WHERE id = $1` dentro de `db.transaction()`. As FKs com cascata garantem a eliminação coordenada de todas as dependências no Postgres.
- **Respostas:**
  - `204 No Content`: Conta excluída com sucesso. Resposta **sem corpo** (`reply.status(204).send()`).
  - `401 Unauthorized`: Sem sessão ativa.
  - `404 Not Found`: Usuário inexistente.

---

## 4. Projeto Detalhado das Camadas (Implementação)

### 4.1 Camada DTO & Schemas (`src/modules/users/users.schema.ts`)

```typescript
import { z } from 'zod';

// --- Entrada: Atualização do Perfil ---
export const updateMeBodySchema = z
  .object({
    name: z
      .string()
      .trim()
      .min(1, 'Name must contain at least 1 character')
      .max(255, 'Name must not exceed 255 characters')
      .optional()
      .describe('Nome de exibição do usuário (1..255 caracteres)'),
    image: z
      .url('Image must be a valid URL')
      .nullable()
      .optional()
      .describe('URL da foto de perfil ou null para remover o avatar existente'),
  })
  .refine((data) => data.name !== undefined || data.image !== undefined, {
    message: 'At least one field must be provided',
  });

// --- Saída: Representação Me e Envelopes ---
export const meSchema = z.object({
  id: z.string().describe('Identificador único do usuário'),
  name: z.string().describe('Nome de exibição do usuário'),
  email: z.email().describe('Endereço de e-mail do usuário'),
  image: z.url().nullable().describe('URL da foto de perfil ou null'),
  createdAt: z.iso.datetime().describe('Data de cadastro do usuário em formato ISO 8601 UTC'),
});

export const errorResponseSchema = z.object({
  statusCode: z.number().int().describe('Código de status HTTP'),
  error: z.string().describe('Identificador canônico do erro'),
  message: z.string().describe('Mensagem descritiva da falha'),
  details: z.unknown().nullable().describe('Detalhes adicionais ou issues de validação RFC 7807'),
});

// --- Tipos Inferidos ---
export type UpdateMeInput = z.infer<typeof updateMeBodySchema>;
export type MeDto = z.infer<typeof meSchema>;
export type ErrorResponseDto = z.infer<typeof errorResponseSchema>;
```

### 4.2 Camada de Persistência (`src/modules/users/users.repository.ts`)

```typescript
import { eq } from 'drizzle-orm';
import { db as defaultDb, type Database } from '../../db/client.js';
import { user } from '../../db/schema/index.js';

export interface UserRow {
  id: string;
  name: string;
  email: string;
  image: string | null;
  createdAt: Date;
}

export class UsersRepository {
  constructor(private readonly db: Database = defaultDb) {}

  /**
   * Localiza um usuário pelo identificador primário.
   * Projeção explícita de colunas seguras (Tier 1 de defesa contra vazamento de credenciais).
   */
  async findById(userId: string): Promise<UserRow | null> {
    const [row] = await this.db
      .select({
        id: user.id,
        name: user.name,
        email: user.email,
        image: user.image,
        createdAt: user.createdAt,
      })
      .from(user)
      .where(eq(user.id, userId))
      .limit(1);

    return row ?? null;
  }

  /**
   * Atualiza dados de perfil do usuário.
   * Trata estritamente a semântica de image: null (limpar) vs image: undefined (não alterar).
   */
  async update(
    userId: string,
    data: { name?: string; image?: string | null },
  ): Promise<UserRow | null> {
    const setValues: {
      name?: string;
      image?: string | null;
      updatedAt: Date;
    } = {
      updatedAt: new Date(),
    };

    if (data.name !== undefined) {
      setValues.name = data.name;
    }

    if (data.image !== undefined) {
      setValues.image = data.image;
    }

    const [updatedRow] = await this.db
      .update(user)
      .set(setValues)
      .where(eq(user.id, userId))
      .returning({
        id: user.id,
        name: user.name,
        email: user.email,
        image: user.image,
        createdAt: user.createdAt,
      });

    return updatedRow ?? null;
  }

  /**
   * Remove atomicamente o usuário dentro de uma transação.
   * As constraints de chave estrangeira com onDelete: 'cascade' garantem o expurgo
   * coordenado de sessões, contas e dados associados no PostgreSQL.
   */
  async delete(userId: string): Promise<boolean> {
    return await this.db.transaction(async (tx) => {
      const result = await tx.delete(user).where(eq(user.id, userId)).returning({ id: user.id });

      return result.length > 0;
    });
  }
}
```

### 4.3 Camada de Negócio (`src/modules/users/users.service.ts`)

```typescript
import { NotFoundError } from '../../shared/errors/index.js';
import { UsersRepository } from './users.repository.js';
import type { MeDto, UpdateMeInput } from './users.schema.js';

export class UsersService {
  constructor(private readonly repo: UsersRepository = new UsersRepository()) {}

  async getMe(userId: string): Promise<MeDto> {
    const row = await this.repo.findById(userId);

    if (!row) {
      throw new NotFoundError('User not found');
    }

    return {
      id: row.id,
      name: row.name,
      email: row.email,
      image: row.image,
      createdAt: row.createdAt.toISOString(),
    };
  }

  async updateMe(userId: string, input: UpdateMeInput): Promise<MeDto> {
    const updated = await this.repo.update(userId, input);

    if (!updated) {
      throw new NotFoundError('User not found');
    }

    return {
      id: updated.id,
      name: updated.name,
      email: updated.email,
      image: updated.image,
      createdAt: updated.createdAt.toISOString(),
    };
  }

  async deleteMe(userId: string): Promise<void> {
    const deleted = await this.repo.delete(userId);

    if (!deleted) {
      throw new NotFoundError('User not found');
    }
  }
}
```

### 4.4 Camada de Transporte Fastify (`src/modules/users/users.routes.ts`)

```typescript
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { errorResponseSchema, meSchema, updateMeBodySchema } from './users.schema.js';
import { UsersService } from './users.service.js';

export interface UsersRoutesOptions {
  service?: UsersService;
}

export const usersRoutes: FastifyPluginAsyncZod<UsersRoutesOptions> = async (fastify, opts) => {
  await Promise.resolve();

  const service = opts.service ?? new UsersService();

  // R13: Consulta do perfil do usuário autenticado
  fastify.get(
    '/me',
    {
      onRequest: [fastify.requireAuth],
      schema: {
        tags: ['Profile'],
        summary: 'Retorna o perfil do usuário autenticado',
        description:
          'Recupera os dados cadastrais públicos e essenciais do usuário associado à sessão ativa.',
        operationId: 'getMe',
        security: [{ bearerAuth: [] }, { cookieAuth: [] }],
        response: {
          200: meSchema,
          401: errorResponseSchema,
        },
      },
    },
    async (request) => {
      return service.getMe(request.user!.id);
    },
  );

  // R14: Atualização parcial do perfil do usuário autenticado
  fastify.patch(
    '/me',
    {
      onRequest: [fastify.requireAuth],
      schema: {
        tags: ['Profile'],
        summary: 'Atualiza o perfil do usuário autenticado',
        description:
          'Atualiza o nome de exibição e/ou a foto de perfil do usuário. Rejeita requisições com corpo vazio.',
        operationId: 'updateMe',
        security: [{ bearerAuth: [] }, { cookieAuth: [] }],
        body: updateMeBodySchema,
        response: {
          200: meSchema,
          400: errorResponseSchema,
          401: errorResponseSchema,
        },
      },
    },
    async (request) => {
      return service.updateMe(request.user!.id, request.body);
    },
  );

  // R15: Exclusão da conta do usuário autenticado
  fastify.delete(
    '/me',
    {
      onRequest: [fastify.requireAuth],
      schema: {
        tags: ['Profile'],
        summary: 'Remove a conta do usuário autenticado',
        description:
          'Exclui permanentemente o usuário e revoga em cascata todas as sessões e recursos vinculados.',
        operationId: 'deleteMe',
        security: [{ bearerAuth: [] }, { cookieAuth: [] }],
        response: {
          204: z.null().describe('Usuário excluído com sucesso sem conteúdo retornado'),
          401: errorResponseSchema,
        },
      },
    },
    async (request, reply) => {
      await service.deleteMe(request.user!.id);
      return reply.status(204).send();
    },
  );
};
```

### 4.5 Integração em `src/app.ts`

Registrar `usersRoutes` sob o prefixo `API_PREFIX` (`/api/v1`), preservando a ordem canônica:

```typescript
// 6. Rotas de catálogo e domínio (/api/v1)
await app.register(artistsRoutes, { prefix: API_PREFIX });
await app.register(tracksRoutes, { prefix: API_PREFIX });
await app.register(usersRoutes, { prefix: API_PREFIX });
```

---

## 5. Matriz Completa de Testes

A estratégia de testes segue as diretrizes de **D-27** (foco nominal e exaustivo na lista de casos obrigatórios).

### 5.1 Suíte Unitária: `tests/unit/modules/users/users.service.test.ts`

Isolada em memória com stubs tipados do repositório (`vi.fn()`), sem dependência de Fastify ou Postgres.

| Caso   | Método Testado | Cenário / Entrada                                                | Comportamento Esperado                                             |
| :----- | :------------- | :--------------------------------------------------------------- | :----------------------------------------------------------------- |
| **T1** | `getMe`        | Repositório retorna `UserRow` válida                             | Retorna DTO com exatamente as 5 chaves (`createdAt` em ISO string) |
| **T2** | `getMe`        | Repositório retorna `null` (ex: conta excluída concorrentemente) | Lança `NotFoundError('User not found')`                            |
| **T3** | `getMe`        | Inspeção estrita do payload devolvido                            | Asserção de chaves: **não** contém `password` nem `emailVerified`  |
| **T4** | `updateMe`     | Entrada contendo apenas `{ name: "Novo" }`                       | Repositório chamado com `userId` e `{ name: "Novo" }` (sem image)  |
| **T5** | `updateMe`     | Entrada contendo `{ image: null }`                               | Repositório chamado com `image: null` (distinto de `undefined`)    |
| **T6** | `updateMe`     | Repositório retorna `null`                                       | Lança `NotFoundError('User not found')`                            |
| **T7** | `deleteMe`     | Repositório retorna `false`                                      | Lança `NotFoundError('User not found')`                            |
| **T8** | `deleteMe`     | Repositório retorna `true`                                       | Resolve com sucesso sem retorno (`undefined`)                      |

### 5.2 Suíte de Integração e E2E: `tests/integration/modules/users.repository.test.ts`

Executada contra o container efêmero do PostgreSQL (via `startTestDatabase` e `truncateAll`) e requisições HTTP reais via `app.inject()`.

| Caso       | Camada / Endpoint       | Cenário de Teste                                              | Comportamento Esperado                                                        |
| :--------- | :---------------------- | :------------------------------------------------------------ | :---------------------------------------------------------------------------- |
| **Repo 1** | `UsersRepository`       | `findById` com usuário existente                              | Retorna as 5 colunas estritas sem expor campos de credencial                  |
| **Repo 2** | `UsersRepository`       | `findById` com id inexistente                                 | Retorna `null`                                                                |
| **Repo 3** | `UsersRepository`       | `update` atualizando apenas `name`                            | Altera `name`, atualiza `updatedAt`, mantém `image` intacta                   |
| **Repo 4** | `UsersRepository`       | `update` com `image: null`                                    | Atualiza a coluna `image` no banco para `NULL`                                |
| **Repo 5** | `UsersRepository`       | `delete` em transação                                         | Retorna `true` na primeira chamada; retorna `false` se repetido               |
| **T9**     | `GET /api/v1/me`        | Bearer token válido obtido via `signUpAndGetToken`            | Status 200 com o `email` e `name` cadastrados                                 |
| **T10**    | `GET /api/v1/me`        | Requisição sem cabeçalho `Authorization`                      | Status **401** com envelope RFC 7807 (`Authentication required`)              |
| **T11**    | `GET /api/v1/me`        | Bearer token sinteticamente inválido ou expirado              | Status 401                                                                    |
| **T12**    | `GET /api/v1/me`        | Autenticação exclusiva via Cookie `better-auth.session_token` | Status 200 (validação mandatória de **D-13**)                                 |
| **T13**    | `GET /api/v1/me`        | Inspeção exaustiva do payload retornado                       | Exatamente 5 chaves (`id`, `name`, `email`, `image`, `createdAt`), sem extras |
| **T14**    | `PATCH /api/v1/me`      | Envio de `{ "name": "Nome Atualizado" }`                      | Status 200 com novo nome; subsequente `GET /me` reflete a alteração           |
| **T15**    | `PATCH /api/v1/me`      | Envio de corpo vazio `{}`                                     | Status **400 Bad Request** disparado pelo `.refine()` do Zod                  |
| **T16**    | `PATCH /api/v1/me`      | Envio de `{ "image": "invalid-url" }`                         | Status **400 Bad Request** com mensagem descritiva de URL inválida            |
| **T17**    | `PATCH /api/v1/me`      | Envio de `{ "image": null }`                                  | Status 200, coluna `image` limpa para `null` no banco e na resposta           |
| **T18**    | `PATCH /api/v1/me`      | Requisição sem token de autenticação                          | Status 401                                                                    |
| **T19**    | `PATCH /api/v1/me`      | Envio de `{ "name": "Ok", "email": "hacked@evil.com" }`       | Status 200, `name` é alterado, mas o `email` permanece inalterado             |
| **T20**    | `DELETE /api/v1/me`     | Exclusão de conta via Bearer token válido                     | Status **204 No Content**, corpo estritamente vazio                           |
| **T21**    | `GET /api/v1/me`        | Tentativa de consulta usando o token da conta recém-excluída  | Status **401 Unauthorized** (sessão revogada)                                 |
| **T22**    | Banco de Dados          | Consulta direta à tabela `session` após `DELETE /me`          | Exatamente zero sessões para o `userId` (prova cabal da FK cascade)           |
| **T23**    | `GET /api/v1/users/:id` | Tentativa de Usuário A ler dados cadastrais de Usuário B      | **404 Not Found** (confirma que rota de enumeração não existe)                |

---

## 6. Armadilhas Conhecidas e Mitigações Técnicas

|   #   | Armadilha Potencial                                         | Sintoma se Não Tratada                                                                                    | Solução Defensiva Adotada                                                                                                                                                          |
| :---: | :---------------------------------------------------------- | :-------------------------------------------------------------------------------------------------------- | :--------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **1** | `SELECT *` na tabela `"user"`                               | Vazamento de `emailVerified`, flags internas ou hash de senha em caso de falha no serializer              | `UsersRepository.findById` e `.update` usam projeção explícita `.select({ id, name, email, image, createdAt })`. Nenhuma query aberta na tabela `user`.                            |
| **2** | Confusão entre `null` e `undefined` no PATCH                | `image: undefined` poderia sobrepor a imagem para nulo, ou `image: null` ser ignorado                     | Checagem estrita: `data.image !== undefined`. Se fornecido como `null`, atribui explicitamente `null` no `setValues`. Se omitido (`undefined`), a coluna não é tocada.             |
| **3** | Emissão de corpo em resposta HTTP 204                       | Fastify emite aviso em log e clientes HTTP rígidos podem quebrar parsing de resposta                      | O handler de `DELETE /me` chama terminantemente `reply.status(204).send()` sem argumentos. O schema OpenAPI declara `204: z.null()`.                                               |
| **4** | Acesso inseguro a `request.user!`                           | `TypeError: Cannot read properties of null (reading 'id')` resultando em HTTP 500                         | O guard `fastify.requireAuth` roda no hook `onRequest` antes de qualquer execução do handler, garantindo que `request.user` seja não-nulo no controller.                           |
| **5** | Validação Zod com `.refine()` em corpo vazio                | Erro de validação sem mensagem amigável ou resposta HTTP 200 espúria para `{}`                            | O `.refine()` valida `data.name !== undefined                                                                                                                                      |     | data.image !== undefined`, disparando erro capturado pelo `errorHandlerPlugin` como HTTP 400 com envelope RFC 7807. |
| **6** | Dependência de Foreign Key Cascades no PostgreSQL           | `DELETE /me` falharia com erro de FK constraint violation (23503) caso dependências estivessem `restrict` | O schema em `src/db/schema/*.schema.ts` configurou todas as FKs dependentes com `onDelete: 'cascade'`. O teste T22 valida explicitamente a remoção em cascata na tabela `session`. |
| **7** | Violações de boundaries no linter ESLint                    | Falha na checagem `pnpm lint` (`boundaries/element-types`) caso schemas importem constantes de `config`   | `users.schema.ts` importa estritamente de `zod`. `users.routes.ts` não importa de `db` nem `repository`.                                                                           |
| **8** | Regra `@typescript-eslint/require-await` no plugin de rotas | Falha no linter em rotas síncronas dentro de plugins assíncronos Fastify                                  | Inserção de `await Promise.resolve();` na primeira linha da factory `usersRoutes`, espelhando o padrão já consolidado em `artists.routes.ts`.                                      |

---

## 7. Roteiro Sequencial de Execução (Após Autorização)

```
┌─────────────────────────────────────────────────────────────────────────┐
│ 1. Preparação da Branch (develop -> feature/f3s02-modulo-users)         │
│    git checkout develop && git pull origin develop                      │
│    git checkout -b feature/f3s02-modulo-users                           │
├─────────────────────────────────────────────────────────────────────────┤
│ 2. Preenchimento dos Contratos DTO & Schemas                            │
│    src/modules/users/users.schema.ts                                    │
├─────────────────────────────────────────────────────────────────────────┤
│ 3. Implementação do Repositório de Dados com Projeção Explícita         │
│    src/modules/users/users.repository.ts                                │
├─────────────────────────────────────────────────────────────────────────┤
│ 4. Implementação do Serviço de Domínio                                  │
│    src/modules/users/users.service.ts                                   │
├─────────────────────────────────────────────────────────────────────────┤
│ 5. Construção dos Testes Unitários Isolados                             │
│    tests/unit/modules/users/users.service.test.ts (T1 a T8)             │
│    Validação: pnpm vitest run tests/unit/modules/users/                 │
├─────────────────────────────────────────────────────────────────────────┤
│ 6. Implementação das Rotas Fastify e Registro na App Factory            │
│    src/modules/users/users.routes.ts                                    │
│    src/app.ts (registro de usersRoutes sob API_PREFIX)                  │
├─────────────────────────────────────────────────────────────────────────┤
│ 7. Construção dos Testes de Integração e E2E                            │
│    tests/integration/modules/users.repository.test.ts (T9 a T23)        │
│    Validação: pnpm vitest run tests/integration/modules/users.          │
├─────────────────────────────────────────────────────────────────────────┤
│ 8. Bateria Completa de Validação de Portões de Qualidade (Etapa 5)      │
│    pnpm typecheck && pnpm lint && pnpm format && pnpm test && pnpm build│
├─────────────────────────────────────────────────────────────────────────┤
│ 9. Atualização da Memória Técnica (Etapa 7)                             │
│    .agents/memory/PROGRESS.md (F3-S02 concluída, próximo: F3-S03)       │
│    .agents/memory/F3-S02.md (memória técnica executiva da sprint)       │
│    Commit e Abertura do Pull Request via gh CLI                         │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## 8. Definition of Done (DoD) e Critérios de Aceite

O sprint será considerado concluído apenas quando todos os critérios abaixo forem plenamente atendidos:

- [ ] **T1 a T23 Verdes:** Todos os testes unitários (T1–T8) e de integração/E2E (T9–T23) passando sem advertências.
- [ ] **Poda Rígida de Chaves:** Resposta de `GET /api/v1/me` e `PATCH /api/v1/me` contendo exatamente as 5 chaves do DTO `Me` (T13).
- [ ] **Expurgo em Cascata Comprovado:** `DELETE /api/v1/me` limpa a linha de usuário e todas as sessões vinculadas em `session` (T22).
- [ ] **Zero Enumeração de Perfis:** Nenhuma rota expõe dados de usuários terceiros e rota `/api/v1/users/:id` responde 404 (T23).
- [ ] **Documentação OpenAPI:** Interface Swagger UI (`/docs`) exibe as três rotas sob a tag `Profile` com o ícone de cadeado (`bearerAuth` e `cookieAuth`).
- [ ] **Cinco Portões de Qualidade 100% Verdes:**
  - `pnpm typecheck` (zero erros de tipagem estrita).
  - `pnpm lint` (zero advertências de ESLint e conformidade total com boundaries).
  - `pnpm format` (Prettier formatando todo o repositório).
  - `pnpm test` (suíte geral completa executando e passando).
  - `pnpm build` (`tsup` gerando distribuição em `dist/`).
- [ ] **Memória Atualizada:** `.agents/memory/PROGRESS.md` e `.agents/memory/F3-S02.md` preenchidos e commitados no PR.
