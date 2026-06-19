import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { FormStatus, OrgBadgeLevel } from '@prisma/client';
import { PrismaService } from 'src/prisma-module/prisma.service';
import { calcOrgCompletion } from 'src/organizations/utils/org-completion.util';
import { TEST_FORCE_LEVEL_1_ORG_IDS } from './ngo-badge-compute.service';

// ─────────────────────────────────────────────────────────────────────────────
// NGO BADGE — ELIGIBILITY (automated tracking)
//
// Pure computation: given an organization, work out which tier it currently
// qualifies for. It NEVER mutates the badge level — assigning is always an
// explicit admin action (see NgoBadgeService). This only powers the
// "suggestions" the admin sees.
//
// Decisions locked with product:
//   1. Activity is measured for the ORG OWNER only (Organization.userId).
//   2. Likes / replies count GIVEN + RECEIVED (combined), received excludes
//      the owner's own actions so nothing is double-counted.
//   3. Profile completion reuses calcOrgCompletion() (Level 2 needs 100%).
//
// Tiers:
//   Level 1: 25 resources completed + 10 likes + 10 replies + 15 event regs.
//   Level 2: everything for Level 1 + 1 completed ODA + 100% profile.
//   Level 3: NOT auto-suggested — any Level 2 org is a manual on-site
//            verification candidate (surfaced via isLevel3Candidate).
// ─────────────────────────────────────────────────────────────────────────────

export const BADGE_CRITERIA = {
  LEVEL_1: {
    resourcesCompleted: 25,
    communityInteractions: 10, // likes (given + received)
    communityReplies: 10, // replies (made + received)
    eventsRegistered: 15,
  },
  LEVEL_2: {
    odaCompleted: 1,
    profileCompletion: 100,
  },
} as const;

export interface CriterionResult {
  key: string;
  label: string;
  current: number;
  required: number;
  met: boolean;
}

export interface EligibilityResult {
  orgId: string;
  currentLevel: OrgBadgeLevel | null;
  level1Criteria: CriterionResult[];
  level2Criteria: CriterionResult[];
  qualifiesForLevel1: boolean;
  qualifiesForLevel2: boolean;
  /** The single next level the org qualifies for above its current level (L1 or L2). Null if none / next step is L3. */
  suggestedLevel: OrgBadgeLevel | null;
  /** True when currentLevel === LEVEL_2 — listed for manual on-site L3 verification, never auto-suggested. */
  isLevel3Candidate: boolean;
}

const LEVEL_RANK: Record<OrgBadgeLevel, number> = {
  LEVEL_1: 1,
  LEVEL_2: 2,
  LEVEL_3: 3,
};

@Injectable()
export class NgoBadgeEligibilityService {
  private readonly logger = new Logger(NgoBadgeEligibilityService.name);

  constructor(private readonly prisma: PrismaService) {}

  private rankOf(level: OrgBadgeLevel | null): number {
    return level ? LEVEL_RANK[level] : 0;
  }

  private criterion(
    key: string,
    label: string,
    current: number,
    required: number,
  ): CriterionResult {
    return { key, label, current, required, met: current >= required };
  }

  // ───────────────────────────────────────────────────────────────────────────
  // SINGLE ORG
  // ───────────────────────────────────────────────────────────────────────────

