import { Module } from '@nestjs/common';
import { OrganizationController } from './controller/organizations.controller';
import { OrganizationService } from './service/organizations.service';
import { PrismaService } from 'src/prisma.service';
import { AzureModule } from 'src/providers/azure/azure.module';
import { EmailModule } from 'src/providers/email/email.module';
import { ConfigModule } from '@nestjs/config';
import { RewardsModule } from 'src/reward/reward.module';

@Module({
  imports: [AzureModule, EmailModule, ConfigModule, RewardsModule],
  controllers: [OrganizationController],
  providers: [OrganizationService, PrismaService],
  exports: [OrganizationService],
})
export class OrganizationModule {}
