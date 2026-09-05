import { betterAuth } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { bearer } from 'better-auth/plugins';
import { env, isProduction } from '../../config/env.js';
import { db, type Database } from '../../db/client.js';
import * as schema from '../../db/schema/index.js';

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

export const auth = betterAuth({
  database: drizzleAdapter(dynamicDb, { provider: 'pg', schema }),
  secret: env.BETTER_AUTH_SECRET,
  baseURL: env.BETTER_AUTH_URL,
  basePath: '/api/auth',
  emailAndPassword: {
    enabled: true,
    minPasswordLength: 8,
    autoSignIn: true,
  },
  session: {
    expiresIn: 60 * 60 * 24 * 7, // 7 dias em segundos
    updateAge: 60 * 60 * 24, // 24 horas em segundos
  },
  rateLimit: {
    enabled: isProduction,
    window: 60,
    max: 10,
  },
  trustedOrigins: env.CORS_ORIGIN_LIST,
  plugins: [bearer()],
});

export type Session = typeof auth.$Infer.Session.session;
export type User = typeof auth.$Infer.Session.user;
