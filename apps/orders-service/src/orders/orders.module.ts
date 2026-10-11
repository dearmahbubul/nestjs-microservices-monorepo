import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Order } from '../database/order.entity.js';
import { OrderItem } from '../database/order-item.entity.js';
import { OrderEventsPublisher } from './order-events.publisher.js';
import { OrdersController } from './orders.controller.js';
import { OrdersMessagingController } from './orders.messaging.controller.js';
import { OrdersSeeder } from './orders.seeder.js';
import { OrdersService } from './orders.service.js';

@Module({
  imports: [TypeOrmModule.forFeature([Order, OrderItem])],
  controllers: [OrdersController, OrdersMessagingController],
  providers: [OrdersService, OrdersSeeder, OrderEventsPublisher],
  exports: [OrdersService],
})
export class OrdersModule {}
