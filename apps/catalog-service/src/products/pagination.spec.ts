import { BadRequestException } from '@nestjs/common';
import { describe, expect, it } from 'vitest';
import { MAX_PAGE_SIZE, parsePage } from './pagination.js';

/**
 * These pin the bounds, because the bounds are where the bugs were.
 *
 * The first version of this parser rejected `offset=0` — it treated zero as
 * invalid for both parameters — which broke the opening request of every paged
 * read. A staging probe caught it; these tests are so it can only ever be
 * caught here.
 */
describe('parsePage', () => {
  describe('absent bounds', () => {
    it('treats a bare request as unbounded', () => {
      expect(parsePage()).toEqual({ limit: undefined, offset: undefined });
    });

    it('treats an empty string as absent', () => {
      // `?limit=` is how a query string expresses "not set" when a form posts
      // the field regardless. It must not become NaN.
      expect(parsePage('', '')).toEqual({ limit: undefined, offset: undefined });
    });

    it('allows either bound on its own', () => {
      expect(parsePage('12')).toEqual({ limit: 12, offset: undefined });
      expect(parsePage(undefined, '24')).toEqual({
        limit: undefined,
        offset: 24,
      });
    });
  });

  describe('offset', () => {
    it('accepts 0 — the first page', () => {
      expect(parsePage('10', '0')).toEqual({ limit: 10, offset: 0 });
    });

    it('accepts a positive page start', () => {
      expect(parsePage('10', '48')).toEqual({ limit: 10, offset: 48 });
    });

    it('rejects a negative start', () => {
      expect(() => parsePage('10', '-1')).toThrow(BadRequestException);
    });

    it('rejects a fractional start', () => {
      expect(() => parsePage('10', '1.5')).toThrow(BadRequestException);
    });
  });

  describe('limit', () => {
    it('accepts a page size', () => {
      expect(parsePage('12')).toEqual({ limit: 12, offset: undefined });
    });

    it('accepts exactly the maximum', () => {
      expect(parsePage(String(MAX_PAGE_SIZE))).toEqual({
        limit: MAX_PAGE_SIZE,
        offset: undefined,
      });
    });

    it('rejects 0 — an empty page reads as "the end"', () => {
      // A zero page size returns [], which an infinite scroll interprets as
      // "no more products" and stops on. Better a 400 than a silent wrong
      // answer that looks like an empty catalog.
      expect(() => parsePage('0')).toThrow(BadRequestException);
    });

    it('rejects a negative size', () => {
      expect(() => parsePage('-5')).toThrow(BadRequestException);
    });

    it('rejects a size over the maximum', () => {
      expect(() => parsePage(String(MAX_PAGE_SIZE + 1))).toThrow(
        BadRequestException,
      );
    });
  });

  describe('malformed input', () => {
    it.each(['abc', '12abc', '1e3', 'NaN', 'Infinity', '  ', '1,2'])(
      'rejects %j rather than coercing it',
      (value) => {
        // `parseInt('12abc')` would be 12 and `Number('1e3')` would be 1000 —
        // both would let a typo silently mean a page nobody asked for.
        expect(() => parsePage(value)).toThrow(BadRequestException);
      },
    );

    it('names the offending parameter in the message', () => {
      expect(() => parsePage('0')).toThrow(/limit/);
      expect(() => parsePage('10', '-1')).toThrow(/offset/);
    });
  });
});
