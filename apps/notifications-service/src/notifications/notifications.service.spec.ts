import { Test } from '@nestjs/testing';
import { describe, expect, it } from 'vitest';
import type { OrderCreatedEvent } from '@repo/contracts';
import { NotificationsService } from './notifications.service.js';

function buildEvent(overrides: Partial<OrderCreatedEvent> = {}): OrderCreatedEvent {
  return {
    eventId: 'event-1',
    orderId: 'order-1',
    customerEmail: 'buyer@example.com',
    total: '189.89',
    items: [
      {
        productId: 'p1',
        name: 'Mechanical Keyboard',
        unitPrice: '129.99',
        quantity: 1,
        lineTotal: '129.99',
      },
    ],
    occurredAt: '2026-10-10T00:00:00.000Z',
    ...overrides,
  };
}

async function buildService(): Promise<NotificationsService> {
  const moduleRef = await Test.createTestingModule({
    providers: [NotificationsService],
  }).compile();
  return moduleRef.get(NotificationsService);
}

describe('NotificationsService.sendOrderConfirmation', () => {
  it('sends a confirmation addressed to the customer', async () => {
    const service = await buildService();

    const sent = service.sendOrderConfirmation(buildEvent());

    expect(sent.to).toBe('buyer@example.com');
    expect(sent.subject).toContain('order-1');
    expect(sent.body).toContain('Mechanical Keyboard');
    expect(sent.body).toContain('189.89');
    expect(service.listSent()).toHaveLength(1);
  });

  it('sends exactly once for a redelivered event', async () => {
    const service = await buildService();
    const event = buildEvent();

    const first = service.sendOrderConfirmation(event);
    const second = service.sendOrderConfirmation(event);

    expect(second.id).toBe(first.id);
    expect(service.listSent()).toHaveLength(1);
  });

  it('treats a different event as a new confirmation', async () => {
    const service = await buildService();

    service.sendOrderConfirmation(buildEvent());
    service.sendOrderConfirmation(buildEvent({ eventId: 'event-2', orderId: 'order-2' }));

    expect(service.listSent()).toHaveLength(2);
  });
});
