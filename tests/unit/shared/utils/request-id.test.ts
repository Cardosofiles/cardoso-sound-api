import { describe, expect, it } from 'vitest';
import { resolveRequestId } from '../../../../src/shared/utils/request-id.js';

describe('resolveRequestId', () => {
  it('T7: returns valid request id unchanged', () => {
    expect(resolveRequestId('req-abc_123.4')).toBe('req-abc_123.4');
  });

  it('T8: truncates valid long request id to 64 characters', () => {
    const longId = 'a'.repeat(200);
    const result = resolveRequestId(longId);

    expect(result).toHaveLength(64);
    expect(result).toBe('a'.repeat(64));
  });

  it('T9: rejects injection with spaces or newlines and generates new id', () => {
    const injection = 'req abc\nSet-Cookie: x';
    const result = resolveRequestId(injection);

    expect(result).not.toBe(injection);
    expect(result).toHaveLength(8);
    expect(result).toMatch(/^[0-9a-f-]{8}$/i);
  });

  it('T10: generates new id for undefined, empty string, non-strings, or array inputs', () => {
    const inputs = [undefined, '', 123, ['a', 'b'], null, {}, false];

    for (const input of inputs) {
      const result = resolveRequestId(input);
      expect(result).toHaveLength(8);
      expect(result).toMatch(/^[0-9a-f-]{8}$/i);
    }
  });

  it('T11: generates different ids on consecutive invocations without input', () => {
    const first = resolveRequestId(undefined);
    const second = resolveRequestId(undefined);

    expect(first).not.toBe(second);
  });
});
