import { Test } from '@nestjs/testing';
import { ConfigModule } from '@nestjs/config';
import { describe, expect, it } from 'vitest';
import { messagingConfiguration } from './messaging.config.js';
import { MessagingModule } from './messaging.module.js';
import { MessagingService } from './messaging.service.js';

describe('MessagingModule', () => {
  it('provides MessagingService wired to the configured client', async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({
          isGlobal: true,
          load: [
            () => ({
              messaging: messagingConfiguration({ queue: 'test.events' }),
            }),
          ],
        }),
        MessagingModule,
      ],
    }).compile();

    const service = moduleRef.get(MessagingService);
    expect(service).toBeInstanceOf(MessagingService);
  });
});