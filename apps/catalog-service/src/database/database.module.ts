import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { MongooseModule } from '@nestjs/mongoose';
import { Product, ProductSchema } from './product.schema.js';
import { OrderPlacement, OrderPlacementSchema } from './order-placement.schema.js';
import type { AppConfig } from '../config/configuration.js';

@Module({
  imports: [
    MongooseModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        uri: config.getOrThrow<AppConfig['database']>('database').url,
      }),
    }),
    MongooseModule.forFeature([
      { name: Product.name, schema: ProductSchema },
      { name: OrderPlacement.name, schema: OrderPlacementSchema },
    ]),
  ],
  exports: [MongooseModule],
})
export class DatabaseModule {}
