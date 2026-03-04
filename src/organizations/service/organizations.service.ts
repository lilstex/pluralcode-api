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
} from '../dto/organizations.dto';

// Shared include block — used everywhere a full org is returned.
// Avoid top-level as const — Prisma orderBy expects a mutable array, not a readonly tuple.
const ORG_FULL_INCLUDE = {
  activities: { orderBy: { when: 'desc' as const } },
  donors: { orderBy: { createdAt: 'desc' as const } },
  assessments: {
    orderBy: [{ year: 'desc' as const }, { month: 'desc' as const }],
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

// Slimmer include for list endpoints (no extension tables, saves query cost)
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
  website: true,
  createdAt: true,
} as const;

@Injectable()
export class OrganizationService {
  private readonly logger = new Logger(OrganizationService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly azureBlob: AzureBlobService,
  ) {}

  // ─────────────────────────────────────────────────────────────────────────────
  // CORE — READ
  // ─────────────────────────────────────────────────────────────────────────────

  /**
   * Full profile of the org the authenticated NGO_MEMBER owns.
   * Includes activities, donors, assessments.
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
   * Public / admin read: full detail by organization UUID.
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
      const page = Number(query.page ?? 1);
      const limit = Number(query.limit ?? 20);
      const skip = (page - 1) * limit;

      const where: any = {};

      if (query.sector) {
        // sectors is String[] — find orgs where the array contains the value
        where.sectors = { has: query.sector };
      }

      if (query.state) {
        where.state = { contains: query.state, mode: 'insensitive' };
      }

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
  // CORE — UPDATE (owner: NGO_MEMBER updates their own org)
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
          ...(dto.website !== undefined && { website: dto.website }),
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
  // CORE — UPDATE (admin: SUPER_ADMIN or ORG_ADMIN updates any org by id)
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
          ...(dto.website !== undefined && { website: dto.website }),
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
  // CORE — DELETE (admin only)
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

      // Remove logo from Azure if present
      if (org.logoUrl) {
        await this.azureBlob.delete(org.logoUrl, 'avatars');
      }

      await this.prisma.$transaction([
        // Cascade handled by Prisma schema (onDelete: Cascade on extension tables)
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

  /**
   * Owner-scoped: NGO_MEMBER uploads their own org's logo.
   * Looked up by userId (one-to-one relation).
   */
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

      if (org.logoUrl) {
        await this.azureBlob.delete(org.logoUrl, 'avatars');
      }

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

  /**
   * Admin-scoped: upload logo for any org by its UUID.
   */
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

      if (org.logoUrl) {
        await this.azureBlob.delete(org.logoUrl, 'avatars');
      }

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
}
