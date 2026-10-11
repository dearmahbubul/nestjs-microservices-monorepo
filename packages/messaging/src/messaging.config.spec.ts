import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { messagingConfiguration } from './messaging.config.js';

const ORIGINAL_ENV = process.env;

describe('messagingConfiguration', () => {
  beforeEach(() => {
    process.env = { ...ORIGINAL_ENV };
  });

  afterEach(() => {
    process.env = ORIGINAL_ENV;
  });

  it('applies defaults when no env vars are set', () => {
    const config = messagingConfiguration({ queue: 'catalog.events' });

    expect(config).toEqual({
      transport: 'rmq',
      mode: 'queue',
      exchange: 'app.events',
      retryAttempts: 5,
      retryDelayMs: 3000,
      host: 'localhost',
      port: 4000,
      url: 'amqp://app:app@localhost:5672',
      queue: 'catalog.events',
      queueDurable: true,
      prefetchCount: 1,
    });
  });

  it('defaults to the plain-queue mode', () => {
    expect(messagingConfiguration().mode).toBe('queue');
  });

  it('accepts fanout mode with an explicit exchange', () => {
    const config = messagingConfiguration({
      mode: 'fanout',
      exchange: 'orders.events',
      queue: 'catalog.order-events',
    });

    expect(config.mode).toBe('fanout');
    expect(config.exchange).toBe('orders.events');
  });

  it('reads MESSAGING_MODE and MESSAGING_EXCHANGE from the environment', () => {
    process.env.MESSAGING_MODE = 'FANOUT';
    process.env.MESSAGING_EXCHANGE = 'env.events';

    const config = messagingConfiguration();

    expect(config.mode).toBe('fanout');
    expect(config.exchange).toBe('env.events');
  });

  it('rejects an unsupported mode', () => {
    process.env.MESSAGING_MODE = 'pubsub';

    expect(() => messagingConfiguration()).toThrow(
      /MESSAGING_MODE.*'queue' or 'fanout'/,
    );
  });

  it('reads MESSAGING_* env vars', () => {
    process.env.MESSAGING_TRANSPORT = 'tcp';
    process.env.MESSAGING_HOST = '127.0.0.1';
    process.env.MESSAGING_PORT = '5000';
    process.env.MESSAGING_URL = 'amqp://rabbitmq:5672';
    process.env.MESSAGING_QUEUE = 'orders.events';
    process.env.MESSAGING_QUEUE_DURABLE = 'false';
    process.env.MESSAGING_PREFETCH_COUNT = '10';

    const config = messagingConfiguration();

    expect(config).toMatchObject({
      transport: 'tcp',
      host: '127.0.0.1',
      port: 5000,
      url: 'amqp://rabbitmq:5672',
      queue: 'orders.events',
      queueDurable: false,
      prefetchCount: 10,
    });
  });

  it('lets an explicit queue option beat MESSAGING_QUEUE', () => {
    // A service's second connection (event bus) names its own queue; the
    // private-queue env var must not override it and collapse the two roles.
    process.env.MESSAGING_QUEUE = 'catalog.replies';

    const config = messagingConfiguration({
      mode: 'fanout',
      exchange: 'orders.events',
      queue: 'catalog.order-events',
    });

    expect(config.queue).toBe('catalog.order-events');
  });

  it('falls back to RABBITMQ_URL and the default queue option', () => {
    process.env.RABBITMQ_URL = 'amqp://infra:5672';

    const config = messagingConfiguration({ queue: 'catalog.events' });

    expect(config.url).toBe('amqp://infra:5672');
    expect(config.queue).toBe('catalog.events');
  });

  it('rejects an unsupported transport', () => {
    process.env.MESSAGING_TRANSPORT = 'kafka';

    expect(() => messagingConfiguration()).toThrow(
      /MESSAGING_TRANSPORT.*'tcp' or 'rmq'/,
    );
  });
});