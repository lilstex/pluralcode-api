import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { ConfigModule, ConfigService } from '@nestjs/config';

import { UserController } from './controller/users.controller';
import { UserService } from './service/users.service';
import { JwtStrategy } from 'src/common/strategies/jwt.strategy';
import { EmailModule } from 'src/providers/email/email.module';
import { AzureModule } from 'src/providers/azure/azure.module';
import { PrismaService } from 'src/prisma.service';

@Module({
  imports: [
    ConfigModule,
    PassportModule.register({ defaultStrategy: 'jwt' }),
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
    EmailModule,
    AzureModule,
  ],
  controllers: [UserController],
  providers: [UserService, JwtStrategy, PrismaService],
  exports: [UserService, JwtModule],
})
export class UsersModule {}
