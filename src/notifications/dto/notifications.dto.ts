/* eslint-disable @typescript-eslint/no-unused-vars */
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsBoolean,
  IsEnum,
  IsJSON,
  IsOptional,
  IsString,
  IsUUID,
} from 'class-validator';
import { Type } from 'class-transformer';
import { NotificationType } from '@prisma/client';

// ─────────────────────────────────────────────────────────────────────────────
// CREATE  (internal use — called by other services, not exposed via HTTP)
// ─────────────────────────────────────────────────────────────────────────────

export class CreateNotificationDto {
  @ApiProperty({ description: 'UUID of the recipient user' })
  @IsUUID()
  userId: string;

  @ApiProperty({ enum: NotificationType })
  @IsEnum(NotificationType)
  type: NotificationType;

  @ApiProperty({ example: 'Event registration confirmed' })
  @IsString()
  title: string;

  @ApiProperty({
    example: 'You have successfully registered for "NGO Summit 2025".',
  })
  @IsString()
  body: string;

  @ApiPropertyOptional({
    description: 'Frontend deep-link path, e.g. /events/abc-123',
    example: '/events/abc-123',
  })
  @IsOptional()
  @IsString()
  link?: string;

  @ApiPropertyOptional({
    description:
      'Flat JSON payload for template rendering (event title, org name, etc.)',
    example: { eventTitle: 'NGO Summit 2025' },
  })
  @IsOptional()
  meta?: Record<string, any>;
}

// ─────────────────────────────────────────────────────────────────────────────
// QUERY
// ─────────────────────────────────────────────────────────────────────────────

export class NotificationQueryDto {
  @ApiPropertyOptional({ description: 'Filter by read status', example: false })
  @IsOptional()
  @IsBoolean()
  @Type(() => Boolean)
  isRead?: boolean;

  @ApiPropertyOptional({
    enum: NotificationType,
    description: 'Filter by notification type',
  })
  @IsOptional()
  @IsEnum(NotificationType)
  type?: NotificationType;

  @ApiPropertyOptional({ example: 1 })
  @IsOptional()
  @Type(() => Number)
  page?: number;

  @ApiPropertyOptional({ example: 20 })
  @IsOptional()
  @Type(() => Number)
  limit?: number;
}

// ─────────────────────────────────────────────────────────────────────────────
// MARK READ
// ─────────────────────────────────────────────────────────────────────────────

export class MarkReadDto {
  @ApiProperty({
    description: 'Array of notification UUIDs to mark as read',
    type: [String],
    example: ['uuid-1', 'uuid-2'],
  })
  @IsUUID('4', { each: true })
  ids: string[];
}
