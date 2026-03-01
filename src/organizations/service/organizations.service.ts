import { Injectable, HttpStatus, Logger } from '@nestjs/common';
import { PrismaService } from 'src/prisma.service';
import {
  CreateOrganizationDto,
  UpdateOrganizationDto,
  AssignUsersToOrgDto,
  RemoveUsersFromOrgDto,
} from '../dto/organizations.dto';
import { AzureBlobService } from 'src/providers/azure/azure.blob.service';

@Injectable()
export class OrganizationService {
  private readonly logger = new Logger(OrganizationService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly azureBlob: AzureBlobService,
  ) {}

  // ─────────────────────────────────────────────────────────────────────────────
  // CREATE
  // ─────────────────────────────────────────────────────────────────────────────

  async createOrganization(adminId: string, dto: CreateOrganizationDto) {
    try {
      const existing = await this.prisma.organization.findUnique({
        where: { cacNumber: dto.cacNumber },
      });

      if (existing) {
        return {
          status: false,
          statusCode: HttpStatus.CONFLICT,
          message: 'An organization with this CAC number already exists.',
        };
      }

      const org = await this.prisma.organization.create({
        data: {
          name: dto.name,
          cacNumber: dto.cacNumber,
          sector: dto.sector,
          state: dto.state,
          website: dto.website,
          description: dto.description,
        },
      });

      await this.prisma.auditLog.create({
        data: {
          action: 'ORG_CREATED',
          entity: 'Organization',
          entityId: org.id,
          details: { name: org.name, cacNumber: org.cacNumber },
          adminId,
        },
      });

      return {
        status: true,
        statusCode: HttpStatus.CREATED,
        message: 'Organization created successfully.',
        data: org,
      };
    } catch (error) {
      this.logger.error('createOrganization error', error);
      return {
        status: false,
        statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
        message: 'Server error.',
      };
    }
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // READ
  // ─────────────────────────────────────────────────────────────────────────────

  async listOrganizations(query: {
    sector?: string;
    state?: string;
    search?: string;
    page?: number;
    limit?: number;
  }) {
    try {
      const page = query.page ?? 1;
      const limit = query.limit ?? 20;
      const skip = (page - 1) * limit;

      const where: any = {};
      if (query.sector) where.sector = query.sector;
      if (query.state) where.state = query.state;
      if (query.search) {
        where.OR = [
          { name: { contains: query.search, mode: 'insensitive' } },
          { cacNumber: { contains: query.search, mode: 'insensitive' } },
        ];
      }

      const [organizations, total] = await this.prisma.$transaction([
        this.prisma.organization.findMany({
          where,
          skip,
          take: limit,
          include: {
            members: {
              select: {
                id: true,
                fullName: true,
                email: true,
                role: true,
                avatarUrl: true,
              },
            },
          },
          orderBy: { createdAt: 'desc' },
        }),
        this.prisma.organization.count({ where }),
      ]);

      return {
        status: true,
        statusCode: HttpStatus.OK,
        message: 'Organizations retrieved.',
        data: {
          organizations,
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

  async getOrganization(id: string) {
    try {
      const org = await this.prisma.organization.findUnique({
        where: { id },
        include: {
          members: {
            select: {
              id: true,
              fullName: true,
              email: true,
              role: true,
              status: true,
              avatarUrl: true,
            },
          },
          odaForms: {
            select: {
              id: true,
              buildingBlock: true,
              status: true,
              indicatorScore: true,
              createdAt: true,
            },
          },
        },
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
      this.logger.error('getOrganization error', error);
      return {
        status: false,
        statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
        message: 'Server error.',
      };
    }
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // UPDATE
  // ─────────────────────────────────────────────────────────────────────────────

  async updateOrganization(
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
        data: { ...dto },
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
      this.logger.error('updateOrganization error', error);
      return {
        status: false,
        statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
        message: 'Server error.',
      };
    }
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // DELETE
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

      await this.prisma.$transaction([
        // Disconnect all members before deleting
        this.prisma.organization.update({
          where: { id },
          data: { members: { set: [] } },
        }),
        this.prisma.organization.delete({ where: { id } }),
        this.prisma.auditLog.create({
          data: {
            action: 'ORG_DELETED',
            entity: 'Organization',
            entityId: id,
            details: { name: org.name, cacNumber: org.cacNumber },
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

  async uploadLogo(adminId: string, orgId: string, file: Express.Multer.File) {
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
      this.logger.error('uploadLogo error', error);
      return {
        status: false,
        statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
        message: 'Server error.',
      };
    }
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // USER ASSIGNMENT
  // ─────────────────────────────────────────────────────────────────────────────

  async assignUsers(adminId: string, orgId: string, dto: AssignUsersToOrgDto) {
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

      // Verify all userIds exist
      const users = await this.prisma.user.findMany({
        where: { id: { in: dto.userIds } },
        select: { id: true, fullName: true, email: true },
      });

      const foundIds = users.map((u) => u.id);
      const missingIds = dto.userIds.filter((id) => !foundIds.includes(id));

      if (missingIds.length > 0) {
        return {
          status: false,
          statusCode: HttpStatus.BAD_REQUEST,
          message: `The following user IDs were not found: ${missingIds.join(', ')}`,
        };
      }

      await this.prisma.organization.update({
        where: { id: orgId },
        data: {
          members: {
            connect: dto.userIds.map((id) => ({ id })),
          },
        },
      });

      await this.prisma.auditLog.create({
        data: {
          action: 'ORG_USERS_ASSIGNED',
          entity: 'Organization',
          entityId: orgId,
          details: {
            assignedUsers: users.map((u) => ({ id: u.id, email: u.email })),
          },
          adminId,
        },
      });

      return {
        status: true,
        statusCode: HttpStatus.OK,
        message: `${users.length} user(s) assigned to organization successfully.`,
        data: { assignedUsers: users },
      };
    } catch (error) {
      this.logger.error('assignUsers error', error);
      return {
        status: false,
        statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
        message: 'Server error.',
      };
    }
  }

  async removeUsers(
    adminId: string,
    orgId: string,
    dto: RemoveUsersFromOrgDto,
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

      await this.prisma.organization.update({
        where: { id: orgId },
        data: {
          members: {
            disconnect: dto.userIds.map((id) => ({ id })),
          },
        },
      });

      await this.prisma.auditLog.create({
        data: {
          action: 'ORG_USERS_REMOVED',
          entity: 'Organization',
          entityId: orgId,
          details: { removedUserIds: dto.userIds },
          adminId,
        },
      });

      return {
        status: true,
        statusCode: HttpStatus.OK,
        message: `${dto.userIds.length} user(s) removed from organization successfully.`,
      };
    } catch (error) {
      this.logger.error('removeUsers error', error);
      return {
        status: false,
        statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
        message: 'Server error.',
      };
    }
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // LIST MEMBERS
  // ─────────────────────────────────────────────────────────────────────────────

  async getOrganizationMembers(orgId: string) {
    try {
      const org = await this.prisma.organization.findUnique({
        where: { id: orgId },
        include: {
          members: {
            select: {
              id: true,
              fullName: true,
              email: true,
              role: true,
              status: true,
              avatarUrl: true,
              createdAt: true,
            },
          },
        },
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
        message: 'Members retrieved.',
        data: {
          organizationId: orgId,
          members: org.members,
          total: org.members.length,
        },
      };
    } catch (error) {
      this.logger.error('getOrganizationMembers error', error);
      return {
        status: false,
        statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
        message: 'Server error.',
      };
    }
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // GET USER'S ORGANIZATIONS
  // ─────────────────────────────────────────────────────────────────────────────

  async getUserOrganizations(userId: string) {
    try {
      const user = await this.prisma.user.findUnique({
        where: { id: userId },
        include: {
          organizations: {
            select: {
              id: true,
              name: true,
              cacNumber: true,
              sector: true,
              state: true,
              logoUrl: true,
              isSpotlight: true,
              createdAt: true,
            },
          },
        },
      });

      if (!user) {
        return {
          status: false,
          statusCode: HttpStatus.NOT_FOUND,
          message: 'User not found.',
        };
      }

      return {
        status: true,
        statusCode: HttpStatus.OK,
        message: 'User organizations retrieved.',
        data: user.organizations,
      };
    } catch (error) {
      this.logger.error('getUserOrganizations error', error);
      return {
        status: false,
        statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
        message: 'Server error.',
      };
    }
  }
}
