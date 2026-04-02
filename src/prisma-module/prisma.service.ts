import {
  Injectable,
  OnModuleInit,
  OnModuleDestroy,
  Logger,
} from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

/**
 * PrismaService — single application-wide Prisma client.
 *
 * This is the ONLY place a PrismaClient is instantiated.
 * It is provided via the @Global() PrismaModule so every module
 * can inject it without declaring it as a local provider.
 *
 * Connection pool is controlled via the DATABASE_URL connection string:
 *   postgresql://user:pass@host:5432/db?connection_limit=10&pool_timeout=20
 *
 * Recommended values:
 *   connection_limit  = (2 × CPU cores) + 1  for most apps
 *   pool_timeout      = 20   (seconds to wait for a free connection before erroring)
 *   connect_timeout   = 10   (seconds for initial TCP connection)
 */
@Injectable()
export class PrismaService
  extends PrismaClient
  implements OnModuleInit, OnModuleDestroy
{
  private readonly logger = new Logger(PrismaService.name);

  constructor() {
    super({
      log: [
        { emit: 'event', level: 'error' },
        { emit: 'event', level: 'warn' },
        // Uncomment the line below ONLY in development to log every query:
        // { emit: 'event', level: 'query' },
      ],
      errorFormat: 'minimal',
    });
  }

  async onModuleInit() {
    await this.$connect();
    this.logger.log('Prisma connected.');

    // Log slow queries in all environments (>500 ms is worth investigating)
    (this.$on as any)('query', (e: any) => {
      if (e.duration > 500) {
        this.logger.warn(`Slow query (${e.duration}ms): ${e.query}`);
      }
    });

    (this.$on as any)('error', (e: any) => {
      this.logger.error('Prisma error event', e);
    });
  }

  async onModuleDestroy() {
    await this.$disconnect();
    this.logger.log('Prisma disconnected.');
  }

  /**
   * Graceful shutdown helper — call this in main.ts to ensure
   * the connection is cleanly released when the process receives SIGTERM/SIGINT.
   */
  async enableShutdownHooks(app: any) {
    process.on('beforeExit', async () => {
      await app.close();
    });
  }
}
