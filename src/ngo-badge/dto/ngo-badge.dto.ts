import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsOptional, IsString, MaxLength } from 'class-validator';
import { OrgBadgeLevel } from '@prisma/client';

// ─────────────────────────────────────────────────────────────────────────────
// NGO BADGE — DTOs
// ─────────────────────────────────────────────────────────────────────────────

export class AssignBadgeLevelDto {
  @ApiProperty({
    enum: OrgBadgeLevel,
    description: 'Target level to award. Admin may set any level on any org.',
    example: OrgBadgeLevel.LEVEL_1,
  })
  @IsEnum(OrgBadgeLevel)
  level: OrgBadgeLevel;

  @ApiPropertyOptional({
    description: 'Optional internal note recorded in the badge history.',
    example: 'Verified on-site on 2026-06-12. Docs checked.',
  })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  note?: string;
}

export class AcceptRecommendationDto {
  @ApiPropertyOptional({
    description: 'Optional internal note recorded in the badge history.',
  })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  note?: string;
}
