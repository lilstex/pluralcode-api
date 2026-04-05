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
  HttpCode,
  HttpStatus,
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
  CreateBadgeDto,
  ResourceResponseDto,
  DownloadResponseDto,
} from '../dto/resources.dto';
import { ResourceService } from '../service/resources.service';

import { JwtAuthGuard } from 'src/common/guards/jwt-auth.guard';
import { OptionalJwtGuard } from 'src/common/guards/optional-jwt.guard';
import { RolesGuard } from 'src/common/guards/roles.guard';
import { PermissionsGuard } from 'src/common/guards/permissions.guard';
import { Roles } from 'src/common/decorators/roles.decorator';
import { Permissions } from 'src/common/decorators/permissions.decorator';
import { CurrentUser } from 'src/common/decorators/current-user.decorator';
import { PERMISSIONS } from 'src/common/constants/permissions';

const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50 MB for video/docs
const IMAGE_FILE_PIPE = new ParseFilePipe({
  validators: [
    new MaxFileSizeValidator({ maxSize: 2 * 1024 * 1024 }),
    new FileTypeValidator({ fileType: /^image\/(jpeg|png|webp|svg\+xml)$/ }),
  ],
});

@ApiTags('Resource Library')
@Controller('resources')
export class ResourceController {
  constructor(private readonly resourceService: ResourceService) {}

  // ─────────────────────────────────────────────────────────────────────────────
  // TAXONOMY — CATEGORIES
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

