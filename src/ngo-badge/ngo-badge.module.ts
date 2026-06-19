import { Module } from '@nestjs/common';
import { NgoBadgeController } from './controller/ngo-badge.controller';
import { NgoBadgeService } from './service/ngo-badge.service';
import { NgoBadgeEligibilityService } from './service/ngo-badge-eligibility.service';
import { NgoBadgeRecomputeService } from './service/ngo-badge-compute.service';

@Module({
  controllers: [NgoBadgeController],
  providers: [
    NgoBadgeService,
    NgoBadgeEligibilityService,
    NgoBadgeRecomputeService,
  ],
  exports: [NgoBadgeEligibilityService],
})
export class NgoBadgeModule {}
