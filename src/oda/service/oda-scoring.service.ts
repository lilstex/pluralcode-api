/* eslint-disable @typescript-eslint/no-unused-vars */
import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from 'src/prisma.service';

interface AnswerItem {
  questionId: string;
  questionText: string;
  selectedScale: number;
  evidence?: string;
}

interface BlockScoreResult {
  blockId: string;
  blockName: string;
  pillarName: string;
  rawAverage: number;
  normalised: number; // scaled to maxScore
  maxScore: number;
  answeredCount: number;
}

const SCALE_LABELS: Record<number, string> = {
  1: 'Not in place',
  2: 'Basic/Incomplete',
  3: 'Functional',
  4: 'Best practice',
};

@Injectable()
export class OdaScoringService {
  private readonly logger = new Logger(OdaScoringService.name);

  constructor(private readonly prisma: PrismaService) {}

  // ─────────────────────────────────────────────────────────────────────────
  // BLOCK SCORE — called immediately on each save to show live progress
  // ─────────────────────────────────────────────────────────────────────────

  computeBlockScore(answers: AnswerItem[], maxScore: number): number {
    if (!answers.length) return 0;
    const answered = answers.filter(
      (a) => a.selectedScale >= 1 && a.selectedScale <= 4,
    );
    if (!answered.length) return 0;

    // Average scale (1–4), then normalise to maxScore
    const avgScale =
      answered.reduce((sum, a) => sum + a.selectedScale, 0) / answered.length;
    // avgScale / 4 gives a 0–1 ratio, multiply by maxScore
    return parseFloat(((avgScale / 4) * maxScore).toFixed(2));
  }

  // ─────────────────────────────────────────────────────────────────────────
  // OVERALL SCORE — called on full assessment completion
  // Weighted average: each block contributes proportionally to its maxScore
  // ─────────────────────────────────────────────────────────────────────────

  computeOverallScore(blockResults: BlockScoreResult[]): number {
    if (!blockResults.length) return 0;
    const totalMaxScore = blockResults.reduce((sum, b) => sum + b.maxScore, 0);
    const totalEarned = blockResults.reduce((sum, b) => sum + b.normalised, 0);
    return parseFloat(((totalEarned / totalMaxScore) * 100).toFixed(2));
  }

  // ─────────────────────────────────────────────────────────────────────────
  // AI SUMMARY — internal intelligence, no external API
  // Uses org profile + this assessment + historical assessments for context
  // ─────────────────────────────────────────────────────────────────────────

