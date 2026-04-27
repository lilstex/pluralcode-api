import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from 'src/prisma-module/prisma.service';

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
  // BLOCK SCORE — called on each save for live progress
  // ─────────────────────────────────────────────────────────────────────────

  computeBlockScore(answers: AnswerItem[], maxScore: number): number {
    if (!answers.length) return 0;
    const answered = answers.filter(
      (a) => a.selectedScale >= 1 && a.selectedScale <= 4,
    );
    if (!answered.length) return 0;
    const avgScale =
      answered.reduce((sum, a) => sum + a.selectedScale, 0) / answered.length;
    return parseFloat(((avgScale / 4) * maxScore).toFixed(2));
  }

  // ─────────────────────────────────────────────────────────────────────────
  // OVERALL SCORE — weighted average across all blocks
  // ─────────────────────────────────────────────────────────────────────────

  computeOverallScore(blockResults: BlockScoreResult[]): number {
    if (!blockResults.length) return 0;
    const totalMax = blockResults.reduce((sum, b) => sum + b.maxScore, 0);
    const totalEarned = blockResults.reduce((sum, b) => sum + b.normalised, 0);
    return parseFloat(((totalEarned / totalMax) * 100).toFixed(2));
  }

  // ─────────────────────────────────────────────────────────────────────────
  // PILLAR SCORE — weighted average for one pillar's blocks
  // ─────────────────────────────────────────────────────────────────────────

  computePillarScore(
    pillarBlockResponses: { blockScore: number | null; maxScore: number }[],
  ): number {
    const valid = pillarBlockResponses.filter((b) => b.blockScore !== null);
    if (!valid.length) return 0;
    const totalMax = valid.reduce((s, b) => s + b.maxScore, 0);
    const totalEarned = valid.reduce((s, b) => s + b.blockScore!, 0);
    return parseFloat(((totalEarned / totalMax) * 100).toFixed(2));
  }

  // ─────────────────────────────────────────────────────────────────────────
  // FULL ASSESSMENT AI SUMMARY
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
            buildingBlock: { include: { pillar: { select: { name: true } } } },
          },
          orderBy: { buildingBlock: { order: 'asc' } },
        },
      },
    });

    if (!assessment) return '';

    const org = assessment.organization;

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

    const blockSummaries = this.buildBlockSummaries(assessment.blockResponses);

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

    const resourceSuggestions = await this.findRelevantResources(
      weakestBlocks.map((b) => b.block),
    );
    const expertSuggestions = await this.findRelevantExperts(
      weakestBlocks.map((b) => b.block),
    );

    const overallScore = assessment.overallScore ?? 0;
    const overallBand = this.scoreBand(overallScore);
    const context = org.sectors?.length
      ? `${org.sectors.join('/')} organisation in ${org.state ?? 'Nigeria'}`
      : `organisation in ${org.state ?? 'Nigeria'}`;

    const lines: string[] = [];

    lines.push(`ODA Assessment Summary — ${org.name}`);
    lines.push(`${'─'.repeat(60)}`);
    lines.push('');
    lines.push(
      `Overall Score: ${overallScore.toFixed(1)}%  |  Capacity Level: ${overallBand}`,
    );

    if (hasPrevious && lastScore !== null) {
      const diff = overallScore - lastScore;
      const trend =
        diff > 0
          ? `improved by ${diff.toFixed(1)} points`
          : diff < 0
            ? `declined by ${Math.abs(diff).toFixed(1)} points`
            : 'remained unchanged';
      lines.push(
        `Performance Trend: The organisation\'s score has ${trend} compared to the previous assessment.`,
      );
    }
    lines.push('');

    lines.push('PILLAR PERFORMANCE');
    lines.push('──────────────────');
    for (const { name, avg } of [...pillarAverages].reverse()) {
      const bar = '█'.repeat(Math.round(avg)) + '░'.repeat(4 - Math.round(avg));
      lines.push(
        `  ${name.padEnd(38)} ${bar}  ${this.scaleBand(avg)} (${avg.toFixed(2)}/4)`,
      );
    }
    lines.push('');

    lines.push('STRATEGIC ASSETS & STRENGTHS');
    lines.push('──────────────────');
    const strongBlocks = blockSummaries.filter((b) => b.avgScale >= 3);
    // if (strongBlocks.length) {
    //   lines.push(
    //     `The organisation demonstrates its greatest capacity in the ${strongestPillar} pillar. The following areas are performing well:`,
    //   );
    //   lines.push('');
    //   for (const sb of strongBlocks) {
    //     lines.push(`  ${sb.block} (${sb.label})`);
    //     for (const sa of sb.strongAnswers)
    //       lines.push(`    Evidence: "${sa.evidence}"`);
    //   }
    // } else {
    //   lines.push(
    //     'No blocks have yet reached a consistently high performance level. Continued effort across all pillars is encouraged.',
    //   );
    // }
    if (strongBlocks.length) {
      lines.push(
        `Your performance in ${strongestPillar} serves as a foundational pillar for your organization.`,
      );
      lines.push(
        'These high-scoring areas indicate mature processes that can be leveraged to mentor weaker departments:',
      );
      lines.push('');

      for (const sb of strongBlocks) {
        lines.push(`  ▶ ${sb.block.toUpperCase()}`);
        lines.push(`    Status: ${sb.label} (${sb.avgScale}/4)`);
        // Add interpretive text based on the label
        if (sb.avgScale >= 3.5) {
          lines.push(
            `    Interpretation: This is a "Best Practice" area. Your organization is not just meeting standards but could potentially serve as a case study for other NGOs.`,
          );
        }

        if (sb.strongAnswers.length) {
          lines.push(`    Key Evidence of Success:`);
          for (const sa of sb.strongAnswers) {
            lines.push(`      • Verified: "${sa.evidence}"`);
          }
        }
        lines.push('');
      }
    }
    lines.push('');

    lines.push('AREAS FOR DEVELOPMENT');
    lines.push('─────────────────────');
    lines.push(
      `The following areas in the ${weakestPillar} pillar represent potential bottlenecks to your organizational scaling.`,
    );
    lines.push('');
    // for (const wb of weakestBlocks) {
    //   lines.push(
    //     `  ${wb.block}  [${wb.label} — score ${wb.score.toFixed(1)} / ${wb.maxScore}]`,
    //   );
    //   if (wb.weakAnswers.length) {
    //     lines.push('  Identified gaps:');
    //     for (const wa of wb.weakAnswers) {
    //       lines.push(
    //         `    • ${wa.question}  (rated: ${SCALE_LABELS[wa.scale] ?? `Scale ${wa.scale}`})`,
    //       );
    //       if (wa.evidence)
    //         lines.push(`      Organisation noted: "${wa.evidence}"`);
    //     }
    //   } else {
    //     lines.push(
    //       '  This block scored below average. A review of current practices is recommended.',
    //     );
    //   }
    //   lines.push('');
    // }

    for (const wb of weakestBlocks) {
      const riskLevel = wb.avgScale < 1.5 ? 'CRITICAL' : 'MODERATE';
      lines.push(`  [${riskLevel} RISK] ${wb.block}`);
      lines.push(`  Current Capability: ${wb.label}`);

      // Descriptive Interpretation
      lines.push(`  Analysis:`);
      if (wb.avgScale < 1.5) {
        lines.push(
          `    - Absence of documented policy in this area creates a high dependency on individual knowledge rather than institutional systems.`,
        );
      } else if (wb.avgScale < 2.5) {
        lines.push(
          `    - Systems exist but are inconsistent. This likely leads to "firefighting" and occasional compliance lapses.`,
        );
      }

      if (wb.weakAnswers.length) {
        lines.push('  Specific Gaps to Close:');
        for (const wa of wb.weakAnswers) {
          lines.push(`    • ${wa.question}`);
          lines.push(
            `      Action Required: Move from "${SCALE_LABELS[wa.scale]}" toward a standardized process.`,
          );
        }
      }
      lines.push('');
    }

    if (resourceSuggestions.length) {
      lines.push('RECOMMENDED RESOURCES');
      lines.push('─────────────────────');
      lines.push(
        'We have identified high-impact resources from the PLRCAP library specifically',
      );
      lines.push('aligned with your current development gaps:');
      lines.push('');
      // for (const r of resourceSuggestions)
      //   lines.push(`  • ${r.title}  [${r.type.toLowerCase()}]`);
      // lines.push('');
      for (const r of resourceSuggestions) {
        lines.push(`  ▶ ${r.title.toUpperCase()}`);
        lines.push(`    Type: ${r.type.toLowerCase()}`);
        lines.push(`    Reference ID: ${r.id}`);
        lines.push('');
      }
    }

    if (expertSuggestions.length) {
      lines.push('RECOMMENDED MENTORS & EXPERTS');
      lines.push('─────────────────────────────');
      lines.push(
        'The following PLRCAP-registered experts have experience in the areas where this organisation needs the most support:',
      );
      lines.push('');
      for (const e of expertSuggestions) {
        const role = [e.title, e.employer].filter(Boolean).join(' — ');
        const areas = e.areasOfExpertise.slice(0, 3).join(', ');
        lines.push(`  • ${e.fullName}${role ? `  (${role})` : ''}`);
        if (areas) lines.push(`    Areas: ${areas}`);
        lines.push(`    Expert ID: ${e.id}`);
      }
      lines.push('');
    }

    lines.push('ORGANIZATIONAL MATURITY ROADMAP');
    lines.push('───────────────────────────────');

    let phaseDescription = '';
    let nextStep = '';

    if (overallScore < 25) {
      phaseDescription =
        'EMERGING: Your focus is on establishing basic compliance and core administrative functions.';
      nextStep = 'Priority: Documentation of basic HR and Financial policies.';
    } else if (overallScore < 50) {
      phaseDescription =
        'STABILIZING: You have moved past basics. Now focus on consistency and staff training.';
      nextStep =
        'Priority: Implementing regular internal audits and performance reviews.';
    } else if (overallScore < 75) {
      phaseDescription =
        'SCALING: Your systems are functional. Now you need to automate and optimize for impact.';
      nextStep =
        'Priority: Using data/AI to track program outcomes and external reporting.';
    } else {
      phaseDescription = 'LEADING: You are a high-performing organization.';
      nextStep =
        'Priority: Mentoring other organizations and refining innovation blocks.';
    }

    lines.push(`Current Phase: ${phaseDescription}`);
    lines.push(`Immediate Next Step: ${nextStep}`);
    lines.push('');

    lines.push(`${'─'.repeat(60)}`);
    lines.push(
      `This report was generated from assessment data submitted by ${context}.`,
    );
    if (org.numberOfStaff)
      lines.push(
        `Organisation size: approximately ${org.numberOfStaff} staff members.`,
      );

    return lines.join('\n');
  }

  // ─────────────────────────────────────────────────────────────────────────
  // PER-PILLAR AI SUMMARY
  // Scoped to one pillar's blocks only — triggered when all blocks in a
  // pillar are submitted.
  // ─────────────────────────────────────────────────────────────────────────

  async generatePillarSummary(
    assessmentId: string,
    pillarId: string,
  ): Promise<string> {
    const assessment = await this.prisma.oDAAssessment.findUnique({
      where: { id: assessmentId },
      include: {
        organization: {
          select: { name: true, sectors: true, state: true },
        },
        blockResponses: {
          where: { buildingBlock: { pillarId } },
          include: {
            buildingBlock: {
              include: { pillar: { select: { id: true, name: true } } },
            },
          },
          orderBy: { buildingBlock: { order: 'asc' } },
        },
      },
    });

    if (!assessment || !assessment.blockResponses.length) return '';

    const pillarName =
      assessment.blockResponses[0]?.buildingBlock.pillar.name ?? '';
    const org = assessment.organization;

    const blockSummaries = this.buildBlockSummaries(assessment.blockResponses);

    const weakestBlocks = [...blockSummaries]
      .sort((a, b) => a.avgScale - b.avgScale)
      .slice(0, 2);
    const strongBlocks = blockSummaries.filter((b) => b.avgScale >= 3);

    // Pillar score = weighted average normalised to 100
    const pillarScoreRaw = this.computePillarScore(
      assessment.blockResponses.map((br) => ({
        blockScore: br.blockScore,
        maxScore: br.buildingBlock.maxScore,
      })),
    );

    const pillarBand = this.scoreBand(pillarScoreRaw);
    const resourceSuggestions = await this.findRelevantResources(
      weakestBlocks.map((b) => b.block),
    );

    const lines: string[] = [];

    // lines.push(`Pillar Assessment: ${pillarName} — ${org.name}`);
    // lines.push(`${'─'.repeat(60)}`);
    // lines.push('');
    // lines.push(
    //   `Pillar Score: ${pillarScoreRaw.toFixed(1)}%  |  Level: ${pillarBand}`,
    // );
    // lines.push('');

    // lines.push(`${pillarName.toUpperCase()} — BLOCK SCORES`);
    // lines.push('──────────────────');
    // for (const b of blockSummaries) {
    //   const bar =
    //     '█'.repeat(Math.round(b.avgScale)) +
    //     '░'.repeat(4 - Math.round(b.avgScale));
    //   lines.push(
    //     `  ${b.block.padEnd(38)} ${bar}  ${b.label} (${b.avgScale.toFixed(2)}/4)`,
    //   );
    // }
    // lines.push('');

    // if (strongBlocks.length) {
    //   lines.push('STRENGTHS IN THIS PILLAR');
    //   lines.push('─────────────────────────');
    //   for (const sb of strongBlocks) {
    //     lines.push(`  ${sb.block} (${sb.label})`);
    //     for (const sa of sb.strongAnswers)
    //       lines.push(`    Evidence: "${sa.evidence}"`);
    //   }
    //   lines.push('');
    // }

    // if (weakestBlocks.length) {
    //   lines.push('DEVELOPMENT AREAS IN THIS PILLAR');
    //   lines.push('─────────────────────────────────');
    //   for (const wb of weakestBlocks) {
    //     lines.push(
    //       `  ${wb.block}  [${wb.label} — score ${wb.score.toFixed(1)} / ${wb.maxScore}]`,
    //     );
    //     if (wb.weakAnswers.length) {
    //       lines.push('  Identified gaps:');
    //       for (const wa of wb.weakAnswers) {
    //         lines.push(
    //           `    • ${wa.question}  (rated: ${SCALE_LABELS[wa.scale] ?? `Scale ${wa.scale}`})`,
    //         );
    //         if (wa.evidence)
    //           lines.push(`      Organisation noted: "${wa.evidence}"`);
    //       }
    //     }
    //     lines.push('');
    //   }
    // }

    // if (resourceSuggestions.length) {
    //   lines.push('RECOMMENDED RESOURCES');
    //   lines.push('─────────────────────');
    //   for (const r of resourceSuggestions)
    //     lines.push(`  • ${r.title}  [${r.type.toLowerCase()}]`);
    //   lines.push('');
    // }

    // HEADER SECTION
    lines.push(`PILLAR DIAGNOSTIC: ${pillarName.toUpperCase()}`);
    lines.push(`Organisation: ${org.name}`);
    lines.push(`${'─'.repeat(60)}`);
    lines.push('');
    lines.push(`Pillar Health Score: ${pillarScoreRaw.toFixed(1)}%`);
    lines.push(`Classification: ${pillarBand.toUpperCase()}`);
    lines.push('');

    // QUANTITATIVE BREAKDOWN
    lines.push(`${pillarName.toUpperCase()} — COMPONENT PERFORMANCE`);
    lines.push('────────────────────────────────');
    for (const b of blockSummaries) {
      const bar =
        '█'.repeat(Math.round(b.avgScale)) +
        '░'.repeat(4 - Math.round(b.avgScale));
      lines.push(
        `  ${b.block.padEnd(38)} ${bar}  ${b.label} (${b.avgScale.toFixed(2)}/4)`,
      );
    }
    lines.push('');

    // STRENGTHS (INTERPRETIVE)
    lines.push('CORE COMPETENCIES IN THIS PILLAR');
    lines.push('────────────────────────────────');
    if (strongBlocks.length) {
      lines.push(
        `The following components of ${pillarName} are currently driving institutional stability:`,
      );
      lines.push('');
      for (const sb of strongBlocks) {
        lines.push(`  ▶ ${sb.block.toUpperCase()}`);
        lines.push(`    Status: ${sb.label}`);
        lines.push(
          `    Insight: Your established processes here provide a safety net for ${pillarName} operations.`,
        );
        if (sb.strongAnswers.length) {
          lines.push(`    Verified Evidence:`);
          for (const sa of sb.strongAnswers)
            lines.push(`      • "${sa.evidence}"`);
        }
        lines.push('');
      }
    } else {
      lines.push(
        `No components in ${pillarName} have reached 'Functional' maturity yet. Basic systems need to be established.`,
      );
      lines.push('');
    }

    // AREAS FOR DEVELOPMENT (RISK-BASED)
    lines.push('CRITICAL GAPS & IMPROVEMENT ROADMAP');
    lines.push('────────────────────────────────');
    if (weakestBlocks.length) {
      for (const wb of weakestBlocks) {
        const isCritical = wb.avgScale < 2.0;
        lines.push(
          `  ${isCritical ? '[CRITICAL GAP]' : '[ADVISORY]'} ${wb.block.toUpperCase()}`,
        );
        lines.push(`  Maturity: ${wb.label} (${wb.avgScale.toFixed(2)}/4)`);

        // Descriptive Analysis
        if (isCritical) {
          lines.push(
            `  Analysis: Significant operational risk. Lack of formalisation in this area likely causes recurring inefficiencies.`,
          );
        } else {
          lines.push(
            `  Analysis: Systems are emerging but lack the consistency required for full institutional autonomy.`,
          );
        }

        if (wb.weakAnswers.length) {
          lines.push('  Immediate Actions Needed:');
          for (const wa of wb.weakAnswers) {
            lines.push(`    • Address: ${wa.question}`);
            if (wa.evidence)
              lines.push(`      Organisation Context: "${wa.evidence}"`);
          }
        }
        lines.push('');
      }
    }

    // ACTIONABLE RESOURCES (FRONTEND-READY)
    if (resourceSuggestions.length) {
      lines.push('RECOMMENDED INTERVENTIONS');
      lines.push('────────────────────────────────');
      lines.push(
        `To improve your ${pillarName} score, we recommend the following curated resources:`,
      );
      lines.push('');
      for (const r of resourceSuggestions) {
        lines.push(`  ▶ ${r.title}`);
        lines.push(`    Format: ${r.type.toUpperCase()}`);
        lines.push(`    Resource ID: ${r.id}`); // Crucial for frontend navigation
        lines.push(
          `    Goal: Use this to transition ${pillarName} from ${pillarBand} to a higher capacity level.`,
        );
        lines.push('');
      }
    }

    lines.push(`${'─'.repeat(60)}`);
    lines.push(
      `Pillar assessment report generated for ${org.name}. Confidential. @ PLRCAP NGO Support Hub`,
    );

    return lines.join('\n');
  }

  // ─────────────────────────────────────────────────────────────────────────
  // SHARED BLOCK SUMMARY BUILDER
  // ─────────────────────────────────────────────────────────────────────────

  private buildBlockSummaries(blockResponses: any[]) {
    return blockResponses.map((br) => {
      const answers = (br.answers as unknown as AnswerItem[]) ?? [];
      const scored = answers.filter((a) => a.selectedScale);
      const avgScale = scored.length
        ? scored.reduce((s, a) => s + a.selectedScale, 0) / scored.length
        : 0;

      const weakAnswers = scored
        .filter((a) => a.selectedScale <= 2)
        .slice(0, 3)
        .map((a) => ({
          question: a.questionText ?? a.questionId,
          evidence: (a.evidence ?? '').trim(),
          scale: a.selectedScale,
        }));

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
  }

  // ─────────────────────────────────────────────────────────────────────────
  // HELPERS
  // ─────────────────────────────────────────────────────────────────────────

  scaleBand(avg: number): string {
    if (avg >= 3.5) return 'Best Practice';
    if (avg >= 2.5) return 'Functional';
    if (avg >= 1.5) return 'Basic/Incomplete';
    return 'Not in Place';
  }

  scoreBand(score: number): string {
    if (score >= 75) return 'High Capacity';
    if (score >= 50) return 'Moderate Capacity';
    if (score >= 25) return 'Developing Capacity';
    return 'Low Capacity';
  }

  private async findRelevantResources(blockNames: string[]) {
    if (!blockNames.length) return [];
    const keywords = blockNames.flatMap((n) =>
      n
        .toLowerCase()
        .split(/[\s&,/]+/)
        .filter((w) => w.length > 3),
    );
    return this.prisma.resource.findMany({
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
  }

  private async findRelevantExperts(blockNames: string[]) {
    if (!blockNames.length) return [];
    const keywords = blockNames.flatMap((n) =>
      n
        .toLowerCase()
        .split(/[\s&,/]+/)
        .filter((w) => w.length > 3),
    );

    let profiles = await this.prisma.expertProfile.findMany({
      where: {
        user: { role: 'EXPERT', status: 'APPROVED' },
        OR: keywords
          .slice(0, 5)
          .map((kw) => ({ areasOfExpertise: { hasSome: [kw] } })),
      },
      select: {
        id: true,
        title: true,
        employer: true,
        areasOfExpertise: true,
        user: { select: { id: true, fullName: true, avatarUrl: true } },
      },
      take: 3,
    });

    if (!profiles.length) {
      const fallback = await this.prisma.expertProfile.findMany({
        where: {
          user: { role: 'EXPERT', status: 'APPROVED' },
          OR: keywords.slice(0, 5).flatMap((kw) => [
            { about: { contains: kw, mode: 'insensitive' as any } },
            {
              otherAreasOfTopics: {
                contains: kw,
                mode: 'insensitive' as any,
              },
            },
          ]),
        },
        select: {
          id: true,
          title: true,
          employer: true,
          areasOfExpertise: true,
          user: { select: { id: true, fullName: true, avatarUrl: true } },
        },
        take: 3,
      });
      profiles = [...profiles, ...fallback];
    }

    return profiles.slice(0, 3).map((p) => ({
      id: p.user.id,
      fullName: p.user.fullName,
      avatarUrl: p.user.avatarUrl,
      title: p.title,
      employer: p.employer,
      areasOfExpertise: p.areasOfExpertise,
    }));
  }
}
