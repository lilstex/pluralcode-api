import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsArray,
  IsBoolean,
  IsUUID,
  IsEnum,
  IsInt,
  Min,
  Max,
} from 'class-validator';
import { Type } from 'class-transformer';
import { MentorRequestStatus } from '@prisma/client';

// ─────────────────────────────────────────────────────────────────────────────
// REQUEST DTOs
// ─────────────────────────────────────────────────────────────────────────────

export class CreateMentorRequestDto {
  @ApiProperty({
    description: 'UUID of the expert/mentor being requested',
    example: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
  })
  @IsUUID()
  @IsNotEmpty()
  mentorId: string;

  @ApiPropertyOptional({
    description: 'Hours per week available for mentorship',
    example: '3-5 hours',
  })
  @IsOptional()
  @IsString()
  hoursPerWeek?: string;

  @ApiPropertyOptional({
    description: 'Areas where mentorship is needed',
    example: ['Governance', 'Financial Management', 'HR'],
    type: [String],
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  mentorshipAreas?: string[];

  @ApiPropertyOptional({
    description: 'Preferred communication methods',
    example: ['Email', 'Video Call'],
    type: [String],
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  commMethods?: string[];

  @ApiPropertyOptional({
    description: 'Key organizational challenges being faced',
    example: 'We struggle with donor retention and financial reporting.',
  })
  @IsOptional()
  @IsString()
  orgChallenges?: string;

  @ApiPropertyOptional({
    description: 'Background on the organization and interests',
    example:
      'We are a 3-year-old health NGO focused on maternal care in rural areas.',
  })
  @IsOptional()
  @IsString()
  background?: string;

  @ApiProperty({
    description: 'Whether the NGO has accepted the mentorship terms',
    example: true,
  })
  @IsBoolean()
  acceptedTerms: boolean;
}

export class UpdateMentorRequestDto {
  @ApiPropertyOptional({ example: '5-8 hours' })
  @IsOptional()
  @IsString()
  hoursPerWeek?: string;

  @ApiPropertyOptional({ example: ['Leadership', 'M&E'], type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  mentorshipAreas?: string[];

  @ApiPropertyOptional({ example: ['WhatsApp', 'Email'], type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  commMethods?: string[];

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  orgChallenges?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  background?: string;
}

export class RespondToMentorRequestDto {
  @ApiProperty({
    enum: ['APPROVED', 'DECLINED'],
    description: 'Expert accepts or declines the request',
    example: 'APPROVED',
  })
  @IsEnum(['APPROVED', 'DECLINED'])
  action: 'APPROVED' | 'DECLINED';

  @ApiPropertyOptional({
    description: 'Optional message to the NGO (shown on decline)',
    example: 'I am currently at full capacity. Please try again in 3 months.',
  })
  @IsOptional()
  @IsString()
  message?: string;
}

export class AdminUpdateMentorRequestDto {
  @ApiProperty({ enum: MentorRequestStatus })
  @IsEnum(MentorRequestStatus)
  status: MentorRequestStatus;
}

export class ListMentorRequestsQueryDto {
  @ApiPropertyOptional({ enum: MentorRequestStatus })
  @IsOptional()
  @IsEnum(MentorRequestStatus)
  status?: MentorRequestStatus;

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

export class MentorSummaryDto {
  @ApiProperty() id: string;
  @ApiProperty() fullName: string;
  @ApiProperty() email: string;
  @ApiPropertyOptional() avatarUrl?: string;
  @ApiPropertyOptional() title?: string;
  @ApiPropertyOptional() employer?: string;
  @ApiPropertyOptional({ type: [String] }) areasOfExpertise?: string[];
}

export class NgoSummaryDto {
  @ApiProperty() id: string;
  @ApiProperty() fullName: string;
  @ApiProperty() email: string;
  @ApiPropertyOptional() orgName?: string;
  @ApiPropertyOptional() orgState?: string;
}

export class MentorRequestResponseDto {
  @ApiProperty() id: string;
  @ApiProperty({ enum: MentorRequestStatus }) status: MentorRequestStatus;
  @ApiPropertyOptional() hoursPerWeek?: string;
  @ApiProperty({ type: [String] }) mentorshipAreas: string[];
  @ApiProperty({ type: [String] }) commMethods: string[];
  @ApiPropertyOptional() orgChallenges?: string;
  @ApiPropertyOptional() background?: string;
  @ApiProperty() acceptedTerms: boolean;
  @ApiProperty() createdAt: Date;
  @ApiProperty() updatedAt: Date;
  @ApiProperty({ type: MentorSummaryDto }) mentor: MentorSummaryDto;
  @ApiProperty({ type: NgoSummaryDto }) ngoUser: NgoSummaryDto;
}

export class MentorRequestListResponseDto {
  @ApiProperty() status: boolean;
  @ApiProperty() statusCode: number;
  @ApiProperty({ type: [MentorRequestResponseDto] })
  data: MentorRequestResponseDto[];
  @ApiProperty() total: number;
  @ApiProperty() page: number;
  @ApiProperty() limit: number;
  @ApiProperty() totalPages: number;
}

export class MentorRequestSingleResponseDto {
  @ApiProperty() status: boolean;
  @ApiProperty() statusCode: number;
  @ApiProperty({ type: MentorRequestResponseDto })
  data: MentorRequestResponseDto;
}

export class MentorRequestActionResponseDto {
  @ApiProperty() status: boolean;
  @ApiProperty() statusCode: number;
  @ApiProperty() message: string;
  @ApiPropertyOptional({ type: MentorRequestResponseDto })
  data?: MentorRequestResponseDto;
}
