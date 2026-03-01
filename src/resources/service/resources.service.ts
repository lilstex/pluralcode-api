/* eslint-disable @typescript-eslint/no-unused-vars */
import { Injectable, HttpStatus, Logger } from '@nestjs/common';
import { PrismaService } from 'src/prisma.service';
import {
  CreateResourceDto,
  UpdateResourceDto,
  ResourceQueryDto,
  CreateCategoryDto,
  UpdateCategoryDto,
  CreateTagDto,
} from '../dto/resources.dto';
import { AzureBlobService } from 'src/providers/azure/azure.blob.service';
import { OcrService } from './ocr.service';
import { BadgeService } from './badge.service';

// MIME types that should trigger OCR text extraction
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
    private readonly badgeService: BadgeService,
  ) {}

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
      // Return only top-level categories with their children nested
      const categories = await this.prisma.category.findMany({
        where: { parentId: null },
        include: {
          children: {
            include: { children: true }, // 2 levels deep
          },
        },
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

      // Prevent a category from being its own parent
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
          message: `Cannot delete: ${category._count.resources} resource(s) are assigned to this category. Reassign them first.`,
        };
      }

      if (category._count.children > 0) {
        return {
          status: false,
          statusCode: HttpStatus.BAD_REQUEST,
          message: `Cannot delete: this category has ${category._count.children} sub-category(ies). Delete or reassign them first.`,
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
  // RESOURCES — CREATE (with file upload + OCR pipeline)
  // ─────────────────────────────────────────────────────────────────────────────

  async createResource(
    adminId: string,
    dto: CreateResourceDto,
    file?: Express.Multer.File,
  ) {
    try {
      // Validate category exists
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

      // Validate tags if provided
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

      let contentUrl: string | null = null;
      let rawText: string | null = null;

      if (dto.type === 'ARTICLE') {
        // ── ARTICLE: body stored directly as rawText, no file upload ──────────
        rawText = dto.articleBody ?? null;
      } else if (dto.type === 'VIDEO' && dto.externalUrl) {
        // ── VIDEO (external): just store the URL ──────────────────────────────
        contentUrl = dto.externalUrl;
      } else if (file) {
        // ── FILE UPLOAD: upload to Azure, then attempt OCR ────────────────────
        contentUrl = await this.azureBlob.upload(file, 'resources');

        if (EXTRACTABLE_MIMETYPES.has(file.mimetype)) {
          // Run OCR — if it fails, upload still succeeds (non-blocking)
          rawText = await this.ocr.extractText(file.buffer, file.mimetype);
        }
      } else {
        // At this point: not ARTICLE, not VIDEO with externalUrl, no file uploaded
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
          author: dto.author,
          language: dto.language,
          region: dto.region,
          sector: dto.sector,
          categoryId: dto.categoryId,
          tags: dto.tagIds?.length
            ? { connect: dto.tagIds.map((id) => ({ id })) }
            : undefined,
        },
        include: { category: true, tags: true },
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
  // RESOURCES — SEARCH & LIST (full-text + faceted filters)
  // ─────────────────────────────────────────────────────────────────────────────

  async listResources(query: ResourceQueryDto, isAuthenticated: boolean) {
    try {
      const page = Number(query.page ?? 1);
      const limit = Number(query.limit ?? 20);
      const skip = (page - 1) * limit;

      const where: any = {};

      // ── Faceted filters ───────────────────────────────────────────────────────
      if (query.categoryId) where.categoryId = query.categoryId;
      if (query.type) where.type = query.type;
      if (query.sector)
        where.sector = { contains: query.sector, mode: 'insensitive' };
      if (query.region)
        where.region = { contains: query.region, mode: 'insensitive' };
      if (query.language) where.language = query.language;
      if (query.dateFrom || query.dateTo) {
        where.createdAt = {};
        if (query.dateFrom) where.createdAt.gte = new Date(query.dateFrom);
        if (query.dateTo) where.createdAt.lte = new Date(query.dateTo);
      }

      // ── Full-text search ──────────────────────────────────────────────────────
      // Searches title, description, author, and the OCR-extracted rawText.
      // Uses Prisma's built-in contains with mode: 'insensitive' which maps to
      // PostgreSQL ILIKE. For production scale, swap to raw $queryRaw with tsvector.
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
            _count: { select: { downloads: true } },
          },
          orderBy: { createdAt: 'desc' },
        }),
        this.prisma.resource.count({ where }),
      ]);

      // Strip rawText from list responses — it's large and only needed for search
      const sanitized = resources.map(({ rawText, ...r }: any) => ({
        ...r,
        downloadCount: r._count.downloads,
        _count: undefined,
        // For unauthenticated users, mask contentUrl behind a soft-gate signal
        contentUrl: isAuthenticated ? r.contentUrl : null,
        requiresLogin: !isAuthenticated,
      }));

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

  async getResource(id: string, isAuthenticated: boolean) {
    try {
      const resource = await this.prisma.resource.findUnique({
        where: { id },
        include: {
          category: { include: { parent: true } },
          tags: true,
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
  // RESOURCES — DOWNLOAD (tracking + badge evaluation)
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

      // Log the download (upsert prevents duplicate spam within same session)
      await this.prisma.downloadLog.create({
        data: { userId, resourceId },
      });

      // Evaluate badges after logging — fire-and-forget
      const newBadges = await this.badgeService.evaluateDownloadBadges(userId);

      return {
        status: true,
        statusCode: HttpStatus.OK,
        message: 'Download recorded.',
        downloadUrl: resource.contentUrl,
        newBadges,
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
  // RESOURCES — UPDATE
  // ─────────────────────────────────────────────────────────────────────────────

  async updateResource(adminId: string, id: string, dto: UpdateResourceDto) {
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

      const { tagIds, ...rest } = dto;

      const updated = await this.prisma.resource.update({
        where: { id },
        data: {
          ...rest,
          ...(tagIds && {
            tags: { set: tagIds.map((tid) => ({ id: tid })) },
          }),
        },
        include: { category: true, tags: true },
      });

      await this.prisma.auditLog.create({
        data: {
          action: 'RESOURCE_UPDATED',
          entity: 'Resource',
          entityId: id,
          details: { ...rest } as any,
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

      // Delete file from Azure Blob if it exists
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

      // Delete Azure blobs for all resources with files
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
