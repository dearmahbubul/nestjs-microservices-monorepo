import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Product } from '../database/product.entity.js';
import { OrderPlacement } from '../database/order-placement.entity.js';
import { ProductsCommandsMessagingController } from './products.commands.messaging.controller.js';
import { ProductsController } from './products.controller.js';
import { ProductsMessagingController } from './products.messaging.controller.js';
import { ProductsSeeder } from './products.seeder.js';
import { ProductsService } from './products.service.js';

@Module({
  imports: [TypeOrmModule.forFeature([Product, OrderPlacement])],
  controllers: [
    ProductsController,
    ProductsMessagingController,
    ProductsCommandsMessagingController,
  ],
  providers: [ProductsService, ProductsSeeder],
  exports: [ProductsService],
})
export class ProductsModule {}
