import { describe, expect, it } from 'vitest';
import { bearerToken } from './auth.js';

/**
 * Only the pure helper is tested here. The token's crypto is `@nestjs/jwt`'s
 * responsibility, not this package's — testing it would be testing the library.
 */
describe('bearerToken', () => {
  it('extracts the token from a Bearer header', () => {
    expect(bearerToken('Bearer abc.def.ghi')).toBe('abc.def.ghi');
  });

  it('is case-insensitive on the scheme', () => {
    expect(bearerToken('bearer abc.def.ghi')).toBe('abc.def.ghi');
  });

  it.each([
    ['undefined', undefined],
    ['empty', ''],
    ['no scheme', 'abc.def.ghi'],
    ['wrong scheme', 'Basic abc.def.ghi'],
    ['scheme with no value', 'Bearer'],
  ])('returns null for %s', (_label, header) => {
    expect(bearerToken(header)).toBeNull();
  });
});
