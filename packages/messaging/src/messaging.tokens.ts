export const MESSAGING_CLIENT = Symbol('MESSAGING_CLIENT');

/**
 * Token for a second client connection, used to publish domain events through
 * the shared fanout exchange.
 *
 * Two connections rather than one because a single RMQ client is bound to a
 * single `queue`/`exchange` configuration: the private connection exists only
 * to receive command replies, while events must go to the fanout exchange so
 * every subscriber's queue gets a copy.
 */
export const EVENT_BUS_CLIENT = Symbol('EVENT_BUS_CLIENT');