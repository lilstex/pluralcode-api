import { Module } from '@nestjs/common';
import { AchievementsController } from './controller/achievements.controller';
import { AchievementsService } from './service/achievements.service';

@Module({
  controllers: [AchievementsController],
  providers: [AchievementsService],
  exports: [AchievementsService],
})
export class AchievementsModule {}
