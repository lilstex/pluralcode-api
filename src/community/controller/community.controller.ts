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
  ApiParam,
  ApiConsumes,
  ApiBody,
  ApiQuery,
} from '@nestjs/swagger';
import { Role } from '@prisma/client';

import {
  CreateCommunityDto,
  UpdateCommunityDto,
  CommunityQueryDto,
  CreateTopicDto,
  UpdateTopicDto,
  BlockTopicDto,
  ReportTopicDto,
  TopicQueryDto,
  CreateCommentDto,
  UpdateCommentDto,
  CommunityResponseDto,
  TopicResponseDto,
  LikeResponseDto,
  MentionResponseDto,
  GeneralAnalyticsDto,
  CommunityAnalyticsDto,
  AllTopicResponseDto,
  TopicFilter,
  BlockCommentDto,
  ReportCommentDto,
} from '../dto/community.dto';
import { CommunityService } from '../service/community.service';

import { JwtAuthGuard } from 'src/common/guards/jwt-auth.guard';
import { RolesGuard } from 'src/common/guards/roles.guard';
import { Roles } from 'src/common/decorators/roles.decorator';
import { CurrentUser } from 'src/common/decorators/current-user.decorator';
import { OptionalJwtGuard } from 'src/common/guards/optional-jwt.guard';

const IMAGE_PIPE = new ParseFilePipe({
  validators: [
    new MaxFileSizeValidator({ maxSize: 2 * 1024 * 1024 }),
    new FileTypeValidator({ fileType: /^image\/(jpeg|png|webp|svg\+xml)$/ }),
  ],
});

@ApiTags('Communities')
@Controller('communities')
export class CommunityController {
  constructor(private readonly communityService: CommunityService) {}

