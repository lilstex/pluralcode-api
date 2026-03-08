import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { JwtService, JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { ConfigModule, ConfigService } from '@nestjs/config';
import request from 'supertest';
import { Role } from '@prisma/client';
import { EventController } from './controller/events.controller';
import { EventService } from './service/events.service';
import { JwtStrategy } from 'src/common/strategies/jwt.strategy';
import { PrismaService } from 'src/prisma.service';
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
const REG_UUID = 'd3eebc99-9c0b-4ef8-bb6d-6bb9bd380a44';

// Dates used throughout — start must be in the future for createEvent validation
const FUTURE_START = new Date(Date.now() + 3_600_000).toISOString(); // +1h
const FUTURE_END = new Date(Date.now() + 7_200_000).toISOString(); // +2h
const PAST_DATE = new Date(Date.now() - 86_400_000).toISOString(); // -1d

// ─────────────────────────────────────────────────────────────────────────────
// FIXTURES
// ─────────────────────────────────────────────────────────────────────────────

function makeEvent(overrides: Record<string, any> = {}): any {
  return {
    id: EVENT_UUID,
    title: 'NGO Leadership Webinar',
    description: 'An insightful session on NGO governance.',
    startTime: new Date(FUTURE_START),
    endTime: new Date(FUTURE_END),
    jitsiRoomId: 'plrcap-abc123-def456',
    capacity: 100,
    tags: ['governance', 'leadership'],
    externalMeetingUrl: null,
    coverImageUrl: null,
    archiveUrl: null,
    isCancelled: false,
    isPast: false,
    cancellationReason: null,
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

// ─────────────────────────────────────────────────────────────────────────────
// MOCK PRISMA
// ─────────────────────────────────────────────────────────────────────────────

const mockPrisma = {
  user: {
    findUnique: jest.fn(),
    findMany: jest.fn(),
  },
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

// ─────────────────────────────────────────────────────────────────────────────
// MOCK SERVICES
// ─────────────────────────────────────────────────────────────────────────────

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
// JWT HELPERS
// ─────────────────────────────────────────────────────────────────────────────

let jwtService: JwtService;

const token = (sub: string, role: string) => () =>
  jwtService.sign({ sub, email: `${role}@example.com`, role });

let adminToken: () => string;
let eventAdminToken: () => string;
let userToken: () => string;

// ─────────────────────────────────────────────────────────────────────────────
// BOOTSTRAP
// ─────────────────────────────────────────────────────────────────────────────

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
    adminToken = token(ADMIN_UUID, Role.SUPER_ADMIN);
    eventAdminToken = token(ADMIN_UUID, Role.EVENT_ADMIN);
    userToken = token(USER_UUID, Role.GUEST);
  });

  afterAll(() => app.close());

  beforeEach(() => {
    jest.clearAllMocks();
    // JwtStrategy.validate() calls prisma.user.findUnique — route by UUID
    mockPrisma.user.findUnique.mockImplementation(({ where }: any) => {
      if (where?.id === ADMIN_UUID) return Promise.resolve(makeAdminUser());
      if (where?.id === USER_UUID) return Promise.resolve(makeDbUser());
      return Promise.resolve(null);
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // GET /events  — public listing
  // ═══════════════════════════════════════════════════════════════════════════

  describe('GET /events', () => {
    beforeEach(() => {
      mockPrisma.$transaction.mockImplementation((q: any[]) => Promise.all(q));
      mockPrisma.event.findMany.mockResolvedValue([makeEvent()]);
      mockPrisma.event.count.mockResolvedValue(1);
    });

    it('200 — public endpoint, no token needed', async () => {
      const { body } = await request(app.getHttpServer())
        .get('/events')
        .expect(200);

      expect(body.status).toBe(true);
      expect(body.data.events).toHaveLength(1);
    });

    it('200 — no params defaults safely (NaN regression — listEvents)', async () => {
      await request(app.getHttpServer()).get('/events').expect(200);

      expect(mockPrisma.event.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ skip: 0, take: 20 }),
      );
      const call = mockPrisma.event.findMany.mock.calls[0][0];
      expect(Number.isFinite(call.take)).toBe(true);
      expect(Number.isFinite(call.skip)).toBe(true);
    });

    it('200 — non-numeric page/limit falls back to defaults', async () => {
      await request(app.getHttpServer())
        .get('/events?page=abc&limit=xyz')
        .expect(200);

      const call = mockPrisma.event.findMany.mock.calls[0][0];
      expect(call.skip).toBe(0);
      expect(call.take).toBe(20);
    });

    it('200 — page=3&limit=10 produces correct skip=20, take=10', async () => {
      await request(app.getHttpServer())
        .get('/events?page=3&limit=10')
        .expect(200);

      expect(mockPrisma.event.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ skip: 20, take: 10 }),
      );
    });

    it('200 — limit capped at 100', async () => {
      await request(app.getHttpServer()).get('/events?limit=9999').expect(200);

      const call = mockPrisma.event.findMany.mock.calls[0][0];
      expect(call.take).toBe(100);
    });

    it('200 — applies search filter across title and description', async () => {
      await request(app.getHttpServer())
        .get('/events?search=Leadership')
        .expect(200);

      const call = mockPrisma.event.findMany.mock.calls[0][0];
      expect(call.where.OR).toHaveLength(2);
    });

    it('200 — applies tag filter', async () => {
      await request(app.getHttpServer())
        .get('/events?tag=governance')
        .expect(200);

      expect(mockPrisma.event.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ tags: { has: 'governance' } }),
        }),
      );
    });

    it('200 — applies UPCOMING status filter (isCancelled=false, isPast=false)', async () => {
      await request(app.getHttpServer())
        .get('/events?status=UPCOMING')
        .expect(200);

      const call = mockPrisma.event.findMany.mock.calls[0][0];
      expect(call.where.isPast).toBe(false);
      expect(call.where.isCancelled).toBe(false);
    });

    it('200 — applies CANCELLED status filter', async () => {
      await request(app.getHttpServer())
        .get('/events?status=CANCELLED')
        .expect(200);

      const call = mockPrisma.event.findMany.mock.calls[0][0];
      expect(call.where.isCancelled).toBe(true);
    });

    it('200 — applies PAST status filter', async () => {
      await request(app.getHttpServer()).get('/events?status=PAST').expect(200);

      const call = mockPrisma.event.findMany.mock.calls[0][0];
      expect(call.where.isPast).toBe(true);
    });

    it('400 — invalid status enum value rejected by ValidationPipe', async () => {
      await request(app.getHttpServer())
        .get('/events?status=INVALID_STATUS')
        .expect(400);
    });

    it('200 — applies dateFrom and dateTo filters', async () => {
      const dateFrom = '2025-01-01';
      const dateTo = '2025-12-31';

      await request(app.getHttpServer())
        .get(`/events?dateFrom=${dateFrom}&dateTo=${dateTo}`)
        .expect(200);

      const call = mockPrisma.event.findMany.mock.calls[0][0];
      expect(call.where.startTime.gte).toBeInstanceOf(Date);
      expect(call.where.startTime.lte).toBeInstanceOf(Date);
    });

    it('200 — returns correct pagination shape', async () => {
      mockPrisma.event.count.mockResolvedValue(50);

      const { body } = await request(app.getHttpServer())
        .get('/events?page=2&limit=10')
        .expect(200);

      expect(body.data.total).toBe(50);
      expect(body.data.page).toBe(2);
      expect(body.data.limit).toBe(10);
      expect(body.data.pages).toBe(5);
    });

    it('200 — event response includes computed status field', async () => {
      const { body } = await request(app.getHttpServer())
        .get('/events')
        .expect(200);

      expect(body.data.events[0].status).toBeDefined();
      expect(['UPCOMING', 'LIVE', 'PAST', 'CANCELLED']).toContain(
        body.data.events[0].status,
      );
    });

    it('200 — event response includes meetingUrl from jitsi mock', async () => {
      const { body } = await request(app.getHttpServer())
        .get('/events')
        .expect(200);

      expect(body.data.events[0].meetingUrl).toBe(
        'https://meet.jit.si/plrcap-abc123-def456',
      );
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // GET /events/:id  — public single event
  // ═══════════════════════════════════════════════════════════════════════════

  describe('GET /events/:id', () => {
    it('400 — non-UUID id rejected', async () => {
      await request(app.getHttpServer()).get('/events/not-a-uuid').expect(400);
    });

    it('404 — event not found', async () => {
      mockPrisma.event.findUnique.mockResolvedValue(null);

      const { body } = await request(app.getHttpServer())
        .get(`/events/${EVENT_UUID}`)
        .expect(200);

      expect(body.status).toBe(false);
      expect(body.statusCode).toBe(404);
    });

    it('200 — returns full event with registrationCount', async () => {
      mockPrisma.event.findUnique.mockResolvedValue(makeEvent());

      const { body } = await request(app.getHttpServer())
        .get(`/events/${EVENT_UUID}`)
        .expect(200);

      expect(body.status).toBe(true);
      expect(body.data.id).toBe(EVENT_UUID);
      expect(body.data.registrationCount).toBe(5);
    });

    it('200 — cancelled event resolves status as CANCELLED', async () => {
      mockPrisma.event.findUnique.mockResolvedValue(
        makeEvent({ isCancelled: true }),
      );

      const { body } = await request(app.getHttpServer())
        .get(`/events/${EVENT_UUID}`)
        .expect(200);

      expect(body.data.status).toBe('CANCELLED');
    });

    it('200 — past event resolves status as PAST', async () => {
      mockPrisma.event.findUnique.mockResolvedValue(
        makeEvent({ isPast: true }),
      );

      const { body } = await request(app.getHttpServer())
        .get(`/events/${EVENT_UUID}`)
        .expect(200);

      expect(body.data.status).toBe('PAST');
    });

    it('200 — uses externalMeetingUrl when set instead of Jitsi URL', async () => {
      mockPrisma.event.findUnique.mockResolvedValue(
        makeEvent({ externalMeetingUrl: 'https://zoom.us/j/12345' }),
      );

      const { body } = await request(app.getHttpServer())
        .get(`/events/${EVENT_UUID}`)
        .expect(200);

      expect(body.data.meetingUrl).toBe('https://zoom.us/j/12345');
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // POST /events  — admin create
  // ═══════════════════════════════════════════════════════════════════════════

  describe('POST /events', () => {
    const validBody = {
      title: 'NGO Leadership Webinar',
      description: 'Insightful session on governance.',
      startTime: FUTURE_START,
      endTime: FUTURE_END,
    };

    beforeEach(() => {
      mockPrisma.event.create.mockResolvedValue(makeEvent());
      mockPrisma.auditLog.create.mockResolvedValue({});
    });

    it('401 — no token', async () => {
      await request(app.getHttpServer())
        .post('/events')
        .send(validBody)
        .expect(401);
    });

    it('403 — GUEST role rejected', async () => {
      await request(app.getHttpServer())
        .post('/events')
        .set('Authorization', `Bearer ${userToken()}`)
        .send(validBody)
        .expect(403);
    });

    it('400 — missing required fields', async () => {
      await request(app.getHttpServer())
        .post('/events')
        .set('Authorization', `Bearer ${adminToken()}`)
        .send({ title: 'Only title' }) // missing description, startTime, endTime
        .expect(400);
    });

    it('400 — invalid ISO date string', async () => {
      await request(app.getHttpServer())
        .post('/events')
        .set('Authorization', `Bearer ${adminToken()}`)
        .send({ ...validBody, startTime: 'not-a-date' })
        .expect(400);
    });

    it('400 — endTime before startTime', async () => {
      const { body } = await request(app.getHttpServer())
        .post('/events')
        .set('Authorization', `Bearer ${adminToken()}`)
        .send({ ...validBody, startTime: FUTURE_END, endTime: FUTURE_START })
        .expect(201);

      expect(body.status).toBe(false);
      expect(body.statusCode).toBe(400);
      expect(body.message).toMatch(/end time must be after start time/i);
    });

    it('400 — startTime in the past', async () => {
      const { body } = await request(app.getHttpServer())
        .post('/events')
        .set('Authorization', `Bearer ${adminToken()}`)
        .send({ ...validBody, startTime: PAST_DATE })
        .expect(201);

      expect(body.status).toBe(false);
      expect(body.statusCode).toBe(400);
      expect(body.message).toMatch(/start time must be in the future/i);
    });

    it('201 — SUPER_ADMIN creates event with audit log', async () => {
      const { body } = await request(app.getHttpServer())
        .post('/events')
        .set('Authorization', `Bearer ${adminToken()}`)
        .send(validBody)
        .expect(201);

      expect(body.status).toBe(true);
      expect(body.statusCode).toBe(201);
      expect(body.data.title).toBe('NGO Leadership Webinar');
      expect(mockPrisma.auditLog.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            action: 'EVENT_CREATED',
            entity: 'Event',
          }),
        }),
      );
    });

    it('201 — EVENT_ADMIN can also create events', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(makeEventAdminUser());

      const { body } = await request(app.getHttpServer())
        .post('/events')
        .set('Authorization', `Bearer ${eventAdminToken()}`)
        .send(validBody)
        .expect(201);

      expect(body.status).toBe(true);
    });

    it('201 — jitsi.generateRoomId called to assign room', async () => {
      await request(app.getHttpServer())
        .post('/events')
        .set('Authorization', `Bearer ${adminToken()}`)
        .send(validBody)
        .expect(201);

      expect(mockJitsi.generateRoomId).toHaveBeenCalled();
      expect(mockPrisma.event.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            jitsiRoomId: 'plrcap-abc123-def456',
          }),
        }),
      );
    });

    it('201 — optional capacity, tags, externalMeetingUrl stored when provided', async () => {
      await request(app.getHttpServer())
        .post('/events')
        .set('Authorization', `Bearer ${adminToken()}`)
        .send({
          ...validBody,
          capacity: 50,
          tags: ['health'],
          externalMeetingUrl: 'https://zoom.us/j/999',
        })
        .expect(201);

      expect(mockPrisma.event.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            capacity: 50,
            tags: ['health'],
            externalMeetingUrl: 'https://zoom.us/j/999',
          }),
        }),
      );
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // PATCH /events/:id  — admin update
  // ═══════════════════════════════════════════════════════════════════════════

  describe('PATCH /events/:id', () => {
    beforeEach(() => {
      mockPrisma.event.findUnique.mockResolvedValue(makeEvent());
      mockPrisma.event.update.mockResolvedValue(
        makeEvent({ title: 'Updated Title' }),
      );
      mockPrisma.auditLog.create.mockResolvedValue({});
      mockPrisma.eventRegistration.findMany.mockResolvedValue([]);
    });

    it('401 — no token', async () => {
      await request(app.getHttpServer())
        .patch(`/events/${EVENT_UUID}`)
        .send({ title: 'New' })
        .expect(401);
    });

    it('403 — GUEST rejected', async () => {
      await request(app.getHttpServer())
        .patch(`/events/${EVENT_UUID}`)
        .set('Authorization', `Bearer ${userToken()}`)
        .send({ title: 'New' })
        .expect(403);
    });

    it('400 — non-UUID id', async () => {
      await request(app.getHttpServer())
        .patch('/events/not-a-uuid')
        .set('Authorization', `Bearer ${adminToken()}`)
        .send({ title: 'New' })
        .expect(400);
    });

    it('404 — event not found', async () => {
      mockPrisma.event.findUnique.mockResolvedValue(null);

      const { body } = await request(app.getHttpServer())
        .patch(`/events/${EVENT_UUID}`)
        .set('Authorization', `Bearer ${adminToken()}`)
        .send({ title: 'New' })
        .expect(200);

      expect(body.status).toBe(false);
      expect(body.statusCode).toBe(404);
    });

    it('400 — cannot update a cancelled event', async () => {
      mockPrisma.event.findUnique.mockResolvedValue(
        makeEvent({ isCancelled: true }),
      );

      const { body } = await request(app.getHttpServer())
        .patch(`/events/${EVENT_UUID}`)
        .set('Authorization', `Bearer ${adminToken()}`)
        .send({ title: 'New' })
        .expect(200);

      expect(body.status).toBe(false);
      expect(body.statusCode).toBe(400);
      expect(body.message).toMatch(/cannot update a cancelled event/i);
    });

    it('400 — endTime before startTime in update', async () => {
      const { body } = await request(app.getHttpServer())
        .patch(`/events/${EVENT_UUID}`)
        .set('Authorization', `Bearer ${adminToken()}`)
        .send({ startTime: FUTURE_END, endTime: FUTURE_START })
        .expect(200);

      expect(body.status).toBe(false);
      expect(body.message).toMatch(/end time must be after start time/i);
    });

    it('200 — updates title and creates audit log', async () => {
      const { body } = await request(app.getHttpServer())
        .patch(`/events/${EVENT_UUID}`)
        .set('Authorization', `Bearer ${adminToken()}`)
        .send({ title: 'Updated Title' })
        .expect(200);

      expect(body.status).toBe(true);
      expect(mockPrisma.auditLog.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ action: 'EVENT_UPDATED' }),
        }),
      );
    });

    it('200 — notifies attendees when start/end time changes', async () => {
      mockPrisma.eventRegistration.findMany.mockResolvedValue([
        makeRegistration({
          user: { fullName: 'Attendee', email: 'attendee@example.com' },
        }),
      ]);

      await request(app.getHttpServer())
        .patch(`/events/${EVENT_UUID}`)
        .set('Authorization', `Bearer ${adminToken()}`)
        .send({ startTime: FUTURE_START, endTime: FUTURE_END })
        .expect(200);

      await new Promise((r) => setTimeout(r, 50)); // flush fire-and-forget
      expect(mockEmail.sendEventUpdateNotification).toHaveBeenCalled();
    });

    it('200 — does NOT notify attendees when only title changes', async () => {
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
      mockPrisma.event.findUnique.mockResolvedValue(makeEvent());
      mockPrisma.$transaction.mockImplementation((q: any[]) => Promise.all(q));
      mockPrisma.event.update.mockResolvedValue({});
      mockPrisma.auditLog.create.mockResolvedValue({});
      mockPrisma.eventRegistration.findMany.mockResolvedValue([]);
    });

    it('401 — no token', async () => {
      await request(app.getHttpServer())
        .patch(`/events/${EVENT_UUID}/cancel`)
        .send({})
        .expect(401);
    });

    it('403 — GUEST rejected', async () => {
      await request(app.getHttpServer())
        .patch(`/events/${EVENT_UUID}/cancel`)
        .set('Authorization', `Bearer ${userToken()}`)
        .send({})
        .expect(403);
    });

    it('400 — event already cancelled', async () => {
      mockPrisma.event.findUnique.mockResolvedValue(
        makeEvent({ isCancelled: true }),
      );

      const { body } = await request(app.getHttpServer())
        .patch(`/events/${EVENT_UUID}/cancel`)
        .set('Authorization', `Bearer ${adminToken()}`)
        .send({})
        .expect(200);

      expect(body.status).toBe(false);
      expect(body.message).toMatch(/already cancelled/i);
    });

    it('400 — cannot cancel a past event', async () => {
      mockPrisma.event.findUnique.mockResolvedValue(
        makeEvent({ isPast: true }),
      );

      const { body } = await request(app.getHttpServer())
        .patch(`/events/${EVENT_UUID}/cancel`)
        .set('Authorization', `Bearer ${adminToken()}`)
        .send({})
        .expect(200);

      expect(body.status).toBe(false);
      expect(body.message).toMatch(/cannot cancel a past event/i);
    });

    it('404 — event not found', async () => {
      mockPrisma.event.findUnique.mockResolvedValue(null);

      const { body } = await request(app.getHttpServer())
        .patch(`/events/${EVENT_UUID}/cancel`)
        .set('Authorization', `Bearer ${adminToken()}`)
        .send({})
        .expect(200);

      expect(body.status).toBe(false);
      expect(body.statusCode).toBe(404);
    });

    it('200 — cancels event and creates audit log', async () => {
      const { body } = await request(app.getHttpServer())
        .patch(`/events/${EVENT_UUID}/cancel`)
        .set('Authorization', `Bearer ${adminToken()}`)
        .send({ reason: 'Speaker unavailable' })
        .expect(200);

      expect(body.status).toBe(true);
      expect(body.message).toMatch(/cancelled/i);
      expect(mockPrisma.event.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            isCancelled: true,
            cancellationReason: 'Speaker unavailable',
          }),
        }),
      );
    });

    it('200 — notifies registered attendees of cancellation', async () => {
      mockPrisma.eventRegistration.findMany.mockResolvedValue([
        makeRegistration({
          user: { fullName: 'Attendee', email: 'attendee@example.com' },
        }),
      ]);

      await request(app.getHttpServer())
        .patch(`/events/${EVENT_UUID}/cancel`)
        .set('Authorization', `Bearer ${adminToken()}`)
        .send({ reason: 'Force majeure' })
        .expect(200);

      await new Promise((r) => setTimeout(r, 50));
      expect(mockEmail.sendEventCancellationNotification).toHaveBeenCalledWith(
        expect.objectContaining({ reason: 'Force majeure' }),
      );
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // PATCH /events/:id/archive
  // ═══════════════════════════════════════════════════════════════════════════

  describe('PATCH /events/:id/archive', () => {
    beforeEach(() => {
      mockPrisma.event.findUnique.mockResolvedValue(makeEvent());
      mockPrisma.event.update.mockResolvedValue({});
      mockPrisma.auditLog.create.mockResolvedValue({});
    });

    it('401 — no token', async () => {
      await request(app.getHttpServer())
        .patch(`/events/${EVENT_UUID}/archive`)
        .expect(401);
    });

    it('403 — GUEST rejected', async () => {
      await request(app.getHttpServer())
        .patch(`/events/${EVENT_UUID}/archive`)
        .set('Authorization', `Bearer ${userToken()}`)
        .expect(403);
    });

    it('404 — event not found', async () => {
      mockPrisma.event.findUnique.mockResolvedValue(null);

      const { body } = await request(app.getHttpServer())
        .patch(`/events/${EVENT_UUID}/archive`)
        .set('Authorization', `Bearer ${adminToken()}`)
        .expect(200);

      expect(body.status).toBe(false);
      expect(body.statusCode).toBe(404);
    });

    it('200 — marks event as past with archiveUrl', async () => {
      const { body } = await request(app.getHttpServer())
        .patch(`/events/${EVENT_UUID}/archive`)
        .set('Authorization', `Bearer ${adminToken()}`)
        .send({ archiveUrl: 'https://storage.azure.com/recording.mp4' })
        .expect(200);

      expect(body.status).toBe(true);
      expect(mockPrisma.event.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            isPast: true,
            archiveUrl: 'https://storage.azure.com/recording.mp4',
          }),
        }),
      );
      expect(mockPrisma.auditLog.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ action: 'EVENT_ARCHIVED' }),
        }),
      );
    });

    it('200 — marks event past without archiveUrl (null stored)', async () => {
      const { body } = await request(app.getHttpServer())
        .patch(`/events/${EVENT_UUID}/archive`)
        .set('Authorization', `Bearer ${adminToken()}`)
        .send({})
        .expect(200);

      expect(body.status).toBe(true);
      expect(mockPrisma.event.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ isPast: true, archiveUrl: null }),
        }),
      );
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // DELETE /events/:id  — SUPER_ADMIN only
  // ═══════════════════════════════════════════════════════════════════════════

  describe('DELETE /events/:id', () => {
    beforeEach(() => {
      mockPrisma.$transaction.mockImplementation((q: any[]) => Promise.all(q));
      mockPrisma.eventRegistration.deleteMany.mockResolvedValue({});
      mockPrisma.event.delete.mockResolvedValue({});
      mockPrisma.auditLog.create.mockResolvedValue({});
    });

    it('401 — no token', async () => {
      await request(app.getHttpServer())
        .delete(`/events/${EVENT_UUID}`)
        .expect(401);
    });

    it('403 — EVENT_ADMIN cannot delete (SUPER_ADMIN only)', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(makeEventAdminUser());

      await request(app.getHttpServer())
        .delete(`/events/${EVENT_UUID}`)
        .set('Authorization', `Bearer ${eventAdminToken()}`)
        .expect(403);
    });

    it('400 — non-UUID id', async () => {
      await request(app.getHttpServer())
        .delete('/events/not-a-uuid')
        .set('Authorization', `Bearer ${adminToken()}`)
        .expect(400);
    });

    it('404 — event not found', async () => {
      mockPrisma.event.findUnique.mockResolvedValue(null);

      const { body } = await request(app.getHttpServer())
        .delete(`/events/${EVENT_UUID}`)
        .set('Authorization', `Bearer ${adminToken()}`)
        .expect(200);

      expect(body.status).toBe(false);
      expect(body.statusCode).toBe(404);
    });

    it('200 — deletes event with no cover image (no Azure delete call)', async () => {
      mockPrisma.event.findUnique.mockResolvedValue(
        makeEvent({ coverImageUrl: null }),
      );

      const { body } = await request(app.getHttpServer())
        .delete(`/events/${EVENT_UUID}`)
        .set('Authorization', `Bearer ${adminToken()}`)
        .expect(200);

      expect(body.status).toBe(true);
      expect(mockAzure.delete).not.toHaveBeenCalled();
      expect(mockPrisma.eventRegistration.deleteMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { eventId: EVENT_UUID } }),
      );
    });

    it('200 — deletes cover image from Azure before deleting event', async () => {
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

    it('200 — creates audit log on deletion', async () => {
      mockPrisma.event.findUnique.mockResolvedValue(makeEvent());

      await request(app.getHttpServer())
        .delete(`/events/${EVENT_UUID}`)
        .set('Authorization', `Bearer ${adminToken()}`)
        .expect(200);

      expect(mockPrisma.auditLog.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ action: 'EVENT_DELETED' }),
        }),
      );
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // POST /events/:id/register  — authenticated user registration
  // ═══════════════════════════════════════════════════════════════════════════

  describe('POST /events/:id/register', () => {
    beforeEach(() => {
      mockPrisma.event.findUnique.mockResolvedValue(makeEvent());
      mockPrisma.eventRegistration.findUnique.mockResolvedValue(null);
      mockPrisma.eventRegistration.create.mockResolvedValue(makeRegistration());
    });

    it('401 — no token', async () => {
      await request(app.getHttpServer())
        .post(`/events/${EVENT_UUID}/register`)
        .expect(401);
    });

    it('400 — non-UUID event id', async () => {
      await request(app.getHttpServer())
        .post('/events/not-a-uuid/register')
        .set('Authorization', `Bearer ${userToken()}`)
        .expect(400);
    });

    it('404 — event not found', async () => {
      mockPrisma.event.findUnique.mockResolvedValue(null);

      const { body } = await request(app.getHttpServer())
        .post(`/events/${EVENT_UUID}/register`)
        .set('Authorization', `Bearer ${userToken()}`)
        .expect(201);

      expect(body.status).toBe(false);
      expect(body.statusCode).toBe(404);
    });

    it('400 — cannot register for cancelled event', async () => {
      mockPrisma.event.findUnique.mockResolvedValue(
        makeEvent({ isCancelled: true }),
      );

      const { body } = await request(app.getHttpServer())
        .post(`/events/${EVENT_UUID}/register`)
        .set('Authorization', `Bearer ${userToken()}`)
        .expect(201);

      expect(body.status).toBe(false);
      expect(body.statusCode).toBe(400);
      expect(body.message).toMatch(/cancelled/i);
    });

    it('400 — cannot register for past event', async () => {
      mockPrisma.event.findUnique.mockResolvedValue(
        makeEvent({ isPast: true }),
      );

      const { body } = await request(app.getHttpServer())
        .post(`/events/${EVENT_UUID}/register`)
        .set('Authorization', `Bearer ${userToken()}`)
        .expect(201);

      expect(body.status).toBe(false);
      expect(body.message).toMatch(/already ended/i);
    });

    it('409 — event is fully booked (capacity reached)', async () => {
      mockPrisma.event.findUnique.mockResolvedValue(
        makeEvent({ capacity: 5, _count: { registrations: 5 } }),
      );

      const { body } = await request(app.getHttpServer())
        .post(`/events/${EVENT_UUID}/register`)
        .set('Authorization', `Bearer ${userToken()}`)
        .expect(201);

      expect(body.status).toBe(false);
      expect(body.statusCode).toBe(409);
      expect(body.message).toMatch(/fully booked/i);
    });

    it('409 — user already registered', async () => {
      mockPrisma.eventRegistration.findUnique.mockResolvedValue(
        makeRegistration(),
      );

      const { body } = await request(app.getHttpServer())
        .post(`/events/${EVENT_UUID}/register`)
        .set('Authorization', `Bearer ${userToken()}`)
        .expect(201);

      expect(body.status).toBe(false);
      expect(body.statusCode).toBe(409);
      expect(body.message).toMatch(/already registered/i);
    });

    it('201 — registers user and sends confirmation email with ICS', async () => {
      const { body } = await request(app.getHttpServer())
        .post(`/events/${EVENT_UUID}/register`)
        .set('Authorization', `Bearer ${userToken()}`)
        .expect(201);

      expect(body.status).toBe(true);
      expect(body.statusCode).toBe(201);
      expect(body.data.registrationId).toBe(REG_UUID);

      await new Promise((r) => setTimeout(r, 50));
      expect(mockEmail.sendEventRegistrationConfirmation).toHaveBeenCalledWith(
        expect.objectContaining({
          email: 'user@example.com',
          icsContent: expect.stringContaining('BEGIN:VCALENDAR'),
        }),
      );
    });

    it('201 — no capacity limit (null) — registers freely', async () => {
      mockPrisma.event.findUnique.mockResolvedValue(
        makeEvent({ capacity: null }),
      );

      const { body } = await request(app.getHttpServer())
        .post(`/events/${EVENT_UUID}/register`)
        .set('Authorization', `Bearer ${userToken()}`)
        .expect(201);

      expect(body.status).toBe(true);
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // DELETE /events/:id/register  — unregister
  // ═══════════════════════════════════════════════════════════════════════════

  describe('DELETE /events/:id/register', () => {
    it('401 — no token', async () => {
      await request(app.getHttpServer())
        .delete(`/events/${EVENT_UUID}/register`)
        .expect(401);
    });

    it('404 — registration not found', async () => {
      mockPrisma.eventRegistration.findUnique.mockResolvedValue(null);

      const { body } = await request(app.getHttpServer())
        .delete(`/events/${EVENT_UUID}/register`)
        .set('Authorization', `Bearer ${userToken()}`)
        .expect(200);

      expect(body.status).toBe(false);
      expect(body.statusCode).toBe(404);
      expect(body.message).toMatch(/registration not found/i);
    });

    it('400 — cannot unregister from a past event', async () => {
      mockPrisma.eventRegistration.findUnique.mockResolvedValue(
        makeRegistration(),
      );
      mockPrisma.event.findUnique.mockResolvedValue(
        makeEvent({ isPast: true }),
      );

      const { body } = await request(app.getHttpServer())
        .delete(`/events/${EVENT_UUID}/register`)
        .set('Authorization', `Bearer ${userToken()}`)
        .expect(200);

      expect(body.status).toBe(false);
      expect(body.message).toMatch(/cannot unregister from a past event/i);
    });

    it('200 — successfully unregisters user', async () => {
      mockPrisma.eventRegistration.findUnique.mockResolvedValue(
        makeRegistration(),
      );
      mockPrisma.event.findUnique.mockResolvedValue(
        makeEvent({ isPast: false }),
      );
      mockPrisma.eventRegistration.delete.mockResolvedValue({});

      const { body } = await request(app.getHttpServer())
        .delete(`/events/${EVENT_UUID}/register`)
        .set('Authorization', `Bearer ${userToken()}`)
        .expect(200);

      expect(body.status).toBe(true);
      expect(body.message).toMatch(/unregistered/i);
      expect(mockPrisma.eventRegistration.delete).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { userId_eventId: { userId: USER_UUID, eventId: EVENT_UUID } },
        }),
      );
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // GET /events/my/registrations  — user's own registrations
  // ═══════════════════════════════════════════════════════════════════════════

  describe('GET /events/my/registrations', () => {
    beforeEach(() => {
      mockPrisma.$transaction.mockImplementation((q: any[]) => Promise.all(q));
      mockPrisma.eventRegistration.findMany.mockResolvedValue([
        makeRegistration(),
      ]);
      mockPrisma.eventRegistration.count.mockResolvedValue(1);
    });

    it('401 — no token', async () => {
      await request(app.getHttpServer())
        .get('/events/my/registrations')
        .expect(401);
    });

    it('200 — returns user registrations', async () => {
      const { body } = await request(app.getHttpServer())
        .get('/events/my/registrations')
        .set('Authorization', `Bearer ${userToken()}`)
        .expect(200);

      expect(body.status).toBe(true);
      expect(body.data.registrations).toHaveLength(1);
      expect(body.data.registrations[0].registrationId).toBe(REG_UUID);
    });

    it('200 — no params defaults safely (NaN regression — getMyRegistrations)', async () => {
      await request(app.getHttpServer())
        .get('/events/my/registrations')
        .set('Authorization', `Bearer ${userToken()}`)
        .expect(200);

      expect(mockPrisma.eventRegistration.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ skip: 0, take: 20 }),
      );
      const call = mockPrisma.eventRegistration.findMany.mock.calls[0][0];
      expect(Number.isFinite(call.take)).toBe(true);
      expect(Number.isFinite(call.skip)).toBe(true);
    });

    it('200 — non-numeric page/limit falls back to defaults', async () => {
      await request(app.getHttpServer())
        .get('/events/my/registrations?page=abc&limit=xyz')
        .set('Authorization', `Bearer ${userToken()}`)
        .expect(200);

      const call = mockPrisma.eventRegistration.findMany.mock.calls[0][0];
      expect(call.skip).toBe(0);
      expect(call.take).toBe(20);
    });

    it('200 — page=2&limit=5 produces skip=5, take=5', async () => {
      await request(app.getHttpServer())
        .get('/events/my/registrations?page=2&limit=5')
        .set('Authorization', `Bearer ${userToken()}`)
        .expect(200);

      expect(mockPrisma.eventRegistration.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ skip: 5, take: 5 }),
      );
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
  // POST /events/:id/join  — Jitsi token
  // ═══════════════════════════════════════════════════════════════════════════

  describe('POST /events/:id/join', () => {
    beforeEach(() => {
      mockPrisma.event.findUnique.mockResolvedValue(makeEvent());
      mockPrisma.user.findUnique.mockImplementation(({ where }: any) => {
        if (where?.id === ADMIN_UUID) return Promise.resolve(makeAdminUser());
        if (where?.id === USER_UUID) return Promise.resolve(makeDbUser());
        return Promise.resolve(null);
      });
    });

    it('401 — no token', async () => {
      await request(app.getHttpServer())
        .post(`/events/${EVENT_UUID}/join`)
        .expect(401);
    });

    it('404 — event not found', async () => {
      mockPrisma.event.findUnique.mockResolvedValue(null);

      const { body } = await request(app.getHttpServer())
        .post(`/events/${EVENT_UUID}/join`)
        .set('Authorization', `Bearer ${userToken()}`)
        .expect(201);

      expect(body.status).toBe(false);
      expect(body.statusCode).toBe(404);
    });

    it('400 — event is cancelled', async () => {
      mockPrisma.event.findUnique.mockResolvedValue(
        makeEvent({ isCancelled: true }),
      );

      const { body } = await request(app.getHttpServer())
        .post(`/events/${EVENT_UUID}/join`)
        .set('Authorization', `Bearer ${userToken()}`)
        .expect(201);

      expect(body.status).toBe(false);
      expect(body.message).toMatch(/cancelled/i);
    });

    it('403 — non-registered user cannot get Jitsi token', async () => {
      mockPrisma.eventRegistration.findUnique.mockResolvedValue(null);

      const { body } = await request(app.getHttpServer())
        .post(`/events/${EVENT_UUID}/join`)
        .set('Authorization', `Bearer ${userToken()}`)
        .expect(201);

      expect(body.status).toBe(false);
      expect(body.statusCode).toBe(403);
      expect(body.message).toMatch(/must register/i);
    });

    it('200 — registered user receives Jitsi token (not moderator)', async () => {
      mockPrisma.eventRegistration.findUnique.mockResolvedValue(
        makeRegistration(),
      );

      const { body } = await request(app.getHttpServer())
        .post(`/events/${EVENT_UUID}/join`)
        .set('Authorization', `Bearer ${userToken()}`)
        .expect(201);

      expect(body.status).toBe(true);
      expect(body.data.token).toBe('mock-jitsi-jwt-token');
      expect(body.data.roomId).toBe('plrcap-abc123-def456');
      expect(mockJitsi.generateToken).toHaveBeenCalledWith(
        'plrcap-abc123-def456',
        expect.objectContaining({ isModerator: false }),
        expect.any(Date),
      );
    });

    it('200 — SUPER_ADMIN is exempt from registration check and gets moderator token', async () => {
      // Admin bypasses registration findUnique
      const { body } = await request(app.getHttpServer())
        .post(`/events/${EVENT_UUID}/join`)
        .set('Authorization', `Bearer ${adminToken()}`)
        .expect(201);

      expect(body.status).toBe(true);
      expect(mockJitsi.generateToken).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({ isModerator: true }),
        expect.any(Date),
      );
      // Admin is exempt — eventRegistration.findUnique should NOT be called
      expect(mockPrisma.eventRegistration.findUnique).not.toHaveBeenCalled();
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // GET /events/:id/calendar  — ICS download
  // ═══════════════════════════════════════════════════════════════════════════

  describe('GET /events/:id/calendar', () => {
    beforeEach(() => {
      mockPrisma.event.findUnique.mockResolvedValue(makeEvent());
      mockPrisma.eventRegistration.findUnique.mockResolvedValue(
        makeRegistration(),
      );
    });

    it('401 — no token', async () => {
      await request(app.getHttpServer())
        .get(`/events/${EVENT_UUID}/calendar`)
        .expect(401);
    });

    it('returns error JSON when event not found', async () => {
      mockPrisma.event.findUnique.mockResolvedValue(null);

      const res = await request(app.getHttpServer())
        .get(`/events/${EVENT_UUID}/calendar`)
        .set('Authorization', `Bearer ${userToken()}`);

      expect(res.body.status).toBe(false);
      expect(res.body.statusCode).toBe(404);
    });

    it('returns 403 JSON when user not registered', async () => {
      mockPrisma.eventRegistration.findUnique.mockResolvedValue(null);

      const res = await request(app.getHttpServer())
        .get(`/events/${EVENT_UUID}/calendar`)
        .set('Authorization', `Bearer ${userToken()}`);

      expect(res.body.status).toBe(false);
      expect(res.body.statusCode).toBe(403);
      expect(res.body.message).toMatch(/not registered/i);
    });

    it('200 — returns ICS file with correct headers', async () => {
      const res = await request(app.getHttpServer())
        .get(`/events/${EVENT_UUID}/calendar`)
        .set('Authorization', `Bearer ${userToken()}`)
        .expect(200);

      expect(res.headers['content-type']).toMatch(/text\/calendar/);
      expect(res.headers['content-disposition']).toMatch(/attachment/);
      expect(res.headers['content-disposition']).toMatch(/\.ics/);
    });

    it('200 — ICS body contains required iCalendar fields', async () => {
      const res = await request(app.getHttpServer())
        .get(`/events/${EVENT_UUID}/calendar`)
        .set('Authorization', `Bearer ${userToken()}`)
        .expect(200);

      const ics = res.text;
      expect(ics).toContain('BEGIN:VCALENDAR');
      expect(ics).toContain('BEGIN:VEVENT');
      expect(ics).toContain('END:VEVENT');
      expect(ics).toContain('END:VCALENDAR');
      expect(ics).toContain(`UID:${EVENT_UUID}@plrcap.org`);
      expect(ics).toContain('SUMMARY:NGO Leadership Webinar');
      expect(ics).toContain('DTSTART:');
      expect(ics).toContain('DTEND:');
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // GET /events/:id/attendees  — admin attendee list
  // ═══════════════════════════════════════════════════════════════════════════

  describe('GET /events/:id/attendees', () => {
    beforeEach(() => {
      mockPrisma.event.findUnique.mockResolvedValue(makeEvent());
      mockPrisma.$transaction.mockImplementation((q: any[]) => Promise.all(q));
      mockPrisma.eventRegistration.findMany.mockResolvedValue([
        makeRegistration(),
      ]);
      mockPrisma.eventRegistration.count.mockResolvedValue(1);
    });

    it('401 — no token', async () => {
      await request(app.getHttpServer())
        .get(`/events/${EVENT_UUID}/attendees`)
        .expect(401);
    });

    it('403 — GUEST rejected', async () => {
      await request(app.getHttpServer())
        .get(`/events/${EVENT_UUID}/attendees`)
        .set('Authorization', `Bearer ${userToken()}`)
        .expect(403);
    });

    it('404 — event not found', async () => {
      mockPrisma.event.findUnique.mockResolvedValue(null);

      const { body } = await request(app.getHttpServer())
        .get(`/events/${EVENT_UUID}/attendees`)
        .set('Authorization', `Bearer ${adminToken()}`)
        .expect(200);

      expect(body.status).toBe(false);
      expect(body.statusCode).toBe(404);
    });

    it('200 — returns attendee list with pagination', async () => {
      const { body } = await request(app.getHttpServer())
        .get(`/events/${EVENT_UUID}/attendees`)
        .set('Authorization', `Bearer ${adminToken()}`)
        .expect(200);

      expect(body.status).toBe(true);
      expect(body.data.attendees).toHaveLength(1);
      expect(body.data.eventId).toBe(EVENT_UUID);
    });

    it('200 — no params defaults safely (NaN regression — listAttendees)', async () => {
      await request(app.getHttpServer())
        .get(`/events/${EVENT_UUID}/attendees`)
        .set('Authorization', `Bearer ${adminToken()}`)
        .expect(200);

      expect(mockPrisma.eventRegistration.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ skip: 0, take: 50 }),
      );
      const call = mockPrisma.eventRegistration.findMany.mock.calls[0][0];
      expect(Number.isFinite(call.take)).toBe(true);
      expect(Number.isFinite(call.skip)).toBe(true);
    });

    it('200 — non-numeric page/limit falls back to defaults', async () => {
      await request(app.getHttpServer())
        .get(`/events/${EVENT_UUID}/attendees?page=abc&limit=xyz`)
        .set('Authorization', `Bearer ${adminToken()}`)
        .expect(200);

      const call = mockPrisma.eventRegistration.findMany.mock.calls[0][0];
      expect(call.skip).toBe(0);
      expect(call.take).toBe(50);
    });

    it('200 — page=2&limit=25 produces skip=25, take=25', async () => {
      await request(app.getHttpServer())
        .get(`/events/${EVENT_UUID}/attendees?page=2&limit=25`)
        .set('Authorization', `Bearer ${adminToken()}`)
        .expect(200);

      expect(mockPrisma.eventRegistration.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ skip: 25, take: 25 }),
      );
    });

    it('200 — correct pagination metadata returned', async () => {
      mockPrisma.eventRegistration.count.mockResolvedValue(75);

      const { body } = await request(app.getHttpServer())
        .get(`/events/${EVENT_UUID}/attendees?page=3&limit=25`)
        .set('Authorization', `Bearer ${adminToken()}`)
        .expect(200);

      expect(body.data.total).toBe(75);
      expect(body.data.page).toBe(3);
      expect(body.data.limit).toBe(25);
      expect(body.data.pages).toBe(3);
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // DELETE /events/:id/attendees/:userId  — admin remove attendee
  // ═══════════════════════════════════════════════════════════════════════════

  describe('DELETE /events/:id/attendees/:userId', () => {
    beforeEach(() => {
      mockPrisma.eventRegistration.findUnique.mockResolvedValue(
        makeRegistration(),
      );
      mockPrisma.$transaction.mockImplementation((q: any[]) => Promise.all(q));
      mockPrisma.eventRegistration.delete.mockResolvedValue({});
      mockPrisma.auditLog.create.mockResolvedValue({});
    });

    it('401 — no token', async () => {
      await request(app.getHttpServer())
        .delete(`/events/${EVENT_UUID}/attendees/${USER_UUID}`)
        .expect(401);
    });

    it('403 — GUEST rejected', async () => {
      await request(app.getHttpServer())
        .delete(`/events/${EVENT_UUID}/attendees/${USER_UUID}`)
        .set('Authorization', `Bearer ${userToken()}`)
        .expect(403);
    });

    it('400 — non-UUID event id', async () => {
      await request(app.getHttpServer())
        .delete(`/events/not-a-uuid/attendees/${USER_UUID}`)
        .set('Authorization', `Bearer ${adminToken()}`)
        .expect(400);
    });

    it('400 — non-UUID userId param', async () => {
      await request(app.getHttpServer())
        .delete(`/events/${EVENT_UUID}/attendees/not-a-uuid`)
        .set('Authorization', `Bearer ${adminToken()}`)
        .expect(400);
    });

    it('404 — registration not found', async () => {
      mockPrisma.eventRegistration.findUnique.mockResolvedValue(null);

      const { body } = await request(app.getHttpServer())
        .delete(`/events/${EVENT_UUID}/attendees/${USER_UUID}`)
        .set('Authorization', `Bearer ${adminToken()}`)
        .expect(200);

      expect(body.status).toBe(false);
      expect(body.statusCode).toBe(404);
      expect(body.message).toMatch(/registration not found/i);
    });

    it('200 — removes attendee and creates audit log', async () => {
      const { body } = await request(app.getHttpServer())
        .delete(`/events/${EVENT_UUID}/attendees/${USER_UUID}`)
        .set('Authorization', `Bearer ${adminToken()}`)
        .expect(200);

      expect(body.status).toBe(true);
      expect(body.message).toMatch(/attendee removed/i);
      expect(mockPrisma.eventRegistration.delete).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { userId_eventId: { userId: USER_UUID, eventId: EVENT_UUID } },
        }),
      );
      expect(mockPrisma.auditLog.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ action: 'EVENT_ATTENDEE_REMOVED' }),
        }),
      );
    });
  });
});
