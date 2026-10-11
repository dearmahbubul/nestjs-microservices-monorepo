import {
  Transport,
  type ClientOptions,
  type MicroserviceOptions,
  type RmqOptions,
} from '@nestjs/microservices';
import type { MessagingConfig } from './messaging.config.js';

/**
 * RMQ options shared by clients and servers.
 *
 * The Nest RMQ transport has a sharp edge worth stating once: without an
 * exchange, `emit` publishes straight to the connection's own `queue`
 * (`sendToQueue`), so an event reaches exactly one queue. Two consumers on two
 * queues means the second one silently never fires — no error, just a message
 * nobody reads.
 *
 * `mode: 'fanout'` fixes that by routing through one exchange every
 * subscriber binds to. The routing key is ignored by a fanout exchange, and
 * both `ClientRMQ` and `ServerRMQ` name the exchange `exchange ?? queue`, so
 * *every* participant must set the same explicit `exchange`. That is exactly
 * what `MessagingConfig.exchange` is for.
 */
function rmqOptions(config: MessagingConfig) {
  const fanout = config.mode === 'fanout';
  return {
    urls: [config.url],
    queue: config.queue,
    prefetchCount: config.prefetchCount,
    queueOptions: { durable: config.queueDurable },
    ...(fanout
      ? {
          exchange: config.exchange,
          exchangeType: 'fanout' as const,
        }
      : {}),
  };
}

export function toClientOptions(config: MessagingConfig): ClientOptions {
  if (config.transport === 'tcp') {
    return {
      transport: Transport.TCP,
      options: {
        host: config.host,
        port: config.port,
      },
    };
  }

  return {
    transport: Transport.RMQ,
    options: {
      ...rmqOptions(config),
      persistent: true,
    },
  } satisfies RmqOptions;
}

export function toServerOptions(config: MessagingConfig): MicroserviceOptions {
  if (config.transport === 'tcp') {
    return {
      transport: Transport.TCP,
      options: {
        host: config.host,
        port: config.port,
        retryAttempts: config.retryAttempts,
        retryDelay: config.retryDelayMs,
      },
    };
  }

  return {
    transport: Transport.RMQ,
    options: {
      ...rmqOptions(config),
      // Acking depends on what the connection carries:
      //
      //  - 'fanout' means this connection exists purely to receive domain
      //    events, which are always sent with `emit` and therefore have no
      //    `id`. The Nest RMQ server returns from `handleMessage` before the
      //    `channel.ack()` path whenever a message has no `id`, so events are
      //    never acknowledged. With `noAck: false` that is fatal rather than
      //    untidy: every event holds a prefetch slot for the life of the
      //    channel, so after `prefetchCount` events the consumer goes deaf.
      //    The first event is handled and everything after it is silently
      //    ignored, which is exactly the failure that survives casual testing.
      //    Fire-and-forget messages must use `noAck: true` — there is no ack
      //    to withhold. A consumer that crashes mid-handling loses that one
      //    event; that is the accepted trade for not stalling the bus.
      //
      //  - 'queue' is the request/response connection. Those messages carry an
      //    `id` and *are* acked by the server, so the slot is released and a
      //    slow consumer cannot wedge the queue.
      noAck: config.mode === 'fanout',
    },
  } satisfies RmqOptions;
}
