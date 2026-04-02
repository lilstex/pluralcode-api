import { Module } from '@nestjs/common';
import { DevPlanController } from './controller/dev-plan.controller';
import { DevPlanService } from './service/dev-plan.service';

@Module({
  controllers: [DevPlanController],
  providers: [DevPlanService],
  exports: [DevPlanService],
})
export class DevPlanModule {}
