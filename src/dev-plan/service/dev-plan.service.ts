import { Injectable, HttpStatus, Logger } from '@nestjs/common';
import { PrismaService } from 'src/prisma.service';
import {
  CreatePriorityAreaDto,
  UpdatePriorityAreaDto,
  CreateActionPlanDto,
  UpdateActionPlanDto,
  CreateEvaluationDto,
  UpdateEvaluationDto,
} from '../dto/dev-plan.dto';

// ─────────────────────────────────────────────────────────────────────────────
// SHARED INCLUDE
// ─────────────────────────────────────────────────────────────────────────────

const PRIORITY_FULL_INCLUDE = {
  pillar: { select: { id: true, name: true, order: true } },
  buildingBlock: {
    select: { id: true, name: true, order: true, maxScore: true },
  },
  indicator: { select: { id: true, text: true, order: true } },
  actionPlan: true,
  evaluation: true,
} as const;

@Injectable()
export class DevPlanService {
  private readonly logger = new Logger(DevPlanService.name);

  constructor(private readonly prisma: PrismaService) {}

  // ─────────────────────────────────────────────────────────────────────────────
  // HELPERS
  // ─────────────────────────────────────────────────────────────────────────────

  /** Resolve the org owned by this user, or return a 404 response object. */
  private async resolveOrg(userId: string) {
    const org = await this.prisma.organization.findUnique({
      where: { userId },
    });
    if (!org)
      return {
        error: {
          status: false,
          statusCode: HttpStatus.NOT_FOUND,
          message: 'Organization not found.',
        },
      };
    return { org };
  }

  /**
   * Resolve a priority area that belongs to this user's org.
   * Returns the area or a suitable error response object.
   */
  private async resolvePriorityArea(userId: string, priorityId: string) {
    const { org, error } = await this.resolveOrg(userId);
    if (error) return { error };

    const area = await this.prisma.devPlanPriorityArea.findUnique({
      where: { id: priorityId },
    });

    if (!area || area.orgId !== org!.id) {
      return {
        error: {
          status: false,
          statusCode: HttpStatus.NOT_FOUND,
          message: 'Priority area not found.',
        },
      };
    }

    return { org: org!, area };
  }