  @UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard)
  @Roles(Role.SUPER_ADMIN, Role.RESOURCE_ADMIN)
  @Permissions(PERMISSIONS.TAXONOMY_MANAGE)
  @ApiBearerAuth()
  @Post('categories/:id/image')
  @UseInterceptors(FileInterceptor('file'))
  @ApiOperation({
    summary:
      'Admin: Upload or replace a category image (max 2MB, JPEG/PNG/WebP/SVG)',
  })
  @ApiParam({ name: 'id', description: 'Category UUID' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: { file: { type: 'string', format: 'binary' } },
    },
  })
  async uploadCategoryImage(
    @CurrentUser() admin: any,
    @Param('id', ParseUUIDPipe) id: string,
    @UploadedFile(IMAGE_FILE_PIPE) file: Express.Multer.File,
  ) {
    return this.resourceService.uploadCategoryImage(admin.id, id, file);
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // TAXONOMY — TAGS
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
  // BADGE LIBRARY
  // ─────────────────────────────────────────────────────────────────────────────

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.SUPER_ADMIN)
  @ApiBearerAuth()
  @Post('badges')
  @UseInterceptors(FileInterceptor('file'))
  @ApiOperation({
    summary: 'Super Admin: Create a new badge (upload badge image)',
  })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        file: {
          type: 'string',
          format: 'binary',
          description: 'Badge image (PNG, JPEG, SVG, WebP — max 2MB)',
        },
        name: { type: 'string', example: 'Resource Champion' },
      },
    },
  })
  async createBadge(
    @CurrentUser() admin: any,
    @Body() dto: CreateBadgeDto,
    @UploadedFile(
      new ParseFilePipe({
        validators: [new MaxFileSizeValidator({ maxSize: 2 * 1024 * 1024 })],
      }),
    )
    file: Express.Multer.File,
  ) {
    return this.resourceService.createBadge(admin.id, dto, file);
  }

  @Get('badges')
  @ApiOperation({ summary: 'List all available badges (public)' })
  async listBadges() {
    return this.resourceService.listBadges();
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.SUPER_ADMIN)
  @ApiBearerAuth()
  @Delete('badges/:id')
  @ApiOperation({ summary: 'Super Admin: Delete a badge' })
  @ApiParam({ name: 'id', description: 'Badge UUID' })
  async deleteBadge(
    @CurrentUser() admin: any,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.resourceService.deleteBadge(admin.id, id);
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // BULK ACTIONS (before /:id routes to avoid conflict)
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
      properties: { ids: { type: 'array', items: { type: 'string' } } },
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
    description: `Supported content types (set via the "type" field):
  - DOCUMENT: upload PDF/Word file → OCR text extraction runs automatically
  - VIDEO: upload MP4 file OR provide externalUrl (YouTube/Vimeo)
  - ARTICLE: provide articleBody text OR provide externalUrl (website)
  - MULTILINK: no file needed — provide a "links" array of { title, url } objects`,
  })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        file: {
          type: 'string',
          format: 'binary',
          description: 'Required for DOCUMENT and VIDEO file uploads',
        },
        title: { type: 'string' },
        description: { type: 'string' },
        type: {
          type: 'string',
          enum: ['DOCUMENT', 'VIDEO', 'ARTICLE', 'MULTILINK'],
        },
        categoryId: { type: 'string' },
        author: { type: 'string' },
        tagIds: { type: 'array', items: { type: 'string' } },
        externalUrl: {
          type: 'string',
          description: 'YouTube/Vimeo URL (VIDEO) or website URL (ARTICLE)',
        },
        language: { type: 'string', example: 'en' },
        region: { type: 'string' },
        sector: { type: 'string' },
        articleBody: {
          type: 'string',
          description: 'Body text for ARTICLE type',
        },
        links: {
          type: 'array',
          description: 'Required for MULTILINK type',
          items: {
            type: 'object',
            properties: {
              title: { type: 'string' },
              url: { type: 'string' },
              order: { type: 'number' },
            },
          },
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
        validators: [new MaxFileSizeValidator({ maxSize: MAX_FILE_SIZE })],
      }),
    )
    file?: Express.Multer.File,
  ) {
    return this.resourceService.createResource(admin.id, dto, file);
  }

  @UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard)
  @Roles(Role.SUPER_ADMIN, Role.RESOURCE_ADMIN)
  @Permissions(PERMISSIONS.RESOURCE_UPLOAD)
  @ApiBearerAuth()
  @Post(':id/image')
  @UseInterceptors(FileInterceptor('file'))
  @ApiOperation({
    summary:
      'Admin: Upload or replace resource cover image (max 2MB, JPEG/PNG/WebP/SVG)',
  })
  @ApiParam({ name: 'id', description: 'Resource UUID' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: { file: { type: 'string', format: 'binary' } },
    },
  })
  async uploadResourceImage(
    @CurrentUser() admin: any,
    @Param('id', ParseUUIDPipe) id: string,
    @UploadedFile(IMAGE_FILE_PIPE) file: Express.Multer.File,
  ) {
    return this.resourceService.uploadResourceImage(admin.id, id, file);
  }

  @UseGuards(OptionalJwtGuard)
  @ApiBearerAuth()
  @Get()
  @ApiOperation({
    summary: 'Search and list resources (public)',
    description:
      'Unauthenticated users see titles/descriptions but not download URLs or contentUrl.',
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
    enum: ['DOCUMENT', 'VIDEO', 'ARTICLE', 'MULTILINK'],
  })
  @ApiQuery({ name: 'tagId', required: false })
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
    const user = (req as any).user;
    return this.resourceService.listResources(query, !!user, user?.id);
  }

  @UseGuards(OptionalJwtGuard)
  @ApiBearerAuth()
  @Get(':id')
  @ApiOperation({ summary: 'Get a single resource by ID (public)' })
  @ApiParam({ name: 'id', description: 'Resource UUID' })
  @ApiResponse({ status: 200, type: ResourceResponseDto })
  async getResource(
    @Param('id', ParseUUIDPipe) id: string,
    @Req() req: Request,
  ) {
    const user = (req as any).user;
    return this.resourceService.getResource(id, !!user, user?.id);
  }

  @UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard)
  @Roles(Role.SUPER_ADMIN, Role.RESOURCE_ADMIN)
  @Permissions(PERMISSIONS.RESOURCE_UPLOAD)
  @ApiBearerAuth()
  @Patch(':id')
  @UseInterceptors(FileInterceptor('file'))
  @ApiOperation({
    summary: 'Admin: Update resource metadata and/or content',
    description:
      'For MULTILINK: send a "links" array to replace all existing links.',
  })
  @ApiParam({ name: 'id', description: 'Resource UUID' })
  @ApiConsumes('multipart/form-data', 'application/json')
  async updateResource(
    @CurrentUser() admin: any,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateResourceDto,
    @UploadedFile() file?: Express.Multer.File,
  ) {
    return this.resourceService.updateResource(admin.id, id, dto, file);
  }

  @UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard)
  @Roles(Role.SUPER_ADMIN, Role.RESOURCE_ADMIN)
  @Permissions(PERMISSIONS.RESOURCE_DELETE)
  @ApiBearerAuth()
  @Delete(':id')
  @ApiOperation({
    summary: 'Admin: Delete a resource and its Azure Blob files',
  })
  @ApiParam({ name: 'id', description: 'Resource UUID' })
  async deleteResource(
    @CurrentUser() admin: any,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.resourceService.deleteResource(admin.id, id);
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // DOWNLOAD / VIEW / COMPLETE (authenticated users only)
  // ─────────────────────────────────────────────────────────────────────────────

  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @Post(':id/download')
  @ApiOperation({
    summary: 'Record a download and return the file URL',
    description:
      'Logs the download and returns the Azure Blob URL. Does NOT award points — use POST :id/complete for that.',
  })
  @ApiParam({ name: 'id', description: 'Resource UUID' })
  @ApiResponse({ status: 200, type: DownloadResponseDto })
  async downloadResource(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: any,
  ) {
    return this.resourceService.downloadResource(id, user.id);
  }

  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @Post(':id/view')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Mark a resource as viewed (unlocks the Complete button)',
    description: 'Idempotent — safe to call multiple times.',
  })
  @ApiParam({ name: 'id', description: 'Resource UUID' })
  async viewResource(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: any,
  ) {
    return this.resourceService.viewResource(id, user.id);
  }

  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @Post(':id/complete')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Mark a resource as completed — awards points and badge',
    description:
      'Requires prior call to POST :id/view. Points and badge awarded once only.',
  })
  @ApiParam({ name: 'id', description: 'Resource UUID' })
  async completeResource(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: any,
  ) {
    return this.resourceService.completeResource(id, user.id);
  }
}
