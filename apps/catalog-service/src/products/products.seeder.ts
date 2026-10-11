import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ProductsService } from './products.service.js';

@Injectable()
export class ProductsSeeder implements OnApplicationBootstrap {
  private readonly logger = new Logger(ProductsSeeder.name);

  constructor(
    private readonly products: ProductsService,
    private readonly config: ConfigService,
  ) {}

  async onApplicationBootstrap(): Promise<void> {
    if (!this.config.getOrThrow<boolean>('seed')) {
      return;
    }

    try {
      await this.products.seed();
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.logger.error(`Product seed failed: ${message}`);
    }
  }
}
