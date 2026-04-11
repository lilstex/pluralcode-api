import { Injectable, HttpStatus, Logger } from '@nestjs/common';
import { PrismaService } from 'src/prisma-module/prisma.service';
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
  TopicFilter,
  ReportCommentDto,
  BlockCommentDto,
} from '../dto/community.dto';
import { AzureBlobService } from 'src/providers/azure/azure.blob.service';
import { NotificationsService } from 'src/notifications/service/notifications.service';
import { NotificationType } from '@prisma/client';
import { CommunityGateway } from '../gateway/community.gateway';
import { RedisService } from 'src/providers/redis/redis.service';

// ─────────────────────────────────────────────────────────────────────────────
// SHARED SELECTS
// ─────────────────────────────────────────────────────────────────────────────

const AUTHOR_SELECT = {
  id: true,
  fullName: true,
  avatarUrl: true,
} as const;

const COMMUNITY_COUNTS = {
  _count: { select: { memberships: true, topics: true } },
} as const;

// Shared select for quoted comment: lightweight, no deep nesting
const QUOTE_SELECT = {
  id: true,
  body: true,
  createdAt: true,
  author: { select: AUTHOR_SELECT },
} as const;

const COMMENT_INCLUDE = {
  author: { select: AUTHOR_SELECT },
  quote: { select: QUOTE_SELECT }, // the comment being quoted (if any)
  replies: {
    where: { isBlocked: false },
    orderBy: { createdAt: 'asc' as const },
    include: {
      author: { select: AUTHOR_SELECT },
      quote: { select: QUOTE_SELECT },
    },
  },
} as const;

const TOPIC_INCLUDE = {
  author: { select: AUTHOR_SELECT },
  _count: { select: { comments: true } },
  comments: {
    where: { parentId: null }, // top-level only
    orderBy: { createdAt: 'asc' as const },
    include: {
      author: { select: AUTHOR_SELECT },
      replies: {
        orderBy: { createdAt: 'asc' as const },
        include: { author: { select: AUTHOR_SELECT } },
      },
    },
  },
} as const;

// ─────────────────────────────────────────────────────────────────────────────
// MENTION PARSER
// ─────────────────────────────────────────────────────────────────────────────

@Injectable()
export class CommunityService {
  private readonly logger = new Logger(CommunityService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly azureBlob: AzureBlobService,
    private readonly notifications: NotificationsService,
    private readonly gateway: CommunityGateway,
    private readonly redis: RedisService,
  ) {}

  // ─────────────────────────────────────────────────────────────────────────────
  // HELPERS
  // ─────────────────────────────────────────────────────────────────────────────

  private async saveMentions(
    userIds: string[],
    ref: { communityId: string; topicId?: string; commentId?: string },
  ) {
    if (!userIds.length) return;
    await this.prisma.communityMention.createMany({
      data: userIds.map((mentionedUserId) => ({
        mentionedUserId,
        communityId: ref.communityId,
        topicId: ref.topicId ?? null,
        commentId: ref.commentId ?? null,
      })),
      skipDuplicates: true,
    });
  }

  private async isMember(
    userId: string,
    communityId: string,
  ): Promise<boolean> {
    const m = await this.prisma.communityMembership.findUnique({
      where: { userId_communityId: { userId, communityId } },
    });
    return !!m;
  }

  private notMemberError() {
    return {
      status: false,
      statusCode: HttpStatus.FORBIDDEN,
      message: 'You must be a member of this community to perform this action.',
    };
  }

  private safePaginate(page: any, limit: any) {
    const p = Math.max(1, parseInt(String(page ?? '1'), 10) || 1);
    const l = Math.min(
      100,
      Math.max(1, parseInt(String(limit ?? '20'), 10) || 20),
    );
    return { page: p, limit: l, skip: (p - 1) * l };
  }

  private resolveTopicOrderBy(filter?: TopicFilter): any {
    switch (filter) {
      case TopicFilter.RECENT:
        return { updatedAt: 'desc' };
      case TopicFilter.TRENDING:
        return [{ likeCount: 'desc' }, { updatedAt: 'desc' }];
      case TopicFilter.MOST_VIEWED:
        return { viewCount: 'desc' };
      case TopicFilter.NEW:
      default:
        return { createdAt: 'desc' };
    }
  }

  private formatCommunity(c: any) {
    return {
      ...c,
      memberCount: c._count?.memberships ?? 0,
      topicCount: c._count?.topics ?? 0,
      _count: undefined,
    };
  }

