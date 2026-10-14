import type { ProductSeed } from './product.seed.js';

// Generates `count` random demo products. Ids are freshly generated per run,
// so a reseed against an empty collection yields a different catalog. Faker
// is imported lazily: it is only needed on the seeding path.
export async function generateFakeProducts(
  count: number,
): Promise<ProductSeed[]> {
  const { faker } = await import('@faker-js/faker');

  return Array.from({ length: Math.max(count, 0) }, () => ({
    id: faker.string.uuid(),
    name: faker.commerce.productName(),
    price: faker.commerce.price({ min: 5, max: 2000, dec: 2 }),
    stock: faker.number.int({ min: 0, max: 100 }),
  }));
}
