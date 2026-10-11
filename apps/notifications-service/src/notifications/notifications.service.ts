import { Injectable, Logger } from '@nestjs/common';
import type { OrderCreatedEvent } from '@repo/contracts';
import { randomUUID } from 'node:crypto';

/**
 * Sends customer-facing order notifications.
 *
 * There is no real mail/SMS provider wired up yet, so a "send" is a structured
 * log record plus an in-memory record of what was sent. That keeps the flow
 * honest — the transport and idempotency are real, only the final delivery
 * step is a stub — and makes it a single-file change to swap in a provider.
 */
export interface SentNotification {
  id: string;
  channel: 'email';
  to: string;
  subject: string;
  body: string;
  sentAt: string;
  /** The `order.created` event this was sent for. */
  eventId: string;
}

@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);

  /** Most recent first. Bounded so a long-running demo cannot leak. */
  private readonly sent: SentNotification[] = [];
  private static readonly MAX_KEPT = 100;

  /**
   * Confirms a placed order by email.
   *
   * Idempotent by `eventId`: a redelivered event is recognised and not sent
   * twice. The guard is an in-memory set, which is correct for a single
   * instance; a multi-instance deployment needs a shared store (Redis sits
   * right there in the compose stack) — noted rather than pretended.
   */
  sendOrderConfirmation(event: OrderCreatedEvent): SentNotification {
    const already = this.sent.find((n) => n.eventId === event.eventId);
    if (already) {
      this.logger.log(
        `Confirmation for event ${event.eventId} already sent (${already.id}), skipping`,
      );
      return already;
    }

    const lines = event.items
      .map(
        (item) =>
          `  - ${item.quantity} x ${item.name} @ ${item.unitPrice} = ${item.lineTotal}`,
      )
      .join('\n');

    const notification: SentNotification = {
      id: randomUUID(),
      channel: 'email',
      to: event.customerEmail,
      subject: `Your order ${event.orderId} is confirmed`,
      body: [
        'Thanks for your order.',
        '',
        `Order: ${event.orderId}`,
        `Total: ${event.total}`,
        '',
        'Items:',
        lines,
      ].join('\n'),
      sentAt: new Date().toISOString(),
      eventId: event.eventId,
    };

    this.sent.unshift(notification);
    if (this.sent.length > NotificationsService.MAX_KEPT) {
      this.sent.length = NotificationsService.MAX_KEPT;
    }

    this.logger.log(
      `Sent order confirmation ${notification.id} to ${notification.to} for order ${event.orderId}`,
    );
    return notification;
  }

  /** Newest first. Backs the read-only debug endpoint. */
  listSent(): SentNotification[] {
    return this.sent;
  }
}
