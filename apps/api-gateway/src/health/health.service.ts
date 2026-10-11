import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { AppConfig } from '../config/configuration.js';
import {
  SERVICE_NAMES,
  type ServiceName,
} from '../routing/service-registry.js';

export interface ServiceHealth {
  status: 'up' | 'down';
  latencyMs: number;
  error?: string;
}

@Injectable()
export class HealthService {
  private readonly logger = new Logger(HealthService.name);
  private readonly services: Record<ServiceName, string>;
  private readonly timeoutMs: number;

  constructor(config: ConfigService) {
    this.services = config.getOrThrow<AppConfig['services']>('services');
    // Health probes must be much faster than real traffic — a slow downstream
    // is a failed probe, not a request worth waiting on.
    this.timeoutMs = Math.min(
      config.getOrThrow<AppConfig['app']>('app').requestTimeoutMs,
      2_000,
    );
  }

  /**
   * Probes every downstream's /health concurrently. The gateway is healthy
   * only when all of its dependencies answer, so an orchestrator can restart
   * or reroute based on this one endpoint.
   */
  async checkDownstreams(): Promise<Record<ServiceName, ServiceHealth>> {
    const results = await Promise.all(
      SERVICE_NAMES.map(
        async (name) => [name, await this.probe(name)] as const,
      ),
    );
    return Object.fromEntries(results) as Record<ServiceName, ServiceHealth>;
  }

  private async probe(name: ServiceName): Promise<ServiceHealth> {
    const startedAt = performance.now();
    try {
      const res = await fetch(`${this.services[name]}/health`, {
        signal: AbortSignal.timeout(this.timeoutMs),
      });
      const latencyMs = Math.round(performance.now() - startedAt);

      if (!res.ok) {
        return { status: 'down', latencyMs, error: `HTTP ${res.status}` };
      }
      return { status: 'up', latencyMs };
    } catch (error) {
      const latencyMs = Math.round(performance.now() - startedAt);
      const detail = error instanceof Error ? error.message : String(error);
      this.logger.debug(`${name} health probe failed: ${detail}`);
      return { status: 'down', latencyMs, error: detail };
    }
  }
}
