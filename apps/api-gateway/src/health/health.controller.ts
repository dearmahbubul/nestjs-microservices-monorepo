import { Controller, Get } from '@nestjs/common';
import { HealthService } from './health.service.js';

@Controller('health')
export class HealthController {
  constructor(private readonly health: HealthService) {}

  /**
   * Liveness: is this process itself up? Deliberately cheap and dependency-free
   * so it never fails because a downstream is down.
   */
  @Get()
  check() {
    return {
      status: 'ok',
      service: 'api-gateway',
      uptime: process.uptime(),
      timestamp: new Date().toISOString(),
    };
  }

  /**
   * Readiness: can this gateway actually serve traffic? Probes every
   * downstream service and reports per-dependency status.
   */
  @Get('ready')
  async ready() {
    const downstreams = await this.health.checkDownstreams();
    const ok = Object.values(downstreams).every((s) => s.status === 'up');

    return {
      status: ok ? 'ok' : 'degraded',
      service: 'api-gateway',
      downstreams,
      timestamp: new Date().toISOString(),
    };
  }
}