  /** Validate that a pillar / building-block / indicator FK chain is consistent. */
  private async validateFkChain(
    pillarId: string,
    buildingBlockId: string,
    indicatorId: string,
  ): Promise<string | null> {
    const pillar = await this.prisma.oDAPillar.findUnique({
      where: { id: pillarId },
    });
    if (!pillar) return 'Pillar not found.';

    const block = await this.prisma.oDABuildingBlock.findUnique({
      where: { id: buildingBlockId },
    });
    if (!block) return 'Building block not found.';
    if (block.pillarId !== pillarId)
      return 'Building block does not belong to the specified pillar.';

    const question = await this.prisma.oDAQuestion.findUnique({
      where: { id: indicatorId },
    });
    if (!question) return 'Indicator (question) not found.';
    if (question.buildingBlockId !== buildingBlockId)
      return 'Indicator does not belong to the specified building block.';

    return null; // all good
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // PRIORITY AREAS
  // ─────────────────────────────────────────────────────────────────────────────

  async createPriorityArea(userId: string, dto: CreatePriorityAreaDto) {
    try {
      const { org, error } = await this.resolveOrg(userId);
      if (error) return error;

      const fkError = await this.validateFkChain(
        dto.pillarId,
        dto.buildingBlockId,
        dto.indicatorId,
      );
      if (fkError)
        return {
          status: false,
          statusCode: HttpStatus.BAD_REQUEST,
          message: fkError,
        };

      const area = await this.prisma.devPlanPriorityArea.create({
        data: {
          orgId: org!.id,
          pillarId: dto.pillarId,
          buildingBlockId: dto.buildingBlockId,
          indicatorId: dto.indicatorId,
          score: dto.score ?? null,
          strength: dto.strength ?? null,
          weakness: dto.weakness ?? null,
          opportunity: dto.opportunity ?? null,
          threat: dto.threat ?? null,
          priority: dto.priority,
          act: dto.act ?? null,
        },
        include: PRIORITY_FULL_INCLUDE,
      });

      return {
        status: true,
        statusCode: HttpStatus.CREATED,
        message: 'Priority area created.',
        data: area,
      };
    } catch (err) {
      this.logger.error('createPriorityArea error', err);
      return {
        status: false,
        statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
        message: 'Server error.',
      };
    }
  }

  async listPriorityAreas(userId: string) {
    try {
      const { org, error } = await this.resolveOrg(userId);
      if (error) return error;

      const areas = await this.prisma.devPlanPriorityArea.findMany({
        where: { orgId: org!.id },
        include: PRIORITY_FULL_INCLUDE,
        orderBy: [{ priority: 'asc' }, { createdAt: 'asc' }],
      });

      return {
        status: true,
        statusCode: HttpStatus.OK,
        message: 'Priority areas retrieved.',
        data: areas,
      };
    } catch (err) {
      this.logger.error('listPriorityAreas error', err);
      return {
        status: false,
        statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
        message: 'Server error.',
      };
    }
  }

  async getPriorityArea(userId: string, priorityId: string) {
    try {
      const { area, error } = await this.resolvePriorityArea(
        userId,
        priorityId,
      );
      if (error) return error;

      const full = await this.prisma.devPlanPriorityArea.findUnique({
        where: { id: area!.id },
        include: PRIORITY_FULL_INCLUDE,
      });

      return {
        status: true,
        statusCode: HttpStatus.OK,
        message: 'Priority area retrieved.',
        data: full,
      };
    } catch (err) {
      this.logger.error('getPriorityArea error', err);
      return {
        status: false,
        statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
        message: 'Server error.',
      };
    }
  }

  async updatePriorityArea(
    userId: string,
    priorityId: string,
    dto: UpdatePriorityAreaDto,
  ) {
    try {
      const { area, error } = await this.resolvePriorityArea(
        userId,
        priorityId,
      );
      if (error) return error;

      // If any FK field is being updated, validate the full chain using merged values
      const newPillarId = dto.pillarId ?? area!.pillarId;
      const newBuildingBlockId = dto.buildingBlockId ?? area!.buildingBlockId;
      const newIndicatorId = dto.indicatorId ?? area!.indicatorId;

      if (dto.pillarId || dto.buildingBlockId || dto.indicatorId) {
        const fkError = await this.validateFkChain(
          newPillarId,
          newBuildingBlockId,
          newIndicatorId,
        );
        if (fkError)
          return {
            status: false,
            statusCode: HttpStatus.BAD_REQUEST,
            message: fkError,
          };
      }

      const updated = await this.prisma.devPlanPriorityArea.update({
        where: { id: priorityId },
        data: {
          ...(dto.pillarId !== undefined && { pillarId: dto.pillarId }),
          ...(dto.buildingBlockId !== undefined && {
            buildingBlockId: dto.buildingBlockId,
          }),
          ...(dto.indicatorId !== undefined && {
            indicatorId: dto.indicatorId,
          }),
          ...(dto.score !== undefined && { score: dto.score }),
          ...(dto.strength !== undefined && { strength: dto.strength }),
          ...(dto.weakness !== undefined && { weakness: dto.weakness }),
          ...(dto.opportunity !== undefined && {
            opportunity: dto.opportunity,
          }),
          ...(dto.threat !== undefined && { threat: dto.threat }),
          ...(dto.priority !== undefined && { priority: dto.priority }),
          ...(dto.act !== undefined && { act: dto.act }),
        },
        include: PRIORITY_FULL_INCLUDE,
      });

      return {
        status: true,
        statusCode: HttpStatus.OK,
        message: 'Priority area updated.',
        data: updated,
      };
    } catch (err) {
      this.logger.error('updatePriorityArea error', err);
      return {
        status: false,
        statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
        message: 'Server error.',
      };
    }
  }

  async deletePriorityArea(userId: string, priorityId: string) {
    try {
      const { error } = await this.resolvePriorityArea(userId, priorityId);
      if (error) return error;

      await this.prisma.devPlanPriorityArea.delete({
        where: { id: priorityId },
      });

      return {
        status: true,
        statusCode: HttpStatus.OK,
        message: 'Priority area deleted.',
      };
    } catch (err) {
      this.logger.error('deletePriorityArea error', err);
      return {
        status: false,
        statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
        message: 'Server error.',
      };
    }
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // ACTION PLAN
  // ─────────────────────────────────────────────────────────────────────────────

  async createActionPlan(
    userId: string,
    priorityId: string,
    dto: CreateActionPlanDto,
  ) {
    try {
      const { error } = await this.resolvePriorityArea(userId, priorityId);
      if (error) return error;

      // Enforce one-to-one: reject if one already exists
      const existing = await this.prisma.devPlanActionPlan.findUnique({
        where: { priorityAreaId: priorityId },
      });
      if (existing) {
        return {
          status: false,
          statusCode: HttpStatus.CONFLICT,
          message:
            'An action plan already exists for this priority area. Use PATCH to update it.',
        };
      }

      const plan = await this.prisma.devPlanActionPlan.create({
        data: {
          priorityAreaId: priorityId,
          objective: dto.objective ?? null,
          kpi: dto.kpi ?? null,
          actionSteps: dto.actionSteps ?? null,
          responsiblePerson: dto.responsiblePerson ?? null,
          timeline: dto.timeline ? new Date(dto.timeline) : null,
          support: dto.support ?? null,
          resourcePlan: dto.resourcePlan ?? null,
        },
      });

      return {
        status: true,
        statusCode: HttpStatus.CREATED,
        message: 'Action plan created.',
        data: plan,
      };
    } catch (err) {
      this.logger.error('createActionPlan error', err);
      return {
        status: false,
        statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
        message: 'Server error.',
      };
    }
  }

  async updateActionPlan(
    userId: string,
    priorityId: string,
    dto: UpdateActionPlanDto,
  ) {
    try {
      const { error } = await this.resolvePriorityArea(userId, priorityId);
      if (error) return error;

      const existing = await this.prisma.devPlanActionPlan.findUnique({
        where: { priorityAreaId: priorityId },
      });
      if (!existing) {
        return {
          status: false,
          statusCode: HttpStatus.NOT_FOUND,
          message: 'Action plan not found. Use POST to create one.',
        };
      }

      const updated = await this.prisma.devPlanActionPlan.update({
        where: { priorityAreaId: priorityId },
        data: {
          ...(dto.objective !== undefined && { objective: dto.objective }),
          ...(dto.kpi !== undefined && { kpi: dto.kpi }),
          ...(dto.actionSteps !== undefined && {
            actionSteps: dto.actionSteps,
          }),
          ...(dto.responsiblePerson !== undefined && {
            responsiblePerson: dto.responsiblePerson,
          }),
          ...(dto.timeline !== undefined && {
            timeline: dto.timeline ? new Date(dto.timeline) : null,
          }),
          ...(dto.support !== undefined && { support: dto.support }),
          ...(dto.resourcePlan !== undefined && {
            resourcePlan: dto.resourcePlan,
          }),
        },
      });

      return {
        status: true,
        statusCode: HttpStatus.OK,
        message: 'Action plan updated.',
        data: updated,
      };
    } catch (err) {
      this.logger.error('updateActionPlan error', err);
      return {
        status: false,
        statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
        message: 'Server error.',
      };
    }
  }

  async deleteActionPlan(userId: string, priorityId: string) {
    try {
      const { error } = await this.resolvePriorityArea(userId, priorityId);
      if (error) return error;

      const existing = await this.prisma.devPlanActionPlan.findUnique({
        where: { priorityAreaId: priorityId },
      });
      if (!existing) {
        return {
          status: false,
          statusCode: HttpStatus.NOT_FOUND,
          message: 'Action plan not found.',
        };
      }

      await this.prisma.devPlanActionPlan.delete({
        where: { priorityAreaId: priorityId },
      });

      return {
        status: true,
        statusCode: HttpStatus.OK,
        message: 'Action plan deleted.',
      };
    } catch (err) {
      this.logger.error('deleteActionPlan error', err);
      return {
        status: false,
        statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
        message: 'Server error.',
      };
    }
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // EVALUATION
  // ─────────────────────────────────────────────────────────────────────────────

  async createEvaluation(
    userId: string,
    priorityId: string,
    dto: CreateEvaluationDto,
  ) {
    try {
      const { error } = await this.resolvePriorityArea(userId, priorityId);
      if (error) return error;

      const existing = await this.prisma.devPlanEvaluation.findUnique({
        where: { priorityAreaId: priorityId },
      });
      if (existing) {
        return {
          status: false,
          statusCode: HttpStatus.CONFLICT,
          message:
            'An evaluation already exists for this priority area. Use PATCH to update it.',
        };
      }

      const evaluation = await this.prisma.devPlanEvaluation.create({
        data: {
          priorityAreaId: priorityId,
          whatWasDone: dto.whatWasDone ?? null,
          wereObjectivesMet: dto.wereObjectivesMet ?? null,
          whatDidWeLearn: dto.whatDidWeLearn ?? null,
          nextSteps: dto.nextSteps ?? null,
        },
      });

      return {
        status: true,
        statusCode: HttpStatus.CREATED,
        message: 'Evaluation created.',
        data: evaluation,
      };
    } catch (err) {
      this.logger.error('createEvaluation error', err);
      return {
        status: false,
        statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
        message: 'Server error.',
      };
    }
  }

  async updateEvaluation(
    userId: string,
    priorityId: string,
    dto: UpdateEvaluationDto,
  ) {
    try {
      const { error } = await this.resolvePriorityArea(userId, priorityId);
      if (error) return error;

      const existing = await this.prisma.devPlanEvaluation.findUnique({
        where: { priorityAreaId: priorityId },
      });
      if (!existing) {
        return {
          status: false,
          statusCode: HttpStatus.NOT_FOUND,
          message: 'Evaluation not found. Use POST to create one.',
        };
      }

      const updated = await this.prisma.devPlanEvaluation.update({
        where: { priorityAreaId: priorityId },
        data: {
          ...(dto.whatWasDone !== undefined && {
            whatWasDone: dto.whatWasDone,
          }),
          ...(dto.wereObjectivesMet !== undefined && {
            wereObjectivesMet: dto.wereObjectivesMet,
          }),
          ...(dto.whatDidWeLearn !== undefined && {
            whatDidWeLearn: dto.whatDidWeLearn,
          }),
          ...(dto.nextSteps !== undefined && { nextSteps: dto.nextSteps }),
        },
      });

      return {
        status: true,
        statusCode: HttpStatus.OK,
        message: 'Evaluation updated.',
        data: updated,
      };
    } catch (err) {
      this.logger.error('updateEvaluation error', err);
      return {
        status: false,
        statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
        message: 'Server error.',
      };
    }
  }

  async deleteEvaluation(userId: string, priorityId: string) {
    try {
      const { error } = await this.resolvePriorityArea(userId, priorityId);
      if (error) return error;

      const existing = await this.prisma.devPlanEvaluation.findUnique({
        where: { priorityAreaId: priorityId },
      });
      if (!existing) {
        return {
          status: false,
          statusCode: HttpStatus.NOT_FOUND,
          message: 'Evaluation not found.',
        };
      }

      await this.prisma.devPlanEvaluation.delete({
        where: { priorityAreaId: priorityId },
      });

      return {
        status: true,
        statusCode: HttpStatus.OK,
        message: 'Evaluation deleted.',
      };
    } catch (err) {
      this.logger.error('deleteEvaluation error', err);
      return {
        status: false,
        statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
        message: 'Server error.',
      };
    }
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // ADMIN
  // ─────────────────────────────────────────────────────────────────────────────

  async listByOrg(orgId: string) {
    try {
      const org = await this.prisma.organization.findUnique({
        where: { id: orgId },
      });
      if (!org)
        return {
          status: false,
          statusCode: HttpStatus.NOT_FOUND,
          message: 'Organization not found.',
        };

      const areas = await this.prisma.devPlanPriorityArea.findMany({
        where: { orgId },
        include: PRIORITY_FULL_INCLUDE,
        orderBy: [{ priority: 'asc' }, { createdAt: 'asc' }],
      });

      return {
        status: true,
        statusCode: HttpStatus.OK,
        message: 'Dev plan retrieved.',
        data: areas,
      };
    } catch (err) {
      this.logger.error('listByOrg error', err);
      return {
        status: false,
        statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
        message: 'Server error.',
      };
    }
  }
}
