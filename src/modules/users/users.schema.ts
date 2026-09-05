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
