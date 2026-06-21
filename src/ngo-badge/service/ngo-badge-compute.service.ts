import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { FormStatus, OrgBadgeLevel } from '@prisma/client';
import { PrismaService } from 'src/prisma-module/prisma.service';
import { calcOrgCompletion } from 'src/organizations/utils/org-completion.util';
import { BADGE_CRITERIA } from './ngo-badge-eligibility.service';

// ─────────────────────────────────────────────────────────────────────────────
// NGO BADGE — NIGHTLY RECOMPUTE
//
// Computes Organization.suggestedLevel for ALL orgs off the request path, using
// a few grouped aggregates instead of per-org queries. Dismissals are baked in
// (a dismissed target → suggestedLevel = null), so the read endpoint is a plain
// indexed `WHERE suggestedLevel IS NOT NULL` + pagination.
//
// Criteria are owner-based (Organization.userId), per product decision.
// ─────────────────────────────────────────────────────────────────────────────

const LEVEL_RANK: Record<OrgBadgeLevel, number> = {
  LEVEL_1: 1,
  LEVEL_2: 2,
  LEVEL_3: 3,
};
const CHUNK = 1000;

// export const TEST_FORCE_LEVEL_1_ORG_IDS: string[] = [
//   'dc9b08bd-17bd-4e78-9b17-2c4e98af9c40',
// ];

@Injectable()
export class NgoBadgeRecomputeService {
  private readonly logger = new Logger(NgoBadgeRecomputeService.name);

  constructor(private readonly prisma: PrismaService) {}

  @Cron(CronExpression.EVERY_DAY_AT_3AM)
  async handleCron() {
    await this.recomputeAll();
  }

  async recomputeAll(): Promise<void> {
    const start = Date.now();

    const [
      resByUser,
      likesGivenByUser,
      repliesMadeByUser,
      eventsByUser,
      odaByOrg,
      topicLikesByAuthor,
      commentLikesByAuthor,
    ] = await Promise.all([
      this.prisma.resourceCompletion.groupBy({
        by: ['userId'],
        _count: { _all: true },
      }),
      this.prisma.communityLike.groupBy({
        by: ['userId'],
        _count: { _all: true },
      }),
      this.prisma.communityComment.groupBy({
        by: ['authorId'],
        _count: { _all: true },
      }),
      this.prisma.eventRegistration.groupBy({
        by: ['userId'],
        where: { userId: { not: null } },
        _count: { _all: true },
      }),
      this.prisma.oDAAssessment.groupBy({
        by: ['orgId'],
        where: { status: FormStatus.COMPLETED },
        _count: { _all: true },
      }),
      // likes RECEIVED via denormalized likeCount sums (no relation traversal)
      this.prisma.communityTopic.groupBy({
        by: ['authorId'],
        _sum: { likeCount: true },
      }),
      this.prisma.communityComment.groupBy({
        by: ['authorId'],
        _sum: { likeCount: true },
      }),
    ]);

    // replies RECEIVED — needs author traversal, so one raw GROUP BY.
    // NOTE: a reply that is BOTH on the owner's topic AND to the owner's comment
    // is counted twice here; acceptable for a suggestion heuristic. Use a
    // DISTINCT subquery if you need it exact.
    const repliesReceivedRows = await this.prisma.$queryRaw<
      { userId: string; count: number }[]
    >`
      SELECT a."userId" AS "userId", COUNT(*)::int AS count
      FROM (
        SELECT t."authorId" AS "userId"
        FROM "CommunityComment" c
        JOIN "CommunityTopic" t ON c."topicId" = t.id
        WHERE c."authorId" <> t."authorId"
        UNION ALL
        SELECT p."authorId" AS "userId"
        FROM "CommunityComment" c
        JOIN "CommunityComment" p ON c."parentId" = p.id
        WHERE c."authorId" <> p."authorId"
      ) a
      GROUP BY a."userId"`;

    const resMap = this.toCountMap(resByUser, 'userId');
    const likesGivenMap = this.toCountMap(likesGivenByUser, 'userId');
    const repliesMadeMap = this.toCountMap(repliesMadeByUser, 'authorId');
    const eventsMap = this.toCountMap(eventsByUser, 'userId');
    const odaMap = this.toCountMap(odaByOrg, 'orgId');
    const topicLikesMap = this.toSumMap(topicLikesByAuthor);
    const commentLikesMap = this.toSumMap(commentLikesByAuthor);
    const repliesRecvMap = new Map<string, number>(
      repliesReceivedRows.map((r) => [r.userId, Number(r.count)]),
    );

    // Walk orgs in batches, classify, batch-update
    const toLevel1: string[] = [];
    const toLevel2: string[] = [];
    const toNull: string[] = [];

    let cursor: string | undefined;
    for (;;) {
      const batch = await this.prisma.organization.findMany({
        take: CHUNK,
        ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
        orderBy: { id: 'asc' },
        // selects all scalar fields → enough for calcOrgCompletion + flags
      });
      if (batch.length === 0) break;
      cursor = batch[batch.length - 1].id;

      for (const org of batch) {
        const target = this.classify(org, {
          resMap,
          likesGivenMap,
          topicLikesMap,
          commentLikesMap,
          repliesMadeMap,
          repliesRecvMap,
          eventsMap,
          odaMap,
        });

        if (target === OrgBadgeLevel.LEVEL_1) toLevel1.push(org.id);
        else if (target === OrgBadgeLevel.LEVEL_2) toLevel2.push(org.id);
        else if (org.suggestedLevel !== null) toNull.push(org.id); // clear stale

        if (batch.length < CHUNK) break;
      }
      if (batch.length < CHUNK) break;
    }

    await this.applyUpdates(OrgBadgeLevel.LEVEL_1, toLevel1);
    await this.applyUpdates(OrgBadgeLevel.LEVEL_2, toLevel2);
    await this.applyUpdates(null, toNull);

    // if (TEST_FORCE_LEVEL_1_ORG_IDS.length > 0) {
    //   const forced = await this.prisma.organization.updateMany({
    //     where: { id: { in: TEST_FORCE_LEVEL_1_ORG_IDS }, badgeLevel: null },
    //     data: { suggestedLevel: OrgBadgeLevel.LEVEL_1 },
    //   });
    //   this.logger.warn(
    //     `[TEST] Forced Level-1 suggestion on ${forced.count} org(s): ${TEST_FORCE_LEVEL_1_ORG_IDS.join(', ')}`,
    //   );
    // }
    // ===== END TEST ONLY =====

    this.logger.log(
      `Recompute done in ${Date.now() - start}ms — L1:${toLevel1.length} L2:${toLevel2.length} cleared:${toNull.length}`,
    );
  }

