/* eslint-disable @typescript-eslint/no-unused-vars */
import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { JwtService, JwtModule } from '@nestjs/jwt';
import { Reflector } from '@nestjs/core';
import { PassportModule } from '@nestjs/passport';
import { ConfigModule, ConfigService } from '@nestjs/config';
import request from 'supertest';
import { Role } from '@prisma/client';

import { DevPlanController } from 'src/dev-plan/controller/dev-plan.controller';
import { DevPlanService } from 'src/dev-plan/service/dev-plan.service';
import { JwtStrategy } from 'src/common/strategies/jwt.strategy';
import { JwtAuthGuard } from 'src/common/guards/jwt-auth.guard';
import { RolesGuard } from 'src/common/guards/roles.guard';
import { PrismaService } from 'src/prisma-module/prisma.service';

// ─────────────────────────────────────────────────────────────────────────────
// CONSTANTS
// ─────────────────────────────────────────────────────────────────────────────

const JWT_SECRET = 'test-secret-do-not-use-in-prod';

const NGO_UUID = 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11';
const ADMIN_UUID = 'b1ffcd00-0d1c-4ef8-bb6d-6bb9bd380a22';
const GUEST_UUID = 'c2eebc99-9c0b-4ef8-bb6d-6bb9bd380a33';
const ORG_UUID = 'd3eebc99-9c0b-4ef8-bb6d-6bb9bd380a44';
const PILLAR_UUID = 'e4eebc99-9c0b-4ef8-bb6d-6bb9bd380a55';
const BLOCK_UUID = 'f5eebc99-9c0b-4ef8-bb6d-6bb9bd380a66';
const INDICATOR_UUID = 'a1eebc99-9c0b-4ef8-bb6d-6bb9bd380a77';
const PRIORITY_UUID = 'b2eebc99-9c0b-4ef8-bb6d-6bb9bd380a88';
const ACTION_UUID = 'c3eebc99-9c0b-4ef8-bb6d-6bb9bd380a99';
const EVAL_UUID = 'd4eebc99-9c0b-4ef8-bb6d-6bb9bd380aaa';

// ─────────────────────────────────────────────────────────────────────────────
// FIXTURES
// ─────────────────────────────────────────────────────────────────────────────

function makeOrg(overrides: Record<string, any> = {}): any {
  return { id: ORG_UUID, userId: NGO_UUID, name: 'Test NGO', ...overrides };
}

function makePillar(overrides: Record<string, any> = {}): any {
  return { id: PILLAR_UUID, name: 'Governance', order: 1, ...overrides };
}

function makeBlock(overrides: Record<string, any> = {}): any {
  return {
    id: BLOCK_UUID,
    name: 'Financial Management',
    order: 1,
    maxScore: 100,
    pillarId: PILLAR_UUID,
    ...overrides,
  };
}

function makeIndicator(overrides: Record<string, any> = {}): any {
  return {
    id: INDICATOR_UUID,
    text: 'Does the org have a finance policy?',
    order: 1,
    buildingBlockId: BLOCK_UUID,
    ...overrides,
  };
}

