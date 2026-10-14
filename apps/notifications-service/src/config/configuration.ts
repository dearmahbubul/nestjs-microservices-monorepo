import { toInt } from '@repo/config';
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
}

export default function loadConfiguration(): AppConfig {
  const env = process.env.NODE_ENV ?? 'development';

  return {
    app: {
      env,
      port: toInt('PORT', 3000),
    },
    // Binds this service's own queue to the shared exchange.
    messaging: messagingConfiguration({
      exchange: 'orders.events',
      queue: 'notifications.order-events',
    }),
  };
}
