import { Module } from '@nestjs/common';
import { PrismaService } from 'src/prisma.service';
import { EmailModule } from 'src/providers/email/email.module';
import { MentorRequestController } from './controller/mentor-request.controller';
import { MentorRequestService } from './service/mentor-request.service';

@Module({
  imports: [EmailModule],
  controllers: [MentorRequestController],
  providers: [MentorRequestService, PrismaService],
  exports: [MentorRequestService],
})
export class MentorRequestModule {}
