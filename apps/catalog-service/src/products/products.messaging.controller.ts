import { ORDER_CREATED, type OrderCreatedEvent } from '@repo/contracts';
import { Controller, Logger } from '@nestjs/common';
import { EventPattern, Payload } from '@nestjs/microservices';
import { ProductsService } from './products.service.js';

/**
 * Reacts to orders placed elsewhere.
 *
 * This is the event each consumer service exists for: taking an order's items
 * out of available stock. It is an `@EventPattern`, so there is no reply — the
 * publisher has already answered its caller and must not be blocked by us.
 */
@Controller()
export class ProductsMessagingController {
  private readonly logger = new Logger(ProductsMessagingController.name);

  constructor(private readonly products: ProductsService) {}

  @EventPattern(ORDER_CREATED)
  async onOrderCreated(@Payload() event: OrderCreatedEvent): Promise<void> {
    // An event without an eventId cannot be made idempotent, and reserving
    // stock on one is worse than not reserving at all. Refuse it loudly.
    if (!event?.eventId) {
      this.logger.error(
        `Ignoring ${ORDER_CREATED} without an eventId (order ${event?.orderId ?? 'unknown'})`,
      );
      return;
    }

    const result = await this.products.reserveStock({
      eventId: event.eventId,
      orderId: event.orderId,
      items: event.items.map((item) => ({
        productId: item.productId,
        quantity: item.quantity,
      })),
    });

    if (!result.ok) {
      // Stock could not be reserved. The order is already confirmed, so this
      // is an operational alert rather than a caller-visible failure; the
      // compensating-action/back-order flow is deliberately not built yet.
      this.logger.error(
        `Could not reserve stock for order ${event.orderId} (event ${event.eventId}): ${result.failures
          .map((f) => `${f.productId} needs ${f.requested}, has ${f.available}`)
          .join('; ')}`,
      );
      return;
    }

    this.logger.log(
      `Stock reserved for order ${event.orderId} (event ${event.eventId})`,
    );
  }
}
