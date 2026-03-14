import { Injectable, HttpStatus, Logger } from '@nestjs/common';
import { FormStatus } from '@prisma/client';

import {
  SaveBlockResponseDto,
  ListAssessmentsQueryDto,
  AdminListAssessmentsQueryDto,
} from '../dto/oda-assessment.dto';
import { PrismaService } from 'src/prisma.service';
import { EmailService } from 'src/providers/email/email.service';
import { OdaScoringService } from './oda-scoring.service';

const FULL_ASSESSMENT_INCLUDE = {
  organization: { select: { id: true, name: true } },
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

  // HELPERS

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

  // NGO START ASSESSMENT

  async startAssessment(ngoUserId: string) {
    // Must have an org
    const user = await this.prisma.user.findUnique({
      where: { id: ngoUserId },
      include: { organization: { select: { id: true, name: true } } },
    });

    if (!user?.organization) {
      return {
        status: false,
        statusCode: HttpStatus.BAD_REQUEST,
        message:
          'You must complete your organization profile before starting an ODA assessment.',
      };
    }

    const orgId = user.organization.id;

    // Enforce one active at a time
    const existing = await this.prisma.oDAAssessment.findFirst({
      where: { orgId, status: FormStatus.IN_PROGRESS },
    });
    if (existing) {
      return {
        status: false,
        statusCode: HttpStatus.CONFLICT,
        message:
          'You already have an assessment in progress. Complete or delete it before starting a new one.',
        data: { assessmentId: existing.id },
      };
    }

    // Fetch all building blocks ordered for block creation
    const blocks = await this.prisma.oDABuildingBlock.findMany({
      orderBy: [{ pillar: { order: 'asc' } }, { order: 'asc' }],
    });

    if (!blocks.length) {
      return {
        status: false,
        statusCode: HttpStatus.UNPROCESSABLE_ENTITY,
        message:
          'ODA structure has not been seeded yet. Contact the administrator.',
      };
    }

    // Create assessment + one ODABlockResponse per block in a transaction
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

    // Refetch with full include for response
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

  // NGO LIST OWN ASSESSMENTS

  async getMyAssessments(ngoUserId: string, query: ListAssessmentsQueryDto) {
    const user = await this.prisma.user.findUnique({
      where: { id: ngoUserId },
      include: { organization: { select: { id: true } } },
    });

    if (!user?.organization) {
      return {
        status: false,
        statusCode: HttpStatus.BAD_REQUEST,
        message: 'No organization profile found.',
      };
    }

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

  // NGO GET SINGLE ASSESSMENT

  async getMyAssessmentById(ngoUserId: string, assessmentId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: ngoUserId },
      include: { organization: { select: { id: true } } },
    });

    const assessment = await this.prisma.oDAAssessment.findFirst({
      where: { id: assessmentId, orgId: user?.organization?.id },
      include: FULL_ASSESSMENT_INCLUDE,
    });

    if (!assessment) {
      return {
        status: false,
        statusCode: HttpStatus.NOT_FOUND,
        message: 'Assessment not found.',
      };
    }

    return {
      status: true,
      statusCode: HttpStatus.OK,
      data: this.formatAssessment(assessment),
    };
  }

  // NGO SAVE BLOCK ANSWERS (draft, can be called multiple times)

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

    if (!assessment) {
      return {
        status: false,
        statusCode: HttpStatus.NOT_FOUND,
        message: 'Assessment not found.',
      };
    }
    if (assessment.status !== FormStatus.IN_PROGRESS) {
      return {
        status: false,
        statusCode: HttpStatus.BAD_REQUEST,
        message: `Cannot edit a ${assessment.status} assessment.`,
      };
    }

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

    if (!blockResponse) {
      return {
        status: false,
        statusCode: HttpStatus.NOT_FOUND,
        message: 'Building block not found in this assessment.',
      };
    }

    if (blockResponse.status === 'SUBMITTED') {
      return {
        status: false,
        statusCode: HttpStatus.BAD_REQUEST,
        message: 'This block has already been submitted and cannot be edited.',
      };
    }

    // Validate all questionIds belong to this block
    const validIds = new Set(
      blockResponse.buildingBlock.questions.map((q) => q.id),
    );
    const invalid = dto.answers.filter((a) => !validIds.has(a.questionId));
    if (invalid.length) {
      return {
        status: false,
        statusCode: HttpStatus.BAD_REQUEST,
        message: `Invalid question IDs: ${invalid.map((a) => a.questionId).join(', ')}`,
      };
    }

    // Enrich answers with question text for the stored JSON
    const enrichedAnswers = dto.answers.map((a) => ({
      questionId: a.questionId,
      questionText:
        blockResponse.buildingBlock.questions.find((q) => q.id === a.questionId)
          ?.text ?? '',
      selectedScale: a.selectedScale,
      evidence: a.evidence ?? '',
    }));

    // Compute live block score
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
  // NGO SUBMIT A SINGLE BLOCK
  // ─────────────────────────────────────────────────────────────────────────

  async submitBlock(ngoUserId: string, assessmentId: string, blockId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: ngoUserId },
      include: { organization: { select: { id: true } } },
    });

    const assessment = await this.prisma.oDAAssessment.findFirst({
      where: { id: assessmentId, orgId: user?.organization?.id },
    });

    if (!assessment) {
      return {
        status: false,
        statusCode: HttpStatus.NOT_FOUND,
        message: 'Assessment not found.',
      };
    }
    if (assessment.status !== FormStatus.IN_PROGRESS) {
      return {
        status: false,
        statusCode: HttpStatus.BAD_REQUEST,
        message: `Cannot modify a ${assessment.status} assessment.`,
      };
    }

    const blockResponse = await this.prisma.oDABlockResponse.findFirst({
      where: { assessmentId, buildingBlockId: blockId },
      include: {
        buildingBlock: {
          include: { questions: { select: { id: true } } },
        },
      },
    });

    if (!blockResponse) {
      return {
        status: false,
        statusCode: HttpStatus.NOT_FOUND,
        message: 'Block not found in this assessment.',
      };
    }
    if (blockResponse.status === 'SUBMITTED') {
      return {
        status: false,
        statusCode: HttpStatus.BAD_REQUEST,
        message: 'Block already submitted.',
      };
    }

    // Must have answered all questions
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

    return {
      status: true,
      statusCode: HttpStatus.OK,
      message: 'Block submitted.',
    };
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

    if (!assessment) {
      return {
        status: false,
        statusCode: HttpStatus.NOT_FOUND,
        message: 'Assessment not found.',
      };
    }
    if (assessment.status !== FormStatus.IN_PROGRESS) {
      return {
        status: false,
        statusCode: HttpStatus.BAD_REQUEST,
        message: `Assessment is already ${assessment.status}.`,
      };
    }

    // All blocks must be submitted
    const pending = assessment.blockResponses.filter(
      (b) => b.status !== 'SUBMITTED',
    );
    if (pending.length > 0) {
      return {
        status: false,
        statusCode: HttpStatus.BAD_REQUEST,
        message: `${pending.length} block(s) still in progress: ${pending.map((b) => b.buildingBlock.name).join(', ')}. Submit all blocks before submitting the assessment.`,
      };
    }

    // Compute overall score
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

    // Mark as SUBMITTED with overall score
    await this.prisma.oDAAssessment.update({
      where: { id: assessmentId },
      data: { status: FormStatus.SUBMITTED, overallScore },
    });

    // Fire-and-forget: generate summary then flip to COMPLETED
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

      // Notify the NGO owner
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
            dashboardUrl: `${process.env.FRONTEND_URL}/admin/oda/${assessmentId}`,
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

    if (!assessment) {
      return {
        status: false,
        statusCode: HttpStatus.NOT_FOUND,
        message: 'Assessment not found.',
      };
    }
    if (assessment.status !== FormStatus.IN_PROGRESS) {
      return {
        status: false,
        statusCode: HttpStatus.BAD_REQUEST,
        message: 'Only in-progress assessments can be deleted.',
      };
    }

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

    if (!assessment) {
      return {
        status: false,
        statusCode: HttpStatus.NOT_FOUND,
        message: 'Assessment not found.',
      };
    }

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

    // Average overall score across completed assessments
    const scoreAgg = await this.prisma.oDAAssessment.aggregate({
      where: { status: FormStatus.COMPLETED, overallScore: { not: null } },
      _avg: { overallScore: true },
    });

    // Per-block breakdown: average score and response count
    const blockResponses = await this.prisma.oDABlockResponse.findMany({
      where: { blockScore: { not: null } },
      include: {
        buildingBlock: {
          include: { pillar: { select: { name: true } } },
        },
      },
    });

    const blockMap: Record<
      string,
      { name: string; pillarName: string; scores: number[] }
    > = {};
    for (const br of blockResponses) {
      if (!blockMap[br.buildingBlockId]) {
        blockMap[br.buildingBlockId] = {
          name: br.buildingBlock.name,
          pillarName: br.buildingBlock.pillar.name,
          scores: [],
        };
      }
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
      .sort((a, b) => a.averageScore - b.averageScore); // weakest first

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
}
