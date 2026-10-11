import {
  ORDERS_CREATE,
  ORDERS_FIND_ALL,
  ORDERS_FIND_ONE,
} from '@repo/contracts';
import { Controller } from '@nestjs/common';
import { MessagePattern, Payload } from '@nestjs/microservices';
import { OrdersService } from './orders.service.js';
import type { CreateOrderDto } from './dto/create-order.dto.js';

@Controller()
export class OrdersMessagingController {
  constructor(private readonly orders: OrdersService) {}

  @MessagePattern(ORDERS_CREATE)
  create(@Payload() dto: CreateOrderDto) {
    return this.orders.create(dto);
  }

  @MessagePattern(ORDERS_FIND_ALL)
  findAll() {
    return this.orders.findAll();
  }

  @MessagePattern(ORDERS_FIND_ONE)
  findOne(@Payload() id: string) {
    return this.orders.findOne(id);
  }
}
