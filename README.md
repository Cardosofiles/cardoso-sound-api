# 🎵 Cardoso Sound API

API RESTful para gerenciamento de catálogo musical, usuários, playlists e favoritos — desenvolvida como backend de um MVP de aplicativo de streaming (consumido por um app Flutter).

> ⚠️ Este projeto **não integra com a API oficial do Spotify**. O catálogo de músicas é mantido em banco próprio (seed local), evitando as restrições de quota do Spotify Developer Mode (Premium obrigatório, limite de 5 usuários de teste, Extended Quota restrito a organizações com 250k+ MAU).

---

## 📦 Stack Tecnológico

| Camada           | Tecnologia                                          |
| ---------------- | --------------------------------------------------- |
| Runtime          | Node.js 22+ (TypeScript strict mode)                |
| Framework Web    | Fastify 5                                           |
| Autenticação     | Better Auth                                         |
| Banco de Dados   | PostgreSQL (Docker)                                 |
| ORM              | Drizzle ORM                                         |
| Validação        | Zod (via `fastify-type-provider-zod`)               |
| Documentação     | Swagger/OpenAPI (`@fastify/swagger` + `swagger-ui`) |
| Segurança        | Helmet, CORS, Rate Limit, Under Pressure            |
| Testes E2E       | Playwright                                          |
| Testes Unitários | Vitest + Testcontainers                             |
| CI/CD            | GitHub Actions                                      |
| Logging          | Pino (structured logging)                           |

---

## ✅ Validação de Dependências (atualizado em 03/09/2026)

| Pacote                      | Versão no projeto | Última estável | Status                                             |
| --------------------------- | ----------------- | -------------- | -------------------------------------------------- |
| `fastify`                   | ^5.5.0            | 5.8.5          | 🔄 Atualizar                                       |
| `better-auth`               | ~1.6.30           | 1.7.2          | 🔄 Atualizar (minor com fixes)                     |
| `drizzle-orm`               | ^0.45.2           | 0.45.2         | ✅ Atual (1.0.0 ainda é RC — não usar em produção) |
| `drizzle-kit`               | ^0.31.4           | 0.31.x         | ✅ Atual                                           |
| `zod`                       | ^4.4.3            | 4.x            | ✅ Atual                                           |
| `fastify-type-provider-zod` | ^6.1.0            | 6.x            | ✅ Atual                                           |
| `@fastify/swagger`          | ^9.5.1            | 9.x            | ✅ Atual                                           |
| `@fastify/helmet`           | ^12.0.1           | 12.x           | ✅ Atual                                           |
| `@fastify/rate-limit`       | ^10.1.1           | 10.x           | ✅ Atual                                           |
| `@fastify/cors`             | ^10.0.2           | 10.x           | ✅ Atual                                           |
| `pino`                      | ^10.3.1           | 10.x           | ✅ Atual                                           |
| `typescript`                | ^5.7.2            | 5.7.x          | ✅ Atual                                           |
| `vitest`                    | ^2.1.8            | 2.x            | ✅ Atual                                           |
| `@neondatabase/serverless`  | ^1.0.1            | -              | ⚠️ Avaliar necessidade (ver nota)                  |

**Notas:**

- `drizzle-orm` 1.0.0 está em release candidate desde jun/2026 — **não migrar** até versão estável ser publicada.
- `@neondatabase/serverless` só é necessário se você for hospedar o Postgres na Neon. Como o projeto usa Docker local, pode ser removido ou mantido só para produção (deploy serverless).
- `better-auth` 1.7.x trouxe suporte a MCP (2026-07-28 spec) — não essencial para este projeto, mas traz correções de segurança relevantes.

**Ação recomendada:**

```bash
pnpm add fastify@^5.8.5 better-auth@^1.7.2
```

---

## 🏗️ Arquitetura do Projeto

Arquitetura em camadas (**Clean Architecture simplificada**), separando domínio, aplicação e infraestrutura — adequada para o porte do projeto (MVP acadêmico) sem overengineering.

