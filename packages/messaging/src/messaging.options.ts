import {
  Transport,
  type ClientOptions,
  type MicroserviceOptions,
  type RmqOptions,
} from '@nestjs/microservices';
import type { MessagingConfig } from './messaging.config.js';

/**
 * RMQ options for the shared fanout event exchange.
 *
 * Events are published to one exchange that every subscriber binds its own
 * queue to, so a single event reaches all of them. Publishing straight to a
 * queue would deliver to one consumer only, so a second service would silently
 * never receive it. A fanout exchange ignores the routing key; Nest names the
 * exchange `exchange ?? queue`, so every participant sets the same explicit
 * `exchange`.
 */
function rmqOptions(config: MessagingConfig) {
  return {
    urls: [config.url],
    queue: config.queue,
    prefetchCount: config.prefetchCount,
    queueOptions: { durable: config.queueDurable },
    exchange: config.exchange,
    exchangeType: 'fanout' as const,
  };
}

export function toClientOptions(config: MessagingConfig): ClientOptions {
  return {
    transport: Transport.RMQ,
    options: {
      ...rmqOptions(config),
      persistent: true,
    },
  } satisfies RmqOptions;
}

export function toServerOptions(config: MessagingConfig): MicroserviceOptions {
  return {
    transport: Transport.RMQ,
    options: {
      ...rmqOptions(config),
      // Events are sent with `emit` and carry no `id`, and the Nest RMQ server
      // only acks messages that have one. With acks on, every event would hold
      // a prefetch slot for the life of the channel, and the consumer would go
      // deaf after `prefetchCount` messages. Fire-and-forget has no ack to
      // withhold; a crash mid-handler loses that one event by design.
      noAck: true,
    },
  } satisfies RmqOptions;
}
