import { HttpStatus, Injectable, Logger } from '@nestjs/common';
import { OrgBadgeLevel } from '@prisma/client';
import { PrismaService } from 'src/prisma-module/prisma.service';
import {
  CriterionResult,
  NgoBadgeEligibilityService,
} from './ngo-badge-eligibility.service';
import { listBadgeLevelMetadata } from '../utils/org-badge-level.meta';

// ─────────────────────────────────────────────────────────────────────────────
// NGO BADGE SERVICE — admin actions
//
//   • getRecommendations()    → NGOs the system suggests for an upgrade, plus
//                               the Level-2 orgs listed for manual L3 verification.
//   • assignLevel()           → award/override ANY level on an org (the doc's
//                               "admin can upgrade any NGO anytime to any level").
//   • acceptRecommendation()  → shortcut that awards the suggested next level.
//   • dismissRecommendation() → hide a suggestion ("cancel" in the UI).
//
// Every assignment writes an OrganizationBadgeHistory row and resets any stale
// dismissal flag. This service never auto-awards — assignment is always an
// explicit admin call.
// ─────────────────────────────────────────────────────────────────────────────

const LEVEL_RANK: Record<OrgBadgeLevel, number> = {
  LEVEL_1: 1,
  LEVEL_2: 2,
  LEVEL_3: 3,
};

const ORG_SUMMARY_SELECT = {
  id: true,
  name: true,
  acronym: true,
  logoUrl: true,
  state: true,
  badgeLevel: true,
  dismissedSuggestionLevel: true,
} as const;

export interface RecommendationItem {
  orgId: string;
  name: string;
  acronym: string | null;
  logoUrl: string | null;
  state: string;
  currentLevel: OrgBadgeLevel | null;
  suggestedLevel: OrgBadgeLevel;
  level1Criteria: CriterionResult[];
  level2Criteria: CriterionResult[];
}

export interface VerificationCandidate {
  orgId: string;
  name: string;
  acronym: string | null;
  logoUrl: string | null;
  state: string;
  currentLevel: OrgBadgeLevel;
}

@Injectable()
export class NgoBadgeService {
  private readonly logger = new Logger(NgoBadgeService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly eligibility: NgoBadgeEligibilityService,
  ) {}

  private rankOf(level: OrgBadgeLevel | null): number {
    return level ? LEVEL_RANK[level] : 0;
  }

  listLevels() {
    return {
      status: true,
      statusCode: HttpStatus.OK,
      message: 'Badge levels retrieved.',
      data: listBadgeLevelMetadata().levels, // [{ level, title, description, imageUrl }]
    };
  }

  // ───────────────────────────────────────────────────────────────────────────
  // FETCH RECOMMENDED NGOs
  //
  // Suggestions (auto): orgs at no-level or Level 1 that meet the criteria for
  //   the next step, minus any the admin has dismissed.
  // Verification candidates (manual): every Level-2 org, listed for on-site L3
  //   verification — these are listed, never auto-suggested.
  //
  // NOTE: eligibility is computed live per org. With the current org count this
  // is fine for an admin-only screen. If it grows, precompute a `suggestedLevel`
  // column on a daily @Cron (same pattern as SpotlightScheduler) and read that.
  // ───────────────────────────────────────────────────────────────────────────

