/**
 * Token for the `ClientProxy` that publishes domain events to the shared
 * fanout exchange. Null when a service registers no `messaging` config.
 */
export const MESSAGING_CLIENT = Symbol('MESSAGING_CLIENT');
