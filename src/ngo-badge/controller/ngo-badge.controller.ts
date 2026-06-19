import {
  Body,
  Controller,
  Get,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiQuery,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { Role } from '@prisma/client';

import { JwtAuthGuard } from 'src/common/guards/jwt-auth.guard';
import { RolesGuard } from 'src/common/guards/roles.guard';
import { PermissionsGuard } from 'src/common/guards/permissions.guard';
import { Roles } from 'src/common/decorators/roles.decorator';
import { CurrentUser } from 'src/common/decorators/current-user.decorator';

import { NgoBadgeService } from '../service/ngo-badge.service';
import {
  AssignBadgeLevelDto,
  AcceptRecommendationDto,
} from '../dto/ngo-badge.dto';
import { NgoBadgeRecomputeService } from '../service/ngo-badge-compute.service';

@ApiTags('NGO Badge Level')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard)
@Roles(Role.SUPER_ADMIN, Role.CONTENT_ADMIN)
@Controller('ngo-badges')
export class NgoBadgeController {
  constructor(
    private readonly ngoBadgeService: NgoBadgeService,
    private readonly recomputeService: NgoBadgeRecomputeService,
  ) {}

  // ───────────────────────────────────────────────────────────────────────────
  // FETCH RECOMMENDED NGOs
  // ───────────────────────────────────────────────────────────────────────────

  @Get('levels')
  @ApiOperation({
    summary:
      'List the three badge levels with their images — for the award dropdown.',
  })
  listLevels() {
    return this.ngoBadgeService.listLevels();
  }

  @Post('recompute')
  @ApiOperation({
    summary: 'Manually trigger the badge suggestion recompute (testing/ops).',
  })
  async recompute() {
    await this.recomputeService.recomputeAll();
    return {
      status: true,
      statusCode: HttpStatus.OK,
      message: 'Recompute complete.',
    };
  }

  @Get('recommendations')
  @ApiOperation({
    summary:
      'List NGOs suggested for an upgrade, plus Level-2 orgs listed for manual L3 verification.',
  })
  @ApiQuery({ name: 'page', required: false, example: 1 })
  @ApiQuery({ name: 'limit', required: false, example: 20 })
  @ApiResponse({
    status: 200,
    description: 'Recommendations fetched.',
    schema: {
      example: {
        status: true,
        statusCode: 200,
        message: 'Recommendations fetched.',
        data: {
          suggestions: [
            {
              orgId: 'dc9b08bd-17bd-4e78-9b17-2c4e98af9c40',
              name: 'Enlightenment Agency',
              acronym: null,
              logoUrl:
                'https://plrcapstorage.blob.core.windows.net/avatars/ec969230-8ef6-40c7-bac4-3995a47e2acf.png',
              state: 'FCT',
              currentLevel: null,
              suggestedLevel: 'LEVEL_1',
              level1Criteria: [
                {
                  key: 'resourcesCompleted',
                  label: 'Resources completed',
                  current: 17,
                  required: 25,
                  met: false,
                },
                {
                  key: 'communityInteractions',
                  label: 'Community likes (given + received)',
                  current: 1,
                  required: 10,
                  met: false,
                },
                {
                  key: 'communityReplies',
                  label: 'Community replies (made + received)',
                  current: 1,
                  required: 10,
                  met: false,
                },
                {
                  key: 'eventsRegistered',
                  label: 'Events registered',
                  current: 0,
                  required: 15,
                  met: false,
                },
              ],
              level2Criteria: [
                {
                  key: 'odaCompleted',
                  label: 'Completed ODA assessments',
                  current: 5,
                  required: 1,
                  met: true,
                },
                {
                  key: 'profileCompletion',
                  label: 'Profile completion (%)',
                  current: 38,
                  required: 100,
                  met: false,
                },
              ],
            },
          ],
          total: 1,
          page: 1,
          limit: 20,
          pages: 1,
        },
      },
    },
  })
  getRecommendations(
    @Query('page') page?: number,
    @Query('limit') limit?: number,
  ) {
    return this.ngoBadgeService.getRecommendations({ page, limit });
  }

  // ───────────────────────────────────────────────────────────────────────────
  // ACCEPT a recommendation → award the suggested next level
  // ───────────────────────────────────────────────────────────────────────────

  @Post('recommendations/:orgId/accept')
  @ApiOperation({
    summary: 'Accept a recommendation and award the suggested next level.',
  })
  acceptRecommendation(
    @CurrentUser() admin: any,
    @Param('orgId', ParseUUIDPipe) orgId: string,
    @Body() dto: AcceptRecommendationDto,
  ) {
    return this.ngoBadgeService.acceptRecommendation(admin.id, orgId, dto.note);
  }

  // ───────────────────────────────────────────────────────────────────────────
  // DISMISS a recommendation ("cancel")
  // ───────────────────────────────────────────────────────────────────────────

  @Post('recommendations/:orgId/dismiss')
  @ApiOperation({ summary: 'Dismiss (cancel) a pending recommendation.' })
  dismissRecommendation(@Param('orgId', ParseUUIDPipe) orgId: string) {
    return this.ngoBadgeService.dismissRecommendation(orgId);
  }

  // ───────────────────────────────────────────────────────────────────────────
  // AWARD / OVERRIDE — set any level on any org, anytime
  // ───────────────────────────────────────────────────────────────────────────

  @Patch('organizations/:orgId/level')
  @ApiOperation({
    summary:
      'Manually award an NGO badge level (any level, regardless of eligibility).',
  })
  assignLevel(
    @CurrentUser() admin: any,
    @Param('orgId', ParseUUIDPipe) orgId: string,
    @Body() dto: AssignBadgeLevelDto,
  ) {
    return this.ngoBadgeService.assignLevel(
      admin.id,
      orgId,
      dto.level,
      dto.note,
    );
  }
}
