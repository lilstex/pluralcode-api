import {
  Controller,
  Post,
  Get,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
  UseInterceptors,
  UploadedFile,
  ParseFilePipe,
  MaxFileSizeValidator,
  FileTypeValidator,
  ParseUUIDPipe,
  Req,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiBody,
  ApiParam,
  ApiQuery,
  ApiConsumes,
} from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { Request } from 'express';

import {
  CreateResourceDto,
  UpdateResourceDto,
  ResourceQueryDto,
  CreateCategoryDto,
  UpdateCategoryDto,
  CreateTagDto,
  ResourceResponseDto,
  DownloadResponseDto,
  CreateBadgeDto,
} from '../dto/resources.dto';
import { ResourceService } from '../service/resources.service';

import { JwtAuthGuard } from 'src/common/guards/jwt-auth.guard';
import { RolesGuard } from 'src/common/guards/roles.guard';
import { PermissionsGuard } from 'src/common/guards/permissions.guard';
import { Roles } from 'src/common/decorators/roles.decorator';
import { Permissions } from 'src/common/decorators/permissions.decorator';
import { CurrentUser } from 'src/common/decorators/current-user.decorator';
import { PERMISSIONS } from 'src/common/constants/permissions';

// 50MB max for video uploads, 10MB for documents
const MAX_FILE_SIZE = 50 * 1024 * 1024;
const ALLOWED_MIMETYPES =
  /^(application\/pdf|application\/msword|application\/vnd\.openxmlformats-officedocument\.wordprocessingml\.document|video\/mp4|audio\/mpeg|audio\/wav|text\/plain)$/;

@ApiTags('Resource Library')
@Controller('resources')
export class ResourceController {
  constructor(private readonly resourceService: ResourceService) {}

  // ─────────────────────────────────────────────────────────────────────────────
  // TAXONOMY — CATEGORIES (Admin only)
  // ─────────────────────────────────────────────────────────────────────────────

