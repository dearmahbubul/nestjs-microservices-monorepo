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
  messaging: MessagingConfig;
  seed: boolean;
}

export default function loadConfiguration(): AppConfig {
  const env = process.env.NODE_ENV ?? 'development';

  return {
    app: {
      env,
      port: toInt('PORT', 3000),
    },
    database: {
      url: process.env.DATABASE_URL ?? 'postgresql://app:app@localhost:5432/orders',
      // Tables are created with synchronize outside production. There are no
      // migrations, so a production stack must opt in explicitly (the demo
      // compose stack sets DATABASE_SYNCHRONIZE=true) or no tables are created.
      synchronize: toBool('DATABASE_SYNCHRONIZE', env !== 'production'),
    },
    // Publishes order.created onto the shared exchange.
    messaging: messagingConfiguration({
      exchange: 'orders.events',
      queue: 'orders.events',
    }),
    seed: toBool('SEED_DB', env !== 'production'),
  };
}
