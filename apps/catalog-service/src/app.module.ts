import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AppController } from './app.controller.js';
import { AppService } from './app.service.js';
import { MessagingModule } from '@repo/messaging';
import { DatabaseModule } from './database/database.module.js';
import { HealthController } from './health/health.controller.js';
import { RedisModule } from './redis/redis.module.js';
import { ProductsModule } from './products/products.module.js';
import loadConfiguration from './config/configuration.js';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      cache: true,
      expandVariables: true,
      load: [loadConfiguration],
    }),
    DatabaseModule,
    RedisModule,
    MessagingModule,
    ProductsModule,
  ],
  controllers: [AppController, HealthController],
  providers: [AppService],
})
export class AppModule {}