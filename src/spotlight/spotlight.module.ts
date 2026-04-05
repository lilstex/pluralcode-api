import { Module } from '@nestjs/common';
import { SpotlightController } from './controller/spotlight.controller';
import { SpotlightService } from './service/spotlight.service';
import { SpotlightScheduler } from './scheduler/spotlight.scheduler';
import { ConfigModule } from '@nestjs/config';

@Module({
  imports: [ConfigModule],
  controllers: [SpotlightController],
  providers: [SpotlightService, SpotlightScheduler],
  exports: [SpotlightService],
})
export class SpotlightModule {}