```
cardoso-sound-api/
├── .agents/                                   # Ecossistema de IA: regras, subagentes e skills
│   ├── agents/                                # Definição dos papéis dos subagentes especializados
│   │   ├── api-developer.md                   # Subagente de rotas, services, repositórios e plugins
│   │   ├── backend-architect.md               # Subagente de arquitetura e contratos DTO Zod
│   │   ├── db-specialist.md                   # Subagente de modelagem PostgreSQL e migrations Drizzle
│   │   ├── qa-engineer.md                     # Subagente de testes unitários, integração e E2E
│   │   └── security-reviewer.md               # Subagente de auditoria de autenticação e segurança
│   ├── rules/                                 # Regras invariantes e diretrizes contextuais do projeto
│   │   ├── architecture.md                    # Clean Architecture, fronteiras e organização de pastas
│   │   ├── auth.md                            # Better Auth, decorators de sessão e guards de rotas
│   │   ├── coding-standards.md                # Nomenclaturas, TypeScript estrito, ESM e Fastify
│   │   ├── database.md                        # PostgreSQL, schemas Drizzle, PKs e transações
│   │   └── testing.md                         # Vitest, Testcontainers e Playwright
│   ├── skills/                                # Procedimentos e runbooks acionados sob demanda
│   │   ├── code-quality/
│   │   │   └── SKILL.md                       # Typecheck, lint, formatação e bundle tsup
│   │   ├── db-migrate/
│   │   │   └── SKILL.md                       # Geração, inspeção e aplicação de migrations Drizzle
│   │   ├── db-seed/
│   │   │   └── SKILL.md                       # Povoamento idempotente do catálogo com faixas mock
│   │   ├── grill-me/
│   │   │   ├── agents/
│   │   │   │   └── openai.yaml                # Configuração do agente de alinhamento e entrevista
│   │   │   └── SKILL.md                       # Entrevista interativa para alinhamento de requisitos
│   │   └── test-runner/
│   │       └── SKILL.md                       # Execução de Vitest, Testcontainers e Playwright
│   ├── mcp_config.json                        # Integração com MCP (Docs, GitHub, PostgreSQL)
│   └── README.md                              # Documentação do ecossistema de agentes autônomos
│
├── .github/
│   └── workflows/
│       ├── ci.yml                             # Pipeline CI: lint, typecheck e testes automatizados
│       └── deploy.yml                         # Pipeline CD: build, migrations e deploy
│
├── .husky/                                    # Hooks Git para automação de pre-commit e commit-msg
├── .vscode/                                   # Configurações do workspace e extensões recomendadas
├── docs/                                      # Documentações técnicas e especificações do projeto
│
├── src/
│   ├── config/
│   │   ├── constants.ts                       # Constantes de negócio, limites e defaults
│   │   └── env.ts                             # Validação de variáveis de ambiente em runtime (Zod)
│   │
│   ├── db/
│   │   ├── schema/
│   │   │   ├── artists.schema.ts              # Schema da tabela de artistas musicais
│   │   │   ├── favorites.schema.ts            # Schema de favoritos (tabela associativa usuário-faixa)
│   │   │   ├── index.ts                       # Barrel export unificado de todos os schemas
│   │   │   ├── playlist-tracks.schema.ts      # Schema associativo com chave composta playlist-faixa
│   │   │   ├── playlists.schema.ts            # Schema da tabela de playlists
│   │   │   ├── tracks.schema.ts               # Schema da tabela de faixas de áudio e metadados
│   │   │   └── users.schema.ts                # Schema da tabela de usuários integrado ao Better Auth
│   │   ├── seed/
│   │   │   ├── data/
│   │   │   │   ├── artists.data.ts            # Dados mockados de artistas para seed
│   │   │   │   └── tracks.data.ts             # 30+ faixas mockadas com URLs SoundHelix
│   │   │   └── seed.ts                        # Script de povoamento inicial do banco (idempotente)
│   │   ├── client.ts                          # Pool de conexões pg e instância singleton do Drizzle
│   │   └── migrate.ts                         # Runner programático de migrations em produção
│   │
│   ├── jobs/
│   │   └── runner.ts                          # Runner para tarefas agendadas e rotinas em background
│   │
│   ├── modules/
│   │   ├── artists/
│   │   │   ├── artists.repository.ts          # Camada de dados e queries Drizzle para artistas
│   │   │   ├── artists.routes.ts              # Rotas HTTP Fastify tipadas com Zod
│   │   │   ├── artists.schema.ts              # DTOs Zod de entrada e saída para artistas
│   │   │   └── artists.service.ts             # Regras de negócio e operações de artistas
│   │   │
│   │   ├── auth/
│   │   │   ├── auth.config.ts                 # Configuração central do Better Auth (drizzleAdapter)
│   │   │   ├── auth.plugin.ts                 # Plugin Fastify com decorator de sessão e user
│   │   │   └── auth.routes.ts                 # Endpoints delegados ao handler do Better Auth
│   │   │
│   │   ├── favorites/
│   │   │   ├── favorites.repository.ts        # Queries Drizzle e manipulação de favoritos
│   │   │   ├── favorites.routes.ts            # Rotas para favoritar e desfavoritar faixas
│   │   │   ├── favorites.schema.ts            # DTOs Zod de validação para favoritos
│   │   │   └── favorites.service.ts           # Regras de negócio de gerenciamento de favoritos
│   │   │
│   │   ├── playlists/
│   │   │   ├── playlists.repository.ts        # Queries Drizzle para criação e itens de playlists
│   │   │   ├── playlists.routes.ts            # Rotas CRUD e adição/remoção de faixas
│   │   │   ├── playlists.schema.ts            # DTOs Zod para operações de playlists
│   │   │   └── playlists.service.ts           # Regras de negócio, ordenação e integridade
│   │   │
│   │   ├── tracks/
│   │   │   ├── tracks.repository.ts           # Queries de catálogo, paginação e busca textual
│   │   │   ├── tracks.routes.ts               # Rotas de listagem, detalhes e streaming de faixas
│   │   │   ├── tracks.schema.ts               # DTOs Zod de entrada/saída para faixas
│   │   │   └── tracks.service.ts              # Lógica de catálogo, streams e contadores
│   │   │
│   │   └── users/
│   │       ├── users.repository.ts            # Acesso aos dados de usuários no PostgreSQL
│   │       ├── users.routes.ts                # Rotas de perfil, atualização e exclusão
│   │       ├── users.schema.ts                # DTOs Zod de validação para usuários
│   │       └── users.service.ts               # Regras de negócio e ciclo de vida de usuários
│   │
│   ├── plugins/
│   │   ├── cors.plugin.ts                     # Configuração de CORS com origens dinâmicas
│   │   ├── error-handler.plugin.ts            # Tratamento centralizado de erros (RFC 7807)
│   │   ├── helmet.plugin.ts                   # Segurança de cabeçalhos HTTP (@fastify/helmet)
│   │   ├── rate-limit.plugin.ts               # Proteção contra rate limit e brute force
│   │   ├── swagger.plugin.ts                  # Documentação OpenAPI / Swagger UI interativa
│   │   └── under-pressure.plugin.ts           # Monitoramento de integridade e overload
│   │
│   ├── shared/
│   │   ├── errors/
│   │   │   ├── app-error.ts                   # Classe base abstrata de erros de domínio
│   │   │   ├── not-found.error.ts             # Exceção de recurso não encontrado (HTTP 404)
│   │   │   ├── unauthorized.error.ts          # Exceção de falha de autenticação (HTTP 401)
│   │   │   └── validation.error.ts            # Exceção de validação de payload (HTTP 422)
│   │   ├── types/
│   │   │   └── fastify.d.ts                   # Augmentation de tipos do Fastify (user e session)
│   │   └── utils/
│   │       └── pagination.ts                  # Utilitários de cálculo e metadados de paginação
│   │
│   ├── app.ts                                 # Factory da instância Fastify (registro de plugins/rotas)
│   └── server.ts                              # Entry point da API (bootstrap + listen HTTP)
│
├── tests/
│   ├── e2e/
│   │   └── specs/
│   │       └── .gitkeep                       # Especificações E2E de fluxos HTTP (Playwright)
│   ├── setup/
│   │   └── testcontainers.ts                  # Instância efêmera de PostgreSQL via Testcontainers
│   └── unit/
│       └── modules/
│           └── .gitkeep                       # Testes unitários isolados por módulo (Vitest)
│
├── .dockerignore                              # Arquivos e pastas excluídos do build Docker
├── .env                                       # Variáveis de ambiente locais (sensível, não commitado)
├── .env.example                               # Modelo documentado das variáveis de ambiente necessárias
├── .gitattributes                             # Normalização de finais de linha e atributos do repositório
├── .gitignore                                 # Regras de arquivos e pastas ignorados pelo Git
├── .prettierignore                            # Exclusões de arquivos da formatação automática
├── .prettierrc.json                           # Configurações de estilo e formatação do Prettier
├── AGENTS.md                                  # Diretrizes de engenharia, arquitetura e subagentes IA
├── commitlint.config.mjs                      # Validação de mensagens de commit (Conventional Commits)
├── docker-compose.yml                         # Composição do container PostgreSQL 16 local
├── Dockerfile                                 # Imagem Docker multi-stage de produção (Node.js 20 Alpine)
├── drizzle.config.ts                          # Configuração do Drizzle Kit para migrations e introspecção
├── eslint.config.mjs                          # Configuração do ESLint v9 (Flat Config)
├── lintstagedrc.json                          # Automação de linters e formatação em arquivos staged
├── package.json                               # Manifesto do projeto, scripts pnpm e dependências
├── railway.json                               # Definição de build e deploy na nuvem Railway
├── README.md                                  # Documentação central do projeto e guia de onboarding
├── skills-lock.json                           # Arquivo de lock de versões das skills instaladas
├── tsconfig.json                              # Configuração do compilador TypeScript em Strict Mode
├── tsup.config.ts                             # Configuração do empacotador tsup para build de produção
├── vitest.config.ts                           # Configuração da suíte de testes com Vitest
└── vitest.workspace.ts                        # Definição do workspace unificado de testes do Vitest
```

