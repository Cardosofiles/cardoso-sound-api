import { betterAuth } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { createAuthEndpoint, requestPasswordReset } from 'better-auth/api';
import { bearer } from 'better-auth/plugins';
import { env, isProduction, SOCIAL_PROVIDERS } from '../../config/env.js';
import { db, type Database } from '../../db/client.js';
import * as schema from '../../db/schema/index.js';
import { mailer } from '../../shared/email/mailer.js';
import { resetPasswordEmail, verificationEmail } from '../../shared/email/templates.js';

// Proxy dinâmico para garantir que mutações em db (via setPool no harness de testes)
// sejam refletidas imediatamente pelo Drizzle Adapter sem recriação de instância
const dynamicDb = new Proxy({} as Database, {
  get<K extends keyof Database>(_target: Database, prop: K): Database[K] {
    const targetDb = db;
    const value = targetDb[prop];
    if (typeof value === 'function') {
      return (value as (...args: unknown[]) => unknown).bind(targetDb) as Database[K];
    }
    return value;
  },
});

const forgetPasswordPlugin = () => ({
  id: 'forget-password-alias',
  endpoints: {
    forgetPassword: createAuthEndpoint(
      '/forget-password',
      requestPasswordReset.options,
      async (ctx) => {
        return requestPasswordReset(ctx);
      },
    ),
  },
});

const PROVIDER_CONFIG = {
  google: {
    clientId: env.GOOGLE_CLIENT_ID ?? '',
    clientSecret: env.GOOGLE_CLIENT_SECRET ?? '',
    scope: ['openid', 'email', 'profile'],
  },
  github: {
    clientId: env.GITHUB_CLIENT_ID ?? '',
    clientSecret: env.GITHUB_CLIENT_SECRET ?? '',
    scope: ['user:email'],
  },
  facebook: {
    clientId: env.FACEBOOK_CLIENT_ID ?? '',
    clientSecret: env.FACEBOOK_CLIENT_SECRET ?? '',
    scope: ['email', 'public_profile'],
  },
};

export interface CreateAuthOptions {
  overrideSocialProviders?: Parameters<typeof betterAuth>[0]['socialProviders'];
}

export function createAuth(options?: CreateAuthOptions) {
  return betterAuth({
    database: drizzleAdapter(dynamicDb, { provider: 'pg', schema }),
    secret: env.BETTER_AUTH_SECRET,
    baseURL: env.BETTER_AUTH_URL,
    basePath: '/api/auth',
    socialProviders:
      options?.overrideSocialProviders ??
      Object.fromEntries(SOCIAL_PROVIDERS.map((provider) => [provider, PROVIDER_CONFIG[provider]])),
    account: {
      accountLinking: {
        enabled: true,
        trustedProviders: ['google', 'github'],
      },
    },
    emailAndPassword: {
      enabled: true,
      minPasswordLength: 8,
      autoSignIn: true,
      requireEmailVerification: false,
      resetPasswordTokenExpiresIn: 60 * 60, // 1 hora
      sendResetPassword: async ({ user, url }) => {
        const { subject, html } = resetPasswordEmail({ name: user.name || 'Usuário', url });
        await mailer.send({ to: user.email, subject, html });
      },
    },
    emailVerification: {
      sendOnSignUp: true,
      autoSignInAfterVerification: true,
      expiresIn: 60 * 60 * 24, // 24 horas
      sendVerificationEmail: async ({ user, url }) => {
        const { subject, html } = verificationEmail({ name: user.name || 'Usuário', url });
        await mailer.send({ to: user.email, subject, html });
      },
    },
    session: {
      expiresIn: 60 * 60 * 24 * 7, // 7 dias em segundos
      updateAge: 60 * 60 * 24, // 24 horas em segundos
    },
    rateLimit: {
      enabled: isProduction,
      window: 60,
      max: 10,
      customRules: {
        '/forget-password': { window: 3600, max: 3 },
        '/send-verification-email': { window: 3600, max: 3 },
        '/reset-password': { window: 3600, max: 5 },
        '/sign-in/social': { window: 60, max: 10 },
      },
    },
    trustedOrigins: [
      ...env.CORS_ORIGIN_LIST,
      ...(env.MOBILE_DEEP_LINK ? [env.MOBILE_DEEP_LINK] : []),
    ],
    advanced: {
      disableOriginCheck: false,
    },
    plugins: [bearer(), forgetPasswordPlugin()],
  });
}

const defaultAuth = createAuth();
let currentAuth = defaultAuth;

export const auth = new Proxy(defaultAuth, {
  get<K extends keyof typeof defaultAuth>(
    _target: typeof defaultAuth,
    prop: K,
  ): (typeof defaultAuth)[K] {
    const targetAuth = currentAuth;
    const value = targetAuth[prop];
    if (typeof value === 'function') {
      return (value as (...args: unknown[]) => unknown).bind(targetAuth) as (typeof defaultAuth)[K];
    }
    return value;
  },
});

export function setAuthInstanceForTest(instance: typeof defaultAuth): void {
  currentAuth = instance;
}

export function resetAuthInstanceForTest(): void {
  currentAuth = defaultAuth;
}

export type Session = typeof auth.$Infer.Session.session;
export type User = typeof auth.$Infer.Session.user;
