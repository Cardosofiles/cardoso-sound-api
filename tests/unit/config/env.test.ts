import { describe, expect, it } from 'vitest';
import { ZodError } from 'zod';
import { parseEnv } from '../../../src/config/env.js';

describe('env config', () => {
  it('T1: parses minimal valid environment and applies defaults', () => {
    const parsed = parseEnv({
      DATABASE_URL: 'postgresql://cardoso:cardoso_dev@localhost:5432/cardoso_sound',
      BETTER_AUTH_SECRET: 'a'.repeat(32),
    });

    expect(parsed).toEqual({
      NODE_ENV: 'development',
      PORT: 3333,
      HOST: '0.0.0.0',
      DATABASE_URL: 'postgresql://cardoso:cardoso_dev@localhost:5432/cardoso_sound',
      BETTER_AUTH_SECRET: 'a'.repeat(32),
      BETTER_AUTH_URL: 'http://localhost:3333',
      CORS_ORIGIN: '',
      CORS_ORIGIN_LIST: [],
      LOG_LEVEL: 'info',
      RATE_LIMIT_MAX: 100,
      RATE_LIMIT_WINDOW: '1 minute',
      TRUST_PROXY_HOPS: 0,
      TRUSTED_PROXIES: '',
      TRUSTED_PROXY_LIST: [],
      EMAIL_FROM: 'Cardoso Sound <onboarding@resend.dev>',
      SOCIAL_PROVIDERS: [],
    });
  });

  it('T2: throws validation error when DATABASE_URL is missing', () => {
    expect(() =>
      parseEnv({
        BETTER_AUTH_SECRET: 'a'.repeat(32),
      }),
    ).toThrow(ZodError);
  });

  it('T3: throws validation error when DATABASE_URL is invalid', () => {
    expect(() =>
      parseEnv({
        DATABASE_URL: 'invalido',
        BETTER_AUTH_SECRET: 'a'.repeat(32),
      }),
    ).toThrow(ZodError);
  });

  it('T4: throws validation error when BETTER_AUTH_SECRET is shorter than 32 characters', () => {
    expect(() =>
      parseEnv({
        DATABASE_URL: 'postgresql://cardoso:cardoso_dev@localhost:5432/cardoso_sound',
        BETTER_AUTH_SECRET: '1234567890',
      }),
    ).toThrow(ZodError);
  });

  it('T5: coerces numeric string PORT to number', () => {
    const parsed = parseEnv({
      DATABASE_URL: 'postgresql://cardoso:cardoso_dev@localhost:5432/cardoso_sound',
      BETTER_AUTH_SECRET: 'a'.repeat(32),
      PORT: '3333',
    });

    expect(parsed.PORT).toBe(3333);
    expect(typeof parsed.PORT).toBe('number');
  });

  it('T6: throws validation error when NODE_ENV is outside the enum', () => {
    expect(() =>
      parseEnv({
        DATABASE_URL: 'postgresql://cardoso:cardoso_dev@localhost:5432/cardoso_sound',
        BETTER_AUTH_SECRET: 'a'.repeat(32),
        NODE_ENV: 'staging',
      }),
    ).toThrow(ZodError);
  });

  it('T7: splits and trims CORS_ORIGIN into CORS_ORIGIN_LIST ignoring empty items', () => {
    const parsed = parseEnv({
      DATABASE_URL: 'postgresql://cardoso:cardoso_dev@localhost:5432/cardoso_sound',
      BETTER_AUTH_SECRET: 'a'.repeat(32),
      CORS_ORIGIN: 'a.com, b.com ,',
    });

    expect(parsed.CORS_ORIGIN_LIST).toEqual(['a.com', 'b.com']);
  });

  it('T8: parses empty CORS_ORIGIN as an empty array', () => {
    const parsed = parseEnv({
      DATABASE_URL: 'postgresql://cardoso:cardoso_dev@localhost:5432/cardoso_sound',
      BETTER_AUTH_SECRET: 'a'.repeat(32),
      CORS_ORIGIN: '',
    });

    expect(parsed.CORS_ORIGIN_LIST).toEqual([]);
  });

  it('T9: applies default info log level when LOG_LEVEL is omitted', () => {
    const parsed = parseEnv({
      DATABASE_URL: 'postgresql://cardoso:cardoso_dev@localhost:5432/cardoso_sound',
      BETTER_AUTH_SECRET: 'a'.repeat(32),
    });

    expect(parsed.LOG_LEVEL).toBe('info');
  });

  it('T10: populates SOCIAL_PROVIDERS when complete OAuth pairs are present', () => {
    const parsed = parseEnv({
      DATABASE_URL: 'postgresql://cardoso:cardoso_dev@localhost:5432/cardoso_sound',
      BETTER_AUTH_SECRET: 'a'.repeat(32),
      GOOGLE_CLIENT_ID: 'google-id',
      GOOGLE_CLIENT_SECRET: 'google-secret',
      GITHUB_CLIENT_ID: 'github-id',
      GITHUB_CLIENT_SECRET: 'github-secret',
    });

    expect(parsed.SOCIAL_PROVIDERS).toEqual(['google', 'github']);
  });

  it('T11: throws validation error when only half of OAuth pair is provided', () => {
    expect(() =>
      parseEnv({
        DATABASE_URL: 'postgresql://cardoso:cardoso_dev@localhost:5432/cardoso_sound',
        BETTER_AUTH_SECRET: 'a'.repeat(32),
        GOOGLE_CLIENT_ID: 'google-id',
      }),
    ).toThrow(ZodError);
  });

  it('T12: throws validation error when RESEND_API_KEY is missing in production', () => {
    expect(() =>
      parseEnv({
        DATABASE_URL: 'postgresql://cardoso:cardoso_dev@localhost:5432/cardoso_sound',
        BETTER_AUTH_SECRET: 'a'.repeat(32),
        NODE_ENV: 'production',
      }),
    ).toThrow(ZodError);
  });

  it('T13: allows missing RESEND_API_KEY outside of production', () => {
    const parsed = parseEnv({
      DATABASE_URL: 'postgresql://cardoso:cardoso_dev@localhost:5432/cardoso_sound',
      BETTER_AUTH_SECRET: 'a'.repeat(32),
      NODE_ENV: 'development',
    });

    expect(parsed.RESEND_API_KEY).toBeUndefined();
  });

  it('T19: throws validation error in production when TRUST_PROXY_HOPS is missing or 0', () => {
    expect(() =>
      parseEnv({
        DATABASE_URL: 'postgresql://cardoso:cardoso_dev@localhost:5432/cardoso_sound',
        BETTER_AUTH_SECRET: 'a'.repeat(32),
        RESEND_API_KEY: 're_12345678',
        NODE_ENV: 'production',
        TRUST_PROXY_HOPS: '0',
        TRUSTED_PROXIES: '10.0.0.0/8',
      }),
    ).toThrowError(/TRUST_PROXY_HOPS/);
  });

  it('T20: throws validation error in production when TRUSTED_PROXIES is empty', () => {
    expect(() =>
      parseEnv({
        DATABASE_URL: 'postgresql://cardoso:cardoso_dev@localhost:5432/cardoso_sound',
        BETTER_AUTH_SECRET: 'a'.repeat(32),
        RESEND_API_KEY: 're_12345678',
        NODE_ENV: 'production',
        TRUST_PROXY_HOPS: '1',
        TRUSTED_PROXIES: '',
      }),
    ).toThrowError(/TRUSTED_PROXIES/);
  });

  it('T21: parses valid production environment with both proxy variables set', () => {
    const parsed = parseEnv({
      DATABASE_URL: 'postgresql://cardoso:cardoso_dev@localhost:5432/cardoso_sound',
      BETTER_AUTH_SECRET: 'a'.repeat(32),
      RESEND_API_KEY: 're_12345678',
      NODE_ENV: 'production',
      TRUST_PROXY_HOPS: '2',
      TRUSTED_PROXIES: '10.0.0.0/8, 172.16.0.0/12',
    });

    expect(parsed.TRUST_PROXY_HOPS).toBe(2);
    expect(parsed.TRUSTED_PROXY_LIST).toEqual(['10.0.0.0/8', '172.16.0.0/12']);
  });

  it('T22: parses valid development environment without proxy variables applying defaults', () => {
    const parsed = parseEnv({
      DATABASE_URL: 'postgresql://cardoso:cardoso_dev@localhost:5432/cardoso_sound',
      BETTER_AUTH_SECRET: 'a'.repeat(32),
      NODE_ENV: 'development',
    });

    expect(parsed.TRUST_PROXY_HOPS).toBe(0);
    expect(parsed.TRUSTED_PROXIES).toBe('');
    expect(parsed.TRUSTED_PROXY_LIST).toEqual([]);
  });

  it('T23: splits, trims and filters empty items from TRUSTED_PROXIES', () => {
    const parsed = parseEnv({
      DATABASE_URL: 'postgresql://cardoso:cardoso_dev@localhost:5432/cardoso_sound',
      BETTER_AUTH_SECRET: 'a'.repeat(32),
      TRUSTED_PROXIES: ' 10.0.0.0/8 , ,172.16.0.0/12 ',
    });

    expect(parsed.TRUSTED_PROXY_LIST).toEqual(['10.0.0.0/8', '172.16.0.0/12']);
  });

  describe('F5-S07: MOBILE_DEEP_LINK, CORS_ORIGIN and RATE_LIMIT_REDIS_URL (T12–T20)', () => {
    it('T12: parses valid MOBILE_DEEP_LINK', () => {
      const parsed = parseEnv({
        DATABASE_URL: 'postgresql://cardoso:cardoso_dev@localhost:5432/cardoso_sound',
        BETTER_AUTH_SECRET: 'a'.repeat(32),
        MOBILE_DEEP_LINK: 'cardososound://auth',
      });

      expect(parsed.MOBILE_DEEP_LINK).toBe('cardososound://auth');
    });

    it('T13: throws validation error when MOBILE_DEEP_LINK is wildcard "*"', () => {
      expect(() =>
        parseEnv({
          DATABASE_URL: 'postgresql://cardoso:cardoso_dev@localhost:5432/cardoso_sound',
          BETTER_AUTH_SECRET: 'a'.repeat(32),
          MOBILE_DEEP_LINK: '*',
        }),
      ).toThrow(ZodError);
    });

    it('T14: throws validation error when MOBILE_DEEP_LINK contains wildcard', () => {
      expect(() =>
        parseEnv({
          DATABASE_URL: 'postgresql://cardoso:cardoso_dev@localhost:5432/cardoso_sound',
          BETTER_AUTH_SECRET: 'a'.repeat(32),
          MOBILE_DEEP_LINK: 'https://evil.example/*',
        }),
      ).toThrow(ZodError);
    });

    it('T15: throws validation error when MOBILE_DEEP_LINK is empty string', () => {
      expect(() =>
        parseEnv({
          DATABASE_URL: 'postgresql://cardoso:cardoso_dev@localhost:5432/cardoso_sound',
          BETTER_AUTH_SECRET: 'a'.repeat(32),
          MOBILE_DEEP_LINK: '',
        }),
      ).toThrow(ZodError);
    });

    it('T16: throws validation error in production when CORS_ORIGIN is wildcard "*"', () => {
      expect(() =>
        parseEnv({
          DATABASE_URL: 'postgresql://cardoso:cardoso_dev@localhost:5432/cardoso_sound',
          BETTER_AUTH_SECRET: 'a'.repeat(32),
          RESEND_API_KEY: 're_12345678',
          NODE_ENV: 'production',
          TRUST_PROXY_HOPS: '1',
          TRUSTED_PROXIES: '10.0.0.0/8',
          CORS_ORIGIN: '*',
        }),
      ).toThrow(ZodError);
    });

    it('T17: parses production CORS_ORIGIN with multiple valid URLs', () => {
      const parsed = parseEnv({
        DATABASE_URL: 'postgresql://cardoso:cardoso_dev@localhost:5432/cardoso_sound',
        BETTER_AUTH_SECRET: 'a'.repeat(32),
        RESEND_API_KEY: 're_12345678',
        NODE_ENV: 'production',
        TRUST_PROXY_HOPS: '1',
        TRUSTED_PROXIES: '10.0.0.0/8',
        CORS_ORIGIN: 'https://a.com,https://b.com',
      });

      expect(parsed.CORS_ORIGIN_LIST).toEqual(['https://a.com', 'https://b.com']);
    });

    it('T18: allows wildcard CORS_ORIGIN in development (D-19)', () => {
      const parsed = parseEnv({
        DATABASE_URL: 'postgresql://cardoso:cardoso_dev@localhost:5432/cardoso_sound',
        BETTER_AUTH_SECRET: 'a'.repeat(32),
        NODE_ENV: 'development',
        CORS_ORIGIN: '*',
      });

      expect(parsed.CORS_ORIGIN).toBe('*');
      expect(parsed.CORS_ORIGIN_LIST).toEqual(['*']);
    });

    it('T19: parses environment with omitted RATE_LIMIT_REDIS_URL as undefined', () => {
      const parsed = parseEnv({
        DATABASE_URL: 'postgresql://cardoso:cardoso_dev@localhost:5432/cardoso_sound',
        BETTER_AUTH_SECRET: 'a'.repeat(32),
      });

      expect(parsed.RATE_LIMIT_REDIS_URL).toBeUndefined();
    });

    it('T20: throws validation error when RATE_LIMIT_REDIS_URL is not a valid URL', () => {
      expect(() =>
        parseEnv({
          DATABASE_URL: 'postgresql://cardoso:cardoso_dev@localhost:5432/cardoso_sound',
          BETTER_AUTH_SECRET: 'a'.repeat(32),
          RATE_LIMIT_REDIS_URL: 'nao-e-url',
        }),
      ).toThrow(ZodError);
    });
  });
});