### Por que essa organização?

- **Modular por domínio** (`modules/`): cada feature (auth, tracks, playlists...) é autocontida — rotas, service, repository e schema Zod juntos. Facilita localizar código e escalar o time.
- **Repository pattern**: isola queries Drizzle da lógica de negócio, facilitando testes unitários com mocks.
- **Service layer**: contém regras de negócio puras, sem depender do Fastify — testável isoladamente.
- **Plugins Fastify separados**: cada preocupação de infraestrutura (CORS, Helmet, Rate Limit) é um plugin encapsulado, registrado no `app.ts`.
- **`shared/errors`**: hierarquia de erros de domínio, capturada pelo `error-handler.plugin.ts` para respostas HTTP padronizadas (RFC 7807-like).
- **Testcontainers**: testes de integração rodam contra um Postgres real e efêmero, evitando mocks frágeis de SQL.

---

## 🗄️ Modelagem de Dados (Drizzle Schema)

```typescript
// src/db/schema/tracks.schema.ts
import { pgTable, uuid, varchar, integer, timestamp } from 'drizzle-orm/pg-core';
import { artists } from './artists.schema';

export const tracks = pgTable('tracks', {
  id: uuid('id').primaryKey().defaultRandom(),
  title: varchar('title', { length: 255 }).notNull(),
  artistId: uuid('artist_id')
    .notNull()
    .references(() => artists.id),
  album: varchar('album', { length: 255 }),
  durationSeconds: integer('duration_seconds').notNull(),
  coverUrl: varchar('cover_url', { length: 500 }),
  audioUrl: varchar('audio_url', { length: 500 }).notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});
```

