import { toBool, toInt } from '@repo/config';
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
  /**
   * Event-bus config. Binds this service's own queue to the shared exchange,
   * so it receives every `order.created` while other subscribers get a copy.
   */
  messaging: MessagingConfig;
  seed: boolean;
  /** How many demo products to seed (fixed demo products + faker). 10-100. */
  seedProducts: number;
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
      // Tables are created with synchronize outside production. There are no
      // migrations, so a production stack must opt in explicitly (the demo
      // compose stack sets DATABASE_SYNCHRONIZE=true) or no tables are created.
      synchronize: toBool('DATABASE_SYNCHRONIZE', env !== 'production'),
    },
    redis: {
      url: process.env.REDIS_URL ?? 'redis://localhost:6379',
    },
    // Single event-bus connection: same exchange as the publisher, own queue.
    messaging: messagingConfiguration({
      exchange: 'orders.events',
      queue: 'catalog.order-events',
    }),
    seed: toBool('SEED_DB', env !== 'production'),
    // 10-100 demo products; defaults to 50.
    seedProducts: toInt('SEED_PRODUCTS_COUNT', 50, 10, 100),
  };
}