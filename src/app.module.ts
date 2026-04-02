import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { UsersModule } from './users/users.module';
import { ResourcesModule } from './resources/resources.module';
import { EventsModule } from './events/events.module';
import { OrganizationModule } from './organizations/organizations.module';
import { MentorRequestModule } from './mentor-request/mentor-request.module';
import { OdaModule } from './oda/oda.module';
import { DevPlanModule } from './dev-plan/dev-plan.module';
import { CommunityModule } from './community/community.module';
import { SpotlightModule } from './spotlight/spotlight.module';
import { AchievementsModule } from './achievements/achievements.module';
import { NewsModule } from './news/news.module';
import { ScheduleModule } from '@nestjs/schedule';
import { NotificationsModule } from './notifications/notifications.module';
import { RedisModule } from './providers/redis/redis.module';

@Module({
  imports: [
    ScheduleModule.forRoot(),
    UsersModule,
    OrganizationModule,
    ResourcesModule,
    EventsModule,
    MentorRequestModule,
    OdaModule,
    DevPlanModule,
    CommunityModule,
    SpotlightModule,
    AchievementsModule,
    NewsModule,
    NotificationsModule,
    RedisModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
