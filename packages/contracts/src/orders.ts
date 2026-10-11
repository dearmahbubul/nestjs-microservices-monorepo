/**
 * The order domain contract.
 *
 * These types are the wire format between services. Money crosses the wire as
 * a decimal *string* (e.g. `"129.99"`), never a float: the same convention the
 * order and product entities already use, and the only one that survives a
 * round trip through JSON without picking up binary rounding noise.
 */

/** A single line of an order, as published to other services. */
export interface OrderCreatedItem {
  productId: string;
  name: string;
  /** Decimal string, e.g. `"129.99"`. */
  unitPrice: string;
  quantity: number;
  /** Decimal string: `unitPrice * quantity`. */
  lineTotal: string;
}

/**
 * `order.created` — published by `orders-service` immediately after an order
 * is persisted.
 *
 * `eventId` is the idempotency key. Every consumer records the ids it has
 * processed, so a redelivered message (RabbitMQ is at-least-once) reserves
 * stock and sends the confirmation exactly once.
 */
export interface OrderCreatedEvent {
  eventId: string;
  orderId: string;
  customerEmail: string;
  /** Decimal string: the order total. */
  total: string;
  items: OrderCreatedItem[];
  /** ISO-8601 timestamp of when the event was published. */
  occurredAt: string;
}

// ------------------------------------------------------- reserve stock RPC

/** One line of a `ReserveStockRequest`. */
export interface ReserveStockItem {
  productId: string;
  quantity: number;
}

/**
 * `products.reserve` — synchronous stock reservation.
 *
 * Kept synchronous on purpose: `orders-service` needs an answer inside the
 * request it is already serving, so a reservation cannot be an event.
 */
export interface ReserveStockRequest {
  /** Idempotency key — normally the originating `OrderCreatedEvent.eventId`. */
  eventId: string;
  orderId: string;
  items: ReserveStockItem[];
}

/** One line of a `ReserveStockResponse`. */
export interface ReserveStockLine {
  productId: string;
  requested: number;
  /** Stock level after a successful reservation. */
  remaining: number;
}

/** A line that could not be reserved, and why. */
export interface ReserveStockFailure {
  productId: string;
  requested: number;
  available: number;
  reason: 'insufficient-stock' | 'unknown-product';
}

/**
 * The answer to `products.reserve`. This is a *result* shape, not an error:
 * "not enough stock" is an expected business outcome, so it comes back as
 * data the caller can act on rather than a thrown exception it has to parse.
 */
export interface ReserveStockResponse {
  orderId: string;
  ok: boolean;
  lines: ReserveStockLine[];
  failures: ReserveStockFailure[];
}
