import { Global, Module } from '@nestjs/common';
import { PrismaService } from './prisma.service';

/**
 * PrismaModule — @Global singleton.
 *
 * Import this ONCE in AppModule.
 * Every other module can injectwithout declaring it as a
 * local provider — and without opening a separate connection pool.
 *
 * IMPORTANT: Remove `` from the `providers` array of every
 * feature module. It only needs to live here.
 */
@Global()
@Module({
  providers: [PrismaService],
  exports: [PrismaService],
})
export class PrismaModule {}
