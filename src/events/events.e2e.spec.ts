/* eslint-disable @typescript-eslint/no-unused-vars */
import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { JwtService, JwtModule } from '@nestjs/jwt';
import { Reflector } from '@nestjs/core';
import { PassportModule } from '@nestjs/passport';
import { ConfigModule, ConfigService } from '@nestjs/config';
import request from 'supertest';
import { Role } from '@prisma/client';
import { EventController } from 'src/events/controller/events.controller';
import { EventService } from 'src/events/service/events.service';
import { JwtStrategy } from 'src/common/strategies/jwt.strategy';
import { JwtAuthGuard } from 'src/common/guards/jwt-auth.guard';
import { OptionalJwtGuard } from 'src/common/guards/optional-jwt.guard';
import { RolesGuard } from 'src/common/guards/roles.guard';
import { PermissionsGuard } from 'src/common/guards/permissions.guard';
import { PrismaService } from 'src/prisma-module/prisma.service';
import { EmailService } from 'src/providers/email/email.service';
import { AzureBlobService } from 'src/providers/azure/azure.blob.service';
import { JitsiService } from 'src/providers/jitsi/jitsi.service';

// ─────────────────────────────────────────────────────────────────────────────
// CONSTANTS
// ─────────────────────────────────────────────────────────────────────────────

const JWT_SECRET = 'test-secret-do-not-use-in-prod';
const EVENT_UUID = 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11';
const ADMIN_UUID = 'b1ffcd00-0d1c-4ef8-bb6d-6bb9bd380a22';
const USER_UUID = 'c2eebc99-9c0b-4ef8-bb6d-6bb9bd380a33';
const NGO_UUID = 'e5eebc99-9c0b-4ef8-bb6d-6bb9bd380a55';
const EXPERT_UUID = 'f6eebc99-9c0b-4ef8-bb6d-6bb9bd380a66';
const REG_UUID = 'd3eebc99-9c0b-4ef8-bb6d-6bb9bd380a44';

const FUTURE_START = new Date(Date.now() + 3_600_000).toISOString();
const FUTURE_END = new Date(Date.now() + 7_200_000).toISOString();
const PAST_DATE = new Date(Date.now() - 86_400_000).toISOString();

// ─────────────────────────────────────────────────────────────────────────────
// FIXTURES
// ─────────────────────────────────────────────────────────────────────────────

