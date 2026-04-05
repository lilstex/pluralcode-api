import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsString,
  IsOptional,
  IsInt,
  IsIn,
  IsUUID,
  IsNumber,
  IsDateString,
} from 'class-validator';
import { Type } from 'class-transformer';

// ─────────────────────────────────────────────
// PRIORITY AREA
// ─────────────────────────────────────────────

export class CreatePriorityAreaDto {
  @ApiProperty({ description: 'UUID of the ODAPillar' })
  @IsUUID()
  pillarId: string;

  @ApiProperty({ description: 'UUID of the ODABuildingBlock under the pillar' })
  @IsUUID()
  buildingBlockId: string;

  @ApiProperty({
    description: 'UUID of the ODAQuestion (indicator) under the building block',
  })
  @IsUUID()
  indicatorId: string;

  @ApiPropertyOptional({ example: 72.5 })
  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  score?: number;

  @ApiPropertyOptional({ example: 'Strong community presence' })
  @IsOptional()
  @IsString()
  strength?: string;

  @ApiPropertyOptional({ example: 'Limited financial reporting capacity' })
  @IsOptional()
  @IsString()
  weakness?: string;

  @ApiPropertyOptional({ example: 'New donor partnerships available' })
  @IsOptional()
  @IsString()
  opportunity?: string;

  @ApiPropertyOptional({ example: 'Policy changes affecting funding' })
  @IsOptional()
  @IsString()
  threat?: string;

  @ApiProperty({
    description: 'Priority level: 1 (highest) – 4 (lowest)',
    example: 1,
  })
  @IsInt()
  @IsIn([1, 2, 3, 4])
  @Type(() => Number)
  priority: number;

  @ApiPropertyOptional({ example: 'Develop a financial management SOP' })
  @IsOptional()
  @IsString()
  act?: string;
}

export class UpdatePriorityAreaDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  pillarId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  buildingBlockId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  indicatorId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  score?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  strength?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  weakness?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  opportunity?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  threat?: string;

  @ApiPropertyOptional({ description: '1 | 2 | 3 | 4' })
  @IsOptional()
  @IsInt()
  @IsIn([1, 2, 3, 4])
  @Type(() => Number)
  priority?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  act?: string;
}

// ─────────────────────────────────────────────
// ACTION PLAN
// ─────────────────────────────────────────────

export class CreateActionPlanDto {
  @ApiPropertyOptional({
    example: 'Build a robust financial management system',
  })
  @IsOptional()
  @IsString()
  objective?: string;

  @ApiPropertyOptional({
    example: 'Monthly financial reports submitted on time',
  })
  @IsOptional()
  @IsString()
  kpi?: string;

  @ApiPropertyOptional({
    example: '1. Hire finance officer\n2. Adopt accounting software',
  })
  @IsOptional()
  @IsString()
  actionSteps?: string;

  @ApiPropertyOptional({ example: 'Executive Director' })
  @IsOptional()
  @IsString()
  responsiblePerson?: string;

  @ApiPropertyOptional({
    example: '2025-12-31',
    description: 'ISO 8601 date string',
  })
  @IsOptional()
  @IsDateString()
  timeline?: string;

  @ApiPropertyOptional({ example: 'Finance committee, external auditor' })
  @IsOptional()
  @IsString()
  support?: string;

  @ApiPropertyOptional({
    example: 'QuickBooks licence ($300), training budget ($500)',
  })
  @IsOptional()
  @IsString()
  resourcePlan?: string;
}

export class UpdateActionPlanDto extends CreateActionPlanDto {}

// ─────────────────────────────────────────────
// EVALUATION
// ─────────────────────────────────────────────

export class CreateEvaluationDto {
  @ApiPropertyOptional({
    example: 'Hired a finance officer and adopted QuickBooks',
  })
  @IsOptional()
  @IsString()
  whatWasDone?: string;

  @ApiPropertyOptional({
    example: 'Partially — reports now monthly but auditor not yet engaged',
  })
  @IsOptional()
  @IsString()
  wereObjectivesMet?: string;

  @ApiPropertyOptional({
    example: 'Team capacity needs strengthening before full compliance',
  })
  @IsOptional()
  @IsString()
  whatDidWeLearn?: string;

  @ApiPropertyOptional({
    example: 'Engage an external auditor in Q1 next year',
  })
  @IsOptional()
  @IsString()
  nextSteps?: string;
}

export class UpdateEvaluationDto extends CreateEvaluationDto {}

// ─────────────────────────────────────────────
// RESPONSE DTOs
// ─────────────────────────────────────────────

export class ActionPlanResponseDto {
  @ApiProperty() id: string;
  @ApiPropertyOptional() objective?: string;
  @ApiPropertyOptional() kpi?: string;
  @ApiPropertyOptional() actionSteps?: string;
  @ApiPropertyOptional() responsiblePerson?: string;
  @ApiPropertyOptional() timeline?: Date;
  @ApiPropertyOptional() support?: string;
  @ApiPropertyOptional() resourcePlan?: string;
  @ApiProperty() createdAt: Date;
  @ApiProperty() updatedAt: Date;
}

export class EvaluationResponseDto {
  @ApiProperty() id: string;
  @ApiPropertyOptional() whatWasDone?: string;
  @ApiPropertyOptional() wereObjectivesMet?: string;
  @ApiPropertyOptional() whatDidWeLearn?: string;
  @ApiPropertyOptional() nextSteps?: string;
  @ApiProperty() createdAt: Date;
  @ApiProperty() updatedAt: Date;
}

export class PriorityAreaResponseDto {
  @ApiProperty() id: string;
  @ApiProperty() orgId: string;
  @ApiProperty() pillarId: string;
  @ApiProperty() buildingBlockId: string;
  @ApiProperty() indicatorId: string;
  @ApiPropertyOptional() score?: number;
  @ApiPropertyOptional() strength?: string;
  @ApiPropertyOptional() weakness?: string;
  @ApiPropertyOptional() opportunity?: string;
  @ApiPropertyOptional() threat?: string;
  @ApiProperty() priority: number;
  @ApiPropertyOptional() act?: string;
  @ApiPropertyOptional({ type: ActionPlanResponseDto })
  actionPlan?: ActionPlanResponseDto;
  @ApiPropertyOptional({ type: EvaluationResponseDto })
  evaluation?: EvaluationResponseDto;
  @ApiProperty() createdAt: Date;
  @ApiProperty() updatedAt: Date;
}
