import { z } from 'zod';
import { DEFAULT_PAGE, DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE } from '../../shared/utils/pagination.js';

export const GENRES = ['rock', 'pop', 'electronic', 'hip-hop', 'jazz', 'lo-fi'] as const;
export type Genre = (typeof GENRES)[number];

// --- Entrada: Query e Params ---

export const listFavoritesQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(DEFAULT_PAGE).describe('Número da página (>= 1)'),
  limit: z.coerce
    .number()
    .int()
    .min(1)
    .max(MAX_PAGE_SIZE)
    .default(DEFAULT_PAGE_SIZE)
    .describe('Quantidade de itens por página (1..100)'),
});

export const favoriteTrackParamsSchema = z.object({
  trackId: z.uuid().describe('Identificador único da faixa musical (UUID v4)'),
});

// --- Saída: Representações e Envelopes ---

export const artistSummarySchema = z.object({
  id: z.uuid().describe('Identificador único do artista (UUID v4)'),
  name: z.string().describe('Nome do artista'),
  avatarUrl: z.string().nullable().describe('URL do avatar do artista ou null'),
});

export const favoriteItemSchema = z.object({
  id: z.uuid().describe('Identificador único da faixa (UUID v4)'),
  title: z.string().describe('Título da faixa musical'),
  album: z.string().nullable().describe('Nome do álbum ou null'),
  genre: z.enum(GENRES).describe('Gênero musical da faixa'),
  durationSeconds: z.number().int().positive().describe('Duração da faixa em segundos'),
  coverUrl: z.string().nullable().describe('URL da capa da faixa ou null'),
  audioUrl: z.url().describe('URL pública direta de reprodução da faixa (SoundHelix)'),
  artist: artistSummarySchema.describe('Resumo do artista autor da faixa'),
  createdAt: z.iso.datetime().describe('Data de criação da faixa em formato ISO 8601 UTC'),
  favoritedAt: z.iso
    .datetime()
    .describe('Data em que a faixa foi favoritada em formato ISO 8601 UTC'),
});

export const paginationMetaSchema = z.object({
  page: z.number().int().min(1).describe('Página atual da listagem'),
  limit: z.number().int().min(1).describe('Limite de itens solicitados por página'),
  total: z.number().int().nonnegative().describe('Total geral de itens encontrados'),
  totalPages: z.number().int().min(1).describe('Total de páginas disponíveis'),
  hasNext: z.boolean().describe('Indica se existe uma próxima página'),
  hasPrev: z.boolean().describe('Indica se existe uma página anterior'),
});

export const listFavoritesResponseSchema = z.object({
  data: z.array(favoriteItemSchema).describe('Lista de faixas favoritadas da página solicitada'),
  meta: paginationMetaSchema.describe('Metadados de paginação da listagem'),
});

export const errorResponseSchema = z.object({
  statusCode: z.number().int().describe('Código de status HTTP'),
  error: z.string().describe('Identificador canônico do erro'),
  message: z.string().describe('Mensagem descritiva da falha'),
  details: z.unknown().nullable().describe('Detalhes adicionais ou issues de validação RFC 7807'),
});

// --- Tipos Inferidos ---
export type ListFavoritesQuery = z.infer<typeof listFavoritesQuerySchema>;
export type FavoriteTrackParams = z.infer<typeof favoriteTrackParamsSchema>;
export type ArtistSummaryDto = z.infer<typeof artistSummarySchema>;
export type FavoriteItemDto = z.infer<typeof favoriteItemSchema>;
export type PaginationMetaDto = z.infer<typeof paginationMetaSchema>;
export type ListFavoritesResponseDto = z.infer<typeof listFavoritesResponseSchema>;
export type ErrorResponseDto = z.infer<typeof errorResponseSchema>;
