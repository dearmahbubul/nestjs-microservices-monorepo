export type MessagingTransport = 'tcp' | 'rmq';

/**
 * How an RMQ connection addresses its queue.
 *
 * `queue`  — plain queue, no exchange. Used for request/response: a command
 *            client and its server agree on one queue name and the reply
 *            channel is a separate exclusive queue.
 * `fanout` — a single exchange every subscriber binds its own queue to. This
 *            is what makes an *event* reach several services: publishing to a
 *            plain queue delivers to one queue only, so a second consumer
 *            silently never sees the message.
 */
export type MessagingMode = 'queue' | 'fanout';

export interface MessagingConfig {
  transport: MessagingTransport;
  mode: MessagingMode;
  /** Name of the single exchange events fan out through. */
  exchange: string;
  retryAttempts: number;
  retryDelayMs: number;
  host: string;
  port: number;
  url: string;
  queue: string;
  queueDurable: boolean;
  prefetchCount: number;
}

export interface MessagingConfigOptions {
  queue?: string;
  mode?: MessagingMode;
  exchange?: string;
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

function toTransport(raw: string | undefined): MessagingTransport {
  const value = raw?.toLowerCase() ?? 'rmq';
  if (value !== 'tcp' && value !== 'rmq') {
    throw new Error(
      `Invalid MESSAGING_TRANSPORT: expected 'tcp' or 'rmq', got '${value}'`,
    );
  }
  return value;
}

function toMode(raw: string | undefined): MessagingMode {
  const value = raw?.toLowerCase() ?? 'queue';
  if (value !== 'queue' && value !== 'fanout') {
    throw new Error(
      `Invalid MESSAGING_MODE: expected 'queue' or 'fanout', got '${value}'`,
    );
  }
  return value;
}

export function messagingConfiguration(
  options: MessagingConfigOptions = {},
): MessagingConfig {
  return {
    transport: toTransport(process.env.MESSAGING_TRANSPORT),
    mode: toMode(process.env.MESSAGING_MODE ?? options.mode),
    exchange:
      process.env.MESSAGING_EXCHANGE ??
      options.exchange ??
      'app.events',
    retryAttempts: toInt('MESSAGING_RETRY_ATTEMPTS', 5),
    retryDelayMs: toInt('MESSAGING_RETRY_DELAY_MS', 3000),
    host: process.env.MESSAGING_HOST ?? 'localhost',
    port: toInt('MESSAGING_PORT', 4000),
    url:
      process.env.MESSAGING_URL ??
      process.env.RABBITMQ_URL ??
      'amqp://app:app@localhost:5672',
    // An explicitly requested queue wins over MESSAGING_QUEUE. A service
    // builds a *second* connection (e.g. an event-bus consumer) whose queue is
    // not the same as the private reply queue, and letting the ambient env var
    // override it would silently collapse both roles onto one queue.
    queue: options.queue ?? process.env.MESSAGING_QUEUE ?? 'service.events',
    queueDurable: toBool('MESSAGING_QUEUE_DURABLE', true),
    prefetchCount: toInt('MESSAGING_PREFETCH_COUNT', 1),
  };
}