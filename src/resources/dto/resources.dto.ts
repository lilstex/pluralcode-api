import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsEnum,
  IsArray,
  IsUUID,
  IsInt,
  Min,
} from 'class-validator';
import { Type } from 'class-transformer';

export enum ResourceType {
  DOCUMENT = 'DOCUMENT',
  VIDEO = 'VIDEO',
  ARTICLE = 'ARTICLE',
}

// ─────────────────────────────────────────────
// TAXONOMY DTOs
// ─────────────────────────────────────────────

export class CreateCategoryDto {
  @ApiProperty({ example: 'Governance' })
  @IsNotEmpty()
  @IsString()
  name: string;

  @ApiPropertyOptional({ example: 'uuid-of-parent-category' })
  @IsOptional()
  @IsUUID()
  parentId?: string;
}

export class UpdateCategoryDto {
  @ApiPropertyOptional() @IsOptional() @IsString() name?: string;
  @ApiPropertyOptional() @IsOptional() @IsUUID() parentId?: string;
}

export class CreateTagDto {
  @ApiProperty({ example: 'INGO' })
  @IsNotEmpty()
  @IsString()
  name: string;
}

// ─────────────────────────────────────────────
// BADGE DTOs
// ─────────────────────────────────────────────

export class CreateBadgeDto {
  @ApiProperty({ example: 'Resource Champion' })
  @IsNotEmpty()
  @IsString()
  name: string;
  // imageUrl is derived from the uploaded file — not sent in body
}

// ─────────────────────────────────────────────
// RESOURCE DTOs
// ─────────────────────────────────────────────

export class CreateResourceDto {
  @ApiProperty({ example: 'NGO Governance Handbook 2024' })
  @IsNotEmpty()
  @IsString()
  title: string;

  @ApiProperty({
    example: 'A comprehensive guide to NGO governance in Nigeria.',
  })
  @IsNotEmpty()
  @IsString()
  description: string;

  @ApiProperty({ enum: ResourceType, example: 'DOCUMENT' })
  @IsEnum(ResourceType)
  type: ResourceType;

  @ApiProperty({ example: 'uuid-of-category' })
  @IsNotEmpty()
  @IsUUID()
  categoryId: string;

  @ApiPropertyOptional({ example: 'NRC Nigeria' })
  @IsOptional()
  @IsString()
  author?: string;

  @ApiPropertyOptional({ type: [String], description: 'Array of Tag UUIDs' })
  @IsOptional()
  @IsArray()
  @IsUUID('4', { each: true })
  tagIds?: string[];

  @ApiPropertyOptional({ example: 'https://youtube.com/watch?v=abc' })
  @IsOptional()
  @IsString()
  externalUrl?: string;

  @ApiPropertyOptional({ example: 'en' })
  @IsOptional()
  @IsString()
  language?: string;

  @ApiPropertyOptional({ example: 'Lagos' })
  @IsOptional()
  @IsString()
  region?: string;

  @ApiPropertyOptional({ example: 'Health' })
  @IsOptional()
  @IsString()
  sector?: string;

  @ApiPropertyOptional({ description: 'Body text for ARTICLE type' })
  @IsOptional()
  @IsString()
  articleBody?: string;

  @ApiPropertyOptional({
    example: 'uuid-of-badge',
    description: 'Badge awarded on download',
  })
  @IsOptional()
  @IsUUID()
  badgeId?: string;

  @ApiPropertyOptional({
    example: 10,
    description: 'Points awarded to user on download',
  })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Type(() => Number)
  points?: number;
}

export class UpdateResourceDto {
  @ApiPropertyOptional() @IsOptional() @IsString() title?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() description?: string;
  @ApiPropertyOptional() @IsOptional() @IsUUID() categoryId?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() author?: string;
  @ApiPropertyOptional()
  @IsOptional()
  @IsArray()
  @IsUUID('4', { each: true })
  tagIds?: string[];
  @ApiPropertyOptional() @IsOptional() @IsString() language?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() region?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() sector?: string;
  @ApiPropertyOptional() @IsOptional() @IsUUID() badgeId?: string;
  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(0)
  @Type(() => Number)
  points?: number;
}

export class ResourceQueryDto {
  @ApiPropertyOptional({
    description:
      'Full-text search across title, description, author, PDF contents',
  })
  @IsOptional()
  @IsString()
  search?: string;

  @ApiPropertyOptional() @IsOptional() @IsUUID() categoryId?: string;

  @ApiPropertyOptional({
    enum: ResourceType,
    description: 'Filter by format: DOCUMENT, VIDEO, AUDIO, ARTICLE',
  })
  @IsOptional()
  @IsEnum(ResourceType)
  type?: ResourceType;

  @ApiPropertyOptional({ description: 'Filter by tag UUID' })
  @IsOptional()
  @IsUUID()
  tagId?: string;

  @ApiPropertyOptional() @IsOptional() @IsString() sector?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() region?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() language?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() dateFrom?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() dateTo?: string;
  @ApiPropertyOptional() @IsOptional() page?: number;
  @ApiPropertyOptional() @IsOptional() limit?: number;
}

// ─────────────────────────────────────────────
// RESPONSE DTOs
// ─────────────────────────────────────────────

export class TagResponseDto {
  @ApiProperty() id: string;
  @ApiProperty() name: string;
}

export class CategoryResponseDto {
  @ApiProperty() id: string;
  @ApiProperty() name: string;
  @ApiPropertyOptional() parentId?: string;
  @ApiPropertyOptional({ type: [CategoryResponseDto] })
  children?: CategoryResponseDto[];
}

export class BadgeResponseDto {
  @ApiProperty() id: string;
  @ApiProperty() name: string;
  @ApiProperty() imageUrl: string;
  @ApiProperty() createdAt: Date;
}

export class ResourceResponseDto {
  @ApiProperty() id: string;
  @ApiProperty() title: string;
  @ApiProperty() description: string;
  @ApiProperty({ enum: ResourceType }) type: ResourceType;
  @ApiPropertyOptional() contentUrl?: string;
  @ApiPropertyOptional() author?: string;
  @ApiPropertyOptional() language?: string;
  @ApiPropertyOptional() region?: string;
  @ApiPropertyOptional() sector?: string;
  @ApiPropertyOptional() fileSize?: number;
  @ApiProperty() points: number;
  @ApiProperty() downloadCount: number;
  @ApiPropertyOptional({ type: BadgeResponseDto }) badge?: BadgeResponseDto;
  @ApiProperty({ type: CategoryResponseDto }) category: CategoryResponseDto;
  @ApiProperty({ type: [TagResponseDto] }) tags: TagResponseDto[];
  @ApiProperty() createdAt: Date;
}

export class DownloadResponseDto {
  @ApiProperty() status: boolean;
  @ApiProperty() statusCode: number;
  @ApiProperty() message: string;
  @ApiPropertyOptional() downloadUrl?: string;
  @ApiPropertyOptional() pointsEarned?: number;
  @ApiPropertyOptional() totalPoints?: number;
  @ApiPropertyOptional({ type: [String] }) newBadges?: string[];
}
