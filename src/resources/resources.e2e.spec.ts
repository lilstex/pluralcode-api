/* eslint-disable @typescript-eslint/no-unused-vars */
import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { JwtService, JwtModule } from '@nestjs/jwt';
import { Reflector } from '@nestjs/core';
import { PassportModule } from '@nestjs/passport';
import { ConfigModule, ConfigService } from '@nestjs/config';
import request from 'supertest';
import { Role } from '@prisma/client';

import { ResourceController } from 'src/resources/controller/resources.controller';
import { ResourceService } from 'src/resources/service/resources.service';
import { JwtStrategy } from 'src/common/strategies/jwt.strategy';
import { JwtAuthGuard } from 'src/common/guards/jwt-auth.guard';
import { OptionalJwtGuard } from 'src/common/guards/optional-jwt.guard';
import { RolesGuard } from 'src/common/guards/roles.guard';
import { PermissionsGuard } from 'src/common/guards/permissions.guard';
import { PrismaService } from 'src/prisma-module/prisma.service';
import { AzureBlobService } from 'src/providers/azure/azure.blob.service';
import { OcrService } from './service/ocr.service';
import { RewardsService } from 'src/reward/service/reward.service';

// ─────────────────────────────────────────────────────────────────────────────
// CONSTANTS
// ─────────────────────────────────────────────────────────────────────────────

const JWT_SECRET = 'test-secret-do-not-use-in-prod';
const SUPER_ADMIN_UUID = 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11';
const RES_ADMIN_UUID = 'b1ffcd00-0d1c-4ef8-bb6d-6bb9bd380a22';
const USER_UUID = 'c2eebc99-9c0b-4ef8-bb6d-6bb9bd380a33';
const RESOURCE_UUID = 'd3eebc99-9c0b-4ef8-bb6d-6bb9bd380a44';
const CATEGORY_UUID = 'e4eebc99-9c0b-4ef8-bb6d-6bb9bd380a55';
const TAG_UUID = 'f5eebc99-9c0b-4ef8-bb6d-6bb9bd380a66';
const BADGE_UUID = 'a1eebc99-9c0b-4ef8-bb6d-6bb9bd380a77';
const PARENT_CAT_UUID = 'b2eebc99-9c0b-4ef8-bb6d-6bb9bd380a88';

// ─────────────────────────────────────────────────────────────────────────────
// FIXTURES
// ─────────────────────────────────────────────────────────────────────────────

