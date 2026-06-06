import { Module } from '@nestjs/common';
import { RewardsService } from './service/reward.service';
import { RewardsController } from './controller/reward.controller';

@Module({
  providers: [RewardsService],
  controllers: [RewardsController],
  exports: [RewardsService],
})
export class RewardsModule {}
