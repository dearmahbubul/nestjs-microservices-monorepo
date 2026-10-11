import type { UserRole } from '@repo/contracts';

/**
 * Which requests the gateway will let through unauthenticated.
 *
 * A single table rather than a decorator per route: the gateway has one
 * catch-all controller, so "what is protected" is a property of the path, and
 * keeping it in one readable list is the only way to audit it at a glance.
 *
 * Default is deny for writes and allow for reads — but be explicit anyway.
 * First match wins, so keep prefixes disjoint.
 */
export interface ProtectedRoute {
  method: string;
  /** Path prefix. `products` matches `/products` and `/products/:id`. */
  prefix: string;
  /** When set, only this role passes. Otherwise any signed-in user does. */
  role?: UserRole;
}

export const PROTECTED_ROUTES: ReadonlyArray<ProtectedRoute> = [
  // Browsing the catalog is public; changing it is not.
  { method: 'POST', prefix: 'products', role: 'admin' },
  { method: 'PATCH', prefix: 'products', role: 'admin' },
  { method: 'PUT', prefix: 'products', role: 'admin' },
  { method: 'DELETE', prefix: 'products', role: 'admin' },
  // "Who am I?" needs a token by definition, but any signed-in user may ask.
  { method: 'GET', prefix: 'auth/me' },
];

export type AuthRequirement =
  | { kind: 'public' }
  | { kind: 'authenticated'; role?: UserRole };

/**
 * Resolves the auth requirement for a request. Query strings and trailing
 * slashes are stripped first, so `/products?foo=1` cannot dodge a `products`
 * rule by looking like a different path.
 */
export function authRequirementFor(
  method: string,
  path: string,
): AuthRequirement {
  const pathname = normalizePath(path);
  const match = PROTECTED_ROUTES.find(
    (route) =>
      route.method === method.toUpperCase() &&
      (pathname === route.prefix || pathname.startsWith(`${route.prefix}/`)),
  );

  if (!match) {
    return { kind: 'public' };
  }
  return match.role
    ? { kind: 'authenticated', role: match.role }
    : { kind: 'authenticated' };
}

function normalizePath(path: string): string {
  const pathname = path.split(/[?#]/)[0] ?? '';
  return pathname.replace(/^\/+/, '').replace(/\/+$/, '');
}
