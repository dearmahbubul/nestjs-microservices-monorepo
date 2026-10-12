import { NestFactory } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { AppModule } from './app.module.js';
import type { AppConfig } from './config/configuration.js';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  const config = app.get(ConfigService);
  const appConfig = config.getOrThrow<AppConfig['app']>('app');

  // Publisher only: the event-bus client is connected by MessagingService, so
  // there is no microservice server to start here.
  await app.listen(appConfig.port);
}
await bootstrap();
