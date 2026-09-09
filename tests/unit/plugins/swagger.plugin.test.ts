import { describe, expect, it } from 'vitest';
import { shouldExposeSwaggerUi } from '../../../src/plugins/swagger.plugin.js';

describe('shouldExposeSwaggerUi', () => {
  it('T24: returns false when NODE_ENV is production (GAP-17)', () => {
    expect(shouldExposeSwaggerUi('production')).toBe(false);
  });

  it('T25: returns true when NODE_ENV is development', () => {
    expect(shouldExposeSwaggerUi('development')).toBe(true);
  });

  it('T26: returns true when NODE_ENV is test', () => {
    expect(shouldExposeSwaggerUi('test')).toBe(true);
  });
});
