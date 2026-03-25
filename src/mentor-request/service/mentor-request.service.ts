import { Injectable, HttpStatus, Logger } from '@nestjs/common';
import { MentorRequestStatus, NotificationType } from '@prisma/client';

import {
  CreateMentorRequestDto,
  UpdateMentorRequestDto,
  RespondToMentorRequestDto,
  AdminUpdateMentorRequestDto,
  ListMentorRequestsQueryDto,
} from '../dto/mentor-request.dto';
import { PrismaService } from 'src/prisma.service';
import { EmailService } from 'src/providers/email/email.service';
import { RewardsService } from 'src/reward/service/reward.service';
import { NotificationsService } from 'src/notifications/service/notifications.service';

// ─── Prisma include shape reused across queries ───────────────────────────────
const MENTOR_REQUEST_INCLUDE = {
  mentor: {
    select: {
      id: true,
      fullName: true,
      email: true,
      avatarUrl: true,
      expertProfile: {
        select: {
          title: true,
          employer: true,
          areasOfExpertise: true,
        },
      },
    },
  },
  ngoUser: {
    select: {
      id: true,
      fullName: true,
      email: true,
      organization: {
        select: {
          name: true,
          state: true,
        },
      },
    },
  },
} as const;

@Injectable()
export class MentorRequestService {
  private readonly logger = new Logger(MentorRequestService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly emailService: EmailService,
    private readonly rewards: RewardsService,
    private readonly notifications: NotificationsService,
  ) {}

  // ─── Helpers ───────────────────────────────────────────────────────────────

  private formatRequest(r: any) {
    return {
      id: r.id,
      status: r.status,
      hoursPerWeek: r.hoursPerWeek,
      mentorshipAreas: r.mentorshipAreas,
      commMethods: r.commMethods,
      orgChallenges: r.orgChallenges,
      background: r.background,
      acceptedTerms: r.acceptedTerms,
      createdAt: r.createdAt,
      updatedAt: r.updatedAt,
      mentor: {
        id: r.mentor.id,
        fullName: r.mentor.fullName,
        email: r.mentor.email,
        avatarUrl: r.mentor.avatarUrl,
        title: r.mentor.expertProfile?.title,
        employer: r.mentor.expertProfile?.employer,
        areasOfExpertise: r.mentor.expertProfile?.areasOfExpertise ?? [],
      },
      ngoUser: {
        id: r.ngoUser.id,
        fullName: r.ngoUser.fullName,
        email: r.ngoUser.email,
        orgName: r.ngoUser.organization?.name,
        orgState: r.ngoUser.organization?.state,
      },
    };
  }

  private paginate(page = 1, limit = 20) {
    const p = Math.max(1, page);
    const l = Math.min(100, Math.max(1, limit));
    return { skip: (p - 1) * l, take: l, page: p, limit: l };
  }

  // ─── NGO: Submit a mentor request ──────────────────────────────────────────

  async createRequest(ngoUserId: string, dto: CreateMentorRequestDto) {
    // Must have an org profile
    const ngoUser = await this.prisma.user.findUnique({
      where: { id: ngoUserId },
      include: { organization: { select: { name: true } } },
    });

    if (!ngoUser?.organization) {
      return {
        status: false,
        statusCode: HttpStatus.BAD_REQUEST,
        message:
          'You must complete your organization profile before requesting a mentor.',
      };
    }

    // Target must be an EXPERT
    const mentor = await this.prisma.user.findUnique({
      where: { id: dto.mentorId },
      include: {
        expertProfile: {
          select: {
            title: true,
            capacityOfMentees: true,
            areasOfExpertise: true,
          },
        },
      },
    });

    if (!mentor || mentor.role !== 'EXPERT') {
      return {
        status: false,
        statusCode: HttpStatus.NOT_FOUND,
        message: 'Mentor not found.',
      };
    }

    if (mentor.status !== 'APPROVED') {
      return {
        status: false,
        statusCode: HttpStatus.BAD_REQUEST,
        message: 'This mentor is not currently available.',
      };
    }

    if (!dto.acceptedTerms) {
      return {
        status: false,
        statusCode: HttpStatus.BAD_REQUEST,
        message: 'You must accept the mentorship terms to proceed.',
      };
    }

    // Prevent duplicate pending requests to the same mentor
    const duplicate = await this.prisma.mentorRequest.findFirst({
      where: {
        ngoUserId,
        mentorId: dto.mentorId,
        status: { in: ['PENDING', 'APPROVED'] },
      },
    });

    if (duplicate) {
      return {
        status: false,
        statusCode: HttpStatus.CONFLICT,
        message:
          duplicate.status === 'APPROVED'
            ? 'You already have an active mentorship with this expert.'
            : 'You already have a pending request to this mentor.',
      };
    }

    const request = await this.prisma.mentorRequest.create({
      data: {
        ngoUserId,
        mentorId: dto.mentorId,
        hoursPerWeek: dto.hoursPerWeek,
        mentorshipAreas: dto.mentorshipAreas ?? [],
        commMethods: dto.commMethods ?? [],
        orgChallenges: dto.orgChallenges,
        background: dto.background,
        acceptedTerms: dto.acceptedTerms,
        status: MentorRequestStatus.PENDING,
      },
      include: MENTOR_REQUEST_INCLUDE,
    });

    // Notify the mentor
    this.emailService
      .sendMentorRequestNotification({
        mentorName: mentor.fullName,
        mentorEmail: mentor.email,
        ngoName: ngoUser.organization.name,
        ngoUserName: ngoUser.fullName,
        dashboardUrl: `${process.env.FRONTEND_URL}/dashboard/mentor-requests`,
      })
      .catch((err) =>
        this.logger.error('Failed to send mentor request email', err),
      );

    this.notifications
      .create({
        userId: dto.mentorId,
        type: NotificationType.MENTOR_REQUEST_RECEIVED,
        title: 'New Mentorship Request',
        body: `${ngoUser.organization.name} has sent you a mentorship request.`,
        link: `/dashboard/mentor-requests`,
        meta: { orgName: ngoUser.organization.name, requestId: request.id },
      })
      .catch((err) => this.logger.error('notification failed', err));

    return {
      status: true,
      statusCode: HttpStatus.CREATED,
      message: 'Mentor request submitted successfully.',
      data: this.formatRequest(request),
    };
  }

