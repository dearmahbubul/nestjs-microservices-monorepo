import {
  messagingConfiguration,
  type MessagingConfig,
} from '@repo/messaging';

export interface AppConfig {
  app: {
    env: string;
    port: number;
  };
  database: {
    url: string;
    synchronize: boolean;
  };
  redis: {
    url: string;
  };
  messaging: MessagingConfig;
  /**
   * Fanout config for *consuming* domain events. Binds this service's own
   * queue to the shared exchange, so it receives every `order.created` while
   * other subscribers get their own copy.
   */
  eventBus: MessagingConfig;
  seed: boolean;
}

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

function toBool(name: string, fallback: boolean): boolean {
  const raw = process.env[name];
  if (raw === undefined || raw === '') {
    return fallback;
  }
  if (raw !== 'true' && raw !== 'false') {
    throw new Error(`Invalid ${name}: expected 'true' or 'false', got '${raw}'`);
  }
  return raw === 'true';
}

export default function loadConfiguration(): AppConfig {
  const env = process.env.NODE_ENV ?? 'development';

  return {
    app: {
      env,
      port: toInt('PORT', 3000),
    },
    database: {
      url: process.env.DATABASE_URL ?? 'postgresql://app:app@localhost:5432/app',
      synchronize: env !== 'production',
    },
    redis: {
      url: process.env.REDIS_URL ?? 'redis://localhost:6379',
    },
    // Private connection: reply channel for the commands this service serves.
    messaging: messagingConfiguration({ queue: 'catalog.replies' }),
    // Event connection: same exchange as the publisher, own queue.
    eventBus: messagingConfiguration({
      mode: 'fanout',
      exchange: 'orders.events',
      queue: 'catalog.order-events',
    }),
    seed: toBool('SEED_DB', env !== 'production'),
  };
}