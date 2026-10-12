import {
  Inject,
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
  Optional,
} from '@nestjs/common';
import { ClientProxy } from '@nestjs/microservices';
import { MESSAGING_CLIENT } from './messaging.tokens.js';

/**
 * Thin wrapper over the event-bus client: connects on boot, reports the
 * connection for health checks, and publishes domain events.
 */
@Injectable()
export class MessagingService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(MessagingService.name);
  private connected = false;

  constructor(
    /**
     * Null when a service imports this module without a `messaging` config, so
     * the module can be imported unconditionally. Every service that joins the
     * bus registers one.
     */
    @Optional()
    @Inject(MESSAGING_CLIENT)
    private readonly client: ClientProxy | null = null,
  ) {
    this.client?.status.subscribe({
      next: (status) => {
        this.connected = status === 'connected';
        this.logger.log(`Messaging status: ${status}`);
      },
      error: (err) =>
        this.logger.error(`Messaging status stream errored: ${String(err)}`),
    });
  }

  async onModuleInit(): Promise<void> {
    if (!this.client) {
      return;
    }
    try {
      await this.client.connect();
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.logger.error(`Messaging connect failed: ${message}`);
    }
  }

  onModuleDestroy(): void {
    this.client?.close();
  }

  async isConnected(): Promise<boolean> {
    if (!this.client) {
      return true;
    }
    if (!this.connected) {
      try {
        await this.client.connect();
      } catch {
        /* keep false */
      }
    }
    return this.connected;
  }

  /**
   * Publishes a domain event to the shared fanout exchange.
   *
   * Never falls back to anything: emitting without a client would send nowhere.
   * Callers treat a throw as a logged failure, not a request failure.
   */
  publishEvent<T>(pattern: string, data: T): void {
    if (!this.client) {
      throw new Error(
        `Cannot publish event '${pattern}': no messaging client configured`,
      );
    }
    this.client.emit<T>(pattern, data);
  }
}
