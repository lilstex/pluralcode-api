import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsInt,
  IsUUID,
  Min,
  Max,
  IsArray,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

// ─────────────────────────────────────────────────────────────────────────────
// PILLAR
// ─────────────────────────────────────────────────────────────────────────────

export class CreatePillarDto {
  @ApiProperty({ example: 'Leadership' })
  @IsNotEmpty()
  @IsString()
  name: string;

  @ApiProperty({ example: 1 })
  @IsInt()
  @Min(1)
  @Type(() => Number)
  order: number;
}

export class UpdatePillarDto {
  @ApiPropertyOptional({ example: 'Leadership & Governance' })
  @IsOptional()
  @IsString()
  name?: string;

  @ApiPropertyOptional({ example: 2 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Type(() => Number)
  order?: number;
}

// ─────────────────────────────────────────────────────────────────────────────
// BUILDING BLOCK
// ─────────────────────────────────────────────────────────────────────────────

export class CreateBuildingBlockDto {
  @ApiProperty({ example: 'Governance' })
  @IsNotEmpty()
  @IsString()
  name: string;

  @ApiProperty({ description: 'UUID of the parent pillar' })
  @IsUUID()
  pillarId: string;

  @ApiProperty({ example: 1 })
  @IsInt()
  @Min(1)
  @Type(() => Number)
  order: number;

  @ApiPropertyOptional({
    example: 100,
    description: 'Maximum achievable score for this block',
  })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(1000)
  @Type(() => Number)
  maxScore?: number;
}

export class UpdateBuildingBlockDto {
  @ApiPropertyOptional({ example: 'Governance & Compliance' })
  @IsOptional()
  @IsString()
  name?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  pillarId?: string;

  @ApiPropertyOptional({ example: 2 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Type(() => Number)
  order?: number;

  @ApiPropertyOptional({ example: 80 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(1000)
  @Type(() => Number)
  maxScore?: number;
}

// ─────────────────────────────────────────────────────────────────────────────
// QUESTION OPTIONS
// ─────────────────────────────────────────────────────────────────────────────

export class CreateQuestionOptionDto {
  @ApiProperty({
    example:
      'The organisation has a fully functional, documented board that meets regularly.',
    description: 'Display text for this option',
  })
  @IsNotEmpty()
  @IsString()
  text: string;

  @ApiProperty({
    enum: [1, 2, 3, 4],
    example: 4,
    description:
      '1=Not in place | 2=Basic/Incomplete | 3=Functional | 4=Best practice',
  })
  @IsInt()
  @Min(1)
  @Max(4)
  @Type(() => Number)
  scaleValue: number;

  @ApiProperty({
    example: 1,
    description: 'Display order of this option (ascending)',
  })
  @IsInt()
  @Min(0)
  @Type(() => Number)
  order: number;
}

export class UpdateQuestionOptionDto {
  @ApiPropertyOptional() @IsOptional() @IsString() text?: string;

  @ApiPropertyOptional({ enum: [1, 2, 3, 4] })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(4)
  @Type(() => Number)
  scaleValue?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(0)
  @Type(() => Number)
  order?: number;
}

// ─────────────────────────────────────────────────────────────────────────────
// QUESTION
// ─────────────────────────────────────────────────────────────────────────────

export class CreateQuestionDto {
  @ApiProperty({ example: 'Does the organisation have a Board of Directors?' })
  @IsNotEmpty()
  @IsString()
  text: string;

  // Injected from path param :blockId by the controller — optional in body
  @ApiPropertyOptional({ description: 'UUID of the parent building block' })
  @IsOptional()
  @IsUUID()
  buildingBlockId?: string;

  @ApiProperty({ example: 1 })
  @IsInt()
  @Min(1)
  @Type(() => Number)
  order: number;

  @ApiPropertyOptional({
    type: [CreateQuestionOptionDto],
    description:
      'Options to attach to this question. scaleValue (1-4) determines the score.',
  })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateQuestionOptionDto)
  options?: CreateQuestionOptionDto[];
}

export class UpdateQuestionDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  text?: string;

  @ApiPropertyOptional({ example: 2 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Type(() => Number)
  order?: number;

  @ApiPropertyOptional({
    type: [CreateQuestionOptionDto],
    description:
      'Full replacement of question options. Existing options are deleted and replaced.',
  })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateQuestionOptionDto)
  options?: CreateQuestionOptionDto[];
}

// ─────────────────────────────────────────────────────────────────────────────
// RESPONSE DTOs
// ─────────────────────────────────────────────────────────────────────────────

export class QuestionOptionResponseDto {
  @ApiProperty() id: string;
  @ApiProperty() text: string;
  @ApiProperty() scaleValue: number;
  @ApiProperty() order: number;
}

export class QuestionResponseDto {
  @ApiProperty() id: string;
  @ApiProperty() text: string;
  @ApiProperty() order: number;
  @ApiProperty() buildingBlockId: string;
  @ApiProperty({ type: [QuestionOptionResponseDto] })
  options: QuestionOptionResponseDto[];
  @ApiProperty() createdAt: Date;
  @ApiProperty() updatedAt: Date;
}

export class BuildingBlockResponseDto {
  @ApiProperty() id: string;
  @ApiProperty() name: string;
  @ApiProperty() order: number;
  @ApiProperty() maxScore: number;
  @ApiProperty() pillarId: string;
  @ApiProperty({ type: [QuestionResponseDto] })
  questions: QuestionResponseDto[];
  @ApiProperty() createdAt: Date;
  @ApiProperty() updatedAt: Date;
}

export class PillarResponseDto {
  @ApiProperty() id: string;
  @ApiProperty() name: string;
  @ApiProperty() order: number;
  @ApiProperty({ type: [BuildingBlockResponseDto] })
  buildingBlocks: BuildingBlockResponseDto[];
  @ApiProperty() createdAt: Date;
  @ApiProperty() updatedAt: Date;
}

export class StructureResponseDto {
  @ApiProperty() status: boolean;
  @ApiProperty() statusCode: number;
  @ApiProperty({ type: [PillarResponseDto] }) data: PillarResponseDto[];
}

export class StructureActionResponseDto {
  @ApiProperty() status: boolean;
  @ApiProperty() statusCode: number;
  @ApiProperty() message: string;
  @ApiPropertyOptional() data?: any;
}

export class BuildingBlockSummaryDto {
  @ApiProperty() id: string;
  @ApiProperty() name: string;
  @ApiProperty() order: number;
  @ApiProperty() questionsCount: number;
}

export class PillarSummaryDto {
  @ApiProperty() id: string;
  @ApiProperty() name: string;
  @ApiProperty() order: number;
  @ApiProperty() blocksCount: number;
  @ApiProperty({ type: [BuildingBlockSummaryDto] })
  buildingBlocks: BuildingBlockSummaryDto[];
}

export class SummaryResponseDto {
  @ApiProperty() status: boolean;
  @ApiProperty() statusCode: number;
  @ApiProperty({ type: [PillarSummaryDto] }) data: PillarSummaryDto[];
}
