import { Controller, Get } from '@nestjs/common';
import { NotificationsService } from './notifications.service.js';

/**
 * Read-only view of what this service has sent.
 *
 * Debug affordance: with delivery stubbed to a log, this is how you confirm
 * from the outside that an order actually produced exactly one confirmation.
 * Reachable through the gateway at `GET /notifications`.
 */
@Controller('notifications')
export class NotificationsController {
  constructor(private readonly notifications: NotificationsService) {}

  @Get()
  list() {
    const sent = this.notifications.listSent();
    return { count: sent.length, notifications: sent };
  }
}
