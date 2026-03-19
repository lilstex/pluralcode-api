import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsDateString,
  IsUrl,
  IsArray,
  IsEnum,
} from 'class-validator';
import { Type } from 'class-transformer';

export enum EventStatus {
  UPCOMING = 'UPCOMING',
  LIVE = 'LIVE',
  PAST = 'PAST',
  CANCELLED = 'CANCELLED',
}

// ─────────────────────────────────────────────
// REQUEST DTOs
// ─────────────────────────────────────────────

export class CreateEventDto {
  @ApiProperty({ example: 'NGO Governance Masterclass' })
  @IsNotEmpty()
  @IsString()
  title: string;

  @ApiProperty({
    example: 'A deep dive into governance frameworks for Nigerian NGOs.',
  })
  @IsNotEmpty()
  @IsString()
  description: string;

  @ApiProperty({
    example: '2026-04-15T10:00:00.000Z',
    description: 'ISO 8601 datetime (UTC)',
  })
  @IsDateString()
  startTime: string;

  @ApiProperty({
    example: '2026-04-15T12:00:00.000Z',
    description: 'ISO 8601 datetime (UTC)',
  })
  @IsDateString()
  endTime: string;

  @ApiPropertyOptional({
    example: 150,
    description: 'Maximum number of attendees (null = unlimited)',
  })
  @IsOptional()
  @Type(() => Number)
  capacity?: number;

  @ApiPropertyOptional({
    example: ['Governance', 'NGO Management'],
    description: 'Thematic tags for discovery',
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  tags?: string[];
}

export class UpdateEventDto {
  @ApiPropertyOptional() @IsOptional() @IsString() title?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() description?: string;
  @ApiPropertyOptional() @IsOptional() @IsDateString() startTime?: string;
  @ApiPropertyOptional() @IsOptional() @IsDateString() endTime?: string;
  @ApiPropertyOptional() @IsOptional() capacity?: number;
  @ApiPropertyOptional()
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  tags?: string[];
  @ApiPropertyOptional() @IsOptional() @IsUrl() externalMeetingUrl?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() archiveUrl?: string;
}

export class EventQueryDto {
  @ApiPropertyOptional({ enum: EventStatus })
  @IsOptional()
  @IsEnum(EventStatus)
  status?: EventStatus;

  @ApiPropertyOptional({ description: 'Search by title or description' })
  @IsOptional()
  @IsString()
  search?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  tag?: string;

  @ApiPropertyOptional({ example: '2026-01-01' })
  @IsOptional()
  @IsString()
  dateFrom?: string;

  @ApiPropertyOptional({ example: '2026-12-31' })
  @IsOptional()
  @IsString()
  dateTo?: string;

  @ApiPropertyOptional({ example: 1 })
  @IsOptional()
  page?: number;

  @ApiPropertyOptional({ example: 20 })
  @IsOptional()
  limit?: number;
}

export class CancelEventDto {
  @ApiPropertyOptional({ example: 'Speaker unavailable — event rescheduled.' })
  @IsOptional()
  @IsString()
  reason?: string;
}

// ─────────────────────────────────────────────
// RESPONSE DTOs
// ─────────────────────────────────────────────

export class RegistrationSummaryDto {
  @ApiProperty() id: string;
  @ApiProperty() userId: string;
  @ApiProperty() fullName: string;
  @ApiProperty() email: string;
  @ApiPropertyOptional() avatarUrl?: string;
  @ApiProperty() registeredAt: Date;
}

export class EventResponseDto {
  @ApiProperty() id: string;
  @ApiProperty() title: string;
  @ApiProperty() description: string;
  @ApiProperty() startTime: Date;
  @ApiProperty() endTime: Date;
  @ApiPropertyOptional() coverImageUrl?: string;
  @ApiProperty() jitsiRoomId: string;
  @ApiProperty() meetingUrl: string;
  @ApiPropertyOptional() externalMeetingUrl?: string;
  @ApiPropertyOptional() archiveUrl?: string;
  @ApiProperty({ enum: EventStatus }) status: EventStatus;
  @ApiProperty() isPast: boolean;
  @ApiProperty() isCancelled: boolean;
  @ApiPropertyOptional() cancellationReason?: string;
  @ApiPropertyOptional() capacity?: number;
  @ApiProperty() registrationCount: number;
  @ApiProperty() tags: string[];
  @ApiProperty() createdAt: Date;
}

export class JitsiTokenResponseDto {
  @ApiProperty() status: boolean;
  @ApiProperty() statusCode: number;
  @ApiProperty() message: string;
  @ApiProperty() data: {
    token: string;
    roomId: string;
    meetingUrl: string;
    expiresAt: string;
  };
}
