import { toBool, toInt } from '@repo/config';

export interface AppConfig {
  app: {
    env: string;
    port: number;
  };
  database: {
    url: string;
    synchronize: boolean;
  };
  auth: {
    /** HMAC secret shared with the api-gateway, which verifies every token. */
    jwtSecret: string;
    tokenTtlSeconds: number;
    /** Credentials for the single seeded admin account. */
    adminEmail: string;
    adminPassword: string;
  };
  seed: boolean;
}

// Only used when NODE_ENV !== 'production'; refused outright in production.
const DEV_JWT_SECRET = 'dev-only-insecure-jwt-secret-change-me';
const MIN_SECRET_LENGTH = 16;

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

// Required in production: a default password on a production admin account is
// worse than refusing to boot.
function adminPassword(env: string): string {
  const value = process.env.AUTH_ADMIN_PASSWORD;
  if (value !== undefined && value !== '') {
    return value;
  }
  if (env === 'production') {
    throw new Error('AUTH_ADMIN_PASSWORD must be set in production');
  }
  return 'admin12345';
}

export default function loadConfiguration(): AppConfig {
  const env = process.env.NODE_ENV ?? 'development';

  return {
    app: {
      env,
      port: toInt('PORT', 3000),
    },
    database: {
      url: process.env.DATABASE_URL ?? 'postgresql://app:app@localhost:5432/identity',
      synchronize: toBool('DATABASE_SYNCHRONIZE', env !== 'production'),
    },
    auth: {
      jwtSecret: jwtSecret(env),
      tokenTtlSeconds: toInt('AUTH_TOKEN_TTL_SECONDS', 60 * 60 * 8, 60),
      adminEmail: process.env.AUTH_ADMIN_EMAIL ?? 'admin@example.com',
      adminPassword: adminPassword(env),
    },
    seed: toBool('SEED_DB', env !== 'production'),
  };
}
