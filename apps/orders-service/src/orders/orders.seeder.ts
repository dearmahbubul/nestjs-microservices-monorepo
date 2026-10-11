import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { OrdersService } from './orders.service.js';

@Injectable()
export class OrdersSeeder implements OnApplicationBootstrap {
  private readonly logger = new Logger(OrdersSeeder.name);

  constructor(
    private readonly orders: OrdersService,
    private readonly config: ConfigService,
  ) {}

  async onApplicationBootstrap(): Promise<void> {
    if (!this.config.getOrThrow<boolean>('seed')) {
      return;
    }

    try {
      await this.orders.seed();
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.logger.error(`Order seed failed: ${message}`);
    }
  }
}
