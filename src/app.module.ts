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

@Module({
  imports: [
    UsersModule,
    OrganizationModule,
    ResourcesModule,
    EventsModule,
    MentorRequestModule,
    OdaModule,
    DevPlanModule,
    CommunityModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
