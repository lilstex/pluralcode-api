import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { JwtService, JwtModule } from '@nestjs/jwt';
import { Reflector } from '@nestjs/core';
import { PassportModule } from '@nestjs/passport';
import { ConfigModule, ConfigService } from '@nestjs/config';
import request from 'supertest';
import { Role } from '@prisma/client';

import { NewsController } from 'src/news/controller/news.controller';
import { NewsService } from 'src/news/service/news.service';
import { JwtStrategy } from 'src/common/strategies/jwt.strategy';
import { JwtAuthGuard } from 'src/common/guards/jwt-auth.guard';
import { OptionalJwtGuard } from 'src/common/guards/optional-jwt.guard';
import { RolesGuard } from 'src/common/guards/roles.guard';
import { PrismaService } from 'src/prisma-module/prisma.service';
import { AzureBlobService } from 'src/providers/azure/azure.blob.service';

// ─────────────────────────────────────────────────────────────────────────────
// CONSTANTS
// ─────────────────────────────────────────────────────────────────────────────

const JWT_SECRET = 'test-secret-do-not-use-in-prod';
const ADMIN_UUID = 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11';
const CONTENT_UUID = 'b1ffcd00-0d1c-4ef8-bb6d-6bb9bd380a22';
const USER_UUID = 'c2eebc99-9c0b-4ef8-bb6d-6bb9bd380a33';
const POST_UUID = 'd3eebc99-9c0b-4ef8-bb6d-6bb9bd380a44';

// ─────────────────────────────────────────────────────────────────────────────
// FIXTURES
// ─────────────────────────────────────────────────────────────────────────────

function makeAuthor(id = ADMIN_UUID): any {
  return { id, fullName: 'Admin User', avatarUrl: null };
}

