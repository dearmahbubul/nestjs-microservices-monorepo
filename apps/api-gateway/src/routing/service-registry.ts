/**
 * The services the gateway can route to. This is the single source of truth:
 * the config type, the runtime registry and the docs all derive from it.
 */
export const SERVICE_NAMES = [
  'catalog',
  'identity',
  'orders',
  'notifications',
] as const;

export type ServiceName = (typeof SERVICE_NAMES)[number];

/**
 * Public route prefix -> downstream service.
 *
 * A single mapping table beats one controller per service: adding a service is
 * one line here plus its URL in the environment, and the routing logic itself
 * never changes. Keep prefixes disjoint — first match wins.
 */
export const ROUTE_TO_SERVICE: ReadonlyArray<{
  prefix: string;
  service: ServiceName;
}> = [
  { prefix: 'products', service: 'catalog' },
  { prefix: 'auth', service: 'identity' },
  { prefix: 'users', service: 'identity' },
  { prefix: 'orders', service: 'orders' },
  { prefix: 'notifications', service: 'notifications' },
];

export function resolveServiceForPath(path: string): ServiceName | undefined {
  // Strip the query string first: '/orders?status=new' must match 'orders',
  // not the literal segment 'orders?status=new'.
  const pathname = path.split(/[?#]/)[0];
  const first = pathname.split('/').filter(Boolean)[0];
  if (!first) {
    return undefined;
  }
  return ROUTE_TO_SERVICE.find((route) => route.prefix === first)?.service;
}
