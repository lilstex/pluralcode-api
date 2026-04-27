import { Module } from '@nestjs/common';
import { AzureModule } from 'src/providers/azure/azure.module';
import { UploadsController } from './controller/uploads.controller';
import { UploadsService } from './service/uploads.service';

@Module({
  imports: [AzureModule],
  controllers: [UploadsController],
  providers: [UploadsService],
  exports: [UploadsService],
})
export class UploadsModule {}
