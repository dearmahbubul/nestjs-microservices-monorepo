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
  /**
   * When set, only these roles pass. Omitted means any signed-in user does.
   *
   * A list rather than one role because a route can be legitimately reachable
   * by more than one: order history belongs to the customer who owns it *and*
   * to an admin.
   */
  roles?: ReadonlyArray<UserRole>;
  /**
   * Explicitly reachable without a token.
   *
   * Matters inside a namespace that is otherwise protected: `GET auth/me` is
   * protected, so `POST auth/login` has to say `public: true` rather than
   * simply being absent from this table — an absent entry means public too, and
   * writing the intent down is what makes the table auditable.
   */
  public?: true;
}

/**
 * Which requests the gateway will let through unauthenticated, and as whom.
 *
 * Ordering does not matter: `authRequirementFor` intersects the `roles` of
 * every matching rule, so two rules for the same prefix widen access rather
 * than shadowing each other. Keep prefixes disjoint per method anyway — an
 * accidental overlap then shows up as a wider rule, not a broken one.
 */
export const PROTECTED_ROUTES: ReadonlyArray<ProtectedRoute> = [
  // Browsing the catalog is public; changing it is not.
  { method: 'POST', prefix: 'products', roles: ['admin'] },
  { method: 'PATCH', prefix: 'products', roles: ['admin'] },
  { method: 'PUT', prefix: 'products', roles: ['admin'] },
  { method: 'DELETE', prefix: 'products', roles: ['admin'] },
  // "Who am I?" needs a token by definition, but any signed-in user may ask.
  { method: 'GET', prefix: 'auth/me' },
  // Signing in and signing up must work without a token. Listed explicitly
  // rather than left to the default, because `auth` also holds a protected
  // route and the table is meant to be readable as the whole policy.
  { method: 'POST', prefix: 'auth/login', public: true },
  { method: 'POST', prefix: 'auth/register', public: true },
  // Reading orders is scoped to the caller: the proxy injects the authenticated
  // email and drops any the client supplied, so this cannot be public. The
  // admin may read across customers, so both roles are listed.
  { method: 'GET', prefix: 'orders', roles: ['customer', 'admin'] },
];

export type AuthRequirement =
  | { kind: 'public' }
  | { kind: 'authenticated'; roles?: ReadonlyArray<UserRole> };

/**
 * Resolves the auth requirement for a request. Query strings and trailing
 * slashes are stripped first, so `/products?foo=1` cannot dodge a `products`
 * rule by looking like a different path.
 *
 * Every matching rule is folded together. A single rule with `public: true`
 * makes the path public; otherwise `roles` is the intersection of the matching
 * rules' role lists, where a rule with no `roles` means "any signed-in user".
 * The intersection can be empty, which means no role passes — that is a
 * configuration mistake, and it fails closed rather than open.
 */
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

  // A rule that names no roles admits every role, so start from the full set
  // and intersect downwards.
  let roles: ReadonlyArray<UserRole> = ALL_ROLES;
  for (const match of matches) {
    if (!match.roles) {
      continue;
    }
    roles = roles.filter((role) => match.roles?.includes(role));
  }

  return { kind: 'authenticated', roles };
}

/** Every role the system understands, in the order they appear in the contract. */
const ALL_ROLES: ReadonlyArray<UserRole> = ['admin', 'customer'];

function normalizePath(path: string): string {
  const pathname = path.split(/[?#]/)[0] ?? '';
  return pathname.replace(/^\/+/, '').replace(/\/+$/, '');
}
