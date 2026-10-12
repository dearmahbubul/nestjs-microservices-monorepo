import { toBool, toInt } from '@repo/config';

/**
 * Messaging configuration, shared by the event publisher and its consumers.
 *
 * This project uses RabbitMQ for one job: fanning out domain events. Every
 * participant publishes to (or binds a queue to) a single exchange, so an event
 * reaches all subscribers. Request/response commands are deliberately not part
 * of the mix — synchronous reads and writes go through the HTTP gateway.
 */
export interface MessagingConfig {
  /** Name of the single exchange events fan out through. */
  exchange: string;
  url: string;
  queue: string;
  queueDurable: boolean;
  prefetchCount: number;
}

export interface MessagingConfigOptions {
  /** Queue name for this participant; a service names its own event queue. */
  queue?: string;
  exchange?: string;
}

export function messagingConfiguration(
  options: MessagingConfigOptions = {},
): MessagingConfig {
  return {
    exchange:
      process.env.MESSAGING_EXCHANGE ?? options.exchange ?? 'app.events',
    url:
      process.env.MESSAGING_URL ??
      process.env.RABBITMQ_URL ??
      'amqp://app:app@localhost:5672',
    // An explicitly named queue wins over MESSAGING_QUEUE: a service names its
    // own event queue in code so two services can never collapse onto one.
    queue: options.queue ?? process.env.MESSAGING_QUEUE ?? 'service.events',
    queueDurable: toBool('MESSAGING_QUEUE_DURABLE', true),
    prefetchCount: toInt('MESSAGING_PREFETCH_COUNT', 1),
  };
}
