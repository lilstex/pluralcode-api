import { Injectable, HttpStatus, Logger } from '@nestjs/common';
import { PrismaService } from 'src/prisma.service';
import { AzureBlobService } from 'src/providers/azure/azure.blob.service';
import {
  UpdateOrganizationDto,
  CreateActivityDto,
  UpdateActivityDto,
  CreateDonorDto,
  UpdateDonorDto,
  CreateAssessmentDto,
  UpdateAssessmentDto,
  OrgQueryDto,
  AddMemberDto,
  UpdateMemberRoleDto,
  InviteAndAddMemberDto,
} from '../dto/organizations.dto';
import * as bcrypt from 'bcrypt';
import { ConfigService } from '@nestjs/config';
import { EmailService } from 'src/providers/email/email.service';
import {
  generateOtp,
  generateSecureToken,
  otpExpiresAt,
} from 'src/util/helper';

// ─────────────────────────────────────────────────────────────────────────────
// SHARED INCLUDE / SELECT CONSTANTS
// ─────────────────────────────────────────────────────────────────────────────

// Full include used for single-org responses.
// Avoid top-level "as const" — Prisma orderBy expects mutable arrays.
const ORG_FULL_INCLUDE = {
  activities: { orderBy: { when: 'desc' as const } },
  donors: { orderBy: { createdAt: 'desc' as const } },
  assessments: {
    orderBy: [{ year: 'desc' as const }, { month: 'desc' as const }],
  },
  members: {
    where: { status: 'active' },
    orderBy: { joinedAt: 'asc' as const },
    include: {
      user: {
        select: {
          id: true,
          fullName: true,
          email: true,
          avatarUrl: true,
          phoneNumber: true,
        },
      },
    },
  },
  user: {
    select: {
      id: true,
      fullName: true,
      email: true,
      avatarUrl: true,
      status: true,
    },
  },
};

// Slimmer select for list/directory endpoints — no extension tables or members
const ORG_SUMMARY_SELECT = {
  id: true,
  name: true,
  acronym: true,
  cacNumber: true,
  state: true,
  lga: true,
  sectors: true,
  logoUrl: true,
  mission: true,
  numberOfStaff: true,
  numberOfVolunteers: true,
  vision: true,
  createdAt: true,
} as const;

// Member include — reused by membership methods
const MEMBER_INCLUDE = {
  user: {
    select: {
      id: true,
      fullName: true,
      email: true,
      avatarUrl: true,
      phoneNumber: true,
    },
  },
};

@Injectable()
export class OrganizationService {
  private readonly logger = new Logger(OrganizationService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly azureBlob: AzureBlobService,
    private readonly emailService: EmailService,
    private readonly config: ConfigService,
  ) {}

  // ─────────────────────────────────────────────────────────────────────────────
  // CORE — READ
  // ─────────────────────────────────────────────────────────────────────────────

  /**
   * Full profile of the org the authenticated NGO_MEMBER owns.
   */
  async getMyOrganization(userId: string) {
    try {
      const org = await this.prisma.organization.findUnique({
        where: { userId },
        include: ORG_FULL_INCLUDE,
      });

      if (!org) {
        return {
          status: false,
          statusCode: HttpStatus.NOT_FOUND,
          message: 'Organization profile not found.',
        };
      }

      return {
        status: true,
        statusCode: HttpStatus.OK,
        message: 'Organization retrieved.',
        data: org,
      };
    } catch (error) {
      this.logger.error('getMyOrganization error', error);
      return {
        status: false,
        statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
        message: 'Server error.',
      };
    }
  }

  /**
   * Public / admin read — full detail by organization UUID.
   */
  async getOrganizationById(id: string) {
    try {
      const org = await this.prisma.organization.findUnique({
        where: { id },
        include: ORG_FULL_INCLUDE,
      });

      if (!org) {
        return {
          status: false,
          statusCode: HttpStatus.NOT_FOUND,
          message: 'Organization not found.',
        };
      }

      return {
        status: true,
        statusCode: HttpStatus.OK,
        message: 'Organization retrieved.',
        data: org,
      };
    } catch (error) {
      this.logger.error('getOrganizationById error', error);
      return {
        status: false,
        statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
        message: 'Server error.',
      };
    }
  }

