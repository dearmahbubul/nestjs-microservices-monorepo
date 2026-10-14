import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { MongooseModule } from '@nestjs/mongoose';
import { Cart, CartSchema } from './cart.schema.js';
import type { AppConfig } from '../config/configuration.js';

@Module({
  imports: [
    MongooseModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        uri: config.getOrThrow<AppConfig['database']>('database').url,
      }),
    }),
    MongooseModule.forFeature([{ name: Cart.name, schema: CartSchema }]),
  ],
  exports: [MongooseModule],
})
export class DatabaseModule {}
