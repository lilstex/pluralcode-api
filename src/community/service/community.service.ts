import { Injectable, HttpStatus, Logger } from '@nestjs/common';
import { PrismaService } from 'src/prisma.service';
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
} from '../dto/community.dto';
import { AzureBlobService } from 'src/providers/azure/azure.blob.service';

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

/**
 * Extracts @mention tokens from a body string.
 * Matches words immediately following '@', e.g. "@JaneDoe" → "JaneDoe".
 * Returns a de-duplicated array of raw handle strings.
 */
function extractMentionHandles(body: string): string[] {
  const matches = body.match(/@([\w.]+)/g) ?? [];
  return [...new Set(matches.map((m) => m.slice(1)))];
}

@Injectable()
export class CommunityService {
  private readonly logger = new Logger(CommunityService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly azureBlob: AzureBlobService,
  ) {}

  // ─────────────────────────────────────────────────────────────────────────────
  // HELPERS
  // ─────────────────────────────────────────────────────────────────────────────

  private async resolveMentions(body: string): Promise<string[]> {
    const handles = extractMentionHandles(body);
    if (!handles.length) return [];

    // Match handles against fullName (spaces stripped, case-insensitive)
    const users = await this.prisma.user.findMany({
      where: {
        OR: handles.map((h) => ({
          fullName: {
            equals: h.replace(/\./g, ' '),
            mode: 'insensitive' as const,
          },
        })),
      },
      select: { id: true },
    });

    return users.map((u) => u.id);
  }

  private async saveMentions(
    userIds: string[],
    ref: { topicId?: string; commentId?: string },
  ) {
    if (!userIds.length) return;
    await this.prisma.communityMention.createMany({
      data: userIds.map((mentionedUserId) => ({
        mentionedUserId,
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

  async listCommunities(query: CommunityQueryDto) {
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

      return {
        status: true,
        statusCode: HttpStatus.OK,
        message: 'Communities retrieved.',
        data: {
          communities: communities.map((c) => this.formatCommunity(c)),
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

  private formatCommunity(c: any) {
    return {
      ...c,
      memberCount: c._count?.memberships ?? 0,
      topicCount: c._count?.topics ?? 0,
      _count: undefined,
    };
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // MEMBERSHIP
  // ─────────────────────────────────────────────────────────────────────────────

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

      // We only want non-blocked topics
      const where: any = { isBlocked: false };

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
          orderBy: { createdAt: 'desc' },
          include: {
            ...TOPIC_INCLUDE,
            community: {
              select: {
                id: true,
                name: true,
                imageUrl: true,
              },
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

      // Parse and save @mentions
      const mentionedIds = await this.resolveMentions(dto.body);
      await this.saveMentions(
        mentionedIds.filter((id) => id !== userId),
        { topicId: topic.id },
      );

      return {
        status: true,
        statusCode: HttpStatus.CREATED,
        message: 'Topic created.',
        data: this.formatTopic(topic),
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

  async listTopics(communityId: string, query: TopicQueryDto) {
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
          orderBy: { createdAt: 'desc' },
          include: TOPIC_INCLUDE,
        }),
        this.prisma.communityTopic.count({ where }),
      ]);

      return {
        status: true,
        statusCode: HttpStatus.OK,
        message: 'Topics retrieved.',
        data: {
          topics: topics.map((t) => this.formatTopic(t)),
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

  async getTopic(communityId: string, topicId: string) {
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

      // Re-parse mentions if body changed
      if (dto.body) {
        await this.prisma.communityMention.deleteMany({ where: { topicId } });
        const mentionedIds = await this.resolveMentions(dto.body);
        await this.saveMentions(
          mentionedIds.filter((id) => id !== userId),
          { topicId },
        );
      }

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

  private formatTopic(t: any) {
    return {
      ...t,
      commentCount: t._count?.comments ?? 0,
      _count: undefined,
    };
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

      const comment = await this.prisma.communityComment.create({
        data: {
          body: dto.body,
          topicId,
          authorId: userId,
          parentId: dto.parentId ?? null,
        },
        include: {
          author: { select: AUTHOR_SELECT },
          replies: { include: { author: { select: AUTHOR_SELECT } } },
        },
      });

      // Parse @mentions
      const mentionedIds = await this.resolveMentions(dto.body);
      await this.saveMentions(
        mentionedIds.filter((id) => id !== userId),
        { commentId: comment.id },
      );

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

      const updated = await this.prisma.communityComment.update({
        where: { id: commentId },
        data: { body: dto.body },
        include: {
          author: { select: AUTHOR_SELECT },
          replies: { include: { author: { select: AUTHOR_SELECT } } },
        },
      });

      // Re-parse mentions
      await this.prisma.communityMention.deleteMany({ where: { commentId } });
      const mentionedIds = await this.resolveMentions(dto.body);
      await this.saveMentions(
        mentionedIds.filter((id) => id !== userId),
        { commentId },
      );

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
  // MENTIONS
  // ─────────────────────────────────────────────────────────────────────────────

  async getMyMentions(userId: string) {
    try {
      const mentions = await this.prisma.communityMention.findMany({
        where: { mentionedUserId: userId },
        orderBy: { createdAt: 'desc' },
        include: {
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

  async getGeneralAnalytics(userId: string) {
    try {
      const [
        totalCommunities,
        myJoinedCommunities,
        totalMembers,
        totalTopics,
        myTopicsCount,
        myRepliesPosted,
        myRepliesReceived,
      ] = await this.prisma.$transaction([
        this.prisma.community.count({ where: { isActive: true } }),
        this.prisma.communityMembership.count({ where: { userId } }),
        this.prisma.communityMembership.count(),
        this.prisma.communityTopic.count({ where: { isBlocked: false } }),
        this.prisma.communityTopic.count({ where: { authorId: userId } }),
        this.prisma.communityComment.count({ where: { authorId: userId } }),
        this.prisma.communityComment.count({
          where: { topic: { authorId: userId } },
        }),
      ]);

      return {
        status: true,
        statusCode: HttpStatus.OK,
        message: 'General analytics retrieved.',
        data: {
          totalCommunities,
          myJoinedCommunities,
          totalMembers,
          totalTopics,
          myTopicsCount,
          myRepliesPosted,
          myRepliesReceived,
        },
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
          onlineMembers: null, // Requires WebSocket/Redis presence layer
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