  // classify a single org from the prebuilt maps (no queries)
  private classify(
    org: any,
    m: Record<string, Map<string, number>>,
  ): OrgBadgeLevel | null {
    const owner = org.userId;
    const get = (map: Map<string, number>, k: string) => map.get(k) ?? 0;

    const totalLikes =
      get(m.likesGivenMap, owner) +
      get(m.topicLikesMap, owner) +
      get(m.commentLikesMap, owner);
    const totalReplies =
      get(m.repliesMadeMap, owner) + get(m.repliesRecvMap, owner);

    const meetsL1 =
      get(m.resMap, owner) >= BADGE_CRITERIA.LEVEL_1.resourcesCompleted &&
      totalLikes >= BADGE_CRITERIA.LEVEL_1.communityInteractions &&
      totalReplies >= BADGE_CRITERIA.LEVEL_1.communityReplies &&
      get(m.eventsMap, owner) >= BADGE_CRITERIA.LEVEL_1.eventsRegistered;

    const meetsL2 =
      meetsL1 &&
      get(m.odaMap, org.id) >= BADGE_CRITERIA.LEVEL_2.odaCompleted &&
      calcOrgCompletion(org) >= BADGE_CRITERIA.LEVEL_2.profileCompletion;

    // one step above current level
    const currentRank = org.badgeLevel ? LEVEL_RANK[org.badgeLevel] : 0;
    let candidate: OrgBadgeLevel | null = null;
    if (currentRank === 0 && meetsL1) candidate = OrgBadgeLevel.LEVEL_1;
    else if (currentRank === 1 && meetsL2) candidate = OrgBadgeLevel.LEVEL_2;

    // bake in dismissal
    if (candidate && org.dismissedSuggestionLevel === LEVEL_RANK[candidate]) {
      return null;
    }
    return candidate;
  }

  private async applyUpdates(level: OrgBadgeLevel | null, ids: string[]) {
    for (let i = 0; i < ids.length; i += CHUNK) {
      const slice = ids.slice(i, i + CHUNK);
      await this.prisma.organization.updateMany({
        where: { id: { in: slice } },
        data: { suggestedLevel: level },
      });
    }
  }

  private toCountMap(rows: any[], key: string): Map<string, number> {
    return new Map(rows.map((r) => [r[key], r._count._all]));
  }
  private toSumMap(rows: any[]): Map<string, number> {
    return new Map(rows.map((r) => [r.authorId, r._sum.likeCount ?? 0]));
  }
}
