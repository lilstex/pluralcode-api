/* eslint-disable @typescript-eslint/no-unused-vars */
import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { JwtService, JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { ConfigModule, ConfigService } from '@nestjs/config';
import request from 'supertest';
import { Role } from '@prisma/client';

import { OrganizationController } from 'src/organizations/controller/organizations.controller';
import { OrganizationService } from 'src/organizations/service/organizations.service';
import { JwtStrategy } from 'src/common/strategies/jwt.strategy';
import { JwtAuthGuard } from 'src/common/guards/jwt-auth.guard';
import { RolesGuard } from 'src/common/guards/roles.guard';
import { PermissionsGuard } from 'src/common/guards/permissions.guard';
import { PrismaService } from 'src/prisma.service';
import { EmailService } from 'src/providers/email/email.service';
import { AzureBlobService } from 'src/providers/azure/azure.blob.service';

// ─────────────────────────────────────────────────────────────────────────────
// CONSTANTS
// ─────────────────────────────────────────────────────────────────────────────

const JWT_SECRET = 'test-secret-do-not-use-in-prod';
const VALID_UUID = 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11';
const ADMIN_UUID = 'b1ffcd00-0d1c-4ef8-bb6d-6bb9bd380a22';
const NGO_UUID = 'c2eebc99-9c0b-4ef8-bb6d-6bb9bd380a33';
const GUEST_UUID = 'd3eebc99-9c0b-4ef8-bb6d-6bb9bd380a44';
const MEMBER_UUID = 'e4eebc99-9c0b-4ef8-bb6d-6bb9bd380a55';
const ORG_UUID = 'f5eebc99-9c0b-4ef8-bb6d-6bb9bd380a66';

// ─────────────────────────────────────────────────────────────────────────────
// FIXTURES
// ─────────────────────────────────────────────────────────────────────────────

function makeOrg(overrides: Record<string, any> = {}): any {
  return {
    id: ORG_UUID,
    userId: NGO_UUID,
    name: 'Save The Children Nigeria',
    acronym: 'STCN',
    cacNumber: 'CAC/1234',
    phoneNumber: '+2348000000000',
    publicEmail: null,
    state: 'Lagos',
    lga: 'Ikeja',
    address: null,
    mission: null,
    vision: null,
    sectors: ['Health'],
    logoUrl: null,
    numberOfStaff: null,
    numberOfVolunteers: null,
    annualBudget: null,
    description: null,
    socials: [],
    otherLinks: [],
    activities: [],
    donors: [],
    assessments: [],
    members: [],
    user: {
      id: NGO_UUID,
      fullName: 'NGO Owner',
      email: 'ngo@example.com',
      avatarUrl: null,
      status: 'APPROVED',
    },
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

function makeDbUser(overrides: Record<string, any> = {}): any {
  return {
    id: VALID_UUID,
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
      permissions: ['org:read', 'org:update', 'org:delete', 'org:spotlight'],
    },
  });
}

function makeNgoUser(): any {
  return makeDbUser({
    id: NGO_UUID,
    email: 'ngo@example.com',
    role: Role.NGO_MEMBER,
    adminPermission: null,
  });
}

function makeGuestUser(): any {
  return makeDbUser({
    id: GUEST_UUID,
    email: 'guest@example.com',
    role: Role.GUEST,
    status: 'APPROVED',
  });
}

function makeMember(overrides: Record<string, any> = {}): any {
  return {
    id: MEMBER_UUID,
    organizationId: ORG_UUID,
    userId: GUEST_UUID,
    orgRole: 'member',
    status: 'active',
    invitedById: NGO_UUID,
    joinedAt: new Date(),
    updatedAt: new Date(),
    user: {
      id: GUEST_UUID,
      fullName: 'Guest User',
      email: 'guest@example.com',
      avatarUrl: null,
      phoneNumber: null,
    },
    organization: { userId: NGO_UUID },
    ...overrides,
  };
}

function makeActivity(overrides: Record<string, any> = {}): any {
  return {
    id: VALID_UUID,
    organizationId: ORG_UUID,
    sector: 'Health',
    who: 'Children',
    where: 'Lagos',
    when: 2024,
    activity: 'Vaccination drive',
    createdAt: new Date(),
    updatedAt: new Date(),
    organization: { userId: NGO_UUID },
    ...overrides,
  };
}

function makeDonor(overrides: Record<string, any> = {}): any {
  return {
    id: VALID_UUID,
    organizationId: ORG_UUID,
    donor: 'UNICEF',
    amount: '$50,000',
    duration: '12 months',
    createdAt: new Date(),
    updatedAt: new Date(),
    organization: { userId: NGO_UUID },
    ...overrides,
  };
}

function makeAssessment(overrides: Record<string, any> = {}): any {
  return {
    id: VALID_UUID,
    organizationId: ORG_UUID,
    assessmentBody: 'ISO 9001',
    month: 6,
    year: 2024,
    createdAt: new Date(),
    updatedAt: new Date(),
    organization: { userId: NGO_UUID },
    ...overrides,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// MOCK PRISMA
// ─────────────────────────────────────────────────────────────────────────────

const mockPrisma = {
  user: {
    findUnique: jest.fn(),
    create: jest.fn(),
  },
  organization: {
    findUnique: jest.fn(),
    findMany: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
    count: jest.fn(),
  },
  organizationMember: {
    findUnique: jest.fn(),
    findMany: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
  },
  organizationActivity: {
    findUnique: jest.fn(),
    findMany: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
  },
  organizationDonor: {
    findUnique: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
  },
  organizationAssessment: {
    findUnique: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
  },
  event: {
    findMany: jest.fn(),
  },
  auditLog: { create: jest.fn() },
  $transaction: jest.fn(),
};

const mockEmail = {
  sendVerificationOtp: jest.fn().mockResolvedValue(undefined),
  sendAdminApprovalNotification: jest.fn().mockResolvedValue(undefined),
};

const mockAzure = {
  upload: jest.fn().mockResolvedValue('https://blob.example.com/logo.png'),
  delete: jest.fn().mockResolvedValue(undefined),
};

// ─────────────────────────────────────────────────────────────────────────────
// JWT HELPERS
// ─────────────────────────────────────────────────────────────────────────────

let jwtService: JwtService;

const token = (sub: string, role: string) => () =>
  jwtService.sign({ sub, email: `${role}@example.com`, role });

// Tokens are functions so they're built lazily after jwtService is available
let adminToken: () => string;
let ngoToken: () => string;
let guestToken: () => string;

// ─────────────────────────────────────────────────────────────────────────────
// BOOTSTRAP
// ─────────────────────────────────────────────────────────────────────────────

describe('Organizations Module — E2E', () => {
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
      controllers: [OrganizationController],
      providers: [
        OrganizationService,
        JwtStrategy,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: EmailService, useValue: mockEmail },
        { provide: AzureBlobService, useValue: mockAzure },
        {
          provide: 'ConfigService',
          useValue: { get: () => JWT_SECRET },
        },
        // Real ConfigService for JwtStrategy
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
    // resetAllMocks wipes mockResolvedValue/mockImplementation state between tests,
    // preventing mock bleed-through (clearAllMocks only resets call counts).
    jest.resetAllMocks();
    // JwtStrategy.validate() calls prisma.user.findUnique — restore default routing
    mockPrisma.user.findUnique.mockImplementation(({ where }: any) => {
      if (where?.id === ADMIN_UUID) return Promise.resolve(makeAdminUser());
      if (where?.id === NGO_UUID) return Promise.resolve(makeNgoUser());
      if (where?.id === GUEST_UUID) return Promise.resolve(makeGuestUser());
      return Promise.resolve(null);
    });
    // Default $transaction: execute each item in the array (handles simple [query, query] calls)
    mockPrisma.$transaction.mockImplementation((arg: any) =>
      Array.isArray(arg) ? Promise.all(arg) : arg(mockPrisma),
    );
    // Restore fire-and-forget email mocks — sendVerificationOtp returns a Promise
    // so .catch() doesn't throw when resetAllMocks() strips the implementation.
    mockEmail.sendVerificationOtp.mockResolvedValue(undefined);
    mockEmail.sendAdminApprovalNotification.mockResolvedValue(undefined);
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // GET /organizations  — directory listing
  // ═══════════════════════════════════════════════════════════════════════════

  describe('GET /organizations', () => {
    beforeEach(() => {
      mockPrisma.$transaction.mockImplementation((q: any[]) => Promise.all(q));
      mockPrisma.organization.findMany.mockResolvedValue([makeOrg()]);
      mockPrisma.organization.count.mockResolvedValue(1);
    });

    it('200 — authenticated user can list orgs', async () => {
      const { body } = await request(app.getHttpServer())
        .get('/organizations')
        .set('Authorization', `Bearer ${guestToken()}`)
        .expect(200);

      expect(body.status).toBe(true);
      expect(body.data.organizations).toHaveLength(1);
    });

    it('200 — no params defaults safely (NaN regression check)', async () => {
      await request(app.getHttpServer())
        .get('/organizations')
        .set('Authorization', `Bearer ${guestToken()}`)
        .expect(200);

      expect(mockPrisma.organization.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ skip: 0, take: 20 }),
      );
      const call = mockPrisma.organization.findMany.mock.calls[0][0];
      expect(Number.isFinite(call.take)).toBe(true);
      expect(Number.isFinite(call.skip)).toBe(true);
    });

    it('200 — non-numeric page/limit falls back to defaults', async () => {
      await request(app.getHttpServer())
        .get('/organizations?page=abc&limit=xyz')
        .set('Authorization', `Bearer ${guestToken()}`)
        .expect(200);

      const call = mockPrisma.organization.findMany.mock.calls[0][0];
      expect(call.skip).toBe(0);
      expect(call.take).toBe(20);
    });

    it('200 — page=2 & limit=5 produces correct skip/take', async () => {
      await request(app.getHttpServer())
        .get('/organizations?page=2&limit=5')
        .set('Authorization', `Bearer ${guestToken()}`)
        .expect(200);

      expect(mockPrisma.organization.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ skip: 5, take: 5 }),
      );
    });

    it('200 — applies search filter across name, acronym, cacNumber', async () => {
      await request(app.getHttpServer())
        .get('/organizations?search=Save')
        .set('Authorization', `Bearer ${guestToken()}`)
        .expect(200);

      const call = mockPrisma.organization.findMany.mock.calls[0][0];
      expect(call.where.OR).toHaveLength(3);
    });

    it('200 — applies sector filter', async () => {
      await request(app.getHttpServer())
        .get('/organizations?sector=Health')
        .set('Authorization', `Bearer ${guestToken()}`)
        .expect(200);

      expect(mockPrisma.organization.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ sectors: { has: 'Health' } }),
        }),
      );
    });

    it('200 — applies state filter', async () => {
      await request(app.getHttpServer())
        .get('/organizations?state=Lagos')
        .set('Authorization', `Bearer ${guestToken()}`)
        .expect(200);

      expect(mockPrisma.organization.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            state: { contains: 'Lagos', mode: 'insensitive' },
          }),
        }),
      );
    });

    it('200 — returns correct pagination metadata', async () => {
      mockPrisma.organization.count.mockResolvedValue(30);

      const { body } = await request(app.getHttpServer())
        .get('/organizations?page=2&limit=10')
        .set('Authorization', `Bearer ${guestToken()}`)
        .expect(200);

      expect(body.data.total).toBe(30);
      expect(body.data.page).toBe(2);
      expect(body.data.limit).toBe(10);
      expect(body.data.pages).toBe(3);
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // GET /organizations/:id
  // ═══════════════════════════════════════════════════════════════════════════

  describe('GET /organizations/:id', () => {
    it('400 — non-UUID param rejected', async () => {
      await request(app.getHttpServer())
        .get('/organizations/not-a-uuid')
        .set('Authorization', `Bearer ${guestToken()}`)
        .expect(400);
    });

    it('404 — org not found', async () => {
      mockPrisma.organization.findUnique.mockResolvedValue(null);

      const { body } = await request(app.getHttpServer())
        .get(`/organizations/${VALID_UUID}`)
        .set('Authorization', `Bearer ${guestToken()}`)
        .expect(200);

      expect(body.status).toBe(false);
      expect(body.statusCode).toBe(404);
    });

    it('200 — returns full org profile', async () => {
      mockPrisma.organization.findUnique.mockResolvedValue(makeOrg());

      const { body } = await request(app.getHttpServer())
        .get(`/organizations/${VALID_UUID}`)
        .set('Authorization', `Bearer ${guestToken()}`)
        .expect(200);

      expect(body.status).toBe(true);
      expect(body.data.id).toBe(ORG_UUID);
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // GET /organizations/me/profile
  // ═══════════════════════════════════════════════════════════════════════════

  describe('GET /organizations/me/profile', () => {
    it('401 — no token', async () => {
      await request(app.getHttpServer())
        .get('/organizations/me/profile')
        .expect(401);
    });

    it('403 — GUEST role rejected by RolesGuard', async () => {
      await request(app.getHttpServer())
        .get('/organizations/me/profile')
        .set('Authorization', `Bearer ${guestToken()}`)
        .expect(403);
    });

    it('404 — NGO_MEMBER with no org', async () => {
      mockPrisma.organization.findUnique.mockResolvedValue(null);

      const { body } = await request(app.getHttpServer())
        .get('/organizations/me/profile')
        .set('Authorization', `Bearer ${ngoToken()}`)
        .expect(200);

      expect(body.status).toBe(false);
      expect(body.statusCode).toBe(404);
    });

    it('200 — NGO_MEMBER retrieves their org', async () => {
      mockPrisma.organization.findUnique.mockResolvedValue(makeOrg());

      const { body } = await request(app.getHttpServer())
        .get('/organizations/me/profile')
        .set('Authorization', `Bearer ${ngoToken()}`)
        .expect(200);

      expect(body.status).toBe(true);
      expect(body.data.cacNumber).toBe('CAC/1234');
    });

    it('200 — SUPER_ADMIN can also access this route', async () => {
      mockPrisma.organization.findUnique.mockResolvedValue(makeOrg());

      const { body } = await request(app.getHttpServer())
        .get('/organizations/me/profile')
        .set('Authorization', `Bearer ${adminToken()}`)
        .expect(200);

      expect(body.status).toBe(true);
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // PATCH /organizations/me/profile
  // ═══════════════════════════════════════════════════════════════════════════

  describe('PATCH /organizations/me/profile', () => {
    it('401 — no token', async () => {
      await request(app.getHttpServer())
        .patch('/organizations/me/profile')
        .send({ name: 'New' })
        .expect(401);
    });

    it('403 — GUEST role rejected', async () => {
      await request(app.getHttpServer())
        .patch('/organizations/me/profile')
        .set('Authorization', `Bearer ${guestToken()}`)
        .send({ name: 'New' })
        .expect(403);
    });

    it('404 — org not found for this user', async () => {
      mockPrisma.organization.findUnique.mockResolvedValue(null);

      const { body } = await request(app.getHttpServer())
        .patch('/organizations/me/profile')
        .set('Authorization', `Bearer ${ngoToken()}`)
        .send({ name: 'Updated Org Name' })
        .expect(200);

      expect(body.status).toBe(false);
      expect(body.statusCode).toBe(404);
    });

    it('200 — updates org profile fields', async () => {
      mockPrisma.organization.findUnique.mockResolvedValue(makeOrg());
      mockPrisma.organization.update.mockResolvedValue(
        makeOrg({ name: 'Updated Name', mission: 'New mission' }),
      );

      const { body } = await request(app.getHttpServer())
        .patch('/organizations/me/profile')
        .set('Authorization', `Bearer ${ngoToken()}`)
        .send({ name: 'Updated Name', mission: 'New mission' })
        .expect(200);

      expect(body.status).toBe(true);
      expect(mockPrisma.organization.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { userId: NGO_UUID },
          data: expect.objectContaining({
            name: 'Updated Name',
            mission: 'New mission',
          }),
        }),
      );
    });

    it('400 — invalid publicEmail format rejected by ValidationPipe', async () => {
      await request(app.getHttpServer())
        .patch('/organizations/me/profile')
        .set('Authorization', `Bearer ${ngoToken()}`)
        .send({ publicEmail: 'not-an-email' })
        .expect(400);
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // GET /organizations/me/members
  // ═══════════════════════════════════════════════════════════════════════════

  describe('GET /organizations/me/members', () => {
    it('401 — no token', async () => {
      await request(app.getHttpServer())
        .get('/organizations/me/members')
        .expect(401);
    });

    it('403 — GUEST rejected', async () => {
      await request(app.getHttpServer())
        .get('/organizations/me/members')
        .set('Authorization', `Bearer ${guestToken()}`)
        .expect(403);
    });

    it('404 — no org found for this NGO_MEMBER', async () => {
      mockPrisma.organization.findUnique.mockResolvedValue(null);

      const { body } = await request(app.getHttpServer())
        .get('/organizations/me/members')
        .set('Authorization', `Bearer ${ngoToken()}`)
        .expect(200);

      expect(body.status).toBe(false);
      expect(body.statusCode).toBe(404);
    });

    it('200 — returns active members list', async () => {
      mockPrisma.organization.findUnique.mockResolvedValue(makeOrg());
      mockPrisma.organizationMember.findMany.mockResolvedValue([makeMember()]);

      const { body } = await request(app.getHttpServer())
        .get('/organizations/me/members')
        .set('Authorization', `Bearer ${ngoToken()}`)
        .expect(200);

      expect(body.status).toBe(true);
      expect(body.data).toHaveLength(1);
      expect(body.data[0].orgRole).toBe('member');
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // POST /organizations/me/members
  // ═══════════════════════════════════════════════════════════════════════════

  describe('POST /organizations/me/members', () => {
    const validBody = { userId: GUEST_UUID, orgRole: 'member' };

    it('401 — no token', async () => {
      await request(app.getHttpServer())
        .post('/organizations/me/members')
        .send(validBody)
        .expect(401);
    });

    it('403 — GUEST rejected', async () => {
      await request(app.getHttpServer())
        .post('/organizations/me/members')
        .set('Authorization', `Bearer ${guestToken()}`)
        .send(validBody)
        .expect(403);
    });

    it('400 — missing required userId field', async () => {
      await request(app.getHttpServer())
        .post('/organizations/me/members')
        .set('Authorization', `Bearer ${ngoToken()}`)
        .send({ orgRole: 'member' })
        .expect(400);
    });

    it('404 — org not found for this owner', async () => {
      mockPrisma.organization.findUnique.mockResolvedValue(null);

      const { body } = await request(app.getHttpServer())
        .post('/organizations/me/members')
        .set('Authorization', `Bearer ${ngoToken()}`)
        .send(validBody)
        .expect(201);

      expect(body.status).toBe(false);
      expect(body.statusCode).toBe(404);
      expect(body.message).toMatch(/organization not found/i);
    });

    it('404 — target user not found', async () => {
      mockPrisma.organization.findUnique.mockResolvedValue(makeOrg());
      mockPrisma.user.findUnique.mockImplementation(({ where }: any) => {
        if (where?.id === NGO_UUID) return Promise.resolve(makeNgoUser());
        if (where?.id === GUEST_UUID) return Promise.resolve(null); // target not found
        return Promise.resolve(null);
      });

      const { body } = await request(app.getHttpServer())
        .post('/organizations/me/members')
        .set('Authorization', `Bearer ${ngoToken()}`)
        .send(validBody)
        .expect(201);

      expect(body.status).toBe(false);
      expect(body.statusCode).toBe(404);
      expect(body.message).toMatch(/user not found/i);
    });

    it('400 — target user has non-GUEST role', async () => {
      mockPrisma.organization.findUnique.mockResolvedValue(makeOrg());
      mockPrisma.user.findUnique.mockImplementation(({ where }: any) => {
        if (where?.id === NGO_UUID) return Promise.resolve(makeNgoUser());
        if (where?.id === GUEST_UUID)
          return Promise.resolve(makeDbUser({ role: Role.NGO_MEMBER }));
        return Promise.resolve(null);
      });

      const { body } = await request(app.getHttpServer())
        .post('/organizations/me/members')
        .set('Authorization', `Bearer ${ngoToken()}`)
        .send(validBody)
        .expect(201);

      expect(body.status).toBe(false);
      expect(body.statusCode).toBe(400);
      expect(body.message).toMatch(/guest role/i);
    });

    it('400 — target user not yet approved', async () => {
      mockPrisma.organization.findUnique.mockResolvedValue(makeOrg());
      mockPrisma.user.findUnique.mockImplementation(({ where }: any) => {
        if (where?.id === NGO_UUID) return Promise.resolve(makeNgoUser());
        if (where?.id === GUEST_UUID)
          return Promise.resolve(
            makeDbUser({
              id: GUEST_UUID,
              email: 'guest@example.com',
              role: Role.GUEST,
              status: 'PENDING',
            }),
          );
        return Promise.resolve(null);
      });

      const { body } = await request(app.getHttpServer())
        .post('/organizations/me/members')
        .set('Authorization', `Bearer ${ngoToken()}`)
        .send(validBody)
        .expect(201);

      expect(body.status).toBe(false);
      expect(body.statusCode).toBe(400);
      expect(body.message).toMatch(/approved/i);
    });

    it('409 — user is already an active member', async () => {
      mockPrisma.organization.findUnique.mockResolvedValue(makeOrg());
      mockPrisma.user.findUnique.mockImplementation(({ where }: any) => {
        if (where?.id === NGO_UUID) return Promise.resolve(makeNgoUser());
        if (where?.id === GUEST_UUID) return Promise.resolve(makeGuestUser());
        return Promise.resolve(null);
      });
      mockPrisma.organizationMember.findUnique.mockResolvedValue(
        makeMember({ status: 'active' }),
      );

      const { body } = await request(app.getHttpServer())
        .post('/organizations/me/members')
        .set('Authorization', `Bearer ${ngoToken()}`)
        .send(validBody)
        .expect(201);

      expect(body.status).toBe(false);
      expect(body.statusCode).toBe(409);
    });

    it('200 — re-activates a previously removed membership', async () => {
      mockPrisma.organization.findUnique.mockResolvedValue(makeOrg());
      mockPrisma.user.findUnique.mockImplementation(({ where }: any) => {
        if (where?.id === NGO_UUID) return Promise.resolve(makeNgoUser());
        if (where?.id === GUEST_UUID) return Promise.resolve(makeGuestUser());
        return Promise.resolve(null);
      });
      mockPrisma.organizationMember.findUnique.mockResolvedValue(
        makeMember({ status: 'removed' }),
      );
      mockPrisma.organizationMember.update.mockResolvedValue(
        makeMember({ status: 'active' }),
      );

      const { body } = await request(app.getHttpServer())
        .post('/organizations/me/members')
        .set('Authorization', `Bearer ${ngoToken()}`)
        .send(validBody)
        .expect(201);

      expect(body.status).toBe(true);
      expect(body.statusCode).toBe(200);
      expect(body.message).toMatch(/re-activated/i);
    });

    it('201 — adds a new member successfully', async () => {
      mockPrisma.organization.findUnique.mockResolvedValue(makeOrg());
      mockPrisma.user.findUnique.mockImplementation(({ where }: any) => {
        if (where?.id === NGO_UUID) return Promise.resolve(makeNgoUser());
        if (where?.id === GUEST_UUID) return Promise.resolve(makeGuestUser());
        return Promise.resolve(null);
      });
      mockPrisma.organizationMember.findUnique.mockResolvedValue(null); // no existing
      mockPrisma.organizationMember.create.mockResolvedValue(makeMember());

      const { body } = await request(app.getHttpServer())
        .post('/organizations/me/members')
        .set('Authorization', `Bearer ${ngoToken()}`)
        .send(validBody)
        .expect(201);

      expect(body.status).toBe(true);
      expect(body.statusCode).toBe(201);
      expect(body.data.orgRole).toBe('member');
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // POST /organizations/me/members/invite
  // ═══════════════════════════════════════════════════════════════════════════

  describe('POST /organizations/me/members/invite', () => {
    const validBody = {
      email: 'newguest@example.com',
      fullName: 'New Guest',
      orgRole: 'member',
    };

    it('401 — no token', async () => {
      await request(app.getHttpServer())
        .post('/organizations/me/members/invite')
        .send(validBody)
        .expect(401);
    });

    it('403 — GUEST rejected', async () => {
      await request(app.getHttpServer())
        .post('/organizations/me/members/invite')
        .set('Authorization', `Bearer ${guestToken()}`)
        .send(validBody)
        .expect(403);
    });

    it('400 — missing required fields', async () => {
      await request(app.getHttpServer())
        .post('/organizations/me/members/invite')
        .set('Authorization', `Bearer ${ngoToken()}`)
        .send({ orgRole: 'member' }) // missing email and fullName
        .expect(400);
    });

    it('400 — invalid email format', async () => {
      await request(app.getHttpServer())
        .post('/organizations/me/members/invite')
        .set('Authorization', `Bearer ${ngoToken()}`)
        .send({ email: 'not-an-email', fullName: 'Test' })
        .expect(400);
    });

    it('404 — org not found', async () => {
      mockPrisma.organization.findUnique.mockResolvedValue(null);

      const { body } = await request(app.getHttpServer())
        .post('/organizations/me/members/invite')
        .set('Authorization', `Bearer ${ngoToken()}`)
        .send(validBody)
        .expect(201);

      expect(body.status).toBe(false);
      expect(body.statusCode).toBe(404);
    });

    it('409 — email already registered', async () => {
      mockPrisma.organization.findUnique.mockResolvedValue(makeOrg());
      mockPrisma.user.findUnique.mockImplementation(({ where }: any) => {
        if (where?.id === NGO_UUID) return Promise.resolve(makeNgoUser());
        if (where?.email === validBody.email)
          return Promise.resolve(makeGuestUser()); // already exists
        return Promise.resolve(null);
      });

      const { body } = await request(app.getHttpServer())
        .post('/organizations/me/members/invite')
        .set('Authorization', `Bearer ${ngoToken()}`)
        .send(validBody)
        .expect(201);

      expect(body.status).toBe(false);
      expect(body.statusCode).toBe(409);
      expect(body.message).toMatch(/already exists/i);
    });

    it('201 — creates user, adds member, and sends OTP email', async () => {
      mockPrisma.organization.findUnique.mockResolvedValue(makeOrg());
      mockPrisma.user.findUnique.mockImplementation(({ where }: any) => {
        if (where?.id === NGO_UUID) return Promise.resolve(makeNgoUser());
        return Promise.resolve(null); // new email not found
      });

      const newUser = makeDbUser({
        id: 'new-user-id',
        email: validBody.email,
        fullName: validBody.fullName,
      });
      const newMember = makeMember({ userId: 'new-user-id' });

      mockPrisma.$transaction.mockImplementation(async (cb: any) =>
        cb({
          user: { create: jest.fn().mockResolvedValue(newUser) },
          organizationMember: {
            create: jest.fn().mockResolvedValue(newMember),
          },
        }),
      );

      const { body } = await request(app.getHttpServer())
        .post('/organizations/me/members/invite')
        .set('Authorization', `Bearer ${ngoToken()}`)
        .send(validBody)
        .expect(201);

      expect(body.status).toBe(true);
      expect(body.statusCode).toBe(201);
      expect(body.message).toMatch(/verification email/i);

      await new Promise((r) => setTimeout(r, 50)); // flush fire-and-forget
      expect(mockEmail.sendVerificationOtp).toHaveBeenCalledWith(
        expect.objectContaining({ email: validBody.email }),
      );
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // PATCH /organizations/me/members/:memberId
  // ═══════════════════════════════════════════════════════════════════════════

  describe('PATCH /organizations/me/members/:memberId', () => {
    it('401 — no token', async () => {
      await request(app.getHttpServer())
        .patch(`/organizations/me/members/${MEMBER_UUID}`)
        .send({ orgRole: 'admin' })
        .expect(401);
    });

    it('400 — non-UUID memberId', async () => {
      await request(app.getHttpServer())
        .patch('/organizations/me/members/not-a-uuid')
        .set('Authorization', `Bearer ${ngoToken()}`)
        .send({ orgRole: 'admin' })
        .expect(400);
    });

    it('400 — missing orgRole field', async () => {
      await request(app.getHttpServer())
        .patch(`/organizations/me/members/${MEMBER_UUID}`)
        .set('Authorization', `Bearer ${ngoToken()}`)
        .send({})
        .expect(400);
    });

    it('404 — member not found or not owned by this NGO_MEMBER', async () => {
      mockPrisma.organizationMember.findUnique.mockResolvedValue(null);

      const { body } = await request(app.getHttpServer())
        .patch(`/organizations/me/members/${MEMBER_UUID}`)
        .set('Authorization', `Bearer ${ngoToken()}`)
        .send({ orgRole: 'admin' })
        .expect(200);

      expect(body.status).toBe(false);
      expect(body.statusCode).toBe(404);
    });

    it('200 — updates member role', async () => {
      mockPrisma.organizationMember.findUnique.mockResolvedValue(makeMember());
      mockPrisma.organizationMember.update.mockResolvedValue(
        makeMember({ orgRole: 'admin' }),
      );

      const { body } = await request(app.getHttpServer())
        .patch(`/organizations/me/members/${MEMBER_UUID}`)
        .set('Authorization', `Bearer ${ngoToken()}`)
        .send({ orgRole: 'admin' })
        .expect(200);

      expect(body.status).toBe(true);
      expect(mockPrisma.organizationMember.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: { orgRole: 'admin' } }),
      );
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // DELETE /organizations/me/members/:memberId
  // ═══════════════════════════════════════════════════════════════════════════

  describe('DELETE /organizations/me/members/:memberId', () => {
    it('401 — no token', async () => {
      await request(app.getHttpServer())
        .delete(`/organizations/me/members/${MEMBER_UUID}`)
        .expect(401);
    });

    it('400 — non-UUID memberId', async () => {
      await request(app.getHttpServer())
        .delete('/organizations/me/members/bad-id')
        .set('Authorization', `Bearer ${ngoToken()}`)
        .expect(400);
    });

    it('404 — member not found', async () => {
      mockPrisma.organizationMember.findUnique.mockResolvedValue(null);

      const { body } = await request(app.getHttpServer())
        .delete(`/organizations/me/members/${MEMBER_UUID}`)
        .set('Authorization', `Bearer ${ngoToken()}`)
        .expect(200);

      expect(body.status).toBe(false);
      expect(body.statusCode).toBe(404);
    });

    it('200 — soft-removes member (status = removed)', async () => {
      mockPrisma.organizationMember.findUnique.mockResolvedValue(makeMember());
      mockPrisma.organizationMember.update.mockResolvedValue({});

      const { body } = await request(app.getHttpServer())
        .delete(`/organizations/me/members/${MEMBER_UUID}`)
        .set('Authorization', `Bearer ${ngoToken()}`)
        .expect(200);

      expect(body.status).toBe(true);
      expect(mockPrisma.organizationMember.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: { status: 'removed' } }),
      );
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // GET /organizations/my-memberships
  // ═══════════════════════════════════════════════════════════════════════════

  describe('GET /organizations/my-memberships', () => {
    it('401 — no token', async () => {
      await request(app.getHttpServer())
        .get('/organizations/my-memberships')
        .expect(401);
    });

    it('200 — returns active memberships for authenticated user', async () => {
      const membership = {
        ...makeMember(),
        organization: {
          id: ORG_UUID,
          name: 'Save The Children',
          acronym: 'STCN',
          logoUrl: null,
          state: 'Lagos',
          lga: 'Ikeja',
          sectors: [],
          mission: null,
        },
      };
      mockPrisma.organizationMember.findMany.mockResolvedValue([membership]);

      const { body } = await request(app.getHttpServer())
        .get('/organizations/my-memberships')
        .set('Authorization', `Bearer ${guestToken()}`)
        .expect(200);

      expect(body.status).toBe(true);
      expect(body.data).toHaveLength(1);
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // DELETE /organizations/my-memberships/:organizationId
  // ═══════════════════════════════════════════════════════════════════════════

  describe('DELETE /organizations/my-memberships/:organizationId', () => {
    it('401 — no token', async () => {
      await request(app.getHttpServer())
        .delete(`/organizations/my-memberships/${ORG_UUID}`)
        .expect(401);
    });

    it('400 — non-UUID organizationId', async () => {
      await request(app.getHttpServer())
        .delete('/organizations/my-memberships/not-a-uuid')
        .set('Authorization', `Bearer ${guestToken()}`)
        .expect(400);
    });

    it('404 — no active membership found', async () => {
      mockPrisma.organizationMember.findUnique.mockResolvedValue(null);

      const { body } = await request(app.getHttpServer())
        .delete(`/organizations/my-memberships/${ORG_UUID}`)
        .set('Authorization', `Bearer ${guestToken()}`)
        .expect(200);

      expect(body.status).toBe(false);
      expect(body.statusCode).toBe(404);
      expect(body.message).toMatch(/active membership not found/i);
    });

    it('404 — membership exists but is not active', async () => {
      mockPrisma.organizationMember.findUnique.mockResolvedValue(
        makeMember({ status: 'removed' }),
      );

      const { body } = await request(app.getHttpServer())
        .delete(`/organizations/my-memberships/${ORG_UUID}`)
        .set('Authorization', `Bearer ${guestToken()}`)
        .expect(200);

      expect(body.status).toBe(false);
      expect(body.statusCode).toBe(404);
    });

    it('200 — user leaves organization successfully', async () => {
      mockPrisma.organizationMember.findUnique.mockResolvedValue(
        makeMember({ status: 'active' }),
      );
      mockPrisma.organizationMember.update.mockResolvedValue({});

      const { body } = await request(app.getHttpServer())
        .delete(`/organizations/my-memberships/${ORG_UUID}`)
        .set('Authorization', `Bearer ${guestToken()}`)
        .expect(200);

      expect(body.status).toBe(true);
      expect(body.message).toMatch(/left the organization/i);
      expect(mockPrisma.organizationMember.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: { status: 'removed' } }),
      );
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // POST /organizations/me/activities
  // ═══════════════════════════════════════════════════════════════════════════

  describe('POST /organizations/me/activities', () => {
    const validBody = {
      sector: 'Health',
      who: 'Children under 5',
      where: 'Lagos',
      when: 2024,
      activity: 'Vaccination drive',
    };

    it('401 — no token', async () => {
      await request(app.getHttpServer())
        .post('/organizations/me/activities')
        .send(validBody)
        .expect(401);
    });

    it('403 — GUEST rejected', async () => {
      await request(app.getHttpServer())
        .post('/organizations/me/activities')
        .set('Authorization', `Bearer ${guestToken()}`)
        .send(validBody)
        .expect(403);
    });

    it('400 — missing required fields', async () => {
      await request(app.getHttpServer())
        .post('/organizations/me/activities')
        .set('Authorization', `Bearer ${ngoToken()}`)
        .send({ sector: 'Health' }) // missing who, where, when, activity
        .expect(400);
    });

    it('404 — org not found', async () => {
      mockPrisma.organization.findUnique.mockResolvedValue(null);

      const { body } = await request(app.getHttpServer())
        .post('/organizations/me/activities')
        .set('Authorization', `Bearer ${ngoToken()}`)
        .send(validBody)
        .expect(201);

      expect(body.status).toBe(false);
      expect(body.statusCode).toBe(404);
    });

    it('201 — adds activity to organization', async () => {
      mockPrisma.organization.findUnique.mockResolvedValue(makeOrg());
      mockPrisma.organizationActivity.create.mockResolvedValue(makeActivity());

      const { body } = await request(app.getHttpServer())
        .post('/organizations/me/activities')
        .set('Authorization', `Bearer ${ngoToken()}`)
        .send(validBody)
        .expect(201);

      expect(body.status).toBe(true);
      expect(body.statusCode).toBe(201);
      expect(body.data.sector).toBe('Health');
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // PATCH /organizations/me/activities/:id
  // ═══════════════════════════════════════════════════════════════════════════

  describe('PATCH /organizations/me/activities/:id', () => {
    it('401 — no token', async () => {
      await request(app.getHttpServer())
        .patch(`/organizations/me/activities/${VALID_UUID}`)
        .send({})
        .expect(401);
    });

    it('400 — non-UUID id', async () => {
      await request(app.getHttpServer())
        .patch('/organizations/me/activities/bad-id')
        .set('Authorization', `Bearer ${ngoToken()}`)
        .send({ sector: 'Education' })
        .expect(400);
    });

    it('404 — activity not found or not owned by this user', async () => {
      mockPrisma.organizationActivity.findUnique.mockResolvedValue(null);

      const { body } = await request(app.getHttpServer())
        .patch(`/organizations/me/activities/${VALID_UUID}`)
        .set('Authorization', `Bearer ${ngoToken()}`)
        .send({ sector: 'Education' })
        .expect(200);

      expect(body.status).toBe(false);
      expect(body.statusCode).toBe(404);
    });

    it('200 — updates activity', async () => {
      mockPrisma.organizationActivity.findUnique.mockResolvedValue(
        makeActivity(),
      );
      mockPrisma.organizationActivity.update.mockResolvedValue(
        makeActivity({ sector: 'Education' }),
      );

      const { body } = await request(app.getHttpServer())
        .patch(`/organizations/me/activities/${VALID_UUID}`)
        .set('Authorization', `Bearer ${ngoToken()}`)
        .send({ sector: 'Education' })
        .expect(200);

      expect(body.status).toBe(true);
      expect(body.data.sector).toBe('Education');
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // DELETE /organizations/me/activities/:id
  // ═══════════════════════════════════════════════════════════════════════════

  describe('DELETE /organizations/me/activities/:id', () => {
    it('401 — no token', async () => {
      await request(app.getHttpServer())
        .delete(`/organizations/me/activities/${VALID_UUID}`)
        .expect(401);
    });

    it('404 — activity not found', async () => {
      mockPrisma.organizationActivity.findUnique.mockResolvedValue(null);

      const { body } = await request(app.getHttpServer())
        .delete(`/organizations/me/activities/${VALID_UUID}`)
        .set('Authorization', `Bearer ${ngoToken()}`)
        .expect(200);

      expect(body.status).toBe(false);
      expect(body.statusCode).toBe(404);
    });

    it('200 — deletes activity', async () => {
      mockPrisma.organizationActivity.findUnique.mockResolvedValue(
        makeActivity(),
      );
      mockPrisma.organizationActivity.delete.mockResolvedValue({});

      const { body } = await request(app.getHttpServer())
        .delete(`/organizations/me/activities/${VALID_UUID}`)
        .set('Authorization', `Bearer ${ngoToken()}`)
        .expect(200);

      expect(body.status).toBe(true);
      expect(body.message).toMatch(/deleted/i);
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // POST /organizations/me/donors
  // ═══════════════════════════════════════════════════════════════════════════

  describe('POST /organizations/me/donors', () => {
    const validBody = {
      donor: 'UNICEF',
      amount: '$50,000',
      duration: '12 months',
    };

    it('401 — no token', async () => {
      await request(app.getHttpServer())
        .post('/organizations/me/donors')
        .send(validBody)
        .expect(401);
    });

    it('400 — missing required fields', async () => {
      await request(app.getHttpServer())
        .post('/organizations/me/donors')
        .set('Authorization', `Bearer ${ngoToken()}`)
        .send({ donor: 'UNICEF' }) // missing amount, duration
        .expect(400);
    });

    it('404 — org not found', async () => {
      mockPrisma.organization.findUnique.mockResolvedValue(null);

      const { body } = await request(app.getHttpServer())
        .post('/organizations/me/donors')
        .set('Authorization', `Bearer ${ngoToken()}`)
        .send(validBody)
        .expect(201);

      expect(body.status).toBe(false);
      expect(body.statusCode).toBe(404);
    });

    it('201 — adds donor record', async () => {
      mockPrisma.organization.findUnique.mockResolvedValue(makeOrg());
      mockPrisma.organizationDonor.create.mockResolvedValue(makeDonor());

      const { body } = await request(app.getHttpServer())
        .post('/organizations/me/donors')
        .set('Authorization', `Bearer ${ngoToken()}`)
        .send(validBody)
        .expect(201);

      expect(body.status).toBe(true);
      expect(body.data.donor).toBe('UNICEF');
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // PATCH /organizations/me/donors/:id
  // ═══════════════════════════════════════════════════════════════════════════

  describe('PATCH /organizations/me/donors/:id', () => {
    it('404 — donor not found', async () => {
      mockPrisma.organizationDonor.findUnique.mockResolvedValue(null);

      const { body } = await request(app.getHttpServer())
        .patch(`/organizations/me/donors/${VALID_UUID}`)
        .set('Authorization', `Bearer ${ngoToken()}`)
        .send({ donor: 'WHO' })
        .expect(200);

      expect(body.status).toBe(false);
      expect(body.statusCode).toBe(404);
    });

    it('200 — updates donor record', async () => {
      mockPrisma.organizationDonor.findUnique.mockResolvedValue(makeDonor());
      mockPrisma.organizationDonor.update.mockResolvedValue(
        makeDonor({ donor: 'WHO' }),
      );

      const { body } = await request(app.getHttpServer())
        .patch(`/organizations/me/donors/${VALID_UUID}`)
        .set('Authorization', `Bearer ${ngoToken()}`)
        .send({ donor: 'WHO' })
        .expect(200);

      expect(body.status).toBe(true);
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // DELETE /organizations/me/donors/:id
  // ═══════════════════════════════════════════════════════════════════════════

  describe('DELETE /organizations/me/donors/:id', () => {
    it('404 — donor not found', async () => {
      mockPrisma.organizationDonor.findUnique.mockResolvedValue(null);

      const { body } = await request(app.getHttpServer())
        .delete(`/organizations/me/donors/${VALID_UUID}`)
        .set('Authorization', `Bearer ${ngoToken()}`)
        .expect(200);

      expect(body.status).toBe(false);
      expect(body.statusCode).toBe(404);
    });

    it('200 — deletes donor record', async () => {
      mockPrisma.organizationDonor.findUnique.mockResolvedValue(makeDonor());
      mockPrisma.organizationDonor.delete.mockResolvedValue({});

      const { body } = await request(app.getHttpServer())
        .delete(`/organizations/me/donors/${VALID_UUID}`)
        .set('Authorization', `Bearer ${ngoToken()}`)
        .expect(200);

      expect(body.status).toBe(true);
      expect(body.message).toMatch(/deleted/i);
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // POST /organizations/me/assessments
  // ═══════════════════════════════════════════════════════════════════════════

  describe('POST /organizations/me/assessments', () => {
    const validBody = { assessmentBody: 'ISO 9001', month: 6, year: 2024 };

    it('401 — no token', async () => {
      await request(app.getHttpServer())
        .post('/organizations/me/assessments')
        .send(validBody)
        .expect(401);
    });

    it('400 — missing required fields', async () => {
      await request(app.getHttpServer())
        .post('/organizations/me/assessments')
        .set('Authorization', `Bearer ${ngoToken()}`)
        .send({ assessmentBody: 'ISO 9001' }) // missing month, year
        .expect(400);
    });

    it('404 — org not found', async () => {
      mockPrisma.organization.findUnique.mockResolvedValue(null);

      const { body } = await request(app.getHttpServer())
        .post('/organizations/me/assessments')
        .set('Authorization', `Bearer ${ngoToken()}`)
        .send(validBody)
        .expect(201);

      expect(body.status).toBe(false);
      expect(body.statusCode).toBe(404);
    });

    it('201 — adds assessment record', async () => {
      mockPrisma.organization.findUnique.mockResolvedValue(makeOrg());
      mockPrisma.organizationAssessment.create.mockResolvedValue(
        makeAssessment(),
      );

      const { body } = await request(app.getHttpServer())
        .post('/organizations/me/assessments')
        .set('Authorization', `Bearer ${ngoToken()}`)
        .send(validBody)
        .expect(201);

      expect(body.status).toBe(true);
      expect(body.data.assessmentBody).toBe('ISO 9001');
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // PATCH /organizations/me/assessments/:id
  // ═══════════════════════════════════════════════════════════════════════════

  describe('PATCH /organizations/me/assessments/:id', () => {
    it('404 — assessment not found', async () => {
      mockPrisma.organizationAssessment.findUnique.mockResolvedValue(null);

      const { body } = await request(app.getHttpServer())
        .patch(`/organizations/me/assessments/${VALID_UUID}`)
        .set('Authorization', `Bearer ${ngoToken()}`)
        .send({ assessmentBody: 'Updated' })
        .expect(200);

      expect(body.status).toBe(false);
      expect(body.statusCode).toBe(404);
    });

    it('200 — updates assessment', async () => {
      mockPrisma.organizationAssessment.findUnique.mockResolvedValue(
        makeAssessment(),
      );
      mockPrisma.organizationAssessment.update.mockResolvedValue(
        makeAssessment({ assessmentBody: 'Updated' }),
      );

      const { body } = await request(app.getHttpServer())
        .patch(`/organizations/me/assessments/${VALID_UUID}`)
        .set('Authorization', `Bearer ${ngoToken()}`)
        .send({ assessmentBody: 'Updated' })
        .expect(200);

      expect(body.status).toBe(true);
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // DELETE /organizations/me/assessments/:id
  // ═══════════════════════════════════════════════════════════════════════════

  describe('DELETE /organizations/me/assessments/:id', () => {
    it('404 — assessment not found', async () => {
      mockPrisma.organizationAssessment.findUnique.mockResolvedValue(null);

      const { body } = await request(app.getHttpServer())
        .delete(`/organizations/me/assessments/${VALID_UUID}`)
        .set('Authorization', `Bearer ${ngoToken()}`)
        .expect(200);

      expect(body.status).toBe(false);
      expect(body.statusCode).toBe(404);
    });

    it('200 — deletes assessment', async () => {
      mockPrisma.organizationAssessment.findUnique.mockResolvedValue(
        makeAssessment(),
      );
      mockPrisma.organizationAssessment.delete.mockResolvedValue({});

      const { body } = await request(app.getHttpServer())
        .delete(`/organizations/me/assessments/${VALID_UUID}`)
        .set('Authorization', `Bearer ${ngoToken()}`)
        .expect(200);

      expect(body.status).toBe(true);
      expect(body.message).toMatch(/deleted/i);
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // PATCH /organizations/:id  (SUPER_ADMIN)
  // ═══════════════════════════════════════════════════════════════════════════

  describe('PATCH /organizations/:id (admin)', () => {
    it('401 — no token', async () => {
      await request(app.getHttpServer())
        .patch(`/organizations/${ORG_UUID}`)
        .send({ name: 'New' })
        .expect(401);
    });

    it('403 — NGO_MEMBER rejected', async () => {
      await request(app.getHttpServer())
        .patch(`/organizations/${ORG_UUID}`)
        .set('Authorization', `Bearer ${ngoToken()}`)
        .send({ name: 'New' })
        .expect(403);
    });

    it('400 — non-UUID org id', async () => {
      await request(app.getHttpServer())
        .patch('/organizations/not-a-uuid')
        .set('Authorization', `Bearer ${adminToken()}`)
        .send({ name: 'New' })
        .expect(400);
    });

    it('404 — org not found', async () => {
      mockPrisma.organization.findUnique.mockResolvedValue(null);

      const { body } = await request(app.getHttpServer())
        .patch(`/organizations/${ORG_UUID}`)
        .set('Authorization', `Bearer ${adminToken()}`)
        .send({ name: 'New Name' })
        .expect(200);

      expect(body.status).toBe(false);
      expect(body.statusCode).toBe(404);
    });

    it('200 — admin updates org and creates audit log', async () => {
      mockPrisma.organization.findUnique.mockResolvedValue(makeOrg());
      mockPrisma.organization.update.mockResolvedValue(
        makeOrg({ name: 'New Name' }),
      );
      mockPrisma.auditLog.create.mockResolvedValue({});

      const { body } = await request(app.getHttpServer())
        .patch(`/organizations/${ORG_UUID}`)
        .set('Authorization', `Bearer ${adminToken()}`)
        .send({ name: 'New Name' })
        .expect(200);

      expect(body.status).toBe(true);
      expect(mockPrisma.auditLog.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            action: 'ORG_UPDATED',
            entity: 'Organization',
          }),
        }),
      );
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // DELETE /organizations/:id  (SUPER_ADMIN)
  // ═══════════════════════════════════════════════════════════════════════════

  describe('DELETE /organizations/:id (admin)', () => {
    it('401 — no token', async () => {
      await request(app.getHttpServer())
        .delete(`/organizations/${ORG_UUID}`)
        .expect(401);
    });

    it('403 — NGO_MEMBER rejected', async () => {
      await request(app.getHttpServer())
        .delete(`/organizations/${ORG_UUID}`)
        .set('Authorization', `Bearer ${ngoToken()}`)
        .expect(403);
    });

    it('400 — non-UUID org id', async () => {
      await request(app.getHttpServer())
        .delete('/organizations/not-a-uuid')
        .set('Authorization', `Bearer ${adminToken()}`)
        .expect(400);
    });

    it('404 — org not found', async () => {
      mockPrisma.organization.findUnique.mockResolvedValue(null);

      const { body } = await request(app.getHttpServer())
        .delete(`/organizations/${ORG_UUID}`)
        .set('Authorization', `Bearer ${adminToken()}`)
        .expect(200);

      expect(body.status).toBe(false);
      expect(body.statusCode).toBe(404);
    });

    it('200 — deletes existing logo from blob before deleting org', async () => {
      mockPrisma.organization.findUnique.mockResolvedValue(
        makeOrg({ logoUrl: 'https://blob.example.com/logo.png' }),
      );
      mockPrisma.$transaction.mockImplementation((q: any[]) => Promise.all(q));
      mockPrisma.organization.delete.mockResolvedValue({});
      mockPrisma.auditLog.create.mockResolvedValue({});

      await request(app.getHttpServer())
        .delete(`/organizations/${ORG_UUID}`)
        .set('Authorization', `Bearer ${adminToken()}`)
        .expect(200);

      expect(mockAzure.delete).toHaveBeenCalledWith(
        'https://blob.example.com/logo.png',
        'avatars',
      );
    });

    it('200 — deletes org without logo upload call when no logoUrl', async () => {
      mockPrisma.organization.findUnique.mockResolvedValue(
        makeOrg({ logoUrl: null }),
      );
      mockPrisma.$transaction.mockImplementation((q: any[]) => Promise.all(q));
      mockPrisma.organization.delete.mockResolvedValue({});
      mockPrisma.auditLog.create.mockResolvedValue({});

      const { body } = await request(app.getHttpServer())
        .delete(`/organizations/${ORG_UUID}`)
        .set('Authorization', `Bearer ${adminToken()}`)
        .expect(200);

      expect(body.status).toBe(true);
      expect(mockAzure.delete).not.toHaveBeenCalled();
      expect(body.message).toMatch(/deleted successfully/i);
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // GET /organizations/me/dashboard
  // ═══════════════════════════════════════════════════════════════════════════

  describe('GET /organizations/me/dashboard', () => {
    // Minimal org fixture that includes _count + user.badges shape returned
    // by the include query in getDashboard()
    function makeDashboardOrg(overrides: Record<string, any> = {}): any {
      return {
        ...makeOrg(),
        // Filled-in optional fields so we get a predictable completion score
        acronym: 'STCN',
        publicEmail: 'info@stcn.org',
        address: '12 NGO Way',
        description: 'We exist to save children',
        logoUrl: 'https://blob.example.com/logo.png',
        mission: 'Save every child',
        vision: 'A better world',
        numberOfStaff: 45,
        numberOfVolunteers: 120,
        annualBudget: '₦50m',
        sectors: ['Health', 'Education'],
        socials: [{ platform: 'facebook', url: 'https://fb.com/stcn' }],
        _count: { activities: 7, odaAssessments: 2 },
        user: { pointsCount: 150, badges: [{ id: 'b1' }, { id: 'b2' }] },
        ...overrides,
      };
    }

    function makeUpcomingEvent(overrides: Record<string, any> = {}): any {
      return {
        id: 'evt-' + Math.random().toString(36).slice(2),
        title: 'NGO Leadership Summit',
        description: 'Annual summit for NGO leaders.',
        startTime: new Date(Date.now() + 86_400_000), // tomorrow
        endTime: new Date(Date.now() + 2 * 86_400_000),
        coverImageUrl: null,
        externalMeetingUrl: null,
        capacity: 200,
        tags: ['Leadership'],
        ...overrides,
      };
    }

    function makeRecentActivity(overrides: Record<string, any> = {}): any {
      return {
        id: 'act-' + Math.random().toString(36).slice(2),
        sector: 'Health',
        who: 'Children under 5',
        where: 'Lagos',
        when: 2024,
        activity: 'Vaccination drive',
        createdAt: new Date(),
        ...overrides,
      };
    }

    beforeEach(() => {
      // Default happy-path mocks for dashboard tests
      mockPrisma.organization.findUnique.mockResolvedValue(makeDashboardOrg());
      mockPrisma.event.findMany.mockResolvedValue([makeUpcomingEvent()]);
      mockPrisma.organizationActivity.findMany.mockResolvedValue([
        makeRecentActivity(),
      ]);
    });

    it('401 — no token', async () => {
      await request(app.getHttpServer())
        .get('/organizations/me/dashboard')
        .expect(401);
    });

    it('403 — GUEST role rejected', async () => {
      await request(app.getHttpServer())
        .get('/organizations/me/dashboard')
        .set('Authorization', `Bearer ${guestToken()}`)
        .expect(403);
    });

    it('404 — NGO_MEMBER with no organization', async () => {
      mockPrisma.organization.findUnique.mockResolvedValue(null);

      const { body } = await request(app.getHttpServer())
        .get('/organizations/me/dashboard')
        .set('Authorization', `Bearer ${ngoToken()}`)
        .expect(200);

      expect(body.status).toBe(false);
      expect(body.statusCode).toBe(404);
      expect(body.message).toMatch(/not found/i);
    });

    it('200 — returns all dashboard fields with correct shape', async () => {
      const { body } = await request(app.getHttpServer())
        .get('/organizations/me/dashboard')
        .set('Authorization', `Bearer ${ngoToken()}`)
        .expect(200);

      expect(body.status).toBe(true);
      expect(body.data).toMatchObject({
        profileCompletion: expect.any(Number),
        activityCount: expect.any(Number),
        assessmentCount: expect.any(Number),
        pointsEarned: expect.any(Number),
        badgeCount: expect.any(Number),
        upcomingEvents: expect.any(Array),
        recentActivities: expect.any(Array),
      });
    });

    it('200 — profileCompletion is 100 when all tracked fields are filled', async () => {
      const { body } = await request(app.getHttpServer())
        .get('/organizations/me/dashboard')
        .set('Authorization', `Bearer ${ngoToken()}`)
        .expect(200);

      expect(body.data.profileCompletion).toBe(100);
    });

    it('200 — profileCompletion is less than 100 when optional fields are missing', async () => {
      mockPrisma.organization.findUnique.mockResolvedValue(
        makeDashboardOrg({
          acronym: null,
          publicEmail: null,
          address: null,
          description: null,
          logoUrl: null,
          mission: null,
          vision: null,
          numberOfStaff: null,
          numberOfVolunteers: null,
          annualBudget: null,
          sectors: [],
          socials: [],
        }),
      );

      const { body } = await request(app.getHttpServer())
        .get('/organizations/me/dashboard')
        .set('Authorization', `Bearer ${ngoToken()}`)
        .expect(200);

      expect(body.data.profileCompletion).toBeLessThan(100);
      expect(body.data.profileCompletion).toBeGreaterThanOrEqual(0);
    });

    it('200 — activityCount and assessmentCount come from _count', async () => {
      mockPrisma.organization.findUnique.mockResolvedValue(
        makeDashboardOrg({ _count: { activities: 13, odaAssessments: 4 } }),
      );

      const { body } = await request(app.getHttpServer())
        .get('/organizations/me/dashboard')
        .set('Authorization', `Bearer ${ngoToken()}`)
        .expect(200);

      expect(body.data.activityCount).toBe(13);
      expect(body.data.assessmentCount).toBe(4);
    });

    it('200 — pointsEarned and badgeCount come from owner user', async () => {
      mockPrisma.organization.findUnique.mockResolvedValue(
        makeDashboardOrg({
          user: {
            pointsCount: 500,
            badges: [{ id: 'b1' }, { id: 'b2' }, { id: 'b3' }],
          },
        }),
      );

      const { body } = await request(app.getHttpServer())
        .get('/organizations/me/dashboard')
        .set('Authorization', `Bearer ${ngoToken()}`)
        .expect(200);

      expect(body.data.pointsEarned).toBe(500);
      expect(body.data.badgeCount).toBe(3);
    });

    it('200 — upcomingEvents is capped at 10', async () => {
      const events = Array.from({ length: 10 }, (_, i) =>
        makeUpcomingEvent({ title: `Event ${i + 1}` }),
      );
      mockPrisma.event.findMany.mockResolvedValue(events);

      const { body } = await request(app.getHttpServer())
        .get('/organizations/me/dashboard')
        .set('Authorization', `Bearer ${ngoToken()}`)
        .expect(200);

      expect(body.data.upcomingEvents).toHaveLength(10);
    });

    it('200 — recentActivities is capped at 10', async () => {
      const activities = Array.from({ length: 10 }, (_, i) =>
        makeRecentActivity({ activity: `Activity ${i + 1}` }),
      );
      mockPrisma.organizationActivity.findMany.mockResolvedValue(activities);

      const { body } = await request(app.getHttpServer())
        .get('/organizations/me/dashboard')
        .set('Authorization', `Bearer ${ngoToken()}`)
        .expect(200);

      expect(body.data.recentActivities).toHaveLength(10);
    });

    it('200 — upcomingEvents is empty array when no events scheduled', async () => {
      mockPrisma.event.findMany.mockResolvedValue([]);

      const { body } = await request(app.getHttpServer())
        .get('/organizations/me/dashboard')
        .set('Authorization', `Bearer ${ngoToken()}`)
        .expect(200);

      expect(body.data.upcomingEvents).toEqual([]);
    });

    it('200 — event query excludes past and cancelled events', async () => {
      await request(app.getHttpServer())
        .get('/organizations/me/dashboard')
        .set('Authorization', `Bearer ${ngoToken()}`)
        .expect(200);

      expect(mockPrisma.event.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            isPast: false,
            isCancelled: false,
            startTime: expect.objectContaining({ gt: expect.any(Date) }),
          }),
          take: 10,
          orderBy: { startTime: 'asc' },
        }),
      );
    });

    it('200 — activity query is scoped to this org and ordered by createdAt desc', async () => {
      await request(app.getHttpServer())
        .get('/organizations/me/dashboard')
        .set('Authorization', `Bearer ${ngoToken()}`)
        .expect(200);

      expect(mockPrisma.organizationActivity.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { organizationId: ORG_UUID },
          orderBy: { createdAt: 'desc' },
          take: 10,
        }),
      );
    });

    it('200 — upcomingEvent shape includes required fields', async () => {
      const evt = makeUpcomingEvent({ title: 'Big Summit', capacity: 300 });
      mockPrisma.event.findMany.mockResolvedValue([evt]);

      const { body } = await request(app.getHttpServer())
        .get('/organizations/me/dashboard')
        .set('Authorization', `Bearer ${ngoToken()}`)
        .expect(200);

      const e = body.data.upcomingEvents[0];
      expect(e).toHaveProperty('id');
      expect(e).toHaveProperty('title', 'Big Summit');
      expect(e).toHaveProperty('startTime');
      expect(e).toHaveProperty('endTime');
      expect(e).toHaveProperty('capacity', 300);
      expect(e).toHaveProperty('tags');
    });
  });
});
