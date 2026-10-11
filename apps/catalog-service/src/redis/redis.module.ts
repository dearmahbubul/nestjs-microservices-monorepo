import { Global, Module } from '@nestjs/common';
import { RedisService } from './redis.service.js';

// @Global so RedisService can be injected anywhere without re-importing this module.
@Global()
@Module({
  providers: [RedisService],
  exports: [RedisService],
})
export class RedisModule {}
