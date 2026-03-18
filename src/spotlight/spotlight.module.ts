import { Module } from '@nestjs/common';
import { SpotlightController } from './controller/spotlight.controller';
import { SpotlightService } from './service/spotlight.service';
import { SpotlightScheduler } from './scheduler/spotlight.scheduler';
import { PrismaService } from 'src/prisma.service';
import { ConfigModule } from '@nestjs/config';

@Module({
  imports: [ConfigModule],
  controllers: [SpotlightController],
  providers: [SpotlightService, SpotlightScheduler, PrismaService],
  exports: [SpotlightService],
})
export class SpotlightModule {}
