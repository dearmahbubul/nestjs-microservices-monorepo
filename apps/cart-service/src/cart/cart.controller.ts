import { Body, Controller, Delete, Get, Param, Put, Query } from '@nestjs/common';
import { CartService } from './cart.service.js';
import { Cart } from '../database/cart.schema.js';
import type { SetCartItemDto } from './dto/set-cart-item.dto.js';

// The api-gateway owns authentication and injects `customerEmail` from the
// session token (same as orders-service). All cart routes are protected there,
// so the email is always the authenticated caller's.
@Controller('cart')
export class CartController {
  constructor(private readonly cart: CartService) {}

  @Get()
  get(@Query('customerEmail') customerEmail: string): Promise<Cart> {
    return this.cart.get(customerEmail);
  }

  @Put('items/:productId')
  setItem(
    @Param('productId') productId: string,
    @Query('customerEmail') customerEmail: string,
    @Body() dto: SetCartItemDto,
  ): Promise<Cart> {
    return this.cart.setItem(customerEmail, productId, dto?.quantity);
  }

  @Delete('items/:productId')
  removeItem(
    @Param('productId') productId: string,
    @Query('customerEmail') customerEmail: string,
  ): Promise<Cart> {
    return this.cart.removeItem(customerEmail, productId);
  }

  @Delete()
  clear(@Query('customerEmail') customerEmail: string): Promise<Cart> {
    return this.cart.clear(customerEmail);
  }
}
