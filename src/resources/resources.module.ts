import { Module } from '@nestjs/common';
import { PrismaService } from 'src/prisma.service';
import { AzureModule } from 'src/providers/azure/azure.module';
import { BadgeService } from './service/badge.service';
import { OcrService } from './service/ocr.service';
import { ResourceController } from './controller/resources.controller';
import { ResourceService } from './service/resources.service';
import { RewardsModule } from 'src/reward/reward.module';
import { NotificationsModule } from 'src/notifications/notifications.module';

@Module({
  imports: [AzureModule, RewardsModule, NotificationsModule],
  controllers: [ResourceController],
  providers: [ResourceService, PrismaService, BadgeService, OcrService],
  exports: [ResourceService, BadgeService, OcrService],
})
export class ResourcesModule {}
