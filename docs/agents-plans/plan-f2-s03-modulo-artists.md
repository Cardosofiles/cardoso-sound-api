# Plano de Implementação — Sprint F2-S03: Módulo `artists`

> **Status:** 🟡 Em Planejamento (Aguardando Autorização Explícita — Etapa 3 do Protocolo)  
> **Fase:** F2 — Catálogo  
> **Branch Alvo:** `feature/f2s03-modulo-artists` (a partir de `develop`)  
> **Depende de:** F2-S02 (Seed do Catálogo e Harness de Integração Testcontainers)  
> **Contratos de Entrega:** R04 (`GET /api/v1/artists`) e R05 (`GET /api/v1/artists/:id`)  
> **Specs de Referência:**
>
> - [`docs/specs/01-arquitetura.md`](file:///home/cardosofiles/www/typescript/back-end/development/fastify/cardoso-sound-api/docs/specs/01-arquitetura.md) (§1 — Fluxo de dependência, §7 — Padrão de módulo)
> - [`docs/specs/03-contrato-da-api.md`](file:///home/cardosofiles/www/typescript/back-end/development/fastify/cardoso-sound-api/docs/specs/03-contrato-da-api.md) (§1 — Convenções globais, §3 — Representações `Artist`, `ArtistSummary` e `Track`, §4 — Catálogo)
> - [`docs/specs/07-protocolo-dos-agentes.md`](file:///home/cardosofiles/www/typescript/back-end/development/fastify/cardoso-sound-api/docs/specs/07-protocolo-dos-agentes.md)
> - [`docs/sprints/fase-2-catalogo/F2-S03-modulo-artists.md`](file:///home/cardosofiles/www/typescript/back-end/development/fastify/cardoso-sound-api/docs/sprints/fase-2-catalogo/F2-S03-modulo-artists.md)
> - [`.agents/memory/DECISIONS.md`](file:///home/cardosofiles/www/typescript/back-end/development/fastify/cardoso-sound-api/.agents/memory/DECISIONS.md) (especialmente **D-01**, **D-09**, **D-14**, **D-16**, **D-36**)

---

## 1. Contexto e Objetivos

O sprint **F2-S03** é o **sprint de referência para o padrão de módulo de domínio** de toda a API. Ele inaugura a entrega dos endpoints de negócio consumíveis pelo app Flutter e dita a estrutura arquitetural exata que será replicada nos módulos subsequentes (`tracks` em F2-S04, `users` em F3-S02, `playlists` em F4-S01 e `favorites` em F4-S02).

Os objetivos centrais deste sprint são:

1. **Entregar o contrato R04 (`GET /api/v1/artists`):**
   - Listagem pública e paginada de artistas do catálogo com parâmetros `page` (default 1), `limit` (default 20, max 100) e `search` (opcional, 1..100 chars).
   - Busca textual case-insensitive via `ILIKE '%termo%'` no campo `artists.name`, com sanitização de caracteres curinga (`%`, `_`, `\`).
   - Cálculo eficiente e não-enviesado de `trackCount` via subquery correlacionada `(SELECT count(*)::int FROM tracks WHERE tracks.artist_id = artists.id)`.
   - Reutilização estrita da mesma cláusula `where` entre a query da página e a query de `COUNT(*)` para garantir integridade matemática dos metadados de paginação (`total`, `totalPages`, `hasNext`, `hasPrev`).
   - Ordenação canônica estável por `created_at DESC`, desempate por `id ASC` (Spec 03 §1).

2. **Entregar o contrato R05 (`GET /api/v1/artists/:id`):**
   - Consulta pontual de artista por UUID v4, retornando `Artist & { tracks: Track[] }`.
   - Consulta otimizada das faixas do artista através da API relacional do Drizzle ORM (`db.query.artists.findFirst({ where, with: { tracks: { orderBy: ... } } })`), trazendo todas as faixas ordenadas alfabeticamente por `title ASC` sem paginação (volume garantido $\le 5$).
   - Formatação fiel de cada faixa no formato de representação pública `Track` (Spec 03 §3), com embutimento mandatória do resumo do artista (`artist: ArtistSummary`) e conversão de `createdAt` para ISO 8601 UTC string.
   - Tratamento de ausência: emite `NotFoundError` (HTTP 404 RFC 7807) para UUIDs inexistentes e rejeição HTTP 400 automática pelo Zod para identificadores não-UUID.

3. **Solidificar as 4 Camadas e Conformidade Inegociável com Clean Architecture:**
   - **Schema DTO (`artists.schema.ts`):** Schemas Zod 4 com `describe()` em todos os campos, garantindo auto-documentação no Swagger/OpenAPI (`/docs`) e serialização com poda estrita de campos residuais/crus do banco.
   - **Repository (`artists.repository.ts`):** Isolamento absoluto de queries SQL e Drizzle ORM. Recebe o banco via injeção de dependência (`constructor(private readonly database: Database = db)`), devolvendo linhas brutas tipadas (`ArtistRow`, `ArtistDetailRow`).
   - **Service (`artists.service.ts`):** Lógica pura de negócio. Recebe o repository via construtor (`constructor(private readonly repo: ArtistsRepository = new ArtistsRepository())`). **Zero imports de Fastify** (`FastifyRequest`, `FastifyReply`). Responsável exclusivo por transformar linhas cruas em DTOs e disparar exceções de domínio (`NotFoundError`).
   - **Routes Plugin (`artists.routes.ts`):** Plugin `FastifyPluginAsyncZod`. Instancia o service no escopo de registro, declara schemas de validação e rotas sem prefixo (`/artists`, `/artists/:id`), delegando a execução em linha única sem blocos `try/catch`.
   - **Isolamento de Boundaries (`eslint.config.mjs`):** `artists.routes.ts` **não** importa `src/db/**` nem Drizzle nem repository diretamente, passando com louvor pela regra `boundaries/element-types`.

---

## 2. Blast Radius e Controle Estrito de Arquivos

Em rigorosa observância à seção 4 da especificação da sprint [`docs/sprints/fase-2-catalogo/F2-S03-modulo-artists.md`](file:///home/cardosofiles/www/typescript/back-end/development/fastify/cardoso-sound-api/docs/sprints/fase-2-catalogo/F2-S03-modulo-artists.md):

```
Blast Radius Autorizado:
├── Preencher (atualmente com 0 bytes):
│   ├── src/modules/artists/artists.schema.ts
│   ├── src/modules/artists/artists.repository.ts
│   ├── src/modules/artists/artists.service.ts
│   └── src/modules/artists/artists.routes.ts
│
├── Criar:
│   ├── tests/unit/modules/artists/artists.service.test.ts
│   ├── tests/integration/modules/artists.repository.test.ts
│   └── docs/agents-plans/plan-f2-s03-modulo-artists.md (persistência deste plano — Regra 6)
│
└── Editar:
    ├── src/app.ts (registro de artistsRoutes sob prefixo API_PREFIX '/api/v1')
    ├── .agents/memory/PROGRESS.md
    └── .agents/memory/F2-S03.md
```

### Arquivos Estritamente Intocáveis nesta Sprint:

- `src/modules/tracks/**` (pertence à sprint F2-S04)
- `src/db/**` (schemas Drizzle, migrations e seed já finalizados em F2-S01 e F2-S02)
- `src/plugins/**` (plugins de borda, health e error-handler finalizados em F1-S05 e F1-S06)
- `src/shared/**` (utilitários de paginação e hierarquia de erros estabilizados)
- `eslint.config.mjs` e `tsconfig.json`

---

## 3. Especificação Detalhada dos Componentes e Camadas

### 3.1 Camada DTO & Schemas (`src/modules/artists/artists.schema.ts`)

Centraliza os schemas Zod 4 para validação de entrada (query params e path params) e serialização rigorosa de saída (response 200). Cada campo contém `.describe()` para geração automática da especificação OpenAPI no Swagger UI (`/docs`).

```typescript
import { z } from 'zod';
import { GENRES, MAX_PAGE_SIZE } from '../../config/constants.js';
import {
  DEFAULT_PAGE,
  DEFAULT_PAGE_SIZE,
  type PaginationMeta,
} from '../../shared/utils/pagination.js';

// --- Entrada: Query e Params ---

export const listArtistsQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(DEFAULT_PAGE).describe('Número da página (>= 1)'),
  limit: z.coerce
    .number()
    .int()
    .min(1)
    .max(MAX_PAGE_SIZE)
    .default(DEFAULT_PAGE_SIZE)
    .describe('Quantidade de itens por página (1..100)'),
  search: z
    .string()
    .min(1)
    .max(100)
    .optional()
    .describe('Termo para busca textual parcial no nome do artista (case-insensitive)'),
});

export const artistParamsSchema = z.object({
  id: z.string().uuid().describe('Identificador único do artista (UUID v4)'),
});

// --- Saída: Representações e Envelopes ---

export const artistSummarySchema = z.object({
  id: z.string().uuid().describe('Identificador único do artista (UUID v4)'),
  name: z.string().describe('Nome do artista'),
  avatarUrl: z.string().nullable().describe('URL do avatar do artista ou null'),
});

export const artistTrackSchema = z.object({
  id: z.string().uuid().describe('Identificador único da faixa (UUID v4)'),
  title: z.string().describe('Título da faixa'),
  album: z.string().nullable().describe('Nome do álbum da faixa ou null'),
  genre: z.enum(GENRES).describe('Gênero musical da faixa'),
  durationSeconds: z.number().int().positive().describe('Duração da faixa em segundos'),
  coverUrl: z.string().nullable().describe('URL da capa da faixa ou null'),
  audioUrl: z.string().url().describe('URL pública de reprodução da faixa'),
  artist: artistSummarySchema.describe('Resumo do artista autor da faixa'),
  createdAt: z
    .string()
    .datetime()
    .describe('Data de criação da faixa no catálogo em formato ISO 8601 UTC'),
});

export const artistSchema = z.object({
  id: z.string().uuid().describe('Identificador único do artista (UUID v4)'),
  name: z.string().describe('Nome do artista'),
  bio: z.string().nullable().describe('Biografia resumida do artista ou null'),
  avatarUrl: z.string().nullable().describe('URL do avatar do artista ou null'),
  trackCount: z
    .number()
    .int()
    .nonnegative()
    .describe('Quantidade total de faixas lançadas pelo artista'),
  createdAt: z.string().datetime().describe('Data de cadastro do artista em formato ISO 8601 UTC'),
});

export const artistDetailSchema = artistSchema.extend({
  tracks: z
    .array(artistTrackSchema)
    .describe('Lista de todas as faixas do artista ordenadas por título em ordem ascendente'),
});

export const paginationMetaSchema = z.object({
  page: z.number().int().min(1).describe('Página atual da listagem'),
  limit: z.number().int().min(1).describe('Limite de itens solicitados por página'),
  total: z.number().int().nonnegative().describe('Total geral de itens que satisfazem a consulta'),
  totalPages: z.number().int().min(1).describe('Total de páginas disponíveis'),
  hasNext: z.boolean().describe('Indica se existe uma próxima página'),
  hasPrev: z.boolean().describe('Indica se existe uma página anterior'),
});

export const listArtistsResponseSchema = z.object({
  data: z.array(artistSchema).describe('Lista de artistas da página solicitada'),
  meta: paginationMetaSchema.describe('Metadados de paginação da listagem'),
});

// --- Tipos Inferidos ---
export type ListArtistsQuery = z.infer<typeof listArtistsQuerySchema>;
export type ArtistParams = z.infer<typeof artistParamsSchema>;
export type ArtistSummaryDto = z.infer<typeof artistSummarySchema>;
export type ArtistTrackDto = z.infer<typeof artistTrackSchema>;
export type ArtistDto = z.infer<typeof artistSchema>;
export type ArtistDetailDto = z.infer<typeof artistDetailSchema>;
export type ListArtistsResponseDto = z.infer<typeof listArtistsResponseSchema>;
```

---

### 3.2 Camada de Acesso a Dados (`src/modules/artists/artists.repository.ts`)

Executa queries SQL e Drizzle ORM diretas contra o banco de dados.

- Não possui lógica de formatação de DTOs HTTP nem tratamento de códigos de status.
- Suporta injeção de dependência através de `constructor(private readonly db: Database = defaultDb)` (onde `defaultDb` é importado de `src/db/client.js`), viabilizando a injeção do banco efêmero em testes de integração sem violar fronteiras.

```typescript
import { asc, count, desc, eq, ilike, sql, type SQL } from 'drizzle-orm';
import { db as defaultDb, type Database } from '../../db/client.js';
import { artists, tracks } from '../../db/schema/index.js';

export interface ArtistRow {
  id: string;
  name: string;
  bio: string | null;
  avatarUrl: string | null;
  trackCount: number;
  createdAt: Date;
}

export interface TrackSubRow {
  id: string;
  title: string;
  artistId: string;
  album: string | null;
  genre: string;
  durationSeconds: number;
  coverUrl: string | null;
  audioUrl: string;
  createdAt: Date;
}

export interface ArtistDetailRow {
  id: string;
  name: string;
  bio: string | null;
  avatarUrl: string | null;
  trackCount: number;
  createdAt: Date;
  tracks: TrackSubRow[];
}

export class ArtistsRepository {
  constructor(private readonly db: Database = defaultDb) {}

  async list(input: {
    limit: number;
    offset: number;
    search?: string;
  }): Promise<{ rows: ArtistRow[]; total: number }> {
    let whereClause: SQL | undefined = undefined;

    if (input.search && input.search.trim().length > 0) {
      // Sanitiza caracteres curinga de LIKE/ILIKE no PostgreSQL (Armadilha 7)
      const sanitizedTerm = input.search.trim().replace(/[%_\\]/g, '\\$&');
      whereClause = ilike(artists.name, `%${sanitizedTerm}%`);
    }

    // Subquery correlacionada para contagem segura de faixas sem viés de GROUP BY + LIMIT (Armadilha 2)
    const trackCountSql = sql<number>`(
      SELECT count(*)::int
      FROM ${tracks}
      WHERE ${tracks.artistId} = ${artists.id}
    )`.mapWith(Number);

    // Query 1: Registros da página com ordenação canônica (Spec 03 §1: created_at DESC, id ASC)
    const rowsPromise = this.db
      .select({
        id: artists.id,
        name: artists.name,
        bio: artists.bio,
        avatarUrl: artists.avatarUrl,
        trackCount: trackCountSql,
        createdAt: artists.createdAt,
      })
      .from(artists)
      .where(whereClause)
      .orderBy(desc(artists.createdAt), asc(artists.id))
      .limit(input.limit)
      .offset(input.offset);

    // Query 2: Contagem total utilizando EXATAMENTE o mesmo whereClause (Armadilha 1)
    const countPromise = this.db.select({ value: count() }).from(artists).where(whereClause);

    const [rows, [countResult]] = await Promise.all([rowsPromise, countPromise]);
    const total = countResult?.value ?? 0;

    return { rows, total };
  }

  async findById(id: string): Promise<ArtistDetailRow | null> {
    // Consulta relacional do Drizzle ORM carregando faixas com ordenação 'title ASC' (Armadilha 4)
    const result = await this.db.query.artists.findFirst({
      where: eq(artists.id, id),
      with: {
        tracks: {
          orderBy: (table, { asc: orderAsc }) => [orderAsc(table.title)],
        },
      },
    });

    if (!result) {
      return null;
    }

    return {
      id: result.id,
      name: result.name,
      bio: result.bio,
      avatarUrl: result.avatarUrl,
      trackCount: result.tracks.length,
      createdAt: result.createdAt,
      tracks: result.tracks,
    };
  }
}
```

---

### 3.3 Camada de Serviços de Negócio (`src/modules/artists/artists.service.ts`)

Contém as regras de negócio de domínio:

- Injeção por construtor: `constructor(private readonly repo: ArtistsRepository = new ArtistsRepository())`.
- **Zero import de Fastify:** Não referencia `FastifyRequest`, `FastifyReply` nem qualquer utilitário de transporte HTTP.
- Transforma linhas brutas em DTOs limpos e imutáveis, convertendo campos de data `Date` em strings ISO 8601 UTC (`.toISOString()`), garantindo que nenhum campo cru do banco de dados vaze para o consumidor (T8).
- Converte retornos `null` de `findById` na exceção de domínio canônica `NotFoundError('Artist not found')`.

```typescript
import type { Genre } from '../../config/constants.js';
import { NotFoundError } from '../../shared/errors/index.js';
import {
  buildPaginationMeta,
  toOffset,
  type PaginationMeta,
} from '../../shared/utils/pagination.js';
import { ArtistsRepository } from './artists.repository.js';
import type { ArtistDetailDto, ArtistDto, ListArtistsQuery } from './artists.schema.js';

export class ArtistsService {
  constructor(private readonly repo: ArtistsRepository = new ArtistsRepository()) {}

  async list(query: ListArtistsQuery): Promise<{ data: ArtistDto[]; meta: PaginationMeta }> {
    const offset = toOffset({ page: query.page, limit: query.limit });

    const { rows, total } = await this.repo.list({
      limit: query.limit,
      offset,
      search: query.search,
    });

    const meta = buildPaginationMeta({
      page: query.page,
      limit: query.limit,
      total,
    });

    const data: ArtistDto[] = rows.map((row) => ({
      id: row.id,
      name: row.name,
      bio: row.bio ?? null,
      avatarUrl: row.avatarUrl ?? null,
      trackCount: row.trackCount,
      createdAt: row.createdAt.toISOString(),
    }));

    return { data, meta };
  }

  async getById(id: string): Promise<ArtistDetailDto> {
    const row = await this.repo.findById(id);

    if (!row) {
      throw new NotFoundError('Artist not found');
    }

    return {
      id: row.id,
      name: row.name,
      bio: row.bio ?? null,
      avatarUrl: row.avatarUrl ?? null,
      trackCount: row.tracks.length,
      createdAt: row.createdAt.toISOString(),
      tracks: row.tracks.map((track) => ({
        id: track.id,
        title: track.title,
        album: track.album ?? null,
        genre: track.genre as Genre,
        durationSeconds: track.durationSeconds,
        coverUrl: track.coverUrl ?? null,
        audioUrl: track.audioUrl,
        artist: {
          id: row.id,
          name: row.name,
          avatarUrl: row.avatarUrl ?? null,
        },
        createdAt: track.createdAt.toISOString(),
      })),
    };
  }
}
```

---

### 3.4 Camada de Rotas (`src/modules/artists/artists.routes.ts`)

Plugin Fastify tipado com `FastifyPluginAsyncZod`.

- Instancia o service dentro do escopo do plugin.
- **Não importa `src/db/**`** nem Drizzle ORM nem `ArtistsRepository`, assegurando cumprimento irrestrito das regras de arquitetura e lint (`boundaries/element-types`).
- Não contém blocos `try/catch` (delega ao `errorHandlerPlugin` central).
- Declara rotas relativas sem prefixo (`/artists` e `/artists/:id`), pois o prefixo `/api/v1` é provido no registro em `src/app.ts`.

```typescript
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import {
  artistDetailSchema,
  artistParamsSchema,
  listArtistsQuerySchema,
  listArtistsResponseSchema,
} from './artists.schema.js';
import { ArtistsService } from './artists.service.js';

export const artistsRoutes: FastifyPluginAsyncZod = async (fastify) => {
  const service = new ArtistsService();

  // R04: Listagem paginada de artistas do catálogo
  fastify.get(
    '/artists',
    {
      schema: {
        tags: ['Catalog'],
        summary: 'Lista artistas do catálogo',
        description:
          'Retorna uma lista paginada de artistas do catálogo musical, com suporte a busca textual por nome.',
        operationId: 'listArtists',
        querystring: listArtistsQuerySchema,
        response: {
          200: listArtistsResponseSchema,
        },
      },
    },
    async (request) => {
      return service.list(request.query);
    },
  );

  // R05: Detalhes do artista com faixas ordenadas
  fastify.get(
    '/artists/:id',
    {
      schema: {
        tags: ['Catalog'],
        summary: 'Obtém detalhes de um artista',
        description:
          'Retorna as informações completas de um artista e sua lista integral de faixas ordenadas por título em ordem ascendente.',
        operationId: 'getArtistById',
        params: artistParamsSchema,
        response: {
          200: artistDetailSchema,
        },
      },
    },
    async (request) => {
      return service.getById(request.params.id);
    },
  );
};
```

---

### 3.5 Registro de Rotas na Aplicação (`src/app.ts`)

Atualização de `src/app.ts` para registrar `artistsRoutes` sob a constante de prefixo `API_PREFIX` (`/api/v1`):

```typescript
// Adicionar import:
import { API_PREFIX } from './config/constants.js';
import { artistsRoutes } from './modules/artists/artists.routes.js';

// No corpo de buildApp(), logo após as rotas de saúde:
// 4. Rotas de monitoramento de saúde (liveness e readiness)
await app.register(healthPlugin);

// 5. Rotas de domínio do catálogo (/api/v1)
await app.register(artistsRoutes, { prefix: API_PREFIX });
```

---

## 4. Estratégia e Casos de Testes Obrigatórios

### 4.1 Testes Unitários (`tests/unit/modules/artists/artists.service.test.ts`)

Totalmente isolados em memória com dublê de teste para `ArtistsRepository` (zero banco de dados, execução em < 15ms):

| Caso   | Cenário Avaliado                                                  | Asserção / Expectativa                                                                                                                                                 |
| :----- | :---------------------------------------------------------------- | :--------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **T1** | `list` com 40 itens no total, `page: 1`, `limit: 20`              | `meta.page === 1`, `meta.limit === 20`, `meta.total === 40`, `meta.totalPages === 2`, `meta.hasNext === true`, `meta.hasPrev === false`                                |
| **T2** | `list` com `page: 2` de 40 itens                                  | `meta.page === 2`, `meta.totalPages === 2`, `meta.hasNext === false`, `meta.hasPrev === true`                                                                          |
| **T3** | `list` com total 0 (nenhum artista)                               | `data: []`, `meta.total === 0`, `meta.totalPages === 1`, `meta.hasNext === false`, `meta.hasPrev === false`                                                            |
| **T4** | `list` com parâmetro `search`                                     | Repository é invocado recebendo `{ limit: 20, offset: 0, search: 'term' }`                                                                                             |
| **T5** | `list` com cálculo de offset (`page: 3`, `limit: 20`)             | Repository é invocado com `offset: 40`                                                                                                                                 |
| **T6** | `getById` para id não encontrado (`repo.findById` devolve `null`) | Lança instância de `NotFoundError` com status 404 e mensagem `'Artist not found'`                                                                                      |
| **T7** | `getById` para linha válida com faixas associadas                 | Retorna DTO correspondente a `ArtistDetailDto`, com `tracks` populadas, `artist` embutido como `ArtistSummary` em cada faixa, e datas convertidas para ISO 8601 string |
| **T8** | Ausência de vazamento de chaves internas do banco                 | DTO devolvido não possui propriedades como `artist_id` ou `artistId` na raiz nem dentro de `tracks`                                                                    |

### 4.2 Testes de Integração (`tests/integration/modules/artists.repository.test.ts`)

Execução real contra container PostgreSQL efêmero via `tests/setup/testcontainers.ts` populado pelo seed canônico:

| Caso    | Cenário Avaliado                                                                   | Asserção / Expectativa                                                  |
| :------ | :--------------------------------------------------------------------------------- | :---------------------------------------------------------------------- |
| **T9**  | `list` sem filtro sobre catálogo padrão (seed)                                     | `total === 8`, `rows.length === 8`                                      |
| **T10** | `list` com paginação `limit: 5`                                                    | `rows.length === 5`, `total === 8`                                      |
| **T11** | `search` com termo parcial minúsculo (ex: `'echoes'` para `'The Midnight Echoes'`) | Casa o artista independentemente de maiúsculas/minúsculas (`ILIKE`)     |
| **T12** | `search` para termo inexistente (ex: `'inexistente_xyz'`)                          | Retorna `rows: []` e `total === 0`                                      |
| **T13** | `trackCount` de artistas do seed                                                   | `trackCount === 5` para os artistas populados pelo seed                 |
| **T14** | `findById` com UUID v4 aleatório e inexistente                                     | Retorna estritamente `null`                                             |
| **T15** | `findById` de artista com faixas                                                   | Faixas em `result.tracks` estão rigorosamente ordenadas por `title ASC` |
| **T16** | Artista sem nenhuma faixa cadastrada                                               | Artista inserido sem faixas retorna `trackCount === 0` e `tracks: []`   |

---

## 5. Procedimentos de Verificação e Definition of Done

A finalização do sprint exige a passagem bem-sucedida de todas as etapas do pipeline de qualidade e testes manuais via HTTP:

```bash
# 1. Banco de desenvolvimento e migração
docker compose up -d
pnpm db:migrate
tsx src/db/seed/seed.ts

# 2. Pipeline de Qualidade Estrita (Zero erros tolerados)
pnpm typecheck
pnpm lint
pnpm format
pnpm test
pnpm build

# 3. Testes Funcionais Manuais com a aplicação ativa (pnpm dev)
curl -s 'http://localhost:3333/api/v1/artists?limit=3' | jq
curl -s 'http://localhost:3333/api/v1/artists?search=Midnight' | jq '.meta'
curl -s 'http://localhost:3333/api/v1/artists/<uuid-do-seed>' | jq '.tracks | length'
curl -s -o /dev/null -w '%{http_code}\n' 'http://localhost:3333/api/v1/artists/nao-e-uuid'       # Esperado: 400
curl -s -o /dev/null -w '%{http_code}\n' 'http://localhost:3333/api/v1/artists/00000000-0000-0000-0000-000000000000' # Esperado: 404
```

### Checklist de Conclusão:

- [ ] Testes unitários T1–T8 implementados e verdes em `tests/unit/modules/artists/artists.service.test.ts`.
- [ ] Testes de integração T9–T16 implementados e verdes em `tests/integration/modules/artists.repository.test.ts`.
- [ ] Swagger UI (`/docs`) e `/docs/json` exibem as rotas `/api/v1/artists` e `/api/v1/artists/{id}` sob a tag `Catalog`.
- [ ] Verificação de lint de arquitetura (`boundaries/element-types`) passa sem nenhuma exceção — `artists.routes.ts` não importa `src/db`.
- [ ] `artists.service.ts` não possui nenhum import de `fastify`.
- [ ] Serialização do Zod poda e previne qualquer chave residual de banco nas respostas.
- [ ] Atualização de `.agents/memory/PROGRESS.md` e `.agents/memory/F2-S03.md`.
- [ ] Criação de branch `feature/f2s03-modulo-artists`, commit padronizado e abertura de PR via `gh pr create`.
