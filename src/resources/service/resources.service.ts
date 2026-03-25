/* eslint-disable @typescript-eslint/no-unused-vars */
import { Injectable, HttpStatus, Logger } from '@nestjs/common';
import { PrismaService } from 'src/prisma.service';
import { AzureBlobService } from 'src/providers/azure/azure.blob.service';
import {
  CreateResourceDto,
  UpdateResourceDto,
  ResourceQueryDto,
  CreateCategoryDto,
  UpdateCategoryDto,
  CreateTagDto,
  CreateBadgeDto,
} from '../dto/resources.dto';
import { OcrService } from './ocr.service';
import { RewardsService } from 'src/reward/service/reward.service';
import { NotificationsService } from 'src/notifications/service/notifications.service';
import { NotificationType } from '@prisma/client';

const EXTRACTABLE_MIMETYPES = new Set([
  'application/pdf',
  'text/plain',
  'text/csv',
  'text/html',
]);

@Injectable()
export class ResourceService {
  private readonly logger = new Logger(ResourceService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly azureBlob: AzureBlobService,
    private readonly ocr: OcrService,
    private readonly rewards: RewardsService,
    private readonly notifications: NotificationsService,
  ) {}

  // ─────────────────────────────────────────────────────────────────────────────
  // BADGE LIBRARY (Super Admin manages the badge catalogue)
  // ─────────────────────────────────────────────────────────────────────────────

  async createBadge(
    adminId: string,
    dto: CreateBadgeDto,
    file: Express.Multer.File,
  ) {
    try {
      const existing = await this.prisma.badge.findUnique({
        where: { name: dto.name },
      });
      if (existing) {
        return {
          status: false,
          statusCode: HttpStatus.CONFLICT,
          message: 'A badge with this name already exists.',
        };
      }

      const imageUrl = await this.azureBlob.upload(file, 'avatars');

      const badge = await this.prisma.badge.create({
        data: { name: dto.name, imageUrl, externalSource: false },
      });

      await this.prisma.auditLog.create({
        data: {
          action: 'BADGE_CREATED',
          entity: 'Badge',
          entityId: badge.id,
          adminId,
        },
      });

      return {
        status: true,
        statusCode: HttpStatus.CREATED,
        message: 'Badge created.',
        data: badge,
      };
    } catch (error) {
      this.logger.error('createBadge error', error);
      return {
        status: false,
        statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
        message: 'Server error.',
      };
    }
  }

  async listBadges() {
    try {
      const badges = await this.prisma.badge.findMany({
        orderBy: { name: 'asc' },
        select: { id: true, name: true, imageUrl: true, createdAt: true },
      });
      return {
        status: true,
        statusCode: HttpStatus.OK,
        message: 'Badges retrieved.',
        data: badges,
      };
    } catch (error) {
      this.logger.error('listBadges error', error);
      return {
        status: false,
        statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
        message: 'Server error.',
      };
    }
  }