```typescript
// src/db/schema/artists.schema.ts
import { pgTable, uuid, varchar, timestamp } from 'drizzle-orm/pg-core';

export const artists = pgTable('artists', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: varchar('name', { length: 255 }).notNull(),
  bio: varchar('bio', { length: 1000 }),
  avatarUrl: varchar('avatar_url', { length: 500 }),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});
```

O seed (`src/db/seed/seed.ts`) popula 30+ faixas distribuídas entre 5–8 artistas fictícios, usando URLs de áudio livres (ex.: SoundHelix) como placeholder de streaming.

---

## 🔐 Autenticação (Better Auth + Fastify)

```typescript
// src/modules/auth/auth.config.ts
import { betterAuth } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { db } from '../../db/client';

export const auth = betterAuth({
  database: drizzleAdapter(db, { provider: 'pg' }),
  emailAndPassword: {
    enabled: true,
    minPasswordLength: 8,
  },
  session: {
    expiresIn: 60 * 60 * 24 * 7, // 7 dias
  },
  rateLimit: {
    enabled: true,
    window: 60,
    max: 10,
  },
});
```

O plugin Fastify (`auth.plugin.ts`) expõe as rotas do Better Auth (`/api/auth/*`) e injeta `request.session`/`request.user` via `decorateRequest`, permitindo `preHandler` de autorização nas rotas protegidas.

