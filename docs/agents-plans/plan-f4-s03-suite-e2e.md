# Plano de Implementação — Sprint F4-S03: Suíte E2E dos Fluxos Completos

> **Status:** 🟡 Em Planejamento (Aguardando Autorização Explícita — Parada 1 / Etapa 3 do Protocolo)  
> **Fase:** F4 — Biblioteca · **Último sprint da fase F4**  
> **Branch Alvo:** `feature/f4s03-suite-e2e` (a partir de `develop`)  
> **Depende de:** F4-S01 (`playlists`), F4-S02 (`favorites`), F3-S01 (`auth`), F2-S02 (`testcontainers` / `seed`)  
> **Entrega:** E1–E15 · Conclusão da Fase 4 · Preparação da tag `v0.4.0`  
> **Specs de Referência:**
>
> - [`docs/specs/05-testes-e-qualidade.md`](file:///run/media/joaocardoso/discoF/Cardosofiles/typescript/back-end/fastify/cardoso-sound-api/docs/specs/05-testes-e-qualidade.md) (§4 — Testes E2E, §6 — Regras invioláveis)
> - [`docs/specs/03-contrato-da-api.md`](file:///run/media/joaocardoso/discoF/Cardosofiles/typescript/back-end/fastify/cardoso-sound-api/docs/specs/03-contrato-da-api.md) (Contratos e envelopes RFC 7807)
> - [`docs/specs/07-protocolo-dos-agentes.md`](file:///run/media/joaocardoso/discoF/Cardosofiles/typescript/back-end/fastify/cardoso-sound-api/docs/specs/07-protocolo-dos-agentes.md) (Protocolo de 7 etapas e paradas mandatórias)
> - [`docs/sprints/fase-4-biblioteca/F4-S03-suite-e2e.md`](file:///run/media/joaocardoso/discoF/Cardosofiles/typescript/back-end/fastify/cardoso-sound-api/docs/sprints/fase-4-biblioteca/F4-S03-suite-e2e.md) (Brief canônico do sprint)
> - [`.agents/memory/DECISIONS.md`](file:///run/media/joaocardoso/discoF/Cardosofiles/typescript/back-end/fastify/cardoso-sound-api/.agents/memory/DECISIONS.md) (**D-01**, **D-03**, **D-06**, **D-07**, **D-08**, **D-13**, **D-14**, **D-15**, **D-16**, **D-19**, **D-22**, **D-24**, **D-25**, **D-27**, **D-28**, **D-31**, **D-36**, **D-42**, **D-44**, **D-47**)

---

## 1. Contexto e Objetivos Técnicos

O sprint **F4-S03** conclui a **Fase 4 (Biblioteca)** da API Cardoso Sound. Seu objetivo primordial é provar cabalmente que a API funciona de ponta a ponta **da exata forma como o cliente Flutter a consumirá**, validando fluxos completos que atravessam horizontalmente as camadas de identidade/autenticação, catálogo musical e biblioteca pessoal do usuário.

A execução dos testes é realizada exclusivamente em memória via `app.inject()` do Fastify — **sem levantar servidor HTTP na rede, sem portas ocupadas e sem browser** ([D-03](file:///run/media/joaocardoso/discoF/Cardosofiles/typescript/back-end/fastify/cardoso-sound-api/.agents/memory/DECISIONS.md#d-03)).

### Invariantes e Regras Inegociáveis do Sprint

1. **Zero Alterações em Código de Produção (`src/`):**
   - O blast radius deste sprint é estritamente restrito à camada de testes (`tests/e2e/**`) e documentação de memória.
   - Qualquer comando `git diff --stat src/` deve compulsoriamente retornar **zero arquivos alterados**.
   - **Regra de ouro:** Este sprint escreve testes, não corrige bugs de produção. Se um teste E2E revelar divergência de contrato ou bug de negócio, o agente **para imediatamente e reporta** (Sprint §2 e §8).
2. **Resolução do Pool de Banco sem Tocar em Produção (Sprint §5.1 / Decisão D-48):**
   - `src/db/client.ts` instancia o pool de conexões com `env.DATABASE_URL`.
   - Adotaremos a estratégia de **Container Singleton no Harness E2E** em `tests/e2e/helpers/app.ts`, combinando reuso do container PostgreSQL efêmero com `setPool()` e `process.env.DATABASE_URL`.
   - Como o Vitest executa o project `e2e` sob `pool: 'forks'` com `singleFork: true` ([D-36](file:///run/media/joaocardoso/discoF/Cardosofiles/typescript/back-end/fastify/cardoso-sound-api/.agents/memory/DECISIONS.md#d-36)), um único container PostgreSQL 17 sobe para toda a suíte E2E, evitando multiplicar o tempo de execução por 5 e mantendo a suíte confortavelmente abaixo da meta de **45 segundos** (Spec 05 §1).
3. **Isolamento e Determinismo Rigorosos (Sprint §5.2 e Spec 05 §6):**
   - Cada arquivo `.e2e.test.ts` é autônomo e executável de forma isolada.
   - `beforeEach`: execução sequencial e obrigatória de `truncateAll(db)` seguida de `seed(db)` — garantindo catálogo sempre disponível e dados de usuários limpos.
   - Cada teste gera seus próprios usuários com e-mails únicos baseados em UUID (`user-${randomUUID()}@teste.local`) para impossibilitar colisões em execuções concorrentes ou repetidas.
   - Nenhum teste depende da ordem de execução de outro (validação obrigatória via `--sequence.shuffle`).
4. **Isolamento de Recursos e Nenhuma Rota Emite 403 (Decisão D-31):**
   - Recursos alheios (playlists e favoritos de outro usuário) respondem compulsoriamente **HTTP 404 Not Found**, prevenindo enumeração de IDs por atacantes. Nenhuma rota do MVP emite 403.
5. **Envelope RFC 7807 Canônico e Asserções por Campo Nomeado:**
   - Todos os erros (400, 401, 404, 409, 422) devem validar a presença exata das 4 chaves: `statusCode`, `error`, `message`, `details` (Sprint §5.5).
   - Proibição absoluta de snapshots de payloads inteiros (`toMatchSnapshot`) — todas as validações inspecionam campos específicos (Spec 05 §6).
6. **Autenticação Dupla (Bearer e Cookie) Testada na Prática (Decisão D-13):**
   - Validação explícita tanto do fluxo Bearer (cabeçalho `Authorization: Bearer <token>`, usado no Flutter) quanto do fluxo de Cookie HttpOnly (`better-auth.session_token`, usado no Swagger/Browser), montado manualmente no `app.inject()` (Sprint §5.4).

---

## 2. Blast Radius Fechado

Conforme definido na Seção 4 do sprint brief:

```
blast-radius/
├── Criar (Arquivos novos):
│   ├── tests/e2e/specs/auth-flow.e2e.test.ts          # E1, E2, E7, E9 (Fluxo de Identidade e Sessões)
│   ├── tests/e2e/specs/catalog-flow.e2e.test.ts       # E3, E14 (Fluxo de Catálogo Público)
│   ├── tests/e2e/specs/playlist-flow.e2e.test.ts      # E4, E6 (Fluxo de Playlists e Isolamento Privado)
│   ├── tests/e2e/specs/favorites-flow.e2e.test.ts     # E5 (Fluxo de Favoritos e Desfavoritar)
│   ├── tests/e2e/specs/account-lifecycle.e2e.test.ts  # E8 (Ciclo de Vida da Conta e Cascata no Banco)
│   ├── tests/e2e/helpers/app.ts                       # Helper central buildTestApp() com container singleton
│   └── docs/agents-plans/plan-f4-s03-suite-e2e.md     # Este documento (Regra 6 do AGENTS.md)
│
├── Editar:
│   ├── tests/e2e/helpers/auth.ts                      # Suporte estendido a cookie e extração atômica
│   ├── tests/e2e/specs/.gitkeep                       # Remoção do arquivo marcador
│   ├── .agents/memory/PROGRESS.md                     # Conclusão da Fase 4 e avanço para F5-S01
│   ├── .agents/memory/DECISIONS.md                    # Registro formal de D-48 (Container Singleton E2E)
│   └── .agents/memory/F4-S03.md                       # Memória técnica canônica do sprint
│
└── Fora do Escopo (Terminantemente Proibido Modificar):
    ├── src/**                                         # Zero alterações em código de produção
    ├── drizzle/**                                     # Zero migrações adicionais
    └── tests/unit/** e tests/integration/**           # Suítes anteriores seladas
```

---

## 3. Arquitetura da Infraestrutura de Testes E2E

### 3.1 `tests/e2e/helpers/app.ts` (`buildTestApp`)

Implementação com **Container Singleton compartilhado** mantendo conformidade integral com a assinatura exigida pelo sprint:

```typescript
export interface TestAppContext {
  app: FastifyInstance;
  db: Database;
  stop: () => Promise<void>;
}

export async function buildTestApp(): Promise<TestAppContext>;
```

#### Mecanismo Operacional:

1. **Singleton de Container:**
   - Variável estática/módulo `sharedTestDb: TestDatabase | null = null`.
   - Na primeira chamada a `buildTestApp()`, executa `startTestDatabase()` (subindo `postgres:17-alpine` via Testcontainers e aplicando as migrações de `drizzle/`).
   - Aponta `process.env.DATABASE_URL = sharedTestDb.connectionString`.
   - Invoca `setPool(sharedTestDb.pool)` de `src/db/client.ts`, garantindo que o pool global e a instância `db` do Drizzle adotem a conexão do container efêmero.
   - Semeia o catálogo inicial com `seed(sharedTestDb.db)`.
2. **Ciclo de Vida do Fastify:**
   - Instancia o app via `buildApp()`.
   - Executa `await app.ready()`.
3. **Função `stop()`:**
   - Encaminha `await app.close()` para liberar as rotas e hooks do Fastify.
   - O encerramento do container Postgres do Testcontainers é gerenciado com gancho de finalização do processo Node (`process.once('beforeExit', ...)` e função de cleanup explícita), permitindo que todos os arquivos `.e2e.test.ts` da suíte reutilizem o mesmo container sem reiniciar a imagem Docker a cada spec.

### 3.2 `tests/e2e/helpers/auth.ts` (Evolução sem Breaking Changes)

Evolução da função `signUpAndGetToken` para disponibilizar o cookie da sessão montado:

```typescript
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

- Extrai `res.headers['set-cookie']`.
- Converte array ou string de múltiplos `Set-Cookie` em header de requisição `cookie`:
  ```typescript
  const raw = res.headers['set-cookie'];
  const cookie = (Array.isArray(raw) ? raw : [raw])
    .filter((c): c is string => typeof c === 'string')
    .map((c) => c.split(';')[0])
    .join('; ');
  ```
- Retorna `{ token, userId, cookie, email }`, atendendo tanto aos testes legados (que desestruturam apenas `token` e `userId`) quanto aos novos fluxos que exigem teste por cookie (E9).

---

## 4. Matriz Completa de Testes E2E (Casos E1 a E15)

| #       | Caso                               | Arquivo Alvo                    | Operações HTTP e Verificações                                                                                                                                                                                                                                                                                                                                                                      |
| ------- | ---------------------------------- | ------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **E1**  | Sign-up → `GET /me` com Bearer     | `auth-flow.e2e.test.ts`         | 1. Sign-up via `POST /api/auth/sign-up/email`<br>2. Extrai Bearer token de `set-auth-token`<br>3. `GET /api/v1/me` com `Authorization: Bearer <token>`<br>4. Responde HTTP 200 com 5 chaves (`id`, `name`, `email`, `image`, `createdAt`) e `email` idêntico ao cadastrado.                                                                                                                        |
| **E2**  | Sign-in com senha errada           | `auth-flow.e2e.test.ts`         | 1. Cadastra usuário com senha `"Password123!"`<br>2. Executa `POST /api/auth/sign-in/email` com senha errada `"WrongPassword999!"`<br>3. Responde HTTP 401 Unauthorized com corpo de erro.                                                                                                                                                                                                         |
| **E3**  | Catálogo público sem token         | `catalog-flow.e2e.test.ts`      | 1. `GET /api/v1/tracks` sem cabeçalho `Authorization`<br>2. Responde HTTP 200, `data` com 20 faixas e `meta.total === 40`<br>3. `GET /api/v1/tracks?page=2` responde com a 2ª fatia de 20 faixas (`hasNext: false`)<br>4. `GET /api/v1/artists` e `GET /api/v1/genres` sem token respondem 200 com dados populados.                                                                                |
| **E4**  | Ciclo completo de playlist         | `playlist-flow.e2e.test.ts`     | 1. Usuário autentica e cria playlist (`POST /api/v1/playlists`) → 201<br>2. Obtém `trackId` do catálogo<br>3. Adiciona faixa à playlist (`POST /playlists/:id/tracks`) → 201<br>4. `GET /playlists/:id` mostra `trackCount: 1` e a faixa presente em `tracks`<br>5. Remove faixa (`DELETE /playlists/:id/tracks/:trackId`) → 204<br>6. `GET /playlists/:id` mostra `trackCount: 0` e `tracks: []`. |
| **E5**  | Ciclo de favoritos                 | `favorites-flow.e2e.test.ts`    | 1. Usuário autentica<br>2. Favorita faixa (`POST /api/v1/favorites/:trackId`) → 201 com `FavoriteItem`<br>3. `GET /api/v1/favorites` lista 1 item contendo a faixa e `favoritedAt`<br>4. Desfavorita (`DELETE /api/v1/favorites/:trackId`) → 204<br>5. `GET /api/v1/favorites` retorna lista vazia (`data: []`, `total: 0`).                                                                       |
| **E6**  | Isolamento de playlist privada     | `playlist-flow.e2e.test.ts`     | 1. Usuário A cria playlist privada → 201 com `playlistId`<br>2. Usuário B autentica<br>3. Usuário B tenta `GET /api/v1/playlists/:playlistId`<br>4. Responde **HTTP 404 Not Found** (D-31: nunca 403)<br>5. Tentativas de mutação por B (`PATCH`, `DELETE`, inclusão de faixas) também respondem 404.                                                                                              |
| **E7**  | Rota protegida sem auth            | `auth-flow.e2e.test.ts`         | 1. Faz requisição a `GET /api/v1/me` e `GET /api/v1/playlists` sem `Authorization` nem cookie<br>2. Responde HTTP 401<br>3. Valida envelope RFC 7807 com exatamente 4 chaves: `{ statusCode: 401, error: 'Unauthorized', message: expect.any(String), details: null }`.                                                                                                                            |
| **E8**  | Exclusão de conta com cascade real | `account-lifecycle.e2e.test.ts` | 1. Usuário cria playlist, adiciona faixa e favorita track<br>2. `DELETE /api/v1/me` → 204<br>3. Token antigo responde 401 em `/api/v1/me`<br>4. Consulta direta ao banco (`db`) comprova 0 registros em `user`, `session`, `playlists`, `playlist_tracks` e `favorites`<br>5. Catálogo (`artists`, `tracks`) permanece 100% íntegro.                                                               |
| **E9**  | Autenticação por Cookie HttpOnly   | `auth-flow.e2e.test.ts`         | 1. Sign-up extrai cookie da resposta<br>2. Envia requisição a `GET /api/v1/me` com header `cookie` e **sem** `Authorization`<br>3. Responde HTTP 200 com os dados corretos do usuário (prova cabal de D-13).                                                                                                                                                                                       |
| **E10** | Suíte com ordem embaralhada        | Todos os 5 specs                | Execução via `pnpm vitest run --project e2e --sequence.shuffle` passa com 100% de sucesso, comprovando independência e ausência de acoplamento temporal.                                                                                                                                                                                                                                           |
| **E11** | Idempotência de execução repetida  | Todos os 5 specs                | Executar a suíte E2E duas vezes consecutivas resulta em aprovação total, provando isolamento do `beforeEach` (`truncateAll` + `seed`).                                                                                                                                                                                                                                                             |
| **E12** | Unicidade de identidades           | Todos os 5 specs                | Todos os testes geram e-mails com prefixo dinâmico `user-${randomUUID()}@teste.local`, prevenindo conflito de chaves únicas no PostgreSQL.                                                                                                                                                                                                                                                         |
| **E13** | Consistência do envelope RFC 7807  | Todos os 5 specs                | Validação formal de que status 401, 404 e 409 emitem rigorosamente a mesma estrutura: `statusCode`, `error`, `message`, `details`.                                                                                                                                                                                                                                                                 |
| **E14** | Integridade de URLs de áudio       | `catalog-flow.e2e.test.ts`      | Todas as faixas devolvidas por `GET /api/v1/tracks` contêm `audioUrl` válida casando com regex `^https?://.+` e apontando para SoundHelix.                                                                                                                                                                                                                                                         |
| **E15** | Imunidade a Rate Limit             | Todos os 5 specs                | Em ambiente de teste (`NODE_ENV=test`), nenhuma chamada sofre rejeição com HTTP 429 (D-19).                                                                                                                                                                                                                                                                                                        |

---

## 5. Passo a Passo de Execução

### Fase 1: Preparação do Ambiente e Branch

1. Sincronizar com `develop` e criar a branch de trabalho:
   ```bash
   git checkout develop && git pull origin develop
   git checkout -b feature/f4s03-suite-e2e
   ```
2. Confirmar que o Docker daemon está operacional:
   ```bash
   docker info >/dev/null
   ```

### Fase 2: Construção dos Helpers E2E

1. Atualizar `tests/e2e/helpers/auth.ts`:
   - Incorporar extração de cookies formatados para requisições `cookie: ...` no `signUpAndGetToken`.
2. Criar `tests/e2e/helpers/app.ts`:
   - Implementar `buildTestApp()` com gerenciamento lazy/singleton do `TestDatabase` (D-48).
   - Configurar `setPool(sharedTestDb.pool)` e `seed(sharedTestDb.db)`.
   - Retornar `{ app, db, stop }`.

### Fase 3: Implementação das Suítes E2E

1. Criar `tests/e2e/specs/auth-flow.e2e.test.ts` (Casos E1, E2, E7, E9, E12, E13, E15).
2. Criar `tests/e2e/specs/catalog-flow.e2e.test.ts` (Casos E3, E14, E15).
3. Criar `tests/e2e/specs/playlist-flow.e2e.test.ts` (Casos E4, E6, E12, E13, E15).
4. Criar `tests/e2e/specs/favorites-flow.e2e.test.ts` (Casos E5, E12, E13, E15).
5. Criar `tests/e2e/specs/account-lifecycle.e2e.test.ts` (Casos E8, E12, E15).
6. Remover `tests/e2e/specs/.gitkeep`.

### Fase 4: Validação Rigorosa e Portões de Qualidade

Executar os comandos em sequência obrigatória:

```bash
# 1. Checagem de tipos estritos
pnpm typecheck

# 2. Linting de regras e boundaries
pnpm lint

# 3. Formatação
pnpm format

# 4. Suíte E2E isolada
pnpm vitest run --project e2e

# 5. Suíte E2E embaralhada (E10)
pnpm vitest run --project e2e --sequence.shuffle

# 6. Suíte completa (Unit + Integration + E2E)
pnpm test

# 7. Build de produção
pnpm build

# 8. Verificação de blast radius (Zero modificações em src/)
git diff --stat src/
```

### Fase 5: Entrega e Registro de Memória

1. Commitar as alterações seguindo Conventional Commits:
   - `test(e2e): adiciona suite de testes ponta a ponta dos fluxos completos da api`
2. Enviar a branch e abrir o Pull Request:
   ```bash
   git push -u origin feature/f4s03-suite-e2e
   gh pr create --base develop --title "test(e2e): suíte dos fluxos completos e encerramento da fase 4" --body "..."
   gh run watch --exit-status
   ```
3. Atualizar a memória do projeto no mesmo PR:
   - `.agents/memory/DECISIONS.md`: Registrar decisão **D-48** (Container Singleton E2E via `setPool` e `singleFork`).
   - `.agents/memory/PROGRESS.md`: Marcar F4-S03 como concluído, selar a Fase 4 e apontar para a Fase 5 (`F5-S01`).
   - `.agents/memory/F4-S03.md`: Criar memória técnica detalhada da sprint com métricas reais de tempo de execução.
4. Parar e reportar o link do PR ao proprietário (o merge e a tag `v0.4.0` pertencem ao dono conforme D-06 e D-08).

---

## 6. Armadilhas Conhecidas e Mitigações

| #     | Armadilha do Brief                           | Causa Raiz                                                | Mitigação no Plano                                                                                                                       |
| ----- | -------------------------------------------- | --------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| **1** | `src/db/client.ts` cria pool no import       | Leitura antecipada de `env.DATABASE_URL` na inicialização | `buildTestApp()` sobe o container antes e injeta o pool via `setPool(testDb.pool)` com reuso singleton no mesmo processo (`singleFork`). |
| **2** | Container por arquivo multiplica tempo por 5 | Inicialização de 5 instâncias isoladas do Docker          | Reuso de um único `TestDatabase` para todos os 5 arquivos E2E, resetando dados com `truncateAll` + `seed` no `beforeEach`.               |
| **3** | Colisão de e-mails entre testes              | Uso de e-mails fixos nos payloads                         | Todos os testes usam `user-${randomUUID()}@teste.local`.                                                                                 |
| **4** | `app.inject()` não gerencia cookies          | Ausência de cookie jar nativo no Fastify inject           | Formatação manual de header `cookie: name=val; name2=val2` a partir de `res.headers['set-cookie']`.                                      |
| **5** | Handles abertos impedindo saída do Vitest    | Falta de `app.close()` no `afterAll`                      | Todo arquivo invoca `await stop()` no `afterAll`, garantindo liberação de conexões e event loop.                                         |
| **6** | Catálogo vazio em E3 e E4                    | Esquecer de rodar o seed após truncate                    | `beforeEach` roda compulsoriamente `truncateAll(db)` seguido de `seed(db)`.                                                              |
| **7** | Refatoração oportunista em `src/`            | Tentar corrigir suposto bug em produção                   | Regra de tolerância zero: se achar bug em `src/`, parar e reportar. Zero diff em `src/`.                                                 |
| **8** | Inversão da ordem de truncate e seed         | Truncar depois de semear apaga o catálogo                 | Ordem estrita: primeiro `truncateAll(db)`, depois `seed(db)`.                                                                            |

---

## 7. Decisões Técnicas Registradas (Prévia D-48)

### D-48 · Container Singleton no Harness E2E para Suíte de Fluxos Completos

- **Data:** 2026-09-08 · **Sprint:** F4-S03 · **Status:** vigente
- **Contexto:** A execução de 5 arquivos de testes E2E subindo containers individuais do Testcontainers multiplicaria o tempo de execução por 5 (~25-30s adicionais de setup Docker), arriscando ultrapassar o teto estrito de 45s da Spec 05 §1. Por outro lado, configurar um `globalSetup` isolado no Vitest exigiria modificar arquivos fora do blast radius estrito (`vitest.workspace.ts`).
- **Decisão:** Utilizar a estratégia de Container Singleton em `tests/e2e/helpers/app.ts`. Respaldado pela decisão D-36 (`singleFork: true` para o project `e2e`), o container PostgreSQL 17 sobe uma única vez para toda a suíte E2E. O pool de conexões é sincronizado transparentemente via `setPool(sharedTestDb.pool)` e o isolamento entre testes é garantido por `truncateAll(db)` e `seed(db)` no `beforeEach`.
- **Consequência:** A suíte E2E completa executa em menos de 15 segundos, cumpre a meta da Spec 05, preserva o blast radius estritamente fechado e mantém isolamento e determinismo perfeitos mesmo sob `--sequence.shuffle`.
