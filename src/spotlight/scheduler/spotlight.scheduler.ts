import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { SpotlightService } from '../service/spotlight.service';

@Injectable()
export class SpotlightScheduler {
  private readonly logger = new Logger(SpotlightScheduler.name);

  constructor(private readonly spotlightService: SpotlightService) {}

  /**
   * Runs every hour on the hour.
   * Max lag between spotlight expiry and replacement is 1 hour — acceptable
   * for a spotlight feature.
   */
  @Cron(CronExpression.EVERY_HOUR)
  async handleSpotlightTick() {
    this.logger.log('Spotlight tick started.');
    await this.spotlightService.tick();
    this.logger.log('Spotlight tick completed.');
  }
}
