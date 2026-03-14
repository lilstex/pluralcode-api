import { Module } from '@nestjs/common';
import { DevPlanController } from './controller/dev-plan.controller';
import { DevPlanService } from './service/dev-plan.service';
import { PrismaService } from 'src/prisma.service';

@Module({
  controllers: [DevPlanController],
  providers: [DevPlanService, PrismaService],
  exports: [DevPlanService],
})
export class DevPlanModule {}
