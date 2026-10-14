import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { Product, ProductSchema } from '../database/product.schema.js';
import {
  OrderPlacement,
  OrderPlacementSchema,
} from '../database/order-placement.schema.js';
import { ProductsController } from './products.controller.js';
import { ProductsMessagingController } from './products.messaging.controller.js';
import { ProductsSeeder } from './products.seeder.js';
import { ProductsService } from './products.service.js';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Product.name, schema: ProductSchema },
      { name: OrderPlacement.name, schema: OrderPlacementSchema },
    ]),
  ],
  controllers: [ProductsController, ProductsMessagingController],
  providers: [ProductsService, ProductsSeeder],
  exports: [ProductsService],
})
export class ProductsModule {}
