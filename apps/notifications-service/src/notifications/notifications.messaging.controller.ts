import { ORDER_CREATED, type OrderCreatedEvent } from '@repo/contracts';
import { Controller, Logger } from '@nestjs/common';
import { EventPattern, Payload } from '@nestjs/microservices';
import { NotificationsService } from './notifications.service.js';

// @EventPattern, not @MessagePattern: the order is already placed and
// answered, so nothing is waiting on a reply here.
@Controller()
export class NotificationsMessagingController {
  private readonly logger = new Logger(NotificationsMessagingController.name);

  constructor(private readonly notifications: NotificationsService) {}

  @EventPattern(ORDER_CREATED)
  onOrderCreated(@Payload() event: OrderCreatedEvent): void {
    if (!event?.eventId || !event.customerEmail) {
      this.logger.error(
        `Ignoring malformed ${ORDER_CREATED} event (order ${event?.orderId ?? 'unknown'})`,
      );
      return;
    }

    this.notifications.sendOrderConfirmation(event);
  }
}
