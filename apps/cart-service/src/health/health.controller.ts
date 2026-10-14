import { Controller, Get } from '@nestjs/common';
import { InjectConnection } from '@nestjs/mongoose';
import type { Connection } from 'mongoose';

@Controller('health')
export class HealthController {
  constructor(
    @InjectConnection()
    private readonly connection: Connection,
  ) {}

  @Get()
  async check() {
    let database = false;
    try {
      await this.connection.db?.admin().ping();
      database = true;
    } catch {
      /* keep false */
    }

    return {
      status: database ? 'ok' : 'degraded',
      service: 'cart-service',
      checks: { database },
      uptime: process.uptime(),
      timestamp: new Date().toISOString(),
    };
  }
}
