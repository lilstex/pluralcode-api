import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiQuery,
} from '@nestjs/swagger';
import { Role } from '@prisma/client';

import {
  UpdateSpotlightSettingsDto,
  ManualSpotlightDto,
  SetSpotlightQueueDto,
  SpotlightHistoryQueryDto,
  SpotlightCurrentResponseDto,
  SpotlightSettingsResponseDto,
  SpotlightEntryResponseDto,
  SpotlightHistoryResponseDto,
} from '../dto/spotlight.dto';
import { SpotlightService } from '../service/spotlight.service';

import { JwtAuthGuard } from 'src/common/guards/jwt-auth.guard';
import { RolesGuard } from 'src/common/guards/roles.guard';
import { Roles } from 'src/common/decorators/roles.decorator';

@ApiTags('Spotlight')
@Controller('spotlight')
export class SpotlightController {
  constructor(private readonly spotlightService: SpotlightService) {}

  // ─────────────────────────────────────────────────────────────────────────────
  // PUBLIC
  // ─────────────────────────────────────────────────────────────────────────────

  @Get('current')
  @ApiOperation({
    summary: 'Get the currently active spotlight',
    description:
      'Returns the spotlighted organization with its details and seconds remaining. ' +
      'Returns null data if no spotlight is active (e.g. no eligible NGOs yet).',
  })
  @ApiResponse({ status: 200, type: SpotlightCurrentResponseDto })
  getCurrentSpotlight() {
    return this.spotlightService.getCurrentSpotlight();
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // SUPER_ADMIN — SETTINGS
  // ─────────────────────────────────────────────────────────────────────────────

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.SUPER_ADMIN)
  @ApiBearerAuth()
  @Get('settings')
  @ApiOperation({
    summary: 'Get spotlight settings (SUPER_ADMIN)',
    description: 'Returns defaultPeriodDays and current mode (AUTO | MANUAL).',
  })
  @ApiResponse({ status: 200, type: SpotlightSettingsResponseDto })
  getSettings() {
    return this.spotlightService.getSettings();
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.SUPER_ADMIN)
  @ApiBearerAuth()
  @Patch('settings')
  @ApiOperation({
    summary: 'Update spotlight default period (SUPER_ADMIN)',
    description:
      'Updates how many days each auto-selected spotlight lasts (1–30).',
  })
  @ApiResponse({ status: 200, type: SpotlightSettingsResponseDto })
  updateSettings(@Body() dto: UpdateSpotlightSettingsDto) {
    return this.spotlightService.updateSettings(dto);
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // SUPER_ADMIN — MANUAL
  // ─────────────────────────────────────────────────────────────────────────────

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.SUPER_ADMIN)
  @ApiBearerAuth()
  @Post('manual')
  @ApiOperation({
    summary: 'Immediately spotlight a single NGO (SUPER_ADMIN)',
    description:
      'Archives the current spotlight, clears any pending queue, and activates ' +
      'the chosen NGO immediately. Sets mode to MANUAL. ' +
      'Optional durationDays overrides the default period.',
  })
  @ApiResponse({ status: 201, type: SpotlightEntryResponseDto })
  setManualSpotlight(@Body() dto: ManualSpotlightDto) {
    return this.spotlightService.setManualSpotlight(dto);
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // SUPER_ADMIN — QUEUE
  // ─────────────────────────────────────────────────────────────────────────────

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.SUPER_ADMIN)
  @ApiBearerAuth()
  @Post('queue')
  @ApiOperation({
    summary: 'Set an ordered spotlight queue (SUPER_ADMIN)',
    description:
      'Replaces all pending (non-active) queue entries with a new ordered sequence. ' +
      'The currently active spotlight runs to completion before the queue kicks in. ' +
      'Sets mode to MANUAL. Accepts 1–20 items.',
  })
  @ApiResponse({ status: 201, type: SpotlightEntryResponseDto, isArray: true })
  setQueue(@Body() dto: SetSpotlightQueueDto) {
    return this.spotlightService.setQueue(dto);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.SUPER_ADMIN)
  @ApiBearerAuth()
  @Get('queue')
  @ApiOperation({
    summary: 'View the current pending spotlight queue (SUPER_ADMIN)',
    description: 'Returns all non-active, upcoming queue entries in order.',
  })
  @ApiResponse({ status: 200, type: SpotlightEntryResponseDto, isArray: true })
  getQueue() {
    return this.spotlightService.getQueue();
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.SUPER_ADMIN)
  @ApiBearerAuth()
  @Delete('queue')
  @ApiOperation({
    summary: 'Clear the manual queue and return to AUTO mode (SUPER_ADMIN)',
    description:
      'Deletes all pending queue entries. The active spotlight (if any) continues ' +
      'until it expires, after which the scheduler will auto-select.',
  })
  clearQueue() {
    return this.spotlightService.clearQueue();
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // SUPER_ADMIN — HISTORY
  // ─────────────────────────────────────────────────────────────────────────────

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.SUPER_ADMIN)
  @ApiBearerAuth()
  @Get('history')
  @ApiOperation({
    summary: 'Paginated history of all past spotlights (SUPER_ADMIN)',
  })
  @ApiQuery({ name: 'page', required: false, example: 1 })
  @ApiQuery({ name: 'limit', required: false, example: 20 })
  @ApiResponse({ status: 200, type: SpotlightHistoryResponseDto })
  getHistory(@Query() query: SpotlightHistoryQueryDto) {
    return this.spotlightService.getHistory(query);
  }
}
