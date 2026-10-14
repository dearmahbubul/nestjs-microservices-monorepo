import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectConnection, InjectModel } from '@nestjs/mongoose';
import type { Connection, HydratedDocument, Model } from 'mongoose';
import type {
  ReserveStockFailure,
  ReserveStockLine,
  ReserveStockRequest,
  ReserveStockResponse,
} from '@repo/contracts';
import { Product } from '../database/product.schema.js';
import { OrderPlacement } from '../database/order-placement.schema.js';
import { PRODUCT_SEED } from './product.seed.js';
import { generateFakeProducts } from './product.faker.seed.js';
import type { ProductPage } from './pagination.js';
import type { CreateProductDto, UpdateProductDto } from './dto/product.dto.js';

const MAX_PRICE = 99_999_999.99;

@Injectable()
export class ProductsService {
  private readonly logger = new Logger(ProductsService.name);

  constructor(
    @InjectModel(Product.name)
    private readonly products: Model<Product>,
    @InjectModel(OrderPlacement.name)
    private readonly placements: Model<OrderPlacement>,
    @InjectConnection()
    private readonly connection: Connection,
  ) {}

  // name ASC, id ASC: the id tiebreak keeps OFFSET/LIMIT stable when names collide.
  async findAll(page?: ProductPage): Promise<Product[]> {
    let query = this.products.find().sort({ name: 1, _id: 1 });
    if (page?.offset !== undefined) {
      query = query.skip(page.offset);
    }
    if (page?.limit !== undefined) {
      query = query.limit(page.limit);
    }
    return query.exec();
  }

  count(): Promise<number> {
    return this.products.countDocuments();
  }

  async findOne(id: string): Promise<HydratedDocument<Product>> {
    const product = await this.products.findById(id);
    if (!product) {
      throw new NotFoundException(`Product ${id} not found`);
    }
    return product;
  }

  async create(dto: CreateProductDto): Promise<Product> {
    const product = await this.products.create({
      name: normalizeName(dto?.name),
      price: normalizePrice(dto?.price),
      stock: normalizeStock(dto?.stock, 0),
    });
    this.logger.log(`Created product ${product._id} (${product.name})`);
    return product;
  }

  // Partial update: only fields present on the dto are touched.
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
    const saved = await product.save();
    this.logger.log(`Updated product ${saved._id} (${saved.name})`);
    return saved;
  }

  async remove(id: string): Promise<void> {
    const result = await this.products.deleteOne({ _id: id });
    if (result.deletedCount === 0) {
      throw new NotFoundException(`Product ${id} not found`);
    }
    this.logger.log(`Deleted product ${id}`);
  }

  // All-or-nothing reservation. Any failure aborts the transaction so every
  // decrement is rolled back; a repeat eventId returns the original outcome
  // without touching stock.
  async reserveStock(
    request: ReserveStockRequest,
  ): Promise<ReserveStockResponse> {
    const session = await this.connection.startSession();
    try {
      return await session.withTransaction(async () => {
        const already = await this.placements
          .findOne({ eventId: request.eventId })
          .session(session);
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
          const product = await this.products
            .findById(item.productId)
            .session(session);

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

          await this.products
            .updateOne(
              { _id: product._id },
              { $inc: { stock: -item.quantity } },
            )
            .session(session);
          lines.push({
            productId: product._id,
            requested: item.quantity,
            remaining: product.stock - item.quantity,
          });
        }

        if (failures.length > 0) {
          // Abort, do not just return: a normal return would commit the
          // partial decrements.
          await session.abortTransaction();
          this.logger.warn(
            `Reservation for order ${request.orderId} rejected: ${failures
              .map((f) => `${f.productId} (${f.reason})`)
              .join(', ')}`,
          );
          return { orderId: request.orderId, ok: false, lines: [], failures };
        }

        const unitsReserved = lines.reduce((sum, l) => sum + l.requested, 0);
        await this.placements.create(
          [
            {
              eventId: request.eventId,
              orderId: request.orderId,
              unitsReserved,
            },
          ],
          { session },
        );

        this.logger.log(
          `Reserved ${unitsReserved} units for order ${request.orderId}`,
        );
        return { orderId: request.orderId, ok: true, lines, failures: [] };
      });
    } finally {
      await session.endSession();
    }
  }

  // Seeds demo products unless the collection already has documents. Runs once,
  // on an empty collection, so a restart does not multiply the catalog.
  async seed(count: number): Promise<number> {
    const existing = await this.products.countDocuments();
    if (existing > 0) {
      this.logger.log(`Products already present (${existing}), skipping seed`);
      return 0;
    }

    const fixed = PRODUCT_SEED;
    const fake = await generateFakeProducts(Math.max(count - fixed.length, 0));
    await this.products.insertMany(
      [...fixed, ...fake].map((seed) => ({
        _id: seed.id,
        name: seed.name,
        price: seed.price,
        stock: seed.stock,
      })),
    );
    const seeded = fixed.length + fake.length;
    this.logger.log(
      `Seeded ${seeded} products (${fixed.length} fixed, ${fake.length} faker)`,
    );
    return seeded;
  }
}

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
