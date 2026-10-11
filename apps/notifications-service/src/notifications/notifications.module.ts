import { Module } from '@nestjs/common';
import { NotificationsController } from './notifications.controller.js';
import { NotificationsMessagingController } from './notifications.messaging.controller.js';
import { NotificationsService } from './notifications.service.js';

@Module({
  controllers: [NotificationsController, NotificationsMessagingController],
  providers: [NotificationsService],
  exports: [NotificationsService],
})
export class NotificationsModule {}
