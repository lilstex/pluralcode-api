import { Module } from '@nestjs/common';
import { MulterModule } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';

import { PrismaService } from 'src/prisma.service';
import { AzureModule } from 'src/providers/azure/azure.module';
import { NewsService } from './service/news.service';
import { NewsController } from './controller/news.controller';

@Module({
  imports: [AzureModule, MulterModule.register({ storage: memoryStorage() })],
  controllers: [NewsController],
  providers: [NewsService, PrismaService],
  exports: [NewsService],
})
export class NewsModule {}
