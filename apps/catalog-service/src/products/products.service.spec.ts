import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ReserveStockRequest } from '@repo/contracts';
import { OrderPlacement } from '../database/order-placement.entity.js';
import { Product } from '../database/product.entity.js';
import { ProductsService } from './products.service.js';

/**
 * The reservation path is the one piece of business logic in this service
 * worth pinning down: it must take stock exactly once per order, and it must
 * never leave a partial reservation behind.
 *
 * A hand-rolled fake stands in for the TypeORM manager so the test drives the
 * real service code without a database.
 */
interface FakeManager {
  findOne: ReturnType<typeof vi.fn>;
  createQueryBuilder: ReturnType<typeof vi.fn>;
  save: ReturnType<typeof vi.fn>;
  create: ReturnType<typeof vi.fn>;
}

function buildProduct(id: string, stock: number): Product {
  return { id, name: `Product ${id}`, price: '10.00', stock } as Product;
}

function buildManager(options: {
  placements?: OrderPlacement[];
  products: Map<string, Product>;
}): { manager: FakeManager; saved: OrderPlacement[]; savedProducts: Product[] } {
  const saved: OrderPlacement[] = [];
  const savedProducts: Product[] = [];

  const manager: FakeManager = {
    findOne: vi
      .fn()
      .mockImplementation(
        async (_entity: unknown, opts: { where: { eventId: string } }) =>
          options.placements?.find((p) => p.eventId === opts.where.eventId) ??
          null,
      ),
    createQueryBuilder: vi.fn().mockImplementation(() => {
      const qb = {
        setLock: () => qb,
        where: (_sql: string, params: { id: string }) => {
          qb._id = params.id;
          return qb;
        },
        getOne: async () => options.products.get(qb._id) ?? null,
        _id: '',
      };
      return qb;
    }),
    // Two forms are used by the service: `save(Product, entity)` for a stock
    // decrement and `save(entity)` for the placement record.
    save: vi.fn().mockImplementation(async (a: unknown, b?: unknown) => {
      if (b !== undefined) {
        savedProducts.push(b as Product);
        return b;
      }
      saved.push(a as OrderPlacement);
      return a;
    }),
    create: vi.fn().mockImplementation((_entity: unknown, value: unknown) => value),
  };

  return { manager, saved, savedProducts };
}

async function buildService(
  products: Map<string, Product>,
  placements: OrderPlacement[] = [],
) {
  const { manager, saved, savedProducts } = buildManager({ products, placements });

  const dataSource = {
    transaction: async <T>(run: (m: unknown) => Promise<T>): Promise<T> =>
      run(manager),
  } as unknown as DataSource;

  const moduleRef = await Test.createTestingModule({
    providers: [
      ProductsService,
      { provide: getRepositoryToken(Product), useValue: {} },
      { provide: getRepositoryToken(OrderPlacement), useValue: {} },
      { provide: DataSource, useValue: dataSource },
    ],
  }).compile();

  return {
    service: moduleRef.get(ProductsService),
    saved,
    savedProducts,
  };
}

describe('ProductsService.reserveStock', () => {
  let products: Map<string, Product>;

  beforeEach(() => {
    products = new Map([
      ['p1', buildProduct('p1', 5)],
      ['p2', buildProduct('p2', 2)],
    ]);
  });

  it('reserves stock and records the event', async () => {
    const { service, saved, savedProducts } = await buildService(products);

    const request: ReserveStockRequest = {
      eventId: 'event-1',
      orderId: 'order-1',
      items: [
        { productId: 'p1', quantity: 2 },
        { productId: 'p2', quantity: 1 },
      ],
    };

    const result = await service.reserveStock(request);

    expect(result.ok).toBe(true);
    expect(result.lines).toEqual([
      { productId: 'p1', requested: 2, remaining: 3 },
      { productId: 'p2', requested: 1, remaining: 1 },
    ]);
    expect(saved).toHaveLength(1);
    expect(saved[0]?.eventId).toBe('event-1');
    expect(saved[0]?.unitsReserved).toBe(3);
    expect(savedProducts).toHaveLength(2);
  });

  it('is idempotent: a redelivered event does not reserve twice', async () => {
    const existing = {
      eventId: 'event-1',
      orderId: 'order-1',
      unitsReserved: 2,
    } as OrderPlacement;
    const { service } = await buildService(products, [existing]);

    const result = await service.reserveStock({
      eventId: 'event-1',
      orderId: 'order-1',
      items: [{ productId: 'p1', quantity: 2 }],
    });

    expect(result.ok).toBe(true);
    expect(result.lines).toEqual([]);
    // The stock must be untouched by the replay.
    expect(products.get('p1')?.stock).toBe(5);
  });

  it('refuses the whole order when any line is short', async () => {
    const { service, saved } = await buildService(products);

    const result = await service.reserveStock({
      eventId: 'event-2',
      orderId: 'order-2',
      items: [
        { productId: 'p1', quantity: 1 },
        { productId: 'p2', quantity: 99 },
      ],
    });

    expect(result.ok).toBe(false);
    expect(result.lines).toEqual([]);
    expect(result.failures).toEqual([
      { productId: 'p2', requested: 99, available: 2, reason: 'insufficient-stock' },
    ]);
    // No placement may be recorded for a rejected reservation. The stock
    // writes themselves are undone by the transaction rollback in production;
    // what must never survive is the marker that says "this order was applied".
    expect(saved).toHaveLength(0);
    expect(products.get('p2')?.stock).toBe(2);
  });

  it('reports an unknown product as a failure, not a crash', async () => {
    const { service } = await buildService(products);

    const result = await service.reserveStock({
      eventId: 'event-3',
      orderId: 'order-3',
      items: [{ productId: 'nope', quantity: 1 }],
    });

    expect(result.ok).toBe(false);
    expect(result.failures[0]).toMatchObject({
      productId: 'nope',
      reason: 'unknown-product',
    });
  });
});