function makeEvent(overrides: Record<string, any> = {}): any {
  return {
    id: EVENT_UUID,
    title: 'NGO Leadership Webinar',
    description: 'An insightful session.',
    startTime: new Date(FUTURE_START),
    endTime: new Date(FUTURE_END),
    jitsiRoomId: 'plrcap-abc123-def456',
    capacity: 100,
    tags: ['governance'],
    externalMeetingUrl: 'https://meet.jit.si/plrcap-abc123-def456',
    coverImageUrl: null,
    archiveUrl: null,
    isCancelled: false,
    isPast: false,
    cancellationReason: null,
    createdById: ADMIN_UUID,
    _count: { registrations: 5 },
    registrations: [],
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

function makeRegistration(overrides: Record<string, any> = {}): any {
  return {
    id: REG_UUID,
    userId: USER_UUID,
    eventId: EVENT_UUID,
    createdAt: new Date(),
    updatedAt: new Date(),
    user: { fullName: 'Test User', email: 'user@example.com' },
    event: makeEvent(),
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
    isEmailVerified: true,
    passwordHash: 'hash',
    otp: null,
    otpExpiresAt: null,
    avatarUrl: null,
    phoneNumber: null,
    adminPermission: null,
    organization: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

function makeAdminUser(): any {
  return makeDbUser({
    id: ADMIN_UUID,
    email: 'admin@example.com',
    role: Role.SUPER_ADMIN,
    adminPermission: {
      permissions: [
        'event:read',
        'event:write',
        'event:delete',
        'event:manage_attendees',
      ],
    },
  });
}

function makeEventAdminUser(): any {
  return makeDbUser({
    id: ADMIN_UUID,
    email: 'eventadmin@example.com',
    role: Role.EVENT_ADMIN,
    adminPermission: {
      permissions: ['event:read', 'event:write', 'event:manage_attendees'],
    },
  });
}

function makeNgoUser(): any {
  return makeDbUser({
    id: NGO_UUID,
    email: 'ngo@example.com',
    role: Role.NGO_MEMBER,
    adminPermission: {
      permissions: [
        'event:read',
        'event:write',
        'event:delete',
        'event:manage_attendees',
      ],
    },
  });
}

function makeExpertUser(): any {
  return makeDbUser({
    id: EXPERT_UUID,
    email: 'expert@example.com',
    role: Role.EXPERT,
    adminPermission: {
      permissions: [
        'event:read',
        'event:write',
        'event:delete',
        'event:manage_attendees',
      ],
    },
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// MOCK PRISMA
// ─────────────────────────────────────────────────────────────────────────────

const mockPrisma = {
  user: { findUnique: jest.fn(), findMany: jest.fn() },
  event: {
    findUnique: jest.fn(),
    findMany: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
    count: jest.fn(),
  },
  eventRegistration: {
    findUnique: jest.fn(),
    findMany: jest.fn(),
    create: jest.fn(),
    delete: jest.fn(),
    deleteMany: jest.fn(),
    count: jest.fn(),
  },
  auditLog: { create: jest.fn() },
  $transaction: jest.fn(),
};

const mockEmail = {
  sendEventRegistrationConfirmation: jest.fn().mockResolvedValue(undefined),
  sendEventUpdateNotification: jest.fn().mockResolvedValue(undefined),
  sendEventCancellationNotification: jest.fn().mockResolvedValue(undefined),
};

const mockAzure = {
  upload: jest.fn().mockResolvedValue('https://blob.example.com/cover.jpg'),
  delete: jest.fn().mockResolvedValue(undefined),
};

const mockJitsi = {
  generateRoomId: jest.fn().mockReturnValue('plrcap-abc123-def456'),
  generateToken: jest.fn().mockReturnValue('mock-jitsi-jwt-token'),
  getMeetingUrl: jest
    .fn()
    .mockReturnValue('https://meet.jit.si/plrcap-abc123-def456'),
};

// ─────────────────────────────────────────────────────────────────────────────
// BOOTSTRAP
// ─────────────────────────────────────────────────────────────────────────────

process.env.JWT_SECRET = JWT_SECRET;
let jwtService: JwtService;
const tok = (sub: string, role: string) => () =>
  jwtService.sign({ sub, email: `${role}@example.com`, role });
let adminToken: () => string;
let eventAdminToken: () => string;
let userToken: () => string;
let ngoToken: () => string;
let expertToken: () => string;

describe('Events Module — E2E', () => {
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
      controllers: [EventController],
      providers: [
        EventService,
        JwtStrategy,
        Reflector,
        JwtAuthGuard,
        RolesGuard,
        PermissionsGuard,
        OptionalJwtGuard,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: EmailService, useValue: mockEmail },
        { provide: AzureBlobService, useValue: mockAzure },
        { provide: JitsiService, useValue: mockJitsi },
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
    eventAdminToken = tok(ADMIN_UUID, Role.EVENT_ADMIN);
    userToken = tok(USER_UUID, Role.GUEST);
    ngoToken = tok(NGO_UUID, Role.NGO_MEMBER);
    expertToken = tok(EXPERT_UUID, Role.EXPERT);
  });

  afterAll(() => app.close());

  beforeEach(() => {
    jest.resetAllMocks();
    mockAzure.upload.mockResolvedValue('https://blob.example.com/cover.jpg');
    mockAzure.delete.mockResolvedValue(undefined);
    mockJitsi.generateRoomId.mockReturnValue('plrcap-abc123-def456');
    mockJitsi.generateToken.mockReturnValue('mock-jitsi-jwt-token');
    mockJitsi.getMeetingUrl.mockReturnValue(
      'https://meet.jit.si/plrcap-abc123-def456',
    );
    mockEmail.sendEventRegistrationConfirmation.mockResolvedValue(undefined);
    mockEmail.sendEventUpdateNotification.mockResolvedValue(undefined);
    mockEmail.sendEventCancellationNotification.mockResolvedValue(undefined);

    mockPrisma.user.findUnique.mockImplementation(({ where }: any) => {
      if (where?.id === ADMIN_UUID) return Promise.resolve(makeAdminUser());
      if (where?.id === USER_UUID) return Promise.resolve(makeDbUser());
      if (where?.id === NGO_UUID) return Promise.resolve(makeNgoUser());
      if (where?.id === EXPERT_UUID) return Promise.resolve(makeExpertUser());
      return Promise.resolve(null);
    });
    mockPrisma.$transaction.mockImplementation((q: any[]) => Promise.all(q));
    mockPrisma.auditLog.create.mockResolvedValue({});
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // GET /events
  // ═══════════════════════════════════════════════════════════════════════════

  describe('GET /events', () => {
    beforeEach(() => {
      mockPrisma.event.findMany.mockResolvedValue([makeEvent()]);
      mockPrisma.event.count.mockResolvedValue(1);
    });

    it('200 — public, no token needed', async () => {
      const { body } = await request(app.getHttpServer())
        .get('/events')
        .expect(200);
      expect(body.status).toBe(true);
      expect(body.data.events).toHaveLength(1);
    });

    it('200 — default pagination: skip=0, take=20', async () => {
      await request(app.getHttpServer()).get('/events').expect(200);
      expect(mockPrisma.event.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ skip: 0, take: 20 }),
      );
    });

    it('200 — non-numeric page/limit falls back to defaults', async () => {
      await request(app.getHttpServer())
        .get('/events?page=abc&limit=xyz')
        .expect(200);
      const call = mockPrisma.event.findMany.mock.calls[0][0];
      expect(call.skip).toBe(0);
      expect(call.take).toBe(20);
    });

    it('200 — page=3&limit=10 → skip=20, take=10', async () => {
      await request(app.getHttpServer())
        .get('/events?page=3&limit=10')
        .expect(200);
      expect(mockPrisma.event.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ skip: 20, take: 10 }),
      );
    });

    it('200 — limit capped at 100', async () => {
      await request(app.getHttpServer()).get('/events?limit=9999').expect(200);
      expect(mockPrisma.event.findMany.mock.calls[0][0].take).toBe(100);
    });

    it('200 — search filter applied', async () => {
      await request(app.getHttpServer())
        .get('/events?search=Leadership')
        .expect(200);
      const call = mockPrisma.event.findMany.mock.calls[0][0];
      expect(call.where.OR).toHaveLength(2);
    });

    it('200 — tag filter applied', async () => {
      await request(app.getHttpServer())
        .get('/events?tag=governance')
        .expect(200);
      expect(mockPrisma.event.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ tags: { has: 'governance' } }),
        }),
      );
    });

    it('200 — UPCOMING status filter', async () => {
      await request(app.getHttpServer())
        .get('/events?status=UPCOMING')
        .expect(200);
      const call = mockPrisma.event.findMany.mock.calls[0][0];
      expect(call.where.isPast).toBe(false);
      expect(call.where.isCancelled).toBe(false);
    });

    it('200 — CANCELLED status filter', async () => {
      await request(app.getHttpServer())
        .get('/events?status=CANCELLED')
        .expect(200);
      expect(mockPrisma.event.findMany.mock.calls[0][0].where.isCancelled).toBe(
        true,
      );
    });

    it('400 — invalid status enum', () =>
      request(app.getHttpServer()).get('/events?status=INVALID').expect(400));

    it('200 — event includes meetingUrl from Jitsi', async () => {
      const { body } = await request(app.getHttpServer())
        .get('/events')
        .expect(200);
      expect(body.data.events[0].meetingUrl).toBe(
        'https://meet.jit.si/plrcap-abc123-def456',
      );
    });

    it('200 — correct pagination metadata', async () => {
      mockPrisma.event.count.mockResolvedValue(50);
      const { body } = await request(app.getHttpServer())
        .get('/events?page=2&limit=10')
        .expect(200);
      expect(body.data).toMatchObject({
        total: 50,
        page: 2,
        limit: 10,
        pages: 5,
      });
    });

    it('200 — unauthenticated: isRegistered and isOwned flags absent', async () => {
      const { body } = await request(app.getHttpServer())
        .get('/events')
        .expect(200);
      expect(body.data.events[0].isRegistered).toBeUndefined();
      expect(body.data.events[0].isOwned).toBeUndefined();
    });

    it('200 — authenticated, registered for event: isRegistered=true', async () => {
      mockPrisma.eventRegistration.findMany.mockResolvedValue([
        { eventId: EVENT_UUID },
      ]);
      const { body } = await request(app.getHttpServer())
        .get('/events')
        .set('Authorization', `Bearer ${userToken()}`)
        .expect(200);
      expect(body.data.events[0].isRegistered).toBe(true);
      expect(body.data.events[0].isOwned).toBe(false);
    });

    it('200 — authenticated, not registered: isRegistered=false', async () => {
      mockPrisma.eventRegistration.findMany.mockResolvedValue([]);
      const { body } = await request(app.getHttpServer())
        .get('/events')
        .set('Authorization', `Bearer ${userToken()}`)
        .expect(200);
      expect(body.data.events[0].isRegistered).toBe(false);
    });

    it('200 — authenticated, event creator: isOwned=true', async () => {
      mockPrisma.event.findMany.mockResolvedValue([
        makeEvent({ createdById: NGO_UUID }),
      ]);
      mockPrisma.eventRegistration.findMany.mockResolvedValue([]);
      const { body } = await request(app.getHttpServer())
        .get('/events')
        .set('Authorization', `Bearer ${ngoToken()}`)
        .expect(200);
      expect(body.data.events[0].isOwned).toBe(true);
    });

    it('200 — authenticated, registered AND owns event: both flags true', async () => {
      mockPrisma.event.findMany.mockResolvedValue([
        makeEvent({ createdById: NGO_UUID }),
      ]);
      mockPrisma.eventRegistration.findMany.mockResolvedValue([
        { eventId: EVENT_UUID },
      ]);
      const { body } = await request(app.getHttpServer())
        .get('/events')
        .set('Authorization', `Bearer ${ngoToken()}`)
        .expect(200);
      expect(body.data.events[0].isRegistered).toBe(true);
      expect(body.data.events[0].isOwned).toBe(true);
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // GET /events/:id
  // ═══════════════════════════════════════════════════════════════════════════

  describe('GET /events/:id', () => {
    it('400 — non-UUID id', () =>
      request(app.getHttpServer()).get('/events/not-a-uuid').expect(400));

    it('404 in body — not found', async () => {
      mockPrisma.event.findUnique.mockResolvedValue(null);
      const { body } = await request(app.getHttpServer())
        .get(`/events/${EVENT_UUID}`)
        .expect(200);
      expect(body.statusCode).toBe(404);
    });

    it('200 — returns event with registrationCount', async () => {
      mockPrisma.event.findUnique.mockResolvedValue(makeEvent());
      const { body } = await request(app.getHttpServer())
        .get(`/events/${EVENT_UUID}`)
        .expect(200);
      expect(body.data.registrationCount).toBe(5);
    });

    it('200 — cancelled event status is CANCELLED', async () => {
      mockPrisma.event.findUnique.mockResolvedValue(
        makeEvent({ isCancelled: true }),
      );
      const { body } = await request(app.getHttpServer())
        .get(`/events/${EVENT_UUID}`)
        .expect(200);
      expect(body.data.status).toBe('CANCELLED');
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // GET /events/my/created
  // ═══════════════════════════════════════════════════════════════════════════

  describe('GET /events/my/created', () => {
    beforeEach(() => {
      mockPrisma.event.findMany.mockResolvedValue([
        makeEvent({ createdById: NGO_UUID }),
      ]);
      mockPrisma.event.count.mockResolvedValue(1);
    });

    it('401 — no token', () =>
      request(app.getHttpServer()).get('/events/my/created').expect(401));

    it('200 — NGO member fetches their created events', async () => {
      const { body } = await request(app.getHttpServer())
        .get('/events/my/created')
        .set('Authorization', `Bearer ${ngoToken()}`)
        .expect(200);
      expect(body.status).toBe(true);
      expect(body.data.events).toHaveLength(1);
      expect(mockPrisma.event.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ createdById: NGO_UUID }),
        }),
      );
    });

    it('200 — Expert fetches their created events', async () => {
      mockPrisma.event.findMany.mockResolvedValue([
        makeEvent({ createdById: EXPERT_UUID }),
      ]);
      const { body } = await request(app.getHttpServer())
        .get('/events/my/created')
        .set('Authorization', `Bearer ${expertToken()}`)
        .expect(200);
      expect(body.status).toBe(true);
      expect(mockPrisma.event.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ createdById: EXPERT_UUID }),
        }),
      );
    });

    it('200 — admin fetches their created events', async () => {
      const { body } = await request(app.getHttpServer())
        .get('/events/my/created')
        .set('Authorization', `Bearer ${adminToken()}`)
        .expect(200);
      expect(body.status).toBe(true);
    });

    it('200 — status filter applied to created events', async () => {
      await request(app.getHttpServer())
        .get('/events/my/created?status=CANCELLED')
        .set('Authorization', `Bearer ${ngoToken()}`)
        .expect(200);
      expect(mockPrisma.event.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            createdById: NGO_UUID,
            isCancelled: true,
          }),
        }),
      );
    });

    it('200 — pagination works for created events', async () => {
      mockPrisma.event.count.mockResolvedValue(30);
      const { body } = await request(app.getHttpServer())
        .get('/events/my/created?page=2&limit=10')
        .set('Authorization', `Bearer ${ngoToken()}`)
        .expect(200);
      expect(body.data).toMatchObject({
        total: 30,
        page: 2,
        limit: 10,
        pages: 3,
      });
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // POST /events — create
  // ═══════════════════════════════════════════════════════════════════════════

  describe('POST /events', () => {
    const validBody = {
      title: 'NGO Leadership Webinar',
      description: 'Insightful session.',
      startTime: FUTURE_START,
      endTime: FUTURE_END,
    };

    beforeEach(() => {
      mockPrisma.event.create.mockResolvedValue(makeEvent());
    });

    it('401 — no token', () =>
      request(app.getHttpServer()).post('/events').send(validBody).expect(401));
    it('403 — GUEST rejected', () =>
      request(app.getHttpServer())
        .post('/events')
        .set('Authorization', `Bearer ${userToken()}`)
        .send(validBody)
        .expect(403));
    it('400 — missing required fields', () =>
      request(app.getHttpServer())
        .post('/events')
        .set('Authorization', `Bearer ${adminToken()}`)
        .send({ title: 'Only title' })
        .expect(400));

    it('400 in body — endTime before startTime', async () => {
      const { body } = await request(app.getHttpServer())
        .post('/events')
        .set('Authorization', `Bearer ${adminToken()}`)
        .send({ ...validBody, startTime: FUTURE_END, endTime: FUTURE_START })
        .expect(201);
      expect(body.statusCode).toBe(400);
      expect(body.message).toMatch(/end time must be after start time/i);
    });

    it('400 in body — startTime in the past', async () => {
      const { body } = await request(app.getHttpServer())
        .post('/events')
        .set('Authorization', `Bearer ${adminToken()}`)
        .send({ ...validBody, startTime: PAST_DATE })
        .expect(201);
      expect(body.statusCode).toBe(400);
      expect(body.message).toMatch(/start time must be in the future/i);
    });

    it('201 — SUPER_ADMIN creates event with createdById', async () => {
      const { body } = await request(app.getHttpServer())
        .post('/events')
        .set('Authorization', `Bearer ${adminToken()}`)
        .send(validBody)
        .expect(201);
      expect(body.status).toBe(true);
      expect(mockPrisma.event.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            createdById: ADMIN_UUID,
            jitsiRoomId: 'plrcap-abc123-def456',
          }),
        }),
      );
    });

    it('201 — NGO_MEMBER can create event', async () => {
      mockPrisma.event.create.mockResolvedValue(
        makeEvent({ createdById: NGO_UUID }),
      );
      const { body } = await request(app.getHttpServer())
        .post('/events')
        .set('Authorization', `Bearer ${ngoToken()}`)
        .send(validBody)
        .expect(201);
      expect(body.status).toBe(true);
      expect(mockPrisma.event.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ createdById: NGO_UUID }),
        }),
      );
    });

    it('201 — EXPERT can create event', async () => {
      mockPrisma.event.create.mockResolvedValue(
        makeEvent({ createdById: EXPERT_UUID }),
      );
      const { body } = await request(app.getHttpServer())
        .post('/events')
        .set('Authorization', `Bearer ${expertToken()}`)
        .send(validBody)
        .expect(201);
      expect(body.status).toBe(true);
      expect(mockPrisma.event.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ createdById: EXPERT_UUID }),
        }),
      );
    });

    it('201 — Jitsi meeting URL stored as externalMeetingUrl', async () => {
      await request(app.getHttpServer())
        .post('/events')
        .set('Authorization', `Bearer ${adminToken()}`)
        .send(validBody)
        .expect(201);
      expect(mockPrisma.event.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            externalMeetingUrl: 'https://meet.jit.si/plrcap-abc123-def456',
          }),
        }),
      );
    });

    it('201 — no externalMeetingUrl in DTO (Jitsi URL auto-assigned)', async () => {
      await request(app.getHttpServer())
        .post('/events')
        .set('Authorization', `Bearer ${adminToken()}`)
        .send(validBody)
        .expect(201);
      // DTO should NOT have externalMeetingUrl — it's set by the service from Jitsi
      expect(mockJitsi.generateRoomId).toHaveBeenCalled();
      expect(mockJitsi.getMeetingUrl).toHaveBeenCalledWith(
        'plrcap-abc123-def456',
      );
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // PATCH /events/:id — update
  // ═══════════════════════════════════════════════════════════════════════════

  describe('PATCH /events/:id', () => {
    beforeEach(() => {
      mockPrisma.event.findUnique.mockResolvedValue(
        makeEvent({ createdById: ADMIN_UUID }),
      );
      mockPrisma.event.update.mockResolvedValue(
        makeEvent({ title: 'Updated Title' }),
      );
      mockPrisma.eventRegistration.findMany.mockResolvedValue([]);
    });

    it('401 — no token', () =>
      request(app.getHttpServer())
        .patch(`/events/${EVENT_UUID}`)
        .send({ title: 'New' })
        .expect(401));
    it('403 — GUEST rejected', () =>
      request(app.getHttpServer())
        .patch(`/events/${EVENT_UUID}`)
        .set('Authorization', `Bearer ${userToken()}`)
        .send({ title: 'New' })
        .expect(403));

    it('404 in body — not found', async () => {
      mockPrisma.event.findUnique.mockResolvedValue(null);
      const { body } = await request(app.getHttpServer())
        .patch(`/events/${EVENT_UUID}`)
        .set('Authorization', `Bearer ${adminToken()}`)
        .send({ title: 'New' })
        .expect(200);
      expect(body.statusCode).toBe(404);
    });

    it('403 in body — non-owner NGO cannot update another user event', async () => {
      mockPrisma.event.findUnique.mockResolvedValue(
        makeEvent({ createdById: EXPERT_UUID }),
      );
      const { body } = await request(app.getHttpServer())
        .patch(`/events/${EVENT_UUID}`)
        .set('Authorization', `Bearer ${ngoToken()}`)
        .send({ title: 'Hijack' })
        .expect(200);
      expect(body.statusCode).toBe(403);
    });

    it('200 — admin updates any event', async () => {
      const { body } = await request(app.getHttpServer())
        .patch(`/events/${EVENT_UUID}`)
        .set('Authorization', `Bearer ${adminToken()}`)
        .send({ title: 'Updated Title' })
        .expect(200);
      expect(body.status).toBe(true);
    });

    it('200 — NGO owner can update their own event', async () => {
      mockPrisma.event.findUnique.mockResolvedValue(
        makeEvent({ createdById: NGO_UUID }),
      );
      const { body } = await request(app.getHttpServer())
        .patch(`/events/${EVENT_UUID}`)
        .set('Authorization', `Bearer ${ngoToken()}`)
        .send({ title: 'My Updated Event' })
        .expect(200);
      expect(body.status).toBe(true);
    });

    it('200 — Expert owner can update their own event', async () => {
      mockPrisma.event.findUnique.mockResolvedValue(
        makeEvent({ createdById: EXPERT_UUID }),
      );
      const { body } = await request(app.getHttpServer())
        .patch(`/events/${EVENT_UUID}`)
        .set('Authorization', `Bearer ${expertToken()}`)
        .send({ title: 'My Updated Event' })
        .expect(200);
      expect(body.status).toBe(true);
    });

    it('400 in body — cannot update cancelled event', async () => {
      mockPrisma.event.findUnique.mockResolvedValue(
        makeEvent({ isCancelled: true }),
      );
      const { body } = await request(app.getHttpServer())
        .patch(`/events/${EVENT_UUID}`)
        .set('Authorization', `Bearer ${adminToken()}`)
        .send({ title: 'New' })
        .expect(200);
      expect(body.statusCode).toBe(400);
    });

    it('200 — notifies attendees when time changes', async () => {
      mockPrisma.eventRegistration.findMany.mockResolvedValue([
        makeRegistration({
          user: { fullName: 'Attendee', email: 'a@test.com' },
        }),
      ]);
      await request(app.getHttpServer())
        .patch(`/events/${EVENT_UUID}`)
        .set('Authorization', `Bearer ${adminToken()}`)
        .send({ startTime: FUTURE_START, endTime: FUTURE_END })
        .expect(200);
      await new Promise((r) => setTimeout(r, 50));
      expect(mockEmail.sendEventUpdateNotification).toHaveBeenCalled();
    });

    it('200 — does NOT notify when only title changes', async () => {
      await request(app.getHttpServer())
        .patch(`/events/${EVENT_UUID}`)
        .set('Authorization', `Bearer ${adminToken()}`)
        .send({ title: 'New Title Only' })
        .expect(200);
      await new Promise((r) => setTimeout(r, 50));
      expect(mockEmail.sendEventUpdateNotification).not.toHaveBeenCalled();
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // PATCH /events/:id/cancel
  // ═══════════════════════════════════════════════════════════════════════════

  describe('PATCH /events/:id/cancel', () => {
    beforeEach(() => {
      mockPrisma.event.findUnique.mockResolvedValue(
        makeEvent({ createdById: ADMIN_UUID }),
      );
      mockPrisma.event.update.mockResolvedValue({});
      mockPrisma.eventRegistration.findMany.mockResolvedValue([]);
    });

    it('401 — no token', () =>
      request(app.getHttpServer())
        .patch(`/events/${EVENT_UUID}/cancel`)
        .send({})
        .expect(401));
    it('403 — GUEST rejected', () =>
      request(app.getHttpServer())
        .patch(`/events/${EVENT_UUID}/cancel`)
        .set('Authorization', `Bearer ${userToken()}`)
        .send({})
        .expect(403));

    it('403 in body — non-owner cannot cancel', async () => {
      mockPrisma.event.findUnique.mockResolvedValue(
        makeEvent({ createdById: EXPERT_UUID }),
      );
      const { body } = await request(app.getHttpServer())
        .patch(`/events/${EVENT_UUID}/cancel`)
        .set('Authorization', `Bearer ${ngoToken()}`)
        .send({})
        .expect(200);
      expect(body.statusCode).toBe(403);
    });

    it('200 — owner cancels their event', async () => {
      mockPrisma.event.findUnique.mockResolvedValue(
        makeEvent({ createdById: NGO_UUID }),
      );
      const { body } = await request(app.getHttpServer())
        .patch(`/events/${EVENT_UUID}/cancel`)
        .set('Authorization', `Bearer ${ngoToken()}`)
        .send({ reason: 'Speaker unavailable' })
        .expect(200);
      expect(body.status).toBe(true);
      expect(mockPrisma.event.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            isCancelled: true,
            cancellationReason: 'Speaker unavailable',
          }),
        }),
      );
    });

    it('400 in body — already cancelled', async () => {
      mockPrisma.event.findUnique.mockResolvedValue(
        makeEvent({ isCancelled: true }),
      );
      const { body } = await request(app.getHttpServer())
        .patch(`/events/${EVENT_UUID}/cancel`)
        .set('Authorization', `Bearer ${adminToken()}`)
        .send({})
        .expect(200);
      expect(body.message).toMatch(/already cancelled/i);
    });

    it('400 in body — cannot cancel past event', async () => {
      mockPrisma.event.findUnique.mockResolvedValue(
        makeEvent({ isPast: true }),
      );
      const { body } = await request(app.getHttpServer())
        .patch(`/events/${EVENT_UUID}/cancel`)
        .set('Authorization', `Bearer ${adminToken()}`)
        .send({})
        .expect(200);
      expect(body.message).toMatch(/cannot cancel a past event/i);
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // DELETE /events/:id
  // ═══════════════════════════════════════════════════════════════════════════

  describe('DELETE /events/:id', () => {
    beforeEach(() => {
      mockPrisma.event.findUnique.mockResolvedValue(
        makeEvent({ createdById: ADMIN_UUID }),
      );
      mockPrisma.eventRegistration.deleteMany.mockResolvedValue({});
      mockPrisma.event.delete.mockResolvedValue({});
    });

    it('401 — no token', () =>
      request(app.getHttpServer()).delete(`/events/${EVENT_UUID}`).expect(401));
    it('403 — GUEST rejected', () =>
      request(app.getHttpServer())
        .delete(`/events/${EVENT_UUID}`)
        .set('Authorization', `Bearer ${userToken()}`)
        .expect(403));

    it('403 in body — non-owner cannot delete', async () => {
      mockPrisma.event.findUnique.mockResolvedValue(
        makeEvent({ createdById: EXPERT_UUID }),
      );
      const { body } = await request(app.getHttpServer())
        .delete(`/events/${EVENT_UUID}`)
        .set('Authorization', `Bearer ${ngoToken()}`)
        .expect(200);
      expect(body.statusCode).toBe(403);
    });

    it('200 — owner (NGO) deletes their own event', async () => {
      mockPrisma.event.findUnique.mockResolvedValue(
        makeEvent({ createdById: NGO_UUID, coverImageUrl: null }),
      );
      const { body } = await request(app.getHttpServer())
        .delete(`/events/${EVENT_UUID}`)
        .set('Authorization', `Bearer ${ngoToken()}`)
        .expect(200);
      expect(body.status).toBe(true);
    });

    it('200 — admin deletes any event', async () => {
      mockPrisma.event.findUnique.mockResolvedValue(
        makeEvent({ coverImageUrl: null }),
      );
      const { body } = await request(app.getHttpServer())
        .delete(`/events/${EVENT_UUID}`)
        .set('Authorization', `Bearer ${adminToken()}`)
        .expect(200);
      expect(body.status).toBe(true);
      expect(mockPrisma.eventRegistration.deleteMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { eventId: EVENT_UUID } }),
      );
    });

    it('200 — deletes Azure blob when coverImageUrl present', async () => {
      mockPrisma.event.findUnique.mockResolvedValue(
        makeEvent({ coverImageUrl: 'https://blob.example.com/cover.jpg' }),
      );
      await request(app.getHttpServer())
        .delete(`/events/${EVENT_UUID}`)
        .set('Authorization', `Bearer ${adminToken()}`)
        .expect(200);
      expect(mockAzure.delete).toHaveBeenCalledWith(
        'https://blob.example.com/cover.jpg',
        'avatars',
      );
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // POST /events/:id/register
  // ═══════════════════════════════════════════════════════════════════════════

  describe('POST /events/:id/register', () => {
    beforeEach(() => {
      mockPrisma.event.findUnique.mockResolvedValue(makeEvent());
      mockPrisma.eventRegistration.findUnique.mockResolvedValue(null);
      mockPrisma.eventRegistration.create.mockResolvedValue(makeRegistration());
    });

    it('401 — no token', () =>
      request(app.getHttpServer())
        .post(`/events/${EVENT_UUID}/register`)
        .expect(401));

    it('409 in body — already registered', async () => {
      mockPrisma.eventRegistration.findUnique.mockResolvedValue(
        makeRegistration(),
      );
      const { body } = await request(app.getHttpServer())
        .post(`/events/${EVENT_UUID}/register`)
        .set('Authorization', `Bearer ${userToken()}`)
        .expect(201);
      expect(body.statusCode).toBe(409);
      expect(body.message).toMatch(/already registered/i);
    });

    it('409 in body — fully booked', async () => {
      mockPrisma.event.findUnique.mockResolvedValue(
        makeEvent({ capacity: 5, _count: { registrations: 5 } }),
      );
      const { body } = await request(app.getHttpServer())
        .post(`/events/${EVENT_UUID}/register`)
        .set('Authorization', `Bearer ${userToken()}`)
        .expect(201);
      expect(body.statusCode).toBe(409);
      expect(body.message).toMatch(/fully booked/i);
    });

    it('201 — registers user and sends confirmation email', async () => {
      const { body } = await request(app.getHttpServer())
        .post(`/events/${EVENT_UUID}/register`)
        .set('Authorization', `Bearer ${userToken()}`)
        .expect(201);
      expect(body.status).toBe(true);
      expect(body.data.registrationId).toBe(REG_UUID);
      await new Promise((r) => setTimeout(r, 50));
      expect(mockEmail.sendEventRegistrationConfirmation).toHaveBeenCalledWith(
        expect.objectContaining({
          icsContent: expect.stringContaining('BEGIN:VCALENDAR'),
        }),
      );
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // GET /events/my/registrations
  // ═══════════════════════════════════════════════════════════════════════════

  describe('GET /events/my/registrations', () => {
    beforeEach(() => {
      mockPrisma.eventRegistration.findMany.mockResolvedValue([
        makeRegistration(),
      ]);
      mockPrisma.eventRegistration.count.mockResolvedValue(1);
    });

    it('401 — no token', () =>
      request(app.getHttpServer()).get('/events/my/registrations').expect(401));

    it('200 — returns user registrations', async () => {
      const { body } = await request(app.getHttpServer())
        .get('/events/my/registrations')
        .set('Authorization', `Bearer ${userToken()}`)
        .expect(200);
      expect(body.data.registrations).toHaveLength(1);
      expect(body.data.registrations[0].registrationId).toBe(REG_UUID);
    });

    it('200 — each registration includes embedded event with status and meetingUrl', async () => {
      const { body } = await request(app.getHttpServer())
        .get('/events/my/registrations')
        .set('Authorization', `Bearer ${userToken()}`)
        .expect(200);
      const reg = body.data.registrations[0];
      expect(reg.event.status).toBeDefined();
      expect(reg.event.meetingUrl).toBeDefined();
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // POST /events/:id/join — Jitsi token
  // ═══════════════════════════════════════════════════════════════════════════

  describe('POST /events/:id/join', () => {
    beforeEach(() => {
      mockPrisma.event.findUnique.mockResolvedValue(
        makeEvent({ createdById: ADMIN_UUID }),
      );
    });

    it('401 — no token', () =>
      request(app.getHttpServer())
        .post(`/events/${EVENT_UUID}/join`)
        .expect(401));

    it('403 in body — non-registered user cannot join', async () => {
      mockPrisma.event.findUnique.mockResolvedValue(
        makeEvent({ createdById: ADMIN_UUID }),
      );
      mockPrisma.eventRegistration.findUnique.mockResolvedValue(null);
      const { body } = await request(app.getHttpServer())
        .post(`/events/${EVENT_UUID}/join`)
        .set('Authorization', `Bearer ${userToken()}`)
        .expect(201);
      expect(body.statusCode).toBe(403);
      expect(body.message).toMatch(/must register/i);
    });

    it('200 — registered user gets participant token (isModerator=false)', async () => {
      mockPrisma.event.findUnique.mockResolvedValue(
        makeEvent({ createdById: ADMIN_UUID }),
      );
      mockPrisma.eventRegistration.findUnique.mockResolvedValue(
        makeRegistration(),
      );
      const { body } = await request(app.getHttpServer())
        .post(`/events/${EVENT_UUID}/join`)
        .set('Authorization', `Bearer ${userToken()}`)
        .expect(201);
      expect(body.status).toBe(true);
      expect(body.data.token).toBe('mock-jitsi-jwt-token');
      expect(body.data.isModerator).toBe(false);
      expect(mockJitsi.generateToken).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({ isModerator: false }),
        expect.any(Date),
      );
    });

    it('200 — SUPER_ADMIN is exempt from registration and gets moderator token', async () => {
      const { body } = await request(app.getHttpServer())
        .post(`/events/${EVENT_UUID}/join`)
        .set('Authorization', `Bearer ${adminToken()}`)
        .expect(201);
      expect(body.status).toBe(true);
      expect(body.data.isModerator).toBe(true);
      expect(mockPrisma.eventRegistration.findUnique).not.toHaveBeenCalled();
    });

    it('200 — event creator (NGO) gets moderator token without being admin', async () => {
      mockPrisma.event.findUnique.mockResolvedValue(
        makeEvent({ createdById: NGO_UUID }),
      );
      const { body } = await request(app.getHttpServer())
        .post(`/events/${EVENT_UUID}/join`)
        .set('Authorization', `Bearer ${ngoToken()}`)
        .expect(201);
      expect(body.status).toBe(true);
      expect(body.data.isModerator).toBe(true);
      // Creator should not need registration check
      expect(mockPrisma.eventRegistration.findUnique).not.toHaveBeenCalled();
    });

    it('200 — response includes tokenizedUrl with jwt param', async () => {
      mockPrisma.event.findUnique.mockResolvedValue(
        makeEvent({ createdById: ADMIN_UUID }),
      );
      const { body } = await request(app.getHttpServer())
        .post(`/events/${EVENT_UUID}/join`)
        .set('Authorization', `Bearer ${adminToken()}`)
        .expect(201);
      expect(body.data.tokenizedUrl).toMatch(/\?jwt=mock-jitsi-jwt-token$/);
      expect(body.data.meetingUrl).toBeDefined();
      expect(body.data.tokenizedUrl).toContain(body.data.meetingUrl);
    });

    it('400 in body — cancelled event cannot be joined', async () => {
      mockPrisma.event.findUnique.mockResolvedValue(
        makeEvent({ isCancelled: true }),
      );
      const { body } = await request(app.getHttpServer())
        .post(`/events/${EVENT_UUID}/join`)
        .set('Authorization', `Bearer ${adminToken()}`)
        .expect(201);
      expect(body.statusCode).toBe(400);
      expect(body.message).toMatch(/cancelled/i);
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // GET /events/:id/calendar — ICS
  // ═══════════════════════════════════════════════════════════════════════════

  describe('GET /events/:id/calendar', () => {
    beforeEach(() => {
      mockPrisma.event.findUnique.mockResolvedValue(makeEvent());
      mockPrisma.eventRegistration.findUnique.mockResolvedValue(
        makeRegistration(),
      );
    });

    it('401 — no token', () =>
      request(app.getHttpServer())
        .get(`/events/${EVENT_UUID}/calendar`)
        .expect(401));

    it('403 — not registered returns JSON 403', async () => {
      mockPrisma.eventRegistration.findUnique.mockResolvedValue(null);
      const res = await request(app.getHttpServer())
        .get(`/events/${EVENT_UUID}/calendar`)
        .set('Authorization', `Bearer ${userToken()}`);
      expect(res.body.statusCode).toBe(403);
    });

    it('200 — returns ICS with correct headers', async () => {
      const res = await request(app.getHttpServer())
        .get(`/events/${EVENT_UUID}/calendar`)
        .set('Authorization', `Bearer ${userToken()}`)
        .expect(200);
      expect(res.headers['content-type']).toMatch(/text\/calendar/);
      expect(res.headers['content-disposition']).toMatch(/\.ics/);
    });

    it('200 — ICS contains required fields', async () => {
      const res = await request(app.getHttpServer())
        .get(`/events/${EVENT_UUID}/calendar`)
        .set('Authorization', `Bearer ${userToken()}`)
        .expect(200);
      const ics = res.text;
      expect(ics).toContain('BEGIN:VCALENDAR');
      expect(ics).toContain(`UID:${EVENT_UUID}@plrcap.org`);
      expect(ics).toContain('SUMMARY:NGO Leadership Webinar');
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // GET /events/:id/attendees
  // ═══════════════════════════════════════════════════════════════════════════

  describe('GET /events/:id/attendees', () => {
    beforeEach(() => {
      mockPrisma.event.findUnique.mockResolvedValue(makeEvent());
      mockPrisma.eventRegistration.findMany.mockResolvedValue([
        makeRegistration(),
      ]);
      mockPrisma.eventRegistration.count.mockResolvedValue(1);
    });

    it('401 — no token', () =>
      request(app.getHttpServer())
        .get(`/events/${EVENT_UUID}/attendees`)
        .expect(401));
    it('403 — GUEST rejected', () =>
      request(app.getHttpServer())
        .get(`/events/${EVENT_UUID}/attendees`)
        .set('Authorization', `Bearer ${userToken()}`)
        .expect(403));

    it('200 — admin fetches attendee list', async () => {
      const { body } = await request(app.getHttpServer())
        .get(`/events/${EVENT_UUID}/attendees`)
        .set('Authorization', `Bearer ${adminToken()}`)
        .expect(200);
      expect(body.data.attendees).toHaveLength(1);
      expect(body.data.eventId).toBe(EVENT_UUID);
    });

    it('200 — correct pagination metadata', async () => {
      mockPrisma.eventRegistration.count.mockResolvedValue(75);
      const { body } = await request(app.getHttpServer())
        .get(`/events/${EVENT_UUID}/attendees?page=3&limit=25`)
        .set('Authorization', `Bearer ${adminToken()}`)
        .expect(200);
      expect(body.data).toMatchObject({
        total: 75,
        page: 3,
        limit: 25,
        pages: 3,
      });
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // DELETE /events/:id/attendees/:userId
  // ═══════════════════════════════════════════════════════════════════════════

  describe('DELETE /events/:id/attendees/:userId', () => {
    beforeEach(() => {
      mockPrisma.eventRegistration.findUnique.mockResolvedValue(
        makeRegistration(),
      );
      mockPrisma.eventRegistration.delete.mockResolvedValue({});
    });

    it('401 — no token', () =>
      request(app.getHttpServer())
        .delete(`/events/${EVENT_UUID}/attendees/${USER_UUID}`)
        .expect(401));
    it('403 — GUEST rejected', () =>
      request(app.getHttpServer())
        .delete(`/events/${EVENT_UUID}/attendees/${USER_UUID}`)
        .set('Authorization', `Bearer ${userToken()}`)
        .expect(403));

    it('200 — admin removes attendee with audit log', async () => {
      const { body } = await request(app.getHttpServer())
        .delete(`/events/${EVENT_UUID}/attendees/${USER_UUID}`)
        .set('Authorization', `Bearer ${adminToken()}`)
        .expect(200);
      expect(body.status).toBe(true);
      expect(body.message).toMatch(/attendee removed/i);
      expect(mockPrisma.auditLog.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ action: 'EVENT_ATTENDEE_REMOVED' }),
        }),
      );
    });

    it('404 in body — registration not found', async () => {
      mockPrisma.eventRegistration.findUnique.mockResolvedValue(null);
      const { body } = await request(app.getHttpServer())
        .delete(`/events/${EVENT_UUID}/attendees/${USER_UUID}`)
        .set('Authorization', `Bearer ${adminToken()}`)
        .expect(200);
      expect(body.statusCode).toBe(404);
    });
  });
});
