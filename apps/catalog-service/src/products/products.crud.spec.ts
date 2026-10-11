import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { describe, expect, it } from 'vitest';
import { OrderPlacement } from '../database/order-placement.entity.js';
import { Product } from '../database/product.entity.js';
import { ProductsService } from './products.service.js';

/**
 * CRUD on the catalog. The rules worth pinning down are the ones the admin UI
 * depends on: money is normalised to a 2-decimal string, a partial update only
 * touches the fields it was given, and "no such product" is a 404 rather than a
 * silent success.
 *
 * A hand-rolled fake stands in for the TypeORM repository, mirroring the
 * approach in `products.service.spec.ts` — the real service code runs, no
 * database is needed.
 */
function buildRepo(seed: Product[] = []) {
  const store = new Map<string, Product>(seed.map((p) => [p.id, { ...p }]));
  let seq = 0;

  const repo = {
    create: (value: Partial<Product>) => ({ ...value }) as Product,
    save: async (product: Product) => {
      if (!product.id) {
        product.id = `generated-${++seq}`;
      }
      store.set(product.id, product);
      return product;
    },
    find: async () => [...store.values()],
    findOne: async ({ where }: { where: { id: string } }) =>
      store.get(where.id) ?? null,
    delete: async ({ id }: { id: string }) => ({
      affected: store.delete(id) ? 1 : 0,
    }),
    count: async () => store.size,
  };

  return { repo, store };
}

function buildProduct(overrides: Partial<Product> = {}): Product {
  return {
    id: 'p1',
    name: 'Mechanical Keyboard',
    price: '129.99',
    stock: 25,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  } as Product;
}

async function buildService(seed: Product[] = []) {
  const { repo, store } = buildRepo(seed);

  const moduleRef = await Test.createTestingModule({
    providers: [
      ProductsService,
      { provide: getRepositoryToken(Product), useValue: repo },
      { provide: getRepositoryToken(OrderPlacement), useValue: {} },
      { provide: DataSource, useValue: {} },
    ],
  }).compile();

  return { service: moduleRef.get(ProductsService), store };
}

describe('ProductsService CRUD', () => {
  describe('create', () => {
    it('normalises the name and price, and defaults stock to 0', async () => {
      const { service, store } = await buildService();

      const created = await service.create({
        name: '  USB-C Hub  ',
        price: '49.5',
      });

      expect(created.name).toBe('USB-C Hub');
      expect(created.price).toBe('49.50');
      expect(created.stock).toBe(0);
      expect(created.id).toBeTruthy();
      expect(store.get(created.id)?.name).toBe('USB-C Hub');
    });

    it('accepts a numeric price and rounds to 2 decimals', async () => {
      const { service } = await buildService();

      const created = await service.create({ name: 'Cable', price: 9.999 });

      expect(created.price).toBe('10.00');
    });

    it.each([
      ['a blank name', { name: '   ', price: '1.00' }],
      ['a missing name', { price: '1.00' }],
      ['a negative price', { name: 'Cable', price: '-1' }],
      ['a non-numeric price', { name: 'Cable', price: 'free' }],
      ['a fractional stock', { name: 'Cable', price: '1.00', stock: 1.5 }],
      ['a negative stock', { name: 'Cable', price: '1.00', stock: -3 }],
    ])('rejects %s', async (_label, dto) => {
      const { service, store } = await buildService();

      await expect(
        service.create(dto as Parameters<ProductsService['create']>[0]),
      ).rejects.toThrow();
      expect(store.size).toBe(0);
    });
  });

  describe('update', () => {
    it('changes only the fields provided', async () => {
      const { service } = await buildService([buildProduct()]);

      const updated = await service.update('p1', { name: 'Renamed' });

      expect(updated.name).toBe('Renamed');
      // Untouched fields must survive a partial update.
      expect(updated.price).toBe('129.99');
      expect(updated.stock).toBe(25);
    });

    it('normalises a price change to a 2-decimal string', async () => {
      const { service } = await buildService([buildProduct()]);

      const updated = await service.update('p1', { price: 100 });

      expect(updated.price).toBe('100.00');
    });

    it('rejects an invalid field value', async () => {
      const { service, store } = await buildService([buildProduct()]);

      await expect(service.update('p1', { price: -5 })).rejects.toThrow();
      expect(store.get('p1')?.price).toBe('129.99');
    });

    it('throws NotFound for an unknown id', async () => {
      const { service } = await buildService();

      await expect(service.update('nope', { name: 'x' })).rejects.toThrow(
        /not found/i,
      );
    });
  });

  describe('remove', () => {
    it('deletes an existing product', async () => {
      const { service, store } = await buildService([buildProduct()]);

      await service.remove('p1');

      expect(store.has('p1')).toBe(false);
    });

    it('throws NotFound instead of silently succeeding', async () => {
      const { service } = await buildService();

      await expect(service.remove('nope')).rejects.toThrow(/not found/i);
    });
  });

  describe('findOne', () => {
    it('throws NotFound for an unknown id', async () => {
      const { service } = await buildService();

      await expect(service.findOne('nope')).rejects.toThrow(/not found/i);
    });
  });
});
