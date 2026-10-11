import { Controller, Get } from '@nestjs/common';
import { MessagingService } from '@repo/messaging';

@Controller('health')
export class HealthController {
  constructor(private readonly messaging: MessagingService) {}

  @Get()
  async check() {
    const checks = { messaging: false };

    try {
      checks.messaging = await this.messaging.isConnected();
    } catch {
      /* keep false */
    }

    const ok = Object.values(checks).every(Boolean);

    return {
      status: ok ? 'ok' : 'degraded',
      service: 'notifications-service',
      checks,
      uptime: process.uptime(),
      timestamp: new Date().toISOString(),
    };
  }
}
