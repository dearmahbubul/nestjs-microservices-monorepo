import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { TypeOrmModule } from '@nestjs/typeorm';
import { User } from '../database/user.entity.js';
import type { AppConfig } from '../config/configuration.js';
import { AuthController } from './auth.controller.js';
import { AuthService } from './auth.service.js';
import { UsersSeeder } from './users.seeder.js';

@Module({
  imports: [
    TypeOrmModule.forFeature([User]),
    // The signing secret comes from the same env var the api-gateway verifies
    // with; there is exactly one AUTH_JWT_SECRET in the system.
    JwtModule.registerAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => {
        const auth = config.getOrThrow<AppConfig['auth']>('auth');
        return {
          secret: auth.jwtSecret,
          signOptions: { expiresIn: auth.tokenTtlSeconds },
        };
      },
    }),
  ],
  controllers: [AuthController],
  providers: [AuthService, UsersSeeder],
  exports: [AuthService],
})
export class AuthModule {}
