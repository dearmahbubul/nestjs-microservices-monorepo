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
  };
  redis: {
    url: string;
  };
  messaging: MessagingConfig;
  seed: boolean;
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
      // The compose stack runs a single-node replica set so reservations can
      // run as transactions; a host-run process connects with directConnection
      // instead (see .env.example).
      url: process.env.MONGODB_URI ?? 'mongodb://localhost:27017/catalog',
    },
    redis: {
      url: process.env.REDIS_URL ?? 'redis://localhost:6379',
    },
    messaging: messagingConfiguration({
      exchange: 'orders.events',
      queue: 'catalog.order-events',
    }),
    seed: toBool('SEED_DB', env !== 'production'),
    seedProducts: toInt('SEED_PRODUCTS_COUNT', 50, 10, 100),
  };
}
