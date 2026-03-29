import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsBoolean,
  IsUUID,
  IsEnum,
  IsArray,
} from 'class-validator';

export enum TopicFilter {
  NEW = 'NEW',
  RECENT = 'RECENT',
  TRENDING = 'TRENDING',
  MOST_VIEWED = 'MOST_VIEWED',
}

// ─────────────────────────────────────────────
// COMMUNITY
// ─────────────────────────────────────────────

export class CreateCommunityDto {
  @ApiProperty({ example: 'NGO Finance Hub' })
  @IsNotEmpty()
  @IsString()
  name: string;

  @ApiPropertyOptional({
    example: 'A community for discussing NGO financial best practices.',
  })
  @IsOptional()
  @IsString()
  description?: string;
}

export class UpdateCommunityDto {
  @ApiPropertyOptional({ example: 'NGO Finance Hub Updated' })
  @IsOptional()
  @IsString()
  name?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional({ example: false })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class CommunityQueryDto {
  @ApiPropertyOptional({ description: 'Search by community name' })
  @IsOptional()
  @IsString()
  search?: string;

  @ApiPropertyOptional({ example: 1 })
  @IsOptional()
  page?: number;

  @ApiPropertyOptional({ example: 20 })
  @IsOptional()
  limit?: number;
}

// ─────────────────────────────────────────────
// TOPIC
// ─────────────────────────────────────────────

export class CreateTopicDto {
  @ApiProperty({ example: 'Best practices for NGO budget planning' })
  @IsNotEmpty()
  @IsString()
  title: string;

  @ApiProperty({
    example:
      'I wanted to discuss how other NGOs handle annual budget cycles. @JaneDoe what do you think?',
  })
  @IsNotEmpty()
  @IsString()
  body: string;
}

export class UpdateTopicDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  title?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  body?: string;
}

export class BlockTopicDto {
  @ApiProperty({ description: 'true to block the topic, false to unblock it' })
  @IsBoolean()
  isBlocked: boolean;
}

export class ReportTopicDto {
  @ApiPropertyOptional({
    example: 'This post contains harmful misinformation.',
  })
  @IsOptional()
  @IsString()
  reason?: string;
}

export class TopicQueryDto {
  @ApiPropertyOptional({ description: 'Search by topic title or body' })
  @IsOptional()
  @IsString()
  search?: string;

  @ApiPropertyOptional({
    enum: TopicFilter,
    description:
      'NEW = most recently created | RECENT = latest activity (updatedAt) | ' +
      'TRENDING = most liked in last 7 days | MOST_VIEWED = highest view count',
  })
  @IsOptional()
  @IsEnum(TopicFilter)
  filter?: TopicFilter;

  @ApiPropertyOptional({ example: 1 })
  @IsOptional()
  page?: number;

  @ApiPropertyOptional({ example: 20 })
  @IsOptional()
  limit?: number;
}

// ─────────────────────────────────────────────
// COMMENT
// ─────────────────────────────────────────────

export class CreateCommentDto {
  @ApiProperty({ example: 'Great point! What do you think?' })
  @IsNotEmpty()
  @IsString()
  body: string;

  @ApiPropertyOptional({
    description: 'UUID of the parent comment this is a reply to',
  })
  @IsOptional()
  @IsUUID()
  parentId?: string;

  @ApiPropertyOptional({
    description:
      'UUIDs of users mentioned in this comment (from the @mention typeahead)',
    type: [String],
    example: ['uuid-1', 'uuid-2'],
  })
  @IsOptional()
  @IsArray()
  @IsUUID('4', { each: true })
  mentionedUserIds?: string[];
}

export class UpdateCommentDto {
  @ApiProperty()
  @IsNotEmpty()
  @IsString()
  body: string;

  @ApiPropertyOptional({
    description:
      'Updated list of mentioned user UUIDs. Replaces previous mentions.',
    type: [String],
  })
  @IsOptional()
  @IsArray()
  @IsUUID('4', { each: true })
  mentionedUserIds?: string[];
}

// ─────────────────────────────────────────────
// RESPONSE DTOs
// ─────────────────────────────────────────────

export class CommunityAuthorDto {
  @ApiProperty() id: string;
  @ApiProperty() fullName: string;
  @ApiPropertyOptional() avatarUrl?: string;
}

