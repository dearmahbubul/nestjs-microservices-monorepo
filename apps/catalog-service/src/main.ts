import { NestFactory } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { toServerOptions } from '@repo/messaging';
import { AppModule } from './app.module.js';
import type { AppConfig } from './config/configuration.js';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  const config = app.get(ConfigService);
  const appConfig = config.getOrThrow<AppConfig['app']>('app');
  const messaging = config.getOrThrow<AppConfig['messaging']>('messaging');

  // Consume domain events: this service's own queue bound to the shared
  // fanout exchange (see MessagingConfig in the service config).
  app.connectMicroservice(toServerOptions(messaging));
  await app.startAllMicroservices();

  await app.listen(appConfig.port);
}
await bootstrap();
