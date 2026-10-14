import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { AppModule } from './app.module.js';
import type { AppConfig } from './config/configuration.js';

async function bootstrap() {
  // Body parsing is disabled deliberately: this service only forwards bodies,
  // never inspects them. NestJS's default parser would consume the request
  // stream, leaving nothing for the proxy to stream downstream.
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    bodyParser: false,
  });
  const config = app.get(ConfigService);
  const { env, port } = config.getOrThrow<AppConfig['app']>('app');

  // Behind nginx (docker-compose), so the real client IP and protocol arrive
  // in X-Forwarded-* headers.
  app.set('trust proxy', 1);
  app.enableShutdownHooks();

  await app.listen(port);

  const logger = new Logger('Bootstrap');
  logger.log(`api-gateway listening on :${port} (${env})`);
}
await bootstrap();
