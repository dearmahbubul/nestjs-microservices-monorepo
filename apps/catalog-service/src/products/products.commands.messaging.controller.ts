import { Controller } from '@nestjs/common';
import { MessagePattern, Payload } from '@nestjs/microservices';
import {
  PRODUCTS_FIND_ALL,
  PRODUCTS_FIND_ONE,
  PRODUCTS_RESERVE,
  type ReserveStockRequest,
} from '@repo/contracts';
import { ProductsService } from './products.service.js';

/**
 * Synchronous read/reserve commands over the message bus.
 *
 * Separate controller from the event handler on purpose: commands answer
 * (`@MessagePattern`), events do not (`@EventPattern`), and mixing the two in
 * one class invites someone to await a reply that will never come.
 */
@Controller()
export class ProductsCommandsMessagingController {
  constructor(private readonly products: ProductsService) {}

  @MessagePattern(PRODUCTS_FIND_ALL)
  findAll() {
    return this.products.findAll();
  }

  @MessagePattern(PRODUCTS_FIND_ONE)
  findOne(@Payload() id: string) {
    return this.products.findOne(id);
  }

  @MessagePattern(PRODUCTS_RESERVE)
  reserve(@Payload() request: ReserveStockRequest) {
    return this.products.reserveStock(request);
  }
}
