import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsEnum,
  IsArray,
  IsUUID,
} from 'class-validator';
import { ResourceType } from '@prisma/client';

// ─────────────────────────────────────────────
// TAXONOMY DTOs
// ─────────────────────────────────────────────

export class CreateCategoryDto {
  @ApiProperty({ example: 'Governance' })
  @IsNotEmpty()
  @IsString()
  name: string;

  @ApiPropertyOptional({
    example: 'uuid-of-parent-category',
    description: 'Leave empty for top-level category',
  })
  @IsOptional()
  @IsUUID()
  parentId?: string;
}

export class UpdateCategoryDto {
  @ApiPropertyOptional({ example: 'Governance & Leadership' })
  @IsOptional()
  @IsString()
  name?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  parentId?: string;
}

export class CreateTagDto {
  @ApiProperty({ example: 'INGO' })
  @IsNotEmpty()
  @IsString()
  name: string;
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

  @ApiPropertyOptional({
    example: ['uuid-tag-1', 'uuid-tag-2'],
    description: 'Array of Tag UUIDs',
    type: [String],
  })
  @IsOptional()
  @IsArray()
  @IsUUID('4', { each: true })
  tagIds?: string[];

  @ApiPropertyOptional({
    example: 'https://youtube.com/watch?v=abc',
    description:
      'For VIDEO type: external YouTube/Vimeo URL (alternative to file upload)',
  })
  @IsOptional()
  @IsString()
  externalUrl?: string;

  @ApiPropertyOptional({
    example: 'en',
    description: 'ISO 639-1 language code',
  })
  @IsOptional()
  @IsString()
  language?: string;

  @ApiPropertyOptional({
    example: 'Lagos',
    description: 'Geographic focus of the resource',
  })
  @IsOptional()
  @IsString()
  region?: string;

  @ApiPropertyOptional({ example: 'Health' })
  @IsOptional()
  @IsString()
  sector?: string;

  @ApiPropertyOptional({
    description:
      'Direct article body (for ARTICLE type, used instead of file upload)',
  })
  @IsOptional()
  @IsString()
  articleBody?: string;
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
}

export class ResourceQueryDto {
  @ApiPropertyOptional({ description: 'Full-text search term' })
  @IsOptional()
  @IsString()
  search?: string;

  @ApiPropertyOptional({ example: 'uuid-of-category' })
  @IsOptional()
  @IsUUID()
  categoryId?: string;

  @ApiPropertyOptional({ enum: ResourceType })
  @IsOptional()
  @IsEnum(ResourceType)
  type?: ResourceType;

  @ApiPropertyOptional({ example: 'Health' })
  @IsOptional()
  @IsString()
  sector?: string;

  @ApiPropertyOptional({ example: 'Lagos' })
  @IsOptional()
  @IsString()
  region?: string;

  @ApiPropertyOptional({ example: 'en' })
  @IsOptional()
  @IsString()
  language?: string;

  @ApiPropertyOptional({
    example: '2024-01-01',
    description: 'Filter resources created after this date',
  })
  @IsOptional()
  @IsString()
  dateFrom?: string;

  @ApiPropertyOptional({
    example: '2024-12-31',
    description: 'Filter resources created before this date',
  })
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
  @ApiProperty() downloadCount: number;
  @ApiProperty({ type: CategoryResponseDto }) category: CategoryResponseDto;
  @ApiProperty({ type: [TagResponseDto] }) tags: TagResponseDto[];
  @ApiProperty() createdAt: Date;
}

export class DownloadResponseDto {
  @ApiProperty() status: boolean;
  @ApiProperty() statusCode: number;
  @ApiProperty() message: string;
  @ApiPropertyOptional() downloadUrl?: string;
  @ApiPropertyOptional({
    type: [String],
    description: 'Newly awarded badge names, if any',
  })
  newBadges?: string[];
}
