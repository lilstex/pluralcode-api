import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { JwtService, JwtModule } from '@nestjs/jwt';
import { Reflector } from '@nestjs/core';
import { PassportModule } from '@nestjs/passport';
import { ConfigModule, ConfigService } from '@nestjs/config';
import request from 'supertest';
import { Role } from '@prisma/client';

import { CommunityController } from 'src/community/controller/community.controller';
import { CommunityService } from 'src/community/service/community.service';
import { JwtStrategy } from 'src/common/strategies/jwt.strategy';
import { JwtAuthGuard } from 'src/common/guards/jwt-auth.guard';
import { RolesGuard } from 'src/common/guards/roles.guard';
import { PrismaService } from 'src/prisma.service';
import { AzureBlobService } from 'src/providers/azure/azure.blob.service';

const JWT_SECRET = 'test-secret-do-not-use-in-prod';
const ADMIN_UUID = 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11';
const CONTENT_UUID = 'b1ffcd00-0d1c-4ef8-bb6d-6bb9bd380a22';
const USER_UUID = 'c2eebc99-9c0b-4ef8-bb6d-6bb9bd380a33';
const OTHER_UUID = 'd3eebc99-9c0b-4ef8-bb6d-6bb9bd380a44';
const COMMUNITY_UUID = 'e4eebc99-9c0b-4ef8-bb6d-6bb9bd380a55';
const TOPIC_UUID = 'f5eebc99-9c0b-4ef8-bb6d-6bb9bd380a66';
const COMMENT_UUID = 'a1eebc99-9c0b-4ef8-bb6d-6bb9bd380a77';
const REPLY_UUID = 'b2eebc99-9c0b-4ef8-bb6d-6bb9bd380a88';
const MENTION_UUID = 'c3eebc99-9c0b-4ef8-bb6d-6bb9bd380a99';

