import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsArray,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { FormStatus } from '@prisma/client';

// ─────────────────────────────────────────────────────────────────────────────
// SCALE — fixed options per question (not stored in DB, enforced in DTO only)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * 1 = Not in place
 * 2 = Basic / incomplete
 * 3 = Functional
 * 4 = Best practice
 */
export type ODAScale = 1 | 2 | 3 | 4;

export class AnswerItemDto {
  @ApiProperty({ description: 'UUID of the ODAQuestion being answered' })
  @IsUUID()
  questionId: string;

  @ApiProperty({
    enum: [1, 2, 3, 4],
    description: '1=Not in place | 2=Basic | 3=Functional | 4=Best practice',
    example: 3,
  })
  @IsInt()
  @Min(1)
  @Max(4)
  @Type(() => Number)
  selectedScale: ODAScale;

  @ApiPropertyOptional({
    description: 'Evidence / description text',
    example: 'We have a Board Charter signed in 2023.',
  })
  @IsOptional()
  @IsString()
  evidence?: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// NGO REQUEST DTOs
// ─────────────────────────────────────────────────────────────────────────────

export class SaveBlockResponseDto {
  @ApiProperty({ type: [AnswerItemDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => AnswerItemDto)
  answers: AnswerItemDto[];
}

export class ListAssessmentsQueryDto {
  @ApiPropertyOptional({ enum: FormStatus })
  @IsOptional()
  @IsEnum(FormStatus)
  status?: FormStatus;

  @ApiPropertyOptional({ example: 1 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Type(() => Number)
  page?: number;

  @ApiPropertyOptional({ example: 20 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(100)
  @Type(() => Number)
  limit?: number;
}

// ─────────────────────────────────────────────────────────────────────────────
// ADMIN REQUEST DTOs
// ─────────────────────────────────────────────────────────────────────────────

export class AdminListAssessmentsQueryDto {
  @ApiPropertyOptional({ enum: FormStatus })
  @IsOptional()
  @IsEnum(FormStatus)
  status?: FormStatus;

  @ApiPropertyOptional({ description: 'Filter by organisation UUID' })
  @IsOptional()
  @IsUUID()
  orgId?: string;

  @ApiPropertyOptional({ example: 1 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Type(() => Number)
  page?: number;

  @ApiPropertyOptional({ example: 20 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(100)
  @Type(() => Number)
  limit?: number;
}

// ─────────────────────────────────────────────────────────────────────────────
// RESPONSE DTOs
// ─────────────────────────────────────────────────────────────────────────────

export class AnswerItemResponseDto {
  @ApiProperty() questionId: string;
  @ApiProperty() questionText: string;
  @ApiProperty() selectedScale: number;
  @ApiPropertyOptional() evidence?: string;
}

export class BlockResponseItemDto {
  @ApiProperty() id: string;
  @ApiProperty() buildingBlockId: string;
  @ApiProperty() buildingBlockName: string;
  @ApiProperty() pillarId: string;
  @ApiProperty() pillarName: string;
  @ApiProperty() status: string;
  @ApiPropertyOptional() blockScore?: number;
  @ApiProperty() maxScore: number;
  @ApiProperty({ type: [AnswerItemResponseDto] })
  answers: AnswerItemResponseDto[];
  @ApiProperty() updatedAt: Date;
}

export class AssessmentResponseDto {
  @ApiProperty() id: string;
  @ApiProperty({ enum: FormStatus }) status: FormStatus;
  @ApiPropertyOptional() overallScore?: number;
  @ApiPropertyOptional() aiSummary?: string;
  @ApiProperty() startedAt: Date;
  @ApiPropertyOptional() completedAt?: Date;
  @ApiProperty() orgId: string;
  @ApiPropertyOptional() orgName?: string;

  // Progress fields (always present)
  @ApiProperty() blocksTotal: number;
  @ApiProperty() blocksSubmitted: number;
  @ApiProperty() completionPercent: number;

  @ApiProperty({ type: [BlockResponseItemDto] })
  blockResponses: BlockResponseItemDto[];
  @ApiProperty() createdAt: Date;
  @ApiProperty() updatedAt: Date;
}

export class AssessmentListItemDto {
  @ApiProperty() id: string;
  @ApiProperty({ enum: FormStatus }) status: FormStatus;
  @ApiPropertyOptional() overallScore?: number;
  @ApiProperty() startedAt: Date;
  @ApiPropertyOptional() completedAt?: Date;
  @ApiProperty() orgId: string;
  @ApiPropertyOptional() orgName?: string;
  @ApiProperty() blocksTotal: number;
  @ApiProperty() blocksSubmitted: number;
  @ApiProperty() completionPercent: number;
  @ApiProperty() createdAt: Date;
}

export class AssessmentListResponseDto {
  @ApiProperty() status: boolean;
  @ApiProperty() statusCode: number;
  @ApiProperty({ type: [AssessmentListItemDto] }) data: AssessmentListItemDto[];
  @ApiProperty() total: number;
  @ApiProperty() page: number;
  @ApiProperty() limit: number;
  @ApiProperty() totalPages: number;
}

export class AssessmentSingleResponseDto {
  @ApiProperty() status: boolean;
  @ApiProperty() statusCode: number;
  @ApiProperty({ type: AssessmentResponseDto }) data: AssessmentResponseDto;
}

export class AssessmentActionResponseDto {
  @ApiProperty() status: boolean;
  @ApiProperty() statusCode: number;
  @ApiProperty() message: string;
  @ApiPropertyOptional() data?: any;
}

export class ODAStatsResponseDto {
  @ApiProperty() status: boolean;
  @ApiProperty() statusCode: number;
  @ApiProperty() data: {
    total: number;
    inProgress: number;
    submitted: number;
    completed: number;
    averageOverallScore: number;
    blockBreakdown: Array<{
      blockId: string;
      blockName: string;
      pillarName: string;
      averageScore: number;
      responsesCount: number;
    }>;
  };
}
