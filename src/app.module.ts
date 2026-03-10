import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { UsersModule } from './users/users.module';
import { ResourcesModule } from './resources/resources.module';
import { EventsModule } from './events/events.module';
import { OrganizationModule } from './organizations/organizations.module';
import { MentorRequestModule } from './mentor-request/mentor-request.module';

@Module({
  imports: [
    UsersModule,
    OrganizationModule,
    ResourcesModule,
    EventsModule,
    MentorRequestModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