  // ─────────────────────────────────────────────────────────────────────────────
  // STATIC ROUTES — must come before :communityId wildcards
  // ─────────────────────────────────────────────────────────────────────────────

  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @Get('my-subscriptions')
  @ApiOperation({ summary: 'List all communities the current user has joined' })
  mySubscriptions(@CurrentUser() user: any) {
    return this.communityService.mySubscriptions(user.id);
  }

  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @Get('mentions')
  @ApiOperation({
    summary: 'Get all topics and comments where the current user was mentioned',
  })
  @ApiResponse({ status: 200, type: MentionResponseDto, isArray: true })
  getMyMentions(@CurrentUser() user: any) {
    return this.communityService.getMyMentions(user.id);
  }

  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @Get('analytics/general')
  @ApiOperation({
    summary: 'General community analytics for the current user',
    description:
      'Returns platform-wide totals (communities, members, topics) plus ' +
      'user-specific counts (joined communities, topics started, replies posted/received).',
  })
  @ApiResponse({ status: 200, type: GeneralAnalyticsDto })
  getGeneralAnalytics(@CurrentUser() user: any) {
    return this.communityService.getGeneralAnalytics(user.id);
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // COMMUNITY CRUD
  // ─────────────────────────────────────────────────────────────────────────────

  @UseGuards(OptionalJwtGuard)
  @ApiBearerAuth()
  @Get()
  @ApiOperation({
    summary: 'List all active communities (paginated)',
    description:
      'Public endpoint. When an auth token is provided, each community includes ' +
      'a `joined` flag indicating whether the authenticated user is a member.',
  })
  @ApiResponse({ status: 200, type: CommunityResponseDto, isArray: true })
  listCommunities(@Query() query: CommunityQueryDto, @Req() req: Request) {
    const userId = (req as any).user?.id;
    return this.communityService.listCommunities(query, userId);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.SUPER_ADMIN, Role.CONTENT_ADMIN, Role.RESOURCE_ADMIN)
  @ApiBearerAuth()
  @Post()
  @ApiOperation({ summary: 'Admin: Create a new community' })
  @ApiResponse({ status: 201, type: CommunityResponseDto })
  createCommunity(@CurrentUser() user: any, @Body() dto: CreateCommunityDto) {
    return this.communityService.createCommunity(user.id, dto);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.SUPER_ADMIN, Role.CONTENT_ADMIN)
  @ApiBearerAuth()
  @Get('admin/reports')
  @ApiOperation({
    summary: 'Admin: List all reported topics (paginated)',
    description:
      'Returns every report with its associated topic and reporter. ' +
      'Supports search across topic title, topic body, and reporter name. ' +
      'Accessible by SUPER_ADMIN and CONTENT_ADMIN.',
  })
  @ApiQuery({
    name: 'search',
    required: false,
    description: 'Search across topic title, topic body, or reporter name',
  })
  @ApiQuery({ name: 'page', required: false })
  @ApiQuery({ name: 'limit', required: false })
  listReportedTopics(@Query() query: CommunityQueryDto) {
    return this.communityService.listReportedTopics(query);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.SUPER_ADMIN, Role.CONTENT_ADMIN)
  @ApiBearerAuth()
  @Get('admin/comment-reports')
  @ApiOperation({
    summary: 'Admin: List all reported comments (paginated)',
    description:
      'Returns every comment report with the comment body and reporter details. Supports search across comment body and reporter name.',
  })
  @ApiQuery({ name: 'search', required: false })
  @ApiQuery({ name: 'page', required: false })
  @ApiQuery({ name: 'limit', required: false })
  listReportedComments(
    @Query('search') search?: string,
    @Query('page') page?: number,
    @Query('limit') limit?: number,
  ) {
    return this.communityService.listReportedComments({ search, page, limit });
  }

  @Get('activity/feed')
  @ApiOperation({
    summary: 'Global activity feed — latest 30 comments across all communities',
    description:
      'Public endpoint. Returns the 30 most recent top-level comments ' +
      'across all active communities, newest first. Each item includes ' +
      'the comment body, timestamp, author, and the topic + community it belongs to.',
  })
  async getActivityFeed() {
    return this.communityService.getActivityFeed();
  }

  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @Get(':communityId')
  @ApiParam({ name: 'communityId', description: 'Community UUID' })
  @ApiOperation({ summary: 'Get a single community' })
  @ApiResponse({ status: 200, type: CommunityResponseDto })
  getCommunity(@Param('communityId', ParseUUIDPipe) communityId: string) {
    return this.communityService.getCommunity(communityId);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.SUPER_ADMIN, Role.CONTENT_ADMIN, Role.RESOURCE_ADMIN)
  @ApiBearerAuth()
  @Patch(':communityId')
  @ApiParam({ name: 'communityId', description: 'Community UUID' })
  @ApiOperation({ summary: 'Admin: Update a community' })
  @ApiResponse({ status: 200, type: CommunityResponseDto })
  updateCommunity(
    @Param('communityId', ParseUUIDPipe) communityId: string,
    @Body() dto: UpdateCommunityDto,
  ) {
    return this.communityService.updateCommunity(communityId, dto);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.SUPER_ADMIN)
  @ApiBearerAuth()
  @Delete(':communityId')
  @ApiParam({ name: 'communityId', description: 'Community UUID' })
  @ApiOperation({
    summary:
      'Admin: Hard delete a community (cascades to all topics, comments, memberships)',
  })
  deleteCommunity(@Param('communityId', ParseUUIDPipe) communityId: string) {
    return this.communityService.deleteCommunity(communityId);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.SUPER_ADMIN, Role.CONTENT_ADMIN, Role.RESOURCE_ADMIN)
  @ApiBearerAuth()
  @Post(':communityId/image')
  @UseInterceptors(FileInterceptor('file'))
  @ApiParam({ name: 'communityId', description: 'Community UUID' })
  @ApiOperation({
    summary:
      'Admin: Upload community cover image (max 2 MB, JPEG/PNG/WebP/SVG)',
  })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: { file: { type: 'string', format: 'binary' } },
    },
  })
  uploadImage(
    @Param('communityId', ParseUUIDPipe) communityId: string,
    @UploadedFile(IMAGE_PIPE) file: Express.Multer.File,
  ) {
    return this.communityService.uploadCommunityImage(communityId, file);
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // MEMBERSHIP
  // ─────────────────────────────────────────────────────────────────────────────

  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @Get(':communityId/members/search')
  @ApiParam({ name: 'communityId', description: 'Community UUID' })
  @ApiQuery({
    name: 'q',
    required: false,
    description: 'Search by member name (min 1 character)',
  })
  @ApiOperation({
    summary: 'Typeahead search for members in a community',
    description:
      'Returns up to 10 members whose name matches the query string. ' +
      'Designed for @mention autocomplete — call when user types @ followed by at least one character.',
  })
  searchMembers(
    @Param('communityId', ParseUUIDPipe) communityId: string,
    @Query('q') q: string,
  ) {
    return this.communityService.searchMembers(communityId, q);
  }

  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @Post(':communityId/subscribe')
  @ApiParam({ name: 'communityId', description: 'Community UUID' })
  @ApiOperation({ summary: 'Subscribe (join) a community' })
  subscribe(
    @CurrentUser() user: any,
    @Param('communityId', ParseUUIDPipe) communityId: string,
  ) {
    return this.communityService.subscribe(user.id, communityId);
  }

  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @Delete(':communityId/unsubscribe')
  @ApiParam({ name: 'communityId', description: 'Community UUID' })
  @ApiOperation({ summary: 'Unsubscribe (leave) a community' })
  unsubscribe(
    @CurrentUser() user: any,
    @Param('communityId', ParseUUIDPipe) communityId: string,
  ) {
    return this.communityService.unsubscribe(user.id, communityId);
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // ANALYTICS (per-community)
  // ─────────────────────────────────────────────────────────────────────────────

  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @Get(':communityId/analytics')
  @ApiParam({ name: 'communityId', description: 'Community UUID' })
  @ApiOperation({
    summary: 'Per-community analytics',
    description:
      'Returns total members, total topics, online members (null until presence layer added), ' +
      'and the date the current user joined this community.',
  })
  @ApiResponse({ status: 200, type: CommunityAnalyticsDto })
  getCommunityAnalytics(
    @CurrentUser() user: any,
    @Param('communityId', ParseUUIDPipe) communityId: string,
  ) {
    return this.communityService.getCommunityAnalytics(user.id, communityId);
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // TOPICS
  // ─────────────────────────────────────────────────────────────────────────────

  @Get('topics/all/global')
  @ApiOperation({
    summary: 'List all non-blocked topics globally (paginated)',
    description:
      'Fetches topics from all communities with community details included.',
  })
  @ApiQuery({
    name: 'filter',
    enum: TopicFilter,
    required: false,
    description: 'NEW (default) | RECENT | TRENDING',
  })
  @ApiResponse({ status: 200, type: AllTopicResponseDto, isArray: true })
  listAllTopics(@Query() query: TopicQueryDto) {
    return this.communityService.listAllTopicsGlobal(query);
  }

  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @Get(':communityId/topics')
  @ApiParam({ name: 'communityId', description: 'Community UUID' })
  @ApiOperation({
    summary: 'List non-blocked topics in a community (paginated)',
  })
  @ApiQuery({
    name: 'filter',
    enum: TopicFilter,
    required: false,
    description: 'NEW (default) | RECENT | TRENDING',
  })
  @ApiResponse({ status: 200, type: TopicResponseDto, isArray: true })
  listTopics(
    @Param('communityId', ParseUUIDPipe) communityId: string,
    @Query() query: TopicQueryDto,
    @CurrentUser() user: any,
  ) {
    return this.communityService.listTopics(communityId, query, user.id);
  }

  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @Post(':communityId/topics')
  @ApiParam({ name: 'communityId', description: 'Community UUID' })
  @ApiOperation({
    summary: 'Create a topic in a community',
    description:
      'User must be a subscribed member. Supports @mentions in body.',
  })
  @ApiResponse({ status: 201, type: TopicResponseDto })
  createTopic(
    @CurrentUser() user: any,
    @Param('communityId', ParseUUIDPipe) communityId: string,
    @Body() dto: CreateTopicDto,
  ) {
    return this.communityService.createTopic(user.id, communityId, dto);
  }

  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @Post(':communityId/topics/:topicId/report')
  @ApiParam({ name: 'communityId', description: 'Community UUID' })
  @ApiParam({ name: 'topicId', description: 'Topic UUID' })
  @ApiOperation({
    summary: 'Report a topic (member only, once per user per topic)',
  })
  reportTopic(
    @CurrentUser() user: any,
    @Param('communityId', ParseUUIDPipe) communityId: string,
    @Param('topicId', ParseUUIDPipe) topicId: string,
    @Body() dto: ReportTopicDto,
  ) {
    return this.communityService.reportTopic(
      user.id,
      communityId,
      topicId,
      dto,
    );
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.SUPER_ADMIN, Role.CONTENT_ADMIN)
  @ApiBearerAuth()
  @Patch(':communityId/topics/:topicId/block')
  @HttpCode(HttpStatus.OK)
  @ApiParam({ name: 'communityId', description: 'Community UUID' })
  @ApiParam({ name: 'topicId', description: 'Topic UUID' })
  @ApiOperation({ summary: 'Admin: Block or unblock a topic' })
  blockTopic(
    @Param('communityId', ParseUUIDPipe) communityId: string,
    @Param('topicId', ParseUUIDPipe) topicId: string,
    @Body() dto: BlockTopicDto,
  ) {
    return this.communityService.blockTopic(communityId, topicId, dto);
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // LIKES
  // ─────────────────────────────────────────────────────────────────────────────

  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @Post(':communityId/topics/:topicId/like')
  @HttpCode(HttpStatus.OK)
  @ApiParam({ name: 'communityId', description: 'Community UUID' })
  @ApiParam({ name: 'topicId', description: 'Topic UUID' })
  @ApiOperation({
    summary:
      'Toggle like on a topic (member only). Returns liked status and new count.',
  })
  @ApiResponse({ status: 200, type: LikeResponseDto })
  toggleTopicLike(
    @CurrentUser() user: any,
    @Param('communityId', ParseUUIDPipe) communityId: string,
    @Param('topicId', ParseUUIDPipe) topicId: string,
  ) {
    return this.communityService.toggleTopicLike(user.id, communityId, topicId);
  }

  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @Post(':communityId/topics/:topicId/comments/:commentId/like')
  @HttpCode(HttpStatus.OK)
  @ApiParam({ name: 'communityId', description: 'Community UUID' })
  @ApiParam({ name: 'topicId', description: 'Topic UUID' })
  @ApiParam({ name: 'commentId', description: 'Comment UUID' })
  @ApiOperation({
    summary:
      'Toggle like on a comment (member only). Returns liked status and new count.',
  })
  @ApiResponse({ status: 200, type: LikeResponseDto })
  toggleCommentLike(
    @CurrentUser() user: any,
    @Param('communityId', ParseUUIDPipe) communityId: string,
    @Param('topicId', ParseUUIDPipe) topicId: string,
    @Param('commentId', ParseUUIDPipe) commentId: string,
  ) {
    return this.communityService.toggleCommentLike(
      user.id,
      communityId,
      topicId,
      commentId,
    );
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // COMMENT REPORTS & BLOCKING
  // ─────────────────────────────────────────────────────────────────────────────

  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @Post(':communityId/topics/:topicId/comments/:commentId/report')
  @ApiParam({ name: 'communityId', description: 'Community UUID' })
  @ApiParam({ name: 'topicId', description: 'Topic UUID' })
  @ApiParam({ name: 'commentId', description: 'Comment UUID' })
  @ApiOperation({
    summary: 'Report a comment (member only, once per user per comment)',
    description:
      'Creates a report record for admin review. A user can only report a comment once.',
  })
  reportComment(
    @CurrentUser() user: any,
    @Param('communityId', ParseUUIDPipe) communityId: string,
    @Param('topicId', ParseUUIDPipe) topicId: string,
    @Param('commentId', ParseUUIDPipe) commentId: string,
    @Body() dto: ReportCommentDto,
  ) {
    return this.communityService.reportComment(
      user.id,
      communityId,
      topicId,
      commentId,
      dto,
    );
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.SUPER_ADMIN, Role.CONTENT_ADMIN)
  @ApiBearerAuth()
  @Patch(':communityId/topics/:topicId/comments/:commentId/block')
  @HttpCode(HttpStatus.OK)
  @ApiParam({ name: 'communityId', description: 'Community UUID' })
  @ApiParam({ name: 'topicId', description: 'Topic UUID' })
  @ApiParam({ name: 'commentId', description: 'Comment UUID' })
  @ApiOperation({ summary: 'Admin: Block or unblock a comment' })
  blockComment(
    @Param('communityId', ParseUUIDPipe) communityId: string,
    @Param('topicId', ParseUUIDPipe) topicId: string,
    @Param('commentId', ParseUUIDPipe) commentId: string,
    @Body() dto: BlockCommentDto,
  ) {
    return this.communityService.blockComment(
      communityId,
      topicId,
      commentId,
      dto,
    );
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.SUPER_ADMIN, Role.CONTENT_ADMIN)
  @ApiBearerAuth()
  @Get(':communityId/admin/blocked-comments')
  @ApiParam({ name: 'communityId', description: 'Community UUID' })
  @ApiOperation({
    summary: 'Admin: List all blocked comments in a community (paginated)',
    description:
      'Returns blocked comments with their report count, author, and parent topic.',
  })
  @ApiQuery({ name: 'page', required: false })
  @ApiQuery({ name: 'limit', required: false })
  listBlockedComments(
    @Param('communityId', ParseUUIDPipe) communityId: string,
    @Query('page') page?: number,
    @Query('limit') limit?: number,
  ) {
    return this.communityService.listBlockedComments(communityId, {
      page,
      limit,
    });
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // COMMENTS
  // ─────────────────────────────────────────────────────────────────────────────

  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @Post(':communityId/topics/:topicId/comments')
  @ApiParam({ name: 'communityId', description: 'Community UUID' })
  @ApiParam({ name: 'topicId', description: 'Topic UUID' })
  @ApiOperation({
    summary: 'Add a comment or reply to a topic (member only)',
    description:
      'Include parentId to reply to an existing comment. ' +
      'Pass mentionedUserIds (from the @mention typeahead) to tag other members.',
  })
  createComment(
    @CurrentUser() user: any,
    @Param('communityId', ParseUUIDPipe) communityId: string,
    @Param('topicId', ParseUUIDPipe) topicId: string,
    @Body() dto: CreateCommentDto,
  ) {
    return this.communityService.createComment(
      user.id,
      communityId,
      topicId,
      dto,
    );
  }

  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @Patch(':communityId/topics/:topicId/comments/:commentId')
  @ApiParam({ name: 'communityId', description: 'Community UUID' })
  @ApiParam({ name: 'topicId', description: 'Topic UUID' })
  @ApiParam({ name: 'commentId', description: 'Comment UUID' })
  @ApiOperation({
    summary: 'Edit own comment (author only)',
    description:
      'Updates the comment body and re-applies mentions from mentionedUserIds. ' +
      'Previous mentions for this comment are replaced entirely.',
  })
  updateComment(
    @CurrentUser() user: any,
    @Param('communityId', ParseUUIDPipe) communityId: string,
    @Param('topicId', ParseUUIDPipe) topicId: string,
    @Param('commentId', ParseUUIDPipe) commentId: string,
    @Body() dto: UpdateCommentDto,
  ) {
    return this.communityService.updateComment(
      user.id,
      communityId,
      topicId,
      commentId,
      dto,
    );
  }

  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @Delete(':communityId/topics/:topicId/comments/:commentId')
  @ApiParam({ name: 'communityId', description: 'Community UUID' })
  @ApiParam({ name: 'topicId', description: 'Topic UUID' })
  @ApiParam({ name: 'commentId', description: 'Comment UUID' })
  @ApiOperation({ summary: 'Delete a comment (author or admin)' })
  deleteComment(
    @CurrentUser() user: any,
    @Param('communityId', ParseUUIDPipe) communityId: string,
    @Param('topicId', ParseUUIDPipe) topicId: string,
    @Param('commentId', ParseUUIDPipe) commentId: string,
  ) {
    return this.communityService.deleteComment(
      user.id,
      user.role,
      communityId,
      topicId,
      commentId,
    );
  }

  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @Get(':communityId/topics/:topicId')
  @ApiParam({ name: 'communityId', description: 'Community UUID' })
  @ApiParam({ name: 'topicId', description: 'Topic UUID' })
  @ApiOperation({ summary: 'Get a single topic with all comments and replies' })
  @ApiResponse({ status: 200, type: TopicResponseDto })
  getTopic(
    @Param('communityId', ParseUUIDPipe) communityId: string,
    @Param('topicId', ParseUUIDPipe) topicId: string,
    @CurrentUser() user: any,
  ) {
    return this.communityService.getTopic(communityId, topicId, user?.id);
  }

  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @Patch(':communityId/topics/:topicId')
  @ApiParam({ name: 'communityId', description: 'Community UUID' })
  @ApiParam({ name: 'topicId', description: 'Topic UUID' })
  @ApiOperation({ summary: 'Edit own topic (author only)' })
  updateTopic(
    @CurrentUser() user: any,
    @Param('communityId', ParseUUIDPipe) communityId: string,
    @Param('topicId', ParseUUIDPipe) topicId: string,
    @Body() dto: UpdateTopicDto,
  ) {
    return this.communityService.updateTopic(
      user.id,
      communityId,
      topicId,
      dto,
    );
  }

  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @Delete(':communityId/topics/:topicId')
  @ApiParam({ name: 'communityId', description: 'Community UUID' })
  @ApiParam({ name: 'topicId', description: 'Topic UUID' })
  @ApiOperation({ summary: 'Delete a topic (author or admin)' })
  deleteTopic(
    @CurrentUser() user: any,
    @Param('communityId', ParseUUIDPipe) communityId: string,
    @Param('topicId', ParseUUIDPipe) topicId: string,
  ) {
    return this.communityService.deleteTopic(
      user.id,
      user.role,
      communityId,
      topicId,
    );
  }
}
