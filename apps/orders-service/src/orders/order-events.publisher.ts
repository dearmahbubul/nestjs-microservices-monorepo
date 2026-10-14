import {
  ORDER_CREATED,
  type OrderCreatedEvent,
} from '@repo/contracts';
import { Injectable, Logger } from '@nestjs/common';
import { MessagingService } from '@repo/messaging';
import { randomUUID } from 'node:crypto';
import type { Order } from '../database/order.entity.js';

// Publishes the order domain events other services react to. Kept separate
// from OrdersService so persistence does not depend on the transport.
@Injectable()
export class OrderEventsPublisher {
  private readonly logger = new Logger(OrderEventsPublisher.name);

  constructor(private readonly messaging: MessagingService) {}

  // Never throws: the order is already committed, and a broker outage must not
  // turn a successful checkout into a 500. A failed publish is logged loudly.
  announceCreated(order: Order): void {
    const event: OrderCreatedEvent = {
      eventId: randomUUID(),
      orderId: order.id,
      customerEmail: order.customerEmail,
      total: order.total,
      items: order.items.map((item) => ({
        productId: item.productId,
        name: item.name,
        unitPrice: item.unitPrice,
        quantity: item.quantity,
        lineTotal: item.lineTotal,
      })),
      occurredAt: new Date().toISOString(),
    };

    try {
      this.messaging.publishEvent(ORDER_CREATED, event);
      this.logger.log(
        `Published ${ORDER_CREATED} for order ${order.id} (event ${event.eventId})`,
      );
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.logger.error(
        `Failed to publish ${ORDER_CREATED} for order ${order.id}: ${message}`,
      );
    }
  }
}