  async generateSummary(assessmentId: string): Promise<string> {
    const assessment = await this.prisma.oDAAssessment.findUnique({
      where: { id: assessmentId },
      include: {
        organization: {
          select: {
            name: true,
            sectors: true,
            state: true,
            numberOfStaff: true,
            annualBudget: true,
          },
        },
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

    if (!assessment) return '';

    const org = assessment.organization;

    // Historical trend
    const previousAssessments = await this.prisma.oDAAssessment.findMany({
      where: {
        orgId: assessment.orgId,
        status: 'COMPLETED',
        id: { not: assessmentId },
      },
      orderBy: { completedAt: 'desc' },
      take: 3,
      select: { overallScore: true, completedAt: true },
    });

    const hasPrevious = previousAssessments.length > 0;
    const lastScore = hasPrevious ? previousAssessments[0].overallScore : null;

    // Block analysis
    const blockSummaries = assessment.blockResponses.map((br) => {
      const answers = (br.answers as unknown as AnswerItem[]) ?? [];
      const scored = answers.filter((a) => a.selectedScale);

      const avgScale =
        scored.length > 0
          ? scored.reduce((s, a) => s + a.selectedScale, 0) / scored.length
          : 0;

      const weakItems = scored
        .filter((a) => a.selectedScale <= 2)
        .map((a) => a.questionText ?? a.questionId)
        .slice(0, 2);

      return {
        pillar: br.buildingBlock.pillar.name,
        block: br.buildingBlock.name,
        score: br.blockScore ?? 0,
        maxScore: br.buildingBlock.maxScore,
        avgScale: parseFloat(avgScale.toFixed(2)),
        weakItems,
        label: this.scaleBand(avgScale),
      };
    });

    // ── Identify weakest pillar group ──────────────────────────────────────
    const pillarMap: Record<string, { total: number; count: number }> = {};
    for (const b of blockSummaries) {
      if (!pillarMap[b.pillar]) pillarMap[b.pillar] = { total: 0, count: 0 };
      pillarMap[b.pillar].total += b.avgScale;
      pillarMap[b.pillar].count += 1;
    }
    const pillarAverages = Object.entries(pillarMap)
      .map(([name, v]) => ({ name, avg: v.total / v.count }))
      .sort((a, b) => a.avg - b.avg);

    const weakestPillar = pillarAverages[0]?.name ?? '';
    const strongestPillar = pillarAverages.at(-1)?.name ?? '';

    const weakestBlocks = blockSummaries
      .sort((a, b) => a.avgScale - b.avgScale)
      .slice(0, 3);

    // ── Related resources from the library ────────────────────────────────
    const resourceSuggestions = await this.findRelevantResources(
      weakestBlocks.map((b) => b.block),
    );

    // ── Assemble narrative ─────────────────────────────────────────────────
    const overallScore = assessment.overallScore ?? 0;
    const overallBand = this.scoreBand(overallScore);

    let summary = `## ODA Assessment Summary — ${org.name}\n\n`;
    summary += `**Overall Score:** ${overallScore.toFixed(1)}% (${overallBand})\n`;

    if (hasPrevious && lastScore !== null) {
      const diff = overallScore - lastScore;
      const trend =
        diff > 0
          ? `improved by ${diff.toFixed(1)} points`
          : diff < 0
            ? `declined by ${Math.abs(diff).toFixed(1)} points`
            : 'unchanged';
      summary += `**Trend:** Score has ${trend} since the last assessment.\n`;
    }

    summary += `\n### Pillar Performance\n`;
    for (const { name, avg } of pillarAverages.slice().reverse()) {
      summary += `- **${name}:** ${this.scaleBand(avg)} (avg scale ${avg.toFixed(2)}/4)\n`;
    }

    summary += `\n### Strengths\n`;
    summary += `Your organisation demonstrates the most capacity in the **${strongestPillar}** pillar. `;
    const strongBlocks = blockSummaries
      .filter((b) => b.avgScale >= 3)
      .map((b) => b.block);
    if (strongBlocks.length) {
      summary += `Notable strengths were found in: ${strongBlocks.join(', ')}.\n`;
    }

    summary += `\n### Areas for Development\n`;
    summary += `The **${weakestPillar}** pillar requires the most attention. `;
    for (const wb of weakestBlocks) {
      summary += `\n- **${wb.block}** (${wb.label}): `;
      if (wb.weakItems.length) {
        summary += `Key gaps identified around: ${wb.weakItems.join('; ')}.`;
      } else {
        summary += `This block scored below average — a review of current practices is recommended.`;
      }
    }

    if (resourceSuggestions.length) {
      summary += `\n\n### Recommended Resources\n`;
      summary += `Based on your assessment gaps, the following resources from the PLRCAP library may help:\n`;
      for (const r of resourceSuggestions) {
        summary += `- **${r.title}** — ${r.type.toLowerCase()}\n`;
      }
    }

    if (org.sectors?.length) {
      summary += `\n*This summary was generated based on assessment data for a ${org.sectors.join('/')} organisation in ${org.state ?? 'Nigeria'}.*`;
    }

    return summary;
  }

  // ─────────────────────────────────────────────────────────────────────────
  // HELPERS
  // ─────────────────────────────────────────────────────────────────────────

  private scaleBand(avg: number): string {
    if (avg >= 3.5) return 'Best Practice';
    if (avg >= 2.5) return 'Functional';
    if (avg >= 1.5) return 'Basic/Incomplete';
    return 'Not in Place';
  }

  private scoreBand(score: number): string {
    if (score >= 75) return 'High Capacity';
    if (score >= 50) return 'Moderate Capacity';
    if (score >= 25) return 'Developing Capacity';
    return 'Low Capacity';
  }

  private async findRelevantResources(blockNames: string[]) {
    if (!blockNames.length) return [];

    // Simple keyword match: look for resources whose title contains block keywords
    const keywords = blockNames.flatMap((n) =>
      n
        .toLowerCase()
        .split(/[\s&,/]+/)
        .filter((w) => w.length > 3),
    );

    // Build OR conditions — keyword match on resource title
    const resources = await this.prisma.resource.findMany({
      where: {
        contentUrl: { not: null },
        OR: keywords.slice(0, 5).map((kw) => ({
          title: { contains: kw, mode: 'insensitive' as any },
        })),
      },
      select: { id: true, title: true, type: true },
      take: 5,
      orderBy: { createdAt: 'desc' },
    });

    return resources;
  }
}