function makePost(overrides: Record<string, any> = {}): any {
  return {
    id: POST_UUID,
    title: 'NGO Governance Summit 2025',
    slug: 'ngo-governance-summit-2025',
    type: 'NEWS',
    body: '<p>Full article body here.</p>',
    excerpt: 'Full article body here.',
    thumbnailUrl: null,
    attachments: [],
    status: 'PUBLISHED',
    publishedAt: new Date('2025-03-01'),
    tags: ['governance', 'ngo'],
    viewCount: 42,
    authorId: ADMIN_UUID,
    author: makeAuthor(),
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

function makeAdminUser(): any {
  return {
    id: ADMIN_UUID,
    email: 'admin@example.com',
    role: Role.SUPER_ADMIN,
    status: 'APPROVED',
    adminPermission: null,
  };
}
function makeContentUser(): any {
  return {
    id: CONTENT_UUID,
    email: 'content@example.com',
    role: Role.CONTENT_ADMIN,
    status: 'APPROVED',
    adminPermission: null,
  };
}
function makeNormalUser(): any {
  return {
    id: USER_UUID,
    email: 'user@example.com',
    role: Role.GUEST,
    status: 'APPROVED',
    adminPermission: null,
  };
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

// ─────────────────────────────────────────────────────────────────────────────
// MOCK PRISMA
// ─────────────────────────────────────────────────────────────────────────────

const mockPrisma = {
  user: { findUnique: jest.fn() },
  newsPost: {
    findUnique: jest.fn(),
    findFirst: jest.fn(),
    findMany: jest.fn(),
    count: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
  },
  $transaction: jest.fn(),
};

const mockAzure = {
  upload: jest.fn(),
  delete: jest.fn(),
};

// ─────────────────────────────────────────────────────────────────────────────
// BOOTSTRAP
// ─────────────────────────────────────────────────────────────────────────────

process.env.JWT_SECRET = JWT_SECRET;
let jwtService: JwtService;

describe('News Module — E2E', () => {
  let app: INestApplication;

  const tok = (sub: string, role: string) => () =>
    jwtService.sign({ sub, email: `${role}@test.com`, role });

  let adminToken: () => string;
  let contentToken: () => string;
  let userToken: () => string;

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
      controllers: [NewsController],
      providers: [
        NewsService,
        JwtStrategy,
        Reflector,
        RolesGuard,
        JwtAuthGuard,
        OptionalJwtGuard,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: AzureBlobService, useValue: mockAzure },
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
    adminToken = tok(ADMIN_UUID, Role.SUPER_ADMIN);
    contentToken = tok(CONTENT_UUID, Role.CONTENT_ADMIN);
    userToken = tok(USER_UUID, Role.GUEST);
  });

  afterAll(() => app.close());

  beforeEach(() => {
    jest.resetAllMocks();

    mockAzure.upload.mockResolvedValue(
      'https://blob.example.com/news/image.jpg',
    );
    mockAzure.delete.mockResolvedValue(undefined);

    mockPrisma.user.findUnique.mockImplementation(({ where }: any) => {
      const map: Record<string, any> = {
        [ADMIN_UUID]: makeAdminUser(),
        [CONTENT_UUID]: makeContentUser(),
        [USER_UUID]: makeNormalUser(),
      };
      return Promise.resolve(map[where.id] ?? null);
    });

    mockPrisma.$transaction.mockImplementation((arg: any) =>
      Array.isArray(arg) ? Promise.all(arg) : arg(mockPrisma),
    );
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // CREATE
  // ═══════════════════════════════════════════════════════════════════════════

  describe('POST /news', () => {
    it('401 — no token', () =>
      request(app.getHttpServer())
        .post('/news')
        .send({ title: 'T', type: 'NEWS', body: 'B' })
        .expect(401));

    it('403 — GUEST cannot create', () =>
      request(app.getHttpServer())
        .post('/news')
        .set('Authorization', `Bearer ${userToken()}`)
        .send({ title: 'T', type: 'NEWS', body: 'B' })
        .expect(403));

    it('400 — missing title (ValidationPipe)', () =>
      request(app.getHttpServer())
        .post('/news')
        .set('Authorization', `Bearer ${adminToken()}`)
        .send({ type: 'NEWS', body: 'B' })
        .expect(400));

    it('400 — missing type (ValidationPipe)', () =>
      request(app.getHttpServer())
        .post('/news')
        .set('Authorization', `Bearer ${adminToken()}`)
        .send({ title: 'T', body: 'B' })
        .expect(400));

    it('400 — missing body (ValidationPipe)', () =>
      request(app.getHttpServer())
        .post('/news')
        .set('Authorization', `Bearer ${adminToken()}`)
        .send({ title: 'T', type: 'NEWS' })
        .expect(400));

    it('201 — SUPER_ADMIN creates post as DRAFT', async () => {
      mockPrisma.newsPost.findUnique.mockResolvedValue(null); // no slug collision
      mockPrisma.newsPost.create.mockResolvedValue(
        makePost({ status: 'DRAFT', publishedAt: null }),
      );

      const { body } = await request(app.getHttpServer())
        .post('/news')
        .set('Authorization', `Bearer ${adminToken()}`)
        .send({
          title: 'NGO Governance Summit 2025',
          type: 'NEWS',
          body: '<p>Body text.</p>',
        })
        .expect(201);

      expect(body.status).toBe(true);
      expect(body.data.status).toBe('DRAFT');
      expect(mockPrisma.newsPost.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            status: 'DRAFT',
            slug: 'ngo-governance-summit-2025',
          }),
        }),
      );
    });

    it('201 — CONTENT_ADMIN can also create', async () => {
      mockPrisma.newsPost.findUnique.mockResolvedValue(null);
      mockPrisma.newsPost.create.mockResolvedValue(
        makePost({ status: 'DRAFT' }),
      );

      const { body } = await request(app.getHttpServer())
        .post('/news')
        .set('Authorization', `Bearer ${contentToken()}`)
        .send({ title: 'T', type: 'BLOG', body: 'B' })
        .expect(201);

      expect(body.status).toBe(true);
    });

    it('201 — excerpt auto-derived from body when not provided', async () => {
      mockPrisma.newsPost.findUnique.mockResolvedValue(null);
      mockPrisma.newsPost.create.mockResolvedValue(makePost());

      await request(app.getHttpServer())
        .post('/news')
        .set('Authorization', `Bearer ${adminToken()}`)
        .send({ title: 'T', type: 'NEWS', body: '<p>Hello world.</p>' })
        .expect(201);

      expect(mockPrisma.newsPost.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ excerpt: 'Hello world.' }),
        }),
      );
    });

    it('201 — provided excerpt is used as-is', async () => {
      mockPrisma.newsPost.findUnique.mockResolvedValue(null);
      mockPrisma.newsPost.create.mockResolvedValue(makePost());

      await request(app.getHttpServer())
        .post('/news')
        .set('Authorization', `Bearer ${adminToken()}`)
        .send({
          title: 'T',
          type: 'NEWS',
          body: '<p>Long body.</p>',
          excerpt: 'Custom excerpt.',
        })
        .expect(201);

      expect(mockPrisma.newsPost.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ excerpt: 'Custom excerpt.' }),
        }),
      );
    });

    it('201 — slug collision resolved by appending counter', async () => {
      // First findUnique (slug check) returns existing post → collision
      // Second findUnique (slug-2 check) returns null → available
      mockPrisma.newsPost.findUnique
        .mockResolvedValueOnce(makePost()) // 'ngo-governance-summit-2025' taken
        .mockResolvedValueOnce(null); // 'ngo-governance-summit-2025-2' free
      mockPrisma.newsPost.create.mockResolvedValue(
        makePost({ slug: 'ngo-governance-summit-2025-2' }),
      );

      await request(app.getHttpServer())
        .post('/news')
        .set('Authorization', `Bearer ${adminToken()}`)
        .send({ title: 'NGO Governance Summit 2025', type: 'NEWS', body: 'B' })
        .expect(201);

      expect(mockPrisma.newsPost.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            slug: 'ngo-governance-summit-2025-2',
          }),
        }),
      );
    });

    it('201 — custom type string accepted (not restricted to known enums)', async () => {
      mockPrisma.newsPost.findUnique.mockResolvedValue(null);
      mockPrisma.newsPost.create.mockResolvedValue(
        makePost({ type: 'PODCAST' }),
      );

      const { body } = await request(app.getHttpServer())
        .post('/news')
        .set('Authorization', `Bearer ${adminToken()}`)
        .send({ title: 'T', type: 'PODCAST', body: 'B' })
        .expect(201);

      expect(body.status).toBe(true);
      expect(mockPrisma.newsPost.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ type: 'PODCAST' }),
        }),
      );
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // UPDATE
  // ═══════════════════════════════════════════════════════════════════════════

  describe('PATCH /news/:id', () => {
    it('401 — no token', () =>
      request(app.getHttpServer())
        .patch(`/news/${POST_UUID}`)
        .send({ title: 'New' })
        .expect(401));

    it('403 — GUEST rejected', () =>
      request(app.getHttpServer())
        .patch(`/news/${POST_UUID}`)
        .set('Authorization', `Bearer ${userToken()}`)
        .send({ title: 'New' })
        .expect(403));

    it('400 — non-UUID id (ParseUUIDPipe)', () =>
      request(app.getHttpServer())
        .patch('/news/not-a-uuid')
        .set('Authorization', `Bearer ${adminToken()}`)
        .send({ title: 'New' })
        .expect(400));

    it('404 in body — post not found', async () => {
      mockPrisma.newsPost.findUnique.mockResolvedValue(null);
      const { body } = await request(app.getHttpServer())
        .patch(`/news/${POST_UUID}`)
        .set('Authorization', `Bearer ${adminToken()}`)
        .send({ title: 'New Title' })
        .expect(200);
      expect(body.statusCode).toBe(404);
    });

    it('200 — updates title (slug unchanged)', async () => {
      mockPrisma.newsPost.findUnique.mockResolvedValue(makePost());
      mockPrisma.newsPost.update.mockResolvedValue(
        makePost({ title: 'Updated Title' }),
      );

      const { body } = await request(app.getHttpServer())
        .patch(`/news/${POST_UUID}`)
        .set('Authorization', `Bearer ${adminToken()}`)
        .send({ title: 'Updated Title' })
        .expect(200);

      expect(body.status).toBe(true);
      // Slug must NOT change
      expect(mockPrisma.newsPost.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.not.objectContaining({ slug: expect.anything() }),
        }),
      );
    });

    it('200 — excerpt re-derived when body updated without excerpt', async () => {
      mockPrisma.newsPost.findUnique.mockResolvedValue(makePost());
      mockPrisma.newsPost.update.mockResolvedValue(makePost());

      await request(app.getHttpServer())
        .patch(`/news/${POST_UUID}`)
        .set('Authorization', `Bearer ${adminToken()}`)
        .send({ body: '<p>New body content.</p>' })
        .expect(200);

      expect(mockPrisma.newsPost.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ excerpt: 'New body content.' }),
        }),
      );
    });

    it('200 — CONTENT_ADMIN can update', async () => {
      mockPrisma.newsPost.findUnique.mockResolvedValue(makePost());
      mockPrisma.newsPost.update.mockResolvedValue(makePost({ type: 'BLOG' }));

      const { body } = await request(app.getHttpServer())
        .patch(`/news/${POST_UUID}`)
        .set('Authorization', `Bearer ${contentToken()}`)
        .send({ type: 'BLOG' })
        .expect(200);

      expect(body.status).toBe(true);
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // PUBLISH / ARCHIVE
  // ═══════════════════════════════════════════════════════════════════════════

  describe('PATCH /news/:id/publish', () => {
    it('401 — no token', () =>
      request(app.getHttpServer())
        .patch(`/news/${POST_UUID}/publish`)
        .expect(401));

    it('403 — GUEST rejected', () =>
      request(app.getHttpServer())
        .patch(`/news/${POST_UUID}/publish`)
        .set('Authorization', `Bearer ${userToken()}`)
        .expect(403));

    it('404 in body — post not found', async () => {
      mockPrisma.newsPost.findUnique.mockResolvedValue(null);
      const { body } = await request(app.getHttpServer())
        .patch(`/news/${POST_UUID}/publish`)
        .set('Authorization', `Bearer ${adminToken()}`)
        .expect(200);
      expect(body.statusCode).toBe(404);
    });

    it('200 — publishes post and sets publishedAt', async () => {
      mockPrisma.newsPost.findUnique.mockResolvedValue(
        makePost({ status: 'DRAFT', publishedAt: null }),
      );
      mockPrisma.newsPost.update.mockResolvedValue(
        makePost({ status: 'PUBLISHED', publishedAt: new Date() }),
      );

      const { body } = await request(app.getHttpServer())
        .patch(`/news/${POST_UUID}/publish`)
        .set('Authorization', `Bearer ${adminToken()}`)
        .expect(200);

      expect(body.status).toBe(true);
      expect(body.data.status).toBe('PUBLISHED');
      expect(mockPrisma.newsPost.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ status: 'PUBLISHED' }),
        }),
      );
    });

    it('200 — republishing preserves original publishedAt date', async () => {
      const originalDate = new Date('2025-01-01');
      mockPrisma.newsPost.findUnique.mockResolvedValue(
        makePost({ status: 'ARCHIVED', publishedAt: originalDate }),
      );
      mockPrisma.newsPost.update.mockResolvedValue(
        makePost({ status: 'PUBLISHED', publishedAt: originalDate }),
      );

      await request(app.getHttpServer())
        .patch(`/news/${POST_UUID}/publish`)
        .set('Authorization', `Bearer ${adminToken()}`)
        .expect(200);

      expect(mockPrisma.newsPost.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ publishedAt: originalDate }),
        }),
      );
    });
  });

  describe('PATCH /news/:id/archive', () => {
    it('401 — no token', () =>
      request(app.getHttpServer())
        .patch(`/news/${POST_UUID}/archive`)
        .expect(401));

    it('404 in body — post not found', async () => {
      mockPrisma.newsPost.findUnique.mockResolvedValue(null);
      const { body } = await request(app.getHttpServer())
        .patch(`/news/${POST_UUID}/archive`)
        .set('Authorization', `Bearer ${adminToken()}`)
        .expect(200);
      expect(body.statusCode).toBe(404);
    });

    it('200 — archives post', async () => {
      mockPrisma.newsPost.findUnique.mockResolvedValue(
        makePost({ status: 'PUBLISHED' }),
      );
      mockPrisma.newsPost.update.mockResolvedValue(
        makePost({ status: 'ARCHIVED' }),
      );

      const { body } = await request(app.getHttpServer())
        .patch(`/news/${POST_UUID}/archive`)
        .set('Authorization', `Bearer ${adminToken()}`)
        .expect(200);

      expect(body.status).toBe(true);
      expect(body.data.status).toBe('ARCHIVED');
      expect(mockPrisma.newsPost.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ status: 'ARCHIVED' }),
        }),
      );
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // THUMBNAIL
  // ═══════════════════════════════════════════════════════════════════════════

  describe('POST /news/:id/thumbnail', () => {
    it('401 — no token', () =>
      request(app.getHttpServer())
        .post(`/news/${POST_UUID}/thumbnail`)
        .expect(401));

    it('403 — GUEST rejected', () =>
      request(app.getHttpServer())
        .post(`/news/${POST_UUID}/thumbnail`)
        .set('Authorization', `Bearer ${userToken()}`)
        .expect(403));

    it('404 in body — post not found', async () => {
      mockPrisma.newsPost.findUnique.mockResolvedValue(null);
      const { body } = await request(app.getHttpServer())
        .post(`/news/${POST_UUID}/thumbnail`)
        .set('Authorization', `Bearer ${adminToken()}`)
        .attach('file', fakePng(), {
          filename: 'thumb.png',
          contentType: 'image/png',
        })
        .expect(201);
      expect(body.statusCode).toBe(404);
    });

    it('201 — uploads thumbnail, deletes old blob if present', async () => {
      mockPrisma.newsPost.findUnique.mockResolvedValue(
        makePost({ thumbnailUrl: 'https://blob.example.com/old.jpg' }),
      );
      mockPrisma.newsPost.update.mockResolvedValue(
        makePost({ thumbnailUrl: 'https://blob.example.com/news/image.jpg' }),
      );

      const { body } = await request(app.getHttpServer())
        .post(`/news/${POST_UUID}/thumbnail`)
        .set('Authorization', `Bearer ${adminToken()}`)
        .attach('file', fakePng(), {
          filename: 'thumb.png',
          contentType: 'image/png',
        })
        .expect(201);

      expect(body.status).toBe(true);
      expect(body.thumbnailUrl).toBe('https://blob.example.com/news/image.jpg');
      expect(mockAzure.delete).toHaveBeenCalledWith(
        'https://blob.example.com/old.jpg',
        'news',
      );
      expect(mockAzure.upload).toHaveBeenCalled();
    });

    it('201 — no Azure delete when no existing thumbnail', async () => {
      mockPrisma.newsPost.findUnique.mockResolvedValue(
        makePost({ thumbnailUrl: null }),
      );
      mockPrisma.newsPost.update.mockResolvedValue(makePost());

      await request(app.getHttpServer())
        .post(`/news/${POST_UUID}/thumbnail`)
        .set('Authorization', `Bearer ${adminToken()}`)
        .attach('file', fakePng(), {
          filename: 'thumb.png',
          contentType: 'image/png',
        })
        .expect(201);

      expect(mockAzure.delete).not.toHaveBeenCalled();
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // ATTACHMENTS — ADD
  // ═══════════════════════════════════════════════════════════════════════════

  describe('POST /news/:id/attachments', () => {
    it('401 — no token', () =>
      request(app.getHttpServer())
        .post(`/news/${POST_UUID}/attachments`)
        .expect(401));

    it('403 — GUEST rejected', () =>
      request(app.getHttpServer())
        .post(`/news/${POST_UUID}/attachments`)
        .set('Authorization', `Bearer ${userToken()}`)
        .expect(403));

    it('404 in body — post not found', async () => {
      mockPrisma.newsPost.findUnique.mockResolvedValue(null);
      const { body } = await request(app.getHttpServer())
        .post(`/news/${POST_UUID}/attachments`)
        .set('Authorization', `Bearer ${adminToken()}`)
        .attach('files', Buffer.from('file content'), {
          filename: 'doc.pdf',
          contentType: 'application/pdf',
        })
        .expect(201);
      expect(body.statusCode).toBe(404);
    });

    it('201 — uploads attachment and appends to array', async () => {
      mockPrisma.newsPost.findUnique.mockResolvedValue(
        makePost({ attachments: [] }),
      );
      mockAzure.upload.mockResolvedValue(
        'https://blob.example.com/news-attachments/doc.pdf',
      );
      mockPrisma.newsPost.update.mockResolvedValue(
        makePost({
          attachments: [
            {
              name: 'doc.pdf',
              url: 'https://blob.example.com/news-attachments/doc.pdf',
              size: 100,
            },
          ],
        }),
      );

      const { body } = await request(app.getHttpServer())
        .post(`/news/${POST_UUID}/attachments`)
        .set('Authorization', `Bearer ${adminToken()}`)
        .attach('files', Buffer.from('pdf content'), {
          filename: 'doc.pdf',
          contentType: 'application/pdf',
        })
        .expect(201);

      expect(body.status).toBe(true);
      expect(body.attachments).toHaveLength(1);
      expect(mockAzure.upload).toHaveBeenCalledWith(
        expect.objectContaining({ originalname: 'doc.pdf' }),
        'news-attachments',
      );
    });

    it('201 — existing attachments preserved when adding new ones', async () => {
      const existing = [
        { name: 'old.pdf', url: 'https://blob.example.com/old.pdf', size: 200 },
      ];
      mockPrisma.newsPost.findUnique.mockResolvedValue(
        makePost({ attachments: existing }),
      );
      mockAzure.upload.mockResolvedValue('https://blob.example.com/new.pdf');
      mockPrisma.newsPost.update.mockResolvedValue(
        makePost({
          attachments: [
            ...existing,
            {
              name: 'new.pdf',
              url: 'https://blob.example.com/new.pdf',
              size: 100,
            },
          ],
        }),
      );

      const { body } = await request(app.getHttpServer())
        .post(`/news/${POST_UUID}/attachments`)
        .set('Authorization', `Bearer ${adminToken()}`)
        .attach('files', Buffer.from('content'), {
          filename: 'new.pdf',
          contentType: 'application/pdf',
        })
        .expect(201);

      expect(body.status).toBe(true);
      expect(mockPrisma.newsPost.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            attachments: expect.arrayContaining([
              expect.objectContaining({ name: 'old.pdf' }),
              expect.objectContaining({ name: 'new.pdf' }),
            ]),
          }),
        }),
      );
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // ATTACHMENTS — DELETE
  // ═══════════════════════════════════════════════════════════════════════════

  describe('DELETE /news/:id/attachments/:attachmentIndex', () => {
    const attachments = [
      { name: 'doc1.pdf', url: 'https://blob.example.com/doc1.pdf', size: 100 },
      { name: 'doc2.pdf', url: 'https://blob.example.com/doc2.pdf', size: 200 },
    ];

    it('401 — no token', () =>
      request(app.getHttpServer())
        .delete(`/news/${POST_UUID}/attachments/0`)
        .expect(401));

    it('403 — GUEST rejected', () =>
      request(app.getHttpServer())
        .delete(`/news/${POST_UUID}/attachments/0`)
        .set('Authorization', `Bearer ${userToken()}`)
        .expect(403));

    it('400 — non-UUID post id (ParseUUIDPipe)', () =>
      request(app.getHttpServer())
        .delete('/news/not-a-uuid/attachments/0')
        .set('Authorization', `Bearer ${adminToken()}`)
        .expect(400));

    it('400 — non-integer attachmentIndex (ParseIntPipe)', () =>
      request(app.getHttpServer())
        .delete(`/news/${POST_UUID}/attachments/abc`)
        .set('Authorization', `Bearer ${adminToken()}`)
        .expect(400));

    it('404 in body — post not found', async () => {
      mockPrisma.newsPost.findUnique.mockResolvedValue(null);
      const { body } = await request(app.getHttpServer())
        .delete(`/news/${POST_UUID}/attachments/0`)
        .set('Authorization', `Bearer ${adminToken()}`)
        .expect(200);
      expect(body.statusCode).toBe(404);
    });

    it('400 in body — index out of range', async () => {
      mockPrisma.newsPost.findUnique.mockResolvedValue(
        makePost({ attachments }),
      );
      const { body } = await request(app.getHttpServer())
        .delete(`/news/${POST_UUID}/attachments/5`)
        .set('Authorization', `Bearer ${adminToken()}`)
        .expect(200);
      expect(body.statusCode).toBe(400);
      expect(body.message).toMatch(/out of range/i);
    });

    it('200 — deletes attachment at index, removes from Azure, updates array', async () => {
      const attachments = [
        {
          name: 'doc1.pdf',
          url: 'https://blob.example.com/doc1.pdf',
          size: 100,
        },
        {
          name: 'doc2.pdf',
          url: 'https://blob.example.com/doc2.pdf',
          size: 200,
        },
      ];
      const expectedRemaining = {
        name: 'doc2.pdf',
        url: 'https://blob.example.com/doc2.pdf',
        size: 200,
      };

      mockPrisma.newsPost.findUnique.mockResolvedValue(
        makePost({ attachments }),
      );
      mockPrisma.newsPost.update.mockResolvedValue(
        makePost({ attachments: [expectedRemaining] }),
      );

      const { body } = await request(app.getHttpServer())
        .delete(`/news/${POST_UUID}/attachments/0`)
        .set('Authorization', `Bearer ${adminToken()}`)
        .expect(200);

      expect(body.status).toBe(true);
      expect(mockAzure.delete).toHaveBeenCalledWith(
        'https://blob.example.com/doc1.pdf',
        'news-attachments',
      );
      expect(mockPrisma.newsPost.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            attachments: [expectedRemaining],
          }),
        }),
      );
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // DELETE POST
  // ═══════════════════════════════════════════════════════════════════════════

  describe('DELETE /news/:id', () => {
    it('401 — no token', () =>
      request(app.getHttpServer()).delete(`/news/${POST_UUID}`).expect(401));

    it('403 — CONTENT_ADMIN cannot hard-delete (SUPER_ADMIN only)', () =>
      request(app.getHttpServer())
        .delete(`/news/${POST_UUID}`)
        .set('Authorization', `Bearer ${contentToken()}`)
        .expect(403));

    it('403 — GUEST rejected', () =>
      request(app.getHttpServer())
        .delete(`/news/${POST_UUID}`)
        .set('Authorization', `Bearer ${userToken()}`)
        .expect(403));

    it('400 — non-UUID id (ParseUUIDPipe)', () =>
      request(app.getHttpServer())
        .delete('/news/not-a-uuid')
        .set('Authorization', `Bearer ${adminToken()}`)
        .expect(400));

    it('404 in body — post not found', async () => {
      mockPrisma.newsPost.findUnique.mockResolvedValue(null);
      const { body } = await request(app.getHttpServer())
        .delete(`/news/${POST_UUID}`)
        .set('Authorization', `Bearer ${adminToken()}`)
        .expect(200);
      expect(body.statusCode).toBe(404);
    });

    it('200 — deletes thumbnail and all attachments from Azure before deleting post', async () => {
      const attachments = [
        { name: 'a.pdf', url: 'https://blob.example.com/a.pdf', size: 100 },
        { name: 'b.pdf', url: 'https://blob.example.com/b.pdf', size: 200 },
      ];
      mockPrisma.newsPost.findUnique.mockResolvedValue(
        makePost({
          thumbnailUrl: 'https://blob.example.com/thumb.jpg',
          attachments,
        }),
      );
      mockPrisma.newsPost.delete.mockResolvedValue({});

      const { body } = await request(app.getHttpServer())
        .delete(`/news/${POST_UUID}`)
        .set('Authorization', `Bearer ${adminToken()}`)
        .expect(200);

      expect(body.status).toBe(true);
      expect(mockAzure.delete).toHaveBeenCalledWith(
        'https://blob.example.com/thumb.jpg',
        'news',
      );
      expect(mockAzure.delete).toHaveBeenCalledWith(
        'https://blob.example.com/a.pdf',
        'news-attachments',
      );
      expect(mockAzure.delete).toHaveBeenCalledWith(
        'https://blob.example.com/b.pdf',
        'news-attachments',
      );
    });

    it('200 — deletes post with no assets (no Azure calls for null thumbnailUrl)', async () => {
      mockPrisma.newsPost.findUnique.mockResolvedValue(
        makePost({ thumbnailUrl: null, attachments: [] }),
      );
      mockPrisma.newsPost.delete.mockResolvedValue({});

      const { body } = await request(app.getHttpServer())
        .delete(`/news/${POST_UUID}`)
        .set('Authorization', `Bearer ${adminToken()}`)
        .expect(200);

      expect(body.status).toBe(true);
      expect(mockAzure.delete).not.toHaveBeenCalled();
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // PUBLIC LIST
  // ═══════════════════════════════════════════════════════════════════════════

  describe('GET /news', () => {
    beforeEach(() => {
      mockPrisma.$transaction.mockResolvedValue([[makePost()], 1]);
    });

    it('200 — public, no token needed', async () => {
      const { body } = await request(app.getHttpServer())
        .get('/news')
        .expect(200);
      expect(body.status).toBe(true);
      expect(body.data.posts).toHaveLength(1);
    });

    it('200 — only PUBLISHED posts returned (status filter always applied)', async () => {
      await request(app.getHttpServer()).get('/news').expect(200);
      expect(mockPrisma.newsPost.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ status: 'PUBLISHED' }),
        }),
      );
    });

    it('200 — default pagination: skip=0, take=20', async () => {
      await request(app.getHttpServer()).get('/news').expect(200);
      expect(mockPrisma.newsPost.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ skip: 0, take: 20 }),
      );
    });

    it('200 — page=2&limit=10 → skip=10, take=10', async () => {
      await request(app.getHttpServer())
        .get('/news?page=2&limit=10')
        .expect(200);
      expect(mockPrisma.newsPost.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ skip: 10, take: 10 }),
      );
    });

    it('200 — type filter applied', async () => {
      await request(app.getHttpServer()).get('/news?type=BLOG').expect(200);
      const call = mockPrisma.newsPost.findMany.mock.calls[0][0];
      expect(call.where.type).toMatchObject({
        equals: 'BLOG',
        mode: 'insensitive',
      });
    });

    it('200 — search filter applies across title, excerpt, body', async () => {
      await request(app.getHttpServer())
        .get('/news?search=governance')
        .expect(200);
      const call = mockPrisma.newsPost.findMany.mock.calls[0][0];
      expect(call.where.OR).toHaveLength(3);
    });

    it('200 — tags filter (comma-separated → hasSome)', async () => {
      await request(app.getHttpServer())
        .get('/news?tags=governance,ngo')
        .expect(200);
      const call = mockPrisma.newsPost.findMany.mock.calls[0][0];
      expect(call.where.tags).toEqual({ hasSome: ['governance', 'ngo'] });
    });

    it('200 — orderBy=popular sorts by viewCount desc', async () => {
      await request(app.getHttpServer())
        .get('/news?orderBy=popular')
        .expect(200);
      expect(mockPrisma.newsPost.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ orderBy: { viewCount: 'desc' } }),
      );
    });

    it('200 — orderBy=latest (default) sorts by publishedAt desc', async () => {
      await request(app.getHttpServer()).get('/news').expect(200);
      expect(mockPrisma.newsPost.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ orderBy: { publishedAt: 'desc' } }),
      );
    });

    it('400 — invalid orderBy value (ValidationPipe)', () =>
      request(app.getHttpServer()).get('/news?orderBy=random').expect(400));

    it('200 — dateFrom and dateTo filters applied to publishedAt', async () => {
      await request(app.getHttpServer())
        .get('/news?dateFrom=2024-01-01&dateTo=2024-12-31')
        .expect(200);
      const call = mockPrisma.newsPost.findMany.mock.calls[0][0];
      expect(call.where.publishedAt.gte).toBeInstanceOf(Date);
      expect(call.where.publishedAt.lte).toBeInstanceOf(Date);
    });

    it('200 — correct pagination metadata returned', async () => {
      mockPrisma.$transaction.mockResolvedValue([[makePost()], 55]);
      const { body } = await request(app.getHttpServer())
        .get('/news?page=2&limit=10')
        .expect(200);
      expect(body.data).toMatchObject({
        total: 55,
        page: 2,
        limit: 10,
        pages: 6,
      });
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // ADMIN LIST
  // ═══════════════════════════════════════════════════════════════════════════

  describe('GET /news/admin', () => {
    it('401 — no token', () =>
      request(app.getHttpServer()).get('/news/admin').expect(401));

    it('403 — GUEST rejected', () =>
      request(app.getHttpServer())
        .get('/news/admin')
        .set('Authorization', `Bearer ${userToken()}`)
        .expect(403));

    it('200 — admin can see all statuses (no status filter by default)', async () => {
      mockPrisma.$transaction.mockResolvedValue([
        [
          makePost({ status: 'DRAFT' }),
          makePost({ status: 'PUBLISHED' }),
          makePost({ status: 'ARCHIVED' }),
        ],
        3,
      ]);

      const { body } = await request(app.getHttpServer())
        .get('/news/admin')
        .set('Authorization', `Bearer ${adminToken()}`)
        .expect(200);

      expect(body.data.posts).toHaveLength(3);
      // No status filter in where when none specified
      expect(mockPrisma.newsPost.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.not.objectContaining({ status: expect.anything() }),
        }),
      );
    });

    it('200 — status filter works for admin list', async () => {
      mockPrisma.$transaction.mockResolvedValue([
        [makePost({ status: 'DRAFT' })],
        1,
      ]);

      await request(app.getHttpServer())
        .get('/news/admin?status=DRAFT')
        .set('Authorization', `Bearer ${adminToken()}`)
        .expect(200);

      expect(mockPrisma.newsPost.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ status: 'DRAFT' }),
        }),
      );
    });

    it('400 — invalid status value (ValidationPipe)', () =>
      request(app.getHttpServer())
        .get('/news/admin?status=DELETED')
        .set('Authorization', `Bearer ${adminToken()}`)
        .expect(400));

    it('200 — CONTENT_ADMIN can access admin list', async () => {
      mockPrisma.$transaction.mockResolvedValue([[makePost()], 1]);
      const { body } = await request(app.getHttpServer())
        .get('/news/admin')
        .set('Authorization', `Bearer ${contentToken()}`)
        .expect(200);
      expect(body.status).toBe(true);
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // GET SINGLE
  // ═══════════════════════════════════════════════════════════════════════════

  describe('GET /news/:identifier', () => {
    it('200 — fetch by UUID, increments viewCount', async () => {
      mockPrisma.newsPost.findFirst.mockResolvedValue(makePost());
      mockPrisma.newsPost.update.mockResolvedValue({});

      const { body } = await request(app.getHttpServer())
        .get(`/news/${POST_UUID}`)
        .expect(200);

      expect(body.status).toBe(true);
      expect(body.data.id).toBe(POST_UUID);
      expect(mockPrisma.newsPost.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            id: POST_UUID,
            status: 'PUBLISHED',
          }),
        }),
      );
    });

    it('200 — fetch by slug', async () => {
      mockPrisma.newsPost.findFirst.mockResolvedValue(makePost());
      mockPrisma.newsPost.update.mockResolvedValue({});

      const { body } = await request(app.getHttpServer())
        .get('/news/ngo-governance-summit-2025')
        .expect(200);

      expect(body.status).toBe(true);
      expect(mockPrisma.newsPost.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            slug: 'ngo-governance-summit-2025',
            status: 'PUBLISHED',
          }),
        }),
      );
    });

    it('404 in body — post not found', async () => {
      mockPrisma.newsPost.findFirst.mockResolvedValue(null);
      const { body } = await request(app.getHttpServer())
        .get(`/news/${POST_UUID}`)
        .expect(200);
      expect(body.statusCode).toBe(404);
    });

    it('404 in body — DRAFT post not visible to public', async () => {
      mockPrisma.newsPost.findFirst.mockResolvedValue(null); // service filters status=PUBLISHED
      const { body } = await request(app.getHttpServer())
        .get(`/news/${POST_UUID}`)
        .expect(200);
      expect(body.statusCode).toBe(404);
    });

    it('200 — unauthenticated access allowed', async () => {
      mockPrisma.newsPost.findFirst.mockResolvedValue(makePost());
      mockPrisma.newsPost.update.mockResolvedValue({});
      const { body } = await request(app.getHttpServer())
        .get(`/news/${POST_UUID}`)
        .expect(200);
      expect(body.status).toBe(true);
    });

    it('200 — viewCount incremented (update called with increment:1)', async () => {
      mockPrisma.newsPost.findFirst.mockResolvedValue(
        makePost({ id: POST_UUID }),
      );
      mockPrisma.newsPost.update.mockResolvedValue({});

      await request(app.getHttpServer()).get(`/news/${POST_UUID}`).expect(200);

      // give fire-and-forget a tick to execute
      await new Promise((r) => setTimeout(r, 10));

      expect(mockPrisma.newsPost.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ viewCount: { increment: 1 } }),
        }),
      );
    });
  });
});
