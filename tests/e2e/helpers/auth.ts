import type { FastifyInstance } from 'fastify';
import { randomUUID } from 'node:crypto';

export interface SignUpAndGetTokenResult {
  token: string;
  userId: string;
}

/**
 * Cria um usuário de teste único via POST /api/auth/sign-up/email e extrai o Bearer token.
 * Utilizado para viabilizar testes E2E e de integração em rotas autenticadas.
 */
export async function signUpAndGetToken(
  app: FastifyInstance,
  email?: string,
): Promise<SignUpAndGetTokenResult> {
  const userEmail = email ?? `test-${randomUUID().slice(0, 8)}@example.com`;
  const password = 'Password123!';

  const res = await app.inject({
    method: 'POST',
    url: '/api/auth/sign-up/email',
    headers: { 'content-type': 'application/json' },
    payload: {
      name: 'E2E Test User',
      email: userEmail,
      password,
    },
  });

  if (res.statusCode !== 200) {
    throw new Error(
      `Falha ao criar usuário de teste no signUpAndGetToken: HTTP ${String(res.statusCode)} - ${res.body}`,
    );
  }

  const tokenHeader = res.headers['set-auth-token'];
  const token =
    typeof tokenHeader === 'string' ? tokenHeader : (res.json<{ token?: string }>().token ?? '');

  const payload = res.json<{ user: { id: string } }>();
  const userId = payload.user.id;

  if (!token || !userId) {
    throw new Error(
      'signUpAndGetToken não conseguiu extrair token ou userId da resposta do Better Auth',
    );
  }

  return { token, userId };
}
