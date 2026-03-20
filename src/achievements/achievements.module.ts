import { Module } from '@nestjs/common';
import { PrismaService } from 'src/prisma.service';
import { AchievementsController } from './controller/achievements.controller';
import { AchievementsService } from './service/achievements.service';

@Module({
  controllers: [AchievementsController],
  providers: [AchievementsService, PrismaService],
  exports: [AchievementsService],
})
export class AchievementsModule {}
