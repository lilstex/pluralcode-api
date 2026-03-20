/* eslint-disable @typescript-eslint/no-unused-vars */
import { Injectable, HttpStatus, Logger } from '@nestjs/common';
import { PrismaService } from 'src/prisma.service';
import { RewardsService } from 'src/reward/service/reward.service';
import { UpsertExpertProfileDto } from 'src/users/dto/users.dto';

// ─────────────────────────────────────────────────────────────────────────────
// PROFILE COMPLETION HELPER
// ─────────────────────────────────────────────────────────────────────────────

/** Fields that count toward expert profile completion (scalar + array). */
const EXPERT_SCALAR_FIELDS = [
  'title',
  'yearsOfExperience',
  'about',
  'employer',
  'mentoringPhilosophy',
  'capacityOfMentees',
] as const;

const EXPERT_ARRAY_FIELDS = [
  'areasOfExpertise',
  'servicesOffered',
  'preferredContactMethods',
] as const;

/** Returns a 0–100 completion percentage for an ExpertProfile row. */
function calcExpertCompletion(profile: any): number {
  const total = EXPERT_SCALAR_FIELDS.length + EXPERT_ARRAY_FIELDS.length;
  const filled =
    EXPERT_SCALAR_FIELDS.filter((k) => {
      const v = profile[k];
      return v !== null && v !== undefined && v !== '';
    }).length +
    EXPERT_ARRAY_FIELDS.filter((k) => {
      const v = profile[k];
      return Array.isArray(v) && v.length > 0;
    }).length;
  return Math.round((filled / total) * 100);
}

const PROFILE_COMPLETE_THRESHOLD = 80; // % at which we consider "complete"
const PROFILE_COMPLETE_TITLE = 'Expert Profile Completed';

@Injectable()
export class ExpertService {
  private readonly logger = new Logger(ExpertService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly rewards: RewardsService,
  ) {}

  // ─────────────────────────────────────────────────────────────────────────────
  // UPSERT OWN PROFILE
  // ─────────────────────────────────────────────────────────────────────────────

