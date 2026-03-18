/* eslint-disable @typescript-eslint/no-unused-vars */
import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { JwtService, JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { ConfigModule, ConfigService } from '@nestjs/config';
import request from 'supertest';
import { Role } from '@prisma/client';

import { SpotlightController } from 'src/spotlight/controller/spotlight.controller';
import { SpotlightService } from 'src/spotlight/service/spotlight.service';
import { JwtStrategy } from 'src/common/strategies/jwt.strategy';
import { JwtAuthGuard } from 'src/common/guards/jwt-auth.guard';
import { RolesGuard } from 'src/common/guards/roles.guard';
import { PrismaService } from 'src/prisma.service';

// ─────────────────────────────────────────────────────────────────────────────
// CONSTANTS
// ─────────────────────────────────────────────────────────────────────────────

const JWT_SECRET = 'test-secret-do-not-use-in-prod';
const ADMIN_UUID = 'b1ffcd00-0d1c-4ef8-bb6d-6bb9bd380a22';
const NGO_UUID = 'c2eebc99-9c0b-4ef8-bb6d-6bb9bd380a33';
const GUEST_UUID = 'd3eebc99-9c0b-4ef8-bb6d-6bb9bd380a44';
const ORG_UUID = 'f5eebc99-9c0b-4ef8-bb6d-6bb9bd380a66';
const ORG_UUID_2 = 'a1eebc99-9c0b-4ef8-bb6d-6bb9bd380a77';
const ORG_UUID_3 = 'b2eebc99-9c0b-4ef8-bb6d-6bb9bd380a88';
const ENTRY_UUID = 'e4eebc99-9c0b-4ef8-bb6d-6bb9bd380a55';

// ─────────────────────────────────────────────────────────────────────────────
// FIXTURES
// ─────────────────────────────────────────────────────────────────────────────

function makeOrgSelect(overrides: Record<string, any> = {}): any {
  return {
    id: ORG_UUID,
    name: 'Save The Children Nigeria',
    acronym: 'STCN',
    logoUrl: null,
    description: 'We work for children.',
    mission: 'Save every child.',
    sectors: ['Health', 'Education'],
    state: 'Lagos',
    lga: 'Ikeja',
    ...overrides,
  };
}

function makeEntry(overrides: Record<string, any> = {}): any {
  const now = new Date();
  const endAt = new Date(now.getTime() + 2 * 24 * 60 * 60 * 1000);
  return {
    id: ENTRY_UUID,
    orgId: ORG_UUID,
    org: makeOrgSelect(),
    startAt: now,
    endAt,
    isActive: true,
    wasAuto: true,
    order: null,
    createdAt: now,
    ...overrides,
  };
}

function makeQueueEntry(
  index: number,
  orgId = ORG_UUID,
  overrides: Record<string, any> = {},
): any {
  const start = new Date(Date.now() + index * 2 * 24 * 60 * 60 * 1000);
  const end = new Date(start.getTime() + 2 * 24 * 60 * 60 * 1000);
  return {
    id: `queue-entry-${index}`,
    orgId,
    org: makeOrgSelect({ id: orgId }),
    startAt: start,
    endAt: end,
    isActive: false,
    wasAuto: false,
    order: index,
    createdAt: new Date(),
    ...overrides,
  };
}

function makeHistoryItem(overrides: Record<string, any> = {}): any {
  const start = new Date(Date.now() - 4 * 24 * 60 * 60 * 1000);
  const end = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000);
  return {
    id: 'history-uuid-1',
    orgId: ORG_UUID,
    org: makeOrgSelect(),
    startAt: start,
    endAt: end,
    wasAuto: true,
    createdAt: start,
    ...overrides,
  };
}

function makeSettings(overrides: Record<string, any> = {}): any {
  return {
    id: 'singleton',
    defaultPeriodDays: 2,
    mode: 'AUTO',
    updatedAt: new Date(),
    ...overrides,
  };
}

