import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import type { AppConfig } from '../config/configuration.js';
import { AuthGuard } from './auth.guard.js';
import { ProxyController } from './proxy.controller.js';
import { ProxyService } from './proxy.service.js';

@Module({
  imports: [
    // Verification only — the gateway never signs. Same AUTH_JWT_SECRET
    // identity-service issues tokens with.
    JwtModule.registerAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        secret: config.getOrThrow<AppConfig['auth']>('auth').jwtSecret,
      }),
    }),
  ],
  controllers: [ProxyController],
  providers: [ProxyService, AuthGuard],
})
export class RoutingModule {}
