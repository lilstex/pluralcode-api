import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { JwtService, JwtModule } from '@nestjs/jwt';
import { Reflector } from '@nestjs/core';
import { PassportModule } from '@nestjs/passport';
import { ConfigModule } from '@nestjs/config';
import request from 'supertest';
import { Role, FormStatus } from '@prisma/client';

import { OdaController } from 'src/oda/controller/oda.controller';
import { OdaStructureService } from 'src/oda/service/oda-structure.service';
import { OdaAssessmentService } from 'src/oda/service/oda-assessment.service';
import { OdaScoringService } from 'src/oda/service/oda-scoring.service';
import { JwtStrategy } from 'src/common/strategies/jwt.strategy';
import { RolesGuard } from 'src/common/guards/roles.guard';
import { PrismaService } from 'src/prisma-module/prisma.service';
import { EmailService } from 'src/providers/email/email.service';

// ─────────────────────────────────────────────────────────────────────────────
// CONSTANTS
// ─────────────────────────────────────────────────────────────────────────────

const JWT_SECRET = 'test-secret-do-not-use-in-prod';

const NGO_UUID = 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11';
const ADMIN_UUID = 'c2eebc99-9c0b-4ef8-bb6d-6bb9bd380a33';
const EXPERT_UUID = 'b1ffcd00-0d1c-4ef8-bb6d-6bb9bd380a22';
const CONTENT_ADMIN_UUID = 'e0eebc99-9c0b-4ef8-bb6d-6bb9bd380a55';

const ORG_UUID = 'd0eebc99-0000-4000-a000-000000000001';
const PILLAR_UUID = 'd1eebc99-0000-4000-a000-000000000001';
const BLOCK_UUID = 'd2eebc99-0000-4000-a000-000000000001';
const QUESTION_UUID = 'd3eebc99-0000-4000-a000-000000000001';
const ASSESSMENT_UUID = 'd4eebc99-0000-4000-a000-000000000001';
const BLOCK_RESP_UUID = 'd5eebc99-0000-4000-a000-000000000001';
const OTHER_UUID = 'd6eebc99-0000-4000-a000-000000000001';

// ─────────────────────────────────────────────────────────────────────────────
// FIXTURES
// ─────────────────────────────────────────────────────────────────────────────

const makeOrg = (overrides: any = {}) => ({
  id: ORG_UUID,
  name: 'Test NGO',
  state: 'Lagos',
  sectors: ['Health'],
  numberOfStaff: 10,
  annualBudget: '5M',
  ...overrides,
});

const makeNgoUser = (overrides: any = {}) => ({
  id: NGO_UUID,
  email: 'ngo@example.com',
  fullName: 'NGO User',
  role: Role.NGO_MEMBER,
  status: 'APPROVED',
  isEmailVerified: true,
  organization: makeOrg(),
  adminPermission: null,
  ...overrides,
});

const makeAdminUser = (overrides: any = {}) => ({
  id: ADMIN_UUID,
  email: 'admin@example.com',
  fullName: 'Admin User',
  role: Role.SUPER_ADMIN,
  status: 'APPROVED',
  isEmailVerified: true,
  organization: null,
  adminPermission: { permissions: ['*'] },
  ...overrides,
});

const makeContentAdmin = (overrides: any = {}) => ({
  id: CONTENT_ADMIN_UUID,
  email: 'content@example.com',
  fullName: 'Content Admin',
  role: Role.CONTENT_ADMIN,
  status: 'APPROVED',
  isEmailVerified: true,
  organization: null,
  adminPermission: null,
  ...overrides,
});

const makeExpertUser = (overrides: any = {}) => ({
  id: EXPERT_UUID,
  email: 'expert@example.com',
  fullName: 'Expert',
  role: Role.EXPERT,
  status: 'APPROVED',
  isEmailVerified: true,
  organization: null,
  adminPermission: null,
  ...overrides,
});

const makePillar = (overrides: any = {}) => ({
  id: PILLAR_UUID,
  name: 'Leadership',
  order: 1,
  buildingBlocks: [],
  createdAt: new Date(),
  updatedAt: new Date(),
  ...overrides,
});

const makeBlock = (overrides: any = {}) => ({
  id: BLOCK_UUID,
  name: 'Governance',
  order: 1,
  maxScore: 100,
  pillarId: PILLAR_UUID,
  pillar: { id: PILLAR_UUID, name: 'Leadership' },
  questions: [{ id: QUESTION_UUID, text: 'Do you have a board?', order: 1 }],
  createdAt: new Date(),
  updatedAt: new Date(),
  ...overrides,
});

const makeQuestion = (overrides: any = {}) => ({
  id: QUESTION_UUID,
  text: 'Do you have a board?',
  order: 1,
  buildingBlockId: BLOCK_UUID,
  createdAt: new Date(),
  updatedAt: new Date(),
  ...overrides,
});

const makeBlockResponse = (overrides: any = {}) => ({
  id: BLOCK_RESP_UUID,
  assessmentId: ASSESSMENT_UUID,
  buildingBlockId: BLOCK_UUID,
  status: 'IN_PROGRESS',
  blockScore: null,
  answers: [],
  buildingBlock: makeBlock(),
  createdAt: new Date(),
  updatedAt: new Date(),
  ...overrides,
});

const makeAssessment = (overrides: any = {}) => ({
  id: ASSESSMENT_UUID,
  status: FormStatus.IN_PROGRESS,
  overallScore: null,
  aiSummary: null,
  startedAt: new Date(),
  completedAt: null,
  orgId: ORG_UUID,
  organization: { id: ORG_UUID, name: 'Test NGO' },
  blockResponses: [makeBlockResponse()],
  createdAt: new Date(),
  updatedAt: new Date(),
  ...overrides,
});

// ─────────────────────────────────────────────────────────────────────────────
// MOCK PRISMA
// ─────────────────────────────────────────────────────────────────────────────

const mockPrisma: any = {
  user: { findUnique: jest.fn(), findMany: jest.fn() },
  oDAPillar: {
    findUnique: jest.fn(),
    findFirst: jest.fn(),
    findMany: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
    upsert: jest.fn(),
  },
  oDABuildingBlock: {
    findUnique: jest.fn(),
    findFirst: jest.fn(),
    findMany: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
    deleteMany: jest.fn(),
  },
  oDAQuestion: {
    findUnique: jest.fn(),
    findFirst: jest.fn(),
    findMany: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
    deleteMany: jest.fn(),
  },
  oDAAssessment: {
    findUnique: jest.fn(),
    findFirst: jest.fn(),
    findMany: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
    count: jest.fn(),
    aggregate: jest.fn(),
  },
  oDABlockResponse: {
    findFirst: jest.fn(),
    findMany: jest.fn(),
    create: jest.fn(),
    createMany: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
    deleteMany: jest.fn(),
  },
  resource: { findMany: jest.fn() },
  $transaction: jest.fn(),
};