export class CommunityResponseDto {
  @ApiProperty() id: string;
  @ApiProperty() name: string;
  @ApiPropertyOptional() description?: string;
  @ApiPropertyOptional() imageUrl?: string;
  @ApiProperty() isActive: boolean;
  @ApiProperty() createdById: string;
  @ApiProperty({ type: CommunityAuthorDto }) createdBy: CommunityAuthorDto;
  @ApiProperty() memberCount: number;
  @ApiProperty() topicCount: number;
  @ApiProperty() createdAt: Date;
  @ApiProperty() updatedAt: Date;
}

export class CommentResponseDto {
  @ApiProperty() id: string;
  @ApiProperty() body: string;
  @ApiProperty() likeCount: number;
  @ApiProperty({ type: CommunityAuthorDto }) author: CommunityAuthorDto;
  @ApiPropertyOptional() parentId?: string;
  @ApiProperty({ type: [Object] }) replies: CommentResponseDto[];
  @ApiProperty() createdAt: Date;
  @ApiProperty() updatedAt: Date;
}

export class TopicResponseDto {
  @ApiProperty() id: string;
  @ApiProperty() title: string;
  @ApiProperty() body: string;
  @ApiProperty() isBlocked: boolean;
  @ApiProperty() likeCount: number;
  @ApiProperty() viewCount: number;
  @ApiProperty() communityId: string;
  @ApiProperty({ type: CommunityAuthorDto }) author: CommunityAuthorDto;
  @ApiProperty({ type: [CommentResponseDto] }) comments: CommentResponseDto[];
  @ApiProperty() commentCount: number;
  @ApiProperty() createdAt: Date;
  @ApiProperty() updatedAt: Date;
}

export class CommunityMinDto {
  @ApiProperty() id: string;
  @ApiProperty() name: string;
  @ApiPropertyOptional() imageUrl?: string;
}
export class AllTopicResponseDto {
  @ApiProperty() id: string;
  @ApiProperty() title: string;
  @ApiProperty() body: string;
  @ApiProperty() isBlocked: boolean;
  @ApiProperty() likeCount: number;
  @ApiProperty() viewCount: number;
  @ApiProperty({ type: CommunityMinDto }) community: CommunityMinDto;
  @ApiProperty({ type: CommunityAuthorDto }) author: CommunityAuthorDto;
  @ApiProperty({ type: [CommentResponseDto] }) comments: CommentResponseDto[];
  @ApiProperty() commentCount: number;
  @ApiProperty() createdAt: Date;
  @ApiProperty() updatedAt: Date;
}

export class LikeResponseDto {
  @ApiProperty() liked: boolean;
  @ApiProperty() likeCount: number;
}

export class MentionResponseDto {
  @ApiProperty() id: string;
  @ApiPropertyOptional() topicId?: string;
  @ApiPropertyOptional() topic?: Partial<TopicResponseDto>;
  @ApiPropertyOptional() commentId?: string;
  @ApiPropertyOptional() comment?: Partial<CommentResponseDto>;
  @ApiProperty() createdAt: Date;
}

// ─────────────────────────────────────────────
// ANALYTICS RESPONSE DTOs
// ─────────────────────────────────────────────

export class GeneralAnalyticsDto {
  @ApiProperty({ description: 'Total communities on the platform' })
  totalCommunities: number;

  @ApiProperty({
    description: 'Number of communities the current user has joined',
  })
  myJoinedCommunities: number;

  @ApiProperty({ description: 'Total memberships across all communities' })
  totalMembers: number;

  @ApiProperty({
    description: 'Total non-blocked topics across all communities',
  })
  totalTopics: number;

  @ApiProperty({ description: 'Topics started by the current user' })
  myTopicsCount: number;

  @ApiProperty({ description: 'Comments posted by the current user' })
  myRepliesPosted: number;

  @ApiProperty({
    description: 'Comments received on topics authored by the current user',
  })
  myRepliesReceived: number;
}

export class CommunityAnalyticsDto {
  @ApiProperty({ description: 'Total members of this community' })
  totalMembers: number;

  @ApiProperty({ description: 'Total non-blocked topics in this community' })
  totalTopics: number;

  @ApiProperty({
    description:
      'Online members count — requires a presence layer (WebSocket/Redis). Returns null until implemented.',
    nullable: true,
  })
  onlineMembers: number | null;

  @ApiProperty({
    description:
      'Date the current user joined this community, or null if not a member',
    nullable: true,
  })
  dateJoined: Date | null;
}