  private formatTopic(t: any) {
    return {
      ...t,
      commentCount: t._count?.comments ?? 0,
      _count: undefined,
    };
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // COMMUNITY CRUD
  // ─────────────────────────────────────────────────────────────────────────────

  async createCommunity(userId: string, dto: CreateCommunityDto) {
    try {
      const exists = await this.prisma.community.findUnique({
        where: { name: dto.name },
      });
      if (exists) {
        return {
          status: false,
          statusCode: HttpStatus.CONFLICT,
          message: 'A community with this name already exists.',
        };
      }

      const community = await this.prisma.community.create({
        data: {
          name: dto.name,
          description: dto.description ?? null,
          createdById: userId,
        },
        include: { createdBy: { select: AUTHOR_SELECT }, ...COMMUNITY_COUNTS },
      });

      return {
        status: true,
        statusCode: HttpStatus.CREATED,
        message: 'Community created.',
        data: this.formatCommunity(community),
      };
    } catch (err) {
      this.logger.error('createCommunity error', err);
      return {
        status: false,
        statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
        message: 'Server error.',
      };
    }
  }

  async listCommunities(query: CommunityQueryDto, userId?: string) {
    try {
      const { page, limit, skip } = this.safePaginate(query.page, query.limit);
      const where: any = { isActive: true };
      if (query.search)
        where.name = { contains: query.search, mode: 'insensitive' };

      const [communities, total] = await this.prisma.$transaction([
        this.prisma.community.findMany({
          where,
          skip,
          take: limit,
          orderBy: { name: 'asc' },
          include: {
            createdBy: { select: AUTHOR_SELECT },
            ...COMMUNITY_COUNTS,
          },
        }),
        this.prisma.community.count({ where }),
      ]);

      // For authenticated users — resolve which communities they've joined
      // in a single batch query rather than N per-community checks
      let joinedSet = new Set<string>();

      if (userId && communities.length > 0) {
        const communityIds = communities.map((c) => c.id);
        const memberships = await this.prisma.communityMembership.findMany({
          where: { userId, communityId: { in: communityIds } },
          select: { communityId: true },
        });
        joinedSet = new Set(memberships.map((m) => m.communityId));
      }

      return {
        status: true,
        statusCode: HttpStatus.OK,
        message: 'Communities retrieved.',
        data: {
          communities: communities.map((c) => ({
            ...this.formatCommunity(c),
            ...(userId !== undefined && { joined: joinedSet.has(c.id) }),
          })),
          total,
          page,
          limit,
          pages: Math.ceil(total / limit),
        },
      };
    } catch (err) {
      this.logger.error('listCommunities error', err);
      return {
        status: false,
        statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
        message: 'Server error.',
      };
    }
  }

  async getCommunity(communityId: string) {
    try {
      const community = await this.prisma.community.findUnique({
        where: { id: communityId },
        include: { createdBy: { select: AUTHOR_SELECT }, ...COMMUNITY_COUNTS },
      });
      if (!community)
        return {
          status: false,
          statusCode: HttpStatus.NOT_FOUND,
          message: 'Community not found.',
        };

      return {
        status: true,
        statusCode: HttpStatus.OK,
        message: 'Community retrieved.',
        data: this.formatCommunity(community),
      };
    } catch (err) {
      this.logger.error('getCommunity error', err);
      return {
        status: false,
        statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
        message: 'Server error.',
      };
    }
  }

  async updateCommunity(communityId: string, dto: UpdateCommunityDto) {
    try {
      const community = await this.prisma.community.findUnique({
        where: { id: communityId },
      });
      if (!community)
        return {
          status: false,
          statusCode: HttpStatus.NOT_FOUND,
          message: 'Community not found.',
        };

      if (dto.name && dto.name !== community.name) {
        const nameExists = await this.prisma.community.findUnique({
          where: { name: dto.name },
        });
        if (nameExists)
          return {
            status: false,
            statusCode: HttpStatus.CONFLICT,
            message: 'A community with this name already exists.',
          };
      }

      const updated = await this.prisma.community.update({
        where: { id: communityId },
        data: {
          ...(dto.name !== undefined && { name: dto.name }),
          ...(dto.description !== undefined && {
            description: dto.description,
          }),
          ...(dto.isActive !== undefined && { isActive: dto.isActive }),
        },
        include: { createdBy: { select: AUTHOR_SELECT }, ...COMMUNITY_COUNTS },
      });

      return {
        status: true,
        statusCode: HttpStatus.OK,
        message: 'Community updated.',
        data: this.formatCommunity(updated),
      };
    } catch (err) {
      this.logger.error('updateCommunity error', err);
      return {
        status: false,
        statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
        message: 'Server error.',
      };
    }
  }

  async deleteCommunity(communityId: string) {
    try {
      const community = await this.prisma.community.findUnique({
        where: { id: communityId },
      });
      if (!community)
        return {
          status: false,
          statusCode: HttpStatus.NOT_FOUND,
          message: 'Community not found.',
        };

      if (community.imageUrl) {
        await this.azureBlob
          .delete(community.imageUrl, 'communities')
          .catch(() => null);
      }

      await this.prisma.community.delete({ where: { id: communityId } });

      return {
        status: true,
        statusCode: HttpStatus.OK,
        message: 'Community deleted.',
      };
    } catch (err) {
      this.logger.error('deleteCommunity error', err);
      return {
        status: false,
        statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
        message: 'Server error.',
      };
    }
  }

  async uploadCommunityImage(communityId: string, file: Express.Multer.File) {
    try {
      const community = await this.prisma.community.findUnique({
        where: { id: communityId },
      });
      if (!community)
        return {
          status: false,
          statusCode: HttpStatus.NOT_FOUND,
          message: 'Community not found.',
        };

      if (community.imageUrl)
        await this.azureBlob
          .delete(community.imageUrl, 'communities')
          .catch(() => null);
      const imageUrl = await this.azureBlob.upload(file, 'communities');

      await this.prisma.community.update({
        where: { id: communityId },
        data: { imageUrl },
      });

      return {
        status: true,
        statusCode: HttpStatus.OK,
        message: 'Community image uploaded.',
        imageUrl,
      };
    } catch (err) {
      this.logger.error('uploadCommunityImage error', err);
      return {
        status: false,
        statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
        message: 'Server error.',
      };
    }
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // MEMBERSHIP
  // ─────────────────────────────────────────────────────────────────────────────

  async searchMembers(communityId: string, q: string) {
    try {
      // Return empty immediately if no query — frontend should only call after @+char
      if (!q || q.trim().length === 0) {
        return {
          status: true,
          statusCode: HttpStatus.OK,
          message: 'Members retrieved.',
          data: [],
        };
      }

      const memberships = await this.prisma.communityMembership.findMany({
        where: {
          communityId,
          user: {
            fullName: { contains: q.trim(), mode: 'insensitive' },
            status: 'APPROVED',
          },
        },
        take: 10,
        orderBy: { user: { fullName: 'asc' } },
        select: {
          user: { select: AUTHOR_SELECT },
        },
      });

      return {
        status: true,
        statusCode: HttpStatus.OK,
        message: 'Members retrieved.',
        data: memberships.map((m) => m.user),
      };
    } catch (err) {
      this.logger.error('searchMembers error', err);
      return {
        status: false,
        statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
        message: 'Server error.',
      };
    }
  }

  async subscribe(userId: string, communityId: string) {
    try {
      const community = await this.prisma.community.findUnique({
        where: { id: communityId },
      });
      if (!community || !community.isActive) {
        return {
          status: false,
          statusCode: HttpStatus.NOT_FOUND,
          message: 'Community not found.',
        };
      }

      const existing = await this.prisma.communityMembership.findUnique({
        where: { userId_communityId: { userId, communityId } },
      });
      if (existing) {
        return {
          status: false,
          statusCode: HttpStatus.CONFLICT,
          message: 'You are already a member of this community.',
        };
      }

      const membership = await this.prisma.communityMembership.create({
        data: { userId, communityId },
      });

      return {
        status: true,
        statusCode: HttpStatus.CREATED,
        message: 'Subscribed to community.',
        data: membership,
      };
    } catch (err) {
      this.logger.error('subscribe error', err);
      return {
        status: false,
        statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
        message: 'Server error.',
      };
    }
  }

  async unsubscribe(userId: string, communityId: string) {
    try {
      const membership = await this.prisma.communityMembership.findUnique({
        where: { userId_communityId: { userId, communityId } },
      });
      if (!membership) {
        return {
          status: false,
          statusCode: HttpStatus.NOT_FOUND,
          message: 'You are not a member of this community.',
        };
      }

      await this.prisma.communityMembership.delete({
        where: { userId_communityId: { userId, communityId } },
      });

      return {
        status: true,
        statusCode: HttpStatus.OK,
        message: 'Unsubscribed from community.',
      };
    } catch (err) {
      this.logger.error('unsubscribe error', err);
      return {
        status: false,
        statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
        message: 'Server error.',
      };
    }
  }

  async mySubscriptions(userId: string) {
    try {
      const memberships = await this.prisma.communityMembership.findMany({
        where: { userId },
        orderBy: { joinedAt: 'desc' },
        include: {
          community: {
            include: {
              createdBy: { select: AUTHOR_SELECT },
              ...COMMUNITY_COUNTS,
            },
          },
        },
      });

      return {
        status: true,
        statusCode: HttpStatus.OK,
        message: 'Subscriptions retrieved.',
        data: memberships.map((m) => ({
          ...m,
          community: this.formatCommunity(m.community),
        })),
      };
    } catch (err) {
      this.logger.error('mySubscriptions error', err);
      return {
        status: false,
        statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
        message: 'Server error.',
      };
    }
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // TOPICS
  // ─────────────────────────────────────────────────────────────────────────────

  async listAllTopicsGlobal(query: TopicQueryDto) {
    try {
      const { page, limit, skip } = this.safePaginate(query.page, query.limit);

      const where: any = { isBlocked: false };

      // TRENDING: restrict to last 7 days so old viral topics don't dominate
      if (query.filter === TopicFilter.TRENDING) {
        where.createdAt = {
          gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000),
        };
      }

      if (query.search) {
        where.OR = [
          { title: { contains: query.search, mode: 'insensitive' } },
          { body: { contains: query.search, mode: 'insensitive' } },
        ];
      }

      const [topics, total] = await this.prisma.$transaction([
        this.prisma.communityTopic.findMany({
          where,
          skip,
          take: limit,
          orderBy: this.resolveTopicOrderBy(query.filter),
          include: {
            ...TOPIC_INCLUDE,
            community: {
              select: { id: true, name: true, imageUrl: true },
            },
          },
        }),
        this.prisma.communityTopic.count({ where }),
      ]);

      return {
        status: true,
        statusCode: HttpStatus.OK,
        message: 'Global topics retrieved.',
        data: {
          topics: topics.map((t) => this.formatTopic(t)),
          total,
          page,
          limit,
          pages: Math.ceil(total / limit),
        },
      };
    } catch (err) {
      this.logger.error('listAllTopicsGlobal error', err);
      return {
        status: false,
        statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
        message: 'Server error.',
      };
    }
  }

  async createTopic(userId: string, communityId: string, dto: CreateTopicDto) {
    try {
      const community = await this.prisma.community.findUnique({
        where: { id: communityId },
      });
      if (!community || !community.isActive) {
        return {
          status: false,
          statusCode: HttpStatus.NOT_FOUND,
          message: 'Community not found.',
        };
      }

      if (!(await this.isMember(userId, communityId)))
        return this.notMemberError();

      const topic = await this.prisma.communityTopic.create({
        data: {
          title: dto.title,
          body: dto.body,
          communityId,
          authorId: userId,
        },
        include: TOPIC_INCLUDE,
      });

      // Broadcast new topic in real-time to all members in this community room
      this.gateway.broadcastNewTopic(communityId, {
        id: topic.id,
        title: topic.title,
        body: topic.body,
        communityId: topic.communityId,
        author: topic.author as any,
        createdAt: topic.createdAt,
      });

      const formatted = this.formatTopic(topic);
      return {
        status: true,
        statusCode: HttpStatus.CREATED,
        message: 'Topic created.',
        data: formatted,
      };
    } catch (err) {
      this.logger.error('createTopic error', err);
      return {
        status: false,
        statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
        message: 'Server error.',
      };
    }
  }

  async listTopics(
    communityId: string,
    query: TopicQueryDto,
    userId: string | null,
  ) {
    try {
      const community = await this.prisma.community.findUnique({
        where: { id: communityId },
      });
      if (!community)
        return {
          status: false,
          statusCode: HttpStatus.NOT_FOUND,
          message: 'Community not found.',
        };

      const { page, limit, skip } = this.safePaginate(query.page, query.limit);
      const where: any = { communityId, isBlocked: false };

      // TRENDING: restrict to last 7 days
      if (query.filter === TopicFilter.TRENDING) {
        where.createdAt = {
          gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000),
        };
      }

      if (query.search) {
        where.OR = [
          { title: { contains: query.search, mode: 'insensitive' } },
          { body: { contains: query.search, mode: 'insensitive' } },
        ];
      }

      const [topics, total] = await this.prisma.$transaction([
        this.prisma.communityTopic.findMany({
          where,
          skip,
          take: limit,
          orderBy: this.resolveTopicOrderBy(query.filter),
          include: TOPIC_INCLUDE,
        }),
        this.prisma.communityTopic.count({ where }),
      ]);

      // Only fetch likes when the user is authenticated
      const likedSet = new Set<string>();
      if (userId && topics.length > 0) {
        const topicIds = topics.map((t) => t.id);
        const userLikes = await this.prisma.communityLike.findMany({
          where: { userId, topicId: { in: topicIds } },
          select: { topicId: true },
        });
        userLikes.forEach((l) => likedSet.add(l.topicId!));
      }

      return {
        status: true,
        statusCode: HttpStatus.OK,
        message: 'Topics retrieved.',
        data: {
          topics: topics.map((t) => ({
            ...this.formatTopic(t),
            // hasLiked is only included when the user is authenticated
            ...(userId !== null && { hasLiked: likedSet.has(t.id) }),
          })),
          total,
          page,
          limit,
          pages: Math.ceil(total / limit),
        },
      };
    } catch (err) {
      this.logger.error('listTopics error', err);
      return {
        status: false,
        statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
        message: 'Server error.',
      };
    }
  }

  async getTopic(communityId: string, topicId: string, userId?: string | null) {
    try {
      const topic = await this.prisma.communityTopic.findUnique({
        where: { id: topicId },
        include: TOPIC_INCLUDE,
      });

      if (!topic || topic.communityId !== communityId || topic.isBlocked) {
        return {
          status: false,
          statusCode: HttpStatus.NOT_FOUND,
          message: 'Topic not found.',
        };
      }

      // View tracking — authenticated users only.
      if (userId) {
        this.prisma.topicView
          .createMany({
            data: [{ userId, topicId }],
            skipDuplicates: true,
          })
          .then(({ count }) => {
            if (count === 1) {
              return this.prisma.communityTopic.update({
                where: { id: topicId },
                data: { viewCount: { increment: 1 } },
              });
            }
          })
          .catch((err) => this.logger.error('viewCount increment failed', err));
      }

      return {
        status: true,
        statusCode: HttpStatus.OK,
        message: 'Topic retrieved.',
        data: this.formatTopic(topic),
      };
    } catch (err) {
      this.logger.error('getTopic error', err);
      return {
        status: false,
        statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
        message: 'Server error.',
      };
    }
  }
  async updateTopic(
    userId: string,
    communityId: string,
    topicId: string,
    dto: UpdateTopicDto,
  ) {
    try {
      const topic = await this.prisma.communityTopic.findUnique({
        where: { id: topicId },
      });
      if (!topic || topic.communityId !== communityId) {
        return {
          status: false,
          statusCode: HttpStatus.NOT_FOUND,
          message: 'Topic not found.',
        };
      }
      if (topic.authorId !== userId) {
        return {
          status: false,
          statusCode: HttpStatus.FORBIDDEN,
          message: 'You can only edit your own topics.',
        };
      }

      const updated = await this.prisma.communityTopic.update({
        where: { id: topicId },
        data: {
          ...(dto.title !== undefined && { title: dto.title }),
          ...(dto.body !== undefined && { body: dto.body }),
        },
        include: TOPIC_INCLUDE,
      });

      return {
        status: true,
        statusCode: HttpStatus.OK,
        message: 'Topic updated.',
        data: this.formatTopic(updated),
      };
    } catch (err) {
      this.logger.error('updateTopic error', err);
      return {
        status: false,
        statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
        message: 'Server error.',
      };
    }
  }

  async deleteTopic(
    userId: string,
    userRole: string,
    communityId: string,
    topicId: string,
  ) {
    try {
      const topic = await this.prisma.communityTopic.findUnique({
        where: { id: topicId },
      });
      if (!topic || topic.communityId !== communityId) {
        return {
          status: false,
          statusCode: HttpStatus.NOT_FOUND,
          message: 'Topic not found.',
        };
      }

      const isAdmin = ['SUPER_ADMIN', 'CONTENT_ADMIN'].includes(userRole);
      if (topic.authorId !== userId && !isAdmin) {
        return {
          status: false,
          statusCode: HttpStatus.FORBIDDEN,
          message: 'You do not have permission to delete this topic.',
        };
      }

      await this.prisma.communityTopic.delete({ where: { id: topicId } });

      return {
        status: true,
        statusCode: HttpStatus.OK,
        message: 'Topic deleted.',
      };
    } catch (err) {
      this.logger.error('deleteTopic error', err);
      return {
        status: false,
        statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
        message: 'Server error.',
      };
    }
  }

  async reportTopic(
    userId: string,
    communityId: string,
    topicId: string,
    dto: ReportTopicDto,
  ) {
    try {
      if (!(await this.isMember(userId, communityId)))
        return this.notMemberError();

      const topic = await this.prisma.communityTopic.findUnique({
        where: { id: topicId },
      });
      if (!topic || topic.communityId !== communityId) {
        return {
          status: false,
          statusCode: HttpStatus.NOT_FOUND,
          message: 'Topic not found.',
        };
      }

      const existing = await this.prisma.communityReport.findUnique({
        where: { topicId_reportedById: { topicId, reportedById: userId } },
      });
      if (existing) {
        return {
          status: false,
          statusCode: HttpStatus.CONFLICT,
          message: 'You have already reported this topic.',
        };
      }

      const report = await this.prisma.communityReport.create({
        data: { topicId, reportedById: userId, reason: dto.reason ?? null },
      });

      return {
        status: true,
        statusCode: HttpStatus.CREATED,
        message: 'Topic reported.',
        data: report,
      };
    } catch (err) {
      this.logger.error('reportTopic error', err);
      return {
        status: false,
        statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
        message: 'Server error.',
      };
    }
  }

  async listReportedTopics(query: CommunityQueryDto) {
    try {
      const { page, limit, skip } = this.safePaginate(query.page, query.limit);

      const where: any = {};

      if (query.search) {
        where.OR = [
          { topic: { title: { contains: query.search, mode: 'insensitive' } } },
          { topic: { body: { contains: query.search, mode: 'insensitive' } } },
          {
            reportedBy: {
              fullName: { contains: query.search, mode: 'insensitive' },
            },
          },
        ];
      }

      const [reports, total] = await this.prisma.$transaction([
        this.prisma.communityReport.findMany({
          where,
          skip,
          take: limit,
          orderBy: { createdAt: 'desc' },
          include: {
            topic: {
              select: {
                id: true,
                title: true,
                body: true,
                isBlocked: true,
                communityId: true,
                authorId: true,
                author: { select: AUTHOR_SELECT },
                createdAt: true,
              },
            },
            reportedBy: {
              select: {
                id: true,
                fullName: true,
                email: true,
                avatarUrl: true,
              },
            },
          },
        }),
        this.prisma.communityReport.count({ where }),
      ]);

      return {
        status: true,
        statusCode: HttpStatus.OK,
        message: 'Reported topics retrieved.',
        data: {
          reports: reports.map((r) => ({
            id: r.id,
            reason: r.reason,
            createdAt: r.createdAt,
            topic: r.topic,
            reportedBy: r.reportedBy,
          })),
          total,
          page,
          limit,
          pages: Math.ceil(total / limit),
        },
      };
    } catch (err) {
      this.logger.error('listReportedTopics error', err);
      return {
        status: false,
        statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
        message: 'Server error.',
      };
    }
  }

  async blockTopic(communityId: string, topicId: string, dto: BlockTopicDto) {
    try {
      const topic = await this.prisma.communityTopic.findUnique({
        where: { id: topicId },
      });
      if (!topic || topic.communityId !== communityId) {
        return {
          status: false,
          statusCode: HttpStatus.NOT_FOUND,
          message: 'Topic not found.',
        };
      }

      const updated = await this.prisma.communityTopic.update({
        where: { id: topicId },
        data: { isBlocked: dto.isBlocked },
      });

      return {
        status: true,
        statusCode: HttpStatus.OK,
        message: dto.isBlocked ? 'Topic blocked.' : 'Topic unblocked.',
        data: updated,
      };
    } catch (err) {
      this.logger.error('blockTopic error', err);
      return {
        status: false,
        statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
        message: 'Server error.',
      };
    }
  }

  async getActivityFeed() {
    try {
      const comments = await this.prisma.communityComment.findMany({
        where: {
          parentId: null, // top-level comments only
          topic: { isBlocked: false },
        },
        orderBy: { createdAt: 'desc' },
        take: 30,
        select: {
          id: true,
          body: true,
          createdAt: true,
          author: { select: AUTHOR_SELECT },
          topic: {
            select: {
              id: true,
              title: true,
              communityId: true,
              community: {
                select: { id: true, name: true, imageUrl: true },
              },
            },
          },
        },
      });

      return {
        status: true,
        statusCode: HttpStatus.OK,
        message: 'Activity feed retrieved.',
        data: comments,
      };
    } catch (err) {
      this.logger.error('getActivityFeed error', err);
      return {
        status: false,
        statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
        message: 'Server error.',
      };
    }
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // LIKES
  // ─────────────────────────────────────────────────────────────────────────────

  async toggleTopicLike(userId: string, communityId: string, topicId: string) {
    try {
      if (!(await this.isMember(userId, communityId)))
        return this.notMemberError();

      const topic = await this.prisma.communityTopic.findUnique({
        where: { id: topicId },
      });
      if (!topic || topic.communityId !== communityId || topic.isBlocked) {
        return {
          status: false,
          statusCode: HttpStatus.NOT_FOUND,
          message: 'Topic not found.',
        };
      }

      const existing = await this.prisma.communityLike.findUnique({
        where: { userId_topicId: { userId, topicId } },
      });

      let liked: boolean;
      let likeCount: number;

      if (existing) {
        await this.prisma.communityLike.delete({
          where: { userId_topicId: { userId, topicId } },
        });
        const updated = await this.prisma.communityTopic.update({
          where: { id: topicId },
          data: { likeCount: { decrement: 1 } },
        });
        liked = false;
        likeCount = updated.likeCount;
      } else {
        await this.prisma.communityLike.create({ data: { userId, topicId } });
        const updated = await this.prisma.communityTopic.update({
          where: { id: topicId },
          data: { likeCount: { increment: 1 } },
        });
        liked = true;
        likeCount = updated.likeCount;

        // Notify topic author — but not if they liked their own topic
        if (topic.authorId !== userId) {
          this.notifications
            .create({
              userId: topic.authorId,
              type: NotificationType.COMMUNITY_TOPIC_LIKED,
              title: 'Someone liked your topic',
              body: `Your topic "${topic.title}" received a new like.`,
              link: `${process.env.FRONTEND_URL}/community `,
              meta: { topicId: topic.id, topicTitle: topic.title },
            })
            .catch((err) => this.logger.error('notification failed', err));
        }
      }

      return {
        status: true,
        statusCode: HttpStatus.OK,
        message: liked ? 'Topic liked.' : 'Topic unliked.',
        data: { liked, likeCount },
      };
    } catch (err) {
      this.logger.error('toggleTopicLike error', err);
      return {
        status: false,
        statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
        message: 'Server error.',
      };
    }
  }

  async toggleCommentLike(
    userId: string,
    communityId: string,
    topicId: string,
    commentId: string,
  ) {
    try {
      if (!(await this.isMember(userId, communityId)))
        return this.notMemberError();

      const comment = await this.prisma.communityComment.findUnique({
        where: { id: commentId },
      });
      if (!comment || comment.topicId !== topicId) {
        return {
          status: false,
          statusCode: HttpStatus.NOT_FOUND,
          message: 'Comment not found.',
        };
      }

      const existing = await this.prisma.communityLike.findUnique({
        where: { userId_commentId: { userId, commentId } },
      });

      let liked: boolean;
      let likeCount: number;

      if (existing) {
        await this.prisma.communityLike.delete({
          where: { userId_commentId: { userId, commentId } },
        });
        const updated = await this.prisma.communityComment.update({
          where: { id: commentId },
          data: { likeCount: { decrement: 1 } },
        });
        liked = false;
        likeCount = updated.likeCount;
      } else {
        await this.prisma.communityLike.create({ data: { userId, commentId } });
        const updated = await this.prisma.communityComment.update({
          where: { id: commentId },
          data: { likeCount: { increment: 1 } },
        });
        liked = true;
        likeCount = updated.likeCount;
      }

      return {
        status: true,
        statusCode: HttpStatus.OK,
        message: liked ? 'Comment liked.' : 'Comment unliked.',
        data: { liked, likeCount },
      };
    } catch (err) {
      this.logger.error('toggleCommentLike error', err);
      return {
        status: false,
        statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
        message: 'Server error.',
      };
    }
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // COMMENTS
  // ─────────────────────────────────────────────────────────────────────────────

  async createComment(
    userId: string,
    communityId: string,
    topicId: string,
    dto: CreateCommentDto,
  ) {
    try {
      if (!(await this.isMember(userId, communityId)))
        return this.notMemberError();

      const topic = await this.prisma.communityTopic.findUnique({
        where: { id: topicId },
      });
      if (!topic || topic.communityId !== communityId || topic.isBlocked) {
        return {
          status: false,
          statusCode: HttpStatus.NOT_FOUND,
          message: 'Topic not found.',
        };
      }

      if (dto.parentId) {
        const parent = await this.prisma.communityComment.findUnique({
          where: { id: dto.parentId },
        });
        if (!parent || parent.topicId !== topicId) {
          return {
            status: false,
            statusCode: HttpStatus.BAD_REQUEST,
            message: 'Parent comment not found on this topic.',
          };
        }
      }

      // Validate quoted comment belongs to the same topic
      if (dto.quoteId) {
        const quoted = await this.prisma.communityComment.findUnique({
          where: { id: dto.quoteId },
        });
        if (!quoted || quoted.topicId !== topicId) {
          return {
            status: false,
            statusCode: HttpStatus.BAD_REQUEST,
            message: 'Quoted comment not found on this topic.',
          };
        }
        if (quoted.isBlocked) {
          return {
            status: false,
            statusCode: HttpStatus.BAD_REQUEST,
            message: 'Cannot quote a blocked comment.',
          };
        }
      }

      const comment = await this.prisma.communityComment.create({
        data: {
          body: dto.body,
          topicId,
          authorId: userId,
          parentId: dto.parentId ?? null,
          quoteId: dto.quoteId ?? null,
          isQuote: !!dto.quoteId,
        },
        include: COMMENT_INCLUDE,
      });

      // Mentions: use explicit UUID array from frontend typeahead
      const filteredMentions = (dto.mentionedUserIds ?? []).filter(
        (id) => id !== userId,
      );
      if (filteredMentions.length > 0) {
        await this.saveMentions(filteredMentions, {
          communityId,
          topicId,
          commentId: comment.id,
        });
      }

      // Notify topic author of the new comment (unless they wrote it themselves)
      if (topic.authorId !== userId) {
        this.notifications
          .create({
            userId: topic.authorId,
            type: NotificationType.COMMUNITY_TOPIC_COMMENT,
            title: 'New comment on your topic',
            body: `Someone commented on your topic "${topic.title}".`,
            link: `${process.env.FRONTEND_URL}/community `,
            meta: { topicId, topicTitle: topic.title, commentId: comment.id },
          })
          .catch((err) => this.logger.error('notification failed', err));
      }

      // Notify each @mentioned user
      if (filteredMentions.length > 0) {
        this.notifications
          .createMany(
            filteredMentions.map((mentionedUserId) => ({
              userId: mentionedUserId,
              type: NotificationType.COMMUNITY_MENTION,
              title: 'You were mentioned in a comment',
              body: `You were mentioned in a comment on "${topic.title}".`,
              link: `${process.env.FRONTEND_URL}/community `,
              meta: { topicId, topicTitle: topic.title, commentId: comment.id },
            })),
          )
          .catch((err) =>
            this.logger.error('notification fan-out failed', err),
          );

        // Real-time push — reaches mentioned users even if not in the community room
        for (const mentionedUserId of filteredMentions) {
          this.gateway.broadcastMention(mentionedUserId, {
            communityId,
            topicId,
            commentId: comment.id,
            topicTitle: topic.title,
            mentionedBy: userId,
          });
        }
      }

      return {
        status: true,
        statusCode: HttpStatus.CREATED,
        message: 'Comment added.',
        data: comment,
      };
    } catch (err) {
      this.logger.error('createComment error', err);
      return {
        status: false,
        statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
        message: 'Server error.',
      };
    }
  }

  async updateComment(
    userId: string,
    communityId: string,
    topicId: string,
    commentId: string,
    dto: UpdateCommentDto,
  ) {
    try {
      if (!(await this.isMember(userId, communityId)))
        return this.notMemberError();

      const comment = await this.prisma.communityComment.findUnique({
        where: { id: commentId },
      });
      if (!comment || comment.topicId !== topicId) {
        return {
          status: false,
          statusCode: HttpStatus.NOT_FOUND,
          message: 'Comment not found.',
        };
      }
      if (comment.authorId !== userId) {
        return {
          status: false,
          statusCode: HttpStatus.FORBIDDEN,
          message: 'You can only edit your own comments.',
        };
      }

      // Validate quoteId if being changed
      let isQuote = comment.isQuote;
      let resolvedQuoteId: string | null = comment.quoteId;

      if (dto.quoteId !== undefined) {
        if (dto.quoteId === null) {
          // User is explicitly removing the quote
          isQuote = false;
          resolvedQuoteId = null;
        } else {
          // User is setting or changing the quoted comment
          const quoted = await this.prisma.communityComment.findUnique({
            where: { id: dto.quoteId },
          });
          if (!quoted || quoted.topicId !== topicId) {
            return {
              status: false,
              statusCode: HttpStatus.BAD_REQUEST,
              message: 'Quoted comment not found on this topic.',
            };
          }
          if (quoted.isBlocked) {
            return {
              status: false,
              statusCode: HttpStatus.BAD_REQUEST,
              message: 'Cannot quote a blocked comment.',
            };
          }
          if (dto.quoteId === commentId) {
            return {
              status: false,
              statusCode: HttpStatus.BAD_REQUEST,
              message: 'A comment cannot quote itself.',
            };
          }
          isQuote = true;
          resolvedQuoteId = dto.quoteId;
        }
      }

      // Persist the update
      const updated = await this.prisma.communityComment.update({
        where: { id: commentId },
        data: {
          ...(dto.body !== undefined && { body: dto.body }),
          isQuote,
          quoteId: resolvedQuoteId,
        },
        include: COMMENT_INCLUDE,
      });

      // Replace mentions
      await this.prisma.communityMention.deleteMany({ where: { commentId } });
      const toMention = (dto.mentionedUserIds ?? []).filter(
        (id) => id !== userId,
      );
      if (toMention.length > 0) {
        await this.saveMentions(toMention, { communityId, commentId });
        for (const mentionedUserId of toMention) {
          this.gateway.broadcastMention(mentionedUserId, {
            communityId,
            topicId,
            commentId,
            topicTitle: '',
            mentionedBy: userId,
          });
        }
      }

      return {
        status: true,
        statusCode: HttpStatus.OK,
        message: 'Comment updated.',
        data: updated,
      };
    } catch (err) {
      this.logger.error('updateComment error', err);
      return {
        status: false,
        statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
        message: 'Server error.',
      };
    }
  }

  async deleteComment(
    userId: string,
    userRole: string,
    communityId: string,
    topicId: string,
    commentId: string,
  ) {
    try {
      const comment = await this.prisma.communityComment.findUnique({
        where: { id: commentId },
      });
      if (!comment || comment.topicId !== topicId) {
        return {
          status: false,
          statusCode: HttpStatus.NOT_FOUND,
          message: 'Comment not found.',
        };
      }

      const isAdmin = ['SUPER_ADMIN', 'CONTENT_ADMIN'].includes(userRole);
      if (comment.authorId !== userId && !isAdmin) {
        return {
          status: false,
          statusCode: HttpStatus.FORBIDDEN,
          message: 'You do not have permission to delete this comment.',
        };
      }

      await this.prisma.communityComment.delete({ where: { id: commentId } });

      return {
        status: true,
        statusCode: HttpStatus.OK,
        message: 'Comment deleted.',
      };
    } catch (err) {
      this.logger.error('deleteComment error', err);
      return {
        status: false,
        statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
        message: 'Server error.',
      };
    }
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // COMMENT REPORTS & BLOCKING
  // ─────────────────────────────────────────────────────────────────────────────
  async reportComment(
    userId: string,
    communityId: string,
    topicId: string,
    commentId: string,
    dto: ReportCommentDto,
  ) {
    try {
      if (!(await this.isMember(userId, communityId)))
        return this.notMemberError();

      const comment = await this.prisma.communityComment.findUnique({
        where: { id: commentId },
      });
      if (!comment || comment.topicId !== topicId || comment.isBlocked) {
        return {
          status: false,
          statusCode: HttpStatus.NOT_FOUND,
          message: 'Comment not found.',
        };
      }

      const existing = await this.prisma.communityCommentReport.findUnique({
        where: { commentId_reportedById: { commentId, reportedById: userId } },
      });
      if (existing) {
        return {
          status: false,
          statusCode: HttpStatus.CONFLICT,
          message: 'You have already reported this comment.',
        };
      }

      const report = await this.prisma.communityCommentReport.create({
        data: { commentId, reportedById: userId, reason: dto.reason ?? null },
      });

      return {
        status: true,
        statusCode: HttpStatus.CREATED,
        message: 'Comment reported.',
        data: report,
      };
    } catch (err) {
      this.logger.error('reportComment error', err);
      return {
        status: false,
        statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
        message: 'Server error.',
      };
    }
  }

  async listReportedComments(query: {
    search?: string;
    page?: number;
    limit?: number;
  }) {
    try {
      const { page, limit, skip } = this.safePaginate(query.page, query.limit);
      const where: any = {};

      if (query.search) {
        where.OR = [
          {
            comment: { body: { contains: query.search, mode: 'insensitive' } },
          },
          {
            reportedBy: {
              fullName: { contains: query.search, mode: 'insensitive' },
            },
          },
        ];
      }

      const [reports, total] = await this.prisma.$transaction([
        this.prisma.communityCommentReport.findMany({
          where,
          skip,
          take: limit,
          orderBy: { createdAt: 'desc' },
          include: {
            comment: {
              select: {
                id: true,
                body: true,
                isBlocked: true,
                topicId: true,
                authorId: true,
                author: { select: AUTHOR_SELECT },
                createdAt: true,
              },
            },
            reportedBy: {
              select: {
                id: true,
                fullName: true,
                email: true,
                avatarUrl: true,
              },
            },
          },
        }),
        this.prisma.communityCommentReport.count({ where }),
      ]);

      return {
        status: true,
        statusCode: HttpStatus.OK,
        message: 'Reported comments retrieved.',
        data: { reports, total, page, limit, pages: Math.ceil(total / limit) },
      };
    } catch (err) {
      this.logger.error('listReportedComments error', err);
      return {
        status: false,
        statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
        message: 'Server error.',
      };
    }
  }

  async blockComment(
    communityId: string,
    topicId: string,
    commentId: string,
    dto: BlockCommentDto,
  ) {
    try {
      const comment = await this.prisma.communityComment.findUnique({
        where: { id: commentId },
      });
      if (!comment || comment.topicId !== topicId) {
        return {
          status: false,
          statusCode: HttpStatus.NOT_FOUND,
          message: 'Comment not found.',
        };
      }

      const updated = await this.prisma.communityComment.update({
        where: { id: commentId },
        data: { isBlocked: dto.isBlocked },
      });

      return {
        status: true,
        statusCode: HttpStatus.OK,
        message: dto.isBlocked ? 'Comment blocked.' : 'Comment unblocked.',
        data: updated,
      };
    } catch (err) {
      this.logger.error('blockComment error', err);
      return {
        status: false,
        statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
        message: 'Server error.',
      };
    }
  }

  async listBlockedComments(
    communityId: string,
    query: { page?: number; limit?: number },
  ) {
    try {
      const { page, limit, skip } = this.safePaginate(query.page, query.limit);

      const community = await this.prisma.community.findUnique({
        where: { id: communityId },
      });
      if (!community) {
        return {
          status: false,
          statusCode: HttpStatus.NOT_FOUND,
          message: 'Community not found.',
        };
      }

      const [comments, total] = await this.prisma.$transaction([
        this.prisma.communityComment.findMany({
          where: { isBlocked: true, topic: { communityId } },
          skip,
          take: limit,
          orderBy: { updatedAt: 'desc' },
          select: {
            id: true,
            body: true,
            isBlocked: true,
            createdAt: true,
            updatedAt: true,
            author: { select: AUTHOR_SELECT },
            topic: { select: { id: true, title: true, communityId: true } },
            _count: { select: { reports: true } },
          },
        }),
        this.prisma.communityComment.count({
          where: { isBlocked: true, topic: { communityId } },
        }),
      ]);

      return {
        status: true,
        statusCode: HttpStatus.OK,
        message: 'Blocked comments retrieved.',
        data: {
          comments: comments.map((c) => ({
            ...c,
            reportCount: c._count.reports,
            _count: undefined,
          })),
          total,
          page,
          limit,
          pages: Math.ceil(total / limit),
        },
      };
    } catch (err) {
      this.logger.error('listBlockedComments error', err);
      return {
        status: false,
        statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
        message: 'Server error.',
      };
    }
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // MENTIONS
  // ─────────────────────────────────────────────────────────────────────────────

  async getMyMentions(userId: string) {
    try {
      const mentions = await this.prisma.communityMention.findMany({
        where: { mentionedUserId: userId },
        orderBy: { createdAt: 'desc' },
        include: {
          community: {
            select: { id: true, name: true },
          },
          topic: {
            select: {
              id: true,
              title: true,
              body: true,
              communityId: true,
              isBlocked: true,
              createdAt: true,
              author: { select: AUTHOR_SELECT },
            },
          },
          comment: {
            select: {
              id: true,
              body: true,
              topicId: true,
              createdAt: true,
              author: { select: AUTHOR_SELECT },
            },
          },
        },
      });

      // Filter out mentions on blocked topics
      const filtered = mentions.filter((m) => !m.topic?.isBlocked);

      return {
        status: true,
        statusCode: HttpStatus.OK,
        message: 'Mentions retrieved.',
        data: filtered,
      };
    } catch (err) {
      this.logger.error('getMyMentions error', err);
      return {
        status: false,
        statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
        message: 'Server error.',
      };
    }
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // ANALYTICS
  // ─────────────────────────────────────────────────────────────────────────────

  // async getGeneralAnalytics(userId?: string) {
  //   try {
  //     const [
  //       totalCommunities,
  //       myJoinedCommunities,
  //       totalMembers,
  //       totalTopics,
  //       myTopicsCount,
  //       myRepliesPosted,
  //       myRepliesReceived,
  //     ] = await this.prisma.$transaction([
  //       this.prisma.community.count({ where: { isActive: true } }),
  //       this.prisma.communityMembership.count({ where: { userId } }),
  //       this.prisma.communityMembership.count(),
  //       this.prisma.communityTopic.count({ where: { isBlocked: false } }),
  //       this.prisma.communityTopic.count({ where: { authorId: userId } }),
  //       this.prisma.communityComment.count({ where: { authorId: userId } }),
  //       this.prisma.communityComment.count({
  //         where: { topic: { authorId: userId } },
  //       }),
  //     ]);

  //     return {
  //       status: true,
  //       statusCode: HttpStatus.OK,
  //       message: 'General analytics retrieved.',
  //       data: {
  //         totalCommunities,
  //         myJoinedCommunities,
  //         totalMembers,
  //         totalTopics,
  //         myTopicsCount,
  //         myRepliesPosted,
  //         myRepliesReceived,
  //       },
  //     };
  //   } catch (err) {
  //     this.logger.error('getGeneralAnalytics error', err);
  //     return {
  //       status: false,
  //       statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
  //       message: 'Server error.',
  //     };
  //   }
  // }

  async getGeneralAnalytics(userId?: string) {
    try {
      const data = await this.prisma.$transaction(async (tx) => {
        // 1. Always run general counts
        const totalCommunities = await tx.community.count({
          where: { isActive: true },
        });
        const totalMembers = await tx.communityMembership.count();
        const totalTopics = await tx.communityTopic.count({
          where: { isBlocked: false },
        });

        // 2. Run user-specific counts only if userId exists
        let myJoinedCommunities = 0;
        let myTopicsCount = 0;
        let myRepliesPosted = 0;
        let myRepliesReceived = 0;

        if (userId) {
          [
            myJoinedCommunities,
            myTopicsCount,
            myRepliesPosted,
            myRepliesReceived,
          ] = await Promise.all([
            tx.communityMembership.count({ where: { userId } }),
            tx.communityTopic.count({ where: { authorId: userId } }),
            tx.communityComment.count({ where: { authorId: userId } }),
            tx.communityComment.count({
              where: { topic: { authorId: userId } },
            }),
          ]);
        }

        return {
          totalCommunities,
          totalMembers,
          totalTopics,
          myJoinedCommunities,
          myTopicsCount,
          myRepliesPosted,
          myRepliesReceived,
        };
      });

      return {
        status: true,
        statusCode: HttpStatus.OK,
        message: 'General analytics retrieved.',
        data,
      };
    } catch (err) {
      this.logger.error('getGeneralAnalytics error', err);
      return {
        status: false,
        statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
        message: 'Server error.',
      };
    }
  }

  async getCommunityAnalytics(userId: string, communityId: string) {
    try {
      const community = await this.prisma.community.findUnique({
        where: { id: communityId },
      });
      if (!community)
        return {
          status: false,
          statusCode: HttpStatus.NOT_FOUND,
          message: 'Community not found.',
        };

      const [totalMembers, totalTopics, membership] =
        await this.prisma.$transaction([
          this.prisma.communityMembership.count({ where: { communityId } }),
          this.prisma.communityTopic.count({
            where: { communityId, isBlocked: false },
          }),
          this.prisma.communityMembership.findUnique({
            where: { userId_communityId: { userId, communityId } },
          }),
        ]);

      return {
        status: true,
        statusCode: HttpStatus.OK,
        message: 'Community analytics retrieved.',
        data: {
          totalMembers,
          totalTopics,
          onlineMembers: await this.redis.getOnlineCount(communityId),
          dateJoined: membership?.joinedAt ?? null,
        },
      };
    } catch (err) {
      this.logger.error('getCommunityAnalytics error', err);
      return {
        status: false,
        statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
        message: 'Server error.',
      };
    }
  }
}
