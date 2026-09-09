import type { FastifyInstance } from 'fastify';
import { randomUUID } from 'node:crypto';
import { clearOutbox, outbox } from '../../../src/shared/email/mailer.js';

export interface SignUpAndGetTokenResult {
  token: string;
  userId: string;
  cookie: string;
  email: string;
}

/**
 * Cria e autentica um usuário de teste único em 4 passos offline (F5-S03 / D-51):
 * 1. POST /api/auth/sign-up/email (cadastro, limpa outbox antes)
 * 2. Ler outbox e extrair link de confirmação do e-mail
 * 3. GET /verify-email (confirma titularidade)
 * 4. POST /api/auth/sign-in/email (emite sessão/cookie/bearer)
 *
 * A assinatura e interface de retorno são estritamente preservadas para evitar quebrar
 * os testes E2E e de integração que consomem este helper.
 */
export async function signUpAndGetToken(
  app: FastifyInstance,
  email?: string,
): Promise<SignUpAndGetTokenResult> {
  // Limpa o outbox antes do cadastro para garantir isolamento sob --sequence.shuffle
  clearOutbox();

  const userEmail = email ?? `test-${randomUUID().slice(0, 8)}@example.com`;
  const password = 'StrongP@ssw0rd!2026#F5S03';

  // 1. POST /api/auth/sign-up/email
  const signUpRes = await app.inject({
    method: 'POST',
    url: '/api/auth/sign-up/email',
    headers: { 'content-type': 'application/json' },
    payload: {
      name: 'E2E Test User',
      email: userEmail,
      password,
    },
  });

  if (signUpRes.statusCode !== 200) {
    throw new Error(
      `Falha no cadastro (passo 1 de signUpAndGetToken): HTTP ${String(signUpRes.statusCode)} - ${signUpRes.body}`,
    );
  }

  // 2. Ler outbox e extrair href do último e-mail
  const lastEmail = outbox[outbox.length - 1];
  if (!lastEmail) {
    throw new Error('Nenhum e-mail de verificação encontrado no outbox após o cadastro');
  }

  const urlMatch = /href="([^"]+)"/.exec(lastEmail.html);
  if (!urlMatch?.[1]) {
    throw new Error(`Não foi possível extrair a URL de verificação do HTML: ${lastEmail.html}`);
  }

  const rawUrl = urlMatch[1].replace(/&amp;/g, '&');
  const verifyUrl = new URL(rawUrl);
  const verifyPath = `${verifyUrl.pathname}${verifyUrl.search}`;

  // 3. GET /verify-email
  const verifyRes = await app.inject({
    method: 'GET',
    url: verifyPath,
  });

  if (verifyRes.statusCode >= 400) {
    throw new Error(
      `Falha na confirmação de e-mail (passo 3 de signUpAndGetToken): HTTP ${String(verifyRes.statusCode)} - ${verifyRes.body}`,
    );
  }

  // 4. POST /api/auth/sign-in/email
  const signInRes = await app.inject({
    method: 'POST',
    url: '/api/auth/sign-in/email',
    headers: { 'content-type': 'application/json' },
    payload: {
      email: userEmail,
      password,
    },
  });

  if (signInRes.statusCode !== 200) {
    throw new Error(
      `Falha no sign-in após confirmação (passo 4 de signUpAndGetToken): HTTP ${String(signInRes.statusCode)} - ${signInRes.body}`,
    );
  }

  const tokenHeader = signInRes.headers['set-auth-token'];
  const token =
    typeof tokenHeader === 'string'
      ? tokenHeader
      : (signInRes.json<{ token?: string }>().token ?? '');

  const payload = signInRes.json<{ user: { id: string } }>();
  const userId = payload.user.id;

  if (!token || !userId) {
    throw new Error(
      'signUpAndGetToken não conseguiu extrair token ou userId da resposta de sign-in do Better Auth',
    );
  }

  const raw = signInRes.headers['set-cookie'];
  const cookie = (Array.isArray(raw) ? raw : [raw])
    .filter((c): c is string => typeof c === 'string')
    .map((c) => c.split(';')[0])
    .join('; ');

  return { token, userId, cookie, email: userEmail };
}
