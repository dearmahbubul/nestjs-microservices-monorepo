import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AuthService } from './auth.service.js';

@Injectable()
export class UsersSeeder implements OnApplicationBootstrap {
  private readonly logger = new Logger(UsersSeeder.name);

  constructor(
    private readonly auth: AuthService,
    private readonly config: ConfigService,
  ) {}

  async onApplicationBootstrap(): Promise<void> {
    if (!this.config.getOrThrow<boolean>('seed')) {
      return;
    }

    try {
      await this.auth.seed();
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.logger.error(`Admin seed failed: ${message}`);
    }
  }
}
