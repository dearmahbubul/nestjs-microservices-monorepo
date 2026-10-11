import type { CreateOrderDto } from './dto/create-order.dto.js';

// Product ids match the catalog-service product seed so a seeded order
// references real demo products.
export const ORDER_SEED: readonly CreateOrderDto[] = [
  {
    customerEmail: 'demo@example.com',
    items: [
      {
        productId: '11111111-1111-4111-8111-111111111111',
        name: 'Mechanical Keyboard',
        unitPrice: '129.99',
        quantity: 1,
      },
      {
        productId: '22222222-2222-4222-8222-222222222222',
        name: 'Wireless Mouse',
        unitPrice: '59.90',
        quantity: 2,
      },
    ],
  },
];
