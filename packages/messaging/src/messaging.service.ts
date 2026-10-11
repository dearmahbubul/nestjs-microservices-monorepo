import {
  Inject,
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
  Optional,
} from '@nestjs/common';
import { ClientProxy } from '@nestjs/microservices';
import { firstValueFrom } from 'rxjs';
import { EVENT_BUS_CLIENT, MESSAGING_CLIENT } from './messaging.tokens.js';

@Injectable()
export class MessagingService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(MessagingService.name);
  private connected = false;

  constructor(
    @Inject(MESSAGING_CLIENT) private readonly client: ClientProxy,
    /**
     * Present only in services that publish domain events. Absent elsewhere,
     * so the constructor stays optional rather than forcing every consumer of
     * this service to configure an event bus it never uses.
     */
    @Optional()
    @Inject(EVENT_BUS_CLIENT)
    private readonly eventBus: ClientProxy | null = null,
  ) {
    this.client.status.subscribe({
      next: (status) => {
        this.connected = status === 'connected';
        this.logger.log(`Messaging status: ${status}`);
      },
      error: (err) =>
        this.logger.error(`Messaging status stream errored: ${String(err)}`),
    });

    this.eventBus?.status.subscribe({
      next: (status) => this.logger.log(`Event bus status: ${status}`),
      error: (err) =>
        this.logger.error(`Event bus status stream errored: ${String(err)}`),
    });
  }

  async onModuleInit(): Promise<void> {
    await this.tryConnect();
    await this.tryConnectEventBus();
  }

  async onModuleDestroy(): Promise<void> {
    this.client.close();
    this.eventBus?.close();
  }

  async isConnected(): Promise<boolean> {
    if (!this.connected) {
      await this.tryConnect();
    }
    return this.connected;
  }

  publish<T>(pattern: string, data: T): void {
    this.client.emit<T>(pattern, data);
  }

  /**
   * Publishes a domain event through the fanout exchange.
   *
   * Deliberately not falling back to the private connection when the event bus
   * is missing: emitting there would send the message to this service's own
   * queue, where no subscriber exists, and lose it silently. Raising is the
   * honest outcome — the caller's log records the failed publish.
   */
  publishEvent<T>(pattern: string, data: T): void {
    if (!this.eventBus) {
      throw new Error(
        `Cannot publish event '${pattern}': no event bus configured for this service`,
      );
    }
    this.eventBus.emit<T>(pattern, data);
  }

  request<Response = unknown, Request = unknown>(
    pattern: string,
    data: Request,
  ): Promise<Response> {
    return firstValueFrom(
      this.client.send<Response, Request>(pattern, data),
    );
  }

  private async tryConnect(): Promise<void> {
    try {
      await this.client.connect();
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.logger.error(`Messaging connect failed: ${message}`);
    }
  }

  private async tryConnectEventBus(): Promise<void> {
    if (!this.eventBus) {
      return;
    }
    try {
      await this.eventBus.connect();
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.logger.error(`Event bus connect failed: ${message}`);
    }
  }
}
