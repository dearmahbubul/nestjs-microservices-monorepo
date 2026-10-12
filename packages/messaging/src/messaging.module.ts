import { Global, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ClientProxy, ClientProxyFactory } from '@nestjs/microservices';
import type { MessagingConfig } from './messaging.config.js';
import { MessagingService } from './messaging.service.js';
import { toClientOptions } from './messaging.options.js';
import { MESSAGING_CLIENT } from './messaging.tokens.js';

/**
 * Provides the event-bus `ClientProxy` (for publishers) and the shared
 * `MessagingService` (publishing + health). The client is `null` when a service
 * registers no `messaging` config, so the module can be imported anywhere.
 */
@Global()
@Module({
  providers: [
    {
      provide: MESSAGING_CLIENT,
      useFactory: (config: ConfigService): ClientProxy | null => {
        const messaging = config.get<MessagingConfig>('messaging');
        return messaging
          ? ClientProxyFactory.create(toClientOptions(messaging))
          : null;
      },
      inject: [ConfigService],
    },
    MessagingService,
  ],
  exports: [MESSAGING_CLIENT, MessagingService],
})
export class MessagingModule {}
