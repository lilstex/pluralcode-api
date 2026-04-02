import { Module } from '@nestjs/common';
import { EventService } from './service/events.service';
import { AzureModule } from 'src/providers/azure/azure.module';
import { JitsiModule } from 'src/providers/jitsi/jitsi.module';
import { EmailModule } from 'src/providers/email/email.module';
import { EventController } from './controller/events.controller';
import { UsersModule } from 'src/users/users.module';
import { NotificationsModule } from 'src/notifications/notifications.module';
import { YouTubeService } from 'src/providers/youtube/youtube.service';

@Module({
  imports: [
    AzureModule,
    JitsiModule,
    EmailModule,
    UsersModule,
    NotificationsModule,
  ],
  controllers: [EventController],
  providers: [EventService, YouTubeService],
  exports: [EventService],
})
export class EventsModule {}
