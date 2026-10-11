import { describe, expect, it } from 'vitest';
import {
  ROUTE_TO_SERVICE,
  resolveServiceForPath,
  SERVICE_NAMES,
} from './service-registry.js';

describe('service-registry', () => {
  it('resolves a route prefix to its service', () => {
    expect(resolveServiceForPath('/products')).toBe('catalog');
    expect(resolveServiceForPath('/products/42')).toBe('catalog');
    expect(resolveServiceForPath('/orders?status=new')).toBe('orders');
  });

  it('returns undefined for unknown or empty paths', () => {
    expect(resolveServiceForPath('/')).toBeUndefined();
    expect(resolveServiceForPath('/nope')).toBeUndefined();
    expect(resolveServiceForPath('')).toBeUndefined();
  });

  it('never maps a prefix that is not a real service', () => {
    for (const { service } of ROUTE_TO_SERVICE) {
      expect(SERVICE_NAMES).toContain(service);
    }
  });

  it('keeps route prefixes unique (first match wins)', () => {
    const prefixes = ROUTE_TO_SERVICE.map((r) => r.prefix);
    expect(new Set(prefixes).size).toBe(prefixes.length);
  });
});
