import { betterAuth } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import {
  APIError,
  createAuthEndpoint,
  createAuthMiddleware,
  requestPasswordReset,
} from 'better-auth/api';
import { bearer, twoFactor } from 'better-auth/plugins';
import { passkey } from '@better-auth/passkey';
import { env, isProduction, SOCIAL_PROVIDERS, TRUSTED_PROXY_LIST } from '../../config/env.js';
import { db, type Database } from '../../db/client.js';
import * as schema from '../../db/schema/index.js';
import { mailer } from '../../shared/email/mailer.js';
import {
  resetPasswordEmail,
  twoFactorOtpEmail,
  verificationEmail,
} from '../../shared/email/templates.js';
import { isWeakPassword } from '../../shared/security/weak-passwords.js';

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

const weakPasswordPlugin = () => ({
  id: 'weak-passwords',
  hooks: {
    before: [
      {
        matcher(context: { path?: string }) {
          return (
            context.path === '/sign-up/email' ||
            context.path === '/reset-password' ||
            context.path === '/change-password'
          );
        },
        handler: createAuthMiddleware(async (ctx) => {
          const body = (await ctx.body) as Record<string, unknown> | undefined;
          const password = (body?.password ?? body?.newPassword) as string | undefined;
          if (typeof password === 'string' && isWeakPassword(password)) {
            throw APIError.from('BAD_REQUEST', {
              code: 'INVALID_PASSWORD',
              message: 'Invalid password. Please choose a different password.',
            });
          }
        }),
      },
    ],
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

export const AUTH_RATE_LIMIT_RULES = {
  '/forget-password': { window: 3600, max: 3 },
  '/request-password-reset': { window: 3600, max: 3 },
  '/send-verification-email': { window: 3600, max: 3 },
  '/reset-password': { window: 3600, max: 5 },
  '/sign-in/email': { window: 60, max: 5 },
  '/sign-up/email': { window: 3600, max: 10 },
  '/change-password': { window: 3600, max: 10 },
  '/sign-in/social': { window: 60, max: 10 },
  // segundo fator — F5-S05
  '/two-factor/verify-totp': { window: 60, max: 5 },
  '/two-factor/verify-otp': { window: 60, max: 5 },
  '/two-factor/send-otp': { window: 3600, max: 5 },
  '/two-factor/verify-backup-code': { window: 3600, max: 5 },
  // passkey — F5-S06
  '/sign-in/passkey': { window: 60, max: 10 },
} as const;

export interface CreateAuthOptions {
  overrideSocialProviders?: Parameters<typeof betterAuth>[0]['socialProviders'];
}

export function createAuth(options?: CreateAuthOptions) {
  return betterAuth({
    appName: 'Cardoso Sound',
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
        allowDifferentEmails: true,
      },
    },
    emailAndPassword: {
      enabled: true,
      minPasswordLength: 8,
      maxPasswordLength: 128,
      autoSignIn: true,
      requireEmailVerification: true,
      revokeSessionsOnPasswordReset: true,
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
      freshAge: 60 * 60 * 24, // 24 horas em segundos — D-58 (c)
      cookieCache: { enabled: true, maxAge: 5 * 60 },
    },
    logger: { level: 'error' },
    rateLimit: {
      enabled: isProduction,
      storage: 'database',
      window: 60,
      max: 10,
      customRules: AUTH_RATE_LIMIT_RULES,
    },
    trustedOrigins: [
      ...env.CORS_ORIGIN_LIST,
      ...(env.MOBILE_DEEP_LINK ? [env.MOBILE_DEEP_LINK] : []),
    ],
    advanced: {
      disableOriginCheck: false,
      ipAddress: {
        ipAddressHeaders: ['x-forwarded-for'],
        trustedProxies: TRUSTED_PROXY_LIST,
      },
    },
    plugins: [
      twoFactor({
        issuer: 'Cardoso Sound',
        skipVerificationOnEnable: false,
        totpOptions: {
          issuer: 'Cardoso Sound',
          digits: 6,
          period: 30,
          backupCodes: { amount: 10 },
        },
        otpOptions: {
          digits: 6,
          period: 10,
          async sendOTP({ user, otp }) {
            const { subject, html } = twoFactorOtpEmail({
              name: user.name || 'Usuário',
              otp,
            });
            await mailer.send({ to: user.email, subject, html });
          },
        },
        accountLockout: {
          enabled: true,
          maxFailedAttempts: 5,
          durationSeconds: 900,
        },
      }),
      passkey({
        rpID: new URL(env.BETTER_AUTH_URL).hostname,
        rpName: 'Cardoso Sound',
        origin: env.BETTER_AUTH_URL,
      }),
      bearer(),
      forgetPasswordPlugin(),
      weakPasswordPlugin(),
    ],
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
