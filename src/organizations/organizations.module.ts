import { Module } from '@nestjs/common';
import { OrganizationController } from './controller/organizations.controller';
import { OrganizationService } from './service/organizations.service';
import { PrismaService } from 'src/prisma.service';
import { AzureModule } from 'src/providers/azure/azure.module';

@Module({
  imports: [AzureModule],
  controllers: [OrganizationController],
  providers: [OrganizationService, PrismaService],
  exports: [OrganizationService],
})
export class OrganizationModule {}
