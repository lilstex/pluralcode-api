import { Module } from '@nestjs/common';
import { EventService } from './service/events.service';
import { PrismaService } from 'src/prisma.service';
import { AzureModule } from 'src/providers/azure/azure.module';
import { JitsiModule } from 'src/providers/jitsi/jitsi.module';
import { EmailModule } from 'src/providers/email/email.module';
import { EventController } from './controller/events.controller';
import { UsersModule } from 'src/users/users.module';

@Module({
  imports: [AzureModule, JitsiModule, EmailModule, UsersModule],
  controllers: [EventController],
  providers: [EventService, PrismaService],
  exports: [EventService],
})
export class EventsModule {}
