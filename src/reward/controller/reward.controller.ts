import { Controller, Post, Body, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { Role } from '@prisma/client';

import { JwtAuthGuard } from 'src/common/guards/jwt-auth.guard';
import { RolesGuard } from 'src/common/guards/roles.guard';
import { PermissionsGuard } from 'src/common/guards/permissions.guard';
import { Roles } from 'src/common/decorators/roles.decorator';
import { RewardsService } from '../service/reward.service';
import { RewardDto } from '../dto/reward.dto';

@ApiTags('Rewards')
@Controller('rewards')
export class RewardsController {
  constructor(private readonly rewardService: RewardsService) {}

  @UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard)
  @Roles(
    Role.SUPER_ADMIN,
    Role.RESOURCE_ADMIN,
    Role.CONTENT_ADMIN,
    Role.EVENT_ADMIN,
  )
  @ApiBearerAuth()
  @Post()
  @ApiOperation({ summary: 'Admin: Award badge and points to users' })
  async createReward(@Body() dto: RewardDto) {
    return this.rewardService.awardBadge(dto);
  }
}
