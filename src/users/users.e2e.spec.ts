/**
 * Run:
 *   npx jest --config jest-e2e.json
 */

import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { JwtService, JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { ConfigModule, ConfigService } from '@nestjs/config';
import request from 'supertest';
import { Role } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { UserController } from './controller/users.controller';
import { UserService } from './service/users.service';
import { JwtStrategy } from 'src/common/strategies/jwt.strategy';
import { PrismaService } from 'src/prisma.service';
import { EmailService } from 'src/providers/email/email.service';
import { AzureBlobService } from 'src/providers/azure/azure.blob.service';

// ─────────────────────────────────────────────────────────────────────────────
// CONSTANTS
// ─────────────────────────────────────────────────────────────────────────────

const JWT_SECRET = 'test-secret-do-not-use-in-prod';
const VALID_UUID = 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11';
const ADMIN_UUID = 'b1ffcd00-0d1c-5fg9-cc7e-7cc0ce491b22';

// ─────────────────────────────────────────────────────────────────────────────
// MOCK FACTORIES
// ─────────────────────────────────────────────────────────────────────────────

/** Minimal user object returned from mock Prisma calls */
function makeDbUser(overrides: Record<string, any> = {}): any {
  return {
    id: VALID_UUID,
    email: 'user@example.com',
    fullName: 'Test User',
    role: Role.GUEST,
    status: 'APPROVED',
    isEmailVerified: true,
    passwordHash: bcrypt.hashSync('Password1!', 1), // fast hash for tests
    otp: null,
    otpExpiresAt: null,
    resetPasswordToken: null,
    resetPasswordExpiresAt: null,
    avatarUrl: null,
    phoneNumber: null,
    pointsCount: 0,
    organization: null,
    expertProfile: null,
    adminPermission: null,
    badges: [],
    organizationMemberships: [],
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

function makeAdminUser(overrides: Record<string, any> = {}): any {
  return makeDbUser({
    id: ADMIN_UUID,
    email: 'admin@example.com',
    role: Role.SUPER_ADMIN,
    status: 'APPROVED',
    adminPermission: {
      permissions: [
        'user:read',
        'user:approve',
        'user:suspend',
        'user:delete',
        'user:export',
        'org:read',
        'org:update',
        'org:delete',
      ],
    },
    ...overrides,
  });
}

function makeExpertProfile(overrides: Record<string, any> = {}): any {
  return {
    id: 'ep-uuid-1',
    userId: VALID_UUID,
    title: 'Dr.',
    yearsOfExperience: 5,
    about: 'About text',
    employer: 'UNICEF',
    areasOfExpertise: ['Governance'],
    servicesOffered: [],
    referees: [],
    preferredContactMethods: [],
    socials: [],
    otherLinks: [],
    education: [],
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// MOCK PRISMA — full interface, all fns start as jest.fn()
// ─────────────────────────────────────────────────────────────────────────────

const mockPrisma = {
  user: {
    findUnique: jest.fn(),
    findMany: jest.fn(),
    findFirst: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
    count: jest.fn(),
  },
  expertProfile: {
    findUnique: jest.fn(),
    findMany: jest.fn(),
    upsert: jest.fn(),
    count: jest.fn(),
  },
  organization: {
    findUnique: jest.fn(),
    update: jest.fn(),
  },
  adminPermission: { upsert: jest.fn() },
  auditLog: { create: jest.fn() },
  $transaction: jest.fn(),
};

// ─────────────────────────────────────────────────────────────────────────────
// MOCK EMAIL / AZURE
// ─────────────────────────────────────────────────────────────────────────────

const mockEmail = {
  sendVerificationOtp: jest.fn().mockResolvedValue(undefined),
  sendAdminApprovalNotification: jest.fn().mockResolvedValue(undefined),
  sendPasswordResetOtp: jest.fn().mockResolvedValue(undefined),
  sendAccountStatusNotification: jest.fn().mockResolvedValue(undefined),
  sendWelcomeEmail: jest.fn().mockResolvedValue(undefined),
};

const mockAzure = {
  upload: jest.fn().mockResolvedValue('https://blob.example.com/file.jpg'),
  delete: jest.fn().mockResolvedValue(undefined),
};

// ─────────────────────────────────────────────────────────────────────────────
// JWT HELPER — signs tokens the same way the real app does
// ─────────────────────────────────────────────────────────────────────────────

let jwtService: JwtService;

function signToken(payload: {
  sub: string;
  email: string;
  role: string;
}): string {
  return jwtService.sign(payload);
}

/** Token for a normal GUEST user */
const guestToken = () =>
  signToken({ sub: VALID_UUID, email: 'user@example.com', role: Role.GUEST });

/** Token for a SUPER_ADMIN */
const adminToken = () =>
  signToken({
    sub: ADMIN_UUID,
    email: 'admin@example.com',
    role: Role.SUPER_ADMIN,
  });

/** Token for an EXPERT user */
const expertToken = () =>
  signToken({
    sub: VALID_UUID,
    email: 'expert@example.com',
    role: Role.EXPERT,
  });

/** Token for an NGO_MEMBER */
const ngoToken = () =>
  signToken({
    sub: VALID_UUID,
    email: 'ngo@example.com',
    role: Role.NGO_MEMBER,
  });

// ─────────────────────────────────────────────────────────────────────────────
// BOOTSTRAP — spins up the real NestJS HTTP stack
// ─────────────────────────────────────────────────────────────────────────────

describe('Users Module — E2E', () => {
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
      controllers: [UserController],
      providers: [
        UserService,
        JwtStrategy,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: EmailService, useValue: mockEmail },
        { provide: AzureBlobService, useValue: mockAzure },
        {
          provide: ConfigService,
          useValue: {
            get: (key: string) =>
              ({
                JWT_SECRET: JWT_SECRET,
                JWT_EXPIRES_IN: '1h',
                FRONTEND_URL: 'https://app.example.com',
                ADMIN_DASHBOARD_URL: 'https://admin.example.com',
                APP_LOGIN_URL: 'https://app.example.com/login',
                SEED_SECRET: 'correct-seed-secret',
              })[key],
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
  });

  afterAll(() => app.close());

  // Reset mocks before each test — prevents state leaking between tests
  beforeEach(() => {
    jest.clearAllMocks();

    // JwtStrategy.validate() calls prisma.user.findUnique to hydrate req.user.
    // Default: return the admin user for admin tokens, guest user for others.
    // Individual tests override this as needed.
    mockPrisma.user.findUnique.mockResolvedValue(makeAdminUser());
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // POST /users/signup
  // ═══════════════════════════════════════════════════════════════════════════

  describe('POST /users/signup', () => {
    const validGuestBody = {
      email: 'new@example.com',
      fullName: 'New User',
      password: 'Password1!',
      role: Role.GUEST,
    };

    beforeEach(() => {
      // No existing user
      mockPrisma.user.findUnique.mockResolvedValue(null);
      // Transaction creates user
      mockPrisma.$transaction.mockImplementation(async (cb: any) =>
        cb({
          user: {
            create: jest.fn().mockResolvedValue(
              makeDbUser({
                email: 'new@example.com',
                role: Role.GUEST,
                status: 'APPROVED',
              }),
            ),
          },
          organization: { create: jest.fn() },
          expertProfile: { create: jest.fn() },
        }),
      );
    });

    it('201 — creates a GUEST account successfully', async () => {
      const { body } = await request(app.getHttpServer())
        .post('/users/signup')
        .send(validGuestBody)
        .expect(201);

      expect(body.status).toBe(true);
      expect(body.statusCode).toBe(201);
      expect(body.data.role).toBe(Role.GUEST);
    });

    it('400 — rejects missing required fields', async () => {
      await request(app.getHttpServer())
        .post('/users/signup')
        .send({ email: 'bad@example.com' }) // missing fullName, password, role
        .expect(400);
    });

    it('400 — rejects invalid email format', async () => {
      await request(app.getHttpServer())
        .post('/users/signup')
        .send({ ...validGuestBody, email: 'not-an-email' })
        .expect(400);
    });

    it('403 — blocks self-registration of admin roles', async () => {
      const { body } = await request(app.getHttpServer())
        .post('/users/signup')
        .send({ ...validGuestBody, role: Role.SUPER_ADMIN })
        .expect(201); // NestJS returns 201 regardless — our service returns 403 statusCode in body

      expect(body.status).toBe(false);
      expect(body.statusCode).toBe(403);
    });

    it('409 — rejects duplicate email', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(makeDbUser());

      const { body } = await request(app.getHttpServer())
        .post('/users/signup')
        .send(validGuestBody)
        .expect(201);

      expect(body.status).toBe(false);
      expect(body.statusCode).toBe(409);
    });

    it('sends verification OTP email on success', async () => {
      await request(app.getHttpServer())
        .post('/users/signup')
        .send(validGuestBody)
        .expect(201);

      // Fire-and-forget: allow event loop to flush
      await new Promise((r) => setTimeout(r, 50));
      expect(mockEmail.sendVerificationOtp).toHaveBeenCalledWith(
        expect.objectContaining({ email: 'new@example.com' }),
      );
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // POST /users/login
  // ═══════════════════════════════════════════════════════════════════════════

  describe('POST /users/login', () => {
    it('200 — returns JWT token on valid credentials', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(
        makeDbUser({
          passwordHash: bcrypt.hashSync('Password1!', 1),
          isEmailVerified: true,
          status: 'APPROVED',
        }),
      );

      const { body } = await request(app.getHttpServer())
        .post('/users/login')
        .send({ email: 'user@example.com', password: 'Password1!' })
        .expect(201);

      expect(body.status).toBe(true);
      expect(body.data.token).toBeDefined();
      expect(body.data.user.passwordHash).toBeUndefined();
      expect(body.data.user.otp).toBeUndefined();
    });

    it('401 — wrong password', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(
        makeDbUser({ passwordHash: bcrypt.hashSync('CorrectPass!', 1) }),
      );

      const { body } = await request(app.getHttpServer())
        .post('/users/login')
        .send({ email: 'user@example.com', password: 'WrongPass!' })
        .expect(201);

      expect(body.status).toBe(false);
      expect(body.statusCode).toBe(401);
    });

    it('401 — user does not exist', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(null);

      const { body } = await request(app.getHttpServer())
        .post('/users/login')
        .send({ email: 'ghost@example.com', password: 'Password1!' })
        .expect(201);

      expect(body.status).toBe(false);
      expect(body.statusCode).toBe(401);
    });

    it('403 — unverified email', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(
        makeDbUser({
          passwordHash: bcrypt.hashSync('Password1!', 1),
          isEmailVerified: false,
        }),
      );

      const { body } = await request(app.getHttpServer())
        .post('/users/login')
        .send({ email: 'user@example.com', password: 'Password1!' })
        .expect(201);

      expect(body.status).toBe(false);
      expect(body.statusCode).toBe(403);
      expect(body.message).toMatch(/verify your email/i);
    });

    it.each([
      ['PENDING', /awaiting admin approval/i],
      ['REJECTED', /rejected/i],
      ['SUSPENDED', /suspended/i],
    ])('403 — %s account status blocks login', async (status, pattern) => {
      mockPrisma.user.findUnique.mockResolvedValue(
        makeDbUser({
          passwordHash: bcrypt.hashSync('Password1!', 1),
          isEmailVerified: true,
          status,
        }),
      );

      const { body } = await request(app.getHttpServer())
        .post('/users/login')
        .send({ email: 'user@example.com', password: 'Password1!' })
        .expect(201);

      expect(body.status).toBe(false);
      expect(body.statusCode).toBe(403);
      expect(body.message).toMatch(pattern);
    });

    it('400 — rejects missing body fields', async () => {
      await request(app.getHttpServer())
        .post('/users/login')
        .send({ email: 'user@example.com' }) // missing password
        .expect(400);
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // POST /users/verify-email
  // ═══════════════════════════════════════════════════════════════════════════

  describe('POST /users/verify-email', () => {
    it('200 — verifies email with correct OTP', async () => {
      const future = new Date(Date.now() + 60_000);
      mockPrisma.user.findUnique.mockResolvedValue(
        makeDbUser({
          otp: '123456',
          otpExpiresAt: future,
          isEmailVerified: false,
          status: 'APPROVED',
        }),
      );
      mockPrisma.user.update.mockResolvedValue({});

      const { body } = await request(app.getHttpServer())
        .post('/users/verify-email')
        .send({ email: 'user@example.com', otp: '123456' })
        .expect(201);

      expect(body.status).toBe(true);
    });

    it('400 — wrong OTP', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(
        makeDbUser({
          otp: '999999',
          otpExpiresAt: new Date(Date.now() + 60_000),
        }),
      );

      const { body } = await request(app.getHttpServer())
        .post('/users/verify-email')
        .send({ email: 'user@example.com', otp: '000000' })
        .expect(201);

      expect(body.status).toBe(false);
      expect(body.statusCode).toBe(400);
    });

    it('400 — expired OTP', async () => {
      const past = new Date(Date.now() - 1000);
      mockPrisma.user.findUnique.mockResolvedValue(
        makeDbUser({ otp: '123456', otpExpiresAt: past }),
      );

      const { body } = await request(app.getHttpServer())
        .post('/users/verify-email')
        .send({ email: 'user@example.com', otp: '123456' })
        .expect(201);

      expect(body.status).toBe(false);
      expect(body.message).toMatch(/expired/i);
    });

    it('400 — rejects invalid body', async () => {
      await request(app.getHttpServer())
        .post('/users/verify-email')
        .send({ email: 'not-an-email', otp: '123456' })
        .expect(400);
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // POST /users/resend-otp
  // ═══════════════════════════════════════════════════════════════════════════

  describe('POST /users/resend-otp', () => {
    it('200 — always succeeds for unknown email (anti-enumeration)', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(null);

      const { body } = await request(app.getHttpServer())
        .post('/users/resend-otp')
        .send({ email: 'ghost@example.com' })
        .expect(201);

      expect(body.status).toBe(true);
      expect(mockEmail.sendVerificationOtp).not.toHaveBeenCalled();
    });

    it('400 — already verified email', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(
        makeDbUser({ isEmailVerified: true }),
      );

      const { body } = await request(app.getHttpServer())
        .post('/users/resend-otp')
        .send({ email: 'user@example.com' })
        .expect(201);

      expect(body.status).toBe(false);
      expect(body.statusCode).toBe(400);
    });

    it('200 — sends new OTP to unverified user', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(
        makeDbUser({ isEmailVerified: false }),
      );
      mockPrisma.user.update.mockResolvedValue({});

      const { body } = await request(app.getHttpServer())
        .post('/users/resend-otp')
        .send({ email: 'user@example.com' })
        .expect(201);

      expect(body.status).toBe(true);
      await new Promise((r) => setTimeout(r, 50));
      expect(mockEmail.sendVerificationOtp).toHaveBeenCalled();
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // POST /users/forgot-password
  // ═══════════════════════════════════════════════════════════════════════════

  describe('POST /users/forgot-password', () => {
    it('200 — returns success even for unknown email', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(null);

      const { body } = await request(app.getHttpServer())
        .post('/users/forgot-password')
        .send({ email: 'ghost@example.com' })
        .expect(201);

      expect(body.status).toBe(true);
      expect(mockEmail.sendPasswordResetOtp).not.toHaveBeenCalled();
    });

    it('200 — sends reset email for known user', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(makeDbUser());
      mockPrisma.user.update.mockResolvedValue({});

      await request(app.getHttpServer())
        .post('/users/forgot-password')
        .send({ email: 'user@example.com' })
        .expect(201);

      expect(mockEmail.sendPasswordResetOtp).toHaveBeenCalledWith(
        expect.objectContaining({
          email: 'user@example.com',
          resetUrl: expect.stringContaining('reset-password'),
        }),
      );
    });

    it('400 — rejects invalid email format', async () => {
      await request(app.getHttpServer())
        .post('/users/forgot-password')
        .send({ email: 'not-an-email' })
        .expect(400);
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // POST /users/reset-password
  // ═══════════════════════════════════════════════════════════════════════════

  describe('POST /users/reset-password', () => {
    it('200 — resets password with valid token', async () => {
      const future = new Date(Date.now() + 60_000);
      mockPrisma.user.findUnique.mockResolvedValue(
        makeDbUser({
          resetPasswordToken: 'valid-token',
          resetPasswordExpiresAt: future,
        }),
      );
      mockPrisma.user.update.mockResolvedValue({});

      const { body } = await request(app.getHttpServer())
        .post('/users/reset-password')
        .send({
          email: 'user@example.com',
          token: 'valid-token',
          password: 'NewPass1!',
        })
        .expect(201);

      expect(body.status).toBe(true);
      expect(mockPrisma.user.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ resetPasswordToken: null }),
        }),
      );
    });

    it('400 — wrong token', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(
        makeDbUser({ resetPasswordToken: 'correct-token' }),
      );

      const { body } = await request(app.getHttpServer())
        .post('/users/reset-password')
        .send({
          email: 'user@example.com',
          token: 'wrong-token',
          password: 'NewPass1!',
        })
        .expect(201);

      expect(body.status).toBe(false);
      expect(body.statusCode).toBe(400);
    });

    it('400 — expired token', async () => {
      const past = new Date(Date.now() - 1000);
      mockPrisma.user.findUnique.mockResolvedValue(
        makeDbUser({
          resetPasswordToken: 'valid-token',
          resetPasswordExpiresAt: past,
        }),
      );

      const { body } = await request(app.getHttpServer())
        .post('/users/reset-password')
        .send({
          email: 'user@example.com',
          token: 'valid-token',
          password: 'NewPass1!',
        })
        .expect(201);

      expect(body.status).toBe(false);
      expect(body.message).toMatch(/expired/i);
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // GET /users/profile  (JWT required)
  // ═══════════════════════════════════════════════════════════════════════════

  describe('GET /users/profile', () => {
    it('401 — no token', async () => {
      await request(app.getHttpServer()).get('/users/profile').expect(401);
    });

    it('200 — returns profile without sensitive fields', async () => {
      // JwtStrategy.validate calls findUnique — return the user
      mockPrisma.user.findUnique.mockResolvedValue(makeDbUser());

      const { body } = await request(app.getHttpServer())
        .get('/users/profile')
        .set('Authorization', `Bearer ${guestToken()}`)
        .expect(200);

      expect(body.status).toBe(true);
      expect(body.data.passwordHash).toBeUndefined();
      expect(body.data.otp).toBeUndefined();
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // PATCH /users/profile  (JWT required)
  // ═══════════════════════════════════════════════════════════════════════════

  describe('PATCH /users/profile', () => {
    it('401 — no token', async () => {
      await request(app.getHttpServer())
        .patch('/users/profile')
        .send({ fullName: 'New' })
        .expect(401);
    });

    it('200 — updates profile', async () => {
      // JwtStrategy validate
      mockPrisma.user.findUnique.mockResolvedValue(makeDbUser());
      // updateProfile update call
      mockPrisma.user.update.mockResolvedValue(
        makeDbUser({ fullName: 'Updated Name' }),
      );

      const { body } = await request(app.getHttpServer())
        .patch('/users/profile')
        .set('Authorization', `Bearer ${guestToken()}`)
        .send({ fullName: 'Updated Name' })
        .expect(200);

      expect(body.status).toBe(true);
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // GET /users/experts  — THE NaN REGRESSION TEST
  // This is the test that catches the `take: NaN` bug at the HTTP layer.
  // ═══════════════════════════════════════════════════════════════════════════

  describe('GET /users/experts', () => {
    beforeEach(() => {
      // $transaction with array of queries
      mockPrisma.$transaction.mockImplementation((queries: any[]) =>
        Promise.all(queries),
      );
      mockPrisma.expertProfile.findMany.mockResolvedValue([]);
      mockPrisma.expertProfile.count.mockResolvedValue(0);
    });

    it('200 — succeeds with NO query params (would have caused take: NaN before the fix)', async () => {
      const { body } = await request(app.getHttpServer())
        .get('/users/experts')
        .expect(200);

      // If the NaN bug is present, Prisma throws a validation error → 500
      expect(body.status).toBe(true);
      expect(body.statusCode).toBe(200);
    });

    it('200 — findMany called with valid integer take: 20 when no limit given', async () => {
      await request(app.getHttpServer()).get('/users/experts').expect(200);

      expect(mockPrisma.expertProfile.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          skip: 0,
          take: 20, // <── this was NaN before the fix
        }),
      );
    });

    it('200 — findMany called with correct skip/take when page=2&limit=10', async () => {
      await request(app.getHttpServer())
        .get('/users/experts?page=2&limit=10')
        .expect(200);

      expect(mockPrisma.expertProfile.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ skip: 10, take: 10 }),
      );
    });

    it('200 — ignores non-numeric page/limit, falls back to defaults', async () => {
      await request(app.getHttpServer())
        .get('/users/experts?page=abc&limit=xyz')
        .expect(200);

      expect(mockPrisma.expertProfile.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ skip: 0, take: 20 }),
      );
    });

    it('200 — applies expertise filter', async () => {
      await request(app.getHttpServer())
        .get('/users/experts?expertise=Governance')
        .expect(200);

      expect(mockPrisma.expertProfile.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            areasOfExpertise: { has: 'Governance' },
          }),
        }),
      );
    });

    it('200 — applies search filter across name/employer/about', async () => {
      await request(app.getHttpServer())
        .get('/users/experts?search=John')
        .expect(200);

      const call = mockPrisma.expertProfile.findMany.mock.calls[0][0];
      expect(call.where.OR).toHaveLength(3);
    });

    it('200 — caps limit at 100 even when caller sends limit=9999', async () => {
      await request(app.getHttpServer())
        .get('/users/experts?limit=9999')
        .expect(200);

      expect(mockPrisma.expertProfile.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ take: 100 }),
      );
    });

    it('200 — returns correct pagination shape', async () => {
      mockPrisma.expertProfile.count.mockResolvedValue(45);

      const { body } = await request(app.getHttpServer())
        .get('/users/experts?page=3&limit=10')
        .expect(200);

      expect(body.data.total).toBe(45);
      expect(body.data.page).toBe(3);
      expect(body.data.limit).toBe(10);
      expect(body.data.pages).toBe(5);
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // GET /users/experts/:userId
  // ═══════════════════════════════════════════════════════════════════════════

  describe('GET /users/experts/:userId', () => {
    it('200 — returns expert profile by UUID', async () => {
      mockPrisma.expertProfile.findUnique.mockResolvedValue({
        ...makeExpertProfile(),
        user: makeDbUser(),
      });

      const { body } = await request(app.getHttpServer())
        .get(`/users/experts/${VALID_UUID}`)
        .expect(200);

      expect(body.status).toBe(true);
      expect(body.data.userId).toBe(VALID_UUID);
    });

    it('400 — rejects non-UUID param (ParseUUIDPipe)', async () => {
      await request(app.getHttpServer())
        .get('/users/experts/not-a-uuid')
        .expect(400);
    });

    it('404 — profile not found', async () => {
      mockPrisma.expertProfile.findUnique.mockResolvedValue(null);

      const { body } = await request(app.getHttpServer())
        .get(`/users/experts/${VALID_UUID}`)
        .expect(200);

      expect(body.status).toBe(false);
      expect(body.statusCode).toBe(404);
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // GET & PATCH /users/profile/expert  (JWT required)
  // ═══════════════════════════════════════════════════════════════════════════

  describe('GET /users/profile/expert', () => {
    it('401 — no token', async () => {
      await request(app.getHttpServer())
        .get('/users/profile/expert')
        .expect(401);
    });

    it('200 — returns own expert profile', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(
        makeDbUser({ role: Role.EXPERT }),
      );
      mockPrisma.expertProfile.findUnique.mockResolvedValue({
        ...makeExpertProfile(),
        user: makeDbUser(),
      });

      const { body } = await request(app.getHttpServer())
        .get('/users/profile/expert')
        .set('Authorization', `Bearer ${expertToken()}`)
        .expect(200);

      expect(body.status).toBe(true);
    });
  });

  describe('PATCH /users/profile/expert', () => {
    it('401 — no token', async () => {
      await request(app.getHttpServer())
        .patch('/users/profile/expert')
        .send({ title: 'Dr.' })
        .expect(401);
    });

    it('200 — upserts expert profile', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(
        makeDbUser({ role: Role.EXPERT }),
      );
      mockPrisma.expertProfile.upsert.mockResolvedValue(
        makeExpertProfile({ title: 'Prof.' }),
      );

      const { body } = await request(app.getHttpServer())
        .patch('/users/profile/expert')
        .set('Authorization', `Bearer ${expertToken()}`)
        .send({ title: 'Prof.', areasOfExpertise: ['Health'] })
        .expect(200);

      expect(body.status).toBe(true);
    });

    it('403 — returns forbidden in body for non-expert role', async () => {
      // findUnique called twice: JwtStrategy validate + upsertExpertProfile check
      mockPrisma.user.findUnique
        .mockResolvedValueOnce(makeDbUser({ role: Role.GUEST })) // JwtStrategy
        .mockResolvedValueOnce(makeDbUser({ role: Role.GUEST })); // service check

      const { body } = await request(app.getHttpServer())
        .patch('/users/profile/expert')
        .set('Authorization', `Bearer ${guestToken()}`)
        .send({ title: 'Dr.' })
        .expect(200);

      expect(body.status).toBe(false);
      expect(body.statusCode).toBe(403);
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // GET /users/profile/organization  (NGO_MEMBER or SUPER_ADMIN)
  // ═══════════════════════════════════════════════════════════════════════════

  describe('GET /users/profile/organization', () => {
    it('401 — no token', async () => {
      await request(app.getHttpServer())
        .get('/users/profile/organization')
        .expect(401);
    });

    it('403 — GUEST role is rejected by RolesGuard', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(
        makeDbUser({ role: Role.GUEST }),
      );

      await request(app.getHttpServer())
        .get('/users/profile/organization')
        .set('Authorization', `Bearer ${guestToken()}`)
        .expect(403);
    });

    it('200 — NGO_MEMBER can access their org', async () => {
      const ngoUser = makeDbUser({ role: Role.NGO_MEMBER });
      mockPrisma.user.findUnique
        .mockResolvedValueOnce(ngoUser) // JwtStrategy validate
        .mockResolvedValueOnce(ngoUser); // getUserOrganization

      mockPrisma.organization.findUnique.mockResolvedValue({
        id: 'org-1',
        name: 'Save The Trees',
        userId: VALID_UUID,
      });

      const { body } = await request(app.getHttpServer())
        .get('/users/profile/organization')
        .set('Authorization', `Bearer ${ngoToken()}`)
        .expect(200);

      expect(body.status).toBe(true);
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // GET /users  (Admin — requires JWT + SUPER_ADMIN role + user:read permission)
  // ═══════════════════════════════════════════════════════════════════════════

  describe('GET /users', () => {
    beforeEach(() => {
      mockPrisma.user.findUnique.mockResolvedValue(makeAdminUser());
      mockPrisma.$transaction.mockImplementation((q: any[]) => Promise.all(q));
      mockPrisma.user.findMany.mockResolvedValue([makeDbUser()]);
      mockPrisma.user.count.mockResolvedValue(1);
    });

    it('401 — no token', async () => {
      await request(app.getHttpServer()).get('/users').expect(401);
    });

    it('403 — GUEST role rejected', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(
        makeDbUser({ role: Role.GUEST }),
      );

      await request(app.getHttpServer())
        .get('/users')
        .set('Authorization', `Bearer ${guestToken()}`)
        .expect(403);
    });

    it('200 — SUPER_ADMIN can list users', async () => {
      const { body } = await request(app.getHttpServer())
        .get('/users')
        .set('Authorization', `Bearer ${adminToken()}`)
        .expect(200);

      expect(body.status).toBe(true);
      expect(body.data.users).toBeDefined();
      // Sensitive fields stripped
      expect(body.data.users[0]?.passwordHash).toBeUndefined();
    });

    it('200 — filters by role query param', async () => {
      await request(app.getHttpServer())
        .get('/users?role=NGO_MEMBER')
        .set('Authorization', `Bearer ${adminToken()}`)
        .expect(200);

      expect(mockPrisma.user.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ role: 'NGO_MEMBER' }),
        }),
      );
    });

    it('200 — filters by status query param', async () => {
      await request(app.getHttpServer())
        .get('/users?status=PENDING')
        .set('Authorization', `Bearer ${adminToken()}`)
        .expect(200);

      expect(mockPrisma.user.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ status: 'PENDING' }),
        }),
      );
    });

    it('200 — no params defaults to page 1, limit 20 (NaN regression check)', async () => {
      await request(app.getHttpServer())
        .get('/users')
        .set('Authorization', `Bearer ${adminToken()}`)
        .expect(200);

      expect(mockPrisma.user.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ skip: 0, take: expect.any(Number) }),
      );
      const call = mockPrisma.user.findMany.mock.calls[0][0];
      // take must be a finite number, not NaN
      expect(Number.isFinite(call.take)).toBe(true);
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // PATCH /users/:id/approve
  // ═══════════════════════════════════════════════════════════════════════════

  describe('PATCH /users/:id/approve', () => {
    it('401 — no token', async () => {
      await request(app.getHttpServer())
        .patch(`/users/${VALID_UUID}/approve`)
        .expect(401);
    });

    it('403 — non-admin role rejected', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(
        makeDbUser({ role: Role.GUEST }),
      );

      await request(app.getHttpServer())
        .patch(`/users/${VALID_UUID}/approve`)
        .set('Authorization', `Bearer ${guestToken()}`)
        .expect(403);
    });

    it('400 — non-UUID param rejected by ParseUUIDPipe', async () => {
      await request(app.getHttpServer())
        .patch('/users/not-a-uuid/approve')
        .set('Authorization', `Bearer ${adminToken()}`)
        .expect(400);
    });

    it('400 — cannot approve user whose email is not yet verified', async () => {
      mockPrisma.user.findUnique
        .mockResolvedValueOnce(makeAdminUser()) // JwtStrategy
        .mockResolvedValueOnce(makeDbUser({ isEmailVerified: false })); // approveUser check

      const { body } = await request(app.getHttpServer())
        .patch(`/users/${VALID_UUID}/approve`)
        .set('Authorization', `Bearer ${adminToken()}`)
        .expect(200);

      expect(body.status).toBe(false);
      expect(body.statusCode).toBe(400);
      expect(body.message).toMatch(/not verified their email/i);
    });

    it('200 — approves user and sends emails', async () => {
      mockPrisma.user.findUnique
        .mockResolvedValueOnce(makeAdminUser()) // JwtStrategy
        .mockResolvedValueOnce(makeDbUser({ isEmailVerified: true })) // approveUser pre-check
        .mockResolvedValueOnce(makeDbUser({ isEmailVerified: true })); // _updateUserStatus

      mockPrisma.$transaction.mockResolvedValue([{}, {}]);
      mockEmail.sendAccountStatusNotification.mockResolvedValue(undefined);
      mockEmail.sendWelcomeEmail.mockResolvedValue(undefined);

      const { body } = await request(app.getHttpServer())
        .patch(`/users/${VALID_UUID}/approve`)
        .set('Authorization', `Bearer ${adminToken()}`)
        .expect(200);

      expect(body.status).toBe(true);
      expect(mockEmail.sendWelcomeEmail).toHaveBeenCalled();
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // PATCH /users/:id/reject
  // ═══════════════════════════════════════════════════════════════════════════

  describe('PATCH /users/:id/reject', () => {
    it('400 — non-UUID param', async () => {
      await request(app.getHttpServer())
        .patch('/users/bad-id/reject')
        .set('Authorization', `Bearer ${adminToken()}`)
        .expect(400);
    });

    it('200 — rejects user with reason, sends notification but NOT welcome email', async () => {
      mockPrisma.user.findUnique
        .mockResolvedValueOnce(makeAdminUser())
        .mockResolvedValueOnce(makeDbUser());

      mockPrisma.$transaction.mockResolvedValue([{}, {}]);

      const { body } = await request(app.getHttpServer())
        .patch(`/users/${VALID_UUID}/reject`)
        .set('Authorization', `Bearer ${adminToken()}`)
        .send({ reason: 'Incomplete application' })
        .expect(200);

      expect(body.status).toBe(true);
      expect(mockEmail.sendAccountStatusNotification).toHaveBeenCalledWith(
        expect.objectContaining({
          status: 'REJECTED',
          reason: 'Incomplete application',
        }),
      );
      expect(mockEmail.sendWelcomeEmail).not.toHaveBeenCalled();
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // PATCH /users/:id/suspend
  // ═══════════════════════════════════════════════════════════════════════════

  describe('PATCH /users/:id/suspend', () => {
    it('200 — suspends user without sending any email', async () => {
      mockPrisma.user.findUnique
        .mockResolvedValueOnce(makeAdminUser())
        .mockResolvedValueOnce(makeDbUser());

      mockPrisma.$transaction.mockResolvedValue([{}, {}]);

      const { body } = await request(app.getHttpServer())
        .patch(`/users/${VALID_UUID}/suspend`)
        .set('Authorization', `Bearer ${adminToken()}`)
        .expect(200);

      expect(body.status).toBe(true);
      expect(mockEmail.sendAccountStatusNotification).not.toHaveBeenCalled();
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // DELETE /users/:id
  // ═══════════════════════════════════════════════════════════════════════════

  describe('DELETE /users/:id', () => {
    it('401 — no token', async () => {
      await request(app.getHttpServer())
        .delete(`/users/${VALID_UUID}`)
        .expect(401);
    });

    it('400 — non-UUID param', async () => {
      await request(app.getHttpServer())
        .delete('/users/bad-id')
        .set('Authorization', `Bearer ${adminToken()}`)
        .expect(400);
    });

    it('404 — user not found', async () => {
      mockPrisma.user.findUnique
        .mockResolvedValueOnce(makeAdminUser()) // JwtStrategy
        .mockResolvedValueOnce(null); // deleteUser check

      const { body } = await request(app.getHttpServer())
        .delete(`/users/${VALID_UUID}`)
        .set('Authorization', `Bearer ${adminToken()}`)
        .expect(200);

      expect(body.status).toBe(false);
      expect(body.statusCode).toBe(404);
    });

    it('200 — deletes user and creates audit log', async () => {
      mockPrisma.user.findUnique
        .mockResolvedValueOnce(makeAdminUser())
        .mockResolvedValueOnce(makeDbUser());

      mockPrisma.$transaction.mockImplementation((q: any[]) => Promise.all(q));
      mockPrisma.user.delete.mockResolvedValue({});
      mockPrisma.auditLog.create.mockResolvedValue({});

      const { body } = await request(app.getHttpServer())
        .delete(`/users/${VALID_UUID}`)
        .set('Authorization', `Bearer ${adminToken()}`)
        .expect(200);

      expect(body.status).toBe(true);
      expect(body.message).toMatch(/deleted/i);
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // PATCH /users/:id/permissions
  // ═══════════════════════════════════════════════════════════════════════════

  describe('PATCH /users/:id/permissions', () => {
    it('200 — assigns permissions to a content admin', async () => {
      mockPrisma.user.findUnique
        .mockResolvedValueOnce(makeAdminUser()) // JwtStrategy
        .mockResolvedValueOnce(makeDbUser({ role: Role.CONTENT_ADMIN })); // assignPermissions check

      mockPrisma.adminPermission.upsert.mockResolvedValue({});
      mockPrisma.auditLog.create.mockResolvedValue({});

      const permissions = ['user:read', 'event:read'];

      const { body } = await request(app.getHttpServer())
        .patch(`/users/${VALID_UUID}/permissions`)
        .set('Authorization', `Bearer ${adminToken()}`)
        .send({ permissions })
        .expect(200);

      expect(body.status).toBe(true);
      expect(mockPrisma.adminPermission.upsert).toHaveBeenCalled();
    });

    it('400 — non-admin target role is rejected', async () => {
      mockPrisma.user.findUnique
        .mockResolvedValueOnce(makeAdminUser())
        .mockResolvedValueOnce(makeDbUser({ role: Role.GUEST }));

      const { body } = await request(app.getHttpServer())
        .patch(`/users/${VALID_UUID}/permissions`)
        .set('Authorization', `Bearer ${adminToken()}`)
        .send({ permissions: ['user:read'] })
        .expect(200);

      expect(body.status).toBe(false);
      expect(body.statusCode).toBe(400);
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // PATCH /users/:id/permissions/revoke
  // ═══════════════════════════════════════════════════════════════════════════

  describe('PATCH /users/:id/permissions/revoke', () => {
    it('200 — revokes selected permissions and returns remaining', async () => {
      mockPrisma.user.findUnique
        .mockResolvedValueOnce(makeAdminUser())
        .mockResolvedValueOnce(
          makeDbUser({
            role: Role.CONTENT_ADMIN,
            adminPermission: {
              permissions: ['user:read', 'event:read', 'resource:read'],
            },
          }),
        );

      mockPrisma.adminPermission.upsert.mockResolvedValue({});
      mockPrisma.auditLog.create.mockResolvedValue({});

      const { body } = await request(app.getHttpServer())
        .patch(`/users/${VALID_UUID}/permissions/revoke`)
        .set('Authorization', `Bearer ${adminToken()}`)
        .send({ permissions: ['event:read'] })
        .expect(200);

      expect(body.status).toBe(true);
      expect(body.data.remainingPermissions).toContain('user:read');
      expect(body.data.remainingPermissions).not.toContain('event:read');
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // POST /users/seed-super-admin
  // ═══════════════════════════════════════════════════════════════════════════

  describe('POST /users/seed-super-admin', () => {
    it('403 — wrong seed secret', async () => {
      const { body } = await request(app.getHttpServer())
        .post('/users/seed-super-admin')
        .send({
          email: 'admin@plrcap.org',
          password: 'Pass1!',
          fullName: 'Admin',
          seedSecret: 'wrong',
        })
        .expect(201);

      expect(body.status).toBe(false);
      expect(body.statusCode).toBe(403);
    });

    it('409 — super admin already exists', async () => {
      mockPrisma.user.findFirst.mockResolvedValue(
        makeDbUser({ role: Role.SUPER_ADMIN }),
      );

      const { body } = await request(app.getHttpServer())
        .post('/users/seed-super-admin')
        .send({
          email: 'admin@plrcap.org',
          password: 'Pass1!',
          fullName: 'Admin',
          seedSecret: 'correct-seed-secret',
        })
        .expect(201);

      expect(body.status).toBe(false);
      expect(body.statusCode).toBe(409);
    });

    it('201 — creates super admin with correct secret', async () => {
      mockPrisma.user.findFirst.mockResolvedValue(null);
      mockPrisma.user.create.mockResolvedValue(
        makeDbUser({
          role: Role.SUPER_ADMIN,
          status: 'APPROVED',
          isEmailVerified: true,
        }),
      );

      const { body } = await request(app.getHttpServer())
        .post('/users/seed-super-admin')
        .send({
          email: 'admin@plrcap.org',
          password: 'Pass1!',
          fullName: 'Admin',
          seedSecret: 'correct-seed-secret',
        })
        .expect(201);

      expect(body.status).toBe(true);
      expect(body.statusCode).toBe(201);
    });
  });
});