  async getRecommendations(query: { page?: number; limit?: number }) {
    const page = Math.max(1, parseInt(String(query.page ?? '1'), 10) || 1);
    const limit = Math.min(
      100,
      Math.max(1, parseInt(String(query.limit ?? '20'), 10) || 20),
    );
    const skip = (page - 1) * limit;

    const where = { suggestedLevel: { not: null } };

    const [orgs, total] = await this.prisma.$transaction([
      this.prisma.organization.findMany({
        where,
        skip,
        take: limit,
        orderBy: { name: 'asc' },
        select: {
          id: true,
          name: true,
          acronym: true,
          logoUrl: true,
          state: true,
          badgeLevel: true,
          suggestedLevel: true,
        },
      }),
      this.prisma.organization.count({ where }),
    ]);

    // Detailed per-criterion breakdown only for THIS page (~20 orgs).
    const suggestions = await Promise.all(
      orgs.map(async (o) => {
        const elig = await this.eligibility.computeEligibility(o.id);
        return {
          orgId: o.id,
          name: o.name,
          acronym: o.acronym,
          logoUrl: o.logoUrl,
          state: o.state,
          currentLevel: o.badgeLevel,
          suggestedLevel: o.suggestedLevel,
          level1Criteria: elig.level1Criteria,
          level2Criteria: elig.level2Criteria,
        };
      }),
    );

    return {
      status: true,
      statusCode: HttpStatus.OK,
      message: 'Recommendations fetched.',
      data: {
        suggestions,
        total,
        page,
        limit,
        pages: Math.ceil(total / limit),
      },
    };
  }

  // ───────────────────────────────────────────────────────────────────────────
  // AWARD / OVERRIDE A LEVEL  (admin can set ANY level on ANY org, anytime)
  // ───────────────────────────────────────────────────────────────────────────

  async assignLevel(
    adminId: string,
    orgId: string,
    level: OrgBadgeLevel,
    note?: string,
  ) {
    const org = await this.prisma.organization.findUnique({
      where: { id: orgId },
      select: { id: true, name: true, badgeLevel: true },
    });

    if (!org) {
      return {
        status: false,
        statusCode: HttpStatus.NOT_FOUND,
        message: 'Organization not found.',
      };
    }

    if (org.badgeLevel === level) {
      return {
        status: false,
        statusCode: HttpStatus.CONFLICT,
        message: `Organization is already at ${level}.`,
      };
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      const o = await tx.organization.update({
        where: { id: orgId },
        data: {
          badgeLevel: level,
          badgeLevelAssignedAt: new Date(),
          badgeLevelAssignedById: adminId,
          // Level changed → any earlier dismissal is stale; let future suggestions surface.
          dismissedSuggestionLevel: null,
          suggestedLevel: null,
        },
        select: {
          id: true,
          name: true,
          badgeLevel: true,
          badgeLevelAssignedAt: true,
        },
      });

      await tx.organizationBadgeHistory.create({
        data: {
          orgId,
          level,
          assignedById: adminId,
          note: note ?? null,
        },
      });

      return o;
    });

    this.logger.log(`Org ${orgId} badge level set to ${level} by ${adminId}`);

    return {
      status: true,
      statusCode: HttpStatus.OK,
      message: `Badge level set to ${level}.`,
      data: updated,
    };
  }

  // ───────────────────────────────────────────────────────────────────────────
  // ACCEPT A RECOMMENDATION  (award the suggested next level)
  // ───────────────────────────────────────────────────────────────────────────

  async acceptRecommendation(adminId: string, orgId: string, note?: string) {
    const elig = await this.eligibility.computeEligibility(orgId);

    if (!elig.suggestedLevel) {
      return {
        status: false,
        statusCode: HttpStatus.CONFLICT,
        message:
          'This organization no longer has a pending recommendation. Use manual assignment to override.',
      };
    }

    return this.assignLevel(adminId, orgId, elig.suggestedLevel, note);
  }

  // ───────────────────────────────────────────────────────────────────────────
  // DISMISS A RECOMMENDATION  ("cancel" — hides this suggestion)
  // ───────────────────────────────────────────────────────────────────────────

  async dismissRecommendation(orgId: string) {
    const elig = await this.eligibility.computeEligibility(orgId);
    console.log(elig);

    if (!elig.suggestedLevel) {
      return {
        status: false,
        statusCode: HttpStatus.CONFLICT,
        message: 'No pending recommendation to dismiss.',
      };
    }

    await this.prisma.organization.update({
      where: { id: orgId },
      data: { dismissedSuggestionLevel: this.rankOf(elig.suggestedLevel) },
    });

    return {
      status: true,
      statusCode: HttpStatus.OK,
      message: 'Recommendation dismissed.',
    };
  }
}
