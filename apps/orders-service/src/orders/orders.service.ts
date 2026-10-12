import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Order } from '../database/order.entity.js';
import { OrderItem } from '../database/order-item.entity.js';
import type {
  CreateOrderDto,
  CreateOrderItemDto,
} from './dto/create-order.dto.js';
import { OrderEventsPublisher } from './order-events.publisher.js';
import { ORDER_SEED } from './order.seed.js';

function toCents(value: number | string, label: string): number {
  const numeric = typeof value === 'string' ? Number(value) : value;
  if (!Number.isFinite(numeric) || numeric < 0) {
    throw new BadRequestException(`${label} must be a non-negative number`);
  }
  return Math.round(numeric * 100);
}

@Injectable()
export class OrdersService {
  private readonly logger = new Logger(OrdersService.name);

  constructor(
    @InjectRepository(Order)
    private readonly orders: Repository<Order>,
    @InjectRepository(OrderItem)
    private readonly items: Repository<OrderItem>,
    private readonly events: OrderEventsPublisher,
  ) {}

  /**
   * All orders, or just one customer's when `customerEmail` is supplied.
   *
   * The caller decides which — see the gateway's `applyIdentityScope`, which
   * overwrites `customerEmail` on the way in with the email from the verified
   * token. This service does not authenticate anybody, so it must not be the
   * one deciding whose orders these are: a `customerEmail` that reached it
   * unvetted would be a filter an attacker chooses, and the answer would be
   * somebody else's order history.
   *
   * An empty filter is treated as "no filter" rather than "no orders": the
   * gateway injects a non-empty email or nothing at all, so an empty string
   * means a caller sent `?customerEmail=` to a route that was never scoped.
   */
  findAll(customerEmail?: string): Promise<Order[]> {
    const email = customerEmail?.trim();
    return this.orders.find({
      ...(email ? { where: { customerEmail: email } } : {}),
      order: { createdAt: 'DESC' },
    });
  }

  async findOne(id: string): Promise<Order> {
    const order = await this.orders.findOne({ where: { id } });
    if (!order) {
      throw new NotFoundException(`Order ${id} not found`);
    }
    return order;
  }

  async create(dto: CreateOrderDto): Promise<Order> {
    this.validate(dto);

    let totalCents = 0;
    const items = dto.items.map((item) => {
      const unitCents = toCents(
        item.unitPrice,
        `items['${item.name}'].unitPrice`,
      );
      const lineCents = unitCents * item.quantity;
      totalCents += lineCents;

      return this.items.create({
        productId: item.productId,
        name: item.name,
        unitPrice: (unitCents / 100).toFixed(2),
        quantity: item.quantity,
        lineTotal: (lineCents / 100).toFixed(2),
      });
    });

    const order = this.orders.create({
      customerEmail: dto.customerEmail,
      status: 'confirmed',
      total: (totalCents / 100).toFixed(2),
      items,
    });

    const saved = await this.orders.save(order);
    this.logger.log(
      `Placed order ${saved.id} for ${saved.customerEmail} (total ${saved.total})`,
    );

    // Reload so the items (including their generated ids) are present before
    // the event is built — the in-memory entities have no ids yet.
    const placed = await this.findOne(saved.id);
    this.events.announceCreated(placed);
    return placed;
  }

  async seed(): Promise<number> {
    const existing = await this.orders.count();
    if (existing > 0) {
      this.logger.log(`Orders already present (${existing}), skipping seed`);
      return 0;
    }

    for (const seed of ORDER_SEED) {
      await this.create(seed);
    }
    this.logger.log(`Seeded ${ORDER_SEED.length} orders`);
    return ORDER_SEED.length;
  }

  private validate(dto: CreateOrderDto): void {
    if (
      !dto ||
      typeof dto.customerEmail !== 'string' ||
      !dto.customerEmail.includes('@')
    ) {
      throw new BadRequestException(
        'customerEmail must be a valid email address',
      );
    }

    if (!Array.isArray(dto.items) || dto.items.length === 0) {
      throw new BadRequestException('items must contain at least one entry');
    }

    dto.items.forEach((item, index) => this.validateItem(item, index));
  }

  private validateItem(item: CreateOrderItemDto, index: number): void {
    if (!item || typeof item.productId !== 'string' || item.productId === '') {
      throw new BadRequestException(`items[${index}].productId is required`);
    }
    if (typeof item.name !== 'string' || item.name === '') {
      throw new BadRequestException(`items[${index}].name is required`);
    }
    if (!Number.isInteger(item.quantity) || item.quantity < 1) {
      throw new BadRequestException(
        `items[${index}].quantity must be a positive integer`,
      );
    }
  }
}
