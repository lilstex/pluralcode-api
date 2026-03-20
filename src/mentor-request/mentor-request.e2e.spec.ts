/* eslint-disable @typescript-eslint/no-unused-vars */
import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { JwtService, JwtModule } from '@nestjs/jwt';
import { Reflector } from '@nestjs/core';
import { PassportModule } from '@nestjs/passport';
import { ConfigModule } from '@nestjs/config';
import request from 'supertest';
import { Role, MentorRequestStatus } from '@prisma/client';

import { MentorRequestController } from 'src/mentor-request/controller/mentor-request.controller';
import { MentorRequestService } from 'src/mentor-request/service/mentor-request.service';
import { JwtStrategy } from 'src/common/strategies/jwt.strategy';
import { JwtAuthGuard } from 'src/common/guards/jwt-auth.guard';
import { RolesGuard } from 'src/common/guards/roles.guard';
import { PrismaService } from 'src/prisma.service';
import { EmailService } from 'src/providers/email/email.service';
import { RewardsService } from 'src/reward/service/reward.service';

// ─────────────────────────────────────────────────────────────────────────────
// CONSTANTS
// ─────────────────────────────────────────────────────────────────────────────

const JWT_SECRET = 'test-secret-do-not-use-in-prod';

const NGO_UUID = 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11';
const EXPERT_UUID = 'b1ffcd00-0d1c-4ef8-bb6d-6bb9bd380a22';
const ADMIN_UUID = 'c2eebc99-9c0b-4ef8-bb6d-6bb9bd380a33';
const GUEST_UUID = 'd3eebc99-9c0b-4ef8-bb6d-6bb9bd380a44';
const REQUEST_UUID = 'e4eebc99-9c0b-4ef8-bb6d-6bb9bd380a55';
const OTHER_UUID = 'f5eebc99-9c0b-4ef8-bb6d-6bb9bd380a66';

// ─────────────────────────────────────────────────────────────────────────────
// FIXTURES
// ─────────────────────────────────────────────────────────────────────────────

function makeNgoUser(overrides: Record<string, any> = {}): any {
  return {
    id: NGO_UUID,
    email: 'ngo@example.com',
    fullName: 'NGO User',
    role: Role.NGO_MEMBER,
    status: 'APPROVED',
    isEmailVerified: true,
    organization: {
      id: 'org-uuid-1',
      name: 'Save The Children Nigeria',
      state: 'Lagos',
    },
    adminPermission: null,
    ...overrides,
  };
}

function makeExpertUser(overrides: Record<string, any> = {}): any {
  return {
    id: EXPERT_UUID,
    email: 'expert@example.com',
    fullName: 'Expert User',
    role: Role.EXPERT,
    status: 'APPROVED',
    isEmailVerified: true,
    organization: null,
    adminPermission: null,
    expertProfile: {
      title: 'Dr.',
      employer: 'UNICEF',
      areasOfExpertise: ['Governance', 'M&E'],
      capacityOfMentees: '3',
    },
    ...overrides,
  };
}

function makeAdminUser(overrides: Record<string, any> = {}): any {
  return {
    id: ADMIN_UUID,
    email: 'admin@example.com',
    fullName: 'Admin User',
    role: Role.SUPER_ADMIN,
    status: 'APPROVED',
    isEmailVerified: true,
    organization: null,
    adminPermission: { permissions: ['*'] },
    ...overrides,
  };
}

function makeGuestUser(overrides: Record<string, any> = {}): any {
  return {
    id: GUEST_UUID,
    email: 'guest@example.com',
    fullName: 'Guest User',
    role: Role.GUEST,
    status: 'APPROVED',
    isEmailVerified: true,
    organization: null,
    adminPermission: null,
    ...overrides,
  };
}

