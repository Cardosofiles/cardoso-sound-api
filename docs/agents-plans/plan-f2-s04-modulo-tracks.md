# Plano de Implementação — Sprint F2-S04: Módulo `tracks` com Busca e Filtros

> **Status:** 🟡 Em Planejamento (Aguardando Autorização Explícita — Etapa 3 do Protocolo)  
> **Fase:** F2 — Catálogo · **Último sprint da fase F2**  
> **Branch Alvo:** `feature/f2s04-modulo-tracks` (a partir de `develop`)  
> **Depende de:** F2-S02 (Seed do Catálogo e Testcontainers) e F2-S03 (Padrão de 4 camadas do módulo `artists`)  
> **Contratos de Entrega:** R06 (`GET /api/v1/tracks`), R07 (`GET /api/v1/tracks/:id`), R08 (`GET /api/v1/genres`)  
> **Fechamento de Fase:** Tag `v0.2.0` (Catálogo público 100% navegável e tocável)  
> **Specs de Referência:**
>
> - [`docs/specs/01-arquitetura.md`](file:///home/cardosofiles/www/typescript/back-end/development/fastify/cardoso-sound-api/docs/specs/01-arquitetura.md) (§1 — Fluxo de dependência, §7 — Padrão de módulo em 4 camadas)
> - [`docs/specs/02-modelo-de-dados.md`](file:///home/cardosofiles/www/typescript/back-end/development/fastify/cardoso-sound-api/docs/specs/02-modelo-de-dados.md) (§5 — Índices GIN `pg_trgm`, §6 — Cliente Drizzle e relações)
> - [`docs/specs/03-contrato-da-api.md`](file:///home/cardosofiles/www/typescript/back-end/development/fastify/cardoso-sound-api/docs/specs/03-contrato-da-api.md) (§1 — Convenções globais, §3 — Representação `Track` e `ArtistSummary`, §4 — Catálogo R06, R07, R08)
> - [`docs/specs/07-protocolo-dos-agentes.md`](file:///home/cardosofiles/www/typescript/back-end/development/fastify/cardoso-sound-api/docs/specs/07-protocolo-dos-agentes.md)
> - [`docs/sprints/fase-2-catalogo/F2-S04-modulo-tracks.md`](file:///home/cardosofiles/www/typescript/back-end/development/fastify/cardoso-sound-api/docs/sprints/fase-2-catalogo/F2-S04-modulo-tracks.md)
> - [`.agents/memory/DECISIONS.md`](file:///home/cardosofiles/www/typescript/back-end/development/fastify/cardoso-sound-api/.agents/memory/DECISIONS.md) (especialmente **D-01**, **D-09**, **D-10**, **D-11**, **D-12**, **D-14**, **D-16**, **D-28**, **D-36**, **D-39**)
> - [`.agents/memory/F2-S03.md`](file:///home/cardosofiles/www/typescript/back-end/development/fastify/cardoso-sound-api/.agents/memory/F2-S03.md) (padrão de referência das 4 camadas, injeção de construtor e isolamento de boundaries)

---

## 1. Contexto e Objetivos Técnicos

O sprint **F2-S04** representa o ápice da fase **F2 — Catálogo**. Trata-se do módulo central do produto sob a perspectiva de consumo do app Flutter, permitindo listar, buscar por texto em múltiplas colunas, filtrar por gênero e artista, ordenar de forma canônica e estável, e obter a agregação de gêneros que alimenta a home do aplicativo sem qualquer necessidade de autenticação prévia.

Ao término deste sprint, o catálogo musical estará completamente exposto e testado, permitindo a consolidação da release e tag `v0.2.0`.

### Objetivos Centrais:

1. **Implementar R06 (`GET /api/v1/tracks`):**
   - Listagem pública e paginada de faixas musicais com paginação canônica (`page` default 1, `limit` default 20, max 100).
   - Busca textual multifatorial case-insensitive (`ILIKE '%termo%'`) combinando `tracks.title`, `tracks.album` e `artists.name` via `OR`, com sanitização de caracteres curinga (`%`, `_`, `\`).
   - Filtro categórico estrito por `genre` (enum fechado de 6 valores: `rock`, `pop`, `electronic`, `hip-hop`, `jazz`, `lo-fi`). Rejeita valores desconhecidos com HTTP 400.
   - Filtro relacional por `artistId` (UUID v4 válido). UUID inválido emite HTTP 400; UUID válido inexistente retorna lista vazia (`data: []`, `meta.total: 0`), **nunca** 404.
   - Ordenação dinâmica estável via `sort`:
     - `recent` (default): `tracks.created_at DESC`, com desempate por `tracks.id ASC`.
     - `title`: `tracks.title ASC`, com desempate por `tracks.id ASC`.
     - `duration`: `tracks.duration_seconds ASC`, com desempate por `tracks.id ASC`.
   - Combinação de filtros via `AND` lógico.
   - `INNER JOIN` mandatória com a tabela `artists` para embutir o resumo do artista (`artist: ArtistSummary`) e permitir filtragem/busca pelo nome do artista.
   - Reutilização estrita e simétrica do mesmo `whereClause` e join entre a query de registros e a query de `COUNT(*)` para garantir consistência matemática dos metadados (`meta`).

2. **Implementar R07 (`GET /api/v1/tracks/:id`):**
   - Consulta pontual de faixa musical por UUID v4, retornando a representação completa de `Track`.
   - Formato de retorno com `artist: ArtistSummary` embutido (`id`, `name`, `avatarUrl`), omitindo completamente colunas brutas do banco (`artistId` ou `artist_id`).
   - Datas serializadas em ISO 8601 UTC string (`.toISOString()`).
   - Retorno HTTP 404 (`NotFoundError`) para faixas inexistentes e HTTP 400 automático pelo Zod para IDs que não sejam UUID v4 válidos.

3. **Implementar R08 (`GET /api/v1/genres`):**
   - Agregação do catálogo musical agrupada por gênero: `SELECT genre, COUNT(*)::int AS track_count FROM tracks GROUP BY genre ORDER BY genre ASC`.
   - **Sem paginação e sem meta**: payload direto `{ data: [{ genre: string, trackCount: number }] }`.
   - Cast explícito para `number` (`sql<number>\`count(*)::int\`.mapWith(Number)`), impedindo que o tipo `string`emitido pelo driver`pg`/`node-postgres` chegue ao DTO e cause falhas 500 no serializador Zod.

4. **Preservar a Arquitetura em 4 Camadas e Regras de Boundaries (`eslint-plugin-boundaries`):**
   - Respeitar a diretriz de que `dto` (`*.schema.ts`) importa apenas de `shared` (`src/shared/**`).
   - `TracksService` não possui nenhuma dependência ou import de Fastify (`FastifyRequest`, `FastifyReply`), garantindo 100% de testabilidade pura.
   - `TracksRepository` encapsula todas as queries SQL/Drizzle e suporta injeção de `db: Database` para os testes de integração com Testcontainers.
   - `tracksRoutes` instancia o service e delega sem blocos `try/catch`.

---

## 2. Blast Radius e Controle Estrito de Arquivos

Em observância irrestrita à seção 4 de [`docs/sprints/fase-2-catalogo/F2-S04-modulo-tracks.md`](file:///home/cardosofiles/www/typescript/back-end/development/fastify/cardoso-sound-api/docs/sprints/fase-2-catalogo/F2-S04-modulo-tracks.md):

```
Blast Radius Autorizado:
├── Preencher (atualmente com 0 bytes):
│   ├── src/modules/tracks/tracks.schema.ts
│   ├── src/modules/tracks/tracks.repository.ts
│   ├── src/modules/tracks/tracks.service.ts
│   └── src/modules/tracks/tracks.routes.ts
│
├── Criar:
│   ├── tests/unit/modules/tracks/tracks.service.test.ts
│   ├── tests/integration/modules/tracks.repository.test.ts
│   └── docs/agents-plans/plan-f2-s04-modulo-tracks.md (versão persistida deste plano)
│
└── Editar:
    ├── src/app.ts (registro de tracksRoutes sob prefixo API_PREFIX '/api/v1')
    ├── .agents/memory/PROGRESS.md
    └── .agents/memory/F2-S04.md
```

### Arquivos Estritamente Intocáveis nesta Sprint:

- `src/modules/artists/**` (já concluído e testado em F2-S03)
- `src/db/**` (schemas Drizzle, migrações e seed já finalizados)
- `src/plugins/**` (plugins de infraestrutura e borda)
- `src/config/**` e `src/shared/**`
- `eslint.config.mjs` e `tsconfig.json`

---

## 3. Especificação Detalhada das 4 Camadas

### 3.1 Camada de DTO & Schemas (`src/modules/tracks/tracks.schema.ts`)

Conforme validado em F2-S03 e ditado pelas regras de boundary do ESLint (`from: 'dto', allow: ['shared']`), o schema DTO não importa `src/config/constants.ts` para não violar as fronteiras arquiteturais. Ele importa a paginação de `src/shared/utils/pagination.js` e define localmente as constantes de domínio `GENRES` e `TRACK_SORTS`.

```typescript
import { z } from 'zod';
import { DEFAULT_PAGE, DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE } from '../../shared/utils/pagination.js';

// Domínio fechado de gêneros e ordenações suportadas
export const GENRES = ['rock', 'pop', 'electronic', 'hip-hop', 'jazz', 'lo-fi'] as const;
export type Genre = (typeof GENRES)[number];

export const TRACK_SORTS = ['recent', 'title', 'duration'] as const;
export type TrackSort = (typeof TRACK_SORTS)[number];

// --- Entrada: Query e Params ---

export const listTracksQuerySchema = z.object({
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
    .trim()
    .min(1)
    .max(100)
    .optional()
    .describe(
      'Termo de busca textual parcial em título, álbum ou nome do artista (case-insensitive)',
    ),
  genre: z
    .enum(GENRES)
    .optional()
    .describe('Filtro por gênero musical (rejeita valores fora dos 6 slugs suportados)'),
  artistId: z.uuid().optional().describe('Filtro por identificador único do artista (UUID v4)'),
  sort: z
    .enum(TRACK_SORTS)
    .default('recent')
    .describe(
      'Critério de ordenação: recent (criação DESC), title (título ASC), duration (duração ASC)',
    ),
});

export const trackParamsSchema = z.object({
  id: z.uuid().describe('Identificador único da faixa (UUID v4)'),
});

// --- Saída: Representações e Envelopes ---

export const artistSummarySchema = z.object({
  id: z.uuid().describe('Identificador único do artista (UUID v4)'),
  name: z.string().describe('Nome do artista'),
  avatarUrl: z.string().nullable().describe('URL do avatar do artista ou null'),
});

export const trackSchema = z.object({
  id: z.uuid().describe('Identificador único da faixa (UUID v4)'),
  title: z.string().describe('Título da faixa musical'),
  album: z.string().nullable().describe('Nome do álbum ou null'),
  genre: z.enum(GENRES).describe('Gênero musical da faixa'),
  durationSeconds: z.number().int().positive().describe('Duração da faixa em segundos'),
  coverUrl: z.string().nullable().describe('URL da capa da faixa ou null'),
  audioUrl: z.url().describe('URL pública direta de reprodução da faixa (SoundHelix)'),
  artist: artistSummarySchema.describe('Resumo do artista autor da faixa'),
  createdAt: z.iso.datetime().describe('Data de criação da faixa em formato ISO 8601 UTC'),
});

export const paginationMetaSchema = z.object({
  page: z.number().int().min(1).describe('Página atual da listagem'),
  limit: z.number().int().min(1).describe('Limite de itens solicitados por página'),
  total: z.number().int().nonnegative().describe('Total geral de itens encontrados'),
  totalPages: z.number().int().min(1).describe('Total de páginas disponíveis'),
  hasNext: z.boolean().describe('Indica se existe uma próxima página'),
  hasPrev: z.boolean().describe('Indica se existe uma página anterior'),
});

export const listTracksResponseSchema = z.object({
  data: z.array(trackSchema).describe('Lista de faixas da página solicitada'),
  meta: paginationMetaSchema.describe('Metadados de paginação da listagem'),
});

export const genreItemSchema = z.object({
  genre: z.string().describe('Slug do gênero musical'),
  trackCount: z
    .number()
    .int()
    .nonnegative()
    .describe('Quantidade total de faixas associadas ao gênero'),
});

export const listGenresResponseSchema = z.object({
  data: z
    .array(genreItemSchema)
    .describe('Lista agregada de gêneros do catálogo ordenada alfabeticamente'),
});

export const errorResponseSchema = z.object({
  statusCode: z.number().int().describe('Código de status HTTP'),
  error: z.string().describe('Identificador canônico do erro'),
  message: z.string().describe('Mensagem descritiva da falha'),
  details: z.unknown().nullable().describe('Detalhes adicionais ou issues de validação RFC 7807'),
});

// --- Tipos Inferidos ---
export type ListTracksQuery = z.infer<typeof listTracksQuerySchema>;
export type TrackParams = z.infer<typeof trackParamsSchema>;
export type ArtistSummaryDto = z.infer<typeof artistSummarySchema>;
export type TrackDto = z.infer<typeof trackSchema>;
export type ListTracksResponseDto = z.infer<typeof listTracksResponseSchema>;
export type GenreItemDto = z.infer<typeof genreItemSchema>;
export type ListGenresResponseDto = z.infer<typeof listGenresResponseSchema>;
export type ErrorResponseDto = z.infer<typeof errorResponseSchema>;
```

---

### 3.2 Camada de Acesso a Dados (`src/modules/tracks/tracks.repository.ts`)

Responsável exclusivo pela interação com o PostgreSQL via Drizzle ORM.

**Decisões de Design do Repositório:**

1. **Seleção Estruturada Direta:** Utilizaremos `db.select({ ..., artist: { id: artists.id, name: artists.name, avatarUrl: artists.avatarUrl } }).from(tracks).innerJoin(artists, eq(tracks.artistId, artists.id))`. O Drizzle ORM nativamente monta o objeto aninhado `artist`, eliminando a necessidade de mapeamento complexo ou joins secundários (comprovado via teste direto).
2. **Simetria de Query e Count:** A contagem `total` reutilizará **exatamente o mesmo `whereClause` e o mesmo `innerJoin(artists)`**, prevenindo erros de coluna não encontrada (`missing FROM-clause entry for table "artists"`) e garantindo consistência matemática absoluta.
3. **Ordenação Determinística com Desempate por ID:** Toda ordenação incluirá `asc(tracks.id)` como critério secundário de desempate, prevenindo flutuação de linhas entre páginas (Armadilha 1).
4. **Sanitização de Caracteres Curinga:** Caracteres `%`, `_` e `\` em `search` são escapados com `replace(/[%_\\]/g, '\\$&')`.
5. **Agregação de Gêneros:** `sql<number>\`count(*)::int\`.mapWith(Number)`garante a conversão de`bigint`para`number`.

```typescript
import { and, asc, count, desc, eq, ilike, or, sql, type SQL } from 'drizzle-orm';
import { db as defaultDb, type Database } from '../../db/client.js';
import { artists, tracks } from '../../db/schema/index.js';
import type { Genre, TrackSort } from './tracks.schema.js';

export interface TrackArtistRow {
  id: string;
  name: string;
  avatarUrl: string | null;
}

export interface TrackRow {
  id: string;
  title: string;
  album: string | null;
  genre: string;
  durationSeconds: number;
  coverUrl: string | null;
  audioUrl: string;
  createdAt: Date;
  artist: TrackArtistRow;
}

export interface GenreCountRow {
  genre: string;
  trackCount: number;
}

export class TracksRepository {
  constructor(private readonly db: Database = defaultDb) {}

  async list(input: {
    limit: number;
    offset: number;
    search?: string;
    genre?: Genre;
    artistId?: string;
    sort: TrackSort;
  }): Promise<{ rows: TrackRow[]; total: number }> {
    const conditions: SQL[] = [];

    if (input.genre) {
      conditions.push(eq(tracks.genre, input.genre));
    }

    if (input.artistId) {
      conditions.push(eq(tracks.artistId, input.artistId));
    }

    if (input.search && input.search.trim().length > 0) {
      const sanitized = input.search.trim().replace(/[%_\\]/g, '\\$&');
      const term = `%${sanitized}%`;
      conditions.push(
        or(ilike(tracks.title, term), ilike(tracks.album, term), ilike(artists.name, term))!,
      );
    }

    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

    let orderByClause: SQL[];
    switch (input.sort) {
      case 'title':
        orderByClause = [asc(tracks.title), asc(tracks.id)];
        break;
      case 'duration':
        orderByClause = [asc(tracks.durationSeconds), asc(tracks.id)];
        break;
      case 'recent':
      default:
        orderByClause = [desc(tracks.createdAt), asc(tracks.id)];
        break;
    }

    // Query 1: Registros da página com join em artists
    const rowsPromise = this.db
      .select({
        id: tracks.id,
        title: tracks.title,
        album: tracks.album,
        genre: tracks.genre,
        durationSeconds: tracks.durationSeconds,
        coverUrl: tracks.coverUrl,
        audioUrl: tracks.audioUrl,
        createdAt: tracks.createdAt,
        artist: {
          id: artists.id,
          name: artists.name,
          avatarUrl: artists.avatarUrl,
        },
      })
      .from(tracks)
      .innerJoin(artists, eq(tracks.artistId, artists.id))
      .where(whereClause)
      .orderBy(...orderByClause)
      .limit(input.limit)
      .offset(input.offset);

    // Query 2: Contagem total com o mesmo join e where
    const countPromise = this.db
      .select({ value: count() })
      .from(tracks)
      .innerJoin(artists, eq(tracks.artistId, artists.id))
      .where(whereClause);

    const [rows, [countResult]] = await Promise.all([rowsPromise, countPromise]);
    const total = countResult?.value ?? 0;

    return { rows, total };
  }

  async findById(id: string): Promise<TrackRow | null> {
    const [row] = await this.db
      .select({
        id: tracks.id,
        title: tracks.title,
        album: tracks.album,
        genre: tracks.genre,
        durationSeconds: tracks.durationSeconds,
        coverUrl: tracks.coverUrl,
        audioUrl: tracks.audioUrl,
        createdAt: tracks.createdAt,
        artist: {
          id: artists.id,
          name: artists.name,
          avatarUrl: artists.avatarUrl,
        },
      })
      .from(tracks)
      .innerJoin(artists, eq(tracks.artistId, artists.id))
      .where(eq(tracks.id, id))
      .limit(1);

    return row ?? null;
  }

  async listGenres(): Promise<GenreCountRow[]> {
    const rows = await this.db
      .select({
        genre: tracks.genre,
        trackCount: sql<number>`count(*)::int`.mapWith(Number),
      })
      .from(tracks)
      .groupBy(tracks.genre)
      .orderBy(asc(tracks.genre));

    return rows;
  }
}
```

---

### 3.3 Camada de Serviços de Negócio (`src/modules/tracks/tracks.service.ts`)

Regras de negócio de domínio:

- Injeção por construtor (`repo: TracksRepository = new TracksRepository()`).
- Zero dependências de transporte Fastify.
- Conversão de `Date` para ISO 8601 UTC string (`.toISOString()`).
- Lança `NotFoundError('Track not found')` se `findById` retornar `null`.
- Garante ausência total de chaves brutas de banco (`artistId` ou `artist_id` na raiz da resposta).

```typescript
import { NotFoundError } from '../../shared/errors/index.js';
import {
  buildPaginationMeta,
  toOffset,
  type PaginationMeta,
} from '../../shared/utils/pagination.js';
import { TracksRepository } from './tracks.repository.js';
import type { Genre, GenreItemDto, ListTracksQuery, TrackDto } from './tracks.schema.js';

export class TracksService {
  constructor(private readonly repo: TracksRepository = new TracksRepository()) {}

  async list(query: ListTracksQuery): Promise<{ data: TrackDto[]; meta: PaginationMeta }> {
    const offset = toOffset({ page: query.page, limit: query.limit });

    const { rows, total } = await this.repo.list({
      limit: query.limit,
      offset,
      search: query.search,
      genre: query.genre,
      artistId: query.artistId,
      sort: query.sort,
    });

    const meta = buildPaginationMeta({
      page: query.page,
      limit: query.limit,
      total,
    });

    const data: TrackDto[] = rows.map((row) => ({
      id: row.id,
      title: row.title,
      album: row.album ?? null,
      genre: row.genre as Genre,
      durationSeconds: row.durationSeconds,
      coverUrl: row.coverUrl ?? null,
      audioUrl: row.audioUrl,
      artist: {
        id: row.artist.id,
        name: row.artist.name,
        avatarUrl: row.artist.avatarUrl ?? null,
      },
      createdAt: row.createdAt.toISOString(),
    }));

    return { data, meta };
  }

  async getById(id: string): Promise<TrackDto> {
    const row = await this.repo.findById(id);

    if (!row) {
      throw new NotFoundError('Track not found');
    }

    return {
      id: row.id,
      title: row.title,
      album: row.album ?? null,
      genre: row.genre as Genre,
      durationSeconds: row.durationSeconds,
      coverUrl: row.coverUrl ?? null,
      audioUrl: row.audioUrl,
      artist: {
        id: row.artist.id,
        name: row.artist.name,
        avatarUrl: row.artist.avatarUrl ?? null,
      },
      createdAt: row.createdAt.toISOString(),
    };
  }

  async listGenres(): Promise<GenreItemDto[]> {
    const rows = await this.repo.listGenres();
    return rows.map((row) => ({
      genre: row.genre,
      trackCount: row.trackCount,
    }));
  }
}
```

---

### 3.4 Camada de Rotas (`src/modules/tracks/tracks.routes.ts`)

Plugin `FastifyPluginAsyncZod` registrando as 3 rotas relativas sem prefixo (`/tracks`, `/tracks/:id`, `/genres`):

```typescript
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import {
  errorResponseSchema,
  listGenresResponseSchema,
  listTracksQuerySchema,
  listTracksResponseSchema,
  trackParamsSchema,
  trackSchema,
} from './tracks.schema.js';
import { TracksService } from './tracks.service.js';

export interface TracksRoutesOptions {
  service?: TracksService;
}

export const tracksRoutes: FastifyPluginAsyncZod<TracksRoutesOptions> = async (fastify, opts) => {
  await Promise.resolve();

  const service = opts.service ?? new TracksService();

  // R06: Listagem paginada de faixas com busca e filtros
  fastify.get(
    '/tracks',
    {
      schema: {
        tags: ['Catalog'],
        summary: 'Lista faixas do catálogo com busca e filtros',
        description:
          'Retorna uma lista paginada de faixas musicais, com suporte a busca textual, filtro por gênero, artista e ordenação.',
        operationId: 'listTracks',
        querystring: listTracksQuerySchema,
        response: {
          200: listTracksResponseSchema,
          400: errorResponseSchema,
        },
      },
    },
    async (request) => {
      return service.list(request.query);
    },
  );

  // R07: Consulta de faixa por UUID
  fastify.get(
    '/tracks/:id',
    {
      schema: {
        tags: ['Catalog'],
        summary: 'Obtém detalhes de uma faixa',
        description: 'Retorna as informações completas de uma faixa do catálogo musical por UUID.',
        operationId: 'getTrackById',
        params: trackParamsSchema,
        response: {
          200: trackSchema,
          400: errorResponseSchema,
          404: errorResponseSchema,
        },
      },
    },
    async (request) => {
      return service.getById(request.params.id);
    },
  );

  // R08: Lista de gêneros com contagem de faixas
  fastify.get(
    '/genres',
    {
      schema: {
        tags: ['Catalog'],
        summary: 'Lista gêneros musicais com contagem de faixas',
        description:
          'Retorna a lista completa de gêneros musicais cadastrados e o total de faixas associadas a cada um.',
        operationId: 'listGenres',
        response: {
          200: listGenresResponseSchema,
        },
      },
    },
    async () => {
      const data = await service.listGenres();
      return { data };
    },
  );
};
```

---

### 3.5 Registro de Rotas no App Factory (`src/app.ts`)

Em `src/app.ts`, importamos e registramos `tracksRoutes`:

```typescript
import { tracksRoutes } from './modules/tracks/tracks.routes.js';

// ...
// 5. Rotas de catálogo e domínio (/api/v1)
await app.register(artistsRoutes, { prefix: API_PREFIX });
await app.register(tracksRoutes, { prefix: API_PREFIX });
```

Com isso, o Fastify disponibiliza:

- `GET /api/v1/tracks`
- `GET /api/v1/tracks/:id`
- `GET /api/v1/genres`

---

## 4. Análise de Índices GIN e EXPLAIN ANALYZE

Foi realizada inspeção prévia no banco de dados local:

1. **Confirmação dos Índices GIN:**
   - `tracks_title_trgm_idx` ON `tracks` USING `gin (title gin_trgm_ops)`
   - `tracks_album_trgm_idx` ON `tracks` USING `gin (album gin_trgm_ops)`
   - `artists_name_trgm_idx` ON `artists` USING `gin (name gin_trgm_ops)`
2. **Comportamento do PostgreSQL Query Planner:**
   - Em catálogos com 40 registros (dados do seed), o otimizador do PostgreSQL escolhe com precisão o `Seq Scan` em vez de acessar páginas de índice GIN, pois o custo de I/O sequencial em uma única página é inferior ao custo de abrir o índice:
     ```
     Seq Scan on tracks (cost=0.00..10.38 rows=1 width=2206) (actual time=0.055..0.056 rows=0 loops=1)
       Filter: ((title)::text ~~* '%love%'::text)
     ```
   - Ao instruir `SET enable_seqscan = OFF;`, o planejador utiliza imediatamente o índice GIN `Bitmap Index Scan on tracks_title_trgm_idx`:
     ```
     Bitmap Heap Scan on tracks (cost=21.48..25.49 rows=1 width=2206) (actual time=0.156..0.156 rows=0 loops=1)
       Recheck Cond: ((title)::text ~~* '%love%'::text)
       ->  Bitmap Index Scan on tracks_title_trgm_idx (cost=0.00..21.48 rows=1 width=0)
     ```
   - Este comportamento é **completamente normal, desejado e ótimo**. O índice está devidamente operacional e será registrado na memória `F2-S04.md`.

---

## 5. Matriz Completa de Testes Automatizados

### 5.1 Testes Unitários (`tests/unit/modules/tracks/tracks.service.test.ts`)

Testes isolados com dublê em memória (`createMockRepository` com `vi.fn()`):

| ID  | Caso de Teste                                    | Cenário / Entradas                                              | Asserções Esperadas                                                                                                                        |
| --- | ------------------------------------------------ | --------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| T1  | `list` monta `meta` de paginação corretamente    | `page: 1, limit: 20`, mock devolve 20 itens e `total: 40`       | `meta.totalPages === 2`, `meta.hasNext === true`, `meta.hasPrev === false`, `meta.page === 1`, `meta.limit === 20`, `meta.total === 40`    |
| T2  | `sort` padrão quando omitido                     | `page: 1, limit: 20` (sem `sort`)                               | Repositório chamado com `sort: 'recent'`                                                                                                   |
| T3  | `genre` repassado fielmente                      | `query: { page: 1, limit: 20, genre: 'rock' }`                  | Repositório chamado com `genre: 'rock'`                                                                                                    |
| T4  | `artistId` repassado fielmente                   | `query: { page: 1, limit: 20, artistId: 'uuid-valido' }`        | Repositório chamado com `artistId: 'uuid-valido'`                                                                                          |
| T5  | `getById` para registro inexistente              | Repositório devolve `null`                                      | Lança `NotFoundError` com mensagem `'Track not found'`                                                                                     |
| T6  | DTO embute `artist` e oculta chaves brutas de FK | Repositório devolve linha com `artist: { id, name, avatarUrl }` | `artist.id` e `artist.name` presentes; `artistId` e `artist_id` **estritamente ausentes** de todo o objeto (verificação via `Object.keys`) |
| T7  | `listGenres` repassa e devolve formato correto   | Repositório devolve `[{ genre: 'electronic', trackCount: 7 }]`  | Retorna array com `{ genre: 'electronic', trackCount: 7 }`, com `trackCount` numérico                                                      |

### 5.2 Testes de Integração (`tests/integration/modules/tracks.repository.test.ts`)

Testes reais contra PostgreSQL efêmero via Testcontainers e banco populado com o seed (8 artistas, 40 faixas, 6 gêneros):

| ID  | Caso de Teste                                   | Condições de Consulta                                      | Resultado Esperado                                                                               |
| --- | ----------------------------------------------- | ---------------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| T8  | `list` sem filtro após seed                     | `limit: 20, offset: 0`                                     | `total === 40`, `rows.length === 20`                                                             |
| T9  | Paginação de segunda página                     | `limit: 20, offset: 20`                                    | `rows.length === 20`, nenhum ID da página 2 colide com a página 1                                |
| T10 | Filtro por gênero `genre: 'rock'`               | `genre: 'rock', limit: 100, offset: 0`                     | Apenas faixas com `genre === 'rock'`, `total === 8` (conforme seed)                              |
| T11 | Combinação `genre` + `search`                   | `genre: 'rock', search: 'Midnight', limit: 20`             | Avalia com `AND` lógico; retorna apenas faixas que satisfazem ambos os critérios                 |
| T12 | Busca por trecho do título (minúsculo)          | `search: 'overdrive'`                                      | Casa `Midnight Overdrive` via `ILIKE` case-insensitive                                           |
| T13 | Busca por **nome do artista**                   | `search: 'Aurora Avenue'`                                  | Retorna as 5 faixas pertencentes a esse artista via join em `artists`                            |
| T14 | Busca por trecho do **álbum**                   | `search: 'Starlight Reverie'`                              | Retorna as faixas associadas ao álbum                                                            |
| T15 | Busca sem correspondência                       | `search: 'inexistente-xyz-123'`                            | `rows: []`, `total === 0`                                                                        |
| T16 | Filtro por `artistId` inexistente (UUID válido) | `artistId: randomUUID()`                                   | `rows: []`, `total === 0` (não lança erro)                                                       |
| T17 | Ordenação `sort: 'title'`                       | `sort: 'title', limit: 40`                                 | Lista estritamente ordenada por ordem alfabética de título (`title ASC`)                         |
| T18 | Ordenação `sort: 'duration'`                    | `sort: 'duration', limit: 40`                              | Lista ordenada por ordem crescente de duração (`durationSeconds ASC`)                            |
| T19 | Particionamento completo das 40 faixas          | Página 1 (offset 0) e Página 2 (offset 20) com `limit: 20` | União dos conjuntos de IDs das duas páginas resulta em exatamente 40 IDs distintos               |
| T20 | `findById` com ID inexistente                   | UUID v4 randômico                                          | Retorna `null`                                                                                   |
| T21 | `findById` traz `artist` aninhado               | ID de faixa existente do seed                              | Registro retornado contém `artist` completo (`id`, `name`, `avatarUrl`)                          |
| T22 | `listGenres` agregação do catálogo              | Chamada a `repo.listGenres()`                              | Exatamente 6 gêneros, cada um com `trackCount >= 5`, `trackCount` numérico, ordem alfabética ASC |
| T23 | Sanitização de caracteres curinga               | `search: '%'` e `search: '_'`                              | Não quebra query nem retorna catálogo inteiro; retorna `total === 0`                             |

---

## 6. Procedimento de Execução e Validação Passo a Passo

### Passo 1: Criação da Branch do Git Flow

```bash
git checkout develop
git pull origin develop
git checkout -b feature/f2s04-modulo-tracks
```

### Passo 2: Implementação do Blast Radius

1. Preencher `src/modules/tracks/tracks.schema.ts`
2. Preencher `src/modules/tracks/tracks.repository.ts`
3. Preencher `src/modules/tracks/tracks.service.ts`
4. Preencher `src/modules/tracks/tracks.routes.ts`
5. Registrar `tracksRoutes` em `src/app.ts`

### Passo 3: Implementação dos Testes

1. Criar `tests/unit/modules/tracks/tracks.service.test.ts` (T1–T7)
2. Criar `tests/integration/modules/tracks.repository.test.ts` (T8–T23)

### Passo 4: Validação do Portão de Qualidade

Execução sequencial sem tolerância a falhas:

```bash
pnpm typecheck
pnpm lint
pnpm format
pnpm test
pnpm build
```

### Passo 5: Validação Manual dos Contratos HTTP (Definition of Done)

```bash
docker compose up -d && pnpm db:migrate && tsx src/db/seed/seed.ts
pnpm dev
# Em outro terminal:
curl -s 'localhost:3333/api/v1/tracks?limit=2' | jq '.data[0], .meta'
curl -s 'localhost:3333/api/v1/tracks?genre=rock&limit=100' | jq '.meta.total'
curl -s 'localhost:3333/api/v1/tracks?search=lo' | jq '.meta.total'
curl -s 'localhost:3333/api/v1/tracks?sort=duration&limit=3' | jq '.data[].durationSeconds'
curl -s localhost:3333/api/v1/genres | jq
curl -s -o /dev/null -w '%{http_code}\n' 'localhost:3333/api/v1/tracks?genre=funk'   # 400
curl -s -o /dev/null -w '%{http_code}\n' 'localhost:3333/api/v1/tracks?limit=101'    # 400
```

### Passo 6: Atualização de Memória e Fechamento

1. Atualizar `.agents/memory/PROGRESS.md` marcando F2-S04 como concluído e registrando tag `v0.2.0`.
2. Registrar `.agents/memory/F2-S04.md` contendo decisões técnicas de join, filtros, `EXPLAIN ANALYZE` e armadilhas superadas.
3. Commit dos arquivos, push da branch `feature/f2s04-modulo-tracks` e abertura do PR para `develop`.
4. Aguardar CI verde com `gh run watch --exit-status`.

---

## 7. Armadilhas Mapeadas e Mitigações

| #   | Armadilha Potencial                                    | Risco                                                                              | Mitigação Aplicada no Plano                                                                                           |
| --- | ------------------------------------------------------ | ---------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| 1   | **Paginação instável sem desempate**                   | Itens pulados ou repetidos entre as páginas 1 e 2                                  | Todo `orderBy` inclui `asc(tracks.id)` como critério estável de desempate.                                            |
| 2   | **`COUNT(*)` retornando string do Postgres**           | Falha de tipo no runtime Zod resultando em HTTP 500 em vez de 200                  | Uso explícito de `sql<number>\`count(*)::int\`.mapWith(Number)` e cast defensivo no repositório.                      |
| 3   | **`or(...)` do Drizzle com lista vazia**               | `undefined` ou quebra de SQL                                                       | Condição `search` só é adicionada se o termo existir e for não-vazio; `or(...)` só é acionado com expressões válidas. |
| 4   | **Divergência entre Query de Dados e Contagem**        | `meta.total` diferente da contagem real dos registros filtrados                    | Ambas as queries utilizam exatamente a mesma instância de `whereClause` e o mesmo `innerJoin(artists)`.               |
| 5   | **Vazamento de `artist_id` ou `artistId` cru**         | Violação da spec 03 §3 e exposição de dados relacionais desnecessários ao frontend | O Service projeta estritamente `{ artist: { id, name, avatarUrl } }` e o serializador Zod poda qualquer campo extra.  |
| 6   | **Violação de Boundaries no Lint (`dto` -> `config`)** | Quebra no `pnpm lint` pela regra `boundaries/element-types`                        | `tracks.schema.ts` define `GENRES` e `TRACK_SORTS` localmente e importa paginação apenas de `src/shared/utils/`.      |
| 7   | **Injeção ou distorção por caracteres curinga**        | Busca por `%` ou `_` casando todos os registros                                    | Sanitização com `term.replace(/[%_\\]/g, '\\$&')`.                                                                    |

---

## 8. Protocolo de Autorização ⏸

> Em estrito cumprimento à **Etapa 3 do Protocolo de Sessão dos Agentes** ([`docs/specs/07-protocolo-dos-agentes.md`](file:///home/cardosofiles/www/typescript/back-end/development/fastify/cardoso-sound-api/docs/specs/07-protocolo-dos-agentes.md)), o planejamento completo da sprint F2-S04 está finalizado.
>
> **Nenhum arquivo de código foi alterado.**
>
> **Aguardando sua autorização explícita para iniciar a implementação da Etapa 4.**
