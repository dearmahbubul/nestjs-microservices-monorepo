import {
  messagingConfiguration,
  type MessagingConfig,
} from '@repo/messaging';

export interface AppConfig {
  app: {
    env: string;
    port: number;
  };
  messaging: MessagingConfig;
  /**
   * Fanout config for consuming domain events. Binds this service's own queue
   * to the shared exchange so it receives every `order.created`.
   */
  eventBus: MessagingConfig;
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

export default function loadConfiguration(): AppConfig {
  const env = process.env.NODE_ENV ?? 'development';

  return {
    app: {
      env,
      port: toInt('PORT', 3000),
    },
    messaging: messagingConfiguration({ queue: 'notifications.replies' }),
    eventBus: messagingConfiguration({
      mode: 'fanout',
      exchange: 'orders.events',
      queue: 'notifications.order-events',
    }),
  };
}
