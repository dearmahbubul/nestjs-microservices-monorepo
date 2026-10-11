import { Transport } from '@nestjs/microservices';
import { describe, expect, it } from 'vitest';
import type { MessagingConfig } from './messaging.config.js';
import { toServerOptions } from './messaging.options.js';

function config(overrides: Partial<MessagingConfig> = {}): MessagingConfig {
  return {
    transport: 'rmq',
    mode: 'queue',
    exchange: 'orders.events',
    retryAttempts: 5,
    retryDelayMs: 3000,
    host: 'localhost',
    port: 4000,
    url: 'amqp://app:app@localhost:5672',
    queue: 'service.events',
    queueDurable: true,
    prefetchCount: 1,
    ...overrides,
  };
}

describe('toServerOptions', () => {
  it('disables acks on the fanout connection', () => {
    // Regression guard. The Nest RMQ server only calls channel.ack() for
    // messages that carry an `id`, and events (sent with `emit`) never do. So
    // with noAck:false every event permanently consumes a prefetch slot and the
    // consumer silently stops receiving after `prefetchCount` messages.
    const options = toServerOptions(
      config({ mode: 'fanout', queue: 'catalog.order-events' }),
    );

    expect(options.transport).toBe(Transport.RMQ);
    expect(options.options).toMatchObject({
      noAck: true,
      exchange: 'orders.events',
      exchangeType: 'fanout',
      queue: 'catalog.order-events',
    });
  });

  it('keeps acks enabled on the request/response connection', () => {
    // Commands do carry an id and are acked, which releases the slot.
    const options = toServerOptions(config({ mode: 'queue' }));

    expect(options.options).toMatchObject({ noAck: false });
    expect(options.options).not.toHaveProperty('exchange');
  });
});
