export interface ProductSeed {
  id: string;
  name: string;
  price: string;
  stock: number;
}

// Fixed ids keep the seed idempotent and let orders reference known products.
// Stock values are deliberately small and different per product so a demo can
// show both a successful reservation and a rejection.
export const PRODUCT_SEED: readonly ProductSeed[] = [
  {
    id: '11111111-1111-4111-8111-111111111111',
    name: 'Mechanical Keyboard',
    price: '129.99',
    stock: 25,
  },
  {
    id: '22222222-2222-4222-8222-222222222222',
    name: 'Wireless Mouse',
    price: '59.90',
    stock: 40,
  },
  {
    id: '33333333-3333-4333-8333-333333333333',
    name: '27-inch 4K Monitor',
    price: '399.00',
    stock: 8,
  },
  {
    id: '44444444-4444-4444-8444-444444444444',
    name: 'USB-C Hub',
    price: '49.50',
    stock: 60,
  },
  {
    id: '55555555-5555-4555-8555-555555555555',
    name: 'Noise-Cancelling Headphones',
    price: '249.00',
    stock: 12,
  },
];