  async upsertProfile(userId: string, dto: UpsertExpertProfileDto) {
    try {
      const user = await this.prisma.user.findUnique({ where: { id: userId } });
      if (!user)
        return {
          status: false,
          statusCode: HttpStatus.NOT_FOUND,
          message: 'User not found.',
        };

      if (user.role !== 'EXPERT') {
        return {
          status: false,
          statusCode: HttpStatus.FORBIDDEN,
          message:
            'Only users with the EXPERT role can have an expert profile.',
        };
      }

      const profile = await this.prisma.expertProfile.upsert({
        where: { userId },
        create: {
          userId,
          title: dto.title,
          yearsOfExperience: dto.yearsOfExperience,
          about: dto.about,
          employer: dto.employer,
          otherExperience: dto.otherExperience,
          mentoringPhilosophy: dto.mentoringPhilosophy,
          previousMentoringExperience: dto.previousMentoringExperience,
          capacityOfMentees: dto.capacityOfMentees,
          education: dto.education ?? [],
          areasOfExpertise: dto.areasOfExpertise ?? [],
          servicesOffered: dto.servicesOffered ?? [],
          referees: dto.referees ?? [],
          preferredContactMethods: dto.preferredContactMethods ?? [],
          socials: dto.socials ?? [],
          otherLinks: dto.otherLinks ?? [],
        },
        update: {
          ...(dto.title !== undefined && { title: dto.title }),
          ...(dto.yearsOfExperience !== undefined && {
            yearsOfExperience: dto.yearsOfExperience,
          }),
          ...(dto.about !== undefined && { about: dto.about }),
          ...(dto.employer !== undefined && { employer: dto.employer }),
          ...(dto.otherExperience !== undefined && {
            otherExperience: dto.otherExperience,
          }),
          ...(dto.mentoringPhilosophy !== undefined && {
            mentoringPhilosophy: dto.mentoringPhilosophy,
          }),
          ...(dto.previousMentoringExperience !== undefined && {
            previousMentoringExperience: dto.previousMentoringExperience,
          }),
          ...(dto.capacityOfMentees !== undefined && {
            capacityOfMentees: dto.capacityOfMentees,
          }),
          ...(dto.education !== undefined && { education: dto.education }),
          ...(dto.areasOfExpertise !== undefined && {
            areasOfExpertise: dto.areasOfExpertise,
          }),
          ...(dto.servicesOffered !== undefined && {
            servicesOffered: dto.servicesOffered,
          }),
          ...(dto.referees !== undefined && { referees: dto.referees }),
          ...(dto.preferredContactMethods !== undefined && {
            preferredContactMethods: dto.preferredContactMethods,
          }),
          ...(dto.socials !== undefined && { socials: dto.socials }),
          ...(dto.otherLinks !== undefined && { otherLinks: dto.otherLinks }),
        },
      });

      // ── Profile completion reward (once only) ─────────────────────────────
      let rewardResult: any = undefined;
      const completion = calcExpertCompletion(profile);

      if (completion >= PROFILE_COMPLETE_THRESHOLD) {
        const alreadyAwarded = await this.rewards.hasAchievement(
          userId,
          PROFILE_COMPLETE_TITLE,
        );
        if (!alreadyAwarded) {
          rewardResult = await this.rewards.award({
            userId,
            points: 10,
            title: PROFILE_COMPLETE_TITLE,
            description: 'Awarded for completing your expert profile.',
            useFirstBadge: true,
          });
        }
      }

      return {
        status: true,
        statusCode: HttpStatus.OK,
        message: 'Expert profile saved.',
        data: profile,
        profileCompletion: completion,
        ...(rewardResult && {
          reward: {
            pointsEarned: rewardResult.pointsEarned,
            totalPoints: rewardResult.totalPoints,
            badgeAwarded: rewardResult.badgeAwarded,
          },
        }),
      };
    } catch (error) {
      this.logger.error('upsertProfile error', error);
      return {
        status: false,
        statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
        message: 'Server error.',
      };
    }
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // GET OWN PROFILE
  // ─────────────────────────────────────────────────────────────────────────────

  async getMyProfile(userId: string) {
    try {
      const profile = await this.prisma.expertProfile.findUnique({
        where: { userId },
      });
      if (!profile) {
        return {
          status: false,
          statusCode: HttpStatus.NOT_FOUND,
          message: 'Expert profile not found. Please create one.',
        };
      }
      return {
        status: true,
        statusCode: HttpStatus.OK,
        message: 'Profile retrieved.',
        data: profile,
        profileCompletion: calcExpertCompletion(profile),
      };
    } catch (error) {
      this.logger.error('getMyProfile error', error);
      return {
        status: false,
        statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
        message: 'Server error.',
      };
    }
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // EXPERT DASHBOARD ANALYTICS
  // ─────────────────────────────────────────────────────────────────────────────

  async getDashboard(userId: string) {
    try {
      const [profile, totalRequests, pendingRequests, completedRequests] =
        await Promise.all([
          this.prisma.expertProfile.findUnique({ where: { userId } }),
          this.prisma.mentorRequest.count({ where: { mentorId: userId } }),
          this.prisma.mentorRequest.count({
            where: { mentorId: userId, status: 'PENDING' },
          }),
          this.prisma.mentorRequest.count({
            where: { mentorId: userId, status: 'COMPLETED' },
          }),
        ]);

      const profileCompletion = profile ? calcExpertCompletion(profile) : 0;

      return {
        status: true,
        statusCode: HttpStatus.OK,
        message: 'Expert dashboard retrieved.',
        data: {
          profileCompletion,
          totalMentorshipRequests: totalRequests,
          pendingMentorshipRequests: pendingRequests,
          completedMentorshipSessions: completedRequests,
        },
      };
    } catch (error) {
      this.logger.error('getDashboard error', error);
      return {
        status: false,
        statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
        message: 'Server error.',
      };
    }
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // LIST PUBLIC EXPERT PROFILES
  // ─────────────────────────────────────────────────────────────────────────────

  async listExperts(query: {
    search?: string;
    expertise?: string;
    page?: number;
    limit?: number;
  }) {
    try {
      const page = Number(query.page ?? 1);
      const limit = Number(query.limit ?? 20);
      const skip = (page - 1) * limit;

      const where: any = { user: { role: 'EXPERT', status: 'APPROVED' } };

      if (query.expertise)
        where.areasOfExpertise = { array_contains: query.expertise };
      if (query.search) {
        where.OR = [
          { about: { contains: query.search, mode: 'insensitive' } },
          { employer: { contains: query.search, mode: 'insensitive' } },
          {
            user: { fullName: { contains: query.search, mode: 'insensitive' } },
          },
        ];
      }

      const [experts, total] = await this.prisma.$transaction([
        this.prisma.expertProfile.findMany({
          where,
          skip,
          take: limit,
          include: {
            user: {
              select: {
                id: true,
                fullName: true,
                avatarUrl: true,
                email: true,
              },
            },
          },
          orderBy: { createdAt: 'desc' },
        }),
        this.prisma.expertProfile.count({ where }),
      ]);

      const sanitized = experts.map((e) => ({
        ...e,
        referees: [],
        preferredContactMethods: [],
      }));

      return {
        status: true,
        statusCode: HttpStatus.OK,
        message: 'Experts retrieved.',
        data: {
          experts: sanitized,
          total,
          page,
          limit,
          pages: Math.ceil(total / limit),
        },
      };
    } catch (error) {
      this.logger.error('listExperts error', error);
      return {
        status: false,
        statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
        message: 'Server error.',
      };
    }
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // GET PUBLIC EXPERT PROFILE BY USER ID
  // ─────────────────────────────────────────────────────────────────────────────

  async getExpertByUserId(userId: string) {
    try {
      const profile = await this.prisma.expertProfile.findUnique({
        where: { userId },
        include: {
          user: {
            select: {
              id: true,
              fullName: true,
              avatarUrl: true,
              email: true,
              status: true,
            },
          },
        },
      });

      if (!profile || profile.user.status !== 'APPROVED') {
        return {
          status: false,
          statusCode: HttpStatus.NOT_FOUND,
          message: 'Expert not found.',
        };
      }

      const { referees, ...publicProfile } = profile as any;

      return {
        status: true,
        statusCode: HttpStatus.OK,
        message: 'Expert profile retrieved.',
        data: publicProfile,
      };
    } catch (error) {
      this.logger.error('getExpertByUserId error', error);
      return {
        status: false,
        statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
        message: 'Server error.',
      };
    }
  }
}
