import { Injectable, HttpStatus, Logger } from '@nestjs/common';
import { PrismaService } from 'src/prisma.service';

@Injectable()
export class AchievementsService {
  private readonly logger = new Logger(AchievementsService.name);

  constructor(private readonly prisma: PrismaService) {}

  async getMyAchievements(
    userId: string,
    query: { page?: number; limit?: number },
  ) {
    try {
      const page = Math.max(1, parseInt(String(query.page ?? '1'), 10) || 1);
      const limit = Math.min(
        100,
        Math.max(1, parseInt(String(query.limit ?? '20'), 10) || 20),
      );
      const skip = (page - 1) * limit;

      const [achievements, total] = await this.prisma.$transaction([
        this.prisma.achievement.findMany({
          where: { userId },
          skip,
          take: limit,
          orderBy: { earnedAt: 'desc' },
          include: {
            badge: {
              select: { id: true, name: true, imageUrl: true },
            },
          },
        }),
        this.prisma.achievement.count({ where: { userId } }),
      ]);

      return {
        status: true,
        statusCode: HttpStatus.OK,
        message: 'Achievements retrieved.',
        data: {
          achievements: achievements.map((a) => ({
            id: a.id,
            title: a.title,
            description: a.description,
            points: a.points,
            earnedAt: a.earnedAt,
            badge: a.badge ?? null,
          })),
          total,
          page,
          limit,
          pages: Math.ceil(total / limit),
        },
      };
    } catch (error) {
      this.logger.error('getMyAchievements error', error);
      return {
        status: false,
        statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
        message: 'Server error.',
      };
    }
  }
}
