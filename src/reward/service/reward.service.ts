import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from 'src/prisma-module/prisma.service';

export interface AwardRewardInput {
  userId: string;
  points: number;
  title: string;
  description: string;
  /** If provided, this specific badge is awarded (resource flow) */
  badgeId?: string;
  /** If true, pick the first badge from the catalogue (profile completion flow) */
  useFirstBadge?: boolean;
}

export interface AwardRewardResult {
  pointsEarned: number;
  totalPoints: number;
  badgeAwarded: string | null;
  achievementId: string;
}

@Injectable()
export class RewardsService {
  private readonly logger = new Logger(RewardsService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Award points + optionally a badge + create an Achievement record.
   * All writes run in a single $transaction.
   *
   * Badge resolution order:
   *  1. If `badgeId` is supplied → use that badge (resource flow)
   *  2. If `useFirstBadge` is true → query the first badge alphabetically
   *  3. Otherwise → no badge awarded
   *
   * Badge deduplication: the badge is only connected if the user doesn't
   * already have it.
   */
  async award(input: AwardRewardInput): Promise<AwardRewardResult | null> {
    try {
      const user = await this.prisma.user.findUnique({
        where: { id: input.userId },
        include: { badges: { select: { id: true } } },
      });
      if (!user) return null;

      // ── Resolve which badge to award ─────────────────────────────────────
      let resolvedBadgeId: string | null = null;

      if (input.badgeId) {
        resolvedBadgeId = input.badgeId;
      } else if (input.useFirstBadge) {
        const firstBadge = await this.prisma.badge.findFirst({
          orderBy: { name: 'asc' },
          select: { id: true },
        });
        resolvedBadgeId = firstBadge?.id ?? null;
      }

      const alreadyHasBadge =
        resolvedBadgeId !== null &&
        user.badges.some((b) => b.id === resolvedBadgeId);

      const badgeToConnect =
        resolvedBadgeId && !alreadyHasBadge ? resolvedBadgeId : null;

      // ── Build user update payload ─────────────────────────────────────────
      const userUpdateData: any =
        input.points > 0 ? { pointsCount: { increment: input.points } } : {};

      if (badgeToConnect) {
        userUpdateData.badges = { connect: { id: badgeToConnect } };
      }

      // ── Transact: update user + create achievement ────────────────────────
      const [updatedUser, achievement] = await this.prisma.$transaction([
        this.prisma.user.update({
          where: { id: input.userId },
          data: Object.keys(userUpdateData).length > 0 ? userUpdateData : {},
          select: { pointsCount: true },
        }),
        this.prisma.achievement.create({
          data: {
            userId: input.userId,
            title: input.title,
            description: input.description,
            points: input.points,
            badgeId: badgeToConnect ?? null,
          },
        }),
      ]);

      return {
        pointsEarned: input.points,
        totalPoints: updatedUser.pointsCount,
        badgeAwarded: badgeToConnect,
        achievementId: achievement.id,
      };
    } catch (error) {
      this.logger.error('RewardsService.award error', error);
      return null;
    }
  }

  /**
   * Check whether a user already has an achievement with the given title.
   * Used to prevent double-awarding profile-completion rewards.
   */
  async hasAchievement(userId: string, title: string): Promise<boolean> {
    const existing = await this.prisma.achievement.findFirst({
      where: { userId, title },
      select: { id: true },
    });
    return !!existing;
  }
}
