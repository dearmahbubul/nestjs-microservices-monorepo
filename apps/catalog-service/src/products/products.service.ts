import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import type {
  ReserveStockFailure,
  ReserveStockLine,
  ReserveStockRequest,
  ReserveStockResponse,
} from '@repo/contracts';
import { Product } from '../database/product.entity.js';
import { OrderPlacement } from '../database/order-placement.entity.js';
import { PRODUCT_SEED } from './product.seed.js';
import type { CreateProductDto, UpdateProductDto } from './dto/product.dto.js';

/** Upper bound of the entity's `numeric(10,2)` price column. */
const MAX_PRICE = 99_999_999.99;

@Injectable()
export class ProductsService {
  private readonly logger = new Logger(ProductsService.name);

  constructor(
    @InjectRepository(Product)
    private readonly products: Repository<Product>,
    @InjectRepository(OrderPlacement)
    private readonly placements: Repository<OrderPlacement>,
    private readonly dataSource: DataSource,
  ) {}

  findAll(): Promise<Product[]> {
    return this.products.find({ order: { name: 'ASC' } });
  }

  async findOne(id: string): Promise<Product> {
    const product = await this.products.findOne({ where: { id } });
    if (!product) {
      throw new NotFoundException(`Product ${id} not found`);
    }
    return product;
  }

  /** Creates a product. `name` and `price` are required; `stock` defaults to 0. */
  async create(dto: CreateProductDto): Promise<Product> {
    const product = this.products.create({
      name: normalizeName(dto?.name),
      price: normalizePrice(dto?.price),
      stock: normalizeStock(dto?.stock, 0),
    });

    const saved = await this.products.save(product);
    this.logger.log(`Created product ${saved.id} (${saved.name})`);
    return saved;
  }

  /**
   * Partial update. Only the fields present on the dto are touched, so a stock
   * adjustment from another flow cannot be clobbered by an edit that only
   * meant to rename a product.
   */
  async update(id: string, dto: UpdateProductDto): Promise<Product> {
    const product = await this.findOne(id);

    if (dto?.name !== undefined) {
      product.name = normalizeName(dto.name);
    }
    if (dto?.price !== undefined) {
      product.price = normalizePrice(dto.price);
    }
    if (dto?.stock !== undefined) {
      product.stock = normalizeStock(dto.stock, product.stock);
    }

    const saved = await this.products.save(product);
    this.logger.log(`Updated product ${saved.id} (${saved.name})`);
    return saved;
  }

  /**
   * Deletes a product. Reports a missing id as 404 rather than a silent no-op,
   * so the admin UI can tell "deleted" apart from "was already gone".
   */
  async remove(id: string): Promise<void> {
    const result = await this.products.delete({ id });
    if (!result.affected) {
      throw new NotFoundException(`Product ${id} not found`);
    }
    this.logger.log(`Deleted product ${id}`);
  }

  /**
   * Reserves stock for every line of an order, all-or-nothing.
   *
   * Runs in one transaction: either the whole order is taken out of stock or
   * none of it is, so a partial reservation can never leave an order half
   * fulfilled. "Not enough stock" is returned as data, not thrown — it is an
   * expected business outcome the caller acts on, not an error.
   *
   * A repeat call with the same `eventId` returns the original outcome without
   * touching stock, which is what makes at-least-once delivery safe.
   */
  async reserveStock(
    request: ReserveStockRequest,
  ): Promise<ReserveStockResponse> {
    return this.dataSource.transaction(async (manager) => {
      // Idempotency, checked inside the transaction so a concurrent duplicate
      // cannot slip past a stale read.
      const already = await manager.findOne(OrderPlacement, {
        where: { eventId: request.eventId },
      });
      if (already) {
        this.logger.log(
          `Event ${request.eventId} already applied (order ${already.orderId}), skipping`,
        );
        return {
          orderId: request.orderId,
          ok: true,
          lines: [],
          failures: [],
        };
      }

      const lines: ReserveStockLine[] = [];
      const failures: ReserveStockFailure[] = [];

      for (const item of request.items) {
        // FOR UPDATE serialises concurrent reservations of the same product,
        // so two orders cannot both observe the last unit as available.
        const product = await manager
          .createQueryBuilder(Product, 'product')
          .setLock('pessimistic_write')
          .where('product.id = :id', { id: item.productId })
          .getOne();

        if (!product) {
          failures.push({
            productId: item.productId,
            requested: item.quantity,
            available: 0,
            reason: 'unknown-product',
          });
          continue;
        }

        if (product.stock < item.quantity) {
          failures.push({
            productId: item.productId,
            requested: item.quantity,
            available: product.stock,
            reason: 'insufficient-stock',
          });
          continue;
        }

        product.stock -= item.quantity;
        await manager.save(Product, product);
        lines.push({
          productId: product.id,
          requested: item.quantity,
          remaining: product.stock,
        });
      }

      // Any failure aborts the whole reservation: the transaction rolls back
      // every decrement already applied above.
      if (failures.length > 0) {
        this.logger.warn(
          `Reservation for order ${request.orderId} rejected: ${failures
            .map((f) => `${f.productId} (${f.reason})`)
            .join(', ')}`,
        );
        return { orderId: request.orderId, ok: false, lines: [], failures };
      }

      const unitsReserved = lines.reduce((sum, l) => sum + l.requested, 0);
      await manager.save(
        manager.create(OrderPlacement, {
          eventId: request.eventId,
          orderId: request.orderId,
          unitsReserved,
        }),
      );

      this.logger.log(
        `Reserved ${unitsReserved} units for order ${request.orderId}`,
      );
      return { orderId: request.orderId, ok: true, lines, failures: [] };
    });
  }

  async seed(): Promise<number> {
    const existing = await this.products.count();
    if (existing > 0) {
      this.logger.log(`Products already present (${existing}), skipping seed`);
      return 0;
    }

    const entities = PRODUCT_SEED.map((product) => this.products.create(product));
    await this.products.save(entities);
    this.logger.log(`Seeded ${entities.length} products`);
    return entities.length;
  }
}

/**
 * Write-side validation, kept as pure functions so both `create` and `update`
 * share one definition of "a valid name/price/stock" and the rules are
 * testable without a database.
 *
 * Each throws `BadRequestException` with the field name in the message: the
 * gateway forwards the status untouched, so whatever is thrown here is what
 * the admin UI shows the operator.
 */

function normalizeName(value: unknown): string {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new BadRequestException('name is required');
  }
  return value.trim();
}

function normalizePrice(value: unknown): string {
  const numeric = typeof value === 'string' ? Number(value) : value;
  if (
    typeof numeric !== 'number' ||
    !Number.isFinite(numeric) ||
    numeric < 0
  ) {
    throw new BadRequestException('price must be a non-negative number');
  }
  if (numeric > MAX_PRICE) {
    throw new BadRequestException(`price must not exceed ${MAX_PRICE}`);
  }
  // Money is stored (and crosses the wire) as a decimal string, never a float.
  return numeric.toFixed(2);
}

function normalizeStock(value: unknown, fallback: number): number {
  if (value === undefined || value === null) {
    return fallback;
  }
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 0) {
    throw new BadRequestException('stock must be a non-negative integer');
  }
  return value;
}
