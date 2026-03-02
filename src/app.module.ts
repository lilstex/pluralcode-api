import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { UsersModule } from './users/users.module';
import { ResourcesModule } from './resources/resources.module';
import { EventsModule } from './events/events.module';

@Module({
  imports: [UsersModule, ResourcesModule, EventsModule],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
