import type { ExecutionContext } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { describe, expect, it, vi } from 'vitest';
import { AuthGuard } from './auth.guard.js';
import { authRequirementFor } from './protected-routes.js';

/**
 * The gateway is the only place authentication is enforced for every service,
 * so the policy table and the guard are pinned here. A regression in either one
 * silently opens the catalog's write endpoints to the internet.
 */
describe('authRequirementFor', () => {
  it.each([
    ['GET', '/products'],
    ['GET', '/products/abc'],
    ['GET', '/orders'],
    ['POST', '/orders'], // customers place orders — must stay public
    ['POST', '/auth/login'],
    ['POST', '/auth/logout'],
  ])('leaves %s %s public', (method, path) => {
    expect(authRequirementFor(method, path)).toEqual({ kind: 'public' });
  });

  it.each([
    ['POST', '/products'],
    ['PATCH', '/products/abc'],
    ['PUT', '/products/abc'],
    ['DELETE', '/products/abc'],
  ])('requires the admin role for %s %s', (method, path) => {
    expect(authRequirementFor(method, path)).toEqual({
      kind: 'authenticated',
      role: 'admin',
    });
  });

  it('requires authentication but no particular role for /auth/me', () => {
    expect(authRequirementFor('GET', '/auth/me')).toEqual({
      kind: 'authenticated',
    });
  });

  it('is not fooled by a query string or trailing slash', () => {
    expect(authRequirementFor('POST', '/products?dry=1')).toEqual({
      kind: 'authenticated',
      role: 'admin',
    });
    expect(authRequirementFor('DELETE', '/products/')).toEqual({
      kind: 'authenticated',
      role: 'admin',
    });
  });

  it('does not match a prefix that merely starts with the same letters', () => {
    // `products-archive` must not inherit the `products` rule.
    expect(authRequirementFor('POST', '/products-archive')).toEqual({
      kind: 'public',
    });
  });

  it('is case-insensitive on the method', () => {
    expect(authRequirementFor('post', '/products')).toEqual({
      kind: 'authenticated',
      role: 'admin',
    });
  });
});

function contextFor(request: {
  method: string;
  originalUrl: string;
  authorization?: string;
}): ExecutionContext {
  return {
    switchToHttp: () => ({
      getRequest: () => ({
        method: request.method,
        originalUrl: request.originalUrl,
        headers: request.authorization
          ? { authorization: request.authorization }
          : {},
      }),
    }),
  } as unknown as ExecutionContext;
}

function buildGuard(claims: Record<string, unknown> | null) {
  const jwt = {
    verifyAsync: vi.fn(async () => {
      if (!claims) {
        throw new Error('invalid signature');
      }
      return claims;
    }),
  };
  return new AuthGuard(jwt as unknown as JwtService);
}

describe('AuthGuard', () => {
  it('lets a public route through without a token', async () => {
    const guard = buildGuard(null);

    await expect(
      guard.canActivate(contextFor({ method: 'GET', originalUrl: '/products' })),
    ).resolves.toBe(true);
  });

  it('rejects a protected route with no token', async () => {
    const guard = buildGuard({ sub: 'u1', role: 'admin' });

    await expect(
      guard.canActivate(contextFor({ method: 'POST', originalUrl: '/products' })),
    ).rejects.toThrow(/authentication required/i);
  });

  it('rejects a protected route with an invalid token', async () => {
    const guard = buildGuard(null);

    await expect(
      guard.canActivate(
        contextFor({
          method: 'POST',
          originalUrl: '/products',
          authorization: 'Bearer garbage',
        }),
      ),
    ).rejects.toThrow(/invalid or expired/i);
  });

  it('accepts an admin token on a protected route', async () => {
    const guard = buildGuard({ sub: 'u1', email: 'a@b.c', role: 'admin' });

    await expect(
      guard.canActivate(
        contextFor({
          method: 'DELETE',
          originalUrl: '/products/abc',
          authorization: 'Bearer good',
        }),
      ),
    ).resolves.toBe(true);
  });

  it('forbids a non-admin token on an admin route', async () => {
    const guard = buildGuard({ sub: 'u2', email: 'c@d.e', role: 'customer' });

    await expect(
      guard.canActivate(
        contextFor({
          method: 'POST',
          originalUrl: '/products',
          authorization: 'Bearer good',
        }),
      ),
    ).rejects.toThrow(/requires role 'admin'/i);
  });

  it('accepts any signed-in role on /auth/me', async () => {
    const guard = buildGuard({ sub: 'u2', email: 'c@d.e', role: 'customer' });

    await expect(
      guard.canActivate(
        contextFor({
          method: 'GET',
          originalUrl: '/auth/me',
          authorization: 'Bearer good',
        }),
      ),
    ).resolves.toBe(true);
  });
});
