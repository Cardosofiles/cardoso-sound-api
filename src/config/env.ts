import 'dotenv/config';
import { z } from 'zod';

const envSchema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    PORT: z.coerce.number().int().positive().default(3333),
    HOST: z.string().default('0.0.0.0'),
    DATABASE_URL: z.url(),
    BETTER_AUTH_SECRET: z.string().min(32),
    BETTER_AUTH_URL: z.url().default('http://localhost:3333'),
    CORS_ORIGIN: z.string().default(''),
    LOG_LEVEL: z
      .enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent'])
      .default('info'),
    RATE_LIMIT_MAX: z.coerce.number().int().positive().default(100),
    RATE_LIMIT_WINDOW: z.string().default('1 minute'),
    GOOGLE_CLIENT_ID: z.string().min(1).optional(),
    GOOGLE_CLIENT_SECRET: z.string().min(1).optional(),
    GITHUB_CLIENT_ID: z.string().min(1).optional(),
    GITHUB_CLIENT_SECRET: z.string().min(1).optional(),
    FACEBOOK_CLIENT_ID: z.string().min(1).optional(),
    FACEBOOK_CLIENT_SECRET: z.string().min(1).optional(),
    RESEND_API_KEY: z.string().startsWith('re_').optional(),
    EMAIL_FROM: z.string().min(1).default('Cardoso Sound <onboarding@resend.dev>'),
    MOBILE_DEEP_LINK: z.string().optional(),
  })
  .superRefine((v, ctx) => {
    if (v.NODE_ENV === 'production' && !v.RESEND_API_KEY) {
      ctx.addIssue({
        code: 'custom',
        path: ['RESEND_API_KEY'],
        message: 'RESEND_API_KEY is required in production',
      });
    }

    if (Boolean(v.GOOGLE_CLIENT_ID) !== Boolean(v.GOOGLE_CLIENT_SECRET)) {
      ctx.addIssue({
        code: 'custom',
        path: [v.GOOGLE_CLIENT_ID ? 'GOOGLE_CLIENT_SECRET' : 'GOOGLE_CLIENT_ID'],
        message: 'Both GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET must be provided together',
      });
    }

    if (Boolean(v.GITHUB_CLIENT_ID) !== Boolean(v.GITHUB_CLIENT_SECRET)) {
      ctx.addIssue({
        code: 'custom',
        path: [v.GITHUB_CLIENT_ID ? 'GITHUB_CLIENT_SECRET' : 'GITHUB_CLIENT_ID'],
        message: 'Both GITHUB_CLIENT_ID and GITHUB_CLIENT_SECRET must be provided together',
      });
    }

    if (Boolean(v.FACEBOOK_CLIENT_ID) !== Boolean(v.FACEBOOK_CLIENT_SECRET)) {
      ctx.addIssue({
        code: 'custom',
        path: [v.FACEBOOK_CLIENT_ID ? 'FACEBOOK_CLIENT_SECRET' : 'FACEBOOK_CLIENT_ID'],
        message: 'Both FACEBOOK_CLIENT_ID and FACEBOOK_CLIENT_SECRET must be provided together',
      });
    }
  });

export interface Env {
  NODE_ENV: 'development' | 'test' | 'production';
  PORT: number;
  HOST: string;
  DATABASE_URL: string;
  BETTER_AUTH_SECRET: string;
  BETTER_AUTH_URL: string;
  CORS_ORIGIN: string;
  CORS_ORIGIN_LIST: string[];
  LOG_LEVEL: 'fatal' | 'error' | 'warn' | 'info' | 'debug' | 'trace' | 'silent';
  RATE_LIMIT_MAX: number;
  RATE_LIMIT_WINDOW: string;
  GOOGLE_CLIENT_ID?: string;
  GOOGLE_CLIENT_SECRET?: string;
  GITHUB_CLIENT_ID?: string;
  GITHUB_CLIENT_SECRET?: string;
  FACEBOOK_CLIENT_ID?: string;
  FACEBOOK_CLIENT_SECRET?: string;
  RESEND_API_KEY?: string;
  EMAIL_FROM: string;
  MOBILE_DEEP_LINK?: string;
  SOCIAL_PROVIDERS: ReadonlyArray<'google' | 'github' | 'facebook'>;
}

export function parseEnv(source: NodeJS.ProcessEnv): Env {
  const parsed = envSchema.parse(source);
  const corsOriginList = parsed.CORS_ORIGIN.split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);

  const socialProviders: Array<'google' | 'github' | 'facebook'> = [];
  if (parsed.GOOGLE_CLIENT_ID && parsed.GOOGLE_CLIENT_SECRET) {
    socialProviders.push('google');
  }
  if (parsed.GITHUB_CLIENT_ID && parsed.GITHUB_CLIENT_SECRET) {
    socialProviders.push('github');
  }
  if (parsed.FACEBOOK_CLIENT_ID && parsed.FACEBOOK_CLIENT_SECRET) {
    socialProviders.push('facebook');
  }

  return {
    ...parsed,
    CORS_ORIGIN_LIST: corsOriginList,
    SOCIAL_PROVIDERS: socialProviders,
  };
}

function loadEnv(): Env {
  try {
    return parseEnv(process.env);
  } catch (error: unknown) {
    if (error instanceof z.ZodError) {
      const formattedErrors = error.issues
        .map((issue) => `  - ${issue.path.join('.')}: ${issue.message}`)
        .join('\n');
      process.stderr.write(`[Config Error] Invalid environment variables:\n${formattedErrors}\n`);
    } else {
      process.stderr.write(`[Config Error] Failed to load environment: ${String(error)}\n`);
    }
    process.exit(1);
  }
}

export const env = loadEnv();
export const isProduction = env.NODE_ENV === 'production';
export const isTest = env.NODE_ENV === 'test';
export const isDevelopment = env.NODE_ENV === 'development';
export const SOCIAL_PROVIDERS: ReadonlyArray<'google' | 'github' | 'facebook'> =
  env.SOCIAL_PROVIDERS;
