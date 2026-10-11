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
  /**
   * Fanout config for publishing domain events. The *client* connection
   * publishes through the shared exchange so every subscriber's own queue
   * receives a copy — a plain queue would deliver to one consumer only.
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
    // Private connection: only used as the reply channel for the commands
    // this service serves (orders.create / orders.findAll / orders.findOne).
    messaging: messagingConfiguration({ queue: 'orders.outbox' }),
    // Event connection: publishes order.created onto the shared exchange.
    eventBus: messagingConfiguration({
      mode: 'fanout',
      exchange: 'orders.events',
      queue: 'orders.events',
    }),
    seed: toBool('SEED_DB', env !== 'production'),
  };
}