  // ─── NGO: List own requests ─────────────────────────────────────────────────

  async getMyRequestsAsNgo(
    ngoUserId: string,
    query: ListMentorRequestsQueryDto,
  ) {
    const { skip, take, page, limit } = this.paginate(query.page, query.limit);
    const where: any = { ngoUserId };
    if (query.status) where.status = query.status;

    const [items, total] = await Promise.all([
      this.prisma.mentorRequest.findMany({
        where,
        skip,
        take,
        include: MENTOR_REQUEST_INCLUDE,
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.mentorRequest.count({ where }),
    ]);

    return {
      status: true,
      statusCode: HttpStatus.OK,
      data: items.map((r) => this.formatRequest(r)),
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  // ─── NGO: View a single own request ────────────────────────────────────────

  async getMyRequestById(ngoUserId: string, requestId: string) {
    const request = await this.prisma.mentorRequest.findFirst({
      where: { id: requestId, ngoUserId },
      include: MENTOR_REQUEST_INCLUDE,
    });

    if (!request) {
      return {
        status: false,
        statusCode: HttpStatus.NOT_FOUND,
        message: 'Mentor request not found.',
      };
    }

    return {
      status: true,
      statusCode: HttpStatus.OK,
      data: this.formatRequest(request),
    };
  }

  // ─── NGO: Edit a pending request ───────────────────────────────────────────

  async updateRequest(
    ngoUserId: string,
    requestId: string,
    dto: UpdateMentorRequestDto,
  ) {
    const request = await this.prisma.mentorRequest.findFirst({
      where: { id: requestId, ngoUserId },
    });

    if (!request) {
      return {
        status: false,
        statusCode: HttpStatus.NOT_FOUND,
        message: 'Mentor request not found.',
      };
    }

    if (request.status !== MentorRequestStatus.PENDING) {
      return {
        status: false,
        statusCode: HttpStatus.BAD_REQUEST,
        message: `Only PENDING requests can be edited. This request is ${request.status}.`,
      };
    }

    const updated = await this.prisma.mentorRequest.update({
      where: { id: requestId },
      data: {
        ...(dto.hoursPerWeek !== undefined && {
          hoursPerWeek: dto.hoursPerWeek,
        }),
        ...(dto.mentorshipAreas !== undefined && {
          mentorshipAreas: dto.mentorshipAreas,
        }),
        ...(dto.commMethods !== undefined && { commMethods: dto.commMethods }),
        ...(dto.orgChallenges !== undefined && {
          orgChallenges: dto.orgChallenges,
        }),
        ...(dto.background !== undefined && { background: dto.background }),
      },
      include: MENTOR_REQUEST_INCLUDE,
    });

    return {
      status: true,
      statusCode: HttpStatus.OK,
      message: 'Request updated.',
      data: this.formatRequest(updated),
    };
  }

  // ─── NGO: Cancel (withdraw) a pending request ───────────────────────────────

  async cancelRequest(ngoUserId: string, requestId: string) {
    const request = await this.prisma.mentorRequest.findFirst({
      where: { id: requestId, ngoUserId },
    });

    if (!request) {
      return {
        status: false,
        statusCode: HttpStatus.NOT_FOUND,
        message: 'Mentor request not found.',
      };
    }

    if (request.status !== MentorRequestStatus.PENDING) {
      return {
        status: false,
        statusCode: HttpStatus.BAD_REQUEST,
        message: `Only PENDING requests can be cancelled. This request is ${request.status}.`,
      };
    }

    await this.prisma.mentorRequest.delete({ where: { id: requestId } });

    return {
      status: true,
      statusCode: HttpStatus.OK,
      message: 'Mentor request cancelled.',
    };
  }

  // ─── EXPERT: List incoming requests ────────────────────────────────────────

  async getIncomingRequests(
    mentorId: string,
    query: ListMentorRequestsQueryDto,
  ) {
    const { skip, take, page, limit } = this.paginate(query.page, query.limit);
    const where: any = { mentorId };
    if (query.status) where.status = query.status;

    const [items, total] = await Promise.all([
      this.prisma.mentorRequest.findMany({
        where,
        skip,
        take,
        include: MENTOR_REQUEST_INCLUDE,
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.mentorRequest.count({ where }),
    ]);

    return {
      status: true,
      statusCode: HttpStatus.OK,
      data: items.map((r) => this.formatRequest(r)),
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  // ─── EXPERT: View a single incoming request ─────────────────────────────────

  async getIncomingRequestById(mentorId: string, requestId: string) {
    const request = await this.prisma.mentorRequest.findFirst({
      where: { id: requestId, mentorId },
      include: MENTOR_REQUEST_INCLUDE,
    });

    if (!request) {
      return {
        status: false,
        statusCode: HttpStatus.NOT_FOUND,
        message: 'Mentor request not found.',
      };
    }

    return {
      status: true,
      statusCode: HttpStatus.OK,
      data: this.formatRequest(request),
    };
  }

  // ─── EXPERT: Accept or decline a request ───────────────────────────────────

  async respondToRequest(
    mentorId: string,
    requestId: string,
    dto: RespondToMentorRequestDto,
  ) {
    const request = await this.prisma.mentorRequest.findFirst({
      where: { id: requestId, mentorId },
      include: {
        ngoUser: { select: { fullName: true, email: true } },
        mentor: { select: { fullName: true } },
      },
    });

    if (!request) {
      return {
        status: false,
        statusCode: HttpStatus.NOT_FOUND,
        message: 'Mentor request not found.',
      };
    }

    if (request.status !== MentorRequestStatus.PENDING) {
      return {
        status: false,
        statusCode: HttpStatus.BAD_REQUEST,
        message: `Only PENDING requests can be responded to. This request is ${request.status}.`,
      };
    }

    const newStatus =
      dto.action === 'APPROVED'
        ? MentorRequestStatus.APPROVED
        : MentorRequestStatus.DECLINED;

    const updated = await this.prisma.mentorRequest.update({
      where: { id: requestId },
      data: { status: newStatus },
      include: MENTOR_REQUEST_INCLUDE,
    });

    // Notify the NGO of the decision
    this.emailService
      .sendMentorRequestDecision({
        ngoName: request.ngoUser.fullName,
        ngoEmail: request.ngoUser.email,
        mentorName: request.mentor.fullName,
        decision: dto.action,
        message: dto.message,
        dashboardUrl: `${process.env.FRONTEND_URL}/dashboard/mentorship`,
      })
      .catch((err) =>
        this.logger.error('Failed to send mentor decision email', err),
      );

    const isApproved = dto.action === 'APPROVED';
    this.notifications
      .create({
        userId: request.ngoUserId,
        type: isApproved
          ? NotificationType.MENTOR_REQUEST_APPROVED
          : NotificationType.MENTOR_REQUEST_DECLINED,
        title: isApproved
          ? 'Mentorship Request Approved'
          : 'Mentorship Request Declined',
        body: isApproved
          ? `${request.mentor.fullName} has accepted your mentorship request.`
          : `${request.mentor.fullName} has declined your mentorship request.`,
        link: `/dashboard/mentorship`,
        meta: { mentorName: request.mentor.fullName, requestId: request.id },
      })
      .catch((err) => this.logger.error('notification failed', err));

    return {
      status: true,
      statusCode: HttpStatus.OK,
      message:
        dto.action === 'APPROVED'
          ? 'Mentorship request accepted.'
          : 'Mentorship request declined.',
      data: this.formatRequest(updated),
    };
  }

  // ─── EXPERT: Mark an active mentorship as completed ────────────────────────

  async completeRequest(mentorId: string, requestId: string) {
    const request = await this.prisma.mentorRequest.findFirst({
      where: { id: requestId, mentorId },
    });

    if (!request) {
      return {
        status: false,
        statusCode: HttpStatus.NOT_FOUND,
        message: 'Mentor request not found.',
      };
    }

    if (request.status !== MentorRequestStatus.APPROVED) {
      return {
        status: false,
        statusCode: HttpStatus.BAD_REQUEST,
        message: 'Only APPROVED mentorships can be marked as completed.',
      };
    }

    const updated = await this.prisma.mentorRequest.update({
      where: { id: requestId },
      data: { status: MentorRequestStatus.COMPLETED },
      include: MENTOR_REQUEST_INCLUDE,
    });

    // Award 10 points + Achievement to the NGO user who participated (fire-and-forget)
    this.rewards
      .award({
        userId: request.ngoUserId,
        points: 10,
        title: 'Mentorship Session Completed',
        description:
          'Awarded for completing a mentorship session with an expert.',
      })
      .catch((err) =>
        this.logger.error('completeRequest rewards.award failed', err),
      );

    // Notify both parties
    this.notifications
      .createMany([
        {
          userId: request.ngoUserId,
          type: NotificationType.MENTOR_SESSION_COMPLETED,
          title: 'Mentorship Session Completed',
          body: 'Your mentorship session has been marked as completed. +10 points awarded!',
          link: `/dashboard/mentorship`,
          meta: { requestId: request.id },
        },
        {
          userId: mentorId,
          type: NotificationType.MENTOR_SESSION_COMPLETED,
          title: 'Mentorship Session Completed',
          body: 'You have marked a mentorship session as completed.',
          link: `/dashboard/mentor-requests`,
          meta: { requestId: request.id },
        },
      ])
      .catch((err) => this.logger.error('notification fan-out failed', err));

    return {
      status: true,
      statusCode: HttpStatus.OK,
      message: 'Mentorship marked as completed.',
      data: this.formatRequest(updated),
    };
  }

  // ─── ADMIN: List all requests ───────────────────────────────────────────────

  async adminListAll(query: ListMentorRequestsQueryDto) {
    const { skip, take, page, limit } = this.paginate(query.page, query.limit);
    const where: any = {};
    if (query.status) where.status = query.status;

    const [items, total] = await Promise.all([
      this.prisma.mentorRequest.findMany({
        where,
        skip,
        take,
        include: MENTOR_REQUEST_INCLUDE,
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.mentorRequest.count({ where }),
    ]);

    return {
      status: true,
      statusCode: HttpStatus.OK,
      data: items.map((r) => this.formatRequest(r)),
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  // ─── ADMIN: Get any single request ─────────────────────────────────────────

  async adminGetById(requestId: string) {
    const request = await this.prisma.mentorRequest.findUnique({
      where: { id: requestId },
      include: MENTOR_REQUEST_INCLUDE,
    });

    if (!request) {
      return {
        status: false,
        statusCode: HttpStatus.NOT_FOUND,
        message: 'Mentor request not found.',
      };
    }

    return {
      status: true,
      statusCode: HttpStatus.OK,
      data: this.formatRequest(request),
    };
  }

  // ─── ADMIN: Override status ────────────────────────────────────────────────

  async adminUpdateStatus(requestId: string, dto: AdminUpdateMentorRequestDto) {
    const request = await this.prisma.mentorRequest.findUnique({
      where: { id: requestId },
    });

    if (!request) {
      return {
        status: false,
        statusCode: HttpStatus.NOT_FOUND,
        message: 'Mentor request not found.',
      };
    }

    const updated = await this.prisma.mentorRequest.update({
      where: { id: requestId },
      data: { status: dto.status },
      include: MENTOR_REQUEST_INCLUDE,
    });

    return {
      status: true,
      statusCode: HttpStatus.OK,
      message: `Status updated to ${dto.status}.`,
      data: this.formatRequest(updated),
    };
  }

  // ─── ADMIN: Hard delete ────────────────────────────────────────────────────

  async adminDelete(requestId: string) {
    const request = await this.prisma.mentorRequest.findUnique({
      where: { id: requestId },
    });

    if (!request) {
      return {
        status: false,
        statusCode: HttpStatus.NOT_FOUND,
        message: 'Mentor request not found.',
      };
    }

    await this.prisma.mentorRequest.delete({ where: { id: requestId } });

    return {
      status: true,
      statusCode: HttpStatus.OK,
      message: 'Mentor request deleted.',
    };
  }

  // ─── SHARED: Stats summary (used by admin dashboard) ──────────────────────

  async getStats() {
    const [total, pending, approved, declined, completed] = await Promise.all([
      this.prisma.mentorRequest.count(),
      this.prisma.mentorRequest.count({ where: { status: 'PENDING' } }),
      this.prisma.mentorRequest.count({ where: { status: 'APPROVED' } }),
      this.prisma.mentorRequest.count({ where: { status: 'DECLINED' } }),
      this.prisma.mentorRequest.count({ where: { status: 'COMPLETED' } }),
    ]);

    return {
      status: true,
      statusCode: HttpStatus.OK,
      data: { total, pending, approved, declined, completed },
    };
  }
}
