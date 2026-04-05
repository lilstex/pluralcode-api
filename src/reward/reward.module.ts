import { Module } from '@nestjs/common';
import { RewardsService } from './service/reward.service';

@Module({
  providers: [RewardsService],
  exports: [RewardsService],
})
export class RewardsModule {}