function makeCategory(overrides: Record<string, any> = {}): any {
  return {
    id: CATEGORY_UUID,
    name: 'Governance',
    parentId: null,
    parent: null,
    children: [],
    _count: { resources: 0, children: 0 },
    ...overrides,
  };
}
function makeTag(overrides: Record<string, any> = {}): any {
  return {
    id: TAG_UUID,
    name: 'INGO',
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}
function makeBadge(overrides: Record<string, any> = {}): any {
  return {
    id: BADGE_UUID,
    name: 'Resource Champion',
    imageUrl: 'https://blob.example.com/badge.png',
    externalSource: false,
    createdAt: new Date(),
    ...overrides,
  };
}
function makeResource(overrides: Record<string, any> = {}): any {
  return {
    id: RESOURCE_UUID,
    title: 'NGO Governance Handbook 2024',
    description: 'A comprehensive guide.',
    type: 'DOCUMENT',
    contentUrl: 'https://blob.example.com/resources/handbook.pdf',
    rawText: 'Extracted text',
    fileSize: 102400,
    author: 'NRC Nigeria',
    language: 'en',
    region: 'Lagos',
    sector: 'Governance',
    points: 10,
    badgeId: BADGE_UUID,
    categoryId: CATEGORY_UUID,
    category: makeCategory(),
    tags: [makeTag()],
    badge: {
      id: BADGE_UUID,
      name: 'Resource Champion',
      imageUrl: 'https://blob.example.com/badge.png',
    },
    _count: { downloads: 7 },
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}
function makeDbUser(overrides: Record<string, any> = {}): any {
  return {
    id: USER_UUID,
    email: 'user@example.com',
    fullName: 'Test User',
    role: Role.GUEST,
    status: 'APPROVED',
    pointsCount: 50,
    badges: [],
    adminPermission: null,
    ...overrides,
  };
}
function makeSuperAdmin(): any {
  return makeDbUser({
    id: SUPER_ADMIN_UUID,
    email: 'superadmin@example.com',
    role: Role.SUPER_ADMIN,
    adminPermission: null,
  });
}
function makeResourceAdmin(): any {
  return makeDbUser({
    id: RES_ADMIN_UUID,
    email: 'resadmin@example.com',
    role: Role.RESOURCE_ADMIN,
    adminPermission: {
      permissions: ['resource:upload', 'resource:delete', 'taxonomy:manage'],
    },
  });
}

function fakePng(): Buffer {
  return Buffer.from(
    '89504e470d0a1a0a' +
      '0000000d4948445200000001000000010802000000907753de' +
      '0000000c49444154789c63f8cfc0000003010100c9fe92ef' +
      '0000000049454e44ae426082',
    'hex',
  );
}
function fakePdf(): Buffer {
  return Buffer.from('%PDF-1.4\n1 0 obj\n<< /Type /Catalog >>\nendobj\n%%EOF');
}

// ─────────────────────────────────────────────────────────────────────────────
// MOCK PRISMA
// ─────────────────────────────────────────────────────────────────────────────

const mockPrisma = {
  user: { findUnique: jest.fn(), update: jest.fn() },
  resource: {
    findUnique: jest.fn(),
    findMany: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    updateMany: jest.fn(),
    delete: jest.fn(),
    deleteMany: jest.fn(),
    count: jest.fn(),
  },
  category: {
    findUnique: jest.fn(),
    findMany: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
  },
  tag: {
    findUnique: jest.fn(),
    findMany: jest.fn(),
    create: jest.fn(),
    delete: jest.fn(),
  },
  badge: {
    findUnique: jest.fn(),
    findMany: jest.fn(),
    create: jest.fn(),
    delete: jest.fn(),
  },
  downloadLog: { create: jest.fn(), deleteMany: jest.fn() },
  resourceView: {
    findUnique: jest.fn(),
    upsert: jest.fn(),
    findMany: jest.fn(),
  },
  resourceCompletion: {
    findUnique: jest.fn(),
    create: jest.fn(),
    findMany: jest.fn(),
  },
  auditLog: { create: jest.fn() },
  $transaction: jest.fn(),
};

const mockAzure = {
  upload: jest
    .fn()
    .mockResolvedValue('https://blob.example.com/resources/file.pdf'),
  delete: jest.fn().mockResolvedValue(undefined),
};
const mockOcr = {
  extractText: jest
    .fn()
    .mockResolvedValue('Extracted plain text from document.'),
};
const mockRewards = {
  award: jest.fn().mockResolvedValue({
    pointsEarned: 10,
    totalPoints: 10,
    badgeAwarded: null,
    achievementId: 'ach-1',
  }),
  hasAchievement: jest.fn().mockResolvedValue(false),
};

// ─────────────────────────────────────────────────────────────────────────────
// BOOTSTRAP
// ─────────────────────────────────────────────────────────────────────────────

process.env.JWT_SECRET = JWT_SECRET;
let jwtService: JwtService;
const token = (sub: string, role: string) => () =>
  jwtService.sign({ sub, email: `${role}@example.com`, role });
let superAdminToken: () => string;
let resourceAdminToken: () => string;
let userToken: () => string;

describe('Resources Module — E2E', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const module: TestingModule = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({ isGlobal: true, ignoreEnvFile: true }),
        PassportModule.register({ defaultStrategy: 'jwt' }),
        JwtModule.register({
          secret: JWT_SECRET,
          signOptions: { expiresIn: '1h' },
        }),
      ],
      controllers: [ResourceController],
      providers: [
        ResourceService,
        JwtStrategy,
        Reflector,
        OptionalJwtGuard,
        RolesGuard,
        PermissionsGuard,
        JwtAuthGuard,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: AzureBlobService, useValue: mockAzure },
        { provide: OcrService, useValue: mockOcr },
        { provide: RewardsService, useValue: mockRewards },
        {
          provide: ConfigService,
          useValue: {
            get: (k: string) => (k === 'JWT_SECRET' ? JWT_SECRET : undefined),
          },
        },
      ],
    }).compile();

    app = module.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, transform: true }),
    );
    await app.init();

    jwtService = module.get<JwtService>(JwtService);
    superAdminToken = token(SUPER_ADMIN_UUID, Role.SUPER_ADMIN);
    resourceAdminToken = token(RES_ADMIN_UUID, Role.RESOURCE_ADMIN);
    userToken = token(USER_UUID, Role.GUEST);
  });

  afterAll(() => app.close());

  beforeEach(() => {
    jest.resetAllMocks();

    // Restore Azure, OCR, and Rewards defaults wiped by resetAllMocks
    mockAzure.upload.mockResolvedValue(
      'https://blob.example.com/resources/file.pdf',
    );
    mockAzure.delete.mockResolvedValue(undefined);
    mockOcr.extractText.mockResolvedValue(
      'Extracted plain text from document.',
    );
    mockRewards.award.mockResolvedValue({
      pointsEarned: 10,
      totalPoints: 10,
      badgeAwarded: null,
      achievementId: 'ach-1',
    });
    mockRewards.hasAchievement.mockResolvedValue(false);

    // Default view/completion findMany — empty (no views/completions)
    mockPrisma.resourceView.findMany.mockResolvedValue([]);
    mockPrisma.resourceCompletion.findMany.mockResolvedValue([]);

    mockPrisma.user.findUnique.mockImplementation(({ where }: any) => {
      if (where?.id === SUPER_ADMIN_UUID)
        return Promise.resolve(makeSuperAdmin());
      if (where?.id === RES_ADMIN_UUID)
        return Promise.resolve(makeResourceAdmin());
      if (where?.id === USER_UUID) return Promise.resolve(makeDbUser());
      return Promise.resolve(null);
    });
    mockPrisma.$transaction.mockImplementation((arg: any) =>
      Array.isArray(arg) ? Promise.all(arg) : arg(mockPrisma),
    );
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // CATEGORIES
  // ═══════════════════════════════════════════════════════════════════════════

  describe('POST /resources/categories', () => {
    it('401 — no token', () =>
      request(app.getHttpServer())
        .post('/resources/categories')
        .send({ name: 'Governance' })
        .expect(401));
    it('403 — GUEST rejected', () =>
      request(app.getHttpServer())
        .post('/resources/categories')
        .set('Authorization', `Bearer ${userToken()}`)
        .send({ name: 'Governance' })
        .expect(403));
    it('400 — missing name', () =>
      request(app.getHttpServer())
        .post('/resources/categories')
        .set('Authorization', `Bearer ${superAdminToken()}`)
        .send({})
        .expect(400));
    it('400 — invalid parentId', () =>
      request(app.getHttpServer())
        .post('/resources/categories')
        .set('Authorization', `Bearer ${superAdminToken()}`)
        .send({ name: 'Sub', parentId: 'not-a-uuid' })
        .expect(400));

    it('404 in body — parent not found', async () => {
      mockPrisma.category.findUnique.mockResolvedValue(null);
      const { body } = await request(app.getHttpServer())
        .post('/resources/categories')
        .set('Authorization', `Bearer ${superAdminToken()}`)
        .send({ name: 'Sub', parentId: PARENT_CAT_UUID })
        .expect(201);
      expect(body.statusCode).toBe(404);
    });

    it('409 in body — duplicate name', async () => {
      mockPrisma.category.findUnique.mockResolvedValue(makeCategory());
      const { body } = await request(app.getHttpServer())
        .post('/resources/categories')
        .set('Authorization', `Bearer ${superAdminToken()}`)
        .send({ name: 'Governance' })
        .expect(201);
      expect(body.statusCode).toBe(409);
    });

    it('201 — SUPER_ADMIN creates top-level category', async () => {
      mockPrisma.category.findUnique.mockResolvedValue(null);
      mockPrisma.category.create.mockResolvedValue(makeCategory());
      mockPrisma.auditLog.create.mockResolvedValue({});
      const { body } = await request(app.getHttpServer())
        .post('/resources/categories')
        .set('Authorization', `Bearer ${superAdminToken()}`)
        .send({ name: 'Governance' })
        .expect(201);
      expect(body.data.name).toBe('Governance');
      expect(mockPrisma.auditLog.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ action: 'CATEGORY_CREATED' }),
        }),
      );
    });

    it('201 — RESOURCE_ADMIN can create categories', async () => {
      mockPrisma.category.findUnique.mockResolvedValue(null);
      mockPrisma.category.create.mockResolvedValue(makeCategory());
      mockPrisma.auditLog.create.mockResolvedValue({});
      const { body } = await request(app.getHttpServer())
        .post('/resources/categories')
        .set('Authorization', `Bearer ${resourceAdminToken()}`)
        .send({ name: 'Governance' })
        .expect(201);
      expect(body.status).toBe(true);
    });

    it('201 — creates sub-category with valid parentId', async () => {
      mockPrisma.category.findUnique
        .mockResolvedValueOnce(makeCategory({ id: PARENT_CAT_UUID }))
        .mockResolvedValueOnce(null);
      mockPrisma.category.create.mockResolvedValue(
        makeCategory({ name: 'Sub-governance', parentId: PARENT_CAT_UUID }),
      );
      mockPrisma.auditLog.create.mockResolvedValue({});
      const { body } = await request(app.getHttpServer())
        .post('/resources/categories')
        .set('Authorization', `Bearer ${superAdminToken()}`)
        .send({ name: 'Sub-governance', parentId: PARENT_CAT_UUID })
        .expect(201);
      expect(body.data.parentId).toBe(PARENT_CAT_UUID);
    });
  });

  describe('GET /resources/categories', () => {
    it('200 — public', async () => {
      mockPrisma.category.findMany.mockResolvedValue([makeCategory()]);
      const { body } = await request(app.getHttpServer())
        .get('/resources/categories')
        .expect(200);
      expect(body.data).toHaveLength(1);
    });
  });

  describe('PATCH /resources/categories/:id', () => {
    it('401 — no token', () =>
      request(app.getHttpServer())
        .patch(`/resources/categories/${CATEGORY_UUID}`)
        .send({ name: 'Updated' })
        .expect(401));
    it('400 — non-UUID id', () =>
      request(app.getHttpServer())
        .patch('/resources/categories/not-a-uuid')
        .set('Authorization', `Bearer ${superAdminToken()}`)
        .send({ name: 'Updated' })
        .expect(400));

    it('404 in body — not found', async () => {
      mockPrisma.category.findUnique.mockResolvedValue(null);
      const { body } = await request(app.getHttpServer())
        .patch(`/resources/categories/${CATEGORY_UUID}`)
        .set('Authorization', `Bearer ${superAdminToken()}`)
        .send({ name: 'Updated' })
        .expect(200);
      expect(body.statusCode).toBe(404);
    });

    it('400 in body — self-parent', async () => {
      mockPrisma.category.findUnique.mockResolvedValue(makeCategory());
      const { body } = await request(app.getHttpServer())
        .patch(`/resources/categories/${CATEGORY_UUID}`)
        .set('Authorization', `Bearer ${superAdminToken()}`)
        .send({ parentId: CATEGORY_UUID })
        .expect(200);
      expect(body.message).toMatch(/own parent/i);
    });

    it('200 — updates name', async () => {
      mockPrisma.category.findUnique.mockResolvedValue(makeCategory());
      mockPrisma.category.update.mockResolvedValue(
        makeCategory({ name: 'Updated Name' }),
      );
      mockPrisma.auditLog.create.mockResolvedValue({});
      const { body } = await request(app.getHttpServer())
        .patch(`/resources/categories/${CATEGORY_UUID}`)
        .set('Authorization', `Bearer ${superAdminToken()}`)
        .send({ name: 'Updated Name' })
        .expect(200);
      expect(body.status).toBe(true);
      expect(mockPrisma.auditLog.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ action: 'CATEGORY_UPDATED' }),
        }),
      );
    });
  });

  describe('DELETE /resources/categories/:id', () => {
    it('401 — no token', () =>
      request(app.getHttpServer())
        .delete(`/resources/categories/${CATEGORY_UUID}`)
        .expect(401));

    it('404 in body — not found', async () => {
      mockPrisma.category.findUnique.mockResolvedValue(null);
      const { body } = await request(app.getHttpServer())
        .delete(`/resources/categories/${CATEGORY_UUID}`)
        .set('Authorization', `Bearer ${superAdminToken()}`)
        .expect(200);
      expect(body.statusCode).toBe(404);
    });

    it('400 in body — has assigned resources', async () => {
      mockPrisma.category.findUnique.mockResolvedValue(
        makeCategory({ _count: { resources: 3, children: 0 } }),
      );
      const { body } = await request(app.getHttpServer())
        .delete(`/resources/categories/${CATEGORY_UUID}`)
        .set('Authorization', `Bearer ${superAdminToken()}`)
        .expect(200);
      expect(body.statusCode).toBe(400);
      expect(body.message).toMatch(/reassign/i);
    });

    it('400 in body — has sub-categories', async () => {
      mockPrisma.category.findUnique.mockResolvedValue(
        makeCategory({ _count: { resources: 0, children: 2 } }),
      );
      const { body } = await request(app.getHttpServer())
        .delete(`/resources/categories/${CATEGORY_UUID}`)
        .set('Authorization', `Bearer ${superAdminToken()}`)
        .expect(200);
      expect(body.message).toMatch(/sub-category/i);
    });

    it('200 — deletes empty category', async () => {
      mockPrisma.category.findUnique.mockResolvedValue(
        makeCategory({ _count: { resources: 0, children: 0 } }),
      );
      mockPrisma.category.delete.mockResolvedValue({});
      mockPrisma.auditLog.create.mockResolvedValue({});
      const { body } = await request(app.getHttpServer())
        .delete(`/resources/categories/${CATEGORY_UUID}`)
        .set('Authorization', `Bearer ${superAdminToken()}`)
        .expect(200);
      expect(body.status).toBe(true);
      expect(mockPrisma.auditLog.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ action: 'CATEGORY_DELETED' }),
        }),
      );
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // TAGS
  // ═══════════════════════════════════════════════════════════════════════════

  describe('POST /resources/tags', () => {
    it('401 — no token', () =>
      request(app.getHttpServer())
        .post('/resources/tags')
        .send({ name: 'INGO' })
        .expect(401));
    it('403 — GUEST rejected', () =>
      request(app.getHttpServer())
        .post('/resources/tags')
        .set('Authorization', `Bearer ${userToken()}`)
        .send({ name: 'INGO' })
        .expect(403));
    it('400 — missing name', () =>
      request(app.getHttpServer())
        .post('/resources/tags')
        .set('Authorization', `Bearer ${superAdminToken()}`)
        .send({})
        .expect(400));

    it('409 in body — duplicate name', async () => {
      mockPrisma.tag.findUnique.mockResolvedValue(makeTag());
      const { body } = await request(app.getHttpServer())
        .post('/resources/tags')
        .set('Authorization', `Bearer ${superAdminToken()}`)
        .send({ name: 'INGO' })
        .expect(201);
      expect(body.statusCode).toBe(409);
    });

    it('201 — creates tag', async () => {
      mockPrisma.tag.findUnique.mockResolvedValue(null);
      mockPrisma.tag.create.mockResolvedValue(makeTag());
      mockPrisma.auditLog.create.mockResolvedValue({});
      const { body } = await request(app.getHttpServer())
        .post('/resources/tags')
        .set('Authorization', `Bearer ${superAdminToken()}`)
        .send({ name: 'INGO' })
        .expect(201);
      expect(body.data.name).toBe('INGO');
      expect(mockPrisma.auditLog.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ action: 'TAG_CREATED' }),
        }),
      );
    });
  });

  describe('GET /resources/tags', () => {
    it('200 — public', async () => {
      mockPrisma.tag.findMany.mockResolvedValue([makeTag()]);
      const { body } = await request(app.getHttpServer())
        .get('/resources/tags')
        .expect(200);
      expect(body.data).toHaveLength(1);
    });
  });

  describe('DELETE /resources/tags/:id', () => {
    it('401 — no token', () =>
      request(app.getHttpServer())
        .delete(`/resources/tags/${TAG_UUID}`)
        .expect(401));
    it('400 — non-UUID id', () =>
      request(app.getHttpServer())
        .delete('/resources/tags/not-a-uuid')
        .set('Authorization', `Bearer ${superAdminToken()}`)
        .expect(400));

    it('404 in body — not found', async () => {
      mockPrisma.tag.findUnique.mockResolvedValue(null);
      const { body } = await request(app.getHttpServer())
        .delete(`/resources/tags/${TAG_UUID}`)
        .set('Authorization', `Bearer ${superAdminToken()}`)
        .expect(200);
      expect(body.statusCode).toBe(404);
    });

    it('200 — deletes tag', async () => {
      mockPrisma.tag.findUnique.mockResolvedValue(makeTag());
      mockPrisma.tag.delete.mockResolvedValue({});
      mockPrisma.auditLog.create.mockResolvedValue({});
      const { body } = await request(app.getHttpServer())
        .delete(`/resources/tags/${TAG_UUID}`)
        .set('Authorization', `Bearer ${superAdminToken()}`)
        .expect(200);
      expect(body.status).toBe(true);
      expect(mockPrisma.auditLog.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ action: 'TAG_DELETED' }),
        }),
      );
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // BADGES
  // ═══════════════════════════════════════════════════════════════════════════

  describe('POST /resources/badges', () => {
    it('401 — no token', () =>
      request(app.getHttpServer())
        .post('/resources/badges')
        .field('name', 'Resource Champion')
        .expect(401));
    it('403 — RESOURCE_ADMIN cannot create badges', () =>
      request(app.getHttpServer())
        .post('/resources/badges')
        .set('Authorization', `Bearer ${resourceAdminToken()}`)
        .field('name', 'RC')
        .attach('file', fakePng(), {
          filename: 'badge.png',
          contentType: 'image/png',
        })
        .expect(403));

    it('409 in body — duplicate badge name', async () => {
      mockPrisma.badge.findUnique.mockResolvedValue(makeBadge());
      const { body } = await request(app.getHttpServer())
        .post('/resources/badges')
        .set('Authorization', `Bearer ${superAdminToken()}`)
        .field('name', 'Resource Champion')
        .attach('file', fakePng(), {
          filename: 'badge.png',
          contentType: 'image/png',
        })
        .expect(201);
      expect(body.statusCode).toBe(409);
    });

    it('201 — creates badge and uploads image', async () => {
      mockPrisma.badge.findUnique.mockResolvedValue(null);
      mockPrisma.badge.create.mockResolvedValue(makeBadge());
      mockPrisma.auditLog.create.mockResolvedValue({});
      const { body } = await request(app.getHttpServer())
        .post('/resources/badges')
        .set('Authorization', `Bearer ${superAdminToken()}`)
        .field('name', 'Resource Champion')
        .attach('file', fakePng(), {
          filename: 'badge.png',
          contentType: 'image/png',
        })
        .expect(201);
      expect(body.status).toBe(true);
      expect(mockAzure.upload).toHaveBeenCalled();
      expect(mockPrisma.auditLog.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ action: 'BADGE_CREATED' }),
        }),
      );
    });
  });

  describe('GET /resources/badges', () => {
    it('200 — public', async () => {
      mockPrisma.badge.findMany.mockResolvedValue([makeBadge()]);
      const { body } = await request(app.getHttpServer())
        .get('/resources/badges')
        .expect(200);
      expect(body.data).toHaveLength(1);
    });
  });

  describe('DELETE /resources/badges/:id', () => {
    it('401 — no token', () =>
      request(app.getHttpServer())
        .delete(`/resources/badges/${BADGE_UUID}`)
        .expect(401));
    it('403 — RESOURCE_ADMIN cannot delete badges', () =>
      request(app.getHttpServer())
        .delete(`/resources/badges/${BADGE_UUID}`)
        .set('Authorization', `Bearer ${resourceAdminToken()}`)
        .expect(403));
    it('400 — non-UUID id', () =>
      request(app.getHttpServer())
        .delete('/resources/badges/not-a-uuid')
        .set('Authorization', `Bearer ${superAdminToken()}`)
        .expect(400));

    it('404 in body — not found', async () => {
      mockPrisma.badge.findUnique.mockResolvedValue(null);
      const { body } = await request(app.getHttpServer())
        .delete(`/resources/badges/${BADGE_UUID}`)
        .set('Authorization', `Bearer ${superAdminToken()}`)
        .expect(200);
      expect(body.statusCode).toBe(404);
    });

    it('200 — deletes badge and removes image from Azure', async () => {
      mockPrisma.badge.findUnique.mockResolvedValue(makeBadge());
      mockPrisma.badge.delete.mockResolvedValue({});
      mockPrisma.auditLog.create.mockResolvedValue({});
      const { body } = await request(app.getHttpServer())
        .delete(`/resources/badges/${BADGE_UUID}`)
        .set('Authorization', `Bearer ${superAdminToken()}`)
        .expect(200);
      expect(body.status).toBe(true);
      expect(mockAzure.delete).toHaveBeenCalledWith(
        'https://blob.example.com/badge.png',
        'avatars',
      );
      expect(mockPrisma.auditLog.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ action: 'BADGE_DELETED' }),
        }),
      );
    });

    it('200 — no Azure call when imageUrl is null', async () => {
      mockPrisma.badge.findUnique.mockResolvedValue(
        makeBadge({ imageUrl: null }),
      );
      mockPrisma.badge.delete.mockResolvedValue({});
      mockPrisma.auditLog.create.mockResolvedValue({});
      await request(app.getHttpServer())
        .delete(`/resources/badges/${BADGE_UUID}`)
        .set('Authorization', `Bearer ${superAdminToken()}`)
        .expect(200);
      expect(mockAzure.delete).not.toHaveBeenCalled();
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // RESOURCES — CREATE
  // ═══════════════════════════════════════════════════════════════════════════

  describe('POST /resources', () => {
    beforeEach(() => {
      mockPrisma.category.findUnique.mockResolvedValue(makeCategory());
      mockPrisma.tag.findMany.mockResolvedValue([makeTag()]);
      mockPrisma.badge.findUnique.mockResolvedValue(makeBadge());
      mockPrisma.resource.create.mockResolvedValue(makeResource());
      mockPrisma.auditLog.create.mockResolvedValue({});
    });

    it('401 — no token', () =>
      request(app.getHttpServer())
        .post('/resources')
        .send({
          title: 'T',
          description: 'D',
          type: 'DOCUMENT',
          categoryId: CATEGORY_UUID,
        })
        .expect(401));
    it('403 — GUEST rejected', () =>
      request(app.getHttpServer())
        .post('/resources')
        .set('Authorization', `Bearer ${userToken()}`)
        .send({
          title: 'T',
          description: 'D',
          type: 'DOCUMENT',
          categoryId: CATEGORY_UUID,
        })
        .expect(403));
    it('400 — missing required fields', () =>
      request(app.getHttpServer())
        .post('/resources')
        .set('Authorization', `Bearer ${superAdminToken()}`)
        .send({ title: 'Only title' })
        .expect(400));
    it('400 — invalid type enum', () =>
      request(app.getHttpServer())
        .post('/resources')
        .set('Authorization', `Bearer ${superAdminToken()}`)
        .send({
          title: 'T',
          description: 'D',
          type: 'INVALID',
          categoryId: CATEGORY_UUID,
        })
        .expect(400));
    it('400 — invalid categoryId', () =>
      request(app.getHttpServer())
        .post('/resources')
        .set('Authorization', `Bearer ${superAdminToken()}`)
        .send({
          title: 'T',
          description: 'D',
          type: 'DOCUMENT',
          categoryId: 'not-a-uuid',
        })
        .expect(400));

    it('404 in body — category not found', async () => {
      mockPrisma.category.findUnique.mockResolvedValue(null);
      const { body } = await request(app.getHttpServer())
        .post('/resources')
        .set('Authorization', `Bearer ${superAdminToken()}`)
        .field('title', 'T')
        .field('description', 'D')
        .field('type', 'DOCUMENT')
        .field('categoryId', CATEGORY_UUID)
        .expect(201);
      expect(body.statusCode).toBe(404);
      expect(body.message).toMatch(/category not found/i);
    });

    it('400 in body — invalid tagIds', async () => {
      mockPrisma.tag.findMany.mockResolvedValue([]);
      const { body } = await request(app.getHttpServer())
        .post('/resources')
        .set('Authorization', `Bearer ${superAdminToken()}`)
        .field('title', 'T')
        .field('description', 'D')
        .field('type', 'DOCUMENT')
        .field('categoryId', CATEGORY_UUID)
        .field('tagIds[]', TAG_UUID)
        .expect(201);
      expect(body.statusCode).toBe(400);
      expect(body.message).toMatch(/tag IDs are invalid/i);
    });

    it('404 in body — badge not found', async () => {
      mockPrisma.badge.findUnique.mockResolvedValue(null);
      const { body } = await request(app.getHttpServer())
        .post('/resources')
        .set('Authorization', `Bearer ${superAdminToken()}`)
        .field('title', 'T')
        .field('description', 'D')
        .field('type', 'DOCUMENT')
        .field('categoryId', CATEGORY_UUID)
        .field('badgeId', BADGE_UUID)
        .expect(201);
      expect(body.statusCode).toBe(404);
      expect(body.message).toMatch(/badge not found/i);
    });

    it('400 in body — DOCUMENT without file', async () => {
      const { body } = await request(app.getHttpServer())
        .post('/resources')
        .set('Authorization', `Bearer ${superAdminToken()}`)
        .field('title', 'T')
        .field('description', 'D')
        .field('type', 'DOCUMENT')
        .field('categoryId', CATEGORY_UUID)
        .expect(201);
      expect(body.statusCode).toBe(400);
      expect(body.message).toMatch(/file upload or external URL/i);
    });

    it('201 — DOCUMENT with PDF: uploads to Azure and runs OCR', async () => {
      mockAzure.upload.mockResolvedValue(
        'https://blob.example.com/resources/handbook.pdf',
      );
      mockOcr.extractText.mockResolvedValue(
        'Extracted plain text from document.',
      );
      const { body } = await request(app.getHttpServer())
        .post('/resources')
        .set('Authorization', `Bearer ${superAdminToken()}`)
        .field('title', 'Handbook')
        .field('description', 'A guide')
        .field('type', 'DOCUMENT')
        .field('categoryId', CATEGORY_UUID)
        .attach('file', fakePdf(), {
          filename: 'handbook.pdf',
          contentType: 'application/pdf',
        })
        .expect(201);
      expect(body.status).toBe(true);
      expect(mockAzure.upload).toHaveBeenCalledWith(
        expect.objectContaining({ mimetype: 'application/pdf' }),
        'resources',
      );
      expect(mockOcr.extractText).toHaveBeenCalled();
      expect(mockPrisma.resource.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            type: 'DOCUMENT',
            rawText: 'Extracted plain text from document.',
          }),
        }),
      );
    });

    it('201 — VIDEO with externalUrl: no upload, no OCR', async () => {
      const { body } = await request(app.getHttpServer())
        .post('/resources')
        .set('Authorization', `Bearer ${superAdminToken()}`)
        .field('title', 'Webinar')
        .field('description', 'A video.')
        .field('type', 'VIDEO')
        .field('categoryId', CATEGORY_UUID)
        .field('externalUrl', 'https://youtube.com/watch?v=abc123')
        .expect(201);
      expect(body.status).toBe(true);
      expect(mockAzure.upload).not.toHaveBeenCalled();
      expect(mockOcr.extractText).not.toHaveBeenCalled();
      expect(mockPrisma.resource.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            contentUrl: 'https://youtube.com/watch?v=abc123',
          }),
        }),
      );
    });

    it('201 — ARTICLE: stores articleBody as rawText, no file needed', async () => {
      const { body } = await request(app.getHttpServer())
        .post('/resources')
        .set('Authorization', `Bearer ${superAdminToken()}`)
        .field('title', 'NGO Tips')
        .field('description', 'Best practices.')
        .field('type', 'ARTICLE')
        .field('categoryId', CATEGORY_UUID)
        .field('articleBody', 'This is the full article text.')
        .expect(201);
      expect(body.status).toBe(true);
      expect(mockAzure.upload).not.toHaveBeenCalled();
      expect(mockPrisma.resource.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            rawText: 'This is the full article text.',
          }),
        }),
      );
    });

    it('201 — optional points stored when provided', async () => {
      await request(app.getHttpServer())
        .post('/resources')
        .set('Authorization', `Bearer ${superAdminToken()}`)
        .field('title', 'T')
        .field('description', 'D')
        .field('type', 'ARTICLE')
        .field('categoryId', CATEGORY_UUID)
        .field('articleBody', 'Content.')
        .field('points', '25')
        .expect(201);
      expect(mockPrisma.resource.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ points: 25 }),
        }),
      );
    });

    it('201 — creates audit log on success', async () => {
      await request(app.getHttpServer())
        .post('/resources')
        .set('Authorization', `Bearer ${superAdminToken()}`)
        .field('title', 'T')
        .field('description', 'D')
        .field('type', 'ARTICLE')
        .field('categoryId', CATEGORY_UUID)
        .field('articleBody', 'Content.')
        .expect(201);
      expect(mockPrisma.auditLog.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            action: 'RESOURCE_CREATED',
            entity: 'Resource',
          }),
        }),
      );
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // RESOURCES — LIST
  // ═══════════════════════════════════════════════════════════════════════════

  describe('GET /resources', () => {
    beforeEach(() => {
      mockPrisma.resource.findMany.mockResolvedValue([makeResource()]);
      mockPrisma.resource.count.mockResolvedValue(1);
      mockPrisma.category.findMany.mockResolvedValue([]); // subcategory lookup
    });

    it('200 — public, no token needed', async () => {
      const { body } = await request(app.getHttpServer())
        .get('/resources')
        .expect(200);
      expect(body.data.resources).toHaveLength(1);
    });

    it('200 — unauthenticated: contentUrl null, requiresLogin true', async () => {
      const { body } = await request(app.getHttpServer())
        .get('/resources')
        .expect(200);
      expect(body.data.resources[0].contentUrl).toBeNull();
      expect(body.data.resources[0].requiresLogin).toBe(true);
    });

    it('200 — authenticated: contentUrl returned', async () => {
      const { body } = await request(app.getHttpServer())
        .get('/resources')
        .set('Authorization', `Bearer ${userToken()}`)
        .expect(200);
      expect(body.data.resources[0].contentUrl).toBe(
        'https://blob.example.com/resources/handbook.pdf',
      );
      expect(body.data.resources[0].requiresLogin).toBe(false);
    });

    it('200 — rawText never exposed', async () => {
      const { body } = await request(app.getHttpServer())
        .get('/resources')
        .expect(200);
      expect(body.data.resources[0].rawText).toBeUndefined();
    });

    it('200 — default pagination: take=20, skip=0', async () => {
      await request(app.getHttpServer()).get('/resources').expect(200);
      expect(mockPrisma.resource.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ skip: 0, take: 20 }),
      );
    });

    it('200 — non-numeric page/limit falls back to defaults', async () => {
      await request(app.getHttpServer())
        .get('/resources?page=abc&limit=xyz')
        .expect(200);
      const call = mockPrisma.resource.findMany.mock.calls[0][0];
      expect(call.skip).toBe(0);
      expect(call.take).toBe(20);
    });

    it('200 — page=3&limit=10 → skip=20, take=10', async () => {
      await request(app.getHttpServer())
        .get('/resources?page=3&limit=10')
        .expect(200);
      expect(mockPrisma.resource.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ skip: 20, take: 10 }),
      );
    });

    it('200 — limit capped at 100', async () => {
      await request(app.getHttpServer())
        .get('/resources?limit=9999')
        .expect(200);
      const call = mockPrisma.resource.findMany.mock.calls[0][0];
      expect(call.take).toBe(100);
    });

    it('200 — search filter applies across 4 fields', async () => {
      await request(app.getHttpServer())
        .get('/resources?search=governance')
        .expect(200);
      const call = mockPrisma.resource.findMany.mock.calls[0][0];
      expect(call.where.OR).toHaveLength(4);
    });

    it('200 — categoryId filter includes parent + children via { in: [...] }', async () => {
      const CHILD_UUID = 'c9eebc99-9c0b-4ef8-bb6d-6bb9bd380ccc';
      mockPrisma.category.findMany.mockResolvedValue([{ id: CHILD_UUID }]);
      await request(app.getHttpServer())
        .get(`/resources?categoryId=${CATEGORY_UUID}`)
        .expect(200);
      const call = mockPrisma.resource.findMany.mock.calls[0][0];
      expect(call.where.categoryId).toEqual({
        in: [CATEGORY_UUID, CHILD_UUID],
      });
    });

    it('200 — categoryId with no children still filters correctly', async () => {
      mockPrisma.category.findMany.mockResolvedValue([]);
      await request(app.getHttpServer())
        .get(`/resources?categoryId=${CATEGORY_UUID}`)
        .expect(200);
      const call = mockPrisma.resource.findMany.mock.calls[0][0];
      expect(call.where.categoryId).toEqual({ in: [CATEGORY_UUID] });
    });

    it('200 — type/format filter', async () => {
      await request(app.getHttpServer())
        .get('/resources?type=DOCUMENT')
        .expect(200);
      expect(mockPrisma.resource.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ type: 'DOCUMENT' }),
        }),
      );
    });

    it('400 — invalid type enum rejected by ValidationPipe', () =>
      request(app.getHttpServer()).get('/resources?type=INVALID').expect(400));

    it('200 — tagId filter via many-to-many', async () => {
      await request(app.getHttpServer())
        .get(`/resources?tagId=${TAG_UUID}`)
        .expect(200);
      expect(mockPrisma.resource.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ tags: { some: { id: TAG_UUID } } }),
        }),
      );
    });

    it('200 — sector and region filters (case-insensitive)', async () => {
      await request(app.getHttpServer())
        .get('/resources?sector=Health&region=Lagos')
        .expect(200);
      const call = mockPrisma.resource.findMany.mock.calls[0][0];
      expect(call.where.sector).toMatchObject({
        contains: 'Health',
        mode: 'insensitive',
      });
      expect(call.where.region).toMatchObject({
        contains: 'Lagos',
        mode: 'insensitive',
      });
    });

    it('200 — dateFrom and dateTo filters', async () => {
      await request(app.getHttpServer())
        .get('/resources?dateFrom=2024-01-01&dateTo=2024-12-31')
        .expect(200);
      const call = mockPrisma.resource.findMany.mock.calls[0][0];
      expect(call.where.createdAt.gte).toBeInstanceOf(Date);
      expect(call.where.createdAt.lte).toBeInstanceOf(Date);
    });

    it('200 — correct pagination metadata', async () => {
      mockPrisma.resource.count.mockResolvedValue(45);
      const { body } = await request(app.getHttpServer())
        .get('/resources?page=2&limit=15')
        .expect(200);
      expect(body.data).toMatchObject({
        total: 45,
        page: 2,
        limit: 15,
        pages: 3,
      });
    });

    it('200 — downloadCount derived from _count.downloads', async () => {
      const { body } = await request(app.getHttpServer())
        .get('/resources')
        .expect(200);
      expect(body.data.resources[0].downloadCount).toBe(7);
      expect(body.data.resources[0]._count).toBeUndefined();
    });

    it('200 — unauthenticated: hasViewed/hasCompleted/canComplete not present', async () => {
      const { body } = await request(app.getHttpServer())
        .get('/resources')
        .expect(200);
      expect(body.data.resources[0].hasViewed).toBeUndefined();
      expect(body.data.resources[0].hasCompleted).toBeUndefined();
      expect(body.data.resources[0].canComplete).toBeUndefined();
    });

    it('200 — authenticated, not viewed: hasViewed=false, canComplete=false', async () => {
      mockPrisma.$transaction.mockResolvedValue([[makeResource()], 1]);
      mockPrisma.category.findMany.mockResolvedValue([]);
      mockPrisma.resourceView.findMany.mockResolvedValue([]);
      mockPrisma.resourceCompletion.findMany.mockResolvedValue([]);
      const { body } = await request(app.getHttpServer())
        .get('/resources')
        .set('Authorization', `Bearer ${userToken()}`)
        .expect(200);
      const r = body.data.resources[0];
      expect(r.hasViewed).toBe(false);
      expect(r.hasCompleted).toBe(false);
      expect(r.canComplete).toBe(false);
    });

    it('200 — authenticated, viewed but not completed: canComplete=true', async () => {
      mockPrisma.$transaction.mockResolvedValue([[makeResource()], 1]);
      mockPrisma.category.findMany.mockResolvedValue([]);
      mockPrisma.resourceView.findMany.mockResolvedValue([
        { resourceId: RESOURCE_UUID },
      ]);
      mockPrisma.resourceCompletion.findMany.mockResolvedValue([]);
      const { body } = await request(app.getHttpServer())
        .get('/resources')
        .set('Authorization', `Bearer ${userToken()}`)
        .expect(200);
      const r = body.data.resources[0];
      expect(r.hasViewed).toBe(true);
      expect(r.hasCompleted).toBe(false);
      expect(r.canComplete).toBe(true);
    });

    it('200 — authenticated, viewed and completed: canComplete=false', async () => {
      mockPrisma.$transaction.mockResolvedValue([[makeResource()], 1]);
      mockPrisma.category.findMany.mockResolvedValue([]);
      mockPrisma.resourceView.findMany.mockResolvedValue([
        { resourceId: RESOURCE_UUID },
      ]);
      mockPrisma.resourceCompletion.findMany.mockResolvedValue([
        { resourceId: RESOURCE_UUID },
      ]);
      const { body } = await request(app.getHttpServer())
        .get('/resources')
        .set('Authorization', `Bearer ${userToken()}`)
        .expect(200);
      const r = body.data.resources[0];
      expect(r.hasViewed).toBe(true);
      expect(r.hasCompleted).toBe(true);
      expect(r.canComplete).toBe(false);
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // RESOURCES — GET SINGLE
  // ═══════════════════════════════════════════════════════════════════════════

  describe('GET /resources/:id', () => {
    it('400 — non-UUID id', () =>
      request(app.getHttpServer()).get('/resources/not-a-uuid').expect(400));

    it('404 in body — not found', async () => {
      mockPrisma.resource.findUnique.mockResolvedValue(null);
      const { body } = await request(app.getHttpServer())
        .get(`/resources/${RESOURCE_UUID}`)
        .expect(200);
      expect(body.statusCode).toBe(404);
    });

    it('200 — unauthenticated: contentUrl null', async () => {
      mockPrisma.resource.findUnique.mockResolvedValue(makeResource());
      const { body } = await request(app.getHttpServer())
        .get(`/resources/${RESOURCE_UUID}`)
        .expect(200);
      expect(body.data.contentUrl).toBeNull();
      expect(body.data.requiresLogin).toBe(true);
    });

    it('200 — authenticated: contentUrl returned, hasViewed/hasCompleted present', async () => {
      mockPrisma.resource.findUnique.mockResolvedValue(makeResource());
      mockPrisma.$transaction.mockResolvedValue([null, null]); // no view, no completion
      const { body } = await request(app.getHttpServer())
        .get(`/resources/${RESOURCE_UUID}`)
        .set('Authorization', `Bearer ${userToken()}`)
        .expect(200);
      expect(body.data.contentUrl).toBe(
        'https://blob.example.com/resources/handbook.pdf',
      );
      expect(body.data.hasViewed).toBe(false);
      expect(body.data.hasCompleted).toBe(false);
      expect(body.data.canComplete).toBe(false);
    });

    it('200 — hasViewed=true enables canComplete when not yet completed', async () => {
      mockPrisma.resource.findUnique.mockResolvedValue(makeResource());
      mockPrisma.$transaction.mockResolvedValue([{ id: 'view-001' }, null]); // viewed, not completed
      const { body } = await request(app.getHttpServer())
        .get(`/resources/${RESOURCE_UUID}`)
        .set('Authorization', `Bearer ${userToken()}`)
        .expect(200);
      expect(body.data.hasViewed).toBe(true);
      expect(body.data.hasCompleted).toBe(false);
      expect(body.data.canComplete).toBe(true);
    });

    it('200 — hasCompleted=true disables canComplete', async () => {
      mockPrisma.resource.findUnique.mockResolvedValue(makeResource());
      mockPrisma.$transaction.mockResolvedValue([
        { id: 'view-001' },
        { id: 'comp-001' },
      ]);
      const { body } = await request(app.getHttpServer())
        .get(`/resources/${RESOURCE_UUID}`)
        .set('Authorization', `Bearer ${userToken()}`)
        .expect(200);
      expect(body.data.hasViewed).toBe(true);
      expect(body.data.hasCompleted).toBe(true);
      expect(body.data.canComplete).toBe(false);
    });

    it('200 — rawText never exposed', async () => {
      mockPrisma.resource.findUnique.mockResolvedValue(makeResource());
      mockPrisma.$transaction.mockResolvedValue([null, null]);
      const { body } = await request(app.getHttpServer())
        .get(`/resources/${RESOURCE_UUID}`)
        .set('Authorization', `Bearer ${userToken()}`)
        .expect(200);
      expect(body.data.rawText).toBeUndefined();
    });

    it('200 — downloadCount derived from _count', async () => {
      mockPrisma.resource.findUnique.mockResolvedValue(makeResource());
      const { body } = await request(app.getHttpServer())
        .get(`/resources/${RESOURCE_UUID}`)
        .expect(200);
      expect(body.data.downloadCount).toBe(7);
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // RESOURCES — UPDATE
  // ═══════════════════════════════════════════════════════════════════════════

  describe('PATCH /resources/:id', () => {
    beforeEach(() => {
      mockPrisma.resource.findUnique.mockResolvedValue(makeResource());
      mockPrisma.category.findUnique.mockResolvedValue(makeCategory());
      mockPrisma.badge.findUnique.mockResolvedValue(makeBadge());
      mockPrisma.resource.update.mockResolvedValue(
        makeResource({ title: 'Updated Title' }),
      );
      mockPrisma.auditLog.create.mockResolvedValue({});
    });

    it('401 — no token', () =>
      request(app.getHttpServer())
        .patch(`/resources/${RESOURCE_UUID}`)
        .send({ title: 'New' })
        .expect(401));
    it('403 — GUEST rejected', () =>
      request(app.getHttpServer())
        .patch(`/resources/${RESOURCE_UUID}`)
        .set('Authorization', `Bearer ${userToken()}`)
        .send({ title: 'New' })
        .expect(403));
    it('400 — non-UUID id', () =>
      request(app.getHttpServer())
        .patch('/resources/not-a-uuid')
        .set('Authorization', `Bearer ${superAdminToken()}`)
        .send({ title: 'New' })
        .expect(400));

    it('404 in body — resource not found', async () => {
      mockPrisma.resource.findUnique.mockResolvedValue(null);
      const { body } = await request(app.getHttpServer())
        .patch(`/resources/${RESOURCE_UUID}`)
        .set('Authorization', `Bearer ${superAdminToken()}`)
        .send({ title: 'New' })
        .expect(200);
      expect(body.statusCode).toBe(404);
    });

    it('404 in body — new categoryId not found', async () => {
      mockPrisma.category.findUnique.mockResolvedValue(null);
      const { body } = await request(app.getHttpServer())
        .patch(`/resources/${RESOURCE_UUID}`)
        .set('Authorization', `Bearer ${superAdminToken()}`)
        .send({ categoryId: CATEGORY_UUID })
        .expect(200);
      expect(body.message).toMatch(/category not found/i);
    });

    it('404 in body — new badgeId not found', async () => {
      mockPrisma.badge.findUnique.mockResolvedValue(null);
      const { body } = await request(app.getHttpServer())
        .patch(`/resources/${RESOURCE_UUID}`)
        .set('Authorization', `Bearer ${superAdminToken()}`)
        .send({ badgeId: BADGE_UUID })
        .expect(200);
      expect(body.message).toMatch(/badge not found/i);
    });

    it('200 — updates metadata and creates audit log', async () => {
      const { body } = await request(app.getHttpServer())
        .patch(`/resources/${RESOURCE_UUID}`)
        .set('Authorization', `Bearer ${superAdminToken()}`)
        .send({ title: 'Updated Title', sector: 'Health' })
        .expect(200);
      expect(body.status).toBe(true);
      expect(mockPrisma.auditLog.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ action: 'RESOURCE_UPDATED' }),
        }),
      );
    });

    it('200 — updates tags via set', async () => {
      await request(app.getHttpServer())
        .patch(`/resources/${RESOURCE_UUID}`)
        .set('Authorization', `Bearer ${superAdminToken()}`)
        .send({ tagIds: [TAG_UUID] })
        .expect(200);
      expect(mockPrisma.resource.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ tags: { set: [{ id: TAG_UUID }] } }),
        }),
      );
    });

    it('200 — DOCUMENT file replacement: deletes old blob, uploads new, re-runs OCR', async () => {
      mockAzure.upload.mockResolvedValue(
        'https://blob.example.com/resources/new-file.pdf',
      );
      mockOcr.extractText.mockResolvedValue('New extracted text.');
      const { body } = await request(app.getHttpServer())
        .patch(`/resources/${RESOURCE_UUID}`)
        .set('Authorization', `Bearer ${superAdminToken()}`)
        .attach('file', fakePdf(), {
          filename: 'new.pdf',
          contentType: 'application/pdf',
        })
        .expect(200);
      expect(body.status).toBe(true);
      expect(mockAzure.delete).toHaveBeenCalledWith(
        'https://blob.example.com/resources/handbook.pdf',
        'resources',
      );
      expect(mockAzure.upload).toHaveBeenCalledWith(
        expect.objectContaining({ mimetype: 'application/pdf' }),
        'resources',
      );
      expect(mockOcr.extractText).toHaveBeenCalled();
      expect(mockPrisma.resource.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            contentUrl: 'https://blob.example.com/resources/new-file.pdf',
          }),
        }),
      );
    });

    it('200 — VIDEO externalUrl update: no file upload', async () => {
      await request(app.getHttpServer())
        .patch(`/resources/${RESOURCE_UUID}`)
        .set('Authorization', `Bearer ${superAdminToken()}`)
        .send({ externalUrl: 'https://youtube.com/watch?v=newvid' })
        .expect(200);
      expect(mockAzure.upload).not.toHaveBeenCalled();
      expect(mockPrisma.resource.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            contentUrl: 'https://youtube.com/watch?v=newvid',
          }),
        }),
      );
    });

    it('200 — ARTICLE body update: stored as rawText', async () => {
      await request(app.getHttpServer())
        .patch(`/resources/${RESOURCE_UUID}`)
        .set('Authorization', `Bearer ${superAdminToken()}`)
        .send({ articleBody: 'Updated article content.' })
        .expect(200);
      expect(mockAzure.upload).not.toHaveBeenCalled();
      expect(mockPrisma.resource.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            rawText: 'Updated article content.',
          }),
        }),
      );
    });

    it('200 — rawText not exposed in update response', async () => {
      const { body } = await request(app.getHttpServer())
        .patch(`/resources/${RESOURCE_UUID}`)
        .set('Authorization', `Bearer ${superAdminToken()}`)
        .send({ title: 'Updated' })
        .expect(200);
      expect(body.data?.rawText).toBeUndefined();
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // RESOURCES — DELETE
  // ═══════════════════════════════════════════════════════════════════════════

  describe('DELETE /resources/:id', () => {
    beforeEach(() => {
      mockPrisma.downloadLog.deleteMany.mockResolvedValue({});
      mockPrisma.resource.delete.mockResolvedValue({});
      mockPrisma.auditLog.create.mockResolvedValue({});
    });

    it('401 — no token', () =>
      request(app.getHttpServer())
        .delete(`/resources/${RESOURCE_UUID}`)
        .expect(401));
    it('403 — GUEST rejected', () =>
      request(app.getHttpServer())
        .delete(`/resources/${RESOURCE_UUID}`)
        .set('Authorization', `Bearer ${userToken()}`)
        .expect(403));
    it('400 — non-UUID id', () =>
      request(app.getHttpServer())
        .delete('/resources/not-a-uuid')
        .set('Authorization', `Bearer ${superAdminToken()}`)
        .expect(400));

    it('404 in body — not found', async () => {
      mockPrisma.resource.findUnique.mockResolvedValue(null);
      const { body } = await request(app.getHttpServer())
        .delete(`/resources/${RESOURCE_UUID}`)
        .set('Authorization', `Bearer ${superAdminToken()}`)
        .expect(200);
      expect(body.statusCode).toBe(404);
    });

    it('200 — deletes Azure blob when contentUrl present', async () => {
      mockPrisma.resource.findUnique.mockResolvedValue(makeResource());
      await request(app.getHttpServer())
        .delete(`/resources/${RESOURCE_UUID}`)
        .set('Authorization', `Bearer ${superAdminToken()}`)
        .expect(200);
      expect(mockAzure.delete).toHaveBeenCalledWith(
        'https://blob.example.com/resources/handbook.pdf',
        'resources',
      );
    });

    it('200 — no Azure call when contentUrl null', async () => {
      mockPrisma.resource.findUnique.mockResolvedValue(
        makeResource({ contentUrl: null }),
      );
      const { body } = await request(app.getHttpServer())
        .delete(`/resources/${RESOURCE_UUID}`)
        .set('Authorization', `Bearer ${superAdminToken()}`)
        .expect(200);
      expect(body.status).toBe(true);
      expect(mockAzure.delete).not.toHaveBeenCalled();
    });

    it('200 — cascade-deletes download logs and creates audit log', async () => {
      mockPrisma.resource.findUnique.mockResolvedValue(makeResource());
      await request(app.getHttpServer())
        .delete(`/resources/${RESOURCE_UUID}`)
        .set('Authorization', `Bearer ${superAdminToken()}`)
        .expect(200);
      expect(mockPrisma.downloadLog.deleteMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { resourceId: RESOURCE_UUID } }),
      );
      expect(mockPrisma.auditLog.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ action: 'RESOURCE_DELETED' }),
        }),
      );
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // DOWNLOAD
  // ═══════════════════════════════════════════════════════════════════════════

  describe('POST /resources/:id/download', () => {
    beforeEach(() => {
      mockPrisma.resource.findUnique.mockResolvedValue(makeResource());
      mockPrisma.downloadLog.create.mockResolvedValue({});
    });

    it('401 — no token', () =>
      request(app.getHttpServer())
        .post(`/resources/${RESOURCE_UUID}/download`)
        .expect(401));
    it('400 — non-UUID id', () =>
      request(app.getHttpServer())
        .post('/resources/not-a-uuid/download')
        .set('Authorization', `Bearer ${userToken()}`)
        .expect(400));

    it('404 in body — resource not found', async () => {
      mockPrisma.resource.findUnique.mockResolvedValue(null);
      const { body } = await request(app.getHttpServer())
        .post(`/resources/${RESOURCE_UUID}/download`)
        .set('Authorization', `Bearer ${userToken()}`)
        .expect(201);
      expect(body.statusCode).toBe(404);
    });

    it('400 in body — no downloadable file', async () => {
      mockPrisma.resource.findUnique.mockResolvedValue(
        makeResource({ contentUrl: null }),
      );
      const { body } = await request(app.getHttpServer())
        .post(`/resources/${RESOURCE_UUID}/download`)
        .set('Authorization', `Bearer ${userToken()}`)
        .expect(201);
      expect(body.statusCode).toBe(400);
      expect(body.message).toMatch(/no downloadable file/i);
    });

    it('201 — records download log and returns downloadUrl only (no points/badge)', async () => {
      const { body } = await request(app.getHttpServer())
        .post(`/resources/${RESOURCE_UUID}/download`)
        .set('Authorization', `Bearer ${userToken()}`)
        .expect(201);
      expect(body.status).toBe(true);
      expect(body.downloadUrl).toBe(
        'https://blob.example.com/resources/handbook.pdf',
      );
      expect(mockPrisma.downloadLog.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: { userId: USER_UUID, resourceId: RESOURCE_UUID },
        }),
      );
      // Points and badge are NO LONGER awarded on download
      expect(body.pointsEarned).toBeUndefined();
      expect(body.newBadges).toBeUndefined();
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // VIEW (POST /:id/view)
  // ═══════════════════════════════════════════════════════════════════════════

  describe('POST /resources/:id/view', () => {
    it('401 — no token', () =>
      request(app.getHttpServer())
        .post(`/resources/${RESOURCE_UUID}/view`)
        .expect(401));
    it('400 — non-UUID id', () =>
      request(app.getHttpServer())
        .post('/resources/not-a-uuid/view')
        .set('Authorization', `Bearer ${userToken()}`)
        .expect(400));

    it('404 in body — resource not found', async () => {
      mockPrisma.resource.findUnique.mockResolvedValue(null);
      const { body } = await request(app.getHttpServer())
        .post(`/resources/${RESOURCE_UUID}/view`)
        .set('Authorization', `Bearer ${userToken()}`)
        .expect(200);
      expect(body.statusCode).toBe(404);
    });

    it('200 — marks resource as viewed and returns canComplete: true', async () => {
      mockPrisma.resource.findUnique.mockResolvedValue(makeResource());
      mockPrisma.resourceView.upsert.mockResolvedValue({
        id: 'view-001',
        userId: USER_UUID,
        resourceId: RESOURCE_UUID,
        viewedAt: new Date(),
      });
      const { body } = await request(app.getHttpServer())
        .post(`/resources/${RESOURCE_UUID}/view`)
        .set('Authorization', `Bearer ${userToken()}`)
        .expect(200);
      expect(body.status).toBe(true);
      expect(body.canComplete).toBe(true);
      expect(mockPrisma.resourceView.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            userId_resourceId: { userId: USER_UUID, resourceId: RESOURCE_UUID },
          },
        }),
      );
    });

    it('200 — idempotent: calling view twice is safe', async () => {
      mockPrisma.resource.findUnique.mockResolvedValue(makeResource());
      mockPrisma.resourceView.upsert.mockResolvedValue({ id: 'view-001' });
      // Call twice — both should succeed
      await request(app.getHttpServer())
        .post(`/resources/${RESOURCE_UUID}/view`)
        .set('Authorization', `Bearer ${userToken()}`)
        .expect(200);
      await request(app.getHttpServer())
        .post(`/resources/${RESOURCE_UUID}/view`)
        .set('Authorization', `Bearer ${userToken()}`)
        .expect(200);
      expect(mockPrisma.resourceView.upsert).toHaveBeenCalledTimes(2);
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // COMPLETE (POST /:id/complete)
  // ═══════════════════════════════════════════════════════════════════════════

  describe('POST /resources/:id/complete', () => {
    beforeEach(() => {
      mockPrisma.resource.findUnique.mockResolvedValue(makeResource());
      mockPrisma.resourceView.findUnique.mockResolvedValue({
        id: 'view-001',
        userId: USER_UUID,
        resourceId: RESOURCE_UUID,
      });
      mockPrisma.resourceCompletion.findUnique.mockResolvedValue(null);
      mockPrisma.resourceCompletion.create.mockResolvedValue({
        id: 'comp-001',
        pointsEarned: 10,
      });
      mockPrisma.user.findUnique.mockImplementation(({ where }: any) => {
        if (where?.id === USER_UUID)
          return Promise.resolve(makeDbUser({ badges: [] }));
        if (where?.id === SUPER_ADMIN_UUID)
          return Promise.resolve(makeSuperAdmin());
        if (where?.id === RES_ADMIN_UUID)
          return Promise.resolve(makeResourceAdmin());
        return Promise.resolve(null);
      });
      // rewards.award handles points/badge/achievement — mock it to return 60 total points
      mockRewards.award.mockResolvedValue({
        pointsEarned: 10,
        totalPoints: 60,
        badgeAwarded: BADGE_UUID,
        achievementId: 'ach-001',
      });
    });

    it('401 — no token', () =>
      request(app.getHttpServer())
        .post(`/resources/${RESOURCE_UUID}/complete`)
        .expect(401));
    it('400 — non-UUID id', () =>
      request(app.getHttpServer())
        .post('/resources/not-a-uuid/complete')
        .set('Authorization', `Bearer ${userToken()}`)
        .expect(400));

    it('404 in body — resource not found', async () => {
      mockPrisma.resource.findUnique.mockResolvedValue(null);
      const { body } = await request(app.getHttpServer())
        .post(`/resources/${RESOURCE_UUID}/complete`)
        .set('Authorization', `Bearer ${userToken()}`)
        .expect(200);
      expect(body.statusCode).toBe(404);
    });

    it('403 in body — user has not viewed the resource', async () => {
      mockPrisma.resourceView.findUnique.mockResolvedValue(null);
      const { body } = await request(app.getHttpServer())
        .post(`/resources/${RESOURCE_UUID}/complete`)
        .set('Authorization', `Bearer ${userToken()}`)
        .expect(200);
      expect(body.statusCode).toBe(403);
      expect(body.message).toMatch(/view this resource/i);
    });

    it('409 in body — already completed', async () => {
      mockPrisma.resourceCompletion.findUnique.mockResolvedValue({
        id: 'comp-001',
      });
      const { body } = await request(app.getHttpServer())
        .post(`/resources/${RESOURCE_UUID}/complete`)
        .set('Authorization', `Bearer ${userToken()}`)
        .expect(200);
      expect(body.statusCode).toBe(409);
      expect(body.message).toMatch(/already completed/i);
    });

    it('200 — awards points and badge on first completion', async () => {
      const { body } = await request(app.getHttpServer())
        .post(`/resources/${RESOURCE_UUID}/complete`)
        .set('Authorization', `Bearer ${userToken()}`)
        .expect(200);
      expect(body.status).toBe(true);
      expect(body.pointsEarned).toBe(10);
      expect(body.totalPoints).toBe(60);
      expect(body.newBadges).toContain('Resource Champion');
    });

    it('200 — does not re-award badge user already has', async () => {
      // RewardsService handles dedup internally — returns badgeAwarded: null when user already has the badge
      mockRewards.award.mockResolvedValue({
        pointsEarned: 10,
        totalPoints: 60,
        badgeAwarded: null, // null = badge was not connected (user already has it)
        achievementId: 'ach-002',
      });
      const { body } = await request(app.getHttpServer())
        .post(`/resources/${RESOURCE_UUID}/complete`)
        .set('Authorization', `Bearer ${userToken()}`)
        .expect(200);
      expect(body.newBadges).not.toContain('Resource Champion');
    });

    it('200 — no points or badge when resource has 0 points and no badge', async () => {
      mockPrisma.resource.findUnique.mockResolvedValue(
        makeResource({ points: 0, badge: null, badgeId: null }),
      );
      mockRewards.award.mockResolvedValue({
        pointsEarned: 0,
        totalPoints: 50,
        badgeAwarded: null,
        achievementId: 'ach-003',
      });
      const { body } = await request(app.getHttpServer())
        .post(`/resources/${RESOURCE_UUID}/complete`)
        .set('Authorization', `Bearer ${userToken()}`)
        .expect(200);
      expect(body.status).toBe(true);
      expect(body.pointsEarned).toBe(0);
      expect(body.newBadges).toEqual([]);
    });

    it('200 — completion recorded and rewards awarded on success', async () => {
      await request(app.getHttpServer())
        .post(`/resources/${RESOURCE_UUID}/complete`)
        .set('Authorization', `Bearer ${userToken()}`)
        .expect(200);
      // Completion record written directly
      expect(mockPrisma.resourceCompletion.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            userId: USER_UUID,
            resourceId: RESOURCE_UUID,
          }),
        }),
      );
      // RewardsService.award called with the resource's badge and points
      expect(mockRewards.award).toHaveBeenCalledWith(
        expect.objectContaining({ userId: USER_UUID, points: 10 }),
      );
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // BULK DELETE
  // ═══════════════════════════════════════════════════════════════════════════

  describe('DELETE /resources/bulk', () => {
    const ids = [RESOURCE_UUID, 'b9eebc99-9c0b-4ef8-bb6d-6bb9bd380b99'];

    beforeEach(() => {
      mockPrisma.resource.findMany.mockResolvedValue([
        makeResource(),
        makeResource({ id: ids[1], contentUrl: null }),
      ]);
      mockPrisma.downloadLog.deleteMany.mockResolvedValue({});
      mockPrisma.resource.deleteMany.mockResolvedValue({});
      mockPrisma.auditLog.create.mockResolvedValue({});
    });

    it('401 — no token', () =>
      request(app.getHttpServer())
        .delete('/resources/bulk')
        .send({ ids })
        .expect(401));
    it('403 — GUEST rejected', () =>
      request(app.getHttpServer())
        .delete('/resources/bulk')
        .set('Authorization', `Bearer ${userToken()}`)
        .send({ ids })
        .expect(403));

    it('200 — deletes Azure blobs only for resources with contentUrl', async () => {
      await request(app.getHttpServer())
        .delete('/resources/bulk')
        .set('Authorization', `Bearer ${superAdminToken()}`)
        .send({ ids })
        .expect(200);
      expect(mockAzure.delete).toHaveBeenCalledTimes(1);
      expect(mockAzure.delete).toHaveBeenCalledWith(
        'https://blob.example.com/resources/handbook.pdf',
        'resources',
      );
    });

    it('200 — bulk deletes logs, resources, audit log', async () => {
      const { body } = await request(app.getHttpServer())
        .delete('/resources/bulk')
        .set('Authorization', `Bearer ${superAdminToken()}`)
        .send({ ids })
        .expect(200);
      expect(body.status).toBe(true);
      expect(body.message).toMatch(/2 resource\(s\) deleted/);
      expect(mockPrisma.downloadLog.deleteMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { resourceId: { in: ids } } }),
      );
      expect(mockPrisma.resource.deleteMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: { in: ids } } }),
      );
      expect(mockPrisma.auditLog.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ action: 'RESOURCE_BULK_DELETED' }),
        }),
      );
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // BULK MOVE CATEGORY
  // ═══════════════════════════════════════════════════════════════════════════

  describe('PATCH /resources/bulk/move-category', () => {
    const ids = [RESOURCE_UUID];

    it('401 — no token', () =>
      request(app.getHttpServer())
        .patch('/resources/bulk/move-category')
        .send({ ids, targetCategoryId: CATEGORY_UUID })
        .expect(401));
    it('403 — GUEST rejected', () =>
      request(app.getHttpServer())
        .patch('/resources/bulk/move-category')
        .set('Authorization', `Bearer ${userToken()}`)
        .send({ ids, targetCategoryId: CATEGORY_UUID })
        .expect(403));

    it('404 in body — target category not found', async () => {
      mockPrisma.category.findUnique.mockResolvedValue(null);
      const { body } = await request(app.getHttpServer())
        .patch('/resources/bulk/move-category')
        .set('Authorization', `Bearer ${superAdminToken()}`)
        .send({ ids, targetCategoryId: CATEGORY_UUID })
        .expect(200);
      expect(body.statusCode).toBe(404);
      expect(body.message).toMatch(/target category not found/i);
    });

    it('200 — moves resources and creates audit log', async () => {
      mockPrisma.category.findUnique.mockResolvedValue(makeCategory());
      mockPrisma.resource.updateMany.mockResolvedValue({ count: 1 });
      mockPrisma.auditLog.create.mockResolvedValue({});
      const { body } = await request(app.getHttpServer())
        .patch('/resources/bulk/move-category')
        .set('Authorization', `Bearer ${superAdminToken()}`)
        .send({ ids, targetCategoryId: CATEGORY_UUID })
        .expect(200);
      expect(body.status).toBe(true);
      expect(body.message).toMatch(/moved to/i);
      expect(mockPrisma.resource.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: { in: ids } },
          data: { categoryId: CATEGORY_UUID },
        }),
      );
      expect(mockPrisma.auditLog.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ action: 'RESOURCE_BULK_MOVED' }),
        }),
      );
    });
  });
});