function makeDbUser(overrides: Record<string, any> = {}): any {
  return {
    id: ADMIN_UUID,
    email: 'admin@example.com',
    fullName: 'Admin User',
    role: Role.SUPER_ADMIN,
    status: 'APPROVED',
    isEmailVerified: true,
    passwordHash: 'hash',
    otp: null,
    otpExpiresAt: null,
    avatarUrl: null,
    phoneNumber: null,
    adminPermission: {
      permissions: ['org:spotlight'],
    },
    organization: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

function makeNgoDbUser(): any {
  return makeDbUser({
    id: NGO_UUID,
    email: 'ngo@example.com',
    role: Role.NGO_MEMBER,
    adminPermission: null,
  });
}

function makeGuestDbUser(): any {
  return makeDbUser({
    id: GUEST_UUID,
    email: 'guest@example.com',
    role: Role.GUEST,
    adminPermission: null,
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// MOCK PRISMA
// ─────────────────────────────────────────────────────────────────────────────

const mockPrisma = {
  user: { findUnique: jest.fn() },
  organization: {
    findUnique: jest.fn(),
    findMany: jest.fn(),
    count: jest.fn(),
  },
  spotlightSettings: {
    upsert: jest.fn(),
    findUnique: jest.fn(),
  },
  spotlightEntry: {
    findFirst: jest.fn(),
    findMany: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
    deleteMany: jest.fn(),
    count: jest.fn(),
  },
  spotlightHistory: {
    findMany: jest.fn(),
    create: jest.fn(),
    count: jest.fn(),
  },
  $transaction: jest.fn(),
};

// ─────────────────────────────────────────────────────────────────────────────
// JWT HELPERS
// ─────────────────────────────────────────────────────────────────────────────

let jwtService: JwtService;
const token = (sub: string, role: string) => () =>
  jwtService.sign({ sub, email: `${role}@example.com`, role });

let adminToken: () => string;
let ngoToken: () => string;
let guestToken: () => string;

// ─────────────────────────────────────────────────────────────────────────────
// BOOTSTRAP
// ─────────────────────────────────────────────────────────────────────────────

describe('Spotlight Module — E2E', () => {
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
      controllers: [SpotlightController],
      providers: [
        SpotlightService,
        JwtStrategy,
        { provide: PrismaService, useValue: mockPrisma },
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
    ngoToken = token(NGO_UUID, Role.NGO_MEMBER);
    guestToken = token(GUEST_UUID, Role.GUEST);
  });

  afterAll(() => app.close());

  beforeEach(() => {
    jest.resetAllMocks();

    // JwtStrategy.validate() calls prisma.user.findUnique
    mockPrisma.user.findUnique.mockImplementation(({ where }: any) => {
      if (where?.id === ADMIN_UUID) return Promise.resolve(makeDbUser());
      if (where?.id === NGO_UUID) return Promise.resolve(makeNgoDbUser());
      if (where?.id === GUEST_UUID) return Promise.resolve(makeGuestDbUser());
      return Promise.resolve(null);
    });

    // Default $transaction executes array of promises or callback
    mockPrisma.$transaction.mockImplementation((arg: any) =>
      Array.isArray(arg) ? Promise.all(arg) : arg(mockPrisma),
    );

    // Default settings upsert
    mockPrisma.spotlightSettings.upsert.mockResolvedValue(makeSettings());
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // GET /spotlight/current
  // ═══════════════════════════════════════════════════════════════════════════

  describe('GET /spotlight/current', () => {
    it('200 — returns null data when no active entry', async () => {
      mockPrisma.spotlightEntry.findFirst.mockResolvedValue(null);

      const { body } = await request(app.getHttpServer())
        .get('/spotlight/current')
        .expect(200);

      expect(body.status).toBe(true);
      expect(body.data).toBeNull();
      expect(body.message).toMatch(/no active spotlight/i);
    });

    it('200 — returns active spotlight with org details and secondsRemaining', async () => {
      mockPrisma.spotlightEntry.findFirst.mockResolvedValue(makeEntry());

      const { body } = await request(app.getHttpServer())
        .get('/spotlight/current')
        .expect(200);

      expect(body.status).toBe(true);
      expect(body.data).toMatchObject({
        id: ENTRY_UUID,
        orgId: ORG_UUID,
        isActive: true,
        secondsRemaining: expect.any(Number),
      });
      expect(body.data.secondsRemaining).toBeGreaterThan(0);
    });

    it('200 — secondsRemaining is 0 when spotlight has already expired', async () => {
      const pastEndAt = new Date(Date.now() - 1000); // 1 second ago
      mockPrisma.spotlightEntry.findFirst.mockResolvedValue(
        makeEntry({ endAt: pastEndAt }),
      );

      const { body } = await request(app.getHttpServer())
        .get('/spotlight/current')
        .expect(200);

      expect(body.data.secondsRemaining).toBe(0);
    });

    it('200 — org details are included in the response', async () => {
      mockPrisma.spotlightEntry.findFirst.mockResolvedValue(makeEntry());

      const { body } = await request(app.getHttpServer())
        .get('/spotlight/current')
        .expect(200);

      expect(body.data.org).toMatchObject({
        id: ORG_UUID,
        name: 'Save The Children Nigeria',
        sectors: expect.any(Array),
        state: 'Lagos',
      });
    });

    it('200 — no auth required (public endpoint)', async () => {
      mockPrisma.spotlightEntry.findFirst.mockResolvedValue(null);

      await request(app.getHttpServer()).get('/spotlight/current').expect(200); // no Authorization header
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // GET /spotlight/settings
  // ═══════════════════════════════════════════════════════════════════════════

  describe('GET /spotlight/settings', () => {
    it('401 — no token', async () => {
      await request(app.getHttpServer()).get('/spotlight/settings').expect(401);
    });

    it('403 — NGO_MEMBER rejected', async () => {
      await request(app.getHttpServer())
        .get('/spotlight/settings')
        .set('Authorization', `Bearer ${ngoToken()}`)
        .expect(403);
    });

    it('403 — GUEST rejected', async () => {
      await request(app.getHttpServer())
        .get('/spotlight/settings')
        .set('Authorization', `Bearer ${guestToken()}`)
        .expect(403);
    });

    it('200 — SUPER_ADMIN retrieves settings', async () => {
      mockPrisma.spotlightSettings.upsert.mockResolvedValue(makeSettings());

      const { body } = await request(app.getHttpServer())
        .get('/spotlight/settings')
        .set('Authorization', `Bearer ${adminToken()}`)
        .expect(200);

      expect(body.status).toBe(true);
      expect(body.data).toMatchObject({
        id: 'singleton',
        defaultPeriodDays: 2,
        mode: 'AUTO',
      });
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // PATCH /spotlight/settings
  // ═══════════════════════════════════════════════════════════════════════════

  describe('PATCH /spotlight/settings', () => {
    it('401 — no token', async () => {
      await request(app.getHttpServer())
        .patch('/spotlight/settings')
        .send({ defaultPeriodDays: 5 })
        .expect(401);
    });

    it('403 — NGO_MEMBER rejected', async () => {
      await request(app.getHttpServer())
        .patch('/spotlight/settings')
        .set('Authorization', `Bearer ${ngoToken()}`)
        .send({ defaultPeriodDays: 5 })
        .expect(403);
    });

    it('400 — missing defaultPeriodDays', async () => {
      await request(app.getHttpServer())
        .patch('/spotlight/settings')
        .set('Authorization', `Bearer ${adminToken()}`)
        .send({})
        .expect(400);
    });

    it('400 — defaultPeriodDays below minimum (0)', async () => {
      await request(app.getHttpServer())
        .patch('/spotlight/settings')
        .set('Authorization', `Bearer ${adminToken()}`)
        .send({ defaultPeriodDays: 0 })
        .expect(400);
    });

    it('400 — defaultPeriodDays above maximum (31)', async () => {
      await request(app.getHttpServer())
        .patch('/spotlight/settings')
        .set('Authorization', `Bearer ${adminToken()}`)
        .send({ defaultPeriodDays: 31 })
        .expect(400);
    });

    it('200 — updates settings successfully', async () => {
      mockPrisma.spotlightSettings.upsert.mockResolvedValue(
        makeSettings({ defaultPeriodDays: 7 }),
      );

      const { body } = await request(app.getHttpServer())
        .patch('/spotlight/settings')
        .set('Authorization', `Bearer ${adminToken()}`)
        .send({ defaultPeriodDays: 7 })
        .expect(200);

      expect(body.status).toBe(true);
      expect(body.data.defaultPeriodDays).toBe(7);
      expect(mockPrisma.spotlightSettings.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          update: { defaultPeriodDays: 7 },
        }),
      );
    });

    it('200 — boundary value: defaultPeriodDays = 1 accepted', async () => {
      mockPrisma.spotlightSettings.upsert.mockResolvedValue(
        makeSettings({ defaultPeriodDays: 1 }),
      );

      const { body } = await request(app.getHttpServer())
        .patch('/spotlight/settings')
        .set('Authorization', `Bearer ${adminToken()}`)
        .send({ defaultPeriodDays: 1 })
        .expect(200);

      expect(body.status).toBe(true);
    });

    it('200 — boundary value: defaultPeriodDays = 30 accepted', async () => {
      mockPrisma.spotlightSettings.upsert.mockResolvedValue(
        makeSettings({ defaultPeriodDays: 30 }),
      );

      const { body } = await request(app.getHttpServer())
        .patch('/spotlight/settings')
        .set('Authorization', `Bearer ${adminToken()}`)
        .send({ defaultPeriodDays: 30 })
        .expect(200);

      expect(body.status).toBe(true);
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // POST /spotlight/manual
  // ═══════════════════════════════════════════════════════════════════════════

  describe('POST /spotlight/manual', () => {
    it('401 — no token', async () => {
      await request(app.getHttpServer())
        .post('/spotlight/manual')
        .send({ orgId: ORG_UUID })
        .expect(401);
    });

    it('403 — NGO_MEMBER rejected', async () => {
      await request(app.getHttpServer())
        .post('/spotlight/manual')
        .set('Authorization', `Bearer ${ngoToken()}`)
        .send({ orgId: ORG_UUID })
        .expect(403);
    });

    it('400 — missing orgId', async () => {
      await request(app.getHttpServer())
        .post('/spotlight/manual')
        .set('Authorization', `Bearer ${adminToken()}`)
        .send({})
        .expect(400);
    });

    it('404 — org not found', async () => {
      mockPrisma.organization.findUnique.mockResolvedValue(null);

      const { body } = await request(app.getHttpServer())
        .post('/spotlight/manual')
        .set('Authorization', `Bearer ${adminToken()}`)
        .send({ orgId: ORG_UUID })
        .expect(201);

      expect(body.status).toBe(false);
      expect(body.statusCode).toBe(404);
      expect(body.message).toMatch(/organization not found/i);
    });

    it('201 — activates manual spotlight, archives current, clears queue', async () => {
      mockPrisma.organization.findUnique.mockResolvedValue({ id: ORG_UUID });

      const txMock = {
        spotlightEntry: {
          findFirst: jest.fn().mockResolvedValue(makeEntry({ isActive: true })),
          create: jest.fn().mockResolvedValue(makeEntry({ wasAuto: false })),
          delete: jest.fn().mockResolvedValue({}),
          deleteMany: jest.fn().mockResolvedValue({}),
        },
        spotlightHistory: {
          create: jest.fn().mockResolvedValue({}),
        },
        spotlightSettings: {
          upsert: jest.fn().mockResolvedValue(makeSettings({ mode: 'MANUAL' })),
        },
      };
      mockPrisma.$transaction.mockImplementation((cb: any) => cb(txMock));
      mockPrisma.spotlightEntry.findFirst.mockResolvedValue(
        makeEntry({ wasAuto: false }),
      );

      const { body } = await request(app.getHttpServer())
        .post('/spotlight/manual')
        .set('Authorization', `Bearer ${adminToken()}`)
        .send({ orgId: ORG_UUID })
        .expect(201);

      expect(body.status).toBe(true);
      expect(body.statusCode).toBe(201);
      expect(txMock.spotlightHistory.create).toHaveBeenCalled();
      expect(txMock.spotlightEntry.deleteMany).toHaveBeenCalledWith({
        where: { isActive: false },
      });
    });

    it('201 — uses durationDays override when provided', async () => {
      mockPrisma.organization.findUnique.mockResolvedValue({ id: ORG_UUID });

      const txMock = {
        spotlightEntry: {
          findFirst: jest.fn().mockResolvedValue(null), // no current active
          create: jest.fn().mockResolvedValue(makeEntry({ wasAuto: false })),
          delete: jest.fn().mockResolvedValue({}),
          deleteMany: jest.fn().mockResolvedValue({}),
        },
        spotlightHistory: { create: jest.fn().mockResolvedValue({}) },
        spotlightSettings: {
          upsert: jest.fn().mockResolvedValue(makeSettings({ mode: 'MANUAL' })),
        },
      };
      mockPrisma.$transaction.mockImplementation((cb: any) => cb(txMock));
      mockPrisma.spotlightEntry.findFirst.mockResolvedValue(
        makeEntry({ wasAuto: false }),
      );

      const { body } = await request(app.getHttpServer())
        .post('/spotlight/manual')
        .set('Authorization', `Bearer ${adminToken()}`)
        .send({ orgId: ORG_UUID, durationDays: 10 })
        .expect(201);

      expect(body.status).toBe(true);
      // Verify the entry was created with ~10 days duration
      const createCall = txMock.spotlightEntry.create.mock.calls[0][0];
      const duration =
        (new Date(createCall.data.endAt).getTime() -
          new Date(createCall.data.startAt).getTime()) /
        (24 * 60 * 60 * 1000);
      expect(Math.round(duration)).toBe(10);
    });

    it('201 — works when no current active spotlight exists (no archive needed)', async () => {
      mockPrisma.organization.findUnique.mockResolvedValue({ id: ORG_UUID });

      const txMock = {
        spotlightEntry: {
          findFirst: jest.fn().mockResolvedValue(null), // nothing active
          create: jest.fn().mockResolvedValue(makeEntry({ wasAuto: false })),
          delete: jest.fn(),
          deleteMany: jest.fn().mockResolvedValue({}),
        },
        spotlightHistory: { create: jest.fn() },
        spotlightSettings: {
          upsert: jest.fn().mockResolvedValue(makeSettings({ mode: 'MANUAL' })),
        },
      };
      mockPrisma.$transaction.mockImplementation((cb: any) => cb(txMock));
      mockPrisma.spotlightEntry.findFirst.mockResolvedValue(
        makeEntry({ wasAuto: false }),
      );

      const { body } = await request(app.getHttpServer())
        .post('/spotlight/manual')
        .set('Authorization', `Bearer ${adminToken()}`)
        .send({ orgId: ORG_UUID })
        .expect(201);

      expect(body.status).toBe(true);
      expect(txMock.spotlightHistory.create).not.toHaveBeenCalled();
      expect(txMock.spotlightEntry.delete).not.toHaveBeenCalled();
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // POST /spotlight/queue
  // ═══════════════════════════════════════════════════════════════════════════

  describe('POST /spotlight/queue', () => {
    const validBody = {
      items: [
        { orgId: ORG_UUID, durationDays: 3 },
        { orgId: ORG_UUID_2, durationDays: 2 },
      ],
    };

    it('401 — no token', async () => {
      await request(app.getHttpServer())
        .post('/spotlight/queue')
        .send(validBody)
        .expect(401);
    });

    it('403 — NGO_MEMBER rejected', async () => {
      await request(app.getHttpServer())
        .post('/spotlight/queue')
        .set('Authorization', `Bearer ${ngoToken()}`)
        .send(validBody)
        .expect(403);
    });

    it('400 — empty items array rejected', async () => {
      await request(app.getHttpServer())
        .post('/spotlight/queue')
        .set('Authorization', `Bearer ${adminToken()}`)
        .send({ items: [] })
        .expect(400);
    });

    it('400 — more than 20 items rejected', async () => {
      const items = Array.from({ length: 21 }, (_, i) => ({
        orgId: ORG_UUID,
        durationDays: 1,
      }));
      await request(app.getHttpServer())
        .post('/spotlight/queue')
        .set('Authorization', `Bearer ${adminToken()}`)
        .send({ items })
        .expect(400);
    });

    it('400 — item missing durationDays', async () => {
      await request(app.getHttpServer())
        .post('/spotlight/queue')
        .set('Authorization', `Bearer ${adminToken()}`)
        .send({ items: [{ orgId: ORG_UUID }] })
        .expect(400);
    });

    it('400 — item durationDays below minimum', async () => {
      await request(app.getHttpServer())
        .post('/spotlight/queue')
        .set('Authorization', `Bearer ${adminToken()}`)
        .send({ items: [{ orgId: ORG_UUID, durationDays: 0 }] })
        .expect(400);
    });

    it('404 — one or more orgs not found', async () => {
      // Only finds 1 of 2 orgs
      mockPrisma.organization.findMany.mockResolvedValue([{ id: ORG_UUID }]);

      const { body } = await request(app.getHttpServer())
        .post('/spotlight/queue')
        .set('Authorization', `Bearer ${adminToken()}`)
        .send(validBody)
        .expect(201);

      expect(body.status).toBe(false);
      expect(body.statusCode).toBe(404);
      expect(body.message).toMatch(ORG_UUID_2);
    });

    it('201 — sets queue, replaces existing pending entries', async () => {
      mockPrisma.organization.findMany.mockResolvedValue([
        { id: ORG_UUID },
        { id: ORG_UUID_2 },
      ]);

      const txMock = {
        spotlightEntry: {
          deleteMany: jest.fn().mockResolvedValue({}),
          findFirst: jest.fn().mockResolvedValue(makeEntry()),
          create: jest.fn().mockResolvedValue({}),
        },
        spotlightSettings: {
          upsert: jest.fn().mockResolvedValue(makeSettings({ mode: 'MANUAL' })),
        },
      };
      mockPrisma.$transaction.mockImplementation((cb: any) => cb(txMock));

      mockPrisma.spotlightEntry.findMany.mockResolvedValue([
        makeQueueEntry(0, ORG_UUID),
        makeQueueEntry(1, ORG_UUID_2),
      ]);

      const { body } = await request(app.getHttpServer())
        .post('/spotlight/queue')
        .set('Authorization', `Bearer ${adminToken()}`)
        .send(validBody)
        .expect(201);

      expect(body.status).toBe(true);
      expect(body.statusCode).toBe(201);
      expect(txMock.spotlightEntry.deleteMany).toHaveBeenCalledWith({
        where: { isActive: false },
      });
      expect(txMock.spotlightEntry.create).toHaveBeenCalledTimes(2);
    });

    it('201 — entries are created with correct order index', async () => {
      mockPrisma.organization.findMany.mockResolvedValue([
        { id: ORG_UUID },
        { id: ORG_UUID_2 },
      ]);

      const createdEntries: any[] = [];
      const txMock = {
        spotlightEntry: {
          deleteMany: jest.fn().mockResolvedValue({}),
          findFirst: jest.fn().mockResolvedValue(null),
          create: jest.fn().mockImplementation((args: any) => {
            createdEntries.push(args.data);
            return Promise.resolve({});
          }),
        },
        spotlightSettings: {
          upsert: jest.fn().mockResolvedValue(makeSettings({ mode: 'MANUAL' })),
        },
      };
      mockPrisma.$transaction.mockImplementation((cb: any) => cb(txMock));
      mockPrisma.spotlightEntry.findMany.mockResolvedValue([]);

      await request(app.getHttpServer())
        .post('/spotlight/queue')
        .set('Authorization', `Bearer ${adminToken()}`)
        .send(validBody)
        .expect(201);

      expect(createdEntries[0].order).toBe(0);
      expect(createdEntries[1].order).toBe(1);
      expect(createdEntries[0].orgId).toBe(ORG_UUID);
      expect(createdEntries[1].orgId).toBe(ORG_UUID_2);
    });

    it('201 — queue start time follows end of active entry', async () => {
      mockPrisma.organization.findMany.mockResolvedValue([{ id: ORG_UUID }]);

      const activeEndAt = new Date(Date.now() + 5 * 24 * 60 * 60 * 1000);
      let capturedCreate: any;
      const txMock = {
        spotlightEntry: {
          deleteMany: jest.fn().mockResolvedValue({}),
          findFirst: jest
            .fn()
            .mockResolvedValue(makeEntry({ endAt: activeEndAt })),
          create: jest.fn().mockImplementation((args: any) => {
            capturedCreate = args.data;
            return Promise.resolve({});
          }),
        },
        spotlightSettings: {
          upsert: jest.fn().mockResolvedValue(makeSettings({ mode: 'MANUAL' })),
        },
      };
      mockPrisma.$transaction.mockImplementation((cb: any) => cb(txMock));
      mockPrisma.spotlightEntry.findMany.mockResolvedValue([]);

      await request(app.getHttpServer())
        .post('/spotlight/queue')
        .set('Authorization', `Bearer ${adminToken()}`)
        .send({ items: [{ orgId: ORG_UUID, durationDays: 2 }] })
        .expect(201);

      expect(new Date(capturedCreate.startAt).getTime()).toBeCloseTo(
        activeEndAt.getTime(),
        -3,
      );
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // GET /spotlight/queue
  // ═══════════════════════════════════════════════════════════════════════════

  describe('GET /spotlight/queue', () => {
    it('401 — no token', async () => {
      await request(app.getHttpServer()).get('/spotlight/queue').expect(401);
    });

    it('403 — GUEST rejected', async () => {
      await request(app.getHttpServer())
        .get('/spotlight/queue')
        .set('Authorization', `Bearer ${guestToken()}`)
        .expect(403);
    });

    it('200 — returns empty array when queue is empty', async () => {
      mockPrisma.spotlightEntry.findMany.mockResolvedValue([]);

      const { body } = await request(app.getHttpServer())
        .get('/spotlight/queue')
        .set('Authorization', `Bearer ${adminToken()}`)
        .expect(200);

      expect(body.status).toBe(true);
      expect(body.data).toEqual([]);
    });

    it('200 — returns ordered pending entries', async () => {
      mockPrisma.spotlightEntry.findMany.mockResolvedValue([
        makeQueueEntry(0, ORG_UUID),
        makeQueueEntry(1, ORG_UUID_2),
      ]);

      const { body } = await request(app.getHttpServer())
        .get('/spotlight/queue')
        .set('Authorization', `Bearer ${adminToken()}`)
        .expect(200);

      expect(body.status).toBe(true);
      expect(body.data).toHaveLength(2);
      expect(body.data[0].order).toBe(0);
      expect(body.data[1].order).toBe(1);
    });

    it('200 — queries only non-active entries ordered by order asc', async () => {
      mockPrisma.spotlightEntry.findMany.mockResolvedValue([]);

      await request(app.getHttpServer())
        .get('/spotlight/queue')
        .set('Authorization', `Bearer ${adminToken()}`)
        .expect(200);

      expect(mockPrisma.spotlightEntry.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { isActive: false },
          orderBy: { order: 'asc' },
        }),
      );
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // DELETE /spotlight/queue
  // ═══════════════════════════════════════════════════════════════════════════

  describe('DELETE /spotlight/queue', () => {
    it('401 — no token', async () => {
      await request(app.getHttpServer()).delete('/spotlight/queue').expect(401);
    });

    it('403 — NGO_MEMBER rejected', async () => {
      await request(app.getHttpServer())
        .delete('/spotlight/queue')
        .set('Authorization', `Bearer ${ngoToken()}`)
        .expect(403);
    });

    it('200 — clears pending queue and sets mode to AUTO', async () => {
      const txMock = {
        spotlightEntry: {
          deleteMany: jest.fn().mockResolvedValue({ count: 3 }),
        },
        spotlightSettings: {
          upsert: jest.fn().mockResolvedValue(makeSettings({ mode: 'AUTO' })),
        },
      };
      mockPrisma.$transaction.mockImplementation((cb: any) => cb(txMock));

      const { body } = await request(app.getHttpServer())
        .delete('/spotlight/queue')
        .set('Authorization', `Bearer ${adminToken()}`)
        .expect(200);

      expect(body.status).toBe(true);
      expect(body.message).toMatch(/auto mode/i);
      expect(txMock.spotlightEntry.deleteMany).toHaveBeenCalledWith({
        where: { isActive: false },
      });
      expect(txMock.spotlightSettings.upsert).toHaveBeenCalledWith(
        expect.objectContaining({ update: { mode: 'AUTO' } }),
      );
    });

    it('200 — works even when queue is already empty', async () => {
      const txMock = {
        spotlightEntry: {
          deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
        },
        spotlightSettings: {
          upsert: jest.fn().mockResolvedValue(makeSettings({ mode: 'AUTO' })),
        },
      };
      mockPrisma.$transaction.mockImplementation((cb: any) => cb(txMock));

      const { body } = await request(app.getHttpServer())
        .delete('/spotlight/queue')
        .set('Authorization', `Bearer ${adminToken()}`)
        .expect(200);

      expect(body.status).toBe(true);
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // GET /spotlight/history
  // ═══════════════════════════════════════════════════════════════════════════

  describe('GET /spotlight/history', () => {
    it('401 — no token', async () => {
      await request(app.getHttpServer()).get('/spotlight/history').expect(401);
    });

    it('403 — GUEST rejected', async () => {
      await request(app.getHttpServer())
        .get('/spotlight/history')
        .set('Authorization', `Bearer ${guestToken()}`)
        .expect(403);
    });

    it('200 — returns paginated history', async () => {
      mockPrisma.$transaction.mockImplementation(() =>
        Promise.resolve([[makeHistoryItem()], 1]),
      );

      const { body } = await request(app.getHttpServer())
        .get('/spotlight/history')
        .set('Authorization', `Bearer ${adminToken()}`)
        .expect(200);

      expect(body.status).toBe(true);
      expect(body.data.history).toHaveLength(1);
      expect(body.data.total).toBe(1);
      expect(body.data.page).toBe(1);
      expect(body.data.pages).toBe(1);
    });

    it('200 — returns empty history when no past spotlights', async () => {
      mockPrisma.$transaction.mockImplementation(() =>
        Promise.resolve([[], 0]),
      );

      const { body } = await request(app.getHttpServer())
        .get('/spotlight/history')
        .set('Authorization', `Bearer ${adminToken()}`)
        .expect(200);

      expect(body.status).toBe(true);
      expect(body.data.history).toEqual([]);
      expect(body.data.total).toBe(0);
    });

    it('200 — applies correct skip/take for page=2&limit=5', async () => {
      mockPrisma.$transaction.mockImplementation(() =>
        Promise.resolve([[], 15]),
      );

      const { body } = await request(app.getHttpServer())
        .get('/spotlight/history?page=2&limit=5')
        .set('Authorization', `Bearer ${adminToken()}`)
        .expect(200);

      expect(body.data.page).toBe(2);
      expect(body.data.limit).toBe(5);
      expect(body.data.pages).toBe(3);
    });

    it('200 — non-numeric page/limit falls back to defaults', async () => {
      mockPrisma.$transaction.mockImplementation(() =>
        Promise.resolve([[], 0]),
      );

      const { body } = await request(app.getHttpServer())
        .get('/spotlight/history?page=abc&limit=xyz')
        .set('Authorization', `Bearer ${adminToken()}`)
        .expect(200);

      expect(body.data.page).toBe(1);
      expect(body.data.limit).toBe(20);
    });

    it('200 — history items include org details', async () => {
      mockPrisma.$transaction.mockImplementation(() =>
        Promise.resolve([[makeHistoryItem()], 1]),
      );

      const { body } = await request(app.getHttpServer())
        .get('/spotlight/history')
        .set('Authorization', `Bearer ${adminToken()}`)
        .expect(200);

      const item = body.data.history[0];
      expect(item.org).toMatchObject({
        id: ORG_UUID,
        name: 'Save The Children Nigeria',
      });
      expect(item).toHaveProperty('wasAuto');
      expect(item).toHaveProperty('startAt');
      expect(item).toHaveProperty('endAt');
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // SERVICE UNIT — tick()
  // Tests the scheduler logic directly on the service, bypassing HTTP.
  // ═══════════════════════════════════════════════════════════════════════════

  describe('SpotlightService.tick()', () => {
    let service: SpotlightService;

    beforeAll(async () => {
      // Grab the service from the already-compiled module.
      // Re-use the same mockPrisma bound to the module.
      const mod = await Test.createTestingModule({
        providers: [
          SpotlightService,
          { provide: PrismaService, useValue: mockPrisma },
        ],
      }).compile();
      service = mod.get<SpotlightService>(SpotlightService);
    });

    it('does nothing when active entry has not yet expired', async () => {
      const futureEndAt = new Date(Date.now() + 60 * 60 * 1000); // 1hr from now
      mockPrisma.spotlightEntry.findFirst.mockResolvedValue(
        makeEntry({ endAt: futureEndAt }),
      );

      await service.tick();

      expect(mockPrisma.$transaction).not.toHaveBeenCalled();
    });

    it('archives expired entry and activates next queue item', async () => {
      const expiredEndAt = new Date(Date.now() - 1000); // 1 second ago
      const expiredEntry = makeEntry({ endAt: expiredEndAt, isActive: true });
      const nextEntry = makeQueueEntry(0, ORG_UUID_2);

      mockPrisma.spotlightEntry.findFirst
        .mockResolvedValueOnce(expiredEntry) // initial active check
        .mockResolvedValueOnce(nextEntry); // next pending check

      const txMock = {
        spotlightHistory: { create: jest.fn().mockResolvedValue({}) },
        spotlightEntry: { delete: jest.fn().mockResolvedValue({}) },
      };
      mockPrisma.$transaction.mockImplementationOnce((cb: any) => cb(txMock));

      mockPrisma.spotlightEntry.update.mockResolvedValue({});

      await service.tick();

      expect(txMock.spotlightHistory.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ orgId: expiredEntry.orgId }),
        }),
      );
      expect(mockPrisma.spotlightEntry.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: nextEntry.id },
          data: expect.objectContaining({ isActive: true }),
        }),
      );
    });

    it('archives expired entry and auto-selects random org when queue is empty', async () => {
      const expiredEndAt = new Date(Date.now() - 1000);
      const expiredEntry = makeEntry({ endAt: expiredEndAt, orgId: ORG_UUID });

      mockPrisma.spotlightEntry.findFirst
        .mockResolvedValueOnce(expiredEntry) // active entry
        .mockResolvedValueOnce(null); // no next pending entry due now

      const archiveTxMock = {
        spotlightHistory: { create: jest.fn().mockResolvedValue({}) },
        spotlightEntry: { delete: jest.fn().mockResolvedValue({}) },
      };
      mockPrisma.$transaction.mockImplementationOnce((cb: any) =>
        cb(archiveTxMock),
      );

      mockPrisma.spotlightEntry.count.mockResolvedValue(0); // no pending entries

      // pickRandomOrg internals
      mockPrisma.spotlightSettings.upsert.mockResolvedValue(makeSettings());
      mockPrisma.organization.count.mockResolvedValue(5);
      mockPrisma.organization.findMany.mockResolvedValue([{ id: ORG_UUID_2 }]);

      const autoTxMock = {
        spotlightEntry: { create: jest.fn().mockResolvedValue({}) },
        spotlightSettings: {
          upsert: jest.fn().mockResolvedValue(makeSettings({ mode: 'AUTO' })),
        },
      };
      mockPrisma.$transaction.mockImplementationOnce((cb: any) =>
        cb(autoTxMock),
      );

      await service.tick();

      expect(autoTxMock.spotlightEntry.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            orgId: ORG_UUID_2,
            isActive: true,
            wasAuto: true,
          }),
        }),
      );
      expect(autoTxMock.spotlightSettings.upsert).toHaveBeenCalledWith(
        expect.objectContaining({ update: { mode: 'AUTO' } }),
      );
    });

    it('does not repeat the same org when auto-selecting', async () => {
      const expiredEndAt = new Date(Date.now() - 1000);
      const expiredEntry = makeEntry({ endAt: expiredEndAt, orgId: ORG_UUID });

      mockPrisma.spotlightEntry.findFirst
        .mockResolvedValueOnce(expiredEntry)
        .mockResolvedValueOnce(null);

      const archiveTxMock = {
        spotlightHistory: { create: jest.fn().mockResolvedValue({}) },
        spotlightEntry: { delete: jest.fn().mockResolvedValue({}) },
      };
      mockPrisma.$transaction.mockImplementationOnce((cb: any) =>
        cb(archiveTxMock),
      );

      mockPrisma.spotlightEntry.count.mockResolvedValue(0);
      mockPrisma.spotlightSettings.upsert.mockResolvedValue(makeSettings());
      mockPrisma.organization.count.mockResolvedValue(3);
      mockPrisma.organization.findMany.mockResolvedValue([{ id: ORG_UUID_2 }]);

      const autoTxMock = {
        spotlightEntry: { create: jest.fn().mockResolvedValue({}) },
        spotlightSettings: { upsert: jest.fn().mockResolvedValue({}) },
      };
      mockPrisma.$transaction.mockImplementationOnce((cb: any) =>
        cb(autoTxMock),
      );

      await service.tick();

      // The pickRandomOrg call should have excluded ORG_UUID
      expect(mockPrisma.organization.count).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            id: { not: ORG_UUID },
          }),
        }),
      );
    });

    it('logs warning and does not crash when no eligible orgs exist', async () => {
      const expiredEndAt = new Date(Date.now() - 1000);
      const expiredEntry = makeEntry({ endAt: expiredEndAt });

      mockPrisma.spotlightEntry.findFirst
        .mockResolvedValueOnce(expiredEntry)
        .mockResolvedValueOnce(null);

      const archiveTxMock = {
        spotlightHistory: { create: jest.fn().mockResolvedValue({}) },
        spotlightEntry: { delete: jest.fn().mockResolvedValue({}) },
      };
      mockPrisma.$transaction.mockImplementationOnce((cb: any) =>
        cb(archiveTxMock),
      );

      mockPrisma.spotlightEntry.count.mockResolvedValue(0);
      mockPrisma.spotlightSettings.upsert.mockResolvedValue(makeSettings());
      mockPrisma.organization.count.mockResolvedValue(0); // no eligible orgs

      // Should not throw
      await expect(service.tick()).resolves.not.toThrow();
      expect(mockPrisma.$transaction).toHaveBeenCalledTimes(1); // only archive tx
    });

    it('bootstraps first spotlight on an empty system', async () => {
      // No active entry
      mockPrisma.spotlightEntry.findFirst
        .mockResolvedValueOnce(null) // no active
        .mockResolvedValueOnce(null); // no pending due now

      mockPrisma.spotlightSettings.upsert.mockResolvedValue(makeSettings());
      mockPrisma.organization.count.mockResolvedValue(2);
      mockPrisma.organization.findMany.mockResolvedValue([{ id: ORG_UUID }]);

      const bootstrapTxMock = {
        spotlightEntry: { create: jest.fn().mockResolvedValue({}) },
        spotlightSettings: {
          upsert: jest.fn().mockResolvedValue(makeSettings({ mode: 'AUTO' })),
        },
      };
      mockPrisma.$transaction.mockImplementation((cb: any) =>
        cb(bootstrapTxMock),
      );

      await service.tick();

      expect(bootstrapTxMock.spotlightEntry.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            orgId: ORG_UUID,
            isActive: true,
            wasAuto: true,
          }),
        }),
      );
    });
  });
});
