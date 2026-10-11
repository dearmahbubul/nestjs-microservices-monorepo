import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Order } from './order.entity.js';
import { OrderItem } from './order-item.entity.js';
import type { AppConfig } from '../config/configuration.js';

@Module({
  imports: [
    TypeOrmModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => {
        const database = config.getOrThrow<AppConfig['database']>('database');
        return {
          type: 'postgres',
          url: database.url,
          synchronize: database.synchronize,
          autoLoadEntities: true,
        };
      },
    }),
    TypeOrmModule.forFeature([Order, OrderItem]),
  ],
  exports: [TypeOrmModule],
})
export class DatabaseModule {}