  async deleteBadge(adminId: string, id: string) {
    try {
      const badge = await this.prisma.badge.findUnique({ where: { id } });
      if (!badge) {
        return {
          status: false,
          statusCode: HttpStatus.NOT_FOUND,
          message: 'Badge not found.',
        };
      }

      // Delete image from Azure
      if (badge.imageUrl) {
        await this.azureBlob.delete(badge.imageUrl, 'avatars');
      }

      await this.prisma.badge.delete({ where: { id } });

      await this.prisma.auditLog.create({
        data: {
          action: 'BADGE_DELETED',
          entity: 'Badge',
          entityId: id,
          adminId,
        },
      });

      return {
        status: true,
        statusCode: HttpStatus.OK,
        message: 'Badge deleted.',
      };
    } catch (error) {
      this.logger.error('deleteBadge error', error);
      return {
        status: false,
        statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
        message: 'Server error.',
      };
    }
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // TAXONOMY — CATEGORIES
  // ─────────────────────────────────────────────────────────────────────────────

  async createCategory(adminId: string, dto: CreateCategoryDto) {
    try {
      if (dto.parentId) {
        const parent = await this.prisma.category.findUnique({
          where: { id: dto.parentId },
        });
        if (!parent) {
          return {
            status: false,
            statusCode: HttpStatus.NOT_FOUND,
            message: 'Parent category not found.',
          };
        }
      }

      const existing = await this.prisma.category.findUnique({
        where: { name: dto.name },
      });
      if (existing) {
        return {
          status: false,
          statusCode: HttpStatus.CONFLICT,
          message: 'A category with this name already exists.',
        };
      }

      const category = await this.prisma.category.create({
        data: { name: dto.name, parentId: dto.parentId ?? null },
        include: { parent: true, children: true },
      });

      await this.prisma.auditLog.create({
        data: {
          action: 'CATEGORY_CREATED',
          entity: 'Category',
          entityId: category.id,
          adminId,
        },
      });

      return {
        status: true,
        statusCode: HttpStatus.CREATED,
        message: 'Category created.',
        data: category,
      };
    } catch (error) {
      this.logger.error('createCategory error', error);
      return {
        status: false,
        statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
        message: 'Server error.',
      };
    }
  }

  async listCategories() {
    try {
      const categories = await this.prisma.category.findMany({
        where: { parentId: null },
        include: { children: { include: { children: true } } },
        orderBy: { name: 'asc' },
      });
      return {
        status: true,
        statusCode: HttpStatus.OK,
        message: 'Categories retrieved.',
        data: categories,
      };
    } catch (error) {
      this.logger.error('listCategories error', error);
      return {
        status: false,
        statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
        message: 'Server error.',
      };
    }
  }

  async updateCategory(adminId: string, id: string, dto: UpdateCategoryDto) {
    try {
      const category = await this.prisma.category.findUnique({ where: { id } });
      if (!category) {
        return {
          status: false,
          statusCode: HttpStatus.NOT_FOUND,
          message: 'Category not found.',
        };
      }
      if (dto.parentId === id) {
        return {
          status: false,
          statusCode: HttpStatus.BAD_REQUEST,
          message: 'A category cannot be its own parent.',
        };
      }

      const updated = await this.prisma.category.update({
        where: { id },
        data: { ...dto },
        include: { parent: true, children: true },
      });

      await this.prisma.auditLog.create({
        data: {
          action: 'CATEGORY_UPDATED',
          entity: 'Category',
          entityId: id,
          adminId,
        },
      });

      return {
        status: true,
        statusCode: HttpStatus.OK,
        message: 'Category updated.',
        data: updated,
      };
    } catch (error) {
      this.logger.error('updateCategory error', error);
      return {
        status: false,
        statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
        message: 'Server error.',
      };
    }
  }

  async deleteCategory(adminId: string, id: string) {
    try {
      const category = await this.prisma.category.findUnique({
        where: { id },
        include: { _count: { select: { resources: true, children: true } } },
      });
      if (!category) {
        return {
          status: false,
          statusCode: HttpStatus.NOT_FOUND,
          message: 'Category not found.',
        };
      }
      if (category._count.resources > 0) {
        return {
          status: false,
          statusCode: HttpStatus.BAD_REQUEST,
          message: `Cannot delete: ${category._count.resources} resource(s) assigned. Reassign them first.`,
        };
      }
      if (category._count.children > 0) {
        return {
          status: false,
          statusCode: HttpStatus.BAD_REQUEST,
          message: `Cannot delete: this category has ${category._count.children} sub-category(ies).`,
        };
      }

      await this.prisma.category.delete({ where: { id } });
      await this.prisma.auditLog.create({
        data: {
          action: 'CATEGORY_DELETED',
          entity: 'Category',
          entityId: id,
          adminId,
        },
      });

      return {
        status: true,
        statusCode: HttpStatus.OK,
        message: 'Category deleted.',
      };
    } catch (error) {
      this.logger.error('deleteCategory error', error);
      return {
        status: false,
        statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
        message: 'Server error.',
      };
    }
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // TAXONOMY — TAGS
  // ─────────────────────────────────────────────────────────────────────────────

  async createTag(adminId: string, dto: CreateTagDto) {
    try {
      const existing = await this.prisma.tag.findUnique({
        where: { name: dto.name },
      });
      if (existing) {
        return {
          status: false,
          statusCode: HttpStatus.CONFLICT,
          message: 'Tag already exists.',
        };
      }
      const tag = await this.prisma.tag.create({ data: { name: dto.name } });
      await this.prisma.auditLog.create({
        data: {
          action: 'TAG_CREATED',
          entity: 'Tag',
          entityId: tag.id,
          adminId,
        },
      });
      return {
        status: true,
        statusCode: HttpStatus.CREATED,
        message: 'Tag created.',
        data: tag,
      };
    } catch (error) {
      this.logger.error('createTag error', error);
      return {
        status: false,
        statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
        message: 'Server error.',
      };
    }
  }

  async listTags() {
    try {
      const tags = await this.prisma.tag.findMany({ orderBy: { name: 'asc' } });
      return {
        status: true,
        statusCode: HttpStatus.OK,
        message: 'Tags retrieved.',
        data: tags,
      };
    } catch (error) {
      this.logger.error('listTags error', error);
      return {
        status: false,
        statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
        message: 'Server error.',
      };
    }
  }

  async deleteTag(adminId: string, id: string) {
    try {
      const tag = await this.prisma.tag.findUnique({ where: { id } });
      if (!tag) {
        return {
          status: false,
          statusCode: HttpStatus.NOT_FOUND,
          message: 'Tag not found.',
        };
      }
      await this.prisma.tag.delete({ where: { id } });
      await this.prisma.auditLog.create({
        data: { action: 'TAG_DELETED', entity: 'Tag', entityId: id, adminId },
      });
      return {
        status: true,
        statusCode: HttpStatus.OK,
        message: 'Tag deleted.',
      };
    } catch (error) {
      this.logger.error('deleteTag error', error);
      return {
        status: false,
        statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
        message: 'Server error.',
      };
    }
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // RESOURCES — CREATE
  // ─────────────────────────────────────────────────────────────────────────────

  async createResource(
    adminId: string,
    dto: CreateResourceDto,
    file?: Express.Multer.File,
  ) {
    try {
      const category = await this.prisma.category.findUnique({
        where: { id: dto.categoryId },
      });
      if (!category) {
        return {
          status: false,
          statusCode: HttpStatus.NOT_FOUND,
          message: 'Category not found.',
        };
      }

      if (dto.tagIds?.length) {
        const foundTags = await this.prisma.tag.findMany({
          where: { id: { in: dto.tagIds } },
        });
        if (foundTags.length !== dto.tagIds.length) {
          return {
            status: false,
            statusCode: HttpStatus.BAD_REQUEST,
            message: 'One or more tag IDs are invalid.',
          };
        }
      }

      if (dto.badgeId) {
        const badge = await this.prisma.badge.findUnique({
          where: { id: dto.badgeId },
        });
        if (!badge) {
          return {
            status: false,
            statusCode: HttpStatus.NOT_FOUND,
            message: 'Badge not found.',
          };
        }
      }

      let contentUrl: string | null = null;
      let rawText: string | null = null;
      let fileSize: number | null = null;

      if (dto.type === 'ARTICLE') {
        rawText = dto.articleBody ?? null;
      } else if (dto.type === 'VIDEO' && dto.externalUrl) {
        contentUrl = dto.externalUrl;
      } else if (file) {
        contentUrl = await this.azureBlob.upload(file, 'resources');
        fileSize = file.size;

        if (EXTRACTABLE_MIMETYPES.has(file.mimetype)) {
          rawText = await this.ocr.extractText(file.buffer, file.mimetype);
        }
      } else {
        return {
          status: false,
          statusCode: HttpStatus.BAD_REQUEST,
          message:
            'A file upload or external URL is required for this resource type.',
        };
      }

      const resource = await this.prisma.resource.create({
        data: {
          title: dto.title,
          description: dto.description,
          type: dto.type,
          contentUrl,
          rawText,
          fileSize,
          author: dto.author,
          language: dto.language,
          region: dto.region,
          sector: dto.sector,
          points: dto.points ?? 0,
          categoryId: dto.categoryId,
          badgeId: dto.badgeId ?? null,
          tags: dto.tagIds?.length
            ? { connect: dto.tagIds.map((id) => ({ id })) }
            : undefined,
        },
        include: {
          category: true,
          tags: true,
          badge: { select: { id: true, name: true, imageUrl: true } },
        },
      });

      await this.prisma.auditLog.create({
        data: {
          action: 'RESOURCE_CREATED',
          entity: 'Resource',
          entityId: resource.id,
          details: { title: resource.title, type: resource.type } as any,
          adminId,
        },
      });

      return {
        status: true,
        statusCode: HttpStatus.CREATED,
        message: 'Resource created.',
        data: resource,
      };
    } catch (error) {
      this.logger.error('createResource error', error);
      return {
        status: false,
        statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
        message: 'Server error.',
      };
    }
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // RESOURCES — LIST (full-text + faceted filters including format + tag)
  // ─────────────────────────────────────────────────────────────────────────────

  async listResources(
    query: ResourceQueryDto,
    isAuthenticated: boolean,
    userId?: string,
  ) {
    try {
      const page = Math.max(1, parseInt(String(query.page ?? '1'), 10) || 1);
      const limit = Math.min(
        100,
        Math.max(1, parseInt(String(query.limit ?? '20'), 10) || 20),
      );
      const skip = (page - 1) * limit;

      const where: any = {};

      // Category filter — include the category itself AND all its direct children
      // so filtering by a parent category also returns resources in sub-categories.
      if (query.categoryId) {
        const children = await this.prisma.category.findMany({
          where: { parentId: query.categoryId },
          select: { id: true },
        });
        const categoryIds = [query.categoryId, ...children.map((c) => c.id)];
        where.categoryId = { in: categoryIds };
      }
      if (query.type) where.type = query.type; // format filter
      if (query.sector)
        where.sector = { contains: query.sector, mode: 'insensitive' };
      if (query.region)
        where.region = { contains: query.region, mode: 'insensitive' };
      if (query.language) where.language = query.language;

      // Tag filter — filter by a single tag UUID via the many-to-many relation
      if (query.tagId) {
        where.tags = { some: { id: query.tagId } };
      }

      if (query.dateFrom || query.dateTo) {
        where.createdAt = {};
        if (query.dateFrom) where.createdAt.gte = new Date(query.dateFrom);
        if (query.dateTo) where.createdAt.lte = new Date(query.dateTo);
      }

      if (query.search) {
        where.OR = [
          { title: { contains: query.search, mode: 'insensitive' } },
          { description: { contains: query.search, mode: 'insensitive' } },
          { author: { contains: query.search, mode: 'insensitive' } },
          { rawText: { contains: query.search, mode: 'insensitive' } },
        ];
      }

      const [resources, total] = await this.prisma.$transaction([
        this.prisma.resource.findMany({
          where,
          skip,
          take: limit,
          include: {
            category: { select: { id: true, name: true } },
            tags: { select: { id: true, name: true } },
            badge: { select: { id: true, name: true, imageUrl: true } },
            _count: { select: { downloads: true } },
          },
          orderBy: { createdAt: 'desc' },
        }),
        this.prisma.resource.count({ where }),
      ]);

      const sanitized = resources.map(({ rawText, ...r }: any) => ({
        ...r,
        downloadCount: r._count.downloads,
        _count: undefined,
        contentUrl: isAuthenticated ? r.contentUrl : null,
        requiresLogin: !isAuthenticated,
      }));

      // Attach per-resource view/completion state for authenticated users
      if (isAuthenticated && userId) {
        const resourceIds = sanitized.map((r: any) => r.id);

        const [views, completions] = await Promise.all([
          this.prisma.resourceView.findMany({
            where: { userId, resourceId: { in: resourceIds } },
            select: { resourceId: true },
          }),
          this.prisma.resourceCompletion.findMany({
            where: { userId, resourceId: { in: resourceIds } },
            select: { resourceId: true },
          }),
        ]);

        const viewedSet = new Set(views.map((v: any) => v.resourceId));
        const completedSet = new Set(completions.map((c: any) => c.resourceId));

        sanitized.forEach((r: any) => {
          r.hasViewed = viewedSet.has(r.id);
          r.hasCompleted = completedSet.has(r.id);
          r.canComplete = r.hasViewed && !r.hasCompleted;
        });
      }

      return {
        status: true,
        statusCode: HttpStatus.OK,
        message: 'Resources retrieved.',
        data: {
          resources: sanitized,
          total,
          page,
          limit,
          pages: Math.ceil(total / limit),
        },
      };
    } catch (error) {
      this.logger.error('listResources error', error);
      return {
        status: false,
        statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
        message: 'Server error.',
      };
    }
  }

  async getResource(id: string, isAuthenticated: boolean, userId?: string) {
    try {
      const resource = await this.prisma.resource.findUnique({
        where: { id },
        include: {
          category: { include: { parent: true } },
          tags: true,
          badge: { select: { id: true, name: true, imageUrl: true } },
          _count: { select: { downloads: true } },
        },
      });

      if (!resource) {
        return {
          status: false,
          statusCode: HttpStatus.NOT_FOUND,
          message: 'Resource not found.',
        };
      }

      const { rawText, ...safeResource } = resource as any;

      // Fetch view/completion state for authenticated users
      let hasViewed = false;
      let hasCompleted = false;

      if (userId) {
        const [view, completion] = await this.prisma.$transaction([
          this.prisma.resourceView.findUnique({
            where: { userId_resourceId: { userId, resourceId: id } },
          }),
          this.prisma.resourceCompletion.findUnique({
            where: { userId_resourceId: { userId, resourceId: id } },
          }),
        ]);
        hasViewed = !!view;
        hasCompleted = !!completion;
      }

      return {
        status: true,
        statusCode: HttpStatus.OK,
        message: 'Resource retrieved.',
        data: {
          ...safeResource,
          downloadCount: safeResource._count.downloads,
          _count: undefined,
          contentUrl: isAuthenticated ? safeResource.contentUrl : null,
          requiresLogin: !isAuthenticated,
          hasViewed,
          hasCompleted,
          canComplete: hasViewed && !hasCompleted,
        },
      };
    } catch (error) {
      this.logger.error('getResource error', error);
      return {
        status: false,
        statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
        message: 'Server error.',
      };
    }
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // RESOURCES — DOWNLOAD (file URL only — no points/badge)
  // ─────────────────────────────────────────────────────────────────────────────

  async downloadResource(resourceId: string, userId: string) {
    try {
      const resource = await this.prisma.resource.findUnique({
        where: { id: resourceId },
      });

      if (!resource) {
        return {
          status: false,
          statusCode: HttpStatus.NOT_FOUND,
          message: 'Resource not found.',
        };
      }

      if (!resource.contentUrl) {
        return {
          status: false,
          statusCode: HttpStatus.BAD_REQUEST,
          message: 'This resource has no downloadable file.',
        };
      }

      await this.prisma.downloadLog.create({ data: { userId, resourceId } });

      return {
        status: true,
        statusCode: HttpStatus.OK,
        message: 'Download recorded.',
        downloadUrl: resource.contentUrl,
      };
    } catch (error) {
      this.logger.error('downloadResource error', error);
      return {
        status: false,
        statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
        message: 'Server error.',
      };
    }
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // RESOURCES — VIEW (unlocks the complete button)
  // ─────────────────────────────────────────────────────────────────────────────

  async viewResource(resourceId: string, userId: string) {
    try {
      const resource = await this.prisma.resource.findUnique({
        where: { id: resourceId },
      });
      if (!resource) {
        return {
          status: false,
          statusCode: HttpStatus.NOT_FOUND,
          message: 'Resource not found.',
        };
      }

      // Upsert — idempotent, calling view multiple times is harmless
      await this.prisma.resourceView.upsert({
        where: { userId_resourceId: { userId, resourceId } },
        create: { userId, resourceId },
        update: {}, // already viewed — no-op
      });

      return {
        status: true,
        statusCode: HttpStatus.OK,
        message: 'Resource marked as viewed. Complete button is now enabled.',
        canComplete: true,
      };
    } catch (error) {
      this.logger.error('viewResource error', error);
      return {
        status: false,
        statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
        message: 'Server error.',
      };
    }
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // RESOURCES — COMPLETE (awards points + badge, once per user per resource)
  // ─────────────────────────────────────────────────────────────────────────────

  async completeResource(resourceId: string, userId: string) {
    try {
      const resource = await this.prisma.resource.findUnique({
        where: { id: resourceId },
        include: { badge: { select: { id: true, name: true } } },
      });
      if (!resource) {
        return {
          status: false,
          statusCode: HttpStatus.NOT_FOUND,
          message: 'Resource not found.',
        };
      }

      // Must have viewed the resource first
      const view = await this.prisma.resourceView.findUnique({
        where: { userId_resourceId: { userId, resourceId } },
      });
      if (!view) {
        return {
          status: false,
          statusCode: HttpStatus.FORBIDDEN,
          message: 'You must view this resource before marking it as complete.',
        };
      }

      // Idempotent guard — already completed
      const existing = await this.prisma.resourceCompletion.findUnique({
        where: { userId_resourceId: { userId, resourceId } },
      });
      if (existing) {
        return {
          status: false,
          statusCode: HttpStatus.CONFLICT,
          message:
            'You have already completed this resource. Points and badge have already been awarded.',
        };
      }

      // Record the completion first (the ResourceCompletion table is separate from Achievement)
      await this.prisma.resourceCompletion.create({
        data: { userId, resourceId, pointsEarned: resource.points },
      });

      const rewardResult = await this.rewards.award({
        userId,
        points: resource.points,
        title: `Resource Completed: ${resource.title}`,
        description: `Awarded for completing the resource "${resource.title}".`,
        badgeId: resource.badge?.id,
      });

      const newBadges: string[] = [];
      if (rewardResult?.badgeAwarded && resource.badge) {
        newBadges.push(resource.badge.name);
      }

      this.notifications
        .create({
          userId,
          type: NotificationType.RESOURCE_COMPLETED,
          title: 'Resource Completed',
          body:
            newBadges.length > 0
              ? `You completed "${resource.title}" and earned ${resource.points} points + the "${newBadges[0]}" badge!`
              : `You completed "${resource.title}" and earned ${resource.points} points!`,
          link: `/resources/${resource.id}`,
          meta: {
            resourceTitle: resource.title,
            pointsEarned: resource.points,
            badges: newBadges,
          },
        })
        .catch((err) => this.logger.error('notification failed', err));

      return {
        status: true,
        statusCode: HttpStatus.OK,
        message: 'Resource marked as complete.',
        pointsEarned: resource.points,
        totalPoints: rewardResult?.totalPoints ?? 0,
        newBadges,
      };
    } catch (error) {
      this.logger.error('completeResource error', error);
      return {
        status: false,
        statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
        message: 'Server error.',
      };
    }
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // RESOURCES — UPDATE
  // ─────────────────────────────────────────────────────────────────────────────

  async updateResource(
    adminId: string,
    id: string,
    dto: UpdateResourceDto,
    file?: Express.Multer.File,
  ) {
    try {
      const resource = await this.prisma.resource.findUnique({ where: { id } });
      if (!resource) {
        return {
          status: false,
          statusCode: HttpStatus.NOT_FOUND,
          message: 'Resource not found.',
        };
      }

      if (dto.categoryId) {
        const cat = await this.prisma.category.findUnique({
          where: { id: dto.categoryId },
        });
        if (!cat) {
          return {
            status: false,
            statusCode: HttpStatus.NOT_FOUND,
            message: 'Category not found.',
          };
        }
      }

      if (dto.badgeId) {
        const badge = await this.prisma.badge.findUnique({
          where: { id: dto.badgeId },
        });
        if (!badge) {
          return {
            status: false,
            statusCode: HttpStatus.NOT_FOUND,
            message: 'Badge not found.',
          };
        }
      }

      // ── Content / file update ─────────────────────────────────────────────
      let contentUrlUpdate: string | undefined;
      let rawTextUpdate: string | null | undefined;

      if (file) {
        // DOCUMENT file replacement — delete old blob, upload new, re-run OCR
        if (resource.contentUrl) {
          await this.azureBlob
            .delete(resource.contentUrl, 'resources')
            .catch(() => null);
        }
        contentUrlUpdate = await this.azureBlob.upload(file, 'resources');
        rawTextUpdate = EXTRACTABLE_MIMETYPES.has(file.mimetype)
          ? await this.ocr.extractText(file.buffer, file.mimetype)
          : null;
      } else if (dto.externalUrl !== undefined) {
        // VIDEO external URL change
        contentUrlUpdate = dto.externalUrl;
      } else if (dto.articleBody !== undefined) {
        // ARTICLE body change — stored as rawText
        rawTextUpdate = dto.articleBody;
      }

      const { tagIds, externalUrl, articleBody, ...metaRest } = dto;

      const updated = await this.prisma.resource.update({
        where: { id },
        data: {
          ...metaRest,
          ...(contentUrlUpdate !== undefined && {
            contentUrl: contentUrlUpdate,
          }),
          ...(rawTextUpdate !== undefined && { rawText: rawTextUpdate }),
          ...(tagIds && { tags: { set: tagIds.map((tid) => ({ id: tid })) } }),
        },
        include: {
          category: true,
          tags: true,
          badge: { select: { id: true, name: true, imageUrl: true } },
        },
      });

      await this.prisma.auditLog.create({
        data: {
          action: 'RESOURCE_UPDATED',
          entity: 'Resource',
          entityId: id,
          details: { ...metaRest } as any,
          adminId,
        },
      });

      const { rawText, ...safeResource } = updated as any;
      return {
        status: true,
        statusCode: HttpStatus.OK,
        message: 'Resource updated.',
        data: safeResource,
      };
    } catch (error) {
      this.logger.error('updateResource error', error);
      return {
        status: false,
        statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
        message: 'Server error.',
      };
    }
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // RESOURCES — DELETE
  // ─────────────────────────────────────────────────────────────────────────────

  async deleteResource(adminId: string, id: string) {
    try {
      const resource = await this.prisma.resource.findUnique({ where: { id } });
      if (!resource) {
        return {
          status: false,
          statusCode: HttpStatus.NOT_FOUND,
          message: 'Resource not found.',
        };
      }

      if (resource.contentUrl) {
        await this.azureBlob.delete(resource.contentUrl, 'resources');
      }

      await this.prisma.$transaction([
        this.prisma.downloadLog.deleteMany({ where: { resourceId: id } }),
        this.prisma.resource.delete({ where: { id } }),
        this.prisma.auditLog.create({
          data: {
            action: 'RESOURCE_DELETED',
            entity: 'Resource',
            entityId: id,
            details: { title: resource.title } as any,
            adminId,
          },
        }),
      ]);

      return {
        status: true,
        statusCode: HttpStatus.OK,
        message: 'Resource deleted.',
      };
    } catch (error) {
      this.logger.error('deleteResource error', error);
      return {
        status: false,
        statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
        message: 'Server error.',
      };
    }
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // RESOURCES — BULK ACTIONS
  // ─────────────────────────────────────────────────────────────────────────────

  async bulkDelete(adminId: string, ids: string[]) {
    try {
      const resources = await this.prisma.resource.findMany({
        where: { id: { in: ids } },
      });

      await Promise.allSettled(
        resources
          .filter((r) => r.contentUrl)
          .map((r) => this.azureBlob.delete(r.contentUrl!, 'resources')),
      );

      await this.prisma.$transaction([
        this.prisma.downloadLog.deleteMany({
          where: { resourceId: { in: ids } },
        }),
        this.prisma.resource.deleteMany({ where: { id: { in: ids } } }),
        this.prisma.auditLog.create({
          data: {
            action: 'RESOURCE_BULK_DELETED',
            entity: 'Resource',
            entityId: 'BULK',
            details: { ids, count: ids.length } as any,
            adminId,
          },
        }),
      ]);

      return {
        status: true,
        statusCode: HttpStatus.OK,
        message: `${ids.length} resource(s) deleted.`,
      };
    } catch (error) {
      this.logger.error('bulkDelete error', error);
      return {
        status: false,
        statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
        message: 'Server error.',
      };
    }
  }

  async bulkMoveCategory(
    adminId: string,
    ids: string[],
    targetCategoryId: string,
  ) {
    try {
      const category = await this.prisma.category.findUnique({
        where: { id: targetCategoryId },
      });
      if (!category) {
        return {
          status: false,
          statusCode: HttpStatus.NOT_FOUND,
          message: 'Target category not found.',
        };
      }

      await this.prisma.resource.updateMany({
        where: { id: { in: ids } },
        data: { categoryId: targetCategoryId },
      });

      await this.prisma.auditLog.create({
        data: {
          action: 'RESOURCE_BULK_MOVED',
          entity: 'Resource',
          entityId: 'BULK',
          details: {
            ids,
            targetCategoryId,
            categoryName: category.name,
          } as any,
          adminId,
        },
      });

      return {
        status: true,
        statusCode: HttpStatus.OK,
        message: `${ids.length} resource(s) moved to "${category.name}".`,
      };
    } catch (error) {
      this.logger.error('bulkMoveCategory error', error);
      return {
        status: false,
        statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
        message: 'Server error.',
      };
    }
  }
}
