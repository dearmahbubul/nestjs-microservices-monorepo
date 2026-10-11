/**
 * Messaging pattern names, shared by every service.
 *
 * A publisher and a consumer that disagree by one character fail silently —
 * the message is routed to a queue nobody reads and the sender never learns.
 * Routing both sides through these constants turns that typo into a compile
 * error instead of a missing order confirmation.
 */

// ---------------------------------------------------------------- commands
// Request/response command patterns (`client.send` / `@MessagePattern`).

/** `catalog` -> product list. No payload. */
export const PRODUCTS_FIND_ALL = 'products.findAll';

/** `catalog` -> single product. Payload: product id. */
export const PRODUCTS_FIND_ONE = 'products.findOne';

/** `catalog` reserve stock. Payload: `ReserveStockRequest`. */
export const PRODUCTS_RESERVE = 'products.reserve';

/** `orders` -> order list. No payload. */
export const ORDERS_FIND_ALL = 'orders.findAll';

/** `orders` -> single order. Payload: order id. */
export const ORDERS_FIND_ONE = 'orders.findOne';

/** `orders` -> place an order. Payload: `CreateOrderDto`. */
export const ORDERS_CREATE = 'orders.create';

// ---------------------------------------------------------------- events
// Fire-and-forget events (`emit` / `@EventPattern`). No reply is sent, so a
// publisher must not depend on one.

/** Placed by `orders`, consumed by `catalog` and `notifications`. */
export const ORDER_CREATED = 'order.created';

/** Emitted by `catalog` once stock is reserved (or refused). */
export const ORDER_STOCK_RESERVED = 'order.stock-reserved';

/** Emitted by `catalog` when stock could not be reserved. */
export const ORDER_STOCK_REJECTED = 'order.stock-rejected';

export type OrderCommandPattern =
  | typeof ORDERS_CREATE
  | typeof ORDERS_FIND_ALL
  | typeof ORDERS_FIND_ONE;

export type ProductCommandPattern =
  | typeof PRODUCTS_FIND_ALL
  | typeof PRODUCTS_FIND_ONE
  | typeof PRODUCTS_RESERVE;

export type OrderEventPattern =
  | typeof ORDER_CREATED
  | typeof ORDER_STOCK_RESERVED
  | typeof ORDER_STOCK_REJECTED;
