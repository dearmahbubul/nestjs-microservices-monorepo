import { toInt, toUrl } from '@repo/config';
import type { ServiceName } from '../routing/service-registry.js';

export interface AppConfig {
  app: {
    env: string;
    port: number;
    /** Global timeout (ms) applied to every downstream call. */
    requestTimeoutMs: number;
  };
  /** Base URLs for the downstream services, keyed by service name. */
  services: Record<ServiceName, string>;
  auth: {
    /** HMAC secret for verifying session tokens; must match identity-service. */
    jwtSecret: string;
  };
}

const DEV_JWT_SECRET = 'dev-only-insecure-jwt-secret-change-me';
const MIN_SECRET_LENGTH = 16;

function jwtSecret(env: string): string {
  const value = process.env.AUTH_JWT_SECRET;
  if (value) {
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
      port: toInt('PORT', 4000),
      requestTimeoutMs: toInt('REQUEST_TIMEOUT_MS', 10_000, 1),
    },
    services: {
      catalog: toUrl('CATALOG_SERVICE_URL', 'http://localhost:3000'),
      identity: toUrl('IDENTITY_SERVICE_URL', 'http://localhost:3000'),
      orders: toUrl('ORDERS_SERVICE_URL', 'http://localhost:3000'),
      notifications: toUrl('NOTIFICATIONS_SERVICE_URL', 'http://localhost:3000'),
      cart: toUrl('CART_SERVICE_URL', 'http://localhost:3000'),
    },
    auth: {
      jwtSecret: jwtSecret(env),
    },
  };
}
