import { Module } from '@nestjs/common';
import { PrismaService } from 'src/prisma.service';
import { EmailModule } from 'src/providers/email/email.module';
import { MentorRequestController } from './controller/mentor-request.controller';
import { MentorRequestService } from './service/mentor-request.service';
import { RewardsModule } from 'src/reward/reward.module';

@Module({
  imports: [EmailModule, RewardsModule],
  controllers: [MentorRequestController],
  providers: [MentorRequestService, PrismaService],
  exports: [MentorRequestService],
})
export class MentorRequestModule {}
