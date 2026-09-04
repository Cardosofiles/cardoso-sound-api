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
      PORT: 3000,
      HOST: '0.0.0.0',
      DATABASE_URL: 'postgresql://cardoso:cardoso_dev@localhost:5432/cardoso_sound',
      BETTER_AUTH_SECRET: 'a'.repeat(32),
      BETTER_AUTH_URL: 'http://localhost:3000',
      CORS_ORIGIN: '',
      CORS_ORIGIN_LIST: [],
      LOG_LEVEL: 'info',
      RATE_LIMIT_MAX: 100,
      RATE_LIMIT_WINDOW: '1 minute',
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
      PORT: '3000',
    });

    expect(parsed.PORT).toBe(3000);
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
});
