import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsEmail,
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';
import { Type } from 'class-transformer';
import { IsNumber, Min } from 'class-validator';

export enum ContactMessageStatus {
  UNREAD = 'UNREAD',
  READ = 'READ',
  REPLIED = 'REPLIED',
  ARCHIVED = 'ARCHIVED',
}

// ── Public submission ──────────────────────────────────────────────────────────

export class CreateContactMessageDto {
  @ApiProperty({ example: 'Amaka Obi' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  name: string;

  @ApiProperty({ example: 'amaka@example.org' })
  @IsEmail()
  @IsNotEmpty()
  email: string;

  @ApiPropertyOptional({ example: '+2348012345678' })
  @IsOptional()
  @IsString()
  @MaxLength(30)
  phone?: string;

  @ApiProperty({ example: 'Partnership Inquiry' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  subject: string;

  @ApiProperty({
    example: 'We would like to explore a partnership opportunity...',
  })
  @IsString()
  @IsNotEmpty()
  @MinLength(10)
  @MaxLength(3000)
  message: string;
}

// ── Admin: update status ───────────────────────────────────────────────────────

export class UpdateContactStatusDto {
  @ApiProperty({ enum: ContactMessageStatus })
  @IsEnum(ContactMessageStatus)
  status: ContactMessageStatus;
}

// ── Admin: list query ──────────────────────────────────────────────────────────

export class ListContactMessagesDto {
  @ApiPropertyOptional({ enum: ContactMessageStatus })
  @IsOptional()
  @IsEnum(ContactMessageStatus)
  status?: ContactMessageStatus;

  @ApiPropertyOptional({ description: 'Search by name, email or subject' })
  @IsOptional()
  @IsString()
  search?: string;

  @ApiPropertyOptional({ default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  page?: number = 1;

  @ApiPropertyOptional({ default: 20 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  limit?: number = 20;
}

// ── Response ───────────────────────────────────────────────────────────────────

export class ContactMessageResponseDto {
  @ApiProperty() id: string;
  @ApiProperty() name: string;
  @ApiProperty() email: string;
  @ApiProperty() phone: string | null;
  @ApiProperty() subject: string;
  @ApiProperty() message: string;
  @ApiProperty({ enum: ContactMessageStatus }) status: ContactMessageStatus;
  @ApiProperty() createdAt: Date;
  @ApiProperty() updatedAt: Date;
}
