import { Global, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ClientProxy, ClientProxyFactory } from '@nestjs/microservices';
import type { MessagingConfig } from './messaging.config.js';
import { MessagingService } from './messaging.service.js';
import { toClientOptions } from './messaging.options.js';
import { EVENT_BUS_CLIENT, MESSAGING_CLIENT } from './messaging.tokens.js';

/**
 * Provides a `ClientProxy` for a named config key, or `null` when the service
 * does not register one. Null (rather than a throw) is what lets every service
 * import this module while only publishers pay for an event bus.
 */
function clientFactory(configKey: string) {
  return (config: ConfigService): ClientProxy | null => {
    const messaging = config.get<MessagingConfig>(configKey);
    if (!messaging) {
      return null;
    }
    return ClientProxyFactory.create(toClientOptions(messaging));
  };
}

@Global()
@Module({
  providers: [
    {
      provide: MESSAGING_CLIENT,
      useFactory: (config: ConfigService): ClientProxy => {
        const client = clientFactory('messaging')(config);
        if (!client) {
          throw new Error(`'messaging' config is not registered`);
        }
        return client;
      },
      inject: [ConfigService],
    },
    {
      provide: EVENT_BUS_CLIENT,
      useFactory: clientFactory('eventBus'),
      inject: [ConfigService],
    },
    MessagingService,
  ],
  exports: [MESSAGING_CLIENT, EVENT_BUS_CLIENT, MessagingService],
})
export class MessagingModule {}
