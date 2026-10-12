import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { OrdersService } from './orders.service.js';
import type { CreateOrderDto } from './dto/create-order.dto.js';

@Controller('orders')
export class OrdersController {
  constructor(private readonly orders: OrdersService) {}

  @Post()
  create(@Body() dto: CreateOrderDto) {
    return this.orders.create(dto);
  }

  /**
   * The gateway sets `customerEmail` from the session token before forwarding,
   * and deletes whatever the client asked for. Reading it off the query is
   * therefore safe *here* only because the only way in is through that proxy;
   * see `OrdersService.findAll`.
   */
  @Get()
  findAll(@Query('customerEmail') customerEmail?: string) {
    return this.orders.findAll(customerEmail);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.orders.findOne(id);
  }
}