const mockEmail = {
  sendODACompletionNotification: jest.fn(),
  sendODANewSubmissionAlert: jest.fn(),
};

const mockScoring = {
  computeBlockScore: jest.fn().mockReturnValue(75),
  computeOverallScore: jest.fn().mockReturnValue(68.5),
  generateSummary: jest
    .fn()
    .mockResolvedValue('## ODA Summary\nTest summary text.'),
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
const adminToken = () =>
  jwtService.sign({
    sub: ADMIN_UUID,
    email: 'admin@example.com',
    role: Role.SUPER_ADMIN,
  });
const contentAdminToken = () =>
  jwtService.sign({
    sub: CONTENT_ADMIN_UUID,
    email: 'content@example.com',
    role: Role.CONTENT_ADMIN,
  });
const expertToken = () =>
  jwtService.sign({
    sub: EXPERT_UUID,
    email: 'expert@example.com',
    role: Role.EXPERT,
  });

// ─────────────────────────────────────────────────────────────────────────────
// BOOTSTRAP
// ─────────────────────────────────────────────────────────────────────────────

describe('ODA Module — E2E', () => {
  let app: INestApplication;

  beforeAll(async () => {
    // JwtStrategy reads JWT_SECRET via ConfigService.get('JWT_SECRET') at module
    // compile time. ConfigModule.forRoot with ignoreEnvFile:true reads from
    // process.env, so we must set it here before createTestingModule runs.
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
      controllers: [OdaController],
      providers: [
        OdaStructureService,
        OdaAssessmentService,
        { provide: OdaScoringService, useValue: mockScoring },
        JwtStrategy,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: EmailService, useValue: mockEmail },
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

  beforeEach(() => {
    jest.clearAllMocks();

    // where.id routing — survives clearAllMocks() unlike mockResolvedValue
    mockPrisma.user.findUnique.mockImplementation(({ where }: any) => {
      if (where?.id === NGO_UUID) return Promise.resolve(makeNgoUser());
      if (where?.id === ADMIN_UUID) return Promise.resolve(makeAdminUser());
      if (where?.id === CONTENT_ADMIN_UUID)
        return Promise.resolve(makeContentAdmin());
      if (where?.id === EXPERT_UUID) return Promise.resolve(makeExpertUser());
      return Promise.resolve(null);
    });

    // Safe defaults
    mockPrisma.oDAPillar.findMany.mockResolvedValue([]);
    mockPrisma.oDAPillar.findUnique.mockResolvedValue(null);
    mockPrisma.oDAPillar.findFirst.mockResolvedValue(null); // no name conflict by default
    mockPrisma.oDABuildingBlock.findMany.mockResolvedValue([]);
    mockPrisma.oDABuildingBlock.findUnique.mockResolvedValue(null);
    mockPrisma.oDAQuestion.findUnique.mockResolvedValue(null);
    mockPrisma.oDAAssessment.findFirst.mockResolvedValue(null);
    mockPrisma.oDAAssessment.findUnique.mockResolvedValue(null);
    mockPrisma.oDAAssessment.findMany.mockResolvedValue([]);
    mockPrisma.oDAAssessment.count.mockResolvedValue(0);
    mockPrisma.oDAAssessment.aggregate.mockResolvedValue({
      _avg: { overallScore: 0 },
    });
    mockPrisma.oDABlockResponse.findFirst.mockResolvedValue(null);
    mockPrisma.oDABlockResponse.findMany.mockResolvedValue([]);
    mockPrisma.resource.findMany.mockResolvedValue([]);
    mockPrisma.$transaction.mockImplementation((ops: any) =>
      Array.isArray(ops) ? Promise.all(ops) : ops(mockPrisma),
    );

    mockEmail.sendODACompletionNotification.mockResolvedValue(undefined);
    mockEmail.sendODANewSubmissionAlert.mockResolvedValue(undefined);
    mockScoring.computeBlockScore.mockReturnValue(75);
    mockScoring.computeOverallScore.mockReturnValue(68.5);
    mockScoring.generateSummary.mockResolvedValue(
      '## ODA Summary\nTest summary.',
    );
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // GET /oda/structure — public
  // ═══════════════════════════════════════════════════════════════════════════

  describe('GET /oda/structure', () => {
    it('200 — returns pillar → block → question tree (public, no auth)', async () => {
      mockPrisma.oDAPillar.findMany.mockResolvedValue([
        makePillar({ buildingBlocks: [makeBlock()] }),
      ]);

      const { body } = await request(app.getHttpServer())
        .get('/oda/structure')
        .expect(200);

      expect(body.status).toBe(true);
      expect(body.data).toHaveLength(1);
      expect(body.data[0].name).toBe('Leadership');
      expect(body.data[0].buildingBlocks[0].name).toBe('Governance');
    });

    it('200 — returns empty array when no structure seeded', async () => {
      const { body } = await request(app.getHttpServer())
        .get('/oda/structure')
        .expect(200);

      expect(body.status).toBe(true);
      expect(body.data).toHaveLength(0);
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // POST /oda/admin/pillars
  // ═══════════════════════════════════════════════════════════════════════════

  describe('POST /oda/admin/pillars', () => {
    it('201 — super admin creates a pillar', async () => {
      mockPrisma.oDAPillar.findUnique.mockResolvedValue(null);
      mockPrisma.oDAPillar.create.mockResolvedValue(makePillar());

      const { body } = await request(app.getHttpServer())
        .post('/oda/admin/pillars')
        .set('Authorization', `Bearer ${adminToken()}`)
        .send({ name: 'Leadership', order: 1 })
        .expect(201);

      expect(body.status).toBe(true);
      expect(body.data.name).toBe('Leadership');
    });

    it('201 — content admin can also create a pillar', async () => {
      mockPrisma.oDAPillar.findUnique.mockResolvedValue(null);
      mockPrisma.oDAPillar.create.mockResolvedValue(makePillar());

      const { body } = await request(app.getHttpServer())
        .post('/oda/admin/pillars')
        .set('Authorization', `Bearer ${contentAdminToken()}`)
        .send({ name: 'Leadership', order: 1 })
        .expect(201);

      expect(body.status).toBe(true);
    });

    it('409 — rejects duplicate pillar name', async () => {
      mockPrisma.oDAPillar.findUnique.mockResolvedValue(makePillar());

      const { body } = await request(app.getHttpServer())
        .post('/oda/admin/pillars')
        .set('Authorization', `Bearer ${adminToken()}`)
        .send({ name: 'Leadership', order: 1 })
        .expect(201);

      expect(body.status).toBe(false);
      expect(body.statusCode).toBe(409);
    });

    it('400 — rejects missing name', async () => {
      await request(app.getHttpServer())
        .post('/oda/admin/pillars')
        .set('Authorization', `Bearer ${adminToken()}`)
        .send({ order: 1 })
        .expect(400);
    });

    it('400 — rejects missing order', async () => {
      await request(app.getHttpServer())
        .post('/oda/admin/pillars')
        .set('Authorization', `Bearer ${adminToken()}`)
        .send({ name: 'Leadership' })
        .expect(400);
    });

    it('403 — NGO cannot create pillars', async () => {
      await request(app.getHttpServer())
        .post('/oda/admin/pillars')
        .set('Authorization', `Bearer ${ngoToken()}`)
        .send({ name: 'Leadership', order: 1 })
        .expect(403);
    });

    it('401 — unauthenticated request rejected', async () => {
      await request(app.getHttpServer())
        .post('/oda/admin/pillars')
        .send({ name: 'Leadership', order: 1 })
        .expect(401);
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // PATCH /oda/admin/pillars/:id
  // ═══════════════════════════════════════════════════════════════════════════

  describe('PATCH /oda/admin/pillars/:id', () => {
    it('200 — updates pillar name and order', async () => {
      mockPrisma.oDAPillar.findUnique.mockResolvedValue(makePillar());
      mockPrisma.oDAPillar.update.mockResolvedValue(
        makePillar({ name: 'Leadership & Governance' }),
      );

      const { body } = await request(app.getHttpServer())
        .patch(`/oda/admin/pillars/${PILLAR_UUID}`)
        .set('Authorization', `Bearer ${adminToken()}`)
        .send({ name: 'Leadership & Governance' })
        .expect(200);

      expect(body.status).toBe(true);
      expect(body.data.name).toBe('Leadership & Governance');
    });

    it('404 — returns 404 for unknown pillar', async () => {
      mockPrisma.oDAPillar.findUnique.mockResolvedValue(null);

      const { body } = await request(app.getHttpServer())
        .patch(`/oda/admin/pillars/${PILLAR_UUID}`)
        .set('Authorization', `Bearer ${adminToken()}`)
        .send({ name: 'New Name' })
        .expect(200);

      expect(body.status).toBe(false);
      expect(body.statusCode).toBe(404);
    });

    it('400 — rejects non-UUID :id', async () => {
      await request(app.getHttpServer())
        .patch('/oda/admin/pillars/not-a-uuid')
        .set('Authorization', `Bearer ${adminToken()}`)
        .send({ name: 'Test' })
        .expect(400);
    });

    it('403 — EXPERT cannot update pillars', async () => {
      await request(app.getHttpServer())
        .patch(`/oda/admin/pillars/${PILLAR_UUID}`)
        .set('Authorization', `Bearer ${expertToken()}`)
        .send({ name: 'Test' })
        .expect(403);
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // DELETE /oda/admin/pillars/:id
  // ═══════════════════════════════════════════════════════════════════════════

  describe('DELETE /oda/admin/pillars/:id', () => {
    it('200 — super admin deletes an empty pillar', async () => {
      mockPrisma.oDAPillar.findUnique.mockResolvedValue(
        makePillar({ buildingBlocks: [] }),
      );
      mockPrisma.oDAPillar.delete.mockResolvedValue({});

      const { body } = await request(app.getHttpServer())
        .delete(`/oda/admin/pillars/${PILLAR_UUID}`)
        .set('Authorization', `Bearer ${adminToken()}`)
        .expect(200);

      expect(body.status).toBe(true);
      expect(body.message).toMatch(/deleted/i);
    });

    it('400 — cannot delete pillar with building blocks', async () => {
      mockPrisma.oDAPillar.findUnique.mockResolvedValue(
        makePillar({ buildingBlocks: [{ id: BLOCK_UUID }] }),
      );

      const { body } = await request(app.getHttpServer())
        .delete(`/oda/admin/pillars/${PILLAR_UUID}`)
        .set('Authorization', `Bearer ${adminToken()}`)
        .expect(200);

      expect(body.status).toBe(false);
      expect(body.statusCode).toBe(400);
      expect(body.message).toMatch(/building blocks/i);
    });

    it('403 — content admin cannot delete pillars', async () => {
      await request(app.getHttpServer())
        .delete(`/oda/admin/pillars/${PILLAR_UUID}`)
        .set('Authorization', `Bearer ${contentAdminToken()}`)
        .expect(403);
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // POST /oda/admin/blocks
  // ═══════════════════════════════════════════════════════════════════════════

  describe('POST /oda/admin/blocks', () => {
    it('201 — creates a building block', async () => {
      mockPrisma.oDAPillar.findUnique.mockResolvedValue(makePillar());
      mockPrisma.oDABuildingBlock.findUnique.mockResolvedValue(null);
      mockPrisma.oDABuildingBlock.create.mockResolvedValue(makeBlock());

      const { body } = await request(app.getHttpServer())
        .post('/oda/admin/blocks')
        .set('Authorization', `Bearer ${adminToken()}`)
        .send({
          name: 'Governance',
          pillarId: PILLAR_UUID,
          order: 1,
          maxScore: 100,
        })
        .expect(201);

      expect(body.status).toBe(true);
      expect(body.data.name).toBe('Governance');
    });

    it('404 — rejects unknown pillarId', async () => {
      mockPrisma.oDAPillar.findUnique.mockResolvedValue(null);

      const { body } = await request(app.getHttpServer())
        .post('/oda/admin/blocks')
        .set('Authorization', `Bearer ${adminToken()}`)
        .send({ name: 'Governance', pillarId: PILLAR_UUID, order: 1 })
        .expect(201);

      expect(body.status).toBe(false);
      expect(body.statusCode).toBe(404);
    });

    it('400 — rejects missing required fields', async () => {
      await request(app.getHttpServer())
        .post('/oda/admin/blocks')
        .set('Authorization', `Bearer ${adminToken()}`)
        .send({ name: 'Governance' }) // missing pillarId, order
        .expect(400);
    });

    it('400 — rejects invalid pillarId (not a UUID)', async () => {
      await request(app.getHttpServer())
        .post('/oda/admin/blocks')
        .set('Authorization', `Bearer ${adminToken()}`)
        .send({ name: 'Governance', pillarId: 'not-a-uuid', order: 1 })
        .expect(400);
    });

    it('403 — NGO cannot create blocks', async () => {
      await request(app.getHttpServer())
        .post('/oda/admin/blocks')
        .set('Authorization', `Bearer ${ngoToken()}`)
        .send({ name: 'Governance', pillarId: PILLAR_UUID, order: 1 })
        .expect(403);
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // PATCH /oda/admin/blocks/:id
  // ═══════════════════════════════════════════════════════════════════════════

  describe('PATCH /oda/admin/blocks/:id', () => {
    it('200 — super admin updates maxScore', async () => {
      mockPrisma.oDABuildingBlock.findUnique.mockResolvedValue(makeBlock());
      mockPrisma.oDABuildingBlock.update.mockResolvedValue(
        makeBlock({ maxScore: 80 }),
      );

      const { body } = await request(app.getHttpServer())
        .patch(`/oda/admin/blocks/${BLOCK_UUID}`)
        .set('Authorization', `Bearer ${adminToken()}`)
        .send({ maxScore: 80 })
        .expect(200);

      expect(body.status).toBe(true);
      expect(body.data.maxScore).toBe(80);
    });

    it('404 — returns 404 for unknown block', async () => {
      mockPrisma.oDABuildingBlock.findUnique.mockResolvedValue(null);

      const { body } = await request(app.getHttpServer())
        .patch(`/oda/admin/blocks/${BLOCK_UUID}`)
        .set('Authorization', `Bearer ${adminToken()}`)
        .send({ maxScore: 80 })
        .expect(200);

      expect(body.status).toBe(false);
      expect(body.statusCode).toBe(404);
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // DELETE /oda/admin/blocks/:id
  // ═══════════════════════════════════════════════════════════════════════════

  describe('DELETE /oda/admin/blocks/:id', () => {
    it('200 — deletes block and cascades questions', async () => {
      mockPrisma.oDABuildingBlock.findUnique.mockResolvedValue(makeBlock());
      mockPrisma.oDAQuestion.deleteMany.mockResolvedValue({ count: 1 });
      mockPrisma.oDABuildingBlock.delete.mockResolvedValue({});

      const { body } = await request(app.getHttpServer())
        .delete(`/oda/admin/blocks/${BLOCK_UUID}`)
        .set('Authorization', `Bearer ${adminToken()}`)
        .expect(200);

      expect(body.status).toBe(true);
      expect(body.message).toMatch(/deleted/i);
    });

    it('403 — content admin cannot delete blocks', async () => {
      await request(app.getHttpServer())
        .delete(`/oda/admin/blocks/${BLOCK_UUID}`)
        .set('Authorization', `Bearer ${contentAdminToken()}`)
        .expect(403);
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // POST /oda/admin/blocks/:blockId/questions
  // ═══════════════════════════════════════════════════════════════════════════

  describe('POST /oda/admin/blocks/:blockId/questions', () => {
    it('201 — creates a question under a block', async () => {
      mockPrisma.oDABuildingBlock.findUnique.mockResolvedValue(makeBlock());
      mockPrisma.oDAQuestion.create.mockResolvedValue(makeQuestion());

      const { body } = await request(app.getHttpServer())
        .post(`/oda/admin/blocks/${BLOCK_UUID}/questions`)
        .set('Authorization', `Bearer ${adminToken()}`)
        .send({ text: 'Do you have a board?', order: 1 })
        .expect(201);

      expect(body.status).toBe(true);
      expect(body.data.text).toBe('Do you have a board?');
    });

    it('400 — rejects missing text', async () => {
      await request(app.getHttpServer())
        .post(`/oda/admin/blocks/${BLOCK_UUID}/questions`)
        .set('Authorization', `Bearer ${adminToken()}`)
        .send({ order: 1 })
        .expect(400);
    });

    it('404 — rejects unknown blockId', async () => {
      mockPrisma.oDABuildingBlock.findUnique.mockResolvedValue(null);

      const { body } = await request(app.getHttpServer())
        .post(`/oda/admin/blocks/${BLOCK_UUID}/questions`)
        .set('Authorization', `Bearer ${adminToken()}`)
        .send({ text: 'Do you have a board?', order: 1 })
        .expect(201);

      expect(body.status).toBe(false);
      expect(body.statusCode).toBe(404);
    });

    it('400 — rejects non-UUID blockId in path', async () => {
      await request(app.getHttpServer())
        .post('/oda/admin/blocks/not-a-uuid/questions')
        .set('Authorization', `Bearer ${adminToken()}`)
        .send({ text: 'Do you have a board?', order: 1 })
        .expect(400);
    });

    it('403 — NGO cannot create questions', async () => {
      await request(app.getHttpServer())
        .post(`/oda/admin/blocks/${BLOCK_UUID}/questions`)
        .set('Authorization', `Bearer ${ngoToken()}`)
        .send({ text: 'Do you have a board?', order: 1 })
        .expect(403);
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // PATCH /oda/admin/questions/:id
  // ═══════════════════════════════════════════════════════════════════════════

  describe('PATCH /oda/admin/questions/:id', () => {
    it('200 — updates question text', async () => {
      mockPrisma.oDAQuestion.findUnique.mockResolvedValue(makeQuestion());
      mockPrisma.oDAQuestion.update.mockResolvedValue(
        makeQuestion({ text: 'Updated question text?' }),
      );

      const { body } = await request(app.getHttpServer())
        .patch(`/oda/admin/questions/${QUESTION_UUID}`)
        .set('Authorization', `Bearer ${adminToken()}`)
        .send({ text: 'Updated question text?' })
        .expect(200);

      expect(body.status).toBe(true);
      expect(body.data.text).toBe('Updated question text?');
    });

    it('404 — returns 404 for unknown question', async () => {
      mockPrisma.oDAQuestion.findUnique.mockResolvedValue(null);

      const { body } = await request(app.getHttpServer())
        .patch(`/oda/admin/questions/${QUESTION_UUID}`)
        .set('Authorization', `Bearer ${adminToken()}`)
        .send({ text: 'Updated?' })
        .expect(200);

      expect(body.status).toBe(false);
      expect(body.statusCode).toBe(404);
    });

    it('403 — NGO cannot update questions', async () => {
      await request(app.getHttpServer())
        .patch(`/oda/admin/questions/${QUESTION_UUID}`)
        .set('Authorization', `Bearer ${ngoToken()}`)
        .send({ text: 'Updated?' })
        .expect(403);
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // DELETE /oda/admin/questions/:id
  // ═══════════════════════════════════════════════════════════════════════════

  describe('DELETE /oda/admin/questions/:id', () => {
    it('200 — deletes a question', async () => {
      mockPrisma.oDAQuestion.findUnique.mockResolvedValue(makeQuestion());
      mockPrisma.oDAQuestion.delete.mockResolvedValue({});

      const { body } = await request(app.getHttpServer())
        .delete(`/oda/admin/questions/${QUESTION_UUID}`)
        .set('Authorization', `Bearer ${adminToken()}`)
        .expect(200);

      expect(body.status).toBe(true);
      expect(body.message).toMatch(/deleted/i);
    });

    it('403 — content admin cannot delete questions', async () => {
      await request(app.getHttpServer())
        .delete(`/oda/admin/questions/${QUESTION_UUID}`)
        .set('Authorization', `Bearer ${contentAdminToken()}`)
        .expect(403);
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // POST /oda/assessments — start assessment
  // ═══════════════════════════════════════════════════════════════════════════

  describe('POST /oda/assessments', () => {
    it('201 — NGO starts a new assessment', async () => {
      mockPrisma.oDAAssessment.findFirst.mockResolvedValue(null); // no in-progress
      mockPrisma.oDABuildingBlock.findMany.mockResolvedValue([makeBlock()]);
      mockPrisma.$transaction.mockImplementation(async (fn: any) => {
        const created = { id: ASSESSMENT_UUID };
        mockPrisma.oDAAssessment.create.mockResolvedValue(created);
        return fn(mockPrisma);
      });
      mockPrisma.oDAAssessment.create.mockResolvedValue({
        id: ASSESSMENT_UUID,
      });
      mockPrisma.oDABlockResponse.createMany.mockResolvedValue({ count: 1 });
      mockPrisma.oDAAssessment.findUnique.mockResolvedValue(makeAssessment());

      const { body } = await request(app.getHttpServer())
        .post('/oda/assessments')
        .set('Authorization', `Bearer ${ngoToken()}`)
        .expect(201);

      expect(body.status).toBe(true);
      expect(body.message).toMatch(/started/i);
      expect(body.data.id).toBe(ASSESSMENT_UUID);
      expect(body.data.blocksTotal).toBe(1);
      expect(body.data.blocksSubmitted).toBe(0);
    });

    it('409 — blocks start when IN_PROGRESS assessment exists', async () => {
      mockPrisma.oDAAssessment.findFirst.mockResolvedValue(
        makeAssessment({ status: FormStatus.IN_PROGRESS }),
      );

      const { body } = await request(app.getHttpServer())
        .post('/oda/assessments')
        .set('Authorization', `Bearer ${ngoToken()}`)
        .expect(201);

      expect(body.status).toBe(false);
      expect(body.statusCode).toBe(409);
      expect(body.message).toMatch(/already have an assessment in progress/i);
    });

    it('400 — rejects NGO with no org profile', async () => {
      mockPrisma.user.findUnique.mockImplementation(({ where }: any) => {
        if (where?.id === NGO_UUID)
          return Promise.resolve(makeNgoUser({ organization: null }));
        if (where?.id === ADMIN_UUID) return Promise.resolve(makeAdminUser());
        return Promise.resolve(null);
      });

      const { body } = await request(app.getHttpServer())
        .post('/oda/assessments')
        .set('Authorization', `Bearer ${ngoToken()}`)
        .expect(201);

      expect(body.status).toBe(false);
      expect(body.statusCode).toBe(400);
      expect(body.message).toMatch(/organization profile/i);
    });

    it('403 — EXPERT cannot start assessment', async () => {
      await request(app.getHttpServer())
        .post('/oda/assessments')
        .set('Authorization', `Bearer ${expertToken()}`)
        .expect(403);
    });

    it('403 — SUPER_ADMIN cannot start assessment', async () => {
      await request(app.getHttpServer())
        .post('/oda/assessments')
        .set('Authorization', `Bearer ${adminToken()}`)
        .expect(403);
    });

    it('401 — unauthenticated request rejected', async () => {
      await request(app.getHttpServer()).post('/oda/assessments').expect(401);
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // GET /oda/assessments — list
  // ═══════════════════════════════════════════════════════════════════════════

  describe('GET /oda/assessments', () => {
    it('200 — returns list with progress fields', async () => {
      mockPrisma.oDAAssessment.findMany.mockResolvedValue([makeAssessment()]);
      mockPrisma.oDAAssessment.count.mockResolvedValue(1);

      const { body } = await request(app.getHttpServer())
        .get('/oda/assessments')
        .set('Authorization', `Bearer ${ngoToken()}`)
        .expect(200);

      expect(body.status).toBe(true);
      expect(body.data).toHaveLength(1);
      expect(body.data[0].blocksTotal).toBeDefined();
      expect(body.data[0].blocksSubmitted).toBeDefined();
      expect(body.data[0].completionPercent).toBeDefined();
      expect(body.total).toBe(1);
    });

    it('200 — list does NOT include aiSummary or blockResponses detail', async () => {
      mockPrisma.oDAAssessment.findMany.mockResolvedValue([makeAssessment()]);
      mockPrisma.oDAAssessment.count.mockResolvedValue(1);

      const { body } = await request(app.getHttpServer())
        .get('/oda/assessments')
        .set('Authorization', `Bearer ${ngoToken()}`)
        .expect(200);

      expect(body.data[0].aiSummary).toBeUndefined();
      expect(body.data[0].blockResponses).toBeUndefined();
    });

    it('200 — filters by status', async () => {
      mockPrisma.oDAAssessment.findMany.mockResolvedValue([]);
      mockPrisma.oDAAssessment.count.mockResolvedValue(0);

      const { body } = await request(app.getHttpServer())
        .get('/oda/assessments?status=COMPLETED')
        .set('Authorization', `Bearer ${ngoToken()}`)
        .expect(200);

      expect(body.data).toHaveLength(0);
    });

    it('400 — rejects invalid status enum', async () => {
      await request(app.getHttpServer())
        .get('/oda/assessments?status=INVALID')
        .set('Authorization', `Bearer ${ngoToken()}`)
        .expect(400);
    });

    it('403 — EXPERT cannot access NGO list', async () => {
      await request(app.getHttpServer())
        .get('/oda/assessments')
        .set('Authorization', `Bearer ${expertToken()}`)
        .expect(403);
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // GET /oda/assessments/:id — single
  // ═══════════════════════════════════════════════════════════════════════════

  describe('GET /oda/assessments/:id', () => {
    it('200 — returns full assessment with block responses', async () => {
      mockPrisma.oDAAssessment.findFirst.mockResolvedValue(makeAssessment());

      const { body } = await request(app.getHttpServer())
        .get(`/oda/assessments/${ASSESSMENT_UUID}`)
        .set('Authorization', `Bearer ${ngoToken()}`)
        .expect(200);

      expect(body.status).toBe(true);
      expect(body.data.id).toBe(ASSESSMENT_UUID);
      expect(body.data.blockResponses).toHaveLength(1);
      expect(body.data.completionPercent).toBeDefined();
    });

    it('404 — returns 404 when assessment not found or not owned', async () => {
      mockPrisma.oDAAssessment.findFirst.mockResolvedValue(null);

      const { body } = await request(app.getHttpServer())
        .get(`/oda/assessments/${ASSESSMENT_UUID}`)
        .set('Authorization', `Bearer ${ngoToken()}`)
        .expect(200);

      expect(body.status).toBe(false);
      expect(body.statusCode).toBe(404);
    });

    it('400 — rejects non-UUID :id', async () => {
      await request(app.getHttpServer())
        .get('/oda/assessments/not-a-uuid')
        .set('Authorization', `Bearer ${ngoToken()}`)
        .expect(400);
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // PATCH /oda/assessments/:id/blocks/:blockId — save answers
  // ═══════════════════════════════════════════════════════════════════════════

  describe('PATCH /oda/assessments/:id/blocks/:blockId', () => {
    const validAnswers = {
      answers: [
        {
          questionId: QUESTION_UUID,
          selectedScale: 3,
          evidence: 'We have a signed charter.',
        },
      ],
    };

    it('200 — saves block answers and returns computed blockScore', async () => {
      mockPrisma.oDAAssessment.findFirst.mockResolvedValue(makeAssessment());
      mockPrisma.oDABlockResponse.findFirst.mockResolvedValue(
        makeBlockResponse(),
      );
      mockPrisma.oDABlockResponse.update.mockResolvedValue(
        makeBlockResponse({ blockScore: 75, answers: validAnswers.answers }),
      );

      const { body } = await request(app.getHttpServer())
        .patch(`/oda/assessments/${ASSESSMENT_UUID}/blocks/${BLOCK_UUID}`)
        .set('Authorization', `Bearer ${ngoToken()}`)
        .send(validAnswers)
        .expect(200);

      expect(body.status).toBe(true);
      expect(body.message).toMatch(/saved/i);
      expect(body.data.blockScore).toBe(75);
    });

    it('400 — rejects invalid selectedScale (5 is out of range)', async () => {
      await request(app.getHttpServer())
        .patch(`/oda/assessments/${ASSESSMENT_UUID}/blocks/${BLOCK_UUID}`)
        .set('Authorization', `Bearer ${ngoToken()}`)
        .send({ answers: [{ questionId: QUESTION_UUID, selectedScale: 5 }] })
        .expect(400);
    });

    it('400 — rejects selectedScale of 0', async () => {
      await request(app.getHttpServer())
        .patch(`/oda/assessments/${ASSESSMENT_UUID}/blocks/${BLOCK_UUID}`)
        .set('Authorization', `Bearer ${ngoToken()}`)
        .send({ answers: [{ questionId: QUESTION_UUID, selectedScale: 0 }] })
        .expect(400);
    });

    it('400 — rejects invalid questionId (not a UUID)', async () => {
      await request(app.getHttpServer())
        .patch(`/oda/assessments/${ASSESSMENT_UUID}/blocks/${BLOCK_UUID}`)
        .set('Authorization', `Bearer ${ngoToken()}`)
        .send({ answers: [{ questionId: 'bad-id', selectedScale: 3 }] })
        .expect(400);
    });

    it('400 — rejects missing answers array', async () => {
      await request(app.getHttpServer())
        .patch(`/oda/assessments/${ASSESSMENT_UUID}/blocks/${BLOCK_UUID}`)
        .set('Authorization', `Bearer ${ngoToken()}`)
        .send({})
        .expect(400);
    });

    it('400 — cannot save answers on a SUBMITTED block', async () => {
      mockPrisma.oDAAssessment.findFirst.mockResolvedValue(makeAssessment());
      mockPrisma.oDABlockResponse.findFirst.mockResolvedValue(
        makeBlockResponse({ status: 'SUBMITTED' }),
      );

      const { body } = await request(app.getHttpServer())
        .patch(`/oda/assessments/${ASSESSMENT_UUID}/blocks/${BLOCK_UUID}`)
        .set('Authorization', `Bearer ${ngoToken()}`)
        .send(validAnswers)
        .expect(200);

      expect(body.status).toBe(false);
      expect(body.statusCode).toBe(400);
      expect(body.message).toMatch(/already been submitted/i);
    });

    it('400 — rejects non-UUID blockId', async () => {
      await request(app.getHttpServer())
        .patch(`/oda/assessments/${ASSESSMENT_UUID}/blocks/not-a-uuid`)
        .set('Authorization', `Bearer ${ngoToken()}`)
        .send(validAnswers)
        .expect(400);
    });

    it('403 — EXPERT cannot save block answers', async () => {
      await request(app.getHttpServer())
        .patch(`/oda/assessments/${ASSESSMENT_UUID}/blocks/${BLOCK_UUID}`)
        .set('Authorization', `Bearer ${expertToken()}`)
        .send(validAnswers)
        .expect(403);
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // POST /oda/assessments/:id/blocks/:blockId/submit — submit block
  // ═══════════════════════════════════════════════════════════════════════════

  describe('POST /oda/assessments/:id/blocks/:blockId/submit', () => {
    it('200 — submits a fully answered block', async () => {
      mockPrisma.oDAAssessment.findFirst.mockResolvedValue(makeAssessment());
      mockPrisma.oDABlockResponse.findFirst.mockResolvedValue(
        makeBlockResponse({
          answers: [
            { questionId: QUESTION_UUID, selectedScale: 3, evidence: 'Yes.' },
          ],
        }),
      );
      mockPrisma.oDABlockResponse.update.mockResolvedValue(
        makeBlockResponse({ status: 'SUBMITTED' }),
      );

      const { body } = await request(app.getHttpServer())
        .post(`/oda/assessments/${ASSESSMENT_UUID}/blocks/${BLOCK_UUID}/submit`)
        .set('Authorization', `Bearer ${ngoToken()}`)
        .expect(200);

      expect(body.status).toBe(true);
      expect(body.message).toMatch(/submitted/i);
    });

    it('400 — cannot submit block with unanswered questions', async () => {
      mockPrisma.oDAAssessment.findFirst.mockResolvedValue(makeAssessment());
      mockPrisma.oDABlockResponse.findFirst.mockResolvedValue(
        makeBlockResponse({ answers: [] }), // no answers
      );

      const { body } = await request(app.getHttpServer())
        .post(`/oda/assessments/${ASSESSMENT_UUID}/blocks/${BLOCK_UUID}/submit`)
        .set('Authorization', `Bearer ${ngoToken()}`)
        .expect(200);

      expect(body.status).toBe(false);
      expect(body.statusCode).toBe(400);
      expect(body.message).toMatch(/unanswered/i);
    });

    it('400 — cannot submit an already-submitted block', async () => {
      mockPrisma.oDAAssessment.findFirst.mockResolvedValue(makeAssessment());
      mockPrisma.oDABlockResponse.findFirst.mockResolvedValue(
        makeBlockResponse({ status: 'SUBMITTED' }),
      );

      const { body } = await request(app.getHttpServer())
        .post(`/oda/assessments/${ASSESSMENT_UUID}/blocks/${BLOCK_UUID}/submit`)
        .set('Authorization', `Bearer ${ngoToken()}`)
        .expect(200);

      expect(body.status).toBe(false);
      expect(body.statusCode).toBe(400);
    });

    it('403 — EXPERT cannot submit blocks', async () => {
      await request(app.getHttpServer())
        .post(`/oda/assessments/${ASSESSMENT_UUID}/blocks/${BLOCK_UUID}/submit`)
        .set('Authorization', `Bearer ${expertToken()}`)
        .expect(403);
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // POST /oda/assessments/:id/submit — submit full assessment
  // ═══════════════════════════════════════════════════════════════════════════

  describe('POST /oda/assessments/:id/submit', () => {
    it('200 — submits assessment when all blocks are done', async () => {
      mockPrisma.oDAAssessment.findFirst.mockResolvedValue(
        makeAssessment({
          blockResponses: [
            makeBlockResponse({ status: 'SUBMITTED', blockScore: 75 }),
          ],
        }),
      );
      mockPrisma.oDAAssessment.update.mockResolvedValue(
        makeAssessment({ status: FormStatus.SUBMITTED, overallScore: 68.5 }),
      );

      const { body } = await request(app.getHttpServer())
        .post(`/oda/assessments/${ASSESSMENT_UUID}/submit`)
        .set('Authorization', `Bearer ${ngoToken()}`)
        .expect(200);

      expect(body.status).toBe(true);
      expect(body.message).toMatch(/submitted/i);
      expect(body.data.overallScore).toBe(68.5);
    });

    it('400 — blocked when some blocks still in progress', async () => {
      mockPrisma.oDAAssessment.findFirst.mockResolvedValue(
        makeAssessment({
          blockResponses: [
            makeBlockResponse({ status: 'SUBMITTED' }),
            makeBlockResponse({
              id: OTHER_UUID,
              buildingBlockId: OTHER_UUID,
              status: 'IN_PROGRESS',
              buildingBlock: makeBlock({ id: OTHER_UUID, name: 'Management' }),
            }),
          ],
        }),
      );

      const { body } = await request(app.getHttpServer())
        .post(`/oda/assessments/${ASSESSMENT_UUID}/submit`)
        .set('Authorization', `Bearer ${ngoToken()}`)
        .expect(200);

      expect(body.status).toBe(false);
      expect(body.statusCode).toBe(400);
      expect(body.message).toMatch(/in progress/i);
    });

    it('400 — cannot submit an already SUBMITTED assessment', async () => {
      mockPrisma.oDAAssessment.findFirst.mockResolvedValue(
        makeAssessment({ status: FormStatus.SUBMITTED }),
      );

      const { body } = await request(app.getHttpServer())
        .post(`/oda/assessments/${ASSESSMENT_UUID}/submit`)
        .set('Authorization', `Bearer ${ngoToken()}`)
        .expect(200);

      expect(body.status).toBe(false);
      expect(body.statusCode).toBe(400);
    });

    it('404 — returns 404 for unknown assessment', async () => {
      mockPrisma.oDAAssessment.findFirst.mockResolvedValue(null);

      const { body } = await request(app.getHttpServer())
        .post(`/oda/assessments/${ASSESSMENT_UUID}/submit`)
        .set('Authorization', `Bearer ${ngoToken()}`)
        .expect(200);

      expect(body.status).toBe(false);
      expect(body.statusCode).toBe(404);
    });

    it('403 — EXPERT cannot submit assessments', async () => {
      await request(app.getHttpServer())
        .post(`/oda/assessments/${ASSESSMENT_UUID}/submit`)
        .set('Authorization', `Bearer ${expertToken()}`)
        .expect(403);
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // DELETE /oda/assessments/:id
  // ═══════════════════════════════════════════════════════════════════════════

  describe('DELETE /oda/assessments/:id', () => {
    it('200 — deletes an in-progress assessment', async () => {
      mockPrisma.oDAAssessment.findFirst.mockResolvedValue(makeAssessment());
      mockPrisma.oDAAssessment.delete.mockResolvedValue({});

      const { body } = await request(app.getHttpServer())
        .delete(`/oda/assessments/${ASSESSMENT_UUID}`)
        .set('Authorization', `Bearer ${ngoToken()}`)
        .expect(200);

      expect(body.status).toBe(true);
      expect(body.message).toMatch(/deleted/i);
    });

    it('400 — cannot delete a COMPLETED assessment', async () => {
      mockPrisma.oDAAssessment.findFirst.mockResolvedValue(
        makeAssessment({ status: FormStatus.COMPLETED }),
      );

      const { body } = await request(app.getHttpServer())
        .delete(`/oda/assessments/${ASSESSMENT_UUID}`)
        .set('Authorization', `Bearer ${ngoToken()}`)
        .expect(200);

      expect(body.status).toBe(false);
      expect(body.statusCode).toBe(400);
    });

    it('404 — returns 404 for unknown or unowned assessment', async () => {
      mockPrisma.oDAAssessment.findFirst.mockResolvedValue(null);

      const { body } = await request(app.getHttpServer())
        .delete(`/oda/assessments/${ASSESSMENT_UUID}`)
        .set('Authorization', `Bearer ${ngoToken()}`)
        .expect(200);

      expect(body.status).toBe(false);
      expect(body.statusCode).toBe(404);
    });

    it('400 — rejects non-UUID :id', async () => {
      await request(app.getHttpServer())
        .delete('/oda/assessments/not-a-uuid')
        .set('Authorization', `Bearer ${ngoToken()}`)
        .expect(400);
    });

    it('401 — unauthenticated request rejected', async () => {
      await request(app.getHttpServer())
        .delete(`/oda/assessments/${ASSESSMENT_UUID}`)
        .expect(401);
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // GET /oda/admin/assessments
  // ═══════════════════════════════════════════════════════════════════════════

  describe('GET /oda/admin/assessments', () => {
    it('200 — admin sees all assessments across all orgs', async () => {
      mockPrisma.oDAAssessment.findMany.mockResolvedValue([makeAssessment()]);
      mockPrisma.oDAAssessment.count.mockResolvedValue(1);

      const { body } = await request(app.getHttpServer())
        .get('/oda/admin/assessments')
        .set('Authorization', `Bearer ${adminToken()}`)
        .expect(200);

      expect(body.status).toBe(true);
      expect(body.data).toHaveLength(1);
      expect(body.total).toBe(1);
    });

    it('200 — supports status and orgId filters', async () => {
      mockPrisma.oDAAssessment.findMany.mockResolvedValue([]);
      mockPrisma.oDAAssessment.count.mockResolvedValue(0);

      const { body } = await request(app.getHttpServer())
        .get(`/oda/admin/assessments?status=COMPLETED&orgId=${ORG_UUID}`)
        .set('Authorization', `Bearer ${adminToken()}`)
        .expect(200);

      expect(body.data).toHaveLength(0);
    });

    it('403 — NGO cannot access admin list', async () => {
      await request(app.getHttpServer())
        .get('/oda/admin/assessments')
        .set('Authorization', `Bearer ${ngoToken()}`)
        .expect(403);
    });

    it('403 — EXPERT cannot access admin list', async () => {
      await request(app.getHttpServer())
        .get('/oda/admin/assessments')
        .set('Authorization', `Bearer ${expertToken()}`)
        .expect(403);
    });

    it('401 — unauthenticated request rejected', async () => {
      await request(app.getHttpServer())
        .get('/oda/admin/assessments')
        .expect(401);
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // GET /oda/admin/assessments/stats
  // ═══════════════════════════════════════════════════════════════════════════

  describe('GET /oda/admin/assessments/stats', () => {
    it('200 — returns all counts and block breakdown', async () => {
      mockPrisma.oDAAssessment.count
        .mockResolvedValueOnce(20) // total
        .mockResolvedValueOnce(8) // inProgress
        .mockResolvedValueOnce(5) // submitted
        .mockResolvedValueOnce(7); // completed

      mockPrisma.oDAAssessment.aggregate.mockResolvedValue({
        _avg: { overallScore: 64.3 },
      });
      mockPrisma.oDABlockResponse.findMany.mockResolvedValue([
        {
          buildingBlockId: BLOCK_UUID,
          blockScore: 75,
          buildingBlock: makeBlock(),
        },
      ]);

      const { body } = await request(app.getHttpServer())
        .get('/oda/admin/assessments/stats')
        .set('Authorization', `Bearer ${adminToken()}`)
        .expect(200);

      expect(body.status).toBe(true);
      expect(body.data.total).toBe(20);
      expect(body.data.inProgress).toBe(8);
      expect(body.data.submitted).toBe(5);
      expect(body.data.completed).toBe(7);
      expect(body.data.averageOverallScore).toBe(64.3);
      expect(body.data.blockBreakdown).toHaveLength(1);
    });

    it('403 — NGO cannot access stats', async () => {
      await request(app.getHttpServer())
        .get('/oda/admin/assessments/stats')
        .set('Authorization', `Bearer ${ngoToken()}`)
        .expect(403);
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // GET /oda/admin/assessments/:id
  // ═══════════════════════════════════════════════════════════════════════════

  describe('GET /oda/admin/assessments/:id', () => {
    it('200 — admin retrieves any assessment with AI summary', async () => {
      mockPrisma.oDAAssessment.findUnique.mockResolvedValue(
        makeAssessment({
          status: FormStatus.COMPLETED,
          overallScore: 72.5,
          aiSummary: '## ODA Summary\nStrong governance.',
        }),
      );

      const { body } = await request(app.getHttpServer())
        .get(`/oda/admin/assessments/${ASSESSMENT_UUID}`)
        .set('Authorization', `Bearer ${adminToken()}`)
        .expect(200);

      expect(body.status).toBe(true);
      expect(body.data.id).toBe(ASSESSMENT_UUID);
      expect(body.data.overallScore).toBe(72.5);
      expect(body.data.aiSummary).toContain('ODA Summary');
    });

    it('404 — returns 404 for unknown assessment', async () => {
      mockPrisma.oDAAssessment.findUnique.mockResolvedValue(null);

      const { body } = await request(app.getHttpServer())
        .get(`/oda/admin/assessments/${ASSESSMENT_UUID}`)
        .set('Authorization', `Bearer ${adminToken()}`)
        .expect(200);

      expect(body.status).toBe(false);
      expect(body.statusCode).toBe(404);
    });

    it('400 — rejects non-UUID :id', async () => {
      await request(app.getHttpServer())
        .get('/oda/admin/assessments/not-a-uuid')
        .set('Authorization', `Bearer ${adminToken()}`)
        .expect(400);
    });

    it('403 — NGO cannot view admin detail (even own)', async () => {
      await request(app.getHttpServer())
        .get(`/oda/admin/assessments/${ASSESSMENT_UUID}`)
        .set('Authorization', `Bearer ${ngoToken()}`)
        .expect(403);
    });
  });
});