---

## 🚀 Rotas Principais

| Método | Rota                                 | Descrição                         | Autenticado |
| ------ | ------------------------------------ | --------------------------------- | ----------- |
| POST   | `/api/auth/sign-up/email`            | Cadastro de usuário               | ❌          |
| POST   | `/api/auth/sign-in/email`            | Login                             | ❌          |
| POST   | `/api/auth/sign-out`                 | Logout                            | ✅          |
| GET    | `/api/tracks`                        | Lista músicas (paginado, filtros) | ❌          |
| GET    | `/api/tracks/:id`                    | Detalhe de uma faixa              | ❌          |
| GET    | `/api/artists`                       | Lista artistas                    | ❌          |
| GET    | `/api/artists/:id`                   | Detalhe de artista + faixas       | ❌          |
| GET    | `/api/playlists`                     | Playlists do usuário              | ✅          |
| POST   | `/api/playlists`                     | Cria playlist                     | ✅          |
| POST   | `/api/playlists/:id/tracks`          | Adiciona faixa à playlist         | ✅          |
| DELETE | `/api/playlists/:id/tracks/:trackId` | Remove faixa da playlist          | ✅          |
| POST   | `/api/favorites/:trackId`            | Favorita faixa                    | ✅          |
| DELETE | `/api/favorites/:trackId`            | Remove favorito                   | ✅          |
| GET    | `/api/favorites`                     | Lista favoritos do usuário        | ✅          |
| GET    | `/docs`                              | Swagger UI                        | ❌          |

---

## 🐳 Docker (PostgreSQL local)

```yaml
# docker-compose.yml
services:
  postgres:
    image: postgres:17-alpine
    restart: unless-stopped
    environment:
      POSTGRES_USER: cardoso
      POSTGRES_PASSWORD: cardoso_dev
      POSTGRES_DB: cardoso_sound
    ports:
      - '5432:5432'
    volumes:
      - pgdata:/var/lib/postgresql/data

volumes:
  pgdata:
```

---

## ⚙️ Como Rodar Localmente

```bash
# 1. Instalar dependências
pnpm install

# 2. Subir o Postgres
docker compose up -d

# 3. Copiar variáveis de ambiente
cp .env.example .env

# 4. Rodar migrations
pnpm db:migrate

# 5. Popular o banco (30+ músicas)
tsx src/db/seed/seed.ts

# 6. Iniciar em modo desenvolvimento
pnpm dev

# 7. Acessar a documentação
# http://localhost:3000/docs
```

---

## 🧪 Testes

```bash
# Testes unitários (Vitest)
pnpm test

# Testes E2E (Playwright, requer app rodando)
pnpm playwright test

# Watch mode
pnpm test:watch
```

Os testes de integração usam **Testcontainers** para subir um Postgres efêmero, garantindo isolamento e reprodutibilidade sem depender do ambiente Docker local do desenvolvedor.

---

## 🔄 CI/CD (GitHub Actions)

Pipeline em `.github/workflows/ci.yml`:

1. Checkout + setup pnpm/Node 22.
2. `pnpm install --frozen-lockfile`.
3. `pnpm lint` + `pnpm typecheck`.
4. `pnpm test` (com Testcontainers).
5. `pnpm build` (tsup).
6. (Opcional) Deploy automático em push para `main` via `deploy.yml`.

---

## 📱 Integração com o App Flutter

O app Flutter consome exclusivamente esta API — nenhuma chamada direta ao Spotify ou terceiros:

- **Base URL**: configurável via `--dart-define=API_URL=https://sua-api.com`.
- **Autenticação**: token de sessão do Better Auth armazenado com `flutter_secure_storage`.
- **Player**: `just_audio` consumindo o campo `audioUrl` retornado por `/api/tracks`.
- **Distribuição**: APK via `flutter build apk --split-per-abi`, ou Google Play em **teste interno/fechado** para os alunos.

---

## 📄 Licença

ISC — uso livre para fins acadêmicos e de portfólio.

---

**Autor:** Cardosofiles (João Batista Cardoso Miranda) — Uberlândia, MG, Brasil.