  @UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard)
  @Roles(Role.SUPER_ADMIN, Role.RESOURCE_ADMIN)
  @Permissions(PERMISSIONS.TAXONOMY_MANAGE)
  @ApiBearerAuth()
  @Post('categories')
  @ApiOperation({ summary: 'Admin: Create a new category or sub-category' })
  async createCategory(
    @CurrentUser() admin: any,
    @Body() dto: CreateCategoryDto,
  ) {
    return this.resourceService.createCategory(admin.id, dto);
  }

  @Get('categories')
  @ApiOperation({ summary: 'List all categories as a nested tree (public)' })
  async listCategories() {
    return this.resourceService.listCategories();
  }

  @UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard)
  @Roles(Role.SUPER_ADMIN, Role.RESOURCE_ADMIN)
  @Permissions(PERMISSIONS.TAXONOMY_MANAGE)
  @ApiBearerAuth()
  @Patch('categories/:id')
  @ApiOperation({ summary: 'Admin: Update a category' })
  @ApiParam({ name: 'id', description: 'Category UUID' })
  async updateCategory(
    @CurrentUser() admin: any,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateCategoryDto,
  ) {
    return this.resourceService.updateCategory(admin.id, id, dto);
  }

  @UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard)
  @Roles(Role.SUPER_ADMIN, Role.RESOURCE_ADMIN)
  @Permissions(PERMISSIONS.TAXONOMY_MANAGE)
  @ApiBearerAuth()
  @Delete('categories/:id')
  @ApiOperation({ summary: 'Admin: Delete a category (only if empty)' })
  @ApiParam({ name: 'id', description: 'Category UUID' })
  async deleteCategory(
    @CurrentUser() admin: any,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.resourceService.deleteCategory(admin.id, id);
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // TAXONOMY — TAGS (Admin only)
  // ─────────────────────────────────────────────────────────────────────────────

  @UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard)
  @Roles(Role.SUPER_ADMIN, Role.RESOURCE_ADMIN)
  @Permissions(PERMISSIONS.TAXONOMY_MANAGE)
  @ApiBearerAuth()
  @Post('tags')
  @ApiOperation({ summary: 'Admin: Create a new tag' })
  async createTag(@CurrentUser() admin: any, @Body() dto: CreateTagDto) {
    return this.resourceService.createTag(admin.id, dto);
  }

  @Get('tags')
  @ApiOperation({ summary: 'List all tags (public)' })
  async listTags() {
    return this.resourceService.listTags();
  }

  @UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard)
  @Roles(Role.SUPER_ADMIN, Role.RESOURCE_ADMIN)
  @Permissions(PERMISSIONS.TAXONOMY_MANAGE)
  @ApiBearerAuth()
  @Delete('tags/:id')
  @ApiOperation({ summary: 'Admin: Delete a tag' })
  @ApiParam({ name: 'id', description: 'Tag UUID' })
  async deleteTag(
    @CurrentUser() admin: any,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.resourceService.deleteTag(admin.id, id);
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // BADGES
  // ─────────────────────────────────────────────────────────────────────────────

  @UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard)
  @Roles(Role.SUPER_ADMIN)
  @Permissions(PERMISSIONS.BADGE_MANAGE)
  @ApiBearerAuth()
  @Post('badges')
  @ApiOperation({ summary: 'Admin: Create a new badge' })
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(FileInterceptor('file'))
  async createBadge(
    @CurrentUser() admin: any,
    @Body() dto: CreateBadgeDto,
    @UploadedFile() file: Express.Multer.File,
  ) {
    return this.resourceService.createBadge(admin.id, dto, file);
  }

  @Get('badges')
  @ApiOperation({ summary: 'List all badges (public)' })
  async listBadges() {
    return this.resourceService.listBadges();
  }

  @UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard)
  @Roles(Role.SUPER_ADMIN)
  @Permissions(PERMISSIONS.BADGE_MANAGE)
  @ApiBearerAuth()
  @Delete('badges/:id')
  @ApiOperation({ summary: 'Admin: Delete a badge' })
  @ApiParam({ name: 'id', description: 'Badge UUID' })
  async deleteBadge(
    @CurrentUser() admin: any,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.resourceService.deleteBadge(admin.id, id);
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // RESOURCES — BULK ACTIONS (Admin only, before /:id routes to avoid conflict)
  // ─────────────────────────────────────────────────────────────────────────────

  @UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard)
  @Roles(Role.SUPER_ADMIN, Role.RESOURCE_ADMIN)
  @Permissions(PERMISSIONS.RESOURCE_DELETE)
  @ApiBearerAuth()
  @Delete('bulk')
  @ApiOperation({ summary: 'Admin: Bulk delete resources' })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        ids: {
          type: 'array',
          items: { type: 'string' },
          example: ['uuid-1', 'uuid-2'],
        },
      },
    },
  })
  async bulkDelete(@CurrentUser() admin: any, @Body('ids') ids: string[]) {
    return this.resourceService.bulkDelete(admin.id, ids);
  }

  @UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard)
  @Roles(Role.SUPER_ADMIN, Role.RESOURCE_ADMIN)
  @Permissions(PERMISSIONS.RESOURCE_UPLOAD)
  @ApiBearerAuth()
  @Patch('bulk/move-category')
  @ApiOperation({
    summary: 'Admin: Move multiple resources to a different category',
  })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        ids: { type: 'array', items: { type: 'string' } },
        targetCategoryId: { type: 'string' },
      },
    },
  })
  async bulkMoveCategory(
    @CurrentUser() admin: any,
    @Body('ids') ids: string[],
    @Body('targetCategoryId') targetCategoryId: string,
  ) {
    return this.resourceService.bulkMoveCategory(
      admin.id,
      ids,
      targetCategoryId,
    );
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // RESOURCES — CRUD
  // ─────────────────────────────────────────────────────────────────────────────

  @UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard)
  @Roles(Role.SUPER_ADMIN, Role.RESOURCE_ADMIN)
  @Permissions(PERMISSIONS.RESOURCE_UPLOAD)
  @ApiBearerAuth()
  @Post()
  @UseInterceptors(FileInterceptor('file'))
  @ApiOperation({
    summary: 'Admin: Upload a new resource',
    description: `
      Supports four content types (set via the "type" field):
      - DOCUMENT: upload PDF/Word file → OCR text extraction runs automatically
      - VIDEO: upload MP4 file OR provide externalUrl (YouTube/Vimeo)
      - AUDIO: upload MP3/WAV file
      - ARTICLE: provide articleBody text — no file needed
    `,
  })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        file: {
          type: 'string',
          format: 'binary',
          description: 'Required for DOCUMENT, VIDEO (MP4), AUDIO types',
        },
        title: { type: 'string' },
        description: { type: 'string' },
        type: {
          type: 'string',
          enum: ['DOCUMENT', 'VIDEO', 'AUDIO', 'ARTICLE'],
        },
        categoryId: { type: 'string' },
        author: { type: 'string' },
        tagIds: { type: 'array', items: { type: 'string' } },
        externalUrl: {
          type: 'string',
          description: 'YouTube/Vimeo URL for VIDEO type',
        },
        language: { type: 'string', example: 'en' },
        region: { type: 'string' },
        sector: { type: 'string' },
        articleBody: {
          type: 'string',
          description: 'Body text for ARTICLE type',
        },
      },
    },
  })
  async createResource(
    @CurrentUser() admin: any,
    @Body() dto: CreateResourceDto,
    @UploadedFile(
      new ParseFilePipe({
        fileIsRequired: false,
        validators: [
          new MaxFileSizeValidator({ maxSize: MAX_FILE_SIZE }),
          new FileTypeValidator({ fileType: ALLOWED_MIMETYPES }),
        ],
      }),
    )
    file?: Express.Multer.File,
  ) {
    return this.resourceService.createResource(admin.id, dto, file);
  }

  @Get()
  @ApiOperation({
    summary:
      'Search and list resources with full-text search and faceted filters',
    description:
      'Public endpoint. Unauthenticated users see titles/descriptions but not download URLs.',
  })
  @ApiQuery({
    name: 'search',
    required: false,
    description: 'Full-text search (title, description, PDF contents)',
  })
  @ApiQuery({ name: 'categoryId', required: false })
  @ApiQuery({
    name: 'type',
    required: false,
    enum: ['DOCUMENT', 'VIDEO', 'AUDIO', 'ARTICLE'],
  })
  @ApiQuery({ name: 'sector', required: false })
  @ApiQuery({ name: 'region', required: false })
  @ApiQuery({ name: 'language', required: false })
  @ApiQuery({
    name: 'dateFrom',
    required: false,
    description: 'ISO date string e.g. 2024-01-01',
  })
  @ApiQuery({ name: 'dateTo', required: false })
  @ApiQuery({ name: 'page', required: false })
  @ApiQuery({ name: 'limit', required: false })
  async listResources(@Query() query: ResourceQueryDto, @Req() req: Request) {
    const isAuthenticated = !!(req as any).user;
    return this.resourceService.listResources(query, isAuthenticated);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a single resource by ID' })
  @ApiParam({ name: 'id', description: 'Resource UUID' })
  @ApiResponse({ status: 200, type: ResourceResponseDto })
  async getResource(
    @Param('id', ParseUUIDPipe) id: string,
    @Req() req: Request,
  ) {
    const isAuthenticated = !!(req as any).user;
    return this.resourceService.getResource(id, isAuthenticated);
  }

  @UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard)
  @Roles(Role.SUPER_ADMIN, Role.RESOURCE_ADMIN)
  @Permissions(PERMISSIONS.RESOURCE_UPLOAD)
  @ApiBearerAuth()
  @Patch(':id')
  @ApiOperation({ summary: 'Admin: Update resource metadata' })
  @ApiParam({ name: 'id', description: 'Resource UUID' })
  async updateResource(
    @CurrentUser() admin: any,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateResourceDto,
  ) {
    return this.resourceService.updateResource(admin.id, id, dto);
  }

  @UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard)
  @Roles(Role.SUPER_ADMIN, Role.RESOURCE_ADMIN)
  @Permissions(PERMISSIONS.RESOURCE_DELETE)
  @ApiBearerAuth()
  @Delete(':id')
  @ApiOperation({ summary: 'Admin: Delete a resource and its Azure Blob file' })
  @ApiParam({ name: 'id', description: 'Resource UUID' })
  async deleteResource(
    @CurrentUser() admin: any,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.resourceService.deleteResource(admin.id, id);
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // DOWNLOAD (authenticated users only)
  // ─────────────────────────────────────────────────────────────────────────────

  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @Post(':id/download')
  @ApiOperation({
    summary: 'Record a download and return the file URL',
    description:
      'Logs the download, evaluates badge thresholds, and returns the Azure Blob URL.',
  })
  @ApiParam({ name: 'id', description: 'Resource UUID' })
  @ApiResponse({ status: 200, type: DownloadResponseDto })
  async downloadResource(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: any,
  ) {
    return this.resourceService.downloadResource(id, user.id);
  }
}
