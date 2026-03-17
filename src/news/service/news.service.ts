import { Injectable, HttpStatus, Logger } from '@nestjs/common';
import { PrismaService } from 'src/prisma.service';
import {
  CreateNewsPostDto,
  UpdateNewsPostDto,
  NewsQueryDto,
  AdminNewsQueryDto,
} from '../dto/news.dto';
import { AzureBlobService } from 'src/providers/azure/azure.blob.service';

// ─────────────────────────────────────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────────────────────────────────────

const AUTHOR_SELECT = { id: true, fullName: true, avatarUrl: true } as const;

/** Strip HTML tags and truncate to maxLength characters */
function deriveExcerpt(body: string, maxLength = 200): string {
  const plain = body
    .replace(/<[^>]*>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return plain.length <= maxLength
    ? plain
    : `${plain.slice(0, maxLength).trimEnd()}…`;
}

/** Convert title to URL-safe slug: "NGO Summit 2025!" → "ngo-summit-2025" */
function slugify(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-');
}

@Injectable()
export class NewsService {
  private readonly logger = new Logger(NewsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly azureBlob: AzureBlobService,
  ) {}

  // ─────────────────────────────────────────────────────────────────────────────
  // HELPERS
  // ─────────────────────────────────────────────────────────────────────────────

  private safePaginate(page: any, limit: any) {
    const p = Math.max(1, parseInt(String(page ?? '1'), 10) || 1);
    const l = Math.min(
      100,
      Math.max(1, parseInt(String(limit ?? '20'), 10) || 20),
    );
    return { page: p, limit: l, skip: (p - 1) * l };
  }

  /** Resolve a unique slug for a given title, appending -2/-3 on collisions */
  private async resolveSlug(
    title: string,
    excludeId?: string,
  ): Promise<string> {
    const base = slugify(title);
    let candidate = base;
    let counter = 1;

    while (true) {
      const existing = await this.prisma.newsPost.findUnique({
        where: { slug: candidate },
      });
      if (!existing || existing.id === excludeId) return candidate;
      counter += 1;
      candidate = `${base}-${counter}`;
    }
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // CREATE
  // ─────────────────────────────────────────────────────────────────────────────

  async createPost(authorId: string, dto: CreateNewsPostDto) {
    try {
      const slug = await this.resolveSlug(dto.title);
      const excerpt = dto.excerpt ?? deriveExcerpt(dto.body);

      const post = await this.prisma.newsPost.create({
        data: {
          title: dto.title,
          slug,
          type: dto.type,
          body: dto.body,
          excerpt,
          status: 'DRAFT',
          tags: dto.tags ?? [],
          authorId,
        },
        include: { author: { select: AUTHOR_SELECT } },
      });

      return {
        status: true,
        statusCode: HttpStatus.CREATED,
        message: 'News post created.',
        data: post,
      };
    } catch (error) {
      this.logger.error('createPost error', error);
      return {
        status: false,
        statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
        message: 'Server error.',
      };
    }
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // UPDATE
  // ─────────────────────────────────────────────────────────────────────────────

  async updatePost(id: string, dto: UpdateNewsPostDto) {
    try {
      const post = await this.prisma.newsPost.findUnique({ where: { id } });
      if (!post)
        return {
          status: false,
          statusCode: HttpStatus.NOT_FOUND,
          message: 'Post not found.',
        };

      // Derive excerpt from new body if body changed but excerpt not provided
      let excerpt = dto.excerpt;
      if (dto.body && !dto.excerpt) excerpt = deriveExcerpt(dto.body);

      const updated = await this.prisma.newsPost.update({
        where: { id },
        data: {
          // Slug is intentionally NOT updated when title changes — keeps URLs stable
          ...(dto.title !== undefined && { title: dto.title }),
          ...(dto.type !== undefined && { type: dto.type }),
          ...(dto.body !== undefined && { body: dto.body }),
          ...(excerpt !== undefined && { excerpt }),
          ...(dto.tags !== undefined && { tags: dto.tags }),
        },
        include: { author: { select: AUTHOR_SELECT } },
      });

      return {
        status: true,
        statusCode: HttpStatus.OK,
        message: 'Post updated.',
        data: updated,
      };
    } catch (error) {
      this.logger.error('updatePost error', error);
      return {
        status: false,
        statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
        message: 'Server error.',
      };
    }
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // PUBLISH / ARCHIVE SHORTCUTS
  // ─────────────────────────────────────────────────────────────────────────────

  async publishPost(id: string) {
    try {
      const post = await this.prisma.newsPost.findUnique({ where: { id } });
      if (!post)
        return {
          status: false,
          statusCode: HttpStatus.NOT_FOUND,
          message: 'Post not found.',
        };

      const updated = await this.prisma.newsPost.update({
        where: { id },
        data: {
          status: 'PUBLISHED',
          publishedAt: post.publishedAt ?? new Date(),
        },
        include: { author: { select: AUTHOR_SELECT } },
      });

      return {
        status: true,
        statusCode: HttpStatus.OK,
        message: 'Post published.',
        data: updated,
      };
    } catch (error) {
      this.logger.error('publishPost error', error);
      return {
        status: false,
        statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
        message: 'Server error.',
      };
    }
  }

  async archivePost(id: string) {
    try {
      const post = await this.prisma.newsPost.findUnique({ where: { id } });
      if (!post)
        return {
          status: false,
          statusCode: HttpStatus.NOT_FOUND,
          message: 'Post not found.',
        };

      const updated = await this.prisma.newsPost.update({
        where: { id },
        data: { status: 'ARCHIVED' },
        include: { author: { select: AUTHOR_SELECT } },
      });

      return {
        status: true,
        statusCode: HttpStatus.OK,
        message: 'Post archived.',
        data: updated,
      };
    } catch (error) {
      this.logger.error('archivePost error', error);
      return {
        status: false,
        statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
        message: 'Server error.',
      };
    }
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // THUMBNAIL UPLOAD
  // ─────────────────────────────────────────────────────────────────────────────

  async uploadThumbnail(id: string, file: Express.Multer.File) {
    try {
      const post = await this.prisma.newsPost.findUnique({ where: { id } });
      if (!post)
        return {
          status: false,
          statusCode: HttpStatus.NOT_FOUND,
          message: 'Post not found.',
        };

      if (post.thumbnailUrl) {
        await this.azureBlob
          .delete(post.thumbnailUrl, 'news')
          .catch(() => null);
      }

      const thumbnailUrl = await this.azureBlob.upload(file, 'news');

      await this.prisma.newsPost.update({
        where: { id },
        data: { thumbnailUrl },
      });

      return {
        status: true,
        statusCode: HttpStatus.OK,
        message: 'Thumbnail uploaded.',
        thumbnailUrl,
      };
    } catch (error) {
      this.logger.error('uploadThumbnail error', error);
      return {
        status: false,
        statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
        message: 'Server error.',
      };
    }
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // ATTACHMENTS — ADD
  // ─────────────────────────────────────────────────────────────────────────────

  async addAttachments(id: string, files: Express.Multer.File[]) {
    try {
      const post = await this.prisma.newsPost.findUnique({ where: { id } });
      if (!post)
        return {
          status: false,
          statusCode: HttpStatus.NOT_FOUND,
          message: 'Post not found.',
        };

      const existing: any[] = Array.isArray(post.attachments)
        ? (post.attachments as any[])
        : [];

      const uploaded = await Promise.all(
        files.map(async (file) => {
          const url = await this.azureBlob.upload(file, 'news-attachments');
          return { name: file.originalname, url, size: file.size };
        }),
      );

      const attachments = [...existing, ...uploaded];

      await this.prisma.newsPost.update({
        where: { id },
        data: { attachments },
      });

      return {
        status: true,
        statusCode: HttpStatus.OK,
        message: `${files.length} attachment(s) uploaded.`,
        attachments,
      };
    } catch (error) {
      this.logger.error('addAttachments error', error);
      return {
        status: false,
        statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
        message: 'Server error.',
      };
    }
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // ATTACHMENTS — DELETE
  // ─────────────────────────────────────────────────────────────────────────────

  async deleteAttachment(id: string, attachmentIndex: number) {
    try {
      const post = await this.prisma.newsPost.findUnique({ where: { id } });
      if (!post)
        return {
          status: false,
          statusCode: HttpStatus.NOT_FOUND,
          message: 'Post not found.',
        };

      const attachments: any[] = Array.isArray(post.attachments)
        ? (post.attachments as any[])
        : [];

      if (attachmentIndex < 0 || attachmentIndex >= attachments.length) {
        return {
          status: false,
          statusCode: HttpStatus.BAD_REQUEST,
          message: `Attachment index ${attachmentIndex} is out of range (post has ${attachments.length} attachment(s)).`,
        };
      }

      const [removed] = attachments.splice(attachmentIndex, 1);

      await this.azureBlob
        .delete(removed.url, 'news-attachments')
        .catch(() => null);
      await this.prisma.newsPost.update({
        where: { id },
        data: { attachments },
      });

      return {
        status: true,
        statusCode: HttpStatus.OK,
        message: 'Attachment deleted.',
        attachments,
      };
    } catch (error) {
      this.logger.error('deleteAttachment error', error);
      return {
        status: false,
        statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
        message: 'Server error.',
      };
    }
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // DELETE POST
  // ─────────────────────────────────────────────────────────────────────────────

  async deletePost(id: string) {
    try {
      const post = await this.prisma.newsPost.findUnique({ where: { id } });
      if (!post)
        return {
          status: false,
          statusCode: HttpStatus.NOT_FOUND,
          message: 'Post not found.',
        };

      // Clean up Azure assets
      if (post.thumbnailUrl) {
        await this.azureBlob
          .delete(post.thumbnailUrl, 'news')
          .catch(() => null);
      }

      const attachments: any[] = Array.isArray(post.attachments)
        ? (post.attachments as any[])
        : [];
      await Promise.allSettled(
        attachments.map((a) =>
          this.azureBlob.delete(a.url, 'news-attachments'),
        ),
      );

      await this.prisma.newsPost.delete({ where: { id } });

      return {
        status: true,
        statusCode: HttpStatus.OK,
        message: 'Post deleted.',
      };
    } catch (error) {
      this.logger.error('deletePost error', error);
      return {
        status: false,
        statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
        message: 'Server error.',
      };
    }
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // LIST — PUBLIC (PUBLISHED only)
  // ─────────────────────────────────────────────────────────────────────────────

  async listPosts(query: NewsQueryDto) {
    try {
      const { page, limit, skip } = this.safePaginate(query.page, query.limit);

      const where: any = { status: 'PUBLISHED' };

      if (query.type) where.type = { equals: query.type, mode: 'insensitive' };
      if (query.search) {
        where.OR = [
          { title: { contains: query.search, mode: 'insensitive' } },
          { excerpt: { contains: query.search, mode: 'insensitive' } },
          { body: { contains: query.search, mode: 'insensitive' } },
        ];
      }
      if (query.tags) {
        const tagList = query.tags
          .split(',')
          .map((t) => t.trim())
          .filter(Boolean);
        if (tagList.length) where.tags = { hasSome: tagList };
      }
      if (query.dateFrom || query.dateTo) {
        where.publishedAt = {};
        if (query.dateFrom) where.publishedAt.gte = new Date(query.dateFrom);
        if (query.dateTo) where.publishedAt.lte = new Date(query.dateTo);
      }

      const orderBy =
        query.orderBy === 'popular'
          ? { viewCount: 'desc' as const }
          : { publishedAt: 'desc' as const };

      const [posts, total] = await this.prisma.$transaction([
        this.prisma.newsPost.findMany({
          where,
          skip,
          take: limit,
          orderBy,
          include: { author: { select: AUTHOR_SELECT } },
        }),
        this.prisma.newsPost.count({ where }),
      ]);

      return {
        status: true,
        statusCode: HttpStatus.OK,
        message: 'Posts retrieved.',
        data: { posts, total, page, limit, pages: Math.ceil(total / limit) },
      };
    } catch (error) {
      this.logger.error('listPosts error', error);
      return {
        status: false,
        statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
        message: 'Server error.',
      };
    }
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // LIST — ADMIN (all statuses)
  // ─────────────────────────────────────────────────────────────────────────────

  async adminListPosts(query: AdminNewsQueryDto) {
    try {
      const { page, limit, skip } = this.safePaginate(query.page, query.limit);

      const where: any = {};

      if (query.status) where.status = query.status;
      if (query.type) where.type = { equals: query.type, mode: 'insensitive' };
      if (query.search) {
        where.OR = [
          { title: { contains: query.search, mode: 'insensitive' } },
          { excerpt: { contains: query.search, mode: 'insensitive' } },
          { body: { contains: query.search, mode: 'insensitive' } },
        ];
      }
      if (query.tags) {
        const tagList = query.tags
          .split(',')
          .map((t) => t.trim())
          .filter(Boolean);
        if (tagList.length) where.tags = { hasSome: tagList };
      }
      if (query.dateFrom || query.dateTo) {
        where.publishedAt = {};
        if (query.dateFrom) where.publishedAt.gte = new Date(query.dateFrom);
        if (query.dateTo) where.publishedAt.lte = new Date(query.dateTo);
      }

      const orderBy =
        query.orderBy === 'popular'
          ? { viewCount: 'desc' as const }
          : { createdAt: 'desc' as const };

      const [posts, total] = await this.prisma.$transaction([
        this.prisma.newsPost.findMany({
          where,
          skip,
          take: limit,
          orderBy,
          include: { author: { select: AUTHOR_SELECT } },
        }),
        this.prisma.newsPost.count({ where }),
      ]);

      return {
        status: true,
        statusCode: HttpStatus.OK,
        message: 'Posts retrieved.',
        data: { posts, total, page, limit, pages: Math.ceil(total / limit) },
      };
    } catch (error) {
      this.logger.error('adminListPosts error', error);
      return {
        status: false,
        statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
        message: 'Server error.',
      };
    }
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // GET SINGLE (by UUID or slug) — public, PUBLISHED only
  // ─────────────────────────────────────────────────────────────────────────────

  async getPost(identifier: string) {
    try {
      // UUID pattern check
      const isUuid =
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
          identifier,
        );

      const post = await this.prisma.newsPost.findFirst({
        where: {
          ...(isUuid ? { id: identifier } : { slug: identifier }),
          status: 'PUBLISHED',
        },
        include: { author: { select: AUTHOR_SELECT } },
      });

      if (!post)
        return {
          status: false,
          statusCode: HttpStatus.NOT_FOUND,
          message: 'Post not found.',
        };

      // Increment view count (fire-and-forget — don't await)
      this.prisma.newsPost
        .update({
          where: { id: post.id },
          data: { viewCount: { increment: 1 } },
        })
        .catch(() => null);

      return {
        status: true,
        statusCode: HttpStatus.OK,
        message: 'Post retrieved.',
        data: post,
      };
    } catch (error) {
      this.logger.error('getPost error', error);
      return {
        status: false,
        statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
        message: 'Server error.',
      };
    }
  }
}
