import { z } from 'zod';
import { DEFAULT_PAGE, DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE } from '../../shared/utils/pagination.js';

export const GENRES = ['rock', 'pop', 'electronic', 'hip-hop', 'jazz', 'lo-fi'] as const;
export type Genre = (typeof GENRES)[number];

// --- Entrada: Query, Params e Body ---

export const listPlaylistsQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(DEFAULT_PAGE).describe('Número da página (>= 1)'),
  limit: z.coerce
    .number()
    .int()
    .min(1)
    .max(MAX_PAGE_SIZE)
    .default(DEFAULT_PAGE_SIZE)
    .describe('Quantidade de itens por página (1..100)'),
});

export const playlistParamsSchema = z.object({
  id: z.uuid().describe('Identificador único da playlist (UUID v4)'),
});

export const playlistTrackParamsSchema = z.object({
  id: z.uuid().describe('Identificador único da playlist (UUID v4)'),
  trackId: z.uuid().describe('Identificador único da faixa musical (UUID v4)'),
});

export const createPlaylistBodySchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, 'Name must contain at least 1 character')
    .max(120, 'Name must not exceed 120 characters')
    .describe('Nome da playlist (1..120 caracteres)'),
  description: z
    .string()
    .trim()
    .max(500, 'Description must not exceed 500 characters')
    .nullable()
    .optional()
    .describe('Descrição opcional da playlist (máximo 500 caracteres)'),
});

export const updatePlaylistBodySchema = z
  .object({
    name: z
      .string()
      .trim()
      .min(1, 'Name must contain at least 1 character')
      .max(120, 'Name must not exceed 120 characters')
      .optional()
      .describe('Nome da playlist (1..120 caracteres)'),
    description: z
      .string()
      .trim()
      .max(500, 'Description must not exceed 500 characters')
      .nullable()
      .optional()
      .describe('Descrição da playlist ou null para remover descrição existente'),
  })
  .refine((data) => data.name !== undefined || data.description !== undefined, {
    message: 'At least one field must be provided',
  });

export const addTrackToPlaylistBodySchema = z.object({
  trackId: z.uuid().describe('Identificador único da faixa musical a ser adicionada (UUID v4)'),
});

// --- Saída: Representações e Envelopes ---

export const artistSummarySchema = z.object({
  id: z.uuid().describe('Identificador único do artista (UUID v4)'),
  name: z.string().describe('Nome do artista'),
  avatarUrl: z.string().nullable().describe('URL do avatar do artista ou null'),
});

export const playlistTrackItemSchema = z.object({
  id: z.uuid().describe('Identificador único da faixa (UUID v4)'),
  title: z.string().describe('Título da faixa musical'),
  album: z.string().nullable().describe('Nome do álbum ou null'),
  genre: z.enum(GENRES).describe('Gênero musical da faixa'),
  durationSeconds: z.number().int().positive().describe('Duração da faixa em segundos'),
  coverUrl: z.string().nullable().describe('URL da capa da faixa ou null'),
  audioUrl: z.url().describe('URL pública direta de reprodução da faixa (SoundHelix)'),
  artist: artistSummarySchema.describe('Resumo do artista autor da faixa'),
  createdAt: z.iso.datetime().describe('Data de criação da faixa em formato ISO 8601 UTC'),
  addedAt: z.iso
    .datetime()
    .describe('Data em que a faixa foi adicionada à playlist em formato ISO 8601 UTC'),
});

export const playlistSchema = z.object({
  id: z.uuid().describe('Identificador único da playlist (UUID v4)'),
  name: z.string().describe('Nome da playlist'),
  description: z.string().nullable().describe('Descrição da playlist ou null'),
  trackCount: z.number().int().nonnegative().describe('Quantidade de faixas na playlist'),
  createdAt: z.iso.datetime().describe('Data de criação da playlist em formato ISO 8601 UTC'),
  updatedAt: z.iso
    .datetime()
    .describe('Data da última atualização da playlist em formato ISO 8601 UTC'),
});

export const playlistDetailSchema = playlistSchema.extend({
  tracks: z
    .array(playlistTrackItemSchema)
    .describe('Lista de faixas pertencentes à playlist ordenadas por addedAt ASC'),
});

export const paginationMetaSchema = z.object({
  page: z.number().int().min(1).describe('Página atual da listagem'),
  limit: z.number().int().min(1).describe('Limite de itens solicitados por página'),
  total: z.number().int().nonnegative().describe('Total geral de itens encontrados'),
  totalPages: z.number().int().min(1).describe('Total de páginas disponíveis'),
  hasNext: z.boolean().describe('Indica se existe uma próxima página'),
  hasPrev: z.boolean().describe('Indica se existe uma página anterior'),
});

export const listPlaylistsResponseSchema = z.object({
  data: z.array(playlistSchema).describe('Lista de playlists da página solicitada'),
  meta: paginationMetaSchema.describe('Metadados de paginação da listagem'),
});

export const errorResponseSchema = z.object({
  statusCode: z.number().int().describe('Código de status HTTP'),
  error: z.string().describe('Identificador canônico do erro'),
  message: z.string().describe('Mensagem descritiva da falha'),
  details: z.unknown().nullable().describe('Detalhes adicionais ou issues de validação RFC 7807'),
});

// --- Tipos Inferidos ---
export type ListPlaylistsQuery = z.infer<typeof listPlaylistsQuerySchema>;
export type PlaylistParams = z.infer<typeof playlistParamsSchema>;
export type PlaylistTrackParams = z.infer<typeof playlistTrackParamsSchema>;
export type CreatePlaylistInput = z.infer<typeof createPlaylistBodySchema>;
export type UpdatePlaylistInput = z.infer<typeof updatePlaylistBodySchema>;
export type AddTrackToPlaylistInput = z.infer<typeof addTrackToPlaylistBodySchema>;
export type ArtistSummaryDto = z.infer<typeof artistSummarySchema>;
export type PlaylistTrackItemDto = z.infer<typeof playlistTrackItemSchema>;
export type PlaylistDto = z.infer<typeof playlistSchema>;
export type PlaylistDetailDto = z.infer<typeof playlistDetailSchema>;
export type PaginationMetaDto = z.infer<typeof paginationMetaSchema>;
export type ListPlaylistsResponseDto = z.infer<typeof listPlaylistsResponseSchema>;
export type ErrorResponseDto = z.infer<typeof errorResponseSchema>;
