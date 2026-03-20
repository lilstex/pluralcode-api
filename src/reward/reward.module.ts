import { Module } from '@nestjs/common';
import { PrismaService } from 'src/prisma.service';
import { RewardsService } from './service/reward.service';

@Module({
  providers: [RewardsService, PrismaService],
  exports: [RewardsService],
})
export class RewardsModule {}
