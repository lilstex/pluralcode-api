import { Module } from '@nestjs/common';
import { EmailModule } from 'src/providers/email/email.module';
import { MentorRequestController } from './controller/mentor-request.controller';
import { MentorRequestService } from './service/mentor-request.service';
import { RewardsModule } from 'src/reward/reward.module';
import { NotificationsModule } from 'src/notifications/notifications.module';

@Module({
  imports: [EmailModule, RewardsModule, NotificationsModule],
  controllers: [MentorRequestController],
  providers: [MentorRequestService],
  exports: [MentorRequestService],
})
export class MentorRequestModule {}