function makeMentorRequest(overrides: Record<string, any> = {}): any {
  return {
    id: REQUEST_UUID,
    ngoUserId: NGO_UUID,
    mentorId: EXPERT_UUID,
    status: MentorRequestStatus.PENDING,
    hoursPerWeek: '3-5 hours',
    mentorshipAreas: ['Governance', 'Finance'],
    commMethods: ['Email', 'Video Call'],
    orgChallenges: 'Donor retention is a challenge.',
    background: 'We are a 3-year-old health NGO.',
    acceptedTerms: true,
    createdAt: new Date(),
    updatedAt: new Date(),
    mentor: {
      id: EXPERT_UUID,
      fullName: 'Expert User',
      email: 'expert@example.com',
      avatarUrl: null,
      expertProfile: {
        title: 'Dr.',
        employer: 'UNICEF',
        areasOfExpertise: ['Governance'],
      },
    },
    ngoUser: {
      id: NGO_UUID,
      fullName: 'NGO User',
      email: 'ngo@example.com',
      organization: { name: 'Save The Children Nigeria', state: 'Lagos' },
    },
    ...overrides,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// MOCK PRISMA
// ─────────────────────────────────────────────────────────────────────────────

const mockPrisma = {
  user: {
    findUnique: jest.fn(),
    findFirst: jest.fn(),
    findMany: jest.fn(),
  },
  mentorRequest: {
    create: jest.fn(),
    findMany: jest.fn(),
    findFirst: jest.fn(),
    findUnique: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
    count: jest.fn(),
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// MOCK EMAIL
// ─────────────────────────────────────────────────────────────────────────────

const mockEmail = {
  sendMentorRequestNotification: jest.fn(),
  sendMentorRequestDecision: jest.fn(),
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
// JWT HELPERS
// ─────────────────────────────────────────────────────────────────────────────

let jwtService: JwtService;

const ngoToken = () =>
  jwtService.sign({
    sub: NGO_UUID,
    email: 'ngo@example.com',
    role: Role.NGO_MEMBER,
  });
const expertToken = () =>
  jwtService.sign({
    sub: EXPERT_UUID,
    email: 'expert@example.com',
    role: Role.EXPERT,
  });
const adminToken = () =>
  jwtService.sign({
    sub: ADMIN_UUID,
    email: 'admin@example.com',
    role: Role.SUPER_ADMIN,
  });
const guestToken = () =>
  jwtService.sign({
    sub: GUEST_UUID,
    email: 'guest@example.com',
    role: Role.GUEST,
  });

// ─────────────────────────────────────────────────────────────────────────────
// BOOTSTRAP
// ─────────────────────────────────────────────────────────────────────────────

describe('Mentor Requests Module — E2E', () => {
  let app: INestApplication;

  beforeAll(async () => {
    process.env.JWT_SECRET = JWT_SECRET;
    process.env.FRONTEND_URL = 'https://app.example.com';

    const module: TestingModule = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({ isGlobal: true, ignoreEnvFile: true }),
        PassportModule.register({ defaultStrategy: 'jwt' }),
        JwtModule.register({
          secret: JWT_SECRET,
          signOptions: { expiresIn: '1h' },
        }),
      ],
      controllers: [MentorRequestController],
      providers: [
        MentorRequestService,
        JwtStrategy,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: EmailService, useValue: mockEmail },
        { provide: RewardsService, useValue: mockRewards },
        RolesGuard,
        Reflector,
      ],
    }).compile();

    app = module.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, transform: true }),
    );
    await app.init();

    jwtService = module.get<JwtService>(JwtService);
  });

  afterAll(() => app.close());

  /**
   * Global beforeEach: resets all mocks then reinstates the where.id router.
   *
   * mockImplementation survives jest.clearAllMocks() whereas mockResolvedValue
   * does not — this is the key fix. Every test that needs a different user
   * for a specific UUID (e.g. "NGO has no org") overrides the implementation
   * inline inside that test.
   */
  beforeEach(() => {
    jest.clearAllMocks();

    // Restore fire-and-forget mocks wiped by clearAllMocks
    mockRewards.award.mockResolvedValue({
      pointsEarned: 10,
      totalPoints: 10,
      badgeAwarded: null,
      achievementId: 'ach-1',
    });
    mockRewards.hasAchievement.mockResolvedValue(false);
    mockEmail.sendMentorRequestNotification.mockResolvedValue(undefined);
    mockEmail.sendMentorRequestDecision.mockResolvedValue(undefined);

    // Restore mock defaults wiped by clearAllMocks
    mockRewards.award.mockResolvedValue({
      pointsEarned: 10,
      totalPoints: 10,
      badgeAwarded: null,
      achievementId: 'ach-1',
    });
    mockRewards.hasAchievement.mockResolvedValue(false);
    mockEmail.sendMentorRequestNotification.mockResolvedValue(undefined);
    mockEmail.sendMentorRequestDecision.mockResolvedValue(undefined);

    // Route findUnique by where.id so JwtStrategy always gets the right user
    // back, regardless of which token is on the request or how many other
    // findUnique calls the service makes within the same request lifecycle.
    mockPrisma.user.findUnique.mockImplementation(({ where }: any) => {
      if (where?.id === NGO_UUID) return Promise.resolve(makeNgoUser());
      if (where?.id === EXPERT_UUID) return Promise.resolve(makeExpertUser());
      if (where?.id === ADMIN_UUID) return Promise.resolve(makeAdminUser());
      if (where?.id === GUEST_UUID) return Promise.resolve(makeGuestUser());
      return Promise.resolve(null);
    });

    // Safe defaults — individual tests override these as needed
    mockPrisma.mentorRequest.findMany.mockResolvedValue([]);
    mockPrisma.mentorRequest.count.mockResolvedValue(0);
    mockPrisma.mentorRequest.findFirst.mockResolvedValue(null);
    mockPrisma.mentorRequest.findUnique.mockResolvedValue(null);

    // Restore email mocks after clearAllMocks wipes their implementations
    mockEmail.sendMentorRequestNotification.mockResolvedValue(undefined);
    mockEmail.sendMentorRequestDecision.mockResolvedValue(undefined);
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // POST /mentor-requests  — NGO submits a request
  // ═══════════════════════════════════════════════════════════════════════════

  describe('POST /mentor-requests', () => {
    const validBody = {
      mentorId: EXPERT_UUID,
      hoursPerWeek: '3-5 hours',
      mentorshipAreas: ['Governance'],
      commMethods: ['Email'],
      orgChallenges: 'We struggle with donor retention.',
      background: 'We are a small health NGO.',
      acceptedTerms: true,
    };

    it('201 — NGO submits a valid mentor request', async () => {
      mockPrisma.mentorRequest.findFirst.mockResolvedValue(null);
      mockPrisma.mentorRequest.create.mockResolvedValue(makeMentorRequest());

      const { body } = await request(app.getHttpServer())
        .post('/mentor-requests')
        .set('Authorization', `Bearer ${ngoToken()}`)
        .send(validBody)
        .expect(201);

      expect(body.status).toBe(true);
      expect(body.statusCode).toBe(201);
      expect(body.data.id).toBe(REQUEST_UUID);
      expect(body.data.status).toBe(MentorRequestStatus.PENDING);
      expect(mockEmail.sendMentorRequestNotification).toHaveBeenCalledTimes(1);
    });

    it('400 — rejects missing mentorId', async () => {
      const { mentorId: _removed, ...bodyWithoutMentorId } = validBody;
      await request(app.getHttpServer())
        .post('/mentor-requests')
        .set('Authorization', `Bearer ${ngoToken()}`)
        .send(bodyWithoutMentorId)
        .expect(400);
    });

    it('400 — rejects invalid UUID as mentorId', async () => {
      await request(app.getHttpServer())
        .post('/mentor-requests')
        .set('Authorization', `Bearer ${ngoToken()}`)
        .send({ ...validBody, mentorId: 'not-a-uuid' })
        .expect(400);
    });

    it('400 — returns error when acceptedTerms is false', async () => {
      mockPrisma.mentorRequest.findFirst.mockResolvedValue(null);

      const { body } = await request(app.getHttpServer())
        .post('/mentor-requests')
        .set('Authorization', `Bearer ${ngoToken()}`)
        .send({ ...validBody, acceptedTerms: false })
        .expect(201);

      expect(body.status).toBe(false);
      expect(body.message).toMatch(/terms/i);
    });

    it('400 — returns error when NGO has no organization profile', async () => {
      mockPrisma.user.findUnique.mockImplementation(({ where }: any) => {
        if (where?.id === NGO_UUID)
          return Promise.resolve(makeNgoUser({ organization: null }));
        if (where?.id === EXPERT_UUID) return Promise.resolve(makeExpertUser());
        if (where?.id === ADMIN_UUID) return Promise.resolve(makeAdminUser());
        if (where?.id === GUEST_UUID) return Promise.resolve(makeGuestUser());
        return Promise.resolve(null);
      });

      const { body } = await request(app.getHttpServer())
        .post('/mentor-requests')
        .set('Authorization', `Bearer ${ngoToken()}`)
        .send(validBody)
        .expect(201);

      expect(body.status).toBe(false);
      expect(body.message).toMatch(/organization profile/i);
    });

    it('409 — rejects duplicate PENDING request to same mentor', async () => {
      mockPrisma.mentorRequest.findFirst.mockResolvedValue(
        makeMentorRequest({ status: MentorRequestStatus.PENDING }),
      );

      const { body } = await request(app.getHttpServer())
        .post('/mentor-requests')
        .set('Authorization', `Bearer ${ngoToken()}`)
        .send(validBody)
        .expect(201);

      expect(body.status).toBe(false);
      expect(body.statusCode).toBe(409);
      expect(body.message).toMatch(/pending/i);
    });

    it('409 — rejects when APPROVED mentorship already active', async () => {
      mockPrisma.mentorRequest.findFirst.mockResolvedValue(
        makeMentorRequest({ status: MentorRequestStatus.APPROVED }),
      );

      const { body } = await request(app.getHttpServer())
        .post('/mentor-requests')
        .set('Authorization', `Bearer ${ngoToken()}`)
        .send(validBody)
        .expect(201);

      expect(body.status).toBe(false);
      expect(body.statusCode).toBe(409);
      expect(body.message).toMatch(/active mentorship/i);
    });

    it('404 — returns 404 if mentorId does not resolve to an EXPERT', async () => {
      mockPrisma.user.findUnique.mockImplementation(({ where }: any) => {
        if (where?.id === NGO_UUID) return Promise.resolve(makeNgoUser());
        if (where?.id === ADMIN_UUID) return Promise.resolve(makeAdminUser());
        if (where?.id === GUEST_UUID) return Promise.resolve(makeGuestUser());
        // EXPERT_UUID → null, simulating mentor not found
        return Promise.resolve(null);
      });

      const { body } = await request(app.getHttpServer())
        .post('/mentor-requests')
        .set('Authorization', `Bearer ${ngoToken()}`)
        .send(validBody)
        .expect(201);

      expect(body.status).toBe(false);
      expect(body.statusCode).toBe(404);
    });

    it('403 — EXPERT cannot submit a mentor request', async () => {
      await request(app.getHttpServer())
        .post('/mentor-requests')
        .set('Authorization', `Bearer ${expertToken()}`)
        .send(validBody)
        .expect(403);
    });

    it('401 — unauthenticated request is rejected', async () => {
      await request(app.getHttpServer())
        .post('/mentor-requests')
        .send(validBody)
        .expect(401);
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // GET /mentor-requests/my  — NGO lists own requests
  // ═══════════════════════════════════════════════════════════════════════════

  describe('GET /mentor-requests/my', () => {
    it('200 — returns paginated list of own requests', async () => {
      mockPrisma.mentorRequest.findMany.mockResolvedValue([
        makeMentorRequest(),
      ]);
      mockPrisma.mentorRequest.count.mockResolvedValue(1);

      const { body } = await request(app.getHttpServer())
        .get('/mentor-requests/my')
        .set('Authorization', `Bearer ${ngoToken()}`)
        .expect(200);

      expect(body.status).toBe(true);
      expect(body.data).toHaveLength(1);
      expect(body.data[0].ngoUser.id).toBe(NGO_UUID);
      expect(body.total).toBe(1);
      expect(body.page).toBe(1);
    });

    it('200 — returns empty list when NGO has no requests', async () => {
      const { body } = await request(app.getHttpServer())
        .get('/mentor-requests/my')
        .set('Authorization', `Bearer ${ngoToken()}`)
        .expect(200);

      expect(body.status).toBe(true);
      expect(body.data).toHaveLength(0);
      expect(body.total).toBe(0);
    });

    it('200 — filters by status query param', async () => {
      const { body } = await request(app.getHttpServer())
        .get('/mentor-requests/my?status=APPROVED')
        .set('Authorization', `Bearer ${ngoToken()}`)
        .expect(200);

      expect(body.status).toBe(true);
      expect(body.data).toHaveLength(0);
    });

    it('200 — respects page and limit params', async () => {
      const { body } = await request(app.getHttpServer())
        .get('/mentor-requests/my?page=2&limit=5')
        .set('Authorization', `Bearer ${ngoToken()}`)
        .expect(200);

      expect(body.page).toBe(2);
      expect(body.limit).toBe(5);
    });

    it('400 — rejects invalid status enum', async () => {
      await request(app.getHttpServer())
        .get('/mentor-requests/my?status=INVALID_STATUS')
        .set('Authorization', `Bearer ${ngoToken()}`)
        .expect(400);
    });

    it('403 — EXPERT cannot access NGO list route', async () => {
      await request(app.getHttpServer())
        .get('/mentor-requests/my')
        .set('Authorization', `Bearer ${expertToken()}`)
        .expect(403);
    });

    it('401 — unauthenticated request is rejected', async () => {
      await request(app.getHttpServer()).get('/mentor-requests/my').expect(401);
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // GET /mentor-requests/my/:id  — NGO views a single own request
  // ═══════════════════════════════════════════════════════════════════════════

  describe('GET /mentor-requests/my/:id', () => {
    it('200 — returns the request', async () => {
      mockPrisma.mentorRequest.findFirst.mockResolvedValue(makeMentorRequest());

      const { body } = await request(app.getHttpServer())
        .get(`/mentor-requests/my/${REQUEST_UUID}`)
        .set('Authorization', `Bearer ${ngoToken()}`)
        .expect(200);

      expect(body.status).toBe(true);
      expect(body.data.id).toBe(REQUEST_UUID);
    });

    it('404 — returns 404 when request does not belong to this NGO', async () => {
      mockPrisma.mentorRequest.findFirst.mockResolvedValue(null);

      const { body } = await request(app.getHttpServer())
        .get(`/mentor-requests/my/${REQUEST_UUID}`)
        .set('Authorization', `Bearer ${ngoToken()}`)
        .expect(200);

      expect(body.status).toBe(false);
      expect(body.statusCode).toBe(404);
    });

    it('400 — rejects non-UUID :id', async () => {
      await request(app.getHttpServer())
        .get('/mentor-requests/my/not-a-uuid')
        .set('Authorization', `Bearer ${ngoToken()}`)
        .expect(400);
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // PATCH /mentor-requests/my/:id  — NGO edits a pending request
  // ═══════════════════════════════════════════════════════════════════════════

  describe('PATCH /mentor-requests/my/:id', () => {
    it('200 — updates a pending request', async () => {
      mockPrisma.mentorRequest.findFirst.mockResolvedValue(makeMentorRequest());
      mockPrisma.mentorRequest.update.mockResolvedValue(
        makeMentorRequest({ hoursPerWeek: '5-8 hours' }),
      );

      const { body } = await request(app.getHttpServer())
        .patch(`/mentor-requests/my/${REQUEST_UUID}`)
        .set('Authorization', `Bearer ${ngoToken()}`)
        .send({ hoursPerWeek: '5-8 hours' })
        .expect(200);

      expect(body.status).toBe(true);
      expect(body.data.hoursPerWeek).toBe('5-8 hours');
    });

    it('400 — cannot edit a non-PENDING request', async () => {
      mockPrisma.mentorRequest.findFirst.mockResolvedValue(
        makeMentorRequest({ status: MentorRequestStatus.APPROVED }),
      );

      const { body } = await request(app.getHttpServer())
        .patch(`/mentor-requests/my/${REQUEST_UUID}`)
        .set('Authorization', `Bearer ${ngoToken()}`)
        .send({ hoursPerWeek: '5-8 hours' })
        .expect(200);

      expect(body.status).toBe(false);
      expect(body.statusCode).toBe(400);
      expect(body.message).toMatch(/APPROVED/);
    });

    it('200 — strips unknown fields (whitelist)', async () => {
      mockPrisma.mentorRequest.findFirst.mockResolvedValue(makeMentorRequest());
      mockPrisma.mentorRequest.update.mockResolvedValue(makeMentorRequest());

      const { body } = await request(app.getHttpServer())
        .patch(`/mentor-requests/my/${REQUEST_UUID}`)
        .set('Authorization', `Bearer ${ngoToken()}`)
        .send({ hoursPerWeek: '3-5 hours', unknownField: 'injected' })
        .expect(200);

      expect(body.status).toBe(true);
    });

    it('400 — rejects non-UUID :id param', async () => {
      await request(app.getHttpServer())
        .patch('/mentor-requests/my/not-a-uuid')
        .set('Authorization', `Bearer ${ngoToken()}`)
        .send({ hoursPerWeek: '3-5 hours' })
        .expect(400);
    });

    it('403 — EXPERT cannot edit NGO requests', async () => {
      await request(app.getHttpServer())
        .patch(`/mentor-requests/my/${REQUEST_UUID}`)
        .set('Authorization', `Bearer ${expertToken()}`)
        .send({ hoursPerWeek: '3-5 hours' })
        .expect(403);
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // DELETE /mentor-requests/my/:id  — NGO cancels a pending request
  // ═══════════════════════════════════════════════════════════════════════════

  describe('DELETE /mentor-requests/my/:id', () => {
    it('200 — cancels a pending request', async () => {
      mockPrisma.mentorRequest.findFirst.mockResolvedValue(makeMentorRequest());
      mockPrisma.mentorRequest.delete.mockResolvedValue({});

      const { body } = await request(app.getHttpServer())
        .delete(`/mentor-requests/my/${REQUEST_UUID}`)
        .set('Authorization', `Bearer ${ngoToken()}`)
        .expect(200);

      expect(body.status).toBe(true);
      expect(body.message).toMatch(/cancelled/i);
      expect(mockPrisma.mentorRequest.delete).toHaveBeenCalledWith({
        where: { id: REQUEST_UUID },
      });
    });

    it('400 — cannot cancel an APPROVED request', async () => {
      mockPrisma.mentorRequest.findFirst.mockResolvedValue(
        makeMentorRequest({ status: MentorRequestStatus.APPROVED }),
      );

      const { body } = await request(app.getHttpServer())
        .delete(`/mentor-requests/my/${REQUEST_UUID}`)
        .set('Authorization', `Bearer ${ngoToken()}`)
        .expect(200);

      expect(body.status).toBe(false);
      expect(body.statusCode).toBe(400);
      expect(mockPrisma.mentorRequest.delete).not.toHaveBeenCalled();
    });

    it('404 — cannot cancel a request that is not yours', async () => {
      mockPrisma.mentorRequest.findFirst.mockResolvedValue(null);

      const { body } = await request(app.getHttpServer())
        .delete(`/mentor-requests/my/${REQUEST_UUID}`)
        .set('Authorization', `Bearer ${ngoToken()}`)
        .expect(200);

      expect(body.status).toBe(false);
      expect(body.statusCode).toBe(404);
    });

    it('400 — rejects non-UUID :id', async () => {
      await request(app.getHttpServer())
        .delete('/mentor-requests/my/not-a-uuid')
        .set('Authorization', `Bearer ${ngoToken()}`)
        .expect(400);
    });

    it('401 — unauthenticated request is rejected', async () => {
      await request(app.getHttpServer())
        .delete(`/mentor-requests/my/${REQUEST_UUID}`)
        .expect(401);
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // GET /mentor-requests/incoming  — Expert lists incoming requests
  // ═══════════════════════════════════════════════════════════════════════════

  describe('GET /mentor-requests/incoming', () => {
    it('200 — expert sees incoming requests', async () => {
      mockPrisma.mentorRequest.findMany.mockResolvedValue([
        makeMentorRequest(),
      ]);
      mockPrisma.mentorRequest.count.mockResolvedValue(1);

      const { body } = await request(app.getHttpServer())
        .get('/mentor-requests/incoming')
        .set('Authorization', `Bearer ${expertToken()}`)
        .expect(200);

      expect(body.status).toBe(true);
      expect(body.data).toHaveLength(1);
      expect(body.data[0].mentor.id).toBe(EXPERT_UUID);
    });

    it('200 — filters by PENDING status', async () => {
      const { body } = await request(app.getHttpServer())
        .get('/mentor-requests/incoming?status=PENDING')
        .set('Authorization', `Bearer ${expertToken()}`)
        .expect(200);

      expect(body.data).toHaveLength(0);
    });

    it('400 — rejects invalid status enum', async () => {
      await request(app.getHttpServer())
        .get('/mentor-requests/incoming?status=INVALID_STATUS')
        .set('Authorization', `Bearer ${expertToken()}`)
        .expect(400);
    });

    it('403 — NGO cannot access expert incoming route', async () => {
      await request(app.getHttpServer())
        .get('/mentor-requests/incoming')
        .set('Authorization', `Bearer ${ngoToken()}`)
        .expect(403);
    });

    it('401 — unauthenticated request is rejected', async () => {
      await request(app.getHttpServer())
        .get('/mentor-requests/incoming')
        .expect(401);
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // GET /mentor-requests/incoming/:id  — Expert views a single request
  // ═══════════════════════════════════════════════════════════════════════════

  describe('GET /mentor-requests/incoming/:id', () => {
    it('200 — returns the request detail', async () => {
      mockPrisma.mentorRequest.findFirst.mockResolvedValue(makeMentorRequest());

      const { body } = await request(app.getHttpServer())
        .get(`/mentor-requests/incoming/${REQUEST_UUID}`)
        .set('Authorization', `Bearer ${expertToken()}`)
        .expect(200);

      expect(body.status).toBe(true);
      expect(body.data.id).toBe(REQUEST_UUID);
      expect(body.data.ngoUser.email).toBe('ngo@example.com');
    });

    it('404 — returns 404 when request does not belong to this expert', async () => {
      mockPrisma.mentorRequest.findFirst.mockResolvedValue(null);

      const { body } = await request(app.getHttpServer())
        .get(`/mentor-requests/incoming/${REQUEST_UUID}`)
        .set('Authorization', `Bearer ${expertToken()}`)
        .expect(200);

      expect(body.status).toBe(false);
      expect(body.statusCode).toBe(404);
    });

    it('400 — rejects non-UUID :id', async () => {
      await request(app.getHttpServer())
        .get('/mentor-requests/incoming/not-a-uuid')
        .set('Authorization', `Bearer ${expertToken()}`)
        .expect(400);
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // PATCH /mentor-requests/incoming/:id/respond  — Expert accepts or declines
  // ═══════════════════════════════════════════════════════════════════════════

  describe('PATCH /mentor-requests/incoming/:id/respond', () => {
    it('200 — expert approves the request', async () => {
      mockPrisma.mentorRequest.findFirst.mockResolvedValue(makeMentorRequest());
      mockPrisma.mentorRequest.update.mockResolvedValue(
        makeMentorRequest({ status: MentorRequestStatus.APPROVED }),
      );

      const { body } = await request(app.getHttpServer())
        .patch(`/mentor-requests/incoming/${REQUEST_UUID}/respond`)
        .set('Authorization', `Bearer ${expertToken()}`)
        .send({ action: 'APPROVED' })
        .expect(200);

      expect(body.status).toBe(true);
      expect(body.data.status).toBe(MentorRequestStatus.APPROVED);
      expect(mockEmail.sendMentorRequestDecision).toHaveBeenCalledWith(
        expect.objectContaining({ decision: 'APPROVED' }),
      );
    });

    it('200 — expert declines with an optional message', async () => {
      mockPrisma.mentorRequest.findFirst.mockResolvedValue(makeMentorRequest());
      mockPrisma.mentorRequest.update.mockResolvedValue(
        makeMentorRequest({ status: MentorRequestStatus.DECLINED }),
      );

      const { body } = await request(app.getHttpServer())
        .patch(`/mentor-requests/incoming/${REQUEST_UUID}/respond`)
        .set('Authorization', `Bearer ${expertToken()}`)
        .send({ action: 'DECLINED', message: 'At full capacity right now.' })
        .expect(200);

      expect(body.status).toBe(true);
      expect(body.data.status).toBe(MentorRequestStatus.DECLINED);
      expect(mockEmail.sendMentorRequestDecision).toHaveBeenCalledWith(
        expect.objectContaining({
          decision: 'DECLINED',
          message: 'At full capacity right now.',
        }),
      );
    });

    it('400 — cannot respond to a non-PENDING request', async () => {
      mockPrisma.mentorRequest.findFirst.mockResolvedValue(
        makeMentorRequest({ status: MentorRequestStatus.APPROVED }),
      );

      const { body } = await request(app.getHttpServer())
        .patch(`/mentor-requests/incoming/${REQUEST_UUID}/respond`)
        .set('Authorization', `Bearer ${expertToken()}`)
        .send({ action: 'APPROVED' })
        .expect(200);

      expect(body.status).toBe(false);
      expect(body.statusCode).toBe(400);
    });

    it('400 — rejects invalid action value', async () => {
      await request(app.getHttpServer())
        .patch(`/mentor-requests/incoming/${REQUEST_UUID}/respond`)
        .set('Authorization', `Bearer ${expertToken()}`)
        .send({ action: 'MAYBE' })
        .expect(400);
    });

    it('400 — rejects missing action field', async () => {
      await request(app.getHttpServer())
        .patch(`/mentor-requests/incoming/${REQUEST_UUID}/respond`)
        .set('Authorization', `Bearer ${expertToken()}`)
        .send({})
        .expect(400);
    });

    it('403 — NGO cannot respond to requests', async () => {
      await request(app.getHttpServer())
        .patch(`/mentor-requests/incoming/${REQUEST_UUID}/respond`)
        .set('Authorization', `Bearer ${ngoToken()}`)
        .send({ action: 'APPROVED' })
        .expect(403);
    });

    it('400 — rejects non-UUID :id', async () => {
      await request(app.getHttpServer())
        .patch('/mentor-requests/incoming/not-a-uuid/respond')
        .set('Authorization', `Bearer ${expertToken()}`)
        .send({ action: 'APPROVED' })
        .expect(400);
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // PATCH /mentor-requests/incoming/:id/complete  — Expert marks as complete
  // ═══════════════════════════════════════════════════════════════════════════

  describe('PATCH /mentor-requests/incoming/:id/complete', () => {
    it('200 — marks an APPROVED mentorship as COMPLETED', async () => {
      mockPrisma.mentorRequest.findFirst.mockResolvedValue(
        makeMentorRequest({ status: MentorRequestStatus.APPROVED }),
      );
      mockPrisma.mentorRequest.update.mockResolvedValue(
        makeMentorRequest({ status: MentorRequestStatus.COMPLETED }),
      );

      const { body } = await request(app.getHttpServer())
        .patch(`/mentor-requests/incoming/${REQUEST_UUID}/complete`)
        .set('Authorization', `Bearer ${expertToken()}`)
        .expect(200);

      expect(body.status).toBe(true);
      expect(body.data.status).toBe(MentorRequestStatus.COMPLETED);
    });

    it('400 — cannot complete a PENDING mentorship', async () => {
      mockPrisma.mentorRequest.findFirst.mockResolvedValue(
        makeMentorRequest({ status: MentorRequestStatus.PENDING }),
      );

      const { body } = await request(app.getHttpServer())
        .patch(`/mentor-requests/incoming/${REQUEST_UUID}/complete`)
        .set('Authorization', `Bearer ${expertToken()}`)
        .expect(200);

      expect(body.status).toBe(false);
      expect(body.statusCode).toBe(400);
      expect(body.message).toMatch(/APPROVED/i);
    });

    it('404 — returns 404 when request does not belong to this expert', async () => {
      mockPrisma.mentorRequest.findFirst.mockResolvedValue(null);

      const { body } = await request(app.getHttpServer())
        .patch(`/mentor-requests/incoming/${REQUEST_UUID}/complete`)
        .set('Authorization', `Bearer ${expertToken()}`)
        .expect(200);

      expect(body.status).toBe(false);
      expect(body.statusCode).toBe(404);
    });

    it('403 — NGO cannot mark mentorships as complete', async () => {
      await request(app.getHttpServer())
        .patch(`/mentor-requests/incoming/${REQUEST_UUID}/complete`)
        .set('Authorization', `Bearer ${ngoToken()}`)
        .expect(403);
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // GET /mentor-requests/admin  — Admin lists all requests
  // ═══════════════════════════════════════════════════════════════════════════

  describe('GET /mentor-requests/admin', () => {
    it('200 — admin sees all requests across all users', async () => {
      mockPrisma.mentorRequest.findMany.mockResolvedValue([
        makeMentorRequest(),
        makeMentorRequest({
          id: OTHER_UUID,
          status: MentorRequestStatus.APPROVED,
        }),
      ]);
      mockPrisma.mentorRequest.count.mockResolvedValue(2);

      const { body } = await request(app.getHttpServer())
        .get('/mentor-requests/admin')
        .set('Authorization', `Bearer ${adminToken()}`)
        .expect(200);

      expect(body.status).toBe(true);
      expect(body.data).toHaveLength(2);
      expect(body.total).toBe(2);
    });

    it('200 — supports status filter', async () => {
      mockPrisma.mentorRequest.findMany.mockResolvedValue([
        makeMentorRequest({ status: MentorRequestStatus.APPROVED }),
      ]);
      mockPrisma.mentorRequest.count.mockResolvedValue(1);

      const { body } = await request(app.getHttpServer())
        .get('/mentor-requests/admin?status=APPROVED')
        .set('Authorization', `Bearer ${adminToken()}`)
        .expect(200);

      expect(body.data).toHaveLength(1);
    });

    it('403 — NGO_MEMBER cannot access admin list', async () => {
      await request(app.getHttpServer())
        .get('/mentor-requests/admin')
        .set('Authorization', `Bearer ${ngoToken()}`)
        .expect(403);
    });

    it('403 — EXPERT cannot access admin list', async () => {
      await request(app.getHttpServer())
        .get('/mentor-requests/admin')
        .set('Authorization', `Bearer ${expertToken()}`)
        .expect(403);
    });

    it('401 — unauthenticated request is rejected', async () => {
      await request(app.getHttpServer())
        .get('/mentor-requests/admin')
        .expect(401);
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // GET /mentor-requests/admin/stats  — Admin gets status counts
  // ═══════════════════════════════════════════════════════════════════════════

  describe('GET /mentor-requests/admin/stats', () => {
    it('200 — returns all status counts', async () => {
      mockPrisma.mentorRequest.count
        .mockResolvedValueOnce(15) // total
        .mockResolvedValueOnce(8) // pending
        .mockResolvedValueOnce(4) // approved
        .mockResolvedValueOnce(2) // declined
        .mockResolvedValueOnce(1); // completed

      const { body } = await request(app.getHttpServer())
        .get('/mentor-requests/admin/stats')
        .set('Authorization', `Bearer ${adminToken()}`)
        .expect(200);

      expect(body.status).toBe(true);
      expect(body.data.total).toBe(15);
      expect(body.data.pending).toBe(8);
      expect(body.data.approved).toBe(4);
      expect(body.data.declined).toBe(2);
      expect(body.data.completed).toBe(1);
    });

    it('403 — NGO cannot access stats', async () => {
      await request(app.getHttpServer())
        .get('/mentor-requests/admin/stats')
        .set('Authorization', `Bearer ${ngoToken()}`)
        .expect(403);
    });

    it('403 — EXPERT cannot access stats', async () => {
      await request(app.getHttpServer())
        .get('/mentor-requests/admin/stats')
        .set('Authorization', `Bearer ${expertToken()}`)
        .expect(403);
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // GET /mentor-requests/admin/:id  — Admin views any single request
  // ═══════════════════════════════════════════════════════════════════════════

  describe('GET /mentor-requests/admin/:id', () => {
    it('200 — admin retrieves any request by ID', async () => {
      mockPrisma.mentorRequest.findUnique.mockResolvedValue(
        makeMentorRequest(),
      );

      const { body } = await request(app.getHttpServer())
        .get(`/mentor-requests/admin/${REQUEST_UUID}`)
        .set('Authorization', `Bearer ${adminToken()}`)
        .expect(200);

      expect(body.status).toBe(true);
      expect(body.data.id).toBe(REQUEST_UUID);
    });

    it('404 — returns 404 for unknown ID', async () => {
      mockPrisma.mentorRequest.findUnique.mockResolvedValue(null);

      const { body } = await request(app.getHttpServer())
        .get(`/mentor-requests/admin/${REQUEST_UUID}`)
        .set('Authorization', `Bearer ${adminToken()}`)
        .expect(200);

      expect(body.status).toBe(false);
      expect(body.statusCode).toBe(404);
    });

    it('400 — rejects non-UUID :id', async () => {
      await request(app.getHttpServer())
        .get('/mentor-requests/admin/not-a-uuid')
        .set('Authorization', `Bearer ${adminToken()}`)
        .expect(400);
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // PATCH /mentor-requests/admin/:id/status  — Admin overrides status
  // ═══════════════════════════════════════════════════════════════════════════

  describe('PATCH /mentor-requests/admin/:id/status', () => {
    it('200 — admin overrides status to COMPLETED', async () => {
      mockPrisma.mentorRequest.findUnique.mockResolvedValue(
        makeMentorRequest(),
      );
      mockPrisma.mentorRequest.update.mockResolvedValue(
        makeMentorRequest({ status: MentorRequestStatus.COMPLETED }),
      );

      const { body } = await request(app.getHttpServer())
        .patch(`/mentor-requests/admin/${REQUEST_UUID}/status`)
        .set('Authorization', `Bearer ${adminToken()}`)
        .send({ status: 'COMPLETED' })
        .expect(200);

      expect(body.status).toBe(true);
      expect(body.data.status).toBe(MentorRequestStatus.COMPLETED);
    });

    it('200 — admin can set status to DECLINED', async () => {
      mockPrisma.mentorRequest.findUnique.mockResolvedValue(
        makeMentorRequest(),
      );
      mockPrisma.mentorRequest.update.mockResolvedValue(
        makeMentorRequest({ status: MentorRequestStatus.DECLINED }),
      );

      const { body } = await request(app.getHttpServer())
        .patch(`/mentor-requests/admin/${REQUEST_UUID}/status`)
        .set('Authorization', `Bearer ${adminToken()}`)
        .send({ status: 'DECLINED' })
        .expect(200);

      expect(body.status).toBe(true);
      expect(body.message).toMatch(/DECLINED/);
    });

    it('400 — rejects invalid status value', async () => {
      await request(app.getHttpServer())
        .patch(`/mentor-requests/admin/${REQUEST_UUID}/status`)
        .set('Authorization', `Bearer ${adminToken()}`)
        .send({ status: 'INVALID' })
        .expect(400);
    });

    it('400 — rejects missing status field', async () => {
      await request(app.getHttpServer())
        .patch(`/mentor-requests/admin/${REQUEST_UUID}/status`)
        .set('Authorization', `Bearer ${adminToken()}`)
        .send({})
        .expect(400);
    });

    it('404 — returns 404 for unknown request', async () => {
      mockPrisma.mentorRequest.findUnique.mockResolvedValue(null);

      const { body } = await request(app.getHttpServer())
        .patch(`/mentor-requests/admin/${REQUEST_UUID}/status`)
        .set('Authorization', `Bearer ${adminToken()}`)
        .send({ status: 'COMPLETED' })
        .expect(200);

      expect(body.status).toBe(false);
      expect(body.statusCode).toBe(404);
    });

    it('403 — NGO cannot override status', async () => {
      await request(app.getHttpServer())
        .patch(`/mentor-requests/admin/${REQUEST_UUID}/status`)
        .set('Authorization', `Bearer ${ngoToken()}`)
        .send({ status: 'COMPLETED' })
        .expect(403);
    });

    it('400 — rejects non-UUID :id', async () => {
      await request(app.getHttpServer())
        .patch('/mentor-requests/admin/not-a-uuid/status')
        .set('Authorization', `Bearer ${adminToken()}`)
        .send({ status: 'COMPLETED' })
        .expect(400);
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // DELETE /mentor-requests/admin/:id  — Admin hard deletes
  // ═══════════════════════════════════════════════════════════════════════════

  describe('DELETE /mentor-requests/admin/:id', () => {
    it('200 — admin deletes any request', async () => {
      mockPrisma.mentorRequest.findUnique.mockResolvedValue(
        makeMentorRequest(),
      );
      mockPrisma.mentorRequest.delete.mockResolvedValue({});

      const { body } = await request(app.getHttpServer())
        .delete(`/mentor-requests/admin/${REQUEST_UUID}`)
        .set('Authorization', `Bearer ${adminToken()}`)
        .expect(200);

      expect(body.status).toBe(true);
      expect(body.message).toMatch(/deleted/i);
      expect(mockPrisma.mentorRequest.delete).toHaveBeenCalledWith({
        where: { id: REQUEST_UUID },
      });
    });

    it('404 — returns 404 for unknown request (delete not called)', async () => {
      mockPrisma.mentorRequest.findUnique.mockResolvedValue(null);

      const { body } = await request(app.getHttpServer())
        .delete(`/mentor-requests/admin/${REQUEST_UUID}`)
        .set('Authorization', `Bearer ${adminToken()}`)
        .expect(200);

      expect(body.status).toBe(false);
      expect(body.statusCode).toBe(404);
      expect(mockPrisma.mentorRequest.delete).not.toHaveBeenCalled();
    });

    it('400 — rejects non-UUID :id', async () => {
      await request(app.getHttpServer())
        .delete('/mentor-requests/admin/not-a-uuid')
        .set('Authorization', `Bearer ${adminToken()}`)
        .expect(400);
    });

    it('403 — EXPERT cannot delete requests', async () => {
      await request(app.getHttpServer())
        .delete(`/mentor-requests/admin/${REQUEST_UUID}`)
        .set('Authorization', `Bearer ${expertToken()}`)
        .expect(403);
    });

    it('403 — NGO cannot delete requests', async () => {
      await request(app.getHttpServer())
        .delete(`/mentor-requests/admin/${REQUEST_UUID}`)
        .set('Authorization', `Bearer ${ngoToken()}`)
        .expect(403);
    });

    it('401 — unauthenticated request is rejected', async () => {
      await request(app.getHttpServer())
        .delete(`/mentor-requests/admin/${REQUEST_UUID}`)
        .expect(401);
    });
  });
});