  /**
   * Paginated directory listing.
   * Supports search (name, acronym, CAC), sector filter, state filter.
   */
  async listOrganizations(query: OrgQueryDto) {
    try {
      const page = Math.max(1, parseInt(String(query.page ?? '1'), 10) || 1);
      const limit = Math.min(
        100,
        Math.max(1, parseInt(String(query.limit ?? '20'), 10) || 20),
      );
      const skip = (page - 1) * limit;

      const where: any = {};

      if (query.sector) where.sectors = { has: query.sector };
      if (query.state)
        where.state = { contains: query.state, mode: 'insensitive' };
      if (query.search) {
        where.OR = [
          { name: { contains: query.search, mode: 'insensitive' } },
          { acronym: { contains: query.search, mode: 'insensitive' } },
          { cacNumber: { contains: query.search, mode: 'insensitive' } },
        ];
      }

      const [orgs, total] = await this.prisma.$transaction([
        this.prisma.organization.findMany({
          where,
          skip,
          take: limit,
          select: ORG_SUMMARY_SELECT,
          orderBy: { name: 'asc' },
        }),
        this.prisma.organization.count({ where }),
      ]);

      return {
        status: true,
        statusCode: HttpStatus.OK,
        message: 'Organizations retrieved.',
        data: {
          organizations: orgs,
          total,
          page,
          limit,
          pages: Math.ceil(total / limit),
        },
      };
    } catch (error) {
      this.logger.error('listOrganizations error', error);
      return {
        status: false,
        statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
        message: 'Server error.',
      };
    }
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // CORE — UPDATE (owner)
  // ─────────────────────────────────────────────────────────────────────────────

  async updateMyOrganization(userId: string, dto: UpdateOrganizationDto) {
    try {
      const org = await this.prisma.organization.findUnique({
        where: { userId },
      });
      if (!org) {
        return {
          status: false,
          statusCode: HttpStatus.NOT_FOUND,
          message: 'Organization not found.',
        };
      }

      const updated = await this.prisma.organization.update({
        where: { userId },
        data: {
          ...(dto.name !== undefined && { name: dto.name }),
          ...(dto.acronym !== undefined && { acronym: dto.acronym }),
          ...(dto.phoneNumber !== undefined && {
            phoneNumber: dto.phoneNumber,
          }),
          ...(dto.publicEmail !== undefined && {
            publicEmail: dto.publicEmail,
          }),
          ...(dto.state !== undefined && { state: dto.state }),
          ...(dto.lga !== undefined && { lga: dto.lga }),
          ...(dto.address !== undefined && { address: dto.address }),
          ...(dto.mission !== undefined && { mission: dto.mission }),
          ...(dto.vision !== undefined && { vision: dto.vision }),
          ...(dto.sectors !== undefined && { sectors: dto.sectors }),
          ...(dto.numberOfStaff !== undefined && {
            numberOfStaff: dto.numberOfStaff,
          }),
          ...(dto.numberOfVolunteers !== undefined && {
            numberOfVolunteers: dto.numberOfVolunteers,
          }),
          ...(dto.annualBudget !== undefined && {
            annualBudget: dto.annualBudget,
          }),
          ...(dto.socials !== undefined && { socials: dto.socials }),
          ...(dto.otherLinks !== undefined && { otherLinks: dto.otherLinks }),
          ...(dto.description !== undefined && {
            description: dto.description,
          }),
        },
        include: ORG_FULL_INCLUDE,
      });

      return {
        status: true,
        statusCode: HttpStatus.OK,
        message: 'Organization updated.',
        data: updated,
      };
    } catch (error) {
      this.logger.error('updateMyOrganization error', error);
      return {
        status: false,
        statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
        message: 'Server error.',
      };
    }
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // CORE — UPDATE (admin)
  // ─────────────────────────────────────────────────────────────────────────────

  async updateOrganizationByAdmin(
    adminId: string,
    id: string,
    dto: UpdateOrganizationDto,
  ) {
    try {
      const org = await this.prisma.organization.findUnique({ where: { id } });
      if (!org) {
        return {
          status: false,
          statusCode: HttpStatus.NOT_FOUND,
          message: 'Organization not found.',
        };
      }

      const updated = await this.prisma.organization.update({
        where: { id },
        data: {
          ...(dto.name !== undefined && { name: dto.name }),
          ...(dto.acronym !== undefined && { acronym: dto.acronym }),
          ...(dto.phoneNumber !== undefined && {
            phoneNumber: dto.phoneNumber,
          }),
          ...(dto.publicEmail !== undefined && {
            publicEmail: dto.publicEmail,
          }),
          ...(dto.state !== undefined && { state: dto.state }),
          ...(dto.lga !== undefined && { lga: dto.lga }),
          ...(dto.address !== undefined && { address: dto.address }),
          ...(dto.mission !== undefined && { mission: dto.mission }),
          ...(dto.vision !== undefined && { vision: dto.vision }),
          ...(dto.sectors !== undefined && { sectors: dto.sectors }),
          ...(dto.numberOfStaff !== undefined && {
            numberOfStaff: dto.numberOfStaff,
          }),
          ...(dto.numberOfVolunteers !== undefined && {
            numberOfVolunteers: dto.numberOfVolunteers,
          }),
          ...(dto.annualBudget !== undefined && {
            annualBudget: dto.annualBudget,
          }),
          ...(dto.socials !== undefined && { socials: dto.socials }),
          ...(dto.otherLinks !== undefined && { otherLinks: dto.otherLinks }),
          ...(dto.description !== undefined && {
            description: dto.description,
          }),
        },
        include: ORG_FULL_INCLUDE,
      });

      await this.prisma.auditLog.create({
        data: {
          action: 'ORG_UPDATED',
          entity: 'Organization',
          entityId: id,
          details: { changes: { ...dto } } as any,
          adminId,
        },
      });

      return {
        status: true,
        statusCode: HttpStatus.OK,
        message: 'Organization updated.',
        data: updated,
      };
    } catch (error) {
      this.logger.error('updateOrganizationByAdmin error', error);
      return {
        status: false,
        statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
        message: 'Server error.',
      };
    }
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // CORE — DELETE (admin)
  // ─────────────────────────────────────────────────────────────────────────────

  async deleteOrganization(adminId: string, id: string) {
    try {
      const org = await this.prisma.organization.findUnique({ where: { id } });
      if (!org) {
        return {
          status: false,
          statusCode: HttpStatus.NOT_FOUND,
          message: 'Organization not found.',
        };
      }

      if (org.logoUrl) {
        await this.azureBlob.delete(org.logoUrl, 'avatars');
      }

      await this.prisma.$transaction([
        this.prisma.organization.delete({ where: { id } }),
        this.prisma.auditLog.create({
          data: {
            action: 'ORG_DELETED',
            entity: 'Organization',
            entityId: id,
            details: { name: org.name, cacNumber: org.cacNumber } as any,
            adminId,
          },
        }),
      ]);

      return {
        status: true,
        statusCode: HttpStatus.OK,
        message: 'Organization deleted successfully.',
      };
    } catch (error) {
      this.logger.error('deleteOrganization error', error);
      return {
        status: false,
        statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
        message: 'Server error.',
      };
    }
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // LOGO UPLOAD
  // ─────────────────────────────────────────────────────────────────────────────

  async uploadLogo(userId: string, file: Express.Multer.File) {
    try {
      const org = await this.prisma.organization.findUnique({
        where: { userId },
      });
      if (!org) {
        return {
          status: false,
          statusCode: HttpStatus.NOT_FOUND,
          message: 'Organization not found.',
        };
      }

      if (org.logoUrl) await this.azureBlob.delete(org.logoUrl, 'avatars');
      const logoUrl = await this.azureBlob.upload(file, 'avatars');
      await this.prisma.organization.update({
        where: { userId },
        data: { logoUrl },
      });

      return {
        status: true,
        statusCode: HttpStatus.OK,
        message: 'Logo uploaded.',
        logoUrl,
      };
    } catch (error) {
      this.logger.error('uploadLogo error', error);
      return {
        status: false,
        statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
        message: 'Server error.',
      };
    }
  }

  async uploadLogoByAdmin(
    adminId: string,
    orgId: string,
    file: Express.Multer.File,
  ) {
    try {
      const org = await this.prisma.organization.findUnique({
        where: { id: orgId },
      });
      if (!org) {
        return {
          status: false,
          statusCode: HttpStatus.NOT_FOUND,
          message: 'Organization not found.',
        };
      }

      if (org.logoUrl) await this.azureBlob.delete(org.logoUrl, 'avatars');
      const logoUrl = await this.azureBlob.upload(file, 'avatars');
      await this.prisma.organization.update({
        where: { id: orgId },
        data: { logoUrl },
      });

      await this.prisma.auditLog.create({
        data: {
          action: 'ORG_LOGO_UPDATED',
          entity: 'Organization',
          entityId: orgId,
          adminId,
        },
      });

      return {
        status: true,
        statusCode: HttpStatus.OK,
        message: 'Logo uploaded.',
        logoUrl,
      };
    } catch (error) {
      this.logger.error('uploadLogoByAdmin error', error);
      return {
        status: false,
        statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
        message: 'Server error.',
      };
    }
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // MEMBERSHIP MANAGEMENT
  // ─────────────────────────────────────────────────────────────────────────────

  /**
   * Add a GUEST user as a member of the NGO_MEMBER's organization.
   * Only the org owner can call this. Target user must have GUEST role and APPROVED status.
   */
  async addMember(ownerId: string, dto: AddMemberDto) {
    try {
      const org = await this.prisma.organization.findUnique({
        where: { userId: ownerId },
      });
      if (!org) {
        return {
          status: false,
          statusCode: HttpStatus.NOT_FOUND,
          message: 'Organization not found.',
        };
      }

      const targetUser = await this.prisma.user.findUnique({
        where: { id: dto.userId },
      });
      if (!targetUser) {
        return {
          status: false,
          statusCode: HttpStatus.NOT_FOUND,
          message: 'User not found.',
        };
      }
      if (targetUser.role !== 'GUEST') {
        return {
          status: false,
          statusCode: HttpStatus.BAD_REQUEST,
          message:
            'Only users with the GUEST role can be added as organization members.',
        };
      }
      if (targetUser.status !== 'APPROVED') {
        return {
          status: false,
          statusCode: HttpStatus.BAD_REQUEST,
          message:
            'User account must be approved before they can be added as a member.',
        };
      }

      // Check for an existing membership record
      const existing = await this.prisma.organizationMember.findUnique({
        where: {
          userId_organizationId: { userId: dto.userId, organizationId: org.id },
        },
      });

      if (existing) {
        if (existing.status === 'active') {
          return {
            status: false,
            statusCode: HttpStatus.CONFLICT,
            message: 'User is already an active member.',
          };
        }
        // Re-activate a removed/suspended membership
        const reactivated = await this.prisma.organizationMember.update({
          where: { id: existing.id },
          data: {
            status: 'active',
            orgRole: dto.orgRole ?? existing.orgRole,
            invitedById: ownerId,
          },
          include: MEMBER_INCLUDE,
        });
        return {
          status: true,
          statusCode: HttpStatus.OK,
          message: 'Member re-activated.',
          data: reactivated,
        };
      }

      const member = await this.prisma.organizationMember.create({
        data: {
          organizationId: org.id,
          userId: dto.userId,
          orgRole: dto.orgRole ?? 'member',
          invitedById: ownerId,
        },
        include: MEMBER_INCLUDE,
      });

      return {
        status: true,
        statusCode: HttpStatus.CREATED,
        message: 'Member added.',
        data: member,
      };
    } catch (error) {
      this.logger.error('addMember error', error);
      return {
        status: false,
        statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
        message: 'Server error.',
      };
    }
  }

  /**
   * List all active members of the authenticated NGO_MEMBER's organization.
   */
  async listMembers(ownerId: string) {
    try {
      const org = await this.prisma.organization.findUnique({
        where: { userId: ownerId },
      });
      if (!org) {
        return {
          status: false,
          statusCode: HttpStatus.NOT_FOUND,
          message: 'Organization not found.',
        };
      }

      const members = await this.prisma.organizationMember.findMany({
        where: { organizationId: org.id, status: 'active' },
        include: MEMBER_INCLUDE,
        orderBy: { joinedAt: 'asc' },
      });

      return {
        status: true,
        statusCode: HttpStatus.OK,
        message: 'Members retrieved.',
        data: members,
      };
    } catch (error) {
      this.logger.error('listMembers error', error);
      return {
        status: false,
        statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
        message: 'Server error.',
      };
    }
  }

  /**
   * Update a member's orgRole within the owner's organization.
   */
  async updateMemberRole(
    ownerId: string,
    memberId: string,
    dto: UpdateMemberRoleDto,
  ) {
    try {
      const member = await this.prisma.organizationMember.findUnique({
        where: { id: memberId },
        include: { organization: { select: { userId: true } } },
      });

      if (!member || member.organization.userId !== ownerId) {
        return {
          status: false,
          statusCode: HttpStatus.NOT_FOUND,
          message: 'Member not found.',
        };
      }

      const updated = await this.prisma.organizationMember.update({
        where: { id: memberId },
        data: { orgRole: dto.orgRole },
        include: MEMBER_INCLUDE,
      });

      return {
        status: true,
        statusCode: HttpStatus.OK,
        message: 'Member role updated.',
        data: updated,
      };
    } catch (error) {
      this.logger.error('updateMemberRole error', error);
      return {
        status: false,
        statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
        message: 'Server error.',
      };
    }
  }

  /**
   * Soft-remove a member (status = "removed"). Owner-scoped.
   */
  async removeMember(ownerId: string, memberId: string) {
    try {
      const member = await this.prisma.organizationMember.findUnique({
        where: { id: memberId },
        include: { organization: { select: { userId: true } } },
      });

      if (!member || member.organization.userId !== ownerId) {
        return {
          status: false,
          statusCode: HttpStatus.NOT_FOUND,
          message: 'Member not found.',
        };
      }

      await this.prisma.organizationMember.update({
        where: { id: memberId },
        data: { status: 'removed' },
      });

      return {
        status: true,
        statusCode: HttpStatus.OK,
        message: 'Member removed.',
      };
    } catch (error) {
      this.logger.error('removeMember error', error);
      return {
        status: false,
        statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
        message: 'Server error.',
      };
    }
  }

  /**
   * A GUEST user voluntarily leaves an organization.
   */
  async leaveOrganization(userId: string, organizationId: string) {
    try {
      const member = await this.prisma.organizationMember.findUnique({
        where: { userId_organizationId: { userId, organizationId } },
      });

      if (!member || member.status !== 'active') {
        return {
          status: false,
          statusCode: HttpStatus.NOT_FOUND,
          message: 'Active membership not found.',
        };
      }

      await this.prisma.organizationMember.update({
        where: { id: member.id },
        data: { status: 'removed' },
      });

      return {
        status: true,
        statusCode: HttpStatus.OK,
        message: 'You have left the organization.',
      };
    } catch (error) {
      this.logger.error('leaveOrganization error', error);
      return {
        status: false,
        statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
        message: 'Server error.',
      };
    }
  }

  /**
   * Invite a brand-new user (no account yet), create them as GUEST, and immediately
   * add them as a member of the NGO_MEMBER's organization — all in one transaction.
   * A verification OTP is emailed to the new user so they can verify their account.
   */
  async inviteAndAddMember(ownerId: string, dto: InviteAndAddMemberDto) {
    try {
      // Verify owner org exists
      const org = await this.prisma.organization.findUnique({
        where: { userId: ownerId },
      });
      if (!org) {
        return {
          status: false,
          statusCode: HttpStatus.NOT_FOUND,
          message: 'Organization not found.',
        };
      }

      // Reject if the email is already registered
      const existingUser = await this.prisma.user.findUnique({
        where: { email: dto.email },
      });
      if (existingUser) {
        return {
          status: false,
          statusCode: HttpStatus.CONFLICT,
          message:
            'A user with this email already exists. Use the "add existing member" endpoint instead.',
        };
      }

      const otp = generateOtp();
      const otpExpiry = otpExpiresAt(15);
      // Generate a temporary secure password — user must reset via forgot-password flow
      const tempPassword = generateSecureToken();
      const passwordHash = await bcrypt.hash(tempPassword, 12);

      // Create user + membership in a single transaction
      const { newUser, member } = await this.prisma.$transaction(async (tx) => {
        const newUser = await tx.user.create({
          data: {
            email: dto.email,
            fullName: dto.fullName,
            phoneNumber: dto.phoneNumber ?? null,
            passwordHash,
            role: 'GUEST',
            // GUEST accounts are auto-approved so they can access the platform immediately
            status: 'APPROVED',
            isEmailVerified: false,
            otp,
            otpExpiresAt: otpExpiry,
          },
        });

        const member = await tx.organizationMember.create({
          data: {
            organizationId: org.id,
            userId: newUser.id,
            orgRole: dto.orgRole ?? 'member',
            invitedById: ownerId,
          },
          include: MEMBER_INCLUDE,
        });

        return { newUser, member };
      });

      // Fire-and-forget: send OTP verification email
      this.emailService
        .sendVerificationOtp({
          fullName: newUser.fullName,
          email: newUser.email,
          otp,
        })
        .catch((err) =>
          this.logger.error(
            'inviteAndAddMember — sendVerificationOtp failed',
            err,
          ),
        );

      return {
        status: true,
        statusCode: HttpStatus.CREATED,
        message: `Account created and member added. A verification email has been sent to ${dto.email}.`,
        data: member,
      };
    } catch (error) {
      this.logger.error('inviteAndAddMember error', error);
      return {
        status: false,
        statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
        message: 'Server error.',
      };
    }
  }

  /**
   * Get all organizations the authenticated user belongs to as a member.
   */
  async getMyMemberships(userId: string) {
    try {
      const memberships = await this.prisma.organizationMember.findMany({
        where: { userId, status: 'active' },
        include: {
          organization: {
            select: {
              id: true,
              name: true,
              acronym: true,
              logoUrl: true,
              state: true,
              lga: true,
              sectors: true,
              mission: true,
              vision: true,
            },
          },
        },
        orderBy: { joinedAt: 'asc' },
      });

      return {
        status: true,
        statusCode: HttpStatus.OK,
        message: 'Memberships retrieved.',
        data: memberships,
      };
    } catch (error) {
      this.logger.error('getMyMemberships error', error);
      return {
        status: false,
        statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
        message: 'Server error.',
      };
    }
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // ACTIVITIES
  // ─────────────────────────────────────────────────────────────────────────────

  async addActivity(userId: string, dto: CreateActivityDto) {
    try {
      const org = await this.prisma.organization.findUnique({
        where: { userId },
      });
      if (!org) {
        return {
          status: false,
          statusCode: HttpStatus.NOT_FOUND,
          message: 'Organization not found.',
        };
      }

      const activity = await this.prisma.organizationActivity.create({
        data: {
          organizationId: org.id,
          sector: dto.sector,
          who: dto.who,
          where: dto.where,
          when: dto.when,
          activity: dto.activity,
        },
      });

      return {
        status: true,
        statusCode: HttpStatus.CREATED,
        message: 'Activity added.',
        data: activity,
      };
    } catch (error) {
      this.logger.error('addActivity error', error);
      return {
        status: false,
        statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
        message: 'Server error.',
      };
    }
  }

  async updateActivity(
    userId: string,
    activityId: string,
    dto: UpdateActivityDto,
  ) {
    try {
      const activity = await this.prisma.organizationActivity.findUnique({
        where: { id: activityId },
        include: { organization: { select: { userId: true } } },
      });

      if (!activity || activity.organization.userId !== userId) {
        return {
          status: false,
          statusCode: HttpStatus.NOT_FOUND,
          message: 'Activity not found.',
        };
      }

      const updated = await this.prisma.organizationActivity.update({
        where: { id: activityId },
        data: { ...dto },
      });
      return {
        status: true,
        statusCode: HttpStatus.OK,
        message: 'Activity updated.',
        data: updated,
      };
    } catch (error) {
      this.logger.error('updateActivity error', error);
      return {
        status: false,
        statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
        message: 'Server error.',
      };
    }
  }

  async deleteActivity(userId: string, activityId: string) {
    try {
      const activity = await this.prisma.organizationActivity.findUnique({
        where: { id: activityId },
        include: { organization: { select: { userId: true } } },
      });

      if (!activity || activity.organization.userId !== userId) {
        return {
          status: false,
          statusCode: HttpStatus.NOT_FOUND,
          message: 'Activity not found.',
        };
      }

      await this.prisma.organizationActivity.delete({
        where: { id: activityId },
      });
      return {
        status: true,
        statusCode: HttpStatus.OK,
        message: 'Activity deleted.',
      };
    } catch (error) {
      this.logger.error('deleteActivity error', error);
      return {
        status: false,
        statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
        message: 'Server error.',
      };
    }
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // DONORS
  // ─────────────────────────────────────────────────────────────────────────────

  async addDonor(userId: string, dto: CreateDonorDto) {
    try {
      const org = await this.prisma.organization.findUnique({
        where: { userId },
      });
      if (!org) {
        return {
          status: false,
          statusCode: HttpStatus.NOT_FOUND,
          message: 'Organization not found.',
        };
      }

      const donor = await this.prisma.organizationDonor.create({
        data: {
          organizationId: org.id,
          donor: dto.donor,
          amount: dto.amount,
          duration: dto.duration,
        },
      });

      return {
        status: true,
        statusCode: HttpStatus.CREATED,
        message: 'Donor added.',
        data: donor,
      };
    } catch (error) {
      this.logger.error('addDonor error', error);
      return {
        status: false,
        statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
        message: 'Server error.',
      };
    }
  }

  async updateDonor(userId: string, donorId: string, dto: UpdateDonorDto) {
    try {
      const donor = await this.prisma.organizationDonor.findUnique({
        where: { id: donorId },
        include: { organization: { select: { userId: true } } },
      });

      if (!donor || donor.organization.userId !== userId) {
        return {
          status: false,
          statusCode: HttpStatus.NOT_FOUND,
          message: 'Donor record not found.',
        };
      }

      const updated = await this.prisma.organizationDonor.update({
        where: { id: donorId },
        data: { ...dto },
      });
      return {
        status: true,
        statusCode: HttpStatus.OK,
        message: 'Donor updated.',
        data: updated,
      };
    } catch (error) {
      this.logger.error('updateDonor error', error);
      return {
        status: false,
        statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
        message: 'Server error.',
      };
    }
  }

  async deleteDonor(userId: string, donorId: string) {
    try {
      const donor = await this.prisma.organizationDonor.findUnique({
        where: { id: donorId },
        include: { organization: { select: { userId: true } } },
      });

      if (!donor || donor.organization.userId !== userId) {
        return {
          status: false,
          statusCode: HttpStatus.NOT_FOUND,
          message: 'Donor record not found.',
        };
      }

      await this.prisma.organizationDonor.delete({ where: { id: donorId } });
      return {
        status: true,
        statusCode: HttpStatus.OK,
        message: 'Donor deleted.',
      };
    } catch (error) {
      this.logger.error('deleteDonor error', error);
      return {
        status: false,
        statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
        message: 'Server error.',
      };
    }
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // ASSESSMENTS
  // ─────────────────────────────────────────────────────────────────────────────

  async addAssessment(userId: string, dto: CreateAssessmentDto) {
    try {
      const org = await this.prisma.organization.findUnique({
        where: { userId },
      });
      if (!org) {
        return {
          status: false,
          statusCode: HttpStatus.NOT_FOUND,
          message: 'Organization not found.',
        };
      }

      const assessment = await this.prisma.organizationAssessment.create({
        data: {
          organizationId: org.id,
          assessmentBody: dto.assessmentBody,
          month: dto.month,
          year: dto.year,
        },
      });

      return {
        status: true,
        statusCode: HttpStatus.CREATED,
        message: 'Assessment added.',
        data: assessment,
      };
    } catch (error) {
      this.logger.error('addAssessment error', error);
      return {
        status: false,
        statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
        message: 'Server error.',
      };
    }
  }

  async getMyAssessments(userId: string) {
    try {
      const org = await this.prisma.organization.findUnique({
        where: { userId },
      });

      if (!org) {
        return {
          status: false,
          statusCode: HttpStatus.NOT_FOUND,
          message: 'Organization not found.',
        };
      }

      const assessments = await this.prisma.organizationAssessment.findMany({
        where: {
          organizationId: org.id,
        },
        orderBy: [{ year: 'desc' }, { month: 'desc' }],
      });

      return {
        status: true,
        statusCode: HttpStatus.OK,
        data: assessments,
      };
    } catch (error) {
      this.logger.error('getMyAssessments error', error);
      return {
        status: false,
        statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
        message: 'Server error.',
      };
    }
  }

  async updateAssessment(
    userId: string,
    assessmentId: string,
    dto: UpdateAssessmentDto,
  ) {
    try {
      const assessment = await this.prisma.organizationAssessment.findUnique({
        where: { id: assessmentId },
        include: { organization: { select: { userId: true } } },
      });

      if (!assessment || assessment.organization.userId !== userId) {
        return {
          status: false,
          statusCode: HttpStatus.NOT_FOUND,
          message: 'Assessment not found.',
        };
      }

      const updated = await this.prisma.organizationAssessment.update({
        where: { id: assessmentId },
        data: { ...dto },
      });
      return {
        status: true,
        statusCode: HttpStatus.OK,
        message: 'Assessment updated.',
        data: updated,
      };
    } catch (error) {
      this.logger.error('updateAssessment error', error);
      return {
        status: false,
        statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
        message: 'Server error.',
      };
    }
  }

  async deleteAssessment(userId: string, assessmentId: string) {
    try {
      const assessment = await this.prisma.organizationAssessment.findUnique({
        where: { id: assessmentId },
        include: { organization: { select: { userId: true } } },
      });

      if (!assessment || assessment.organization.userId !== userId) {
        return {
          status: false,
          statusCode: HttpStatus.NOT_FOUND,
          message: 'Assessment not found.',
        };
      }

      await this.prisma.organizationAssessment.delete({
        where: { id: assessmentId },
      });
      return {
        status: true,
        statusCode: HttpStatus.OK,
        message: 'Assessment deleted.',
      };
    } catch (error) {
      this.logger.error('deleteAssessment error', error);
      return {
        status: false,
        statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
        message: 'Server error.',
      };
    }
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // DASHBOARD
  // ─────────────────────────────────────────────────────────────────────────────

  /**
   * Returns a summary dashboard for the authenticated NGO_MEMBER's organization:
   *   - Profile completion %
   *   - Activity count
   *   - ODA assessment count
   *   - Points earned by the owner
   *   - Badge count earned by the owner
   *   - Up to 10 upcoming (non-cancelled) events
   *   - Up to 10 most recent program activities
   */
  async getDashboard(userId: string) {
    try {
      // ── 1. Load org + owner + counts in parallel ──────────────────────────
      const org = await this.prisma.organization.findUnique({
        where: { userId },
        include: {
          _count: {
            select: {
              activities: true,
              odaAssessments: true,
            },
          },
          user: {
            select: {
              pointsCount: true,
              badges: { select: { id: true } },
            },
          },
        },
      });

      if (!org) {
        return {
          status: false,
          statusCode: HttpStatus.NOT_FOUND,
          message: 'Organization profile not found.',
        };
      }

      // ── 2. Profile completion ─────────────────────────────────────────────
      // Each field contributes 1 point; completion = filled / total × 100
      const COMPLETION_FIELDS: Array<{ key: keyof typeof org; label: string }> =
        [
          { key: 'name', label: 'Name' },
          { key: 'acronym', label: 'Acronym' },
          { key: 'phoneNumber', label: 'Phone' },
          { key: 'publicEmail', label: 'Public email' },
          { key: 'state', label: 'State' },
          { key: 'lga', label: 'LGA' },
          { key: 'address', label: 'Address' },
          { key: 'description', label: 'Description' },
          { key: 'logoUrl', label: 'Logo' },
          { key: 'mission', label: 'Mission' },
          { key: 'vision', label: 'Vision' },
          { key: 'numberOfStaff', label: 'Staff count' },
          { key: 'numberOfVolunteers', label: 'Volunteer count' },
          { key: 'annualBudget', label: 'Annual budget' },
        ];

      const sectorsFilled =
        Array.isArray(org.sectors) && org.sectors.length > 0;
      const socialsFilled =
        Array.isArray(org.socials) && (org.socials as any[]).length > 0;

      const filledCount =
        COMPLETION_FIELDS.filter(({ key }) => {
          const v = org[key];
          return v !== null && v !== undefined && v !== '';
        }).length +
        (sectorsFilled ? 1 : 0) +
        (socialsFilled ? 1 : 0);

      const totalFields = COMPLETION_FIELDS.length + 2; // +sectors +socials
      const profileCompletion = Math.round((filledCount / totalFields) * 100);

      // ── 3. Upcoming events (next 10, soonest first) ───────────────────────
      const upcomingEvents = await this.prisma.event.findMany({
        where: {
          isPast: false,
          isCancelled: false,
          startTime: { gt: new Date() },
        },
        orderBy: { startTime: 'asc' },
        take: 10,
        select: {
          id: true,
          title: true,
          description: true,
          startTime: true,
          endTime: true,
          coverImageUrl: true,
          externalMeetingUrl: true,
          capacity: true,
          tags: true,
        },
      });

      // ── 4. Recent activities (latest 10) ─────────────────────────────────
      const recentActivities = await this.prisma.organizationActivity.findMany({
        where: { organizationId: org.id },
        orderBy: { createdAt: 'desc' },
        take: 10,
        select: {
          id: true,
          sector: true,
          who: true,
          where: true,
          when: true,
          activity: true,
          createdAt: true,
        },
      });

      return {
        status: true,
        statusCode: HttpStatus.OK,
        message: 'Dashboard retrieved.',
        data: {
          profileCompletion,
          activityCount: org._count.activities,
          assessmentCount: org._count.odaAssessments,
          pointsEarned: org.user.pointsCount,
          badgeCount: org.user.badges.length,
          upcomingEvents,
          recentActivities,
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
}
