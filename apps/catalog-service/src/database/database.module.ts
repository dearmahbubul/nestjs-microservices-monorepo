import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Product } from './product.entity.js';
import type { AppConfig } from '../config/configuration.js';

@Module({
  imports: [
    TypeOrmModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => {
        const database = config.getOrThrow<AppConfig['database']>('database');
        return {
          type: 'postgres',
          url: database.url,
          synchronize: database.synchronize,
          autoLoadEntities: true,
        };
      },
    }),
    TypeOrmModule.forFeature([Product]),
  ],
  exports: [TypeOrmModule],
})
export class DatabaseModule {}