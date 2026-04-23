import { Injectable, HttpStatus, Logger } from '@nestjs/common';
import { FormStatus } from '@prisma/client';
import PDFDocument from 'pdfkit';

import {
  SaveBlockResponseDto,
  ListAssessmentsQueryDto,
  AdminListAssessmentsQueryDto,
} from '../dto/oda-assessment.dto';
import { EmailService } from 'src/providers/email/email.service';
import { OdaScoringService } from './oda-scoring.service';
import { PrismaService } from 'src/prisma-module/prisma.service';

const FULL_ASSESSMENT_INCLUDE = {
  organization: { select: { id: true, name: true } },
  pillarSummaries: {
    select: {
      id: true,
      pillarId: true,
      pillarScore: true,
      aiSummary: true,
      completedAt: true,
    },
    orderBy: { completedAt: 'asc' as const },
  },
  blockResponses: {
    include: {
      buildingBlock: {
        include: { pillar: { select: { id: true, name: true } } },
      },
    },
    orderBy: [
      { buildingBlock: { pillar: { order: 'asc' as const } } },
      { buildingBlock: { order: 'asc' as const } },
    ] as any[],
  },
};

@Injectable()
export class OdaAssessmentService {
  private readonly logger = new Logger(OdaAssessmentService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly scoring: OdaScoringService,
    private readonly email: EmailService,
  ) {}

  // ─────────────────────────────────────────────────────────────────────────
  // HELPERS
  // ─────────────────────────────────────────────────────────────────────────

  private buildProgress(blockResponses: any[]) {
    const blocksTotal = blockResponses.length;
    const blocksSubmitted = blockResponses.filter(
      (b) => b.status === 'SUBMITTED',
    ).length;
    const completionPercent =
      blocksTotal > 0
        ? parseFloat(((blocksSubmitted / blocksTotal) * 100).toFixed(1))
        : 0;
    return { blocksTotal, blocksSubmitted, completionPercent };
  }

  private formatAssessment(a: any) {
    const { blocksTotal, blocksSubmitted, completionPercent } =
      this.buildProgress(a.blockResponses ?? []);
    return {
      id: a.id,
      status: a.status,
      overallScore: a.overallScore,
      aiSummary: a.aiSummary,
      startedAt: a.startedAt,
      completedAt: a.completedAt,
      orgId: a.orgId,
      orgName: a.organization?.name,
      blocksTotal,
      blocksSubmitted,
      completionPercent,
      // Per-pillar summaries — populated as each pillar completes
      pillarSummaries: (a.pillarSummaries ?? []).map((ps: any) => ({
        id: ps.id,
        pillarId: ps.pillarId,
        pillarScore: ps.pillarScore,
        aiSummary: ps.aiSummary,
        completedAt: ps.completedAt,
      })),
      blockResponses: (a.blockResponses ?? []).map((br: any) => ({
        id: br.id,
        buildingBlockId: br.buildingBlockId,
        buildingBlockName: br.buildingBlock.name,
        pillarId: br.buildingBlock.pillar.id,
        pillarName: br.buildingBlock.pillar.name,
        status: br.status,
        blockScore: br.blockScore,
        maxScore: br.buildingBlock.maxScore,
        answers: br.answers ?? [],
        updatedAt: br.updatedAt,
      })),
      createdAt: a.createdAt,
      updatedAt: a.updatedAt,
    };
  }

  private formatListItem(a: any) {
    const { blocksTotal, blocksSubmitted, completionPercent } =
      this.buildProgress(a.blockResponses ?? []);
    return {
      id: a.id,
      status: a.status,
      overallScore: a.overallScore,
      startedAt: a.startedAt,
      completedAt: a.completedAt,
      orgId: a.orgId,
      orgName: a.organization?.name,
      blocksTotal,
      blocksSubmitted,
      completionPercent,
      createdAt: a.createdAt,
    };
  }

  private paginate(page = 1, limit = 20) {
    const p = Math.max(1, page);
    const l = Math.min(100, Math.max(1, limit));
    return { skip: (p - 1) * l, take: l, page: p, limit: l };
  }

  // ─────────────────────────────────────────────────────────────────────────
  // NGO — START ASSESSMENT
  // ─────────────────────────────────────────────────────────────────────────

