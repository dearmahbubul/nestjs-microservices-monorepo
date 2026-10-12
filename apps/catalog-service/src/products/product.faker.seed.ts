import type { ProductSeed } from './product.seed.js';

/**
 * Generates `count` random demo products.
 *
 * Ids are freshly generated per run, so a reseed against an empty table yields
 * a different catalog each time. Kept separate from the fixed `PRODUCT_SEED`
 * (whose ids seeded orders reference) so the two concerns stay distinct.
 *
 * `@faker-js/faker` is imported lazily: it is only needed on the seeding path,
 * and loading its locale bundles eagerly would slow every import of this module.
 */
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
