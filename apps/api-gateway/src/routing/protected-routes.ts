import type { UserRole } from '@repo/contracts';

// Which requests the gateway will let through unauthenticated, and as whom.
// One table rather than a decorator per route: the gateway has a single
// catch-all controller, so "what is protected" is a property of the path.
// First match wins; keep prefixes disjoint.
export interface ProtectedRoute {
  method: string;
  /** Path prefix. `products` matches `/products` and `/products/:id`. */
  prefix: string;
  /** When set, only these roles pass. Omitted means any signed-in user does. */
  roles?: ReadonlyArray<UserRole>;
  /** Explicitly reachable without a token (e.g. login inside a protected namespace). */
  public?: true;
}

export const PROTECTED_ROUTES: ReadonlyArray<ProtectedRoute> = [
  // Browsing the catalog is public; changing it is not.
  { method: 'POST', prefix: 'products', roles: ['admin'] },
  { method: 'PATCH', prefix: 'products', roles: ['admin'] },
  { method: 'PUT', prefix: 'products', roles: ['admin'] },
  { method: 'DELETE', prefix: 'products', roles: ['admin'] },
  // "Who am I?" needs a token by definition, but any signed-in user may ask.
  { method: 'GET', prefix: 'auth/me' },
  // Signing in and signing up must work without a token.
  { method: 'POST', prefix: 'auth/login', public: true },
  { method: 'POST', prefix: 'auth/register', public: true },
  // Scoped to the caller: the proxy injects the authenticated email and drops
  // any the client supplied. Admins may read across customers.
  { method: 'GET', prefix: 'orders', roles: ['customer', 'admin'] },
  // The cart is the caller's only; every route is scoped by the injected email.
  { method: 'GET', prefix: 'cart', roles: ['customer', 'admin'] },
  { method: 'PUT', prefix: 'cart', roles: ['customer', 'admin'] },
  { method: 'DELETE', prefix: 'cart', roles: ['customer', 'admin'] },
];

export type AuthRequirement =
  | { kind: 'public' }
  | { kind: 'authenticated'; roles?: ReadonlyArray<UserRole> };

// Resolves the auth requirement for a request. Query strings and trailing
// slashes are stripped first. Every matching rule is folded together; an
// empty role intersection fails closed.
export function authRequirementFor(
  method: string,
  path: string,
): AuthRequirement {
  const pathname = normalizePath(path);
  const matches = PROTECTED_ROUTES.filter(
    (route) =>
      route.method === method.toUpperCase() &&
      (pathname === route.prefix || pathname.startsWith(`${route.prefix}/`)),
  );

  if (matches.length === 0 || matches.some((route) => route.public)) {
    return { kind: 'public' };
  }

  // A rule that names no roles admits every role: start from the full set and
  // intersect downwards.
  let roles: ReadonlyArray<UserRole> = ALL_ROLES;
  for (const match of matches) {
    if (!match.roles) {
      continue;
    }
    roles = roles.filter((role) => match.roles?.includes(role));
  }

  return { kind: 'authenticated', roles };
}

const ALL_ROLES: ReadonlyArray<UserRole> = ['admin', 'customer'];

function normalizePath(path: string): string {
  const pathname = path.split(/[?#]/)[0] ?? '';
  return pathname.replace(/^\/+/, '').replace(/\/+$/, '');
}