  async startAssessment(ngoUserId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: ngoUserId },
      include: { organization: { select: { id: true, name: true } } },
    });

    if (!user?.organization)
      return {
        status: false,
        statusCode: HttpStatus.BAD_REQUEST,
        message:
          'You must complete your organization profile before starting an ODA assessment.',
      };

    const orgId = user.organization.id;
    const existing = await this.prisma.oDAAssessment.findFirst({
      where: { orgId, status: FormStatus.IN_PROGRESS },
    });
    if (existing)
      return {
        status: false,
        statusCode: HttpStatus.CONFLICT,
        message:
          'You already have an assessment in progress. Complete or delete it before starting a new one.',
        data: { assessmentId: existing.id },
      };

    const blocks = await this.prisma.oDABuildingBlock.findMany({
      orderBy: [{ pillar: { order: 'asc' } }, { order: 'asc' }],
    });
    if (!blocks.length)
      return {
        status: false,
        statusCode: HttpStatus.UNPROCESSABLE_ENTITY,
        message:
          'ODA structure has not been seeded yet. Contact the administrator.',
      };

    const assessment = await this.prisma.$transaction(async (tx) => {
      const a = await tx.oDAAssessment.create({
        data: { orgId, status: FormStatus.IN_PROGRESS },
      });
      await tx.oDABlockResponse.createMany({
        data: blocks.map((b) => ({
          assessmentId: a.id,
          buildingBlockId: b.id,
          status: 'IN_PROGRESS',
          answers: [],
        })),
      });
      return a;
    });

    const full = await this.prisma.oDAAssessment.findUnique({
      where: { id: assessment.id },
      include: FULL_ASSESSMENT_INCLUDE,
    });

    return {
      status: true,
      statusCode: HttpStatus.CREATED,
      message: 'Assessment started.',
      data: this.formatAssessment(full),
    };
  }

  // ─────────────────────────────────────────────────────────────────────────
  // NGO — LIST OWN ASSESSMENTS
  // ─────────────────────────────────────────────────────────────────────────

  async getMyAssessments(ngoUserId: string, query: ListAssessmentsQueryDto) {
    const user = await this.prisma.user.findUnique({
      where: { id: ngoUserId },
      include: { organization: { select: { id: true } } },
    });
    if (!user?.organization)
      return {
        status: false,
        statusCode: HttpStatus.BAD_REQUEST,
        message: 'No organization profile found.',
      };

    const orgId = user.organization.id;
    const { skip, take, page, limit } = this.paginate(query.page, query.limit);
    const where: any = { orgId };
    if (query.status) where.status = query.status;

    const [items, total] = await Promise.all([
      this.prisma.oDAAssessment.findMany({
        where,
        skip,
        take,
        include: {
          organization: { select: { id: true, name: true } },
          blockResponses: { select: { status: true } },
        },
        orderBy: { startedAt: 'desc' },
      }),
      this.prisma.oDAAssessment.count({ where }),
    ]);

    return {
      status: true,
      statusCode: HttpStatus.OK,
      data: items.map((a) => this.formatListItem(a)),
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  // ─────────────────────────────────────────────────────────────────────────
  // NGO — GET SINGLE ASSESSMENT
  // ─────────────────────────────────────────────────────────────────────────

  async getMyAssessmentById(ngoUserId: string, assessmentId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: ngoUserId },
      include: { organization: { select: { id: true } } },
    });

    const assessment = await this.prisma.oDAAssessment.findFirst({
      where: { id: assessmentId, orgId: user?.organization?.id },
      include: FULL_ASSESSMENT_INCLUDE,
    });

    if (!assessment)
      return {
        status: false,
        statusCode: HttpStatus.NOT_FOUND,
        message: 'Assessment not found.',
      };

    return {
      status: true,
      statusCode: HttpStatus.OK,
      data: this.formatAssessment(assessment),
    };
  }

  // ─────────────────────────────────────────────────────────────────────────
  // NGO — SAVE BLOCK ANSWERS (draft)
  // ─────────────────────────────────────────────────────────────────────────

  async saveBlockResponse(
    ngoUserId: string,
    assessmentId: string,
    blockId: string,
    dto: SaveBlockResponseDto,
  ) {
    const user = await this.prisma.user.findUnique({
      where: { id: ngoUserId },
      include: { organization: { select: { id: true } } },
    });

    const assessment = await this.prisma.oDAAssessment.findFirst({
      where: { id: assessmentId, orgId: user?.organization?.id },
    });

    if (!assessment)
      return {
        status: false,
        statusCode: HttpStatus.NOT_FOUND,
        message: 'Assessment not found.',
      };
    if (assessment.status !== FormStatus.IN_PROGRESS)
      return {
        status: false,
        statusCode: HttpStatus.BAD_REQUEST,
        message: `Cannot edit a ${assessment.status} assessment.`,
      };

    const blockResponse = await this.prisma.oDABlockResponse.findFirst({
      where: { assessmentId, buildingBlockId: blockId },
      include: {
        buildingBlock: {
          select: {
            maxScore: true,
            questions: { select: { id: true, text: true } },
          },
        },
      },
    });

    if (!blockResponse)
      return {
        status: false,
        statusCode: HttpStatus.NOT_FOUND,
        message: 'Building block not found in this assessment.',
      };
    if (blockResponse.status === 'SUBMITTED')
      return {
        status: false,
        statusCode: HttpStatus.BAD_REQUEST,
        message: 'This block has already been submitted and cannot be edited.',
      };

    const validIds = new Set(
      blockResponse.buildingBlock.questions.map((q) => q.id),
    );
    const invalid = dto.answers.filter((a) => !validIds.has(a.questionId));
    if (invalid.length)
      return {
        status: false,
        statusCode: HttpStatus.BAD_REQUEST,
        message: `Invalid question IDs: ${invalid.map((a) => a.questionId).join(', ')}`,
      };

    const enrichedAnswers = dto.answers.map((a) => ({
      questionId: a.questionId,
      questionText:
        blockResponse.buildingBlock.questions.find((q) => q.id === a.questionId)
          ?.text ?? '',
      selectedScale: a.selectedScale,
      evidence: a.evidence ?? '',
    }));

    const blockScore = this.scoring.computeBlockScore(
      enrichedAnswers,
      blockResponse.buildingBlock.maxScore,
    );

    const updated = await this.prisma.oDABlockResponse.update({
      where: { id: blockResponse.id },
      data: { answers: enrichedAnswers as any, blockScore },
      include: {
        buildingBlock: {
          include: { pillar: { select: { id: true, name: true } } },
        },
      },
    });

    return {
      status: true,
      statusCode: HttpStatus.OK,
      message: 'Block answers saved.',
      data: {
        id: updated.id,
        buildingBlockId: updated.buildingBlockId,
        buildingBlockName: updated.buildingBlock.name,
        pillarName: updated.buildingBlock.pillar.name,
        status: updated.status,
        blockScore: updated.blockScore,
        maxScore: updated.buildingBlock.maxScore,
        answers: updated.answers,
      },
    };
  }

  // ─────────────────────────────────────────────────────────────────────────
  // NGO — SUBMIT A SINGLE BLOCK
  // After submission, checks if all blocks in the block's pillar are done —
  // if so, fires async per-pillar AI summary generation.
  // ─────────────────────────────────────────────────────────────────────────

  async submitBlock(ngoUserId: string, assessmentId: string, blockId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: ngoUserId },
      include: { organization: { select: { id: true } } },
    });

    const assessment = await this.prisma.oDAAssessment.findFirst({
      where: { id: assessmentId, orgId: user?.organization?.id },
    });

    if (!assessment)
      return {
        status: false,
        statusCode: HttpStatus.NOT_FOUND,
        message: 'Assessment not found.',
      };
    if (assessment.status !== FormStatus.IN_PROGRESS)
      return {
        status: false,
        statusCode: HttpStatus.BAD_REQUEST,
        message: `Cannot modify a ${assessment.status} assessment.`,
      };

    const blockResponse = await this.prisma.oDABlockResponse.findFirst({
      where: { assessmentId, buildingBlockId: blockId },
      include: {
        buildingBlock: {
          include: {
            questions: { select: { id: true } },
            pillar: { select: { id: true, name: true } },
          },
        },
      },
    });

    if (!blockResponse)
      return {
        status: false,
        statusCode: HttpStatus.NOT_FOUND,
        message: 'Block not found in this assessment.',
      };
    if (blockResponse.status === 'SUBMITTED')
      return {
        status: false,
        statusCode: HttpStatus.BAD_REQUEST,
        message: 'Block already submitted.',
      };

    const answers = (blockResponse.answers as any[]) ?? [];
    const answeredIds = new Set(answers.map((a: any) => a.questionId));
    const questionCount = blockResponse.buildingBlock.questions.length;

    if (questionCount > 0 && answeredIds.size < questionCount) {
      const missing = blockResponse.buildingBlock.questions.filter(
        (q) => !answeredIds.has(q.id),
      ).length;
      return {
        status: false,
        statusCode: HttpStatus.BAD_REQUEST,
        message: `Please answer all questions before submitting. ${missing} question(s) still unanswered.`,
      };
    }

    await this.prisma.oDABlockResponse.update({
      where: { id: blockResponse.id },
      data: { status: 'SUBMITTED' },
    });

    // ── Check if this pillar is now fully submitted ────────────────────────
    const pillarId = blockResponse.buildingBlock.pillar.id;
    const pillarName = blockResponse.buildingBlock.pillar.name;

    this.checkAndGeneratePillarSummary(
      assessmentId,
      pillarId,
      pillarName,
    ).catch((err) =>
      this.logger.error(
        `Pillar summary check failed for pillar ${pillarId}`,
        err,
      ),
    );

    return {
      status: true,
      statusCode: HttpStatus.OK,
      message: 'Block submitted.',
    };
  }

  // ─────────────────────────────────────────────────────────────────────────
  // INTERNAL — check pillar completion and fire pillar summary if done
  // ─────────────────────────────────────────────────────────────────────────

  private async checkAndGeneratePillarSummary(
    assessmentId: string,
    pillarId: string,
    pillarName: string,
  ) {
    // Find all blocks in this pillar and their block responses in this assessment
    const pillarBlockResponses = await this.prisma.oDABlockResponse.findMany({
      where: {
        assessmentId,
        buildingBlock: { pillarId },
      },
      select: {
        status: true,
        blockScore: true,
        buildingBlock: { select: { maxScore: true } },
      },
    });

    // All blocks in the pillar must be SUBMITTED
    const allSubmitted = pillarBlockResponses.every(
      (br) => br.status === 'SUBMITTED',
    );
    if (!allSubmitted) return;

    // Check if pillar summary already exists (idempotent)
    const existing = await this.prisma.oDAPillarSummary.findUnique({
      where: { assessmentId_pillarId: { assessmentId, pillarId } },
    });
    if (existing) return;

    this.logger.log(
      `All blocks submitted for pillar "${pillarName}" — generating pillar summary`,
    );

    try {
      const pillarScore = this.scoring.computePillarScore(
        pillarBlockResponses.map((br) => ({
          blockScore: br.blockScore,
          maxScore: br.buildingBlock.maxScore,
        })),
      );

      const aiSummary = await this.scoring.generatePillarSummary(
        assessmentId,
        pillarId,
      );

      await this.prisma.oDAPillarSummary.create({
        data: { assessmentId, pillarId, pillarScore, aiSummary },
      });

      this.logger.log(
        `Pillar summary stored for pillar "${pillarName}" (score: ${pillarScore})`,
      );
    } catch (err) {
      this.logger.error(
        `Failed to generate pillar summary for ${pillarId}`,
        err,
      );
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // NGO — GET PILLAR SUMMARY
  // ─────────────────────────────────────────────────────────────────────────

  async getPillarSummary(
    ngoUserId: string,
    assessmentId: string,
    pillarId: string,
  ) {
    try {
      const user = await this.prisma.user.findUnique({
        where: { id: ngoUserId },
        include: { organization: { select: { id: true } } },
      });

      const assessment = await this.prisma.oDAAssessment.findFirst({
        where: { id: assessmentId, orgId: user?.organization?.id },
      });

      if (!assessment)
        return {
          status: false,
          statusCode: HttpStatus.NOT_FOUND,
          message: 'Assessment not found.',
        };

      const pillar = await this.prisma.oDAPillar.findUnique({
        where: { id: pillarId },
        select: { id: true, name: true },
      });
      if (!pillar)
        return {
          status: false,
          statusCode: HttpStatus.NOT_FOUND,
          message: 'Pillar not found.',
        };

      const summary = await this.prisma.oDAPillarSummary.findUnique({
        where: { assessmentId_pillarId: { assessmentId, pillarId } },
      });

      if (!summary)
        return {
          status: false,
          statusCode: HttpStatus.NOT_FOUND,
          message:
            'Pillar summary not yet available. All blocks in this pillar must be submitted first.',
        };

      return {
        status: true,
        statusCode: HttpStatus.OK,
        message: 'Pillar summary retrieved.',
        data: {
          assessmentId,
          pillarId: summary.pillarId,
          pillarName: pillar.name,
          pillarScore: summary.pillarScore,
          aiSummary: summary.aiSummary,
          completedAt: summary.completedAt,
        },
      };
    } catch (err) {
      this.logger.error('getPillarSummary error', err);
      return {
        status: false,
        statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
        message: 'Server error.',
      };
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // NGO — SUBMIT FULL ASSESSMENT
  // ─────────────────────────────────────────────────────────────────────────

  async submitAssessment(ngoUserId: string, assessmentId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: ngoUserId },
      include: { organization: { select: { id: true, name: true } } },
    });

    const assessment = await this.prisma.oDAAssessment.findFirst({
      where: { id: assessmentId, orgId: user?.organization?.id },
      include: {
        blockResponses: {
          include: {
            buildingBlock: { select: { maxScore: true, name: true } },
          },
        },
      },
    });

    if (!assessment)
      return {
        status: false,
        statusCode: HttpStatus.NOT_FOUND,
        message: 'Assessment not found.',
      };
    if (assessment.status !== FormStatus.IN_PROGRESS)
      return {
        status: false,
        statusCode: HttpStatus.BAD_REQUEST,
        message: `Assessment is already ${assessment.status}.`,
      };

    const pending = assessment.blockResponses.filter(
      (b) => b.status !== 'SUBMITTED',
    );
    if (pending.length > 0)
      return {
        status: false,
        statusCode: HttpStatus.BAD_REQUEST,
        message: `${pending.length} block(s) still in progress: ${pending.map((b) => b.buildingBlock.name).join(', ')}. Submit all blocks before submitting the assessment.`,
      };

    const blockResults = assessment.blockResponses.map((br) => ({
      blockId: br.buildingBlockId,
      blockName: br.buildingBlock.name,
      pillarName: '',
      rawAverage: 0,
      normalised: br.blockScore ?? 0,
      maxScore: br.buildingBlock.maxScore,
      answeredCount: (br.answers as any[])?.length ?? 0,
    }));

    const overallScore = this.scoring.computeOverallScore(blockResults);

    await this.prisma.oDAAssessment.update({
      where: { id: assessmentId },
      data: { status: FormStatus.SUBMITTED, overallScore },
    });

    this.runScoringAsync(
      assessmentId,
      ngoUserId,
      user?.organization?.name ?? '',
    ).catch((err) => this.logger.error('Async scoring failed', err));

    return {
      status: true,
      statusCode: HttpStatus.OK,
      message:
        'Assessment submitted. Your summary report will be ready shortly.',
      data: { assessmentId, overallScore },
    };
  }

  private async runScoringAsync(
    assessmentId: string,
    ngoUserId: string,
    orgName: string,
  ) {
    try {
      const aiSummary = await this.scoring.generateSummary(assessmentId);

      await this.prisma.oDAAssessment.update({
        where: { id: assessmentId },
        data: {
          status: FormStatus.COMPLETED,
          aiSummary,
          completedAt: new Date(),
        },
      });

      const user = await this.prisma.user.findUnique({
        where: { id: ngoUserId },
        select: { email: true, fullName: true },
      });
      if (user) {
        this.email
          .sendODACompletionNotification({
            fullName: user.fullName,
            email: user.email,
            orgName,
            dashboardUrl: `${process.env.FRONTEND_URL}/dashboard/oda/${assessmentId}`,
          })
          .catch((err) =>
            this.logger.error('ODA completion email failed', err),
          );
      }
    } catch (err) {
      this.logger.error(`runScoringAsync failed for ${assessmentId}`, err);
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // NGO — DELETE IN-PROGRESS ASSESSMENT
  // ─────────────────────────────────────────────────────────────────────────

  async deleteAssessment(ngoUserId: string, assessmentId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: ngoUserId },
      include: { organization: { select: { id: true } } },
    });

    const assessment = await this.prisma.oDAAssessment.findFirst({
      where: { id: assessmentId, orgId: user?.organization?.id },
    });

    if (!assessment)
      return {
        status: false,
        statusCode: HttpStatus.NOT_FOUND,
        message: 'Assessment not found.',
      };
    if (assessment.status !== FormStatus.IN_PROGRESS)
      return {
        status: false,
        statusCode: HttpStatus.BAD_REQUEST,
        message: 'Only in-progress assessments can be deleted.',
      };

    await this.prisma.oDAAssessment.delete({ where: { id: assessmentId } });
    return {
      status: true,
      statusCode: HttpStatus.OK,
      message: 'Assessment deleted.',
    };
  }

  // ─────────────────────────────────────────────────────────────────────────
  // ADMIN — LIST ALL ASSESSMENTS
  // ─────────────────────────────────────────────────────────────────────────

  async adminListAssessments(query: AdminListAssessmentsQueryDto) {
    const { skip, take, page, limit } = this.paginate(query.page, query.limit);
    const where: any = {};
    if (query.status) where.status = query.status;
    if (query.orgId) where.orgId = query.orgId;

    const [items, total] = await Promise.all([
      this.prisma.oDAAssessment.findMany({
        where,
        skip,
        take,
        include: {
          organization: { select: { id: true, name: true } },
          blockResponses: { select: { status: true } },
        },
        orderBy: { startedAt: 'desc' },
      }),
      this.prisma.oDAAssessment.count({ where }),
    ]);

    return {
      status: true,
      statusCode: HttpStatus.OK,
      data: items.map((a) => this.formatListItem(a)),
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  // ─────────────────────────────────────────────────────────────────────────
  // ADMIN — GET ANY ASSESSMENT BY ID
  // ─────────────────────────────────────────────────────────────────────────

  async adminGetAssessmentById(assessmentId: string) {
    const assessment = await this.prisma.oDAAssessment.findUnique({
      where: { id: assessmentId },
      include: FULL_ASSESSMENT_INCLUDE,
    });

    if (!assessment)
      return {
        status: false,
        statusCode: HttpStatus.NOT_FOUND,
        message: 'Assessment not found.',
      };

    return {
      status: true,
      statusCode: HttpStatus.OK,
      data: this.formatAssessment(assessment),
    };
  }

  // ─────────────────────────────────────────────────────────────────────────
  // ADMIN — STATS
  // ─────────────────────────────────────────────────────────────────────────

  async adminGetStats() {
    const [total, inProgress, submitted, completed] = await Promise.all([
      this.prisma.oDAAssessment.count(),
      this.prisma.oDAAssessment.count({
        where: { status: FormStatus.IN_PROGRESS },
      }),
      this.prisma.oDAAssessment.count({
        where: { status: FormStatus.SUBMITTED },
      }),
      this.prisma.oDAAssessment.count({
        where: { status: FormStatus.COMPLETED },
      }),
    ]);

    const scoreAgg = await this.prisma.oDAAssessment.aggregate({
      where: { status: FormStatus.COMPLETED, overallScore: { not: null } },
      _avg: { overallScore: true },
    });

    const blockResponses = await this.prisma.oDABlockResponse.findMany({
      where: { blockScore: { not: null } },
      include: {
        buildingBlock: { include: { pillar: { select: { name: true } } } },
      },
    });

    const blockMap: Record<
      string,
      { name: string; pillarName: string; scores: number[] }
    > = {};
    for (const br of blockResponses) {
      if (!blockMap[br.buildingBlockId])
        blockMap[br.buildingBlockId] = {
          name: br.buildingBlock.name,
          pillarName: br.buildingBlock.pillar.name,
          scores: [],
        };
      if (br.blockScore !== null)
        blockMap[br.buildingBlockId].scores.push(br.blockScore);
    }

    const blockBreakdown = Object.entries(blockMap)
      .map(([id, v]) => ({
        blockId: id,
        blockName: v.name,
        pillarName: v.pillarName,
        averageScore: v.scores.length
          ? parseFloat(
              (v.scores.reduce((s, n) => s + n, 0) / v.scores.length).toFixed(
                2,
              ),
            )
          : 0,
        responsesCount: v.scores.length,
      }))
      .sort((a, b) => a.averageScore - b.averageScore);

    return {
      status: true,
      statusCode: HttpStatus.OK,
      data: {
        total,
        inProgress,
        submitted,
        completed,
        averageOverallScore: parseFloat(
          (scoreAgg._avg.overallScore ?? 0).toFixed(2),
        ),
        blockBreakdown,
      },
    };
  }

  // ─────────────────────────────────────────────────────────────────────────
  // PDF DOWNLOAD
  // ─────────────────────────────────────────────────────────────────────────

  async generatePdfReport(
    requesterId: string,
    requesterRole: string,
    assessmentId: string,
  ) {
    try {
      const assessment = await this.prisma.oDAAssessment.findUnique({
        where: { id: assessmentId },
        include: {
          organization: { select: { id: true, name: true, userId: true } },
          blockResponses: {
            include: {
              buildingBlock: {
                include: { pillar: { select: { name: true } } },
              },
            },
            orderBy: { buildingBlock: { order: 'asc' } },
          },
        },
      });

      if (!assessment)
        return {
          status: false,
          statusCode: HttpStatus.NOT_FOUND,
          message: 'Assessment not found.',
        };

      const isAdmin = ['SUPER_ADMIN', 'CONTENT_ADMIN'].includes(requesterRole);
      if (!isAdmin && assessment.organization.userId !== requesterId)
        return {
          status: false,
          statusCode: HttpStatus.FORBIDDEN,
          message: 'Access denied.',
        };

      if (assessment.status !== FormStatus.COMPLETED || !assessment.aiSummary)
        return {
          status: false,
          statusCode: HttpStatus.BAD_REQUEST,
          message:
            'Assessment is not yet complete. The PDF is only available after the AI summary is generated.',
        };

      const blockData = assessment.blockResponses.map((br) => {
        const answers = (br.answers as any[]) ?? [];
        const scored = answers.filter((a) => a.selectedScale);
        const avg = scored.length
          ? scored.reduce((s: number, a: any) => s + a.selectedScale, 0) /
            scored.length
          : 0;
        return {
          pillar: br.buildingBlock.pillar.name,
          block: br.buildingBlock.name,
          score: br.blockScore ?? 0,
          maxScore: br.buildingBlock.maxScore,
          avgScale: parseFloat(avg.toFixed(2)),
        };
      });

      const stream = this.buildPdf({
        orgName: assessment.organization.name,
        completedAt: assessment.completedAt ?? new Date(),
        overallScore: assessment.overallScore ?? 0,
        aiSummary: assessment.aiSummary,
        blockData,
      });

      return {
        status: true,
        statusCode: HttpStatus.OK,
        message: 'PDF ready.',
        stream,
      };
    } catch (err) {
      this.logger.error('generatePdfReport error', err);
      return {
        status: false,
        statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
        message: 'Server error.',
      };
    }
  }

  private buildPdf(data: {
    orgName: string;
    completedAt: Date;
    overallScore: number;
    aiSummary: string;
    blockData: {
      pillar: string;
      block: string;
      score: number;
      maxScore: number;
      avgScale: number;
    }[];
  }): any {
    const { orgName, completedAt, overallScore, aiSummary, blockData } = data;

    const NAVY = '#1B4F72';
    const TEAL = '#148F77';
    const SILVER = '#CCCCCC';
    const DARK = '#222222';
    const MID = '#555555';
    const LIGHT = '#888888';
    const WHITE = '#FFFFFF';
    const BG_ROW = '#F4F6F7';

    const doc = new PDFDocument({
      margin: 50,
      size: 'A4',
      bufferPages: true,
      info: {
        Title: `ODA Assessment Report — ${orgName}`,
        Author: 'PLRCAP NGO Support Hub',
      },
    });

    const PAGE_W = doc.page.width;
    const INNER = PAGE_W - 100;
    const LEFT = 50;

    const capacityBand = (score: number) => {
      if (score >= 75) return { label: 'High Capacity', color: TEAL };
      if (score >= 50) return { label: 'Moderate Capacity', color: '#2E86C1' };
      if (score >= 25)
        return { label: 'Developing Capacity', color: '#D4AC0D' };
      return { label: 'Low Capacity', color: '#C0392B' };
    };

    const scaleBand = (avg: number) => {
      if (avg >= 3.5) return 'Best Practice';
      if (avg >= 2.5) return 'Functional';
      if (avg >= 1.5) return 'Basic / Incomplete';
      return 'Not in Place';
    };

    const progressBar = (
      x: number,
      y: number,
      width: number,
      ratio: number,
      color: string,
    ) => {
      doc.rect(x, y, width, 8).fillColor('#E8E8E8').fill();
      doc
        .rect(x, y, Math.max(2, width * Math.min(ratio, 1)), 8)
        .fillColor(color)
        .fill();
    };

    const sectionHeader = (title: string) => {
      doc.moveDown(0.8);
      doc.rect(LEFT, doc.y, 4, 14).fillColor(NAVY).fill();
      doc
        .fillColor(NAVY)
        .font('Helvetica-Bold')
        .fontSize(11)
        .text(title, LEFT + 10, doc.y, { width: INNER - 10 });
      doc.moveDown(0.3);
      doc.rect(LEFT, doc.y, INNER, 0.5).fillColor(SILVER).fill();
      doc.moveDown(0.6);
    };

    const bodyText = (text: string, color = DARK) => {
      doc
        .font('Helvetica')
        .fontSize(9.5)
        .fillColor(color)
        .text(text, LEFT, doc.y, { width: INNER });
      doc.moveDown(0.3);
    };

    // Cover page
    doc.rect(0, 0, PAGE_W, 8).fillColor(NAVY).fill();
    doc.moveDown(3);
    doc
      .font('Helvetica-Bold')
      .fontSize(22)
      .fillColor(NAVY)
      .text('ODA Assessment Report', LEFT, doc.y, {
        align: 'center',
        width: INNER,
      });
    doc.moveDown(0.4);
    doc
      .font('Helvetica')
      .fontSize(14)
      .fillColor(MID)
      .text(orgName, { align: 'center', width: INNER });
    doc.moveDown(1.5);

    const band = capacityBand(overallScore);
    const boxY = doc.y;
    const boxW = 240;
    const boxX = (PAGE_W - boxW) / 2;
    doc.roundedRect(boxX, boxY, boxW, 80, 6).fillColor(NAVY).fill();
    doc
      .font('Helvetica')
      .fontSize(9)
      .fillColor(WHITE)
      .text('OVERALL SCORE', boxX, boxY + 12, { width: boxW, align: 'center' });
    doc
      .font('Helvetica-Bold')
      .fontSize(36)
      .fillColor(WHITE)
      .text(`${overallScore.toFixed(1)}%`, boxX, boxY + 24, {
        width: boxW,
        align: 'center',
      });
    doc
      .font('Helvetica')
      .fontSize(9)
      .fillColor('#AED6F1')
      .text(band.label.toUpperCase(), boxX, boxY + 62, {
        width: boxW,
        align: 'center',
      });
    doc.y = boxY + 96;
    doc.moveDown(1);
    doc
      .font('Helvetica')
      .fontSize(9)
      .fillColor(LIGHT)
      .text(
        `Report generated: ${new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })}` +
          `   ·   Assessment completed: ${completedAt.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })}`,
        { align: 'center', width: INNER },
      );

    // Page 2 — block scores
    doc.addPage();
    doc.rect(0, 0, PAGE_W, 8).fillColor(NAVY).fill();
    doc.moveDown(1.5);
    sectionHeader('BUILDING BLOCK SCORES');

    const pillarMap = new Map<string, typeof blockData>();
    for (const b of blockData) {
      if (!pillarMap.has(b.pillar)) pillarMap.set(b.pillar, []);
      pillarMap.get(b.pillar)!.push(b);
    }

    let rowToggle = false;
    for (const [pillarName, blocks] of pillarMap) {
      doc.rect(LEFT, doc.y, INNER, 16).fillColor('#D6EAF8').fill();
      doc
        .font('Helvetica-Bold')
        .fontSize(9)
        .fillColor(NAVY)
        .text(pillarName.toUpperCase(), LEFT + 6, doc.y + 4, {
          width: INNER - 12,
        });
      doc.moveDown(1.4);

      for (const b of blocks) {
        const rowH = 22;
        const rowY = doc.y;
        if (rowToggle)
          doc.rect(LEFT, rowY, INNER, rowH).fillColor(BG_ROW).fill();
        rowToggle = !rowToggle;
        doc
          .font('Helvetica')
          .fontSize(8.5)
          .fillColor(DARK)
          .text(b.block, LEFT + 4, rowY + 4, { width: 200 });
        doc
          .font('Helvetica-Bold')
          .fontSize(8.5)
          .fillColor(NAVY)
          .text(`${b.score.toFixed(1)} / ${b.maxScore}`, LEFT + 210, rowY + 4, {
            width: 60,
          });
        const barX = LEFT + 275;
        const barW = 130;
        const ratio = b.maxScore > 0 ? b.score / b.maxScore : 0;
        const barCol =
          ratio >= 0.75
            ? TEAL
            : ratio >= 0.5
              ? '#2E86C1'
              : ratio >= 0.25
                ? '#D4AC0D'
                : '#C0392B';
        progressBar(barX, rowY + 7, barW, ratio, barCol);
        doc
          .font('Helvetica')
          .fontSize(7.5)
          .fillColor(MID)
          .text(scaleBand(b.avgScale), barX + barW + 6, rowY + 5, {
            width: 80,
          });
        doc.y = rowY + rowH;
      }
      doc.moveDown(0.5);
    }

    // Page 3+ — narrative
    doc.addPage();
    doc.rect(0, 0, PAGE_W, 8).fillColor(NAVY).fill();
    doc.moveDown(1.5);
    sectionHeader('AI-GENERATED EVALUATION SUMMARY');

    const lines = aiSummary.split('\n');
    for (const line of lines) {
      const trimmed = line.trimEnd();
      if (/^ODA Assessment Summary/.test(trimmed)) continue;
      if (/^[─]+$/.test(trimmed)) continue;
      if (/^[A-Z][A-Z\s&:—–-]+$/.test(trimmed) && trimmed.length > 4) {
        if (doc.y > doc.page.height - 120) {
          doc.addPage();
          doc.moveDown(1);
        }
        sectionHeader(trimmed);
        continue;
      }
      if (trimmed.startsWith('  •') || trimmed.startsWith('•')) {
        if (doc.y > doc.page.height - 80) {
          doc.addPage();
          doc.moveDown(1);
        }
        doc
          .font('Helvetica')
          .fontSize(9)
          .fillColor(DARK)
          .text('•  ' + trimmed.replace(/^\s*•\s*/, ''), LEFT + 10, doc.y, {
            width: INNER - 10,
          });
        doc.moveDown(0.25);
        continue;
      }
      if (trimmed.startsWith('    ') && trimmed.trim()) {
        if (doc.y > doc.page.height - 80) {
          doc.addPage();
          doc.moveDown(1);
        }
        doc
          .font('Helvetica-Oblique')
          .fontSize(8.5)
          .fillColor(MID)
          .text(trimmed.trim(), LEFT + 20, doc.y, { width: INNER - 20 });
        doc.moveDown(0.25);
        continue;
      }
      if (trimmed.includes('█') || trimmed.includes('░')) continue;
      if (
        trimmed.startsWith('Overall Score:') ||
        trimmed.startsWith('Performance Trend:') ||
        trimmed.startsWith('Pillar Score:')
      ) {
        if (doc.y > doc.page.height - 80) {
          doc.addPage();
          doc.moveDown(1);
        }
        doc
          .font('Helvetica-Bold')
          .fontSize(10)
          .fillColor(NAVY)
          .text(trimmed, LEFT, doc.y, { width: INNER });
        doc.moveDown(0.4);
        continue;
      }
      if (!trimmed) {
        doc.moveDown(0.35);
        continue;
      }
      if (doc.y > doc.page.height - 80) {
        doc.addPage();
        doc.moveDown(1);
      }
      bodyText(trimmed);
    }

    // Footer on every page
    const pageCount = doc.bufferedPageRange().count;
    for (let i = 0; i < pageCount; i++) {
      doc.switchToPage(i);
      doc
        .rect(0, doc.page.height - 28, PAGE_W, 28)
        .fillColor(NAVY)
        .fill();
      doc
        .font('Helvetica')
        .fontSize(8)
        .fillColor('#AED6F1')
        .text(
          `PLRCAP NGO Support Hub  ·  ${orgName}  ·  Page ${i + 1} of ${pageCount}`,
          0,
          doc.page.height - 18,
          { align: 'center', width: PAGE_W },
        );
    }

    doc.end();
    return doc;
  }
}
