import { Controller, Get } from '@nestjs/common';
import { InjectConnection } from '@nestjs/mongoose';
import type { Connection } from 'mongoose';
import { MessagingService } from '@repo/messaging';
import { RedisService } from '../redis/redis.service.js';

@Controller('health')
export class HealthController {
  constructor(
    @InjectConnection()
    private readonly connection: Connection,
    private readonly redis: RedisService,
    private readonly messaging: MessagingService,
  ) {}

  @Get()
  async check() {
    const checks = { database: false, redis: false, messaging: false };

    try {
      await this.connection.db?.admin().ping();
      checks.database = true;
    } catch {
      /* keep false */
    }

    try {
      checks.redis = (await this.redis.client.ping()) === 'PONG';
    } catch {
      /* keep false */
    }

    try {
      checks.messaging = await this.messaging.isConnected();
    } catch {
      /* keep false */
    }

    const ok = Object.values(checks).every(Boolean);

    return {
      status: ok ? 'ok' : 'degraded',
      service: 'catalog-service',
      checks,
      uptime: process.uptime(),
      timestamp: new Date().toISOString(),
    };
  }
}
