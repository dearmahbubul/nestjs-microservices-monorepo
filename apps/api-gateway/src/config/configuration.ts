import type { ServiceName } from '../routing/service-registry.js';

export interface AppConfig {
  app: {
    env: string;
    port: number;
    /** Global request timeout (ms) applied to every downstream call. */
    requestTimeoutMs: number;
  };
  /** Base URLs for the downstream services, keyed by service name. */
  services: Record<ServiceName, string>;
  auth: {
    /**
     * HMAC secret for verifying session tokens. Must be the same value
     * `identity-service` signs with — the gateway is the verifier, never the
     * issuer, so it only needs to read tokens, not mint them.
     */
    jwtSecret: string;
  };
}

/** Only used when NODE_ENV !== 'production'; refused outright in production. */
const DEV_JWT_SECRET = 'dev-only-insecure-jwt-secret-change-me';
const MIN_SECRET_LENGTH = 16;

function toInt(name: string, fallback: number, min = 0): number {
  const raw = process.env[name];
  if (raw === undefined || raw === '') {
    return fallback;
  }
  const value = Number.parseInt(raw, 10);
  if (Number.isNaN(value) || value < min) {
    throw new Error(
      `Invalid ${name}: expected an integer >= ${min}, got '${raw}'`,
    );
  }
  return value;
}

function toUrl(name: string, fallback: string): string {  const raw = process.env[name];
  if (raw === undefined || raw === '') {
    return fallback;
  }
  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    throw new Error(`Invalid ${name}: expected an absolute URL, got '${raw}'`);
  }
  // Normalise away any trailing slash so we can always join with '/'.
  return parsed.origin + parsed.pathname.replace(/\/+$/, '');
}

/**
 * Same rules as `identity-service`'s, and for the same reason: a gateway that
 * silently falls back to a known secret in production would accept forged
 * tokens. Better to refuse to boot.
 */
function jwtSecret(env: string): string {
  const value = process.env.AUTH_JWT_SECRET;
  if (value !== undefined && value !== '') {
    if (value.length < MIN_SECRET_LENGTH) {
      throw new Error(
        `Invalid AUTH_JWT_SECRET: must be at least ${MIN_SECRET_LENGTH} characters`,
      );
    }
    return value;
  }
  if (env === 'production') {
    throw new Error('AUTH_JWT_SECRET must be set in production');
  }
  return DEV_JWT_SECRET;
}

export default function loadConfiguration(): AppConfig {
  const env = process.env.NODE_ENV ?? 'development';

  return {
    app: {
      env,
      // The gateway is the only public HTTP surface, so it gets its own port
      // (4000) instead of the 3000 the internal services listen on.
      port: toInt('PORT', 4000),
      requestTimeoutMs: toInt('REQUEST_TIMEOUT_MS', 10_000, 1),
    },
    services: {
      catalog: toUrl('CATALOG_SERVICE_URL', 'http://localhost:3000'),
      identity: toUrl('IDENTITY_SERVICE_URL', 'http://localhost:3000'),
      orders: toUrl('ORDERS_SERVICE_URL', 'http://localhost:3000'),
      notifications: toUrl('NOTIFICATIONS_SERVICE_URL', 'http://localhost:3000'),
    },
    auth: {
      jwtSecret: jwtSecret(env),
    },
  };
}
