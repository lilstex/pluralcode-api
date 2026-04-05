/* eslint-disable @typescript-eslint/no-unused-vars */
import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
  UseInterceptors,
  UploadedFile,
  UploadedFiles,
  ParseFilePipe,
  MaxFileSizeValidator,
  ParseUUIDPipe,
  ParseIntPipe,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { FileInterceptor, FilesInterceptor } from '@nestjs/platform-express';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiParam,
  ApiConsumes,
  ApiBody,
} from '@nestjs/swagger';
import { Role } from '@prisma/client';

import {
  CreateNewsPostDto,
  UpdateNewsPostDto,
  NewsQueryDto,
  AdminNewsQueryDto,
  NewsPostResponseDto,
} from '../dto/news.dto';
import { NewsService } from '../service/news.service';
import { JwtAuthGuard } from 'src/common/guards/jwt-auth.guard';
import { OptionalJwtGuard } from 'src/common/guards/optional-jwt.guard';
import { RolesGuard } from 'src/common/guards/roles.guard';
import { Roles } from 'src/common/decorators/roles.decorator';
import { CurrentUser } from 'src/common/decorators/current-user.decorator';

const IMAGE_PIPE = new ParseFilePipe({
  validators: [new MaxFileSizeValidator({ maxSize: 5 * 1024 * 1024 })],
});

const ATTACHMENT_PIPE = new ParseFilePipe({
  validators: [new MaxFileSizeValidator({ maxSize: 20 * 1024 * 1024 })],
});

@ApiTags('News & Blog')
@Controller('news')
export class NewsController {
  constructor(private readonly newsService: NewsService) {}

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.SUPER_ADMIN, Role.CONTENT_ADMIN)
  @ApiBearerAuth()
  @Get('admin')
  @ApiOperation({
    summary: 'Admin: List all posts (DRAFT, PUBLISHED, ARCHIVED)',
    description:
      'Returns all posts regardless of status. Supports same filters as public list plus status filter.',
  })
  adminListPosts(@Query() query: AdminNewsQueryDto) {
    return this.newsService.adminListPosts(query);
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // PUBLIC READ
  // ─────────────────────────────────────────────────────────────────────────────

  @UseGuards(OptionalJwtGuard)
  @Get()
  @ApiOperation({
    summary: 'List published news/blog posts',
    description:
      'Public. Supports filters: type, search, tags (comma-separated), dateFrom, dateTo, orderBy (latest|popular), page, limit.',
  })
  @ApiResponse({ status: 200, type: NewsPostResponseDto, isArray: true })
  listPosts(@Query() query: NewsQueryDto) {
    return this.newsService.listPosts(query);
  }

  @UseGuards(OptionalJwtGuard)
  @Get(':identifier')
  @ApiParam({ name: 'identifier', description: 'Post UUID or slug' })
  @ApiOperation({
    summary: 'Get a single published post by UUID or slug',
    description:
      'Increments viewCount on each call. Returns 404 for DRAFT or ARCHIVED posts.',
  })
  @ApiResponse({ status: 200, type: NewsPostResponseDto })
  getPost(@Param('identifier') identifier: string) {
    return this.newsService.getPost(identifier);
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // ADMIN WRITE
  // ─────────────────────────────────────────────────────────────────────────────

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.SUPER_ADMIN, Role.CONTENT_ADMIN)
  @ApiBearerAuth()
  @Post()
  @ApiOperation({ summary: 'Admin: Create a news/blog post (starts as DRAFT)' })
  @ApiResponse({ status: 201, type: NewsPostResponseDto })
  createPost(@CurrentUser() user: any, @Body() dto: CreateNewsPostDto) {
    return this.newsService.createPost(user.id, dto);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.SUPER_ADMIN, Role.CONTENT_ADMIN)
  @ApiBearerAuth()
  @Patch(':id')
  @ApiParam({ name: 'id', description: 'Post UUID' })
  @ApiOperation({
    summary: 'Admin: Update post metadata and/or body',
    description:
      'Slug is not changed even if title is updated — this keeps URLs stable.',
  })
  updatePost(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateNewsPostDto,
  ) {
    return this.newsService.updatePost(id, dto);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.SUPER_ADMIN, Role.CONTENT_ADMIN)
  @ApiBearerAuth()
  @Patch(':id/publish')
  @HttpCode(HttpStatus.OK)
  @ApiParam({ name: 'id', description: 'Post UUID' })
  @ApiOperation({
    summary:
      'Admin: Publish a post (sets status=PUBLISHED and stamps publishedAt)',
  })
  publishPost(@Param('id', ParseUUIDPipe) id: string) {
    return this.newsService.publishPost(id);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.SUPER_ADMIN, Role.CONTENT_ADMIN)
  @ApiBearerAuth()
  @Patch(':id/archive')
  @HttpCode(HttpStatus.OK)
  @ApiParam({ name: 'id', description: 'Post UUID' })
  @ApiOperation({ summary: 'Admin: Archive a post (sets status=ARCHIVED)' })
  archivePost(@Param('id', ParseUUIDPipe) id: string) {
    return this.newsService.archivePost(id);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.SUPER_ADMIN, Role.CONTENT_ADMIN)
  @ApiBearerAuth()
  @Post(':id/thumbnail')
  @UseInterceptors(FileInterceptor('file'))
  @ApiParam({ name: 'id', description: 'Post UUID' })
  @ApiOperation({
    summary:
      'Admin: Upload/replace post thumbnail (max 5 MB, JPEG/PNG/WebP/SVG)',
  })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: { file: { type: 'string', format: 'binary' } },
    },
  })
  uploadThumbnail(
    @Param('id', ParseUUIDPipe) id: string,
    @UploadedFile(IMAGE_PIPE) file: Express.Multer.File,
  ) {
    return this.newsService.uploadThumbnail(id, file);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.SUPER_ADMIN, Role.CONTENT_ADMIN)
  @ApiBearerAuth()
  @Post(':id/attachments')
  @UseInterceptors(FilesInterceptor('files', 10))
  @ApiParam({ name: 'id', description: 'Post UUID' })
  @ApiOperation({
    summary:
      'Admin: Upload one or more attachments (max 20 MB each, up to 10 files)',
  })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        files: { type: 'array', items: { type: 'string', format: 'binary' } },
      },
    },
  })
  addAttachments(
    @Param('id', ParseUUIDPipe) id: string,
    @UploadedFiles() files: Express.Multer.File[],
  ) {
    return this.newsService.addAttachments(id, files);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.SUPER_ADMIN, Role.CONTENT_ADMIN)
  @ApiBearerAuth()
  @Delete(':id/attachments/:attachmentIndex')
  @ApiParam({ name: 'id', description: 'Post UUID' })
  @ApiParam({
    name: 'attachmentIndex',
    description: 'Zero-based index of the attachment to delete',
  })
  @ApiOperation({
    summary: 'Admin: Remove an attachment by index and delete from Azure',
  })
  deleteAttachment(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('attachmentIndex', ParseIntPipe) attachmentIndex: number,
  ) {
    return this.newsService.deleteAttachment(id, attachmentIndex);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.SUPER_ADMIN)
  @ApiBearerAuth()
  @Delete(':id')
  @ApiParam({ name: 'id', description: 'Post UUID' })
  @ApiOperation({
    summary:
      'Admin: Hard delete a post including all Azure assets (SUPER_ADMIN only)',
  })
  deletePost(@Param('id', ParseUUIDPipe) id: string) {
    return this.newsService.deletePost(id);
  }
}
