import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from 'src/prisma.service';

interface AnswerItem {
  questionId: string;
  questionText: string;
  selectedScale: number; // 1–4
  evidence?: string;
}

interface BlockScoreResult {
  blockId: string;
  blockName: string;
  pillarName: string;
  rawAverage: number; // average of selectedScale values (1–4)
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

    // ── Historical trend ───────────────────────────────────────────────────
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

    // ── Block analysis — evidence is now captured alongside weak items ─────
    const blockSummaries = assessment.blockResponses.map((br) => {
      const answers = (br.answers as unknown as AnswerItem[]) ?? [];
      const scored = answers.filter((a) => a.selectedScale);

      const avgScale =
        scored.length > 0
          ? scored.reduce((s, a) => s + a.selectedScale, 0) / scored.length
          : 0;

      // Collect weak answers (scale ≤ 2) with their question text AND any
      // evidence the user provided — this is the most contextual signal we have
      const weakAnswers = scored
        .filter((a) => a.selectedScale <= 2)
        .slice(0, 3)
        .map((a) => ({
          question: a.questionText ?? a.questionId,
          evidence: (a.evidence ?? '').trim(),
          scale: a.selectedScale,
        }));

      // Collect strong answers (scale ≥ 3) with evidence for the strengths section
      const strongAnswers = scored
        .filter((a) => a.selectedScale >= 3 && (a.evidence ?? '').trim())
        .slice(0, 2)
        .map((a) => ({
          question: a.questionText ?? a.questionId,
          evidence: a.evidence!.trim(),
          scale: a.selectedScale,
        }));

      return {
        pillar: br.buildingBlock.pillar.name,
        block: br.buildingBlock.name,
        score: br.blockScore ?? 0,
        maxScore: br.buildingBlock.maxScore,
        avgScale: parseFloat(avgScale.toFixed(2)),
        weakAnswers,
        strongAnswers,
        label: this.scaleBand(avgScale),
      };
    });

    // ── Identify weakest/strongest pillar groups ───────────────────────────
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

    const weakestBlocks = [...blockSummaries]
      .sort((a, b) => a.avgScale - b.avgScale)
      .slice(0, 3);

    // ── Related resources from the library ────────────────────────────────
    const resourceSuggestions = await this.findRelevantResources(
      weakestBlocks.map((b) => b.block),
    );

    // ── Assemble structured narrative ─────────────────────────────────────
    const overallScore = assessment.overallScore ?? 0;
    const overallBand = this.scoreBand(overallScore);
    const context = org.sectors?.length
      ? `${org.sectors.join('/')} organisation in ${org.state ?? 'Nigeria'}`
      : `organisation in ${org.state ?? 'Nigeria'}`;

    const lines: string[] = [];

    // ── Title block ────────────────────────────────────────────────────────
    lines.push(`ODA Assessment Summary — ${org.name}`);
    lines.push(`${'─'.repeat(60)}`);
    lines.push('');

    // ── Overall result ─────────────────────────────────────────────────────
    lines.push(
      `Overall Score: ${overallScore.toFixed(1)}%  |  Capacity Level: ${overallBand}`,
    );

    if (hasPrevious && lastScore !== null) {
      const diff = overallScore - lastScore;
      const trend =
        diff > 0
          ? `improved by ${diff.toFixed(1)} points compared to the previous assessment`
          : diff < 0
            ? `declined by ${Math.abs(diff).toFixed(1)} points compared to the previous assessment`
            : 'remained unchanged since the previous assessment';
      lines.push(`Performance Trend: The organisation\'s score has ${trend}.`);
    }

    lines.push('');

    // ── Pillar performance table ───────────────────────────────────────────
    lines.push('PILLAR PERFORMANCE');
    lines.push('──────────────────');
    for (const { name, avg } of [...pillarAverages].reverse()) {
      const bar = '█'.repeat(Math.round(avg)) + '░'.repeat(4 - Math.round(avg));
      lines.push(
        `  ${name.padEnd(38)} ${bar}  ${this.scaleBand(avg)} (${avg.toFixed(2)}/4)`,
      );
    }
    lines.push('');

    // ── Strengths ─────────────────────────────────────────────────────────
    lines.push('STRENGTHS');
    lines.push('─────────');
    const strongBlocks = blockSummaries.filter((b) => b.avgScale >= 3);

    if (strongBlocks.length) {
      lines.push(
        `The organisation demonstrates its greatest capacity in the ${strongestPillar} pillar. ` +
          `The following areas are performing well:`,
      );
      lines.push('');
      for (const sb of strongBlocks) {
        lines.push(`  ${sb.block} (${sb.label})`);
        // Include any evidence the user provided for strong answers
        for (const sa of sb.strongAnswers) {
          lines.push(`    Evidence provided: "${sa.evidence}"`);
        }
      }
    } else {
      lines.push(
        `No blocks have yet reached a consistently high performance level. ` +
          `Continued effort across all pillars is encouraged.`,
      );
    }
    lines.push('');

    // ── Areas for development ──────────────────────────────────────────────
    lines.push('AREAS FOR DEVELOPMENT');
    lines.push('─────────────────────');
    lines.push(
      `The ${weakestPillar} pillar requires the most focused attention. ` +
        `The three lowest-scoring blocks are detailed below, including gaps identified ` +
        `from both the scale ratings and the evidence provided by respondents.`,
    );
    lines.push('');

    for (const wb of weakestBlocks) {
      lines.push(
        `  ${wb.block}  [${wb.label} — score ${wb.score.toFixed(1)} / ${wb.maxScore}]`,
      );

      if (wb.weakAnswers.length) {
        lines.push('  Identified gaps:');
        for (const wa of wb.weakAnswers) {
          const scaleLabel = SCALE_LABELS[wa.scale] ?? `Scale ${wa.scale}`;
          lines.push(`    • ${wa.question}  (rated: ${scaleLabel})`);
          if (wa.evidence) {
            lines.push(`      Organisation noted: "${wa.evidence}"`);
          }
        }
      } else {
        lines.push(
          '  This block scored below average. A review of current practices is recommended.',
        );
      }
      lines.push('');
    }

    // ── Recommended resources ──────────────────────────────────────────────
    if (resourceSuggestions.length) {
      lines.push('RECOMMENDED RESOURCES');
      lines.push('─────────────────────');
      lines.push(
        `Based on the gaps identified above, the following resources from the PLRCAP library ` +
          `may support capacity building:`,
      );
      lines.push('');
      for (const r of resourceSuggestions) {
        lines.push(`  • ${r.title}  [${r.type.toLowerCase()}]`);
      }
      lines.push('');
    }

    // ── Footer note ────────────────────────────────────────────────────────
    lines.push(`${'─'.repeat(60)}`);
    lines.push(
      `This report was generated from assessment data submitted by ${context}.`,
    );
    if (org.numberOfStaff) {
      lines.push(
        `Organisation size: approximately ${org.numberOfStaff} staff members.`,
      );
    }

    return lines.join('\n');
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
    // Note: Resource has no status field; filter by having a contentUrl (published indicator)
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
