import { z } from 'zod';
import { DEFAULT_PAGE, DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE } from '../../shared/utils/pagination.js';

const GENRES = ['rock', 'pop', 'electronic', 'hip-hop', 'jazz', 'lo-fi'] as const;

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
    .trim()
    .min(1)
    .max(100)
    .optional()
    .describe('Termo para busca textual no nome do artista (case-insensitive)'),
});

export const artistParamsSchema = z.object({
  id: z.uuid().describe('Identificador único do artista (UUID v4)'),
});

// --- Saída: Representações e Envelopes ---

export const artistSummarySchema = z.object({
  id: z.uuid().describe('Identificador único do artista (UUID v4)'),
  name: z.string().describe('Nome do artista'),
  avatarUrl: z.string().nullable().describe('URL do avatar do artista ou null'),
});

export const artistTrackSchema = z.object({
  id: z.uuid().describe('Identificador único da faixa (UUID v4)'),
  title: z.string().describe('Título da faixa'),
  album: z.string().nullable().describe('Nome do álbum da faixa ou null'),
  genre: z.enum(GENRES).describe('Gênero musical da faixa'),
  durationSeconds: z.number().int().positive().describe('Duração da faixa em segundos'),
  coverUrl: z.string().nullable().describe('URL da capa da faixa ou null'),
  audioUrl: z.url().describe('URL pública de reprodução da faixa'),
  artist: artistSummarySchema.describe('Resumo do artista autor da faixa'),
  createdAt: z.iso.datetime().describe('Data de criação da faixa em formato ISO 8601 UTC'),
});

export const artistSchema = z.object({
  id: z.uuid().describe('Identificador único do artista (UUID v4)'),
  name: z.string().describe('Nome do artista'),
  bio: z.string().nullable().describe('Biografia resumida do artista ou null'),
  avatarUrl: z.string().nullable().describe('URL do avatar do artista ou null'),
  trackCount: z
    .number()
    .int()
    .nonnegative()
    .describe('Quantidade total de faixas do artista no catálogo'),
  createdAt: z.iso.datetime().describe('Data de cadastro do artista em formato ISO 8601 UTC'),
});

export const artistDetailSchema = artistSchema.extend({
  tracks: z
    .array(artistTrackSchema)
    .describe('Lista de todas as faixas do artista ordenadas por título'),
});

export const paginationMetaSchema = z.object({
  page: z.number().int().min(1).describe('Página atual da listagem'),
  limit: z.number().int().min(1).describe('Limite de itens solicitados por página'),
  total: z.number().int().nonnegative().describe('Total geral de itens encontrados'),
  totalPages: z.number().int().min(1).describe('Total de páginas disponíveis'),
  hasNext: z.boolean().describe('Indica se existe uma próxima página'),
  hasPrev: z.boolean().describe('Indica se existe uma página anterior'),
});

export const listArtistsResponseSchema = z.object({
  data: z.array(artistSchema).describe('Lista de artistas da página solicitada'),
  meta: paginationMetaSchema.describe('Metadados de paginação da listagem'),
});

export const errorResponseSchema = z.object({
  statusCode: z.number().int().describe('Código de status HTTP'),
  error: z.string().describe('Identificador canônico do erro'),
  message: z.string().describe('Mensagem descritiva da falha'),
  details: z.unknown().nullable().describe('Detalhes adicionais ou issues de validação RFC 7807'),
});

// --- Tipos Inferidos ---
export type ListArtistsQuery = z.infer<typeof listArtistsQuerySchema>;
export type ArtistParams = z.infer<typeof artistParamsSchema>;
export type ArtistSummaryDto = z.infer<typeof artistSummarySchema>;
export type ArtistTrackDto = z.infer<typeof artistTrackSchema>;
export type ArtistDto = z.infer<typeof artistSchema>;
export type ArtistDetailDto = z.infer<typeof artistDetailSchema>;
export type ListArtistsResponseDto = z.infer<typeof listArtistsResponseSchema>;
export type ErrorResponseDto = z.infer<typeof errorResponseSchema>;