  async computeEligibility(orgId: string): Promise<EligibilityResult> {
    const org = await this.prisma.organization.findUnique({
      where: { id: orgId },
    });
    if (!org) throw new NotFoundException('Organization not found.');

    const ownerId = org.userId;

    const [
      resourcesCompleted,
      likesGiven,
      likesReceived,
      repliesMade,
      repliesReceived,
      eventsRegistered,
      odaCompleted,
    ] = await Promise.all([
      // Resources completed (unique [userId, resourceId] → row count = distinct)
      this.prisma.resourceCompletion.count({ where: { userId: ownerId } }),

      // Likes GIVEN by the owner
      this.prisma.communityLike.count({ where: { userId: ownerId } }),

      // Likes RECEIVED on the owner's topics/comments (exclude owner's own likes)
      this.prisma.communityLike.count({
        where: {
          userId: { not: ownerId },
          OR: [
            { topic: { authorId: ownerId } },
            { comment: { authorId: ownerId } },
          ],
        },
      }),

      // Replies MADE by the owner
      this.prisma.communityComment.count({ where: { authorId: ownerId } }),

      // Replies RECEIVED on the owner's topics, or as replies to the owner's comments
      this.prisma.communityComment.count({
        where: {
          authorId: { not: ownerId },
          OR: [
            { topic: { authorId: ownerId } },
            { parent: { authorId: ownerId } },
          ],
        },
      }),

      // Event registrations by the owner
      this.prisma.eventRegistration.count({ where: { userId: ownerId } }),

      // Completed ODA assessments for this org
      this.prisma.oDAAssessment.count({
        where: { orgId, status: FormStatus.COMPLETED },
      }),
    ]);

    const totalLikes = likesGiven + likesReceived;
    const totalReplies = repliesMade + repliesReceived;
    const profileCompletion = calcOrgCompletion(org);

    // ── Level 1 criteria ──────────────────────────────────────────────────────
    const level1Criteria: CriterionResult[] = [
      this.criterion(
        'resourcesCompleted',
        'Resources completed',
        resourcesCompleted,
        BADGE_CRITERIA.LEVEL_1.resourcesCompleted,
      ),
      this.criterion(
        'communityInteractions',
        'Community likes (given + received)',
        totalLikes,
        BADGE_CRITERIA.LEVEL_1.communityInteractions,
      ),
      this.criterion(
        'communityReplies',
        'Community replies (made + received)',
        totalReplies,
        BADGE_CRITERIA.LEVEL_1.communityReplies,
      ),
      this.criterion(
        'eventsRegistered',
        'Events registered',
        eventsRegistered,
        BADGE_CRITERIA.LEVEL_1.eventsRegistered,
      ),
    ];

    // ── Level 2 criteria (in ADDITION to Level 1) ─────────────────────────────
    const level2Criteria: CriterionResult[] = [
      this.criterion(
        'odaCompleted',
        'Completed ODA assessments',
        odaCompleted,
        BADGE_CRITERIA.LEVEL_2.odaCompleted,
      ),
      this.criterion(
        'profileCompletion',
        'Profile completion (%)',
        profileCompletion,
        BADGE_CRITERIA.LEVEL_2.profileCompletion,
      ),
    ];

    const qualifiesForLevel1 = level1Criteria.every((c) => c.met);
    const qualifiesForLevel2 =
      qualifiesForLevel1 && level2Criteria.every((c) => c.met);

    // ── Suggestion = ONE step above current level ─────────────────────────────
    const currentLevel = org.badgeLevel ?? null;
    const currentRank = this.rankOf(currentLevel);

    let suggestedLevel: OrgBadgeLevel | null = null;
    if (currentRank === 0 && qualifiesForLevel1) {
      suggestedLevel = OrgBadgeLevel.LEVEL_1;
    } else if (currentRank === 1 && qualifiesForLevel2) {
      suggestedLevel = OrgBadgeLevel.LEVEL_2;
    }
    // currentRank === 2 → next is L3, which is manual verification, not a suggestion.

    // ===== TEST ONLY — REMOVE BEFORE PRODUCTION =====
    if (TEST_FORCE_LEVEL_1_ORG_IDS.includes(orgId) && currentLevel === null) {
      suggestedLevel = OrgBadgeLevel.LEVEL_1;
    }
    // ===== END TEST ONLY =====

    return {
      orgId,
      currentLevel,
      level1Criteria,
      level2Criteria,
      qualifiesForLevel1,
      qualifiesForLevel2,
      suggestedLevel,
      isLevel3Candidate: currentLevel === OrgBadgeLevel.LEVEL_2,
    };
  }
}
