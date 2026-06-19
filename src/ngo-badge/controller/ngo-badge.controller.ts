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
  @ApiResponse({
    status: 200,
    description: 'Badge levels retrieved.',
    schema: {
      example: {
        status: true,
        statusCode: 200,
        message: 'Badge levels retrieved.',
        data: [
          {
            level: 'LEVEL_1',
            title: 'PLRCAP Registered Active Member',
            description:
              'This entry-level badge is awarded to organizations that have demonstrated ongoing interest and involvement in NGO capacity development.',
            imageUrl:
              'https://plrcapstorage.blob.core.windows.net/avatars/d2326795-6a16-4484-ac34-c90793bcc263.png',
          },
          {
            level: 'LEVEL_2',
            title: 'PLRCAP Programme Graduate',
            description:
              'This badge indicates a deeper level of engagement and commitment to institutional strengthening.',
            imageUrl:
              'hhttps://plrcapstorage.blob.core.windows.net/avatars/d2326795-6a16-4484-ac34-c90793bcc263.png',
          },
          {
            level: 'LEVEL_3',
            title: 'PLRCAP Gold Verified Organisation',
            description:
              'This highest-level badge reflects a strong track record of credibility, operational maturity, and impact.',
            imageUrl:
              'https://plrcapstorage.blob.core.windows.net/avatars/d2326795-6a16-4484-ac34-c90793bcc263.png',
          },
        ],
      },
    },
  })
  listLevels() {
    return this.ngoBadgeService.listLevels();
  }

  @Post('recompute')
  @ApiOperation({
    summary: 'Manually trigger the badge suggestion recompute (testing/ops).',
  })
  @ApiResponse({
    status: 200,
    description: 'Badge levels retrieved.',
    schema: {
      example: {
        status: true,
        statusCode: 200,
        message: 'Recompute complete.',
      },
    },
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
  @ApiResponse({
    status: 200,
    description: 'Badge levels retrieved.',
    schema: {
      example: {
        status: true,
        statusCode: 200,
        message: 'Badge level set to LEVEL_1.',
        data: {
          id: 'dc9b08bd-17bd-4e78-9b17-2c4e98af9c40',
          name: 'Enlightenment Agency',
          badgeLevel: 'LEVEL_1',
          badgeLevelAssignedAt: '2026-06-19T13:24:34.389Z',
        },
      },
    },
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
  @ApiResponse({
    status: 200,
    description: 'Badge levels retrieved.',
    schema: {
      example: {
        status: true,
        statusCode: 200,
        message: 'Badge level set to LEVEL_2.',
        data: {
          id: 'dc9b08bd-17bd-4e78-9b17-2c4e98af9c40',
          name: 'Enlightenment Agency',
          badgeLevel: 'LEVEL_2',
          badgeLevelAssignedAt: '2026-06-19T13:01:32.919Z',
        },
      },
    },
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
