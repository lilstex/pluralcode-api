import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsInt,
  IsArray,
  Min,
  Max,
  ValidateNested,
  ArrayMinSize,
  ArrayMaxSize,
} from 'class-validator';
import { Type } from 'class-transformer';

// ─────────────────────────────────────────────
// REQUEST DTOs
// ─────────────────────────────────────────────

export class UpdateSpotlightSettingsDto {
  @ApiProperty({
    example: 3,
    description: 'How many days each auto-selected spotlight lasts (1–30)',
    minimum: 1,
    maximum: 30,
  })
  @IsInt()
  @Min(1)
  @Max(30)
  @Type(() => Number)
  defaultPeriodDays: number;
}

export class ManualSpotlightDto {
  @ApiProperty({
    example: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
    description: 'UUID of the Organization to spotlight immediately',
  })
  @IsNotEmpty()
  @IsString()
  orgId: string;

  @ApiPropertyOptional({
    example: 5,
    description:
      'Override duration in days. Falls back to defaultPeriodDays if omitted.',
    minimum: 1,
  })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Type(() => Number)
  durationDays?: number;
}

export class SpotlightQueueItemDto {
  @ApiProperty({
    example: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
    description: 'UUID of the Organization',
  })
  @IsNotEmpty()
  @IsString()
  orgId: string;

  @ApiProperty({
    example: 3,
    description: 'How many days this entry should be spotlighted',
    minimum: 1,
  })
  @IsInt()
  @Min(1)
  @Type(() => Number)
  durationDays: number;
}

export class SetSpotlightQueueDto {
  @ApiProperty({
    type: [SpotlightQueueItemDto],
    description: 'Ordered list of NGOs to spotlight (1–20 items)',
  })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(20)
  @ValidateNested({ each: true })
  @Type(() => SpotlightQueueItemDto)
  items: SpotlightQueueItemDto[];
}

export class SpotlightHistoryQueryDto {
  @ApiPropertyOptional({ example: 1 })
  @IsOptional()
  page?: number;

  @ApiPropertyOptional({ example: 20 })
  @IsOptional()
  limit?: number;
}

// ─────────────────────────────────────────────
// RESPONSE DTOs
// ─────────────────────────────────────────────

export class SpotlightOrgDto {
  @ApiProperty() id: string;
  @ApiProperty() name: string;
  @ApiPropertyOptional() acronym?: string;
  @ApiPropertyOptional() logoUrl?: string;
  @ApiPropertyOptional() description?: string;
  @ApiPropertyOptional() mission?: string;
  @ApiProperty({ type: [String] }) sectors: string[];
  @ApiProperty() state: string;
  @ApiProperty() lga: string;
}

export class SpotlightCurrentResponseDto {
  @ApiProperty() id: string;
  @ApiProperty({ type: SpotlightOrgDto }) org: SpotlightOrgDto;
  @ApiProperty() startAt: Date;
  @ApiProperty() endAt: Date;
  @ApiProperty() wasAuto: boolean;
  @ApiProperty({ description: 'Seconds remaining in this spotlight' })
  secondsRemaining: number;
}

export class SpotlightSettingsResponseDto {
  @ApiProperty() defaultPeriodDays: number;
  @ApiProperty({ enum: ['AUTO', 'MANUAL'] }) mode: string;
  @ApiProperty() updatedAt: Date;
}

export class SpotlightEntryResponseDto {
  @ApiProperty() id: string;
  @ApiProperty() orgId: string;
  @ApiProperty({ type: SpotlightOrgDto }) org: SpotlightOrgDto;
  @ApiProperty() startAt: Date;
  @ApiProperty() endAt: Date;
  @ApiProperty() isActive: boolean;
  @ApiProperty() wasAuto: boolean;
  @ApiPropertyOptional() order?: number;
  @ApiProperty() createdAt: Date;
}

export class SpotlightHistoryItemDto {
  @ApiProperty() id: string;
  @ApiProperty() orgId: string;
  @ApiProperty({ type: SpotlightOrgDto }) org: SpotlightOrgDto;
  @ApiProperty() startAt: Date;
  @ApiProperty() endAt: Date;
  @ApiProperty() wasAuto: boolean;
  @ApiProperty() createdAt: Date;
}

export class SpotlightHistoryResponseDto {
  @ApiProperty({ type: [SpotlightHistoryItemDto] })
  history: SpotlightHistoryItemDto[];
  @ApiProperty() total: number;
  @ApiProperty() page: number;
  @ApiProperty() limit: number;
  @ApiProperty() pages: number;
}
