import { Module } from '@nestjs/common';
import { MulterModule } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';

import { PrismaService } from 'src/prisma.service';
import { AzureModule } from 'src/providers/azure/azure.module';
import { CommunityService } from './service/community.service';
import { CommunityController } from './controller/community.controller';
import { NotificationsModule } from 'src/notifications/notifications.module';

@Module({
  imports: [
    AzureModule,
    NotificationsModule,
    MulterModule.register({ storage: memoryStorage() }),
  ],
  controllers: [CommunityController],
  providers: [CommunityService, PrismaService],
  exports: [CommunityService],
})
export class CommunityModule {}
