import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from 'src/prisma.service';

// Badge thresholds: { badgeName -> minimum download count required }
const DOWNLOAD_BADGES: { name: string; threshold: number; imageUrl: string }[] =
  [
    {
      name: 'Knowledge Seeker',
      threshold: 5,
      imageUrl: '/badges/knowledge-seeker.png',
    },
    {
      name: 'Avid Learner',
      threshold: 15,
      imageUrl: '/badges/avid-learner.png',
    },
    {
      name: 'Resource Champion',
      threshold: 30,
      imageUrl: '/badges/resource-champion.png',
    },
    {
      name: 'Library Master',
      threshold: 50,
      imageUrl: '/badges/library-master.png',
    },
  ];

@Injectable()
export class BadgeService {
  private readonly logger = new Logger(BadgeService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Called after every successful download by a signed-in user.
   * Checks total download count and awards any newly unlocked badges.
   * Returns the list of newly awarded badge names (empty array if none).
   */
  async evaluateDownloadBadges(userId: string): Promise<string[]> {
    try {
      const [downloadCount, user] = await Promise.all([
        this.prisma.downloadLog.count({ where: { userId } }),
        this.prisma.user.findUnique({
          where: { id: userId },
          include: { badges: { select: { name: true } } },
        }),
      ]);

      if (!user) return [];

      const existingBadgeNames = new Set(user.badges.map((b) => b.name));
      const newlyAwarded: string[] = [];

      for (const tier of DOWNLOAD_BADGES) {
        if (
          downloadCount >= tier.threshold &&
          !existingBadgeNames.has(tier.name)
        ) {
          // Find or create the badge record
          const badge = await this.prisma.badge.upsert({
            where: { name: tier.name },
            create: {
              name: tier.name,
              imageUrl: tier.imageUrl,
              externalSource: false,
            },
            update: {},
          });

          // Connect it to the user
          await this.prisma.user.update({
            where: { id: userId },
            data: { badges: { connect: { id: badge.id } } },
          });

          newlyAwarded.push(tier.name);
          this.logger.log(`Badge awarded: "${tier.name}" → user ${userId}`);
        }
      }

      return newlyAwarded;
    } catch (error) {
      // Non-fatal: badge failure must never block the download response
      this.logger.error('Badge evaluation failed', error);
      return [];
    }
  }
}
