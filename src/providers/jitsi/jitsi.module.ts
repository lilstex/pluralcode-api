import { Module } from '@nestjs/common';
import { JitsiService } from './jitsi.service';
import { ConfigModule } from '@nestjs/config';

@Module({
  imports: [ConfigModule],
  providers: [JitsiService],
  exports: [JitsiService],
})
export class JitsiModule {}
