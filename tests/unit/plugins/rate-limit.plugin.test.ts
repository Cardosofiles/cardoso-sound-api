import type { FastifyRequest } from 'fastify';
import { describe, expect, it } from 'vitest';
import type { Env } from '../../../src/config/env.js';
import { buildRateLimitOptions } from '../../../src/plugins/rate-limit.plugin.js';

function makeEnv(overrides: Partial<Env> = {}): Env {
  return {
    NODE_ENV: 'development',
    RATE_LIMIT_MAX: 100,
    RATE_LIMIT_WINDOW: '1 minute',
    ...overrides,
  } as unknown as Env;
}

describe('buildRateLimitOptions', () => {
  it('T1: sets global === true in production (GAP-01)', () => {
    const options = buildRateLimitOptions(makeEnv({ NODE_ENV: 'production' }));
    expect(options.global).toBe(true);
  });

  it('T2: sets global === false in development', () => {
    const options = buildRateLimitOptions(makeEnv({ NODE_ENV: 'development' }));
    expect(options.global).toBe(false);
  });

  it('T3: sets global === false in test', () => {
    const options = buildRateLimitOptions(makeEnv({ NODE_ENV: 'test' }));
    expect(options.global).toBe(false);
  });

  it('T4: allowList returns true for /health and /health/ready', () => {
    const options = buildRateLimitOptions(makeEnv());
    const allowList = options.allowList as (req: FastifyRequest) => boolean;

    expect(allowList({ url: '/health' } as FastifyRequest)).toBe(true);
    expect(allowList({ url: '/health/ready' } as FastifyRequest)).toBe(true);
  });

  it('T5: allowList returns false for /api/v1/tracks', () => {
    const options = buildRateLimitOptions(makeEnv());
    const allowList = options.allowList as (req: FastifyRequest) => boolean;

    expect(allowList({ url: '/api/v1/tracks' } as FastifyRequest)).toBe(false);
  });

  it('T6: max and timeWindow reflect RATE_LIMIT_MAX and RATE_LIMIT_WINDOW from config', () => {
    const options = buildRateLimitOptions(
      makeEnv({
        RATE_LIMIT_MAX: 50,
        RATE_LIMIT_WINDOW: '30 seconds',
      }),
    );

    expect(options.max).toBe(50);
    expect(options.timeWindow).toBe('30 seconds');
  });
});