function makePriorityArea(overrides: Record<string, any> = {}): any {
  return {
    id: PRIORITY_UUID,
    orgId: ORG_UUID,
    pillarId: PILLAR_UUID,
    buildingBlockId: BLOCK_UUID,
    indicatorId: INDICATOR_UUID,
    score: 72.5,
    strength: 'Strong community presence',
    weakness: 'Limited financial capacity',
    opportunity: 'New donor partnerships',
    threat: 'Policy changes',
    priority: 1,
    act: 'Develop financial SOP',
    pillar: makePillar(),
    buildingBlock: makeBlock(),
    indicator: makeIndicator(),
    actionPlan: null,
    evaluation: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

function makeActionPlan(overrides: Record<string, any> = {}): any {
  return {
    id: ACTION_UUID,
    priorityAreaId: PRIORITY_UUID,
    objective: 'Build robust financial management',
    kpi: 'Monthly reports submitted',
    actionSteps: '1. Hire finance officer',
    responsiblePerson: 'Executive Director',
    timeline: new Date('2025-12-31'),
    support: 'Finance committee',
    resourcePlan: 'QuickBooks licence',
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

function makeEvaluation(overrides: Record<string, any> = {}): any {
  return {
    id: EVAL_UUID,
    priorityAreaId: PRIORITY_UUID,
    whatWasDone: 'Hired finance officer and adopted QuickBooks',
    wereObjectivesMet: 'Partially',
    whatDidWeLearn: 'Capacity needs strengthening',
    nextSteps: 'Engage external auditor',
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

function makeNgoUser(): any {
  return {
    id: NGO_UUID,
    email: 'ngo@example.com',
    role: Role.NGO_MEMBER,
    status: 'APPROVED',
    adminPermission: null,
  };
}

function makeAdminUser(): any {
  return {
    id: ADMIN_UUID,
    email: 'admin@example.com',
    role: Role.SUPER_ADMIN,
    status: 'APPROVED',
    adminPermission: { permissions: ['org:read'] },
  };
}

function makeGuestUser(): any {
  return {
    id: GUEST_UUID,
    email: 'guest@example.com',
    role: Role.GUEST,
    status: 'APPROVED',
    adminPermission: null,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// MOCK PRISMA
// ─────────────────────────────────────────────────────────────────────────────

const mockPrisma = {
  user: {
    findUnique: jest.fn(),
  },
  organization: {
    findUnique: jest.fn(),
  },
  oDAPillar: {
    findUnique: jest.fn(),
  },
  oDABuildingBlock: {
    findUnique: jest.fn(),
  },
  oDAQuestion: {
    findUnique: jest.fn(),
  },
  devPlanPriorityArea: {
    findUnique: jest.fn(),
    findMany: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
  },
  devPlanActionPlan: {
    findUnique: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
  },
  devPlanEvaluation: {
    findUnique: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// BOOTSTRAP
// ─────────────────────────────────────────────────────────────────────────────

process.env.JWT_SECRET = JWT_SECRET;

let jwtService: JwtService;

describe('Dev Planning Module — E2E', () => {
  let app: INestApplication;

  const tok = (sub: string, role: string) => () =>
    jwtService.sign({ sub, email: `${role}@example.com`, role });

  let ngoToken: () => string;
  let adminToken: () => string;
  let guestToken: () => string;

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
      controllers: [DevPlanController],
      providers: [
        DevPlanService,
        JwtStrategy,
        Reflector,
        RolesGuard,
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
    ngoToken = tok(NGO_UUID, Role.NGO_MEMBER);
    adminToken = tok(ADMIN_UUID, Role.SUPER_ADMIN);
    guestToken = tok(GUEST_UUID, Role.GUEST);
  });

  afterAll(() => app.close());

  beforeEach(() => {
    jest.resetAllMocks();

    // JwtStrategy.validate() — restore user lookup after resetAllMocks
    mockPrisma.user.findUnique.mockImplementation(({ where }: any) => {
      if (where?.id === NGO_UUID) return Promise.resolve(makeNgoUser());
      if (where?.id === ADMIN_UUID) return Promise.resolve(makeAdminUser());
      if (where?.id === GUEST_UUID) return Promise.resolve(makeGuestUser());
      return Promise.resolve(null);
    });

    // Default FK chain mocks — can be overridden per test
    mockPrisma.organization.findUnique.mockResolvedValue(makeOrg());
    mockPrisma.oDAPillar.findUnique.mockResolvedValue(makePillar());
    mockPrisma.oDABuildingBlock.findUnique.mockResolvedValue(makeBlock());
    mockPrisma.oDAQuestion.findUnique.mockResolvedValue(makeIndicator());
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // POST /dev-plan/priorities
  // ═══════════════════════════════════════════════════════════════════════════

  describe('POST /dev-plan/priorities', () => {
    const validBody = {
      pillarId: PILLAR_UUID,
      buildingBlockId: BLOCK_UUID,
      indicatorId: INDICATOR_UUID,
      score: 72.5,
      strength: 'Strong community presence',
      weakness: 'Limited financial capacity',
      opportunity: 'New donor partnerships',
      threat: 'Policy changes',
      priority: 1,
      act: 'Develop financial SOP',
    };

    it('401 — no token', async () => {
      await request(app.getHttpServer())
        .post('/dev-plan/priorities')
        .send(validBody)
        .expect(401);
    });

    it('403 — GUEST role rejected', async () => {
      await request(app.getHttpServer())
        .post('/dev-plan/priorities')
        .set('Authorization', `Bearer ${guestToken()}`)
        .send(validBody)
        .expect(403);
    });

    it('400 — missing required fields (pillarId, buildingBlockId, indicatorId, priority)', async () => {
      await request(app.getHttpServer())
        .post('/dev-plan/priorities')
        .set('Authorization', `Bearer ${ngoToken()}`)
        .send({ score: 50 })
        .expect(400);
    });

    it('400 — invalid priority value (not 1|2|3|4)', async () => {
      await request(app.getHttpServer())
        .post('/dev-plan/priorities')
        .set('Authorization', `Bearer ${ngoToken()}`)
        .send({ ...validBody, priority: 5 })
        .expect(400);
    });

    it('400 — non-UUID pillarId rejected by ValidationPipe', async () => {
      await request(app.getHttpServer())
        .post('/dev-plan/priorities')
        .set('Authorization', `Bearer ${ngoToken()}`)
        .send({ ...validBody, pillarId: 'not-a-uuid' })
        .expect(400);
    });

    it('404 — org not found for this NGO_MEMBER', async () => {
      mockPrisma.organization.findUnique.mockResolvedValue(null);

      const { body } = await request(app.getHttpServer())
        .post('/dev-plan/priorities')
        .set('Authorization', `Bearer ${ngoToken()}`)
        .send(validBody)
        .expect(201);

      expect(body.status).toBe(false);
      expect(body.statusCode).toBe(404);
      expect(body.message).toMatch(/organization not found/i);
    });

    it('400 — pillar not found', async () => {
      mockPrisma.oDAPillar.findUnique.mockResolvedValue(null);

      const { body } = await request(app.getHttpServer())
        .post('/dev-plan/priorities')
        .set('Authorization', `Bearer ${ngoToken()}`)
        .send(validBody)
        .expect(201);

      expect(body.status).toBe(false);
      expect(body.statusCode).toBe(400);
      expect(body.message).toMatch(/pillar not found/i);
    });

    it('400 — building block not found', async () => {
      mockPrisma.oDABuildingBlock.findUnique.mockResolvedValue(null);

      const { body } = await request(app.getHttpServer())
        .post('/dev-plan/priorities')
        .set('Authorization', `Bearer ${ngoToken()}`)
        .send(validBody)
        .expect(201);

      expect(body.status).toBe(false);
      expect(body.statusCode).toBe(400);
      expect(body.message).toMatch(/building block not found/i);
    });

    it('400 — building block does not belong to the specified pillar', async () => {
      mockPrisma.oDABuildingBlock.findUnique.mockResolvedValue(
        makeBlock({ pillarId: 'wrong-pillar-id' }),
      );

      const { body } = await request(app.getHttpServer())
        .post('/dev-plan/priorities')
        .set('Authorization', `Bearer ${ngoToken()}`)
        .send(validBody)
        .expect(201);

      expect(body.status).toBe(false);
      expect(body.statusCode).toBe(400);
      expect(body.message).toMatch(/does not belong to the specified pillar/i);
    });

    it('400 — indicator not found', async () => {
      mockPrisma.oDAQuestion.findUnique.mockResolvedValue(null);

      const { body } = await request(app.getHttpServer())
        .post('/dev-plan/priorities')
        .set('Authorization', `Bearer ${ngoToken()}`)
        .send(validBody)
        .expect(201);

      expect(body.status).toBe(false);
      expect(body.statusCode).toBe(400);
      expect(body.message).toMatch(/indicator.*not found/i);
    });

    it('400 — indicator does not belong to the specified building block', async () => {
      mockPrisma.oDAQuestion.findUnique.mockResolvedValue(
        makeIndicator({ buildingBlockId: 'wrong-block-id' }),
      );

      const { body } = await request(app.getHttpServer())
        .post('/dev-plan/priorities')
        .set('Authorization', `Bearer ${ngoToken()}`)
        .send(validBody)
        .expect(201);

      expect(body.status).toBe(false);
      expect(body.statusCode).toBe(400);
      expect(body.message).toMatch(
        /does not belong to the specified building block/i,
      );
    });

    it('201 — creates priority area successfully', async () => {
      mockPrisma.devPlanPriorityArea.create.mockResolvedValue(
        makePriorityArea(),
      );

      const { body } = await request(app.getHttpServer())
        .post('/dev-plan/priorities')
        .set('Authorization', `Bearer ${ngoToken()}`)
        .send(validBody)
        .expect(201);

      expect(body.status).toBe(true);
      expect(body.statusCode).toBe(201);
      expect(body.data.priority).toBe(1);
      expect(body.data.pillarId).toBe(PILLAR_UUID);
      expect(mockPrisma.devPlanPriorityArea.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ orgId: ORG_UUID, priority: 1 }),
        }),
      );
    });

    it('201 — optional fields (score, SWOT, act) are accepted', async () => {
      const minimal = {
        pillarId: PILLAR_UUID,
        buildingBlockId: BLOCK_UUID,
        indicatorId: INDICATOR_UUID,
        priority: 2,
      };
      mockPrisma.devPlanPriorityArea.create.mockResolvedValue(
        makePriorityArea({
          ...minimal,
          score: null,
          strength: null,
          act: null,
        }),
      );

      const { body } = await request(app.getHttpServer())
        .post('/dev-plan/priorities')
        .set('Authorization', `Bearer ${ngoToken()}`)
        .send(minimal)
        .expect(201);

      expect(body.status).toBe(true);
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // GET /dev-plan/priorities
  // ═══════════════════════════════════════════════════════════════════════════

  describe('GET /dev-plan/priorities', () => {
    it('401 — no token', async () => {
      await request(app.getHttpServer())
        .get('/dev-plan/priorities')
        .expect(401);
    });

    it('403 — GUEST role rejected', async () => {
      await request(app.getHttpServer())
        .get('/dev-plan/priorities')
        .set('Authorization', `Bearer ${guestToken()}`)
        .expect(403);
    });

    it('404 — org not found', async () => {
      mockPrisma.organization.findUnique.mockResolvedValue(null);

      const { body } = await request(app.getHttpServer())
        .get('/dev-plan/priorities')
        .set('Authorization', `Bearer ${ngoToken()}`)
        .expect(200);

      expect(body.status).toBe(false);
      expect(body.statusCode).toBe(404);
    });

    it('200 — returns list ordered by priority asc', async () => {
      const areas = [
        makePriorityArea({ id: 'id-1', priority: 1 }),
        makePriorityArea({ id: 'id-2', priority: 2 }),
      ];
      mockPrisma.devPlanPriorityArea.findMany.mockResolvedValue(areas);

      const { body } = await request(app.getHttpServer())
        .get('/dev-plan/priorities')
        .set('Authorization', `Bearer ${ngoToken()}`)
        .expect(200);

      expect(body.status).toBe(true);
      expect(body.data).toHaveLength(2);
      expect(mockPrisma.devPlanPriorityArea.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { orgId: ORG_UUID },
          orderBy: [{ priority: 'asc' }, { createdAt: 'asc' }],
        }),
      );
    });

    it('200 — each area includes nested pillar, buildingBlock, indicator', async () => {
      mockPrisma.devPlanPriorityArea.findMany.mockResolvedValue([
        makePriorityArea(),
      ]);

      const { body } = await request(app.getHttpServer())
        .get('/dev-plan/priorities')
        .set('Authorization', `Bearer ${ngoToken()}`)
        .expect(200);

      const area = body.data[0];
      expect(area).toHaveProperty('pillar');
      expect(area).toHaveProperty('buildingBlock');
      expect(area).toHaveProperty('indicator');
    });

    it('200 — returns empty array when org has no priority areas', async () => {
      mockPrisma.devPlanPriorityArea.findMany.mockResolvedValue([]);

      const { body } = await request(app.getHttpServer())
        .get('/dev-plan/priorities')
        .set('Authorization', `Bearer ${ngoToken()}`)
        .expect(200);

      expect(body.data).toEqual([]);
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // GET /dev-plan/priorities/:priorityId
  // ═══════════════════════════════════════════════════════════════════════════

  describe('GET /dev-plan/priorities/:priorityId', () => {
    it('401 — no token', async () => {
      await request(app.getHttpServer())
        .get(`/dev-plan/priorities/${PRIORITY_UUID}`)
        .expect(401);
    });

    it('400 — non-UUID priorityId', async () => {
      await request(app.getHttpServer())
        .get('/dev-plan/priorities/not-a-uuid')
        .set('Authorization', `Bearer ${ngoToken()}`)
        .expect(400);
    });

    it('404 — priority area not found', async () => {
      mockPrisma.devPlanPriorityArea.findUnique.mockResolvedValue(null);

      const { body } = await request(app.getHttpServer())
        .get(`/dev-plan/priorities/${PRIORITY_UUID}`)
        .set('Authorization', `Bearer ${ngoToken()}`)
        .expect(200);

      expect(body.status).toBe(false);
      expect(body.statusCode).toBe(404);
    });

    it('404 — priority area belongs to a different org', async () => {
      mockPrisma.devPlanPriorityArea.findUnique.mockResolvedValue(
        makePriorityArea({ orgId: 'other-org-uuid' }),
      );

      const { body } = await request(app.getHttpServer())
        .get(`/dev-plan/priorities/${PRIORITY_UUID}`)
        .set('Authorization', `Bearer ${ngoToken()}`)
        .expect(200);

      expect(body.status).toBe(false);
      expect(body.statusCode).toBe(404);
    });

    it('200 — returns full priority area with nested relations', async () => {
      mockPrisma.devPlanPriorityArea.findUnique.mockResolvedValue(
        makePriorityArea(),
      );

      const { body } = await request(app.getHttpServer())
        .get(`/dev-plan/priorities/${PRIORITY_UUID}`)
        .set('Authorization', `Bearer ${ngoToken()}`)
        .expect(200);

      expect(body.status).toBe(true);
      expect(body.data.id).toBe(PRIORITY_UUID);
      expect(body.data).toHaveProperty('actionPlan');
      expect(body.data).toHaveProperty('evaluation');
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // PATCH /dev-plan/priorities/:priorityId
  // ═══════════════════════════════════════════════════════════════════════════

  describe('PATCH /dev-plan/priorities/:priorityId', () => {
    it('401 — no token', async () => {
      await request(app.getHttpServer())
        .patch(`/dev-plan/priorities/${PRIORITY_UUID}`)
        .send({ priority: 2 })
        .expect(401);
    });

    it('400 — non-UUID priorityId', async () => {
      await request(app.getHttpServer())
        .patch('/dev-plan/priorities/bad-id')
        .set('Authorization', `Bearer ${ngoToken()}`)
        .send({ priority: 2 })
        .expect(400);
    });

    it('400 — invalid priority value', async () => {
      mockPrisma.devPlanPriorityArea.findUnique.mockResolvedValue(
        makePriorityArea(),
      );

      await request(app.getHttpServer())
        .patch(`/dev-plan/priorities/${PRIORITY_UUID}`)
        .set('Authorization', `Bearer ${ngoToken()}`)
        .send({ priority: 0 })
        .expect(400);
    });

    it('404 — priority area not found', async () => {
      mockPrisma.devPlanPriorityArea.findUnique.mockResolvedValue(null);

      const { body } = await request(app.getHttpServer())
        .patch(`/dev-plan/priorities/${PRIORITY_UUID}`)
        .set('Authorization', `Bearer ${ngoToken()}`)
        .send({ priority: 2 })
        .expect(200);

      expect(body.status).toBe(false);
      expect(body.statusCode).toBe(404);
    });

    it('400 — FK re-validation: updated buildingBlockId does not belong to pillar', async () => {
      mockPrisma.devPlanPriorityArea.findUnique.mockResolvedValue(
        makePriorityArea(),
      );
      mockPrisma.oDABuildingBlock.findUnique.mockResolvedValue(
        makeBlock({ pillarId: 'wrong-pillar' }),
      );

      const { body } = await request(app.getHttpServer())
        .patch(`/dev-plan/priorities/${PRIORITY_UUID}`)
        .set('Authorization', `Bearer ${ngoToken()}`)
        .send({ buildingBlockId: BLOCK_UUID })
        .expect(200);

      expect(body.status).toBe(false);
      expect(body.statusCode).toBe(400);
      expect(body.message).toMatch(/does not belong to the specified pillar/i);
    });

    it('200 — updates scalar fields without re-validating FK chain', async () => {
      mockPrisma.devPlanPriorityArea.findUnique.mockResolvedValue(
        makePriorityArea(),
      );
      mockPrisma.devPlanPriorityArea.update.mockResolvedValue(
        makePriorityArea({ priority: 3, act: 'Updated action' }),
      );

      const { body } = await request(app.getHttpServer())
        .patch(`/dev-plan/priorities/${PRIORITY_UUID}`)
        .set('Authorization', `Bearer ${ngoToken()}`)
        .send({ priority: 3, act: 'Updated action' })
        .expect(200);

      expect(body.status).toBe(true);
      expect(body.data.priority).toBe(3);
      expect(mockPrisma.devPlanPriorityArea.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: PRIORITY_UUID },
          data: expect.objectContaining({ priority: 3, act: 'Updated action' }),
        }),
      );
      // FK methods should NOT have been called since no FK fields were in the PATCH body
      expect(mockPrisma.oDAPillar.findUnique).not.toHaveBeenCalled();
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // DELETE /dev-plan/priorities/:priorityId
  // ═══════════════════════════════════════════════════════════════════════════

  describe('DELETE /dev-plan/priorities/:priorityId', () => {
    it('401 — no token', async () => {
      await request(app.getHttpServer())
        .delete(`/dev-plan/priorities/${PRIORITY_UUID}`)
        .expect(401);
    });

    it('400 — non-UUID priorityId', async () => {
      await request(app.getHttpServer())
        .delete('/dev-plan/priorities/bad-id')
        .set('Authorization', `Bearer ${ngoToken()}`)
        .expect(400);
    });

    it('404 — priority area not found', async () => {
      mockPrisma.devPlanPriorityArea.findUnique.mockResolvedValue(null);

      const { body } = await request(app.getHttpServer())
        .delete(`/dev-plan/priorities/${PRIORITY_UUID}`)
        .set('Authorization', `Bearer ${ngoToken()}`)
        .expect(200);

      expect(body.status).toBe(false);
      expect(body.statusCode).toBe(404);
    });

    it('200 — deletes priority area (cascades to action plan + evaluation)', async () => {
      mockPrisma.devPlanPriorityArea.findUnique.mockResolvedValue(
        makePriorityArea(),
      );
      mockPrisma.devPlanPriorityArea.delete.mockResolvedValue({});

      const { body } = await request(app.getHttpServer())
        .delete(`/dev-plan/priorities/${PRIORITY_UUID}`)
        .set('Authorization', `Bearer ${ngoToken()}`)
        .expect(200);

      expect(body.status).toBe(true);
      expect(body.message).toMatch(/deleted/i);
      expect(mockPrisma.devPlanPriorityArea.delete).toHaveBeenCalledWith({
        where: { id: PRIORITY_UUID },
      });
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // POST /dev-plan/priorities/:priorityId/action-plan
  // ═══════════════════════════════════════════════════════════════════════════

  describe('POST /dev-plan/priorities/:priorityId/action-plan', () => {
    const validBody = {
      objective: 'Build robust financial management',
      kpi: 'Monthly reports on time',
      actionSteps: '1. Hire finance officer',
      responsiblePerson: 'Executive Director',
      timeline: '2025-12-31',
      support: 'Finance committee',
      resourcePlan: 'QuickBooks licence',
    };

    beforeEach(() => {
      mockPrisma.devPlanPriorityArea.findUnique.mockResolvedValue(
        makePriorityArea(),
      );
      mockPrisma.devPlanActionPlan.findUnique.mockResolvedValue(null);
    });

    it('401 — no token', async () => {
      await request(app.getHttpServer())
        .post(`/dev-plan/priorities/${PRIORITY_UUID}/action-plan`)
        .send(validBody)
        .expect(401);
    });

    it('403 — GUEST role rejected', async () => {
      await request(app.getHttpServer())
        .post(`/dev-plan/priorities/${PRIORITY_UUID}/action-plan`)
        .set('Authorization', `Bearer ${guestToken()}`)
        .send(validBody)
        .expect(403);
    });

    it('400 — non-UUID priorityId', async () => {
      await request(app.getHttpServer())
        .post('/dev-plan/priorities/bad-id/action-plan')
        .set('Authorization', `Bearer ${ngoToken()}`)
        .send(validBody)
        .expect(400);
    });

    it('404 — priority area not found', async () => {
      mockPrisma.devPlanPriorityArea.findUnique.mockResolvedValue(null);

      const { body } = await request(app.getHttpServer())
        .post(`/dev-plan/priorities/${PRIORITY_UUID}/action-plan`)
        .set('Authorization', `Bearer ${ngoToken()}`)
        .send(validBody)
        .expect(201);

      expect(body.status).toBe(false);
      expect(body.statusCode).toBe(404);
    });

    it('409 — action plan already exists', async () => {
      mockPrisma.devPlanActionPlan.findUnique.mockResolvedValue(
        makeActionPlan(),
      );

      const { body } = await request(app.getHttpServer())
        .post(`/dev-plan/priorities/${PRIORITY_UUID}/action-plan`)
        .set('Authorization', `Bearer ${ngoToken()}`)
        .send(validBody)
        .expect(201);

      expect(body.status).toBe(false);
      expect(body.statusCode).toBe(409);
      expect(body.message).toMatch(/already exists/i);
    });

    it('201 — creates action plan successfully', async () => {
      mockPrisma.devPlanActionPlan.create.mockResolvedValue(makeActionPlan());

      const { body } = await request(app.getHttpServer())
        .post(`/dev-plan/priorities/${PRIORITY_UUID}/action-plan`)
        .set('Authorization', `Bearer ${ngoToken()}`)
        .send(validBody)
        .expect(201);

      expect(body.status).toBe(true);
      expect(body.data.objective).toBe('Build robust financial management');
      expect(mockPrisma.devPlanActionPlan.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ priorityAreaId: PRIORITY_UUID }),
        }),
      );
    });

    it('201 — all fields are optional (empty body accepted)', async () => {
      mockPrisma.devPlanActionPlan.create.mockResolvedValue(
        makeActionPlan({
          objective: null,
          kpi: null,
          actionSteps: null,
        }),
      );

      const { body } = await request(app.getHttpServer())
        .post(`/dev-plan/priorities/${PRIORITY_UUID}/action-plan`)
        .set('Authorization', `Bearer ${ngoToken()}`)
        .send({})
        .expect(201);

      expect(body.status).toBe(true);
    });

    it('201 — timeline string is converted to Date', async () => {
      mockPrisma.devPlanActionPlan.create.mockResolvedValue(makeActionPlan());

      await request(app.getHttpServer())
        .post(`/dev-plan/priorities/${PRIORITY_UUID}/action-plan`)
        .set('Authorization', `Bearer ${ngoToken()}`)
        .send(validBody)
        .expect(201);

      const createCall = mockPrisma.devPlanActionPlan.create.mock.calls[0][0];
      expect(createCall.data.timeline).toBeInstanceOf(Date);
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // PATCH /dev-plan/priorities/:priorityId/action-plan
  // ═══════════════════════════════════════════════════════════════════════════

  describe('PATCH /dev-plan/priorities/:priorityId/action-plan', () => {
    beforeEach(() => {
      mockPrisma.devPlanPriorityArea.findUnique.mockResolvedValue(
        makePriorityArea(),
      );
    });

    it('401 — no token', async () => {
      await request(app.getHttpServer())
        .patch(`/dev-plan/priorities/${PRIORITY_UUID}/action-plan`)
        .send({ objective: 'Updated' })
        .expect(401);
    });

    it('404 — no action plan to update', async () => {
      mockPrisma.devPlanActionPlan.findUnique.mockResolvedValue(null);

      const { body } = await request(app.getHttpServer())
        .patch(`/dev-plan/priorities/${PRIORITY_UUID}/action-plan`)
        .set('Authorization', `Bearer ${ngoToken()}`)
        .send({ objective: 'Updated' })
        .expect(200);

      expect(body.status).toBe(false);
      expect(body.statusCode).toBe(404);
      expect(body.message).toMatch(/use POST/i);
    });

    it('200 — updates action plan fields', async () => {
      mockPrisma.devPlanActionPlan.findUnique.mockResolvedValue(
        makeActionPlan(),
      );
      mockPrisma.devPlanActionPlan.update.mockResolvedValue(
        makeActionPlan({ objective: 'Updated objective', kpi: 'New KPI' }),
      );

      const { body } = await request(app.getHttpServer())
        .patch(`/dev-plan/priorities/${PRIORITY_UUID}/action-plan`)
        .set('Authorization', `Bearer ${ngoToken()}`)
        .send({ objective: 'Updated objective', kpi: 'New KPI' })
        .expect(200);

      expect(body.status).toBe(true);
      expect(mockPrisma.devPlanActionPlan.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { priorityAreaId: PRIORITY_UUID },
          data: expect.objectContaining({
            objective: 'Updated objective',
            kpi: 'New KPI',
          }),
        }),
      );
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // DELETE /dev-plan/priorities/:priorityId/action-plan
  // ═══════════════════════════════════════════════════════════════════════════

  describe('DELETE /dev-plan/priorities/:priorityId/action-plan', () => {
    beforeEach(() => {
      mockPrisma.devPlanPriorityArea.findUnique.mockResolvedValue(
        makePriorityArea(),
      );
    });

    it('401 — no token', async () => {
      await request(app.getHttpServer())
        .delete(`/dev-plan/priorities/${PRIORITY_UUID}/action-plan`)
        .expect(401);
    });

    it('404 — action plan not found', async () => {
      mockPrisma.devPlanActionPlan.findUnique.mockResolvedValue(null);

      const { body } = await request(app.getHttpServer())
        .delete(`/dev-plan/priorities/${PRIORITY_UUID}/action-plan`)
        .set('Authorization', `Bearer ${ngoToken()}`)
        .expect(200);

      expect(body.status).toBe(false);
      expect(body.statusCode).toBe(404);
    });

    it('200 — deletes action plan', async () => {
      mockPrisma.devPlanActionPlan.findUnique.mockResolvedValue(
        makeActionPlan(),
      );
      mockPrisma.devPlanActionPlan.delete.mockResolvedValue({});

      const { body } = await request(app.getHttpServer())
        .delete(`/dev-plan/priorities/${PRIORITY_UUID}/action-plan`)
        .set('Authorization', `Bearer ${ngoToken()}`)
        .expect(200);

      expect(body.status).toBe(true);
      expect(body.message).toMatch(/deleted/i);
      expect(mockPrisma.devPlanActionPlan.delete).toHaveBeenCalledWith({
        where: { priorityAreaId: PRIORITY_UUID },
      });
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // POST /dev-plan/priorities/:priorityId/evaluation
  // ═══════════════════════════════════════════════════════════════════════════

  describe('POST /dev-plan/priorities/:priorityId/evaluation', () => {
    const validBody = {
      whatWasDone: 'Hired finance officer and adopted QuickBooks',
      wereObjectivesMet: 'Partially',
      whatDidWeLearn: 'Capacity needs strengthening',
      nextSteps: 'Engage external auditor in Q1',
    };

    beforeEach(() => {
      mockPrisma.devPlanPriorityArea.findUnique.mockResolvedValue(
        makePriorityArea(),
      );
      mockPrisma.devPlanEvaluation.findUnique.mockResolvedValue(null);
    });

    it('401 — no token', async () => {
      await request(app.getHttpServer())
        .post(`/dev-plan/priorities/${PRIORITY_UUID}/evaluation`)
        .send(validBody)
        .expect(401);
    });

    it('403 — GUEST role rejected', async () => {
      await request(app.getHttpServer())
        .post(`/dev-plan/priorities/${PRIORITY_UUID}/evaluation`)
        .set('Authorization', `Bearer ${guestToken()}`)
        .send(validBody)
        .expect(403);
    });

    it('404 — priority area not found', async () => {
      mockPrisma.devPlanPriorityArea.findUnique.mockResolvedValue(null);

      const { body } = await request(app.getHttpServer())
        .post(`/dev-plan/priorities/${PRIORITY_UUID}/evaluation`)
        .set('Authorization', `Bearer ${ngoToken()}`)
        .send(validBody)
        .expect(201);

      expect(body.status).toBe(false);
      expect(body.statusCode).toBe(404);
    });

    it('409 — evaluation already exists', async () => {
      mockPrisma.devPlanEvaluation.findUnique.mockResolvedValue(
        makeEvaluation(),
      );

      const { body } = await request(app.getHttpServer())
        .post(`/dev-plan/priorities/${PRIORITY_UUID}/evaluation`)
        .set('Authorization', `Bearer ${ngoToken()}`)
        .send(validBody)
        .expect(201);

      expect(body.status).toBe(false);
      expect(body.statusCode).toBe(409);
      expect(body.message).toMatch(/already exists/i);
    });

    it('201 — creates evaluation successfully', async () => {
      mockPrisma.devPlanEvaluation.create.mockResolvedValue(makeEvaluation());

      const { body } = await request(app.getHttpServer())
        .post(`/dev-plan/priorities/${PRIORITY_UUID}/evaluation`)
        .set('Authorization', `Bearer ${ngoToken()}`)
        .send(validBody)
        .expect(201);

      expect(body.status).toBe(true);
      expect(body.data.whatWasDone).toBe(
        'Hired finance officer and adopted QuickBooks',
      );
      expect(mockPrisma.devPlanEvaluation.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ priorityAreaId: PRIORITY_UUID }),
        }),
      );
    });

    it('201 — all fields optional (empty body accepted)', async () => {
      mockPrisma.devPlanEvaluation.create.mockResolvedValue(
        makeEvaluation({ whatWasDone: null, wereObjectivesMet: null }),
      );

      const { body } = await request(app.getHttpServer())
        .post(`/dev-plan/priorities/${PRIORITY_UUID}/evaluation`)
        .set('Authorization', `Bearer ${ngoToken()}`)
        .send({})
        .expect(201);

      expect(body.status).toBe(true);
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // PATCH /dev-plan/priorities/:priorityId/evaluation
  // ═══════════════════════════════════════════════════════════════════════════

  describe('PATCH /dev-plan/priorities/:priorityId/evaluation', () => {
    beforeEach(() => {
      mockPrisma.devPlanPriorityArea.findUnique.mockResolvedValue(
        makePriorityArea(),
      );
    });

    it('401 — no token', async () => {
      await request(app.getHttpServer())
        .patch(`/dev-plan/priorities/${PRIORITY_UUID}/evaluation`)
        .send({ nextSteps: 'Updated' })
        .expect(401);
    });

    it('404 — no evaluation to update', async () => {
      mockPrisma.devPlanEvaluation.findUnique.mockResolvedValue(null);

      const { body } = await request(app.getHttpServer())
        .patch(`/dev-plan/priorities/${PRIORITY_UUID}/evaluation`)
        .set('Authorization', `Bearer ${ngoToken()}`)
        .send({ nextSteps: 'Updated' })
        .expect(200);

      expect(body.status).toBe(false);
      expect(body.statusCode).toBe(404);
      expect(body.message).toMatch(/use POST/i);
    });

    it('200 — updates evaluation fields', async () => {
      mockPrisma.devPlanEvaluation.findUnique.mockResolvedValue(
        makeEvaluation(),
      );
      mockPrisma.devPlanEvaluation.update.mockResolvedValue(
        makeEvaluation({
          nextSteps: 'Revised next steps',
          wereObjectivesMet: 'Yes',
        }),
      );

      const { body } = await request(app.getHttpServer())
        .patch(`/dev-plan/priorities/${PRIORITY_UUID}/evaluation`)
        .set('Authorization', `Bearer ${ngoToken()}`)
        .send({ nextSteps: 'Revised next steps', wereObjectivesMet: 'Yes' })
        .expect(200);

      expect(body.status).toBe(true);
      expect(mockPrisma.devPlanEvaluation.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { priorityAreaId: PRIORITY_UUID },
          data: expect.objectContaining({ nextSteps: 'Revised next steps' }),
        }),
      );
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // DELETE /dev-plan/priorities/:priorityId/evaluation
  // ═══════════════════════════════════════════════════════════════════════════

  describe('DELETE /dev-plan/priorities/:priorityId/evaluation', () => {
    beforeEach(() => {
      mockPrisma.devPlanPriorityArea.findUnique.mockResolvedValue(
        makePriorityArea(),
      );
    });

    it('401 — no token', async () => {
      await request(app.getHttpServer())
        .delete(`/dev-plan/priorities/${PRIORITY_UUID}/evaluation`)
        .expect(401);
    });

    it('404 — evaluation not found', async () => {
      mockPrisma.devPlanEvaluation.findUnique.mockResolvedValue(null);

      const { body } = await request(app.getHttpServer())
        .delete(`/dev-plan/priorities/${PRIORITY_UUID}/evaluation`)
        .set('Authorization', `Bearer ${ngoToken()}`)
        .expect(200);

      expect(body.status).toBe(false);
      expect(body.statusCode).toBe(404);
    });

    it('200 — deletes evaluation', async () => {
      mockPrisma.devPlanEvaluation.findUnique.mockResolvedValue(
        makeEvaluation(),
      );
      mockPrisma.devPlanEvaluation.delete.mockResolvedValue({});

      const { body } = await request(app.getHttpServer())
        .delete(`/dev-plan/priorities/${PRIORITY_UUID}/evaluation`)
        .set('Authorization', `Bearer ${ngoToken()}`)
        .expect(200);

      expect(body.status).toBe(true);
      expect(body.message).toMatch(/deleted/i);
      expect(mockPrisma.devPlanEvaluation.delete).toHaveBeenCalledWith({
        where: { priorityAreaId: PRIORITY_UUID },
      });
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // GET /dev-plan/org/:orgId  (SUPER_ADMIN)
  // ═══════════════════════════════════════════════════════════════════════════

  describe('GET /dev-plan/org/:orgId (admin)', () => {
    it('401 — no token', async () => {
      await request(app.getHttpServer())
        .get(`/dev-plan/org/${ORG_UUID}`)
        .expect(401);
    });

    it('403 — NGO_MEMBER cannot access admin route', async () => {
      await request(app.getHttpServer())
        .get(`/dev-plan/org/${ORG_UUID}`)
        .set('Authorization', `Bearer ${ngoToken()}`)
        .expect(403);
    });

    it('400 — non-UUID orgId', async () => {
      await request(app.getHttpServer())
        .get('/dev-plan/org/not-a-uuid')
        .set('Authorization', `Bearer ${adminToken()}`)
        .expect(400);
    });

    it('404 — org not found', async () => {
      mockPrisma.organization.findUnique.mockResolvedValue(null);

      const { body } = await request(app.getHttpServer())
        .get(`/dev-plan/org/${ORG_UUID}`)
        .set('Authorization', `Bearer ${adminToken()}`)
        .expect(200);

      expect(body.status).toBe(false);
      expect(body.statusCode).toBe(404);
    });

    it('200 — admin retrieves full dev plan for any org', async () => {
      mockPrisma.devPlanPriorityArea.findMany.mockResolvedValue([
        makePriorityArea({
          actionPlan: makeActionPlan(),
          evaluation: makeEvaluation(),
        }),
      ]);

      const { body } = await request(app.getHttpServer())
        .get(`/dev-plan/org/${ORG_UUID}`)
        .set('Authorization', `Bearer ${adminToken()}`)
        .expect(200);

      expect(body.status).toBe(true);
      expect(body.data).toHaveLength(1);
      expect(body.data[0]).toHaveProperty('actionPlan');
      expect(body.data[0]).toHaveProperty('evaluation');
      expect(mockPrisma.devPlanPriorityArea.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { orgId: ORG_UUID } }),
      );
    });
  });
});