function makeAuthor(id = USER_UUID): any {
  return { id, fullName: 'Test User', avatarUrl: null };
}
function makeCommunity(overrides: Record<string, any> = {}): any {
  return {
    id: COMMUNITY_UUID,
    name: 'NGO Finance Hub',
    description: 'Discussion.',
    imageUrl: null,
    isActive: true,
    createdById: ADMIN_UUID,
    createdBy: makeAuthor(ADMIN_UUID),
    _count: { memberships: 10, topics: 5 },
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}
function makeMembership(overrides: Record<string, any> = {}): any {
  return {
    id: 'mem-uuid-0001',
    userId: USER_UUID,
    communityId: COMMUNITY_UUID,
    joinedAt: new Date(),
    community: makeCommunity(),
    ...overrides,
  };
}
function makeTopic(overrides: Record<string, any> = {}): any {
  return {
    id: TOPIC_UUID,
    title: 'Best budget planning',
    body: 'How do you handle it?',
    isBlocked: false,
    likeCount: 0,
    communityId: COMMUNITY_UUID,
    authorId: USER_UUID,
    author: makeAuthor(),
    comments: [],
    _count: { comments: 0 },
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}
function makeComment(overrides: Record<string, any> = {}): any {
  return {
    id: COMMENT_UUID,
    body: 'Great point!',
    likeCount: 0,
    topicId: TOPIC_UUID,
    authorId: USER_UUID,
    author: makeAuthor(),
    parentId: null,
    replies: [],
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
    adminPermission: { permissions: [] },
  };
}
function makeContentUser(): any {
  return {
    id: CONTENT_UUID,
    email: 'content@example.com',
    role: Role.CONTENT_ADMIN,
    status: 'APPROVED',
    adminPermission: { permissions: [] },
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

const mockPrisma = {
  user: { findUnique: jest.fn(), findMany: jest.fn() },
  community: {
    findUnique: jest.fn(),
    findMany: jest.fn(),
    count: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
  },
  communityMembership: {
    findUnique: jest.fn(),
    findMany: jest.fn(),
    count: jest.fn(),
    create: jest.fn(),
    delete: jest.fn(),
  },
  communityTopic: {
    findUnique: jest.fn(),
    findMany: jest.fn(),
    count: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
  },
  communityComment: {
    findUnique: jest.fn(),
    findMany: jest.fn(),
    count: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
  },
  communityLike: {
    findUnique: jest.fn(),
    create: jest.fn(),
    delete: jest.fn(),
  },
  communityReport: { findUnique: jest.fn(), create: jest.fn() },
  communityMention: {
    findMany: jest.fn(),
    createMany: jest.fn(),
    deleteMany: jest.fn(),
  },
  $transaction: jest.fn(),
};
const mockAzure = { upload: jest.fn(), delete: jest.fn() };

process.env.JWT_SECRET = JWT_SECRET;
let jwtService: JwtService;

describe('Community Module — E2E', () => {
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
      controllers: [CommunityController],
      providers: [
        CommunityService,
        JwtStrategy,
        Reflector,
        RolesGuard,
        JwtAuthGuard,
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
    mockPrisma.user.findUnique.mockImplementation(({ where }) => {
      const map: Record<string, any> = {
        [ADMIN_UUID]: makeAdminUser(),
        [CONTENT_UUID]: makeContentUser(),
        [USER_UUID]: makeNormalUser(),
      };
      return Promise.resolve(map[where.id] ?? null);
    });
    mockPrisma.$transaction.mockResolvedValue([[], 0]);
  });

  // ─── AUTH ─────────────────────────────────────────────────────────────────

  describe('Auth guards', () => {
    it('401 — no token on POST /communities', () =>
      request(app.getHttpServer()).post('/communities').expect(401));
    it('401 — no token on GET /communities/mentions', () =>
      request(app.getHttpServer()).get('/communities/mentions').expect(401));
  });

  // ─── COMMUNITY CRUD ───────────────────────────────────────────────────────

  describe('POST /communities', () => {
    it('201 — admin creates a community', async () => {
      mockPrisma.community.findUnique.mockResolvedValue(null);
      mockPrisma.community.create.mockResolvedValue(makeCommunity());
      const { body } = await request(app.getHttpServer())
        .post('/communities')
        .set('Authorization', `Bearer ${adminToken()}`)
        .send({ name: 'NGO Finance Hub' })
        .expect(201);
      expect(body.data).toHaveProperty('id', COMMUNITY_UUID);
      expect(body.data).toHaveProperty('memberCount', 10);
    });

    it('403 — regular user cannot create (RolesGuard)', () =>
      request(app.getHttpServer())
        .post('/communities')
        .set('Authorization', `Bearer ${userToken()}`)
        .send({ name: 'My Community' })
        .expect(403));

    it('409 in body — duplicate community name', async () => {
      mockPrisma.community.findUnique.mockResolvedValue(makeCommunity());
      const { body } = await request(app.getHttpServer())
        .post('/communities')
        .set('Authorization', `Bearer ${adminToken()}`)
        .send({ name: 'NGO Finance Hub' })
        .expect(201);
      expect(body.statusCode).toBe(409);
      expect(body.message).toMatch(/already exists/i);
    });

    it('400 — missing name (ValidationPipe)', () =>
      request(app.getHttpServer())
        .post('/communities')
        .set('Authorization', `Bearer ${adminToken()}`)
        .send({ description: 'No name' })
        .expect(400));
  });

  describe('GET /communities/:communityId', () => {
    it('200 — returns community detail', async () => {
      mockPrisma.community.findUnique.mockResolvedValue(makeCommunity());
      const { body } = await request(app.getHttpServer())
        .get(`/communities/${COMMUNITY_UUID}`)
        .set('Authorization', `Bearer ${userToken()}`)
        .expect(200);
      expect(body.data).toHaveProperty('name', 'NGO Finance Hub');
    });

    it('404 in body — community not found', async () => {
      mockPrisma.community.findUnique.mockResolvedValue(null);
      const { body } = await request(app.getHttpServer())
        .get(`/communities/${COMMUNITY_UUID}`)
        .set('Authorization', `Bearer ${userToken()}`)
        .expect(200);
      expect(body.statusCode).toBe(404);
    });

    it('400 — non-UUID param (ParseUUIDPipe)', () =>
      request(app.getHttpServer())
        .get('/communities/not-a-uuid')
        .set('Authorization', `Bearer ${userToken()}`)
        .expect(400));
  });

  describe('PATCH /communities/:communityId', () => {
    it('200 — admin updates community', async () => {
      // updateCommunity calls findUnique twice when name changes:
      // 1st — fetch current community record
      // 2nd — name collision check (null = no collision)
      mockPrisma.community.findUnique
        .mockResolvedValueOnce(makeCommunity()) // fetch current
        .mockResolvedValueOnce(null); // no name collision
      mockPrisma.community.update.mockResolvedValue(
        makeCommunity({ name: 'Updated Name' }),
      );
      const { body } = await request(app.getHttpServer())
        .patch(`/communities/${COMMUNITY_UUID}`)
        .set('Authorization', `Bearer ${adminToken()}`)
        .send({ name: 'Updated Name' })
        .expect(200);
      expect(body.data).toHaveProperty('name', 'Updated Name');
    });

    it('403 — regular user cannot update (RolesGuard)', () =>
      request(app.getHttpServer())
        .patch(`/communities/${COMMUNITY_UUID}`)
        .set('Authorization', `Bearer ${userToken()}`)
        .send({ name: 'Hacked' })
        .expect(403));

    it('404 in body — community not found', async () => {
      mockPrisma.community.findUnique.mockResolvedValue(null);
      const { body } = await request(app.getHttpServer())
        .patch(`/communities/${COMMUNITY_UUID}`)
        .set('Authorization', `Bearer ${adminToken()}`)
        .send({ name: 'Updated' })
        .expect(200);
      expect(body.statusCode).toBe(404);
    });

    it('409 in body — name already taken', async () => {
      mockPrisma.community.findUnique
        .mockResolvedValueOnce(makeCommunity({ name: 'Old Name' }))
        .mockResolvedValueOnce(
          makeCommunity({ id: 'other-id-0000-0000-0000-000000000001' }),
        );
      const { body } = await request(app.getHttpServer())
        .patch(`/communities/${COMMUNITY_UUID}`)
        .set('Authorization', `Bearer ${adminToken()}`)
        .send({ name: 'NGO Finance Hub' })
        .expect(200);
      expect(body.statusCode).toBe(409);
    });
  });

  describe('DELETE /communities/:communityId', () => {
    it('200 — SUPER_ADMIN deletes community', async () => {
      mockPrisma.community.findUnique.mockResolvedValue(makeCommunity());
      mockPrisma.community.delete.mockResolvedValue({});
      const { body } = await request(app.getHttpServer())
        .delete(`/communities/${COMMUNITY_UUID}`)
        .set('Authorization', `Bearer ${adminToken()}`)
        .expect(200);
      expect(body.status).toBe(true);
    });

    it('403 — CONTENT_ADMIN cannot hard-delete (RolesGuard)', () =>
      request(app.getHttpServer())
        .delete(`/communities/${COMMUNITY_UUID}`)
        .set('Authorization', `Bearer ${contentToken()}`)
        .expect(403));

    it('404 in body — community not found', async () => {
      mockPrisma.community.findUnique.mockResolvedValue(null);
      const { body } = await request(app.getHttpServer())
        .delete(`/communities/${COMMUNITY_UUID}`)
        .set('Authorization', `Bearer ${adminToken()}`)
        .expect(200);
      expect(body.statusCode).toBe(404);
    });
  });

  // ─── MEMBERSHIP ───────────────────────────────────────────────────────────

  describe('POST /communities/:communityId/subscribe', () => {
    it('201 — user subscribes', async () => {
      mockPrisma.community.findUnique.mockResolvedValue(makeCommunity());
      mockPrisma.communityMembership.findUnique.mockResolvedValue(null);
      mockPrisma.communityMembership.create.mockResolvedValue(makeMembership());
      const { body } = await request(app.getHttpServer())
        .post(`/communities/${COMMUNITY_UUID}/subscribe`)
        .set('Authorization', `Bearer ${userToken()}`)
        .expect(201);
      expect(body.message).toMatch(/subscribed/i);
    });

    it('409 in body — already a member', async () => {
      mockPrisma.community.findUnique.mockResolvedValue(makeCommunity());
      mockPrisma.communityMembership.findUnique.mockResolvedValue(
        makeMembership(),
      );
      const { body } = await request(app.getHttpServer())
        .post(`/communities/${COMMUNITY_UUID}/subscribe`)
        .set('Authorization', `Bearer ${userToken()}`)
        .expect(201);
      expect(body.statusCode).toBe(409);
    });

    it('404 in body — community not found', async () => {
      mockPrisma.community.findUnique.mockResolvedValue(null);
      const { body } = await request(app.getHttpServer())
        .post(`/communities/${COMMUNITY_UUID}/subscribe`)
        .set('Authorization', `Bearer ${userToken()}`)
        .expect(201);
      expect(body.statusCode).toBe(404);
    });
  });

  describe('DELETE /communities/:communityId/unsubscribe', () => {
    it('200 — user unsubscribes', async () => {
      mockPrisma.communityMembership.findUnique.mockResolvedValue(
        makeMembership(),
      );
      mockPrisma.communityMembership.delete.mockResolvedValue({});
      const { body } = await request(app.getHttpServer())
        .delete(`/communities/${COMMUNITY_UUID}/unsubscribe`)
        .set('Authorization', `Bearer ${userToken()}`)
        .expect(200);
      expect(body.message).toMatch(/unsubscribed/i);
    });

    it('404 in body — not a member', async () => {
      mockPrisma.communityMembership.findUnique.mockResolvedValue(null);
      const { body } = await request(app.getHttpServer())
        .delete(`/communities/${COMMUNITY_UUID}/unsubscribe`)
        .set('Authorization', `Bearer ${userToken()}`)
        .expect(200);
      expect(body.statusCode).toBe(404);
    });
  });

  describe('GET /communities/my-subscriptions', () => {
    it('200 — returns joined communities', async () => {
      mockPrisma.communityMembership.findMany.mockResolvedValue([
        makeMembership(),
      ]);
      const { body } = await request(app.getHttpServer())
        .get('/communities/my-subscriptions')
        .set('Authorization', `Bearer ${userToken()}`)
        .expect(200);
      expect(body.data).toHaveLength(1);
      expect(body.data[0]).toHaveProperty('communityId', COMMUNITY_UUID);
    });
  });

  // ─── TOPICS ───────────────────────────────────────────────────────────────

  describe('POST /communities/:communityId/topics', () => {
    it('201 — member creates a topic', async () => {
      mockPrisma.community.findUnique.mockResolvedValue(makeCommunity());
      mockPrisma.communityMembership.findUnique.mockResolvedValue(
        makeMembership(),
      );
      mockPrisma.communityTopic.create.mockResolvedValue(makeTopic());
      mockPrisma.user.findMany.mockResolvedValue([]);
      mockPrisma.communityMention.createMany.mockResolvedValue({ count: 0 });
      const { body } = await request(app.getHttpServer())
        .post(`/communities/${COMMUNITY_UUID}/topics`)
        .set('Authorization', `Bearer ${userToken()}`)
        .send({ title: 'Best budget planning', body: 'How do you handle it?' })
        .expect(201);
      expect(body.data).toHaveProperty('id', TOPIC_UUID);
    });

    it('403 in body — non-member cannot create topic', async () => {
      mockPrisma.community.findUnique.mockResolvedValue(makeCommunity());
      mockPrisma.communityMembership.findUnique.mockResolvedValue(null);
      const { body } = await request(app.getHttpServer())
        .post(`/communities/${COMMUNITY_UUID}/topics`)
        .set('Authorization', `Bearer ${userToken()}`)
        .send({ title: 'Test', body: 'Body text.' })
        .expect(201);
      expect(body.statusCode).toBe(403);
      expect(body.message).toMatch(/member/i);
    });

    it('404 in body — community not found', async () => {
      mockPrisma.community.findUnique.mockResolvedValue(null);
      const { body } = await request(app.getHttpServer())
        .post(`/communities/${COMMUNITY_UUID}/topics`)
        .set('Authorization', `Bearer ${userToken()}`)
        .send({ title: 'Test', body: 'Body.' })
        .expect(201);
      expect(body.statusCode).toBe(404);
    });

    it('400 — missing title (ValidationPipe)', () =>
      request(app.getHttpServer())
        .post(`/communities/${COMMUNITY_UUID}/topics`)
        .set('Authorization', `Bearer ${userToken()}`)
        .send({ body: 'No title.' })
        .expect(400));

    it('400 — missing body (ValidationPipe)', () =>
      request(app.getHttpServer())
        .post(`/communities/${COMMUNITY_UUID}/topics`)
        .set('Authorization', `Bearer ${userToken()}`)
        .send({ title: 'No body' })
        .expect(400));
  });

  describe('GET /communities/:communityId/topics', () => {
    it('404 in body — community not found', async () => {
      mockPrisma.community.findUnique.mockResolvedValue(null);
      const { body } = await request(app.getHttpServer())
        .get(`/communities/${COMMUNITY_UUID}/topics`)
        .set('Authorization', `Bearer ${userToken()}`)
        .expect(200);
      expect(body.statusCode).toBe(404);
    });
  });

  describe('GET /communities/:communityId/topics/:topicId', () => {
    it('200 — returns single topic with comments', async () => {
      mockPrisma.communityTopic.findUnique.mockResolvedValue(
        makeTopic({ comments: [makeComment()] }),
      );
      const { body } = await request(app.getHttpServer())
        .get(`/communities/${COMMUNITY_UUID}/topics/${TOPIC_UUID}`)
        .set('Authorization', `Bearer ${userToken()}`)
        .expect(200);
      expect(body.data).toHaveProperty('id', TOPIC_UUID);
      expect(body.data.comments).toHaveLength(1);
    });

    it('404 in body — topic not found', async () => {
      mockPrisma.communityTopic.findUnique.mockResolvedValue(null);
      const { body } = await request(app.getHttpServer())
        .get(`/communities/${COMMUNITY_UUID}/topics/${TOPIC_UUID}`)
        .set('Authorization', `Bearer ${userToken()}`)
        .expect(200);
      expect(body.statusCode).toBe(404);
    });

    it('404 in body — blocked topic is hidden', async () => {
      mockPrisma.communityTopic.findUnique.mockResolvedValue(
        makeTopic({ isBlocked: true }),
      );
      const { body } = await request(app.getHttpServer())
        .get(`/communities/${COMMUNITY_UUID}/topics/${TOPIC_UUID}`)
        .set('Authorization', `Bearer ${userToken()}`)
        .expect(200);
      expect(body.statusCode).toBe(404);
    });

    it('404 in body — topic belongs to different community', async () => {
      mockPrisma.communityTopic.findUnique.mockResolvedValue(
        makeTopic({ communityId: 'a9eebc99-9c0b-4ef8-bb6d-6bb9bd380aff' }),
      );
      const { body } = await request(app.getHttpServer())
        .get(`/communities/${COMMUNITY_UUID}/topics/${TOPIC_UUID}`)
        .set('Authorization', `Bearer ${userToken()}`)
        .expect(200);
      expect(body.statusCode).toBe(404);
    });
  });

  describe('PATCH /communities/:communityId/topics/:topicId', () => {
    it('200 — author edits own topic', async () => {
      mockPrisma.communityTopic.findUnique.mockResolvedValue(makeTopic());
      mockPrisma.communityTopic.update.mockResolvedValue(
        makeTopic({ title: 'Updated title' }),
      );
      mockPrisma.communityMention.deleteMany.mockResolvedValue({ count: 0 });
      mockPrisma.user.findMany.mockResolvedValue([]);
      mockPrisma.communityMention.createMany.mockResolvedValue({ count: 0 });
      const { body } = await request(app.getHttpServer())
        .patch(`/communities/${COMMUNITY_UUID}/topics/${TOPIC_UUID}`)
        .set('Authorization', `Bearer ${userToken()}`)
        .send({ title: 'Updated title' })
        .expect(200);
      expect(body.data).toHaveProperty('title', 'Updated title');
    });

    it('403 in body — non-author cannot edit', async () => {
      mockPrisma.communityTopic.findUnique.mockResolvedValue(
        makeTopic({ authorId: OTHER_UUID }),
      );
      const { body } = await request(app.getHttpServer())
        .patch(`/communities/${COMMUNITY_UUID}/topics/${TOPIC_UUID}`)
        .set('Authorization', `Bearer ${userToken()}`)
        .send({ title: 'Hijack' })
        .expect(200);
      expect(body.statusCode).toBe(403);
    });

    it('404 in body — topic not found', async () => {
      mockPrisma.communityTopic.findUnique.mockResolvedValue(null);
      const { body } = await request(app.getHttpServer())
        .patch(`/communities/${COMMUNITY_UUID}/topics/${TOPIC_UUID}`)
        .set('Authorization', `Bearer ${userToken()}`)
        .send({ title: 'Test' })
        .expect(200);
      expect(body.statusCode).toBe(404);
    });
  });

  describe('DELETE /communities/:communityId/topics/:topicId', () => {
    it('200 — author deletes own topic', async () => {
      mockPrisma.communityTopic.findUnique.mockResolvedValue(makeTopic());
      mockPrisma.communityTopic.delete.mockResolvedValue({});
      const { body } = await request(app.getHttpServer())
        .delete(`/communities/${COMMUNITY_UUID}/topics/${TOPIC_UUID}`)
        .set('Authorization', `Bearer ${userToken()}`)
        .expect(200);
      expect(body.status).toBe(true);
    });

    it('200 — SUPER_ADMIN deletes any topic', async () => {
      mockPrisma.communityTopic.findUnique.mockResolvedValue(
        makeTopic({ authorId: OTHER_UUID }),
      );
      mockPrisma.communityTopic.delete.mockResolvedValue({});
      const { body } = await request(app.getHttpServer())
        .delete(`/communities/${COMMUNITY_UUID}/topics/${TOPIC_UUID}`)
        .set('Authorization', `Bearer ${adminToken()}`)
        .expect(200);
      expect(body.status).toBe(true);
    });

    it('403 in body — non-author, non-admin cannot delete', async () => {
      mockPrisma.communityTopic.findUnique.mockResolvedValue(
        makeTopic({ authorId: OTHER_UUID }),
      );
      const { body } = await request(app.getHttpServer())
        .delete(`/communities/${COMMUNITY_UUID}/topics/${TOPIC_UUID}`)
        .set('Authorization', `Bearer ${userToken()}`)
        .expect(200);
      expect(body.statusCode).toBe(403);
    });
  });

  describe('POST /communities/:communityId/topics/:topicId/report', () => {
    it('201 — member reports a topic', async () => {
      mockPrisma.communityMembership.findUnique.mockResolvedValue(
        makeMembership(),
      );
      mockPrisma.communityTopic.findUnique.mockResolvedValue(makeTopic());
      mockPrisma.communityReport.findUnique.mockResolvedValue(null);
      mockPrisma.communityReport.create.mockResolvedValue({
        id: 'rep-001',
        topicId: TOPIC_UUID,
        reportedById: USER_UUID,
        reason: 'Spam',
        createdAt: new Date(),
      });
      const { body } = await request(app.getHttpServer())
        .post(`/communities/${COMMUNITY_UUID}/topics/${TOPIC_UUID}/report`)
        .set('Authorization', `Bearer ${userToken()}`)
        .send({ reason: 'Spam' })
        .expect(201);
      expect(body.message).toMatch(/reported/i);
    });

    it('409 in body — user already reported this topic', async () => {
      mockPrisma.communityMembership.findUnique.mockResolvedValue(
        makeMembership(),
      );
      mockPrisma.communityTopic.findUnique.mockResolvedValue(makeTopic());
      mockPrisma.communityReport.findUnique.mockResolvedValue({
        id: 'rep-001',
      });
      const { body } = await request(app.getHttpServer())
        .post(`/communities/${COMMUNITY_UUID}/topics/${TOPIC_UUID}/report`)
        .set('Authorization', `Bearer ${userToken()}`)
        .send({ reason: 'Again' })
        .expect(201);
      expect(body.statusCode).toBe(409);
    });

    it('403 in body — non-member cannot report', async () => {
      mockPrisma.communityMembership.findUnique.mockResolvedValue(null);
      const { body } = await request(app.getHttpServer())
        .post(`/communities/${COMMUNITY_UUID}/topics/${TOPIC_UUID}/report`)
        .set('Authorization', `Bearer ${userToken()}`)
        .send({})
        .expect(201);
      expect(body.statusCode).toBe(403);
    });
  });

  describe('PATCH /communities/:communityId/topics/:topicId/block', () => {
    it('200 — SUPER_ADMIN blocks a topic', async () => {
      mockPrisma.communityTopic.findUnique.mockResolvedValue(makeTopic());
      mockPrisma.communityTopic.update.mockResolvedValue(
        makeTopic({ isBlocked: true }),
      );
      const { body } = await request(app.getHttpServer())
        .patch(`/communities/${COMMUNITY_UUID}/topics/${TOPIC_UUID}/block`)
        .set('Authorization', `Bearer ${adminToken()}`)
        .send({ isBlocked: true })
        .expect(200);
      expect(body.message).toMatch(/blocked/i);
    });

    it('200 — CONTENT_ADMIN unblocks a topic', async () => {
      mockPrisma.communityTopic.findUnique.mockResolvedValue(
        makeTopic({ isBlocked: true }),
      );
      mockPrisma.communityTopic.update.mockResolvedValue(
        makeTopic({ isBlocked: false }),
      );
      const { body } = await request(app.getHttpServer())
        .patch(`/communities/${COMMUNITY_UUID}/topics/${TOPIC_UUID}/block`)
        .set('Authorization', `Bearer ${contentToken()}`)
        .send({ isBlocked: false })
        .expect(200);
      expect(body.message).toMatch(/unblocked/i);
    });

    it('403 — regular user cannot block (RolesGuard)', () =>
      request(app.getHttpServer())
        .patch(`/communities/${COMMUNITY_UUID}/topics/${TOPIC_UUID}/block`)
        .set('Authorization', `Bearer ${userToken()}`)
        .send({ isBlocked: true })
        .expect(403));

    it('400 — missing isBlocked field (ValidationPipe)', () =>
      request(app.getHttpServer())
        .patch(`/communities/${COMMUNITY_UUID}/topics/${TOPIC_UUID}/block`)
        .set('Authorization', `Bearer ${adminToken()}`)
        .send({})
        .expect(400));
  });

  // ─── LIKES ────────────────────────────────────────────────────────────────

  describe('POST .../topics/:topicId/like', () => {
    it('200 — toggle on', async () => {
      mockPrisma.communityMembership.findUnique.mockResolvedValue(
        makeMembership(),
      );
      mockPrisma.communityTopic.findUnique.mockResolvedValue(makeTopic());
      mockPrisma.communityLike.findUnique.mockResolvedValue(null);
      mockPrisma.communityLike.create.mockResolvedValue({});
      mockPrisma.communityTopic.update.mockResolvedValue(
        makeTopic({ likeCount: 1 }),
      );
      const { body } = await request(app.getHttpServer())
        .post(`/communities/${COMMUNITY_UUID}/topics/${TOPIC_UUID}/like`)
        .set('Authorization', `Bearer ${userToken()}`)
        .expect(200);
      expect(body.data).toMatchObject({ liked: true, likeCount: 1 });
    });

    it('200 — toggle off', async () => {
      mockPrisma.communityMembership.findUnique.mockResolvedValue(
        makeMembership(),
      );
      mockPrisma.communityTopic.findUnique.mockResolvedValue(
        makeTopic({ likeCount: 1 }),
      );
      mockPrisma.communityLike.findUnique.mockResolvedValue({ id: 'like-001' });
      mockPrisma.communityLike.delete.mockResolvedValue({});
      mockPrisma.communityTopic.update.mockResolvedValue(
        makeTopic({ likeCount: 0 }),
      );
      const { body } = await request(app.getHttpServer())
        .post(`/communities/${COMMUNITY_UUID}/topics/${TOPIC_UUID}/like`)
        .set('Authorization', `Bearer ${userToken()}`)
        .expect(200);
      expect(body.data).toMatchObject({ liked: false, likeCount: 0 });
    });

    it('403 in body — non-member cannot like', async () => {
      mockPrisma.communityMembership.findUnique.mockResolvedValue(null);
      const { body } = await request(app.getHttpServer())
        .post(`/communities/${COMMUNITY_UUID}/topics/${TOPIC_UUID}/like`)
        .set('Authorization', `Bearer ${userToken()}`)
        .expect(200);
      expect(body.statusCode).toBe(403);
    });
  });

  describe('POST .../comments/:commentId/like', () => {
    it('200 — member likes a comment', async () => {
      mockPrisma.communityMembership.findUnique.mockResolvedValue(
        makeMembership(),
      );
      mockPrisma.communityComment.findUnique.mockResolvedValue(makeComment());
      mockPrisma.communityLike.findUnique.mockResolvedValue(null);
      mockPrisma.communityLike.create.mockResolvedValue({});
      mockPrisma.communityComment.update.mockResolvedValue(
        makeComment({ likeCount: 1 }),
      );
      const { body } = await request(app.getHttpServer())
        .post(
          `/communities/${COMMUNITY_UUID}/topics/${TOPIC_UUID}/comments/${COMMENT_UUID}/like`,
        )
        .set('Authorization', `Bearer ${userToken()}`)
        .expect(200);
      expect(body.data).toMatchObject({ liked: true, likeCount: 1 });
    });

    it('404 in body — comment not found on this topic', async () => {
      mockPrisma.communityMembership.findUnique.mockResolvedValue(
        makeMembership(),
      );
      mockPrisma.communityComment.findUnique.mockResolvedValue(
        makeComment({ topicId: 'a9eebc99-9c0b-4ef8-bb6d-6bb9bd380aff' }),
      );
      const { body } = await request(app.getHttpServer())
        .post(
          `/communities/${COMMUNITY_UUID}/topics/${TOPIC_UUID}/comments/${COMMENT_UUID}/like`,
        )
        .set('Authorization', `Bearer ${userToken()}`)
        .expect(200);
      expect(body.statusCode).toBe(404);
    });
  });

  // ─── COMMENTS ─────────────────────────────────────────────────────────────

  describe('POST .../topics/:topicId/comments', () => {
    it('201 — member adds a top-level comment', async () => {
      mockPrisma.communityMembership.findUnique.mockResolvedValue(
        makeMembership(),
      );
      mockPrisma.communityTopic.findUnique.mockResolvedValue(makeTopic());
      mockPrisma.communityComment.create.mockResolvedValue(makeComment());
      mockPrisma.user.findMany.mockResolvedValue([]);
      mockPrisma.communityMention.createMany.mockResolvedValue({ count: 0 });
      const { body } = await request(app.getHttpServer())
        .post(`/communities/${COMMUNITY_UUID}/topics/${TOPIC_UUID}/comments`)
        .set('Authorization', `Bearer ${userToken()}`)
        .send({ body: 'Great discussion!' })
        .expect(201);
      expect(body.data).toHaveProperty('id', COMMENT_UUID);
    });

    it('201 — member replies to a comment (with parentId)', async () => {
      mockPrisma.communityMembership.findUnique.mockResolvedValue(
        makeMembership(),
      );
      mockPrisma.communityTopic.findUnique.mockResolvedValue(makeTopic());
      mockPrisma.communityComment.findUnique.mockResolvedValue(makeComment());
      mockPrisma.communityComment.create.mockResolvedValue(
        makeComment({ id: REPLY_UUID, parentId: COMMENT_UUID }),
      );
      mockPrisma.user.findMany.mockResolvedValue([]);
      mockPrisma.communityMention.createMany.mockResolvedValue({ count: 0 });
      const { body } = await request(app.getHttpServer())
        .post(`/communities/${COMMUNITY_UUID}/topics/${TOPIC_UUID}/comments`)
        .set('Authorization', `Bearer ${userToken()}`)
        .send({ body: 'Replying!', parentId: COMMENT_UUID })
        .expect(201);
      expect(body.data).toHaveProperty('parentId', COMMENT_UUID);
    });

    it('400 — parentId not a valid UUID (ValidationPipe)', () =>
      request(app.getHttpServer())
        .post(`/communities/${COMMUNITY_UUID}/topics/${TOPIC_UUID}/comments`)
        .set('Authorization', `Bearer ${userToken()}`)
        .send({ body: 'Reply', parentId: 'not-a-uuid' })
        .expect(400));

    it('400 — missing body (ValidationPipe)', () =>
      request(app.getHttpServer())
        .post(`/communities/${COMMUNITY_UUID}/topics/${TOPIC_UUID}/comments`)
        .set('Authorization', `Bearer ${userToken()}`)
        .send({})
        .expect(400));

    it('403 in body — non-member cannot comment', async () => {
      mockPrisma.communityMembership.findUnique.mockResolvedValue(null);
      const { body } = await request(app.getHttpServer())
        .post(`/communities/${COMMUNITY_UUID}/topics/${TOPIC_UUID}/comments`)
        .set('Authorization', `Bearer ${userToken()}`)
        .send({ body: 'Test.' })
        .expect(201);
      expect(body.statusCode).toBe(403);
    });

    it('400 in body — parent comment not on this topic', async () => {
      mockPrisma.communityMembership.findUnique.mockResolvedValue(
        makeMembership(),
      );
      mockPrisma.communityTopic.findUnique.mockResolvedValue(makeTopic());
      mockPrisma.communityComment.findUnique.mockResolvedValue(
        makeComment({ topicId: 'a9eebc99-9c0b-4ef8-bb6d-6bb9bd380aff' }),
      );
      const { body } = await request(app.getHttpServer())
        .post(`/communities/${COMMUNITY_UUID}/topics/${TOPIC_UUID}/comments`)
        .set('Authorization', `Bearer ${userToken()}`)
        .send({ body: 'Reply.', parentId: COMMENT_UUID })
        .expect(201);
      expect(body.statusCode).toBe(400);
      expect(body.message).toMatch(/parent comment/i);
    });
  });

  describe('PATCH .../topics/:topicId/comments/:commentId', () => {
    it('200 — author edits own comment', async () => {
      mockPrisma.communityMembership.findUnique.mockResolvedValue(
        makeMembership(),
      );
      mockPrisma.communityComment.findUnique.mockResolvedValue(makeComment());
      mockPrisma.communityComment.update.mockResolvedValue(
        makeComment({ body: 'Edited body.' }),
      );
      mockPrisma.communityMention.deleteMany.mockResolvedValue({ count: 0 });
      mockPrisma.user.findMany.mockResolvedValue([]);
      mockPrisma.communityMention.createMany.mockResolvedValue({ count: 0 });
      const { body } = await request(app.getHttpServer())
        .patch(
          `/communities/${COMMUNITY_UUID}/topics/${TOPIC_UUID}/comments/${COMMENT_UUID}`,
        )
        .set('Authorization', `Bearer ${userToken()}`)
        .send({ body: 'Edited body.' })
        .expect(200);
      expect(body.data).toHaveProperty('body', 'Edited body.');
    });

    it('403 in body — non-author cannot edit', async () => {
      mockPrisma.communityMembership.findUnique.mockResolvedValue(
        makeMembership(),
      );
      mockPrisma.communityComment.findUnique.mockResolvedValue(
        makeComment({ authorId: OTHER_UUID }),
      );
      const { body } = await request(app.getHttpServer())
        .patch(
          `/communities/${COMMUNITY_UUID}/topics/${TOPIC_UUID}/comments/${COMMENT_UUID}`,
        )
        .set('Authorization', `Bearer ${userToken()}`)
        .send({ body: 'Hijack.' })
        .expect(200);
      expect(body.statusCode).toBe(403);
    });
  });

  describe('DELETE .../topics/:topicId/comments/:commentId', () => {
    it('200 — author deletes own comment', async () => {
      mockPrisma.communityComment.findUnique.mockResolvedValue(makeComment());
      mockPrisma.communityComment.delete.mockResolvedValue({});
      const { body } = await request(app.getHttpServer())
        .delete(
          `/communities/${COMMUNITY_UUID}/topics/${TOPIC_UUID}/comments/${COMMENT_UUID}`,
        )
        .set('Authorization', `Bearer ${userToken()}`)
        .expect(200);
      expect(body.status).toBe(true);
    });

    it('200 — SUPER_ADMIN deletes any comment', async () => {
      mockPrisma.communityComment.findUnique.mockResolvedValue(
        makeComment({ authorId: OTHER_UUID }),
      );
      mockPrisma.communityComment.delete.mockResolvedValue({});
      const { body } = await request(app.getHttpServer())
        .delete(
          `/communities/${COMMUNITY_UUID}/topics/${TOPIC_UUID}/comments/${COMMENT_UUID}`,
        )
        .set('Authorization', `Bearer ${adminToken()}`)
        .expect(200);
      expect(body.status).toBe(true);
    });

    it('403 in body — non-author, non-admin cannot delete', async () => {
      mockPrisma.communityComment.findUnique.mockResolvedValue(
        makeComment({ authorId: OTHER_UUID }),
      );
      const { body } = await request(app.getHttpServer())
        .delete(
          `/communities/${COMMUNITY_UUID}/topics/${TOPIC_UUID}/comments/${COMMENT_UUID}`,
        )
        .set('Authorization', `Bearer ${userToken()}`)
        .expect(200);
      expect(body.statusCode).toBe(403);
    });

    it('404 in body — comment not found', async () => {
      mockPrisma.communityComment.findUnique.mockResolvedValue(null);
      const { body } = await request(app.getHttpServer())
        .delete(
          `/communities/${COMMUNITY_UUID}/topics/${TOPIC_UUID}/comments/${COMMENT_UUID}`,
        )
        .set('Authorization', `Bearer ${userToken()}`)
        .expect(200);
      expect(body.statusCode).toBe(404);
    });
  });

  // ─── MENTIONS ─────────────────────────────────────────────────────────────

  describe('GET /communities/mentions', () => {
    it('200 — returns mentions for current user', async () => {
      mockPrisma.communityMention.findMany.mockResolvedValue([
        {
          id: MENTION_UUID,
          mentionedUserId: USER_UUID,
          topicId: TOPIC_UUID,
          commentId: null,
          topic: makeTopic(),
          comment: null,
          createdAt: new Date(),
        },
      ]);
      const { body } = await request(app.getHttpServer())
        .get('/communities/mentions')
        .set('Authorization', `Bearer ${userToken()}`)
        .expect(200);
      expect(body.data).toHaveLength(1);
      expect(body.data[0]).toHaveProperty('topicId', TOPIC_UUID);
    });

    it('200 — blocked topic mentions are filtered out', async () => {
      mockPrisma.communityMention.findMany.mockResolvedValue([
        {
          id: MENTION_UUID,
          mentionedUserId: USER_UUID,
          topicId: TOPIC_UUID,
          commentId: null,
          topic: makeTopic({ isBlocked: true }),
          comment: null,
          createdAt: new Date(),
        },
      ]);
      const { body } = await request(app.getHttpServer())
        .get('/communities/mentions')
        .set('Authorization', `Bearer ${userToken()}`)
        .expect(200);
      expect(body.data).toHaveLength(0);
    });

    it('401 — no token', () =>
      request(app.getHttpServer()).get('/communities/mentions').expect(401));
  });

  // ─── ANALYTICS ────────────────────────────────────────────────────────────

  describe('GET /communities/analytics/general', () => {
    it('200 — returns general analytics', async () => {
      mockPrisma.$transaction.mockResolvedValue([12, 3, 85, 47, 5, 18, 9]);
      const { body } = await request(app.getHttpServer())
        .get('/communities/analytics/general')
        .set('Authorization', `Bearer ${userToken()}`)
        .expect(200);
      expect(body.data).toMatchObject({
        totalCommunities: 12,
        myJoinedCommunities: 3,
        totalMembers: 85,
        totalTopics: 47,
        myTopicsCount: 5,
        myRepliesPosted: 18,
        myRepliesReceived: 9,
      });
    });

    it('401 — no token', () =>
      request(app.getHttpServer())
        .get('/communities/analytics/general')
        .expect(401));
  });

  describe('GET /communities/:communityId/analytics', () => {
    it('200 — returns per-community analytics with dateJoined', async () => {
      const joinedAt = new Date('2025-01-15');
      mockPrisma.community.findUnique.mockResolvedValue(makeCommunity());
      mockPrisma.$transaction.mockResolvedValue([
        42,
        17,
        { userId: USER_UUID, communityId: COMMUNITY_UUID, joinedAt },
      ]);
      const { body } = await request(app.getHttpServer())
        .get(`/communities/${COMMUNITY_UUID}/analytics`)
        .set('Authorization', `Bearer ${userToken()}`)
        .expect(200);
      expect(body.data).toMatchObject({
        totalMembers: 42,
        totalTopics: 17,
        onlineMembers: null,
      });
      expect(body.data.dateJoined).toBeTruthy();
    });

    it('200 — dateJoined is null when user is not a member', async () => {
      mockPrisma.community.findUnique.mockResolvedValue(makeCommunity());
      mockPrisma.$transaction.mockResolvedValue([42, 17, null]);
      const { body } = await request(app.getHttpServer())
        .get(`/communities/${COMMUNITY_UUID}/analytics`)
        .set('Authorization', `Bearer ${userToken()}`)
        .expect(200);
      expect(body.data.dateJoined).toBeNull();
    });

    it('404 in body — community not found', async () => {
      mockPrisma.community.findUnique.mockResolvedValue(null);
      const { body } = await request(app.getHttpServer())
        .get(`/communities/${COMMUNITY_UUID}/analytics`)
        .set('Authorization', `Bearer ${userToken()}`)
        .expect(200);
      expect(body.statusCode).toBe(404);
    });
  });
});
