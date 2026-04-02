import { Module } from '@nestjs/common';
import { MulterModule } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';

import { PrismaService } from 'src/prisma.service';
import { AzureModule } from 'src/providers/azure/azure.module';
import { CommunityService } from './service/community.service';
import { CommunityController } from './controller/community.controller';
import { NotificationsModule } from 'src/notifications/notifications.module';
import { RedisModule } from 'src/providers/redis/redis.module';
import { JwtModule } from '@nestjs/jwt';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { CommunityGateway } from './gateway/community.gateway';

@Module({
  imports: [
    AzureModule,
    NotificationsModule,
    RedisModule,
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        secret: config.get<string>('JWT_SECRET'),
        signOptions: {
          expiresIn: config.get('JWT_EXPIRES_IN') ?? 604800,
        },
      }),
    }),
    MulterModule.register({ storage: memoryStorage() }),
  ],
  controllers: [CommunityController],
  providers: [CommunityService, PrismaService, CommunityGateway],
  exports: [CommunityService],
})
export class CommunityModule {}
