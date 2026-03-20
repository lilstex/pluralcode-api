/* eslint-disable @typescript-eslint/no-unused-vars */
import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiBearerAuth,
  ApiQuery,
  ApiProperty,
  ApiPropertyOptional,
} from '@nestjs/swagger';

import { JwtAuthGuard } from 'src/common/guards/jwt-auth.guard';
import { CurrentUser } from 'src/common/decorators/current-user.decorator';
import { AchievementsService } from '../service/achievements.service';

class AchievementBadgeDto {
  @ApiProperty() id: string;
  @ApiProperty() name: string;
  @ApiProperty() imageUrl: string;
}

class AchievementItemDto {
  @ApiProperty() id: string;
  @ApiProperty() title: string;
  @ApiProperty() description: string;
  @ApiProperty() points: number;
  @ApiProperty() earnedAt: Date;
  @ApiPropertyOptional({ type: AchievementBadgeDto })
  badge?: AchievementBadgeDto | null;
}

@ApiTags('Achievements')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('achievements')
export class AchievementsController {
  constructor(private readonly achievementsService: AchievementsService) {}

  @Get('me')
  @ApiOperation({
    summary: 'Get my achievements',
    description:
      'Returns a paginated list of all achievements earned by the authenticated user, ' +
      'including the title, description, points awarded, date earned, and badge (if any). ' +
      'Achievements are created by: completing a resource, completing your profile (expert or org), ' +
      'or completing a mentorship session.',
  })
  @ApiQuery({ name: 'page', required: false, example: 1 })
  @ApiQuery({ name: 'limit', required: false, example: 20 })
  getMyAchievements(
    @CurrentUser() user: any,
    @Query('page') page?: number,
    @Query('limit') limit?: number,
  ) {
    return this.achievementsService.getMyAchievements(user.id, { page, limit });
  }
}
