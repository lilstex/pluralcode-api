import { Module } from '@nestjs/common';
import { NotificationsController } from './controller/notifications.controller';
import { NotificationsService } from './service/notifications.service';
import { PrismaService } from 'src/prisma.service';

@Module({
  controllers: [NotificationsController],
  providers: [NotificationsService, PrismaService],
  exports: [NotificationsService],
})
export class NotificationsModule {}
