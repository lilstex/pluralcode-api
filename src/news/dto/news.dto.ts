import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsArray,
  IsIn,
  IsDateString,
} from 'class-validator';

// ─────────────────────────────────────────────────────────────────────────────
// WELL-KNOWN TYPES (open-ended — schema stores as String)
// ─────────────────────────────────────────────────────────────────────────────

export const KNOWN_NEWS_TYPES = [
  'NEWS',
  'BLOG',
  'REPORT',
  'WORKSHOP',
  'ANNOUNCEMENT',
  'PRESS_RELEASE',
] as const;

export type NewsPostType = (typeof KNOWN_NEWS_TYPES)[number] | string;

// ─────────────────────────────────────────────────────────────────────────────
// CREATE
// ─────────────────────────────────────────────────────────────────────────────

export class CreateNewsPostDto {
  @ApiProperty({ example: 'NGO Governance Summit 2025' })
  @IsNotEmpty()
  @IsString()
  title: string;

  @ApiProperty({
    example: 'NEWS',
    description: `Post type. Well-known values: ${KNOWN_NEWS_TYPES.join(', ')}. Custom strings are also accepted.`,
  })
  @IsNotEmpty()
  @IsString()
  type: string;

  @ApiProperty({ example: '<p>Full article body here...</p>' })
  @IsNotEmpty()
  @IsString()
  body: string;

  @ApiPropertyOptional({ example: 'A brief preview of the post.' })
  @IsOptional()
  @IsString()
  excerpt?: string;

  @ApiPropertyOptional({
    example: ['governance', 'ngo', 'summit'],
    type: [String],
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  tags?: string[];
}

// ─────────────────────────────────────────────────────────────────────────────
// UPDATE
// ─────────────────────────────────────────────────────────────────────────────

export class UpdateNewsPostDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  title?: string;

  @ApiPropertyOptional({
    description: `Post type. Well-known values: ${KNOWN_NEWS_TYPES.join(', ')}. Custom strings also accepted.`,
  })
  @IsOptional()
  @IsString()
  type?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  body?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  excerpt?: string;

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  tags?: string[];
}

// ─────────────────────────────────────────────────────────────────────────────
// QUERY
// ─────────────────────────────────────────────────────────────────────────────

export class NewsQueryDto {
  @ApiPropertyOptional({
    description: 'Filter by post type (e.g. NEWS, BLOG, REPORT)',
  })
  @IsOptional()
  @IsString()
  type?: string;

  @ApiPropertyOptional({
    description: 'Full-text search across title, excerpt, and body',
  })
  @IsOptional()
  @IsString()
  search?: string;

  @ApiPropertyOptional({
    description: 'Comma-separated tags to filter by (OR match)',
  })
  @IsOptional()
  @IsString()
  tags?: string;

  @ApiPropertyOptional({ example: '2024-01-01' })
  @IsOptional()
  @IsDateString()
  dateFrom?: string;

  @ApiPropertyOptional({ example: '2024-12-31' })
  @IsOptional()
  @IsDateString()
  dateTo?: string;

  @ApiPropertyOptional({ enum: ['latest', 'popular'], default: 'latest' })
  @IsOptional()
  @IsIn(['latest', 'popular'])
  orderBy?: 'latest' | 'popular';

  @ApiPropertyOptional({ example: 1 })
  @IsOptional()
  page?: number;

  @ApiPropertyOptional({ example: 20 })
  @IsOptional()
  limit?: number;
}

export class AdminNewsQueryDto extends NewsQueryDto {
  @ApiPropertyOptional({ enum: ['DRAFT', 'PUBLISHED', 'ARCHIVED'] })
  @IsOptional()
  @IsIn(['DRAFT', 'PUBLISHED', 'ARCHIVED'])
  status?: 'DRAFT' | 'PUBLISHED' | 'ARCHIVED';
}

// ─────────────────────────────────────────────────────────────────────────────
// RESPONSE
// ─────────────────────────────────────────────────────────────────────────────

export class NewsAuthorDto {
  @ApiProperty() id: string;
  @ApiProperty() fullName: string;
  @ApiPropertyOptional() avatarUrl?: string;
}

export class NewsAttachmentDto {
  @ApiProperty() name: string;
  @ApiProperty() url: string;
  @ApiProperty() size: number;
}

export class NewsPostResponseDto {
  @ApiProperty() id: string;
  @ApiProperty() title: string;
  @ApiProperty() slug: string;
  @ApiProperty() type: string;
  @ApiProperty() body: string;
  @ApiPropertyOptional() excerpt?: string;
  @ApiPropertyOptional() thumbnailUrl?: string;
  @ApiProperty({ type: [NewsAttachmentDto] }) attachments: NewsAttachmentDto[];
  @ApiProperty() status: string;
  @ApiPropertyOptional() publishedAt?: Date;
  @ApiProperty({ type: [String] }) tags: string[];
  @ApiProperty() viewCount: number;
  @ApiProperty({ type: NewsAuthorDto }) author: NewsAuthorDto;
  @ApiProperty() createdAt: Date;
  @ApiProperty() updatedAt: Date;
}
