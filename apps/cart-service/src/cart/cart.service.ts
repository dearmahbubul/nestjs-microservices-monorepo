import {
  BadRequestException,
  Injectable,
  Logger,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import type { Model } from 'mongoose';
import { Cart } from '../database/cart.schema.js';

@Injectable()
export class CartService {
  private readonly logger = new Logger(CartService.name);

  constructor(@InjectModel(Cart.name) private readonly carts: Model<Cart>) {}

  async get(customerEmail: string): Promise<Cart> {
    return this.carts.findOneAndUpdate(
      { customerEmail: normalizeEmail(customerEmail) },
      { $setOnInsert: { items: [] } },
      { upsert: true, new: true },
    );
  }

  // quantity 0 removes the line.
  async setItem(
    customerEmail: string,
    productId: string,
    quantity: number,
  ): Promise<Cart> {
    const email = normalizeEmail(customerEmail);
    const qty = normalizeQuantity(quantity);
    if (qty === 0) {
      return this.removeItem(email, productId);
    }

    // Push the line when missing, then set the quantity. The unique index
    // turns a concurrent double-push into a duplicate-key error, which is
    // swallowed here — the $set below then applies the winner's quantity.
    try {
      await this.carts.updateOne(
        { customerEmail: email, 'items.productId': { $ne: productId } },
        { $push: { items: { productId, quantity: qty } } },
        { upsert: true },
      );
    } catch (error) {
      if (!isDuplicateKey(error)) {
        throw error;
      }
    }
    await this.carts.updateOne(
      { customerEmail: email, 'items.productId': productId },
      { $set: { 'items.$.quantity': qty } },
    );
    this.logger.debug(`Cart ${email}: set ${productId} to ${qty}`);
    return this.get(email);
  }

  async removeItem(customerEmail: string, productId: string): Promise<Cart> {
    const email = normalizeEmail(customerEmail);
    await this.carts.updateOne(
      { customerEmail: email },
      { $pull: { items: { productId } } },
    );
    return this.get(email);
  }

  async clear(customerEmail: string): Promise<Cart> {
    const email = normalizeEmail(customerEmail);
    await this.carts.updateOne({ customerEmail: email }, { $set: { items: [] } });
    return this.get(email);
  }
}

function normalizeEmail(value: string): string {
  const email = value?.trim().toLowerCase();
  if (!email) {
    throw new BadRequestException('customerEmail is required');
  }
  return email;
}

function normalizeQuantity(value: number): number {
  if (!Number.isInteger(value) || value < 0) {
    throw new BadRequestException('quantity must be a non-negative integer');
  }
  return value;
}

function isDuplicateKey(error: unknown): boolean {
  return (error as { code?: number }).code === 11000;
}
