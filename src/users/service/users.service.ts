/* eslint-disable @typescript-eslint/no-unused-vars */
import { Injectable, HttpStatus, Logger } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcrypt';
import { Role } from '@prisma/client';

import {
  CreateUserDto,
  LoginDto,
  ForgotPasswordDto,
  VerifyOtpDto,
  ResetPasswordDto,
  UpdateProfileDto,
  UpdateOrganizationDto,
} from '../dto/users.dto';
import { PrismaService } from 'src/prisma.service';
import { EmailService } from 'src/providers/email/email.service';
import { AzureBlobService } from 'src/providers/azure/azure.blob.service';
import {
  generateOtp,
  generateSecureToken,
  isExpired,
  otpExpiresAt,
} from 'src/util/helper';

const ADMIN_ROLES: Role[] = [
  Role.SUPER_ADMIN,
  Role.CONTENT_ADMIN,
  Role.EVENT_ADMIN,
  Role.RESOURCE_ADMIN,
];

@Injectable()
export class UserService {
  private readonly logger = new Logger(UserService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
    private readonly emailService: EmailService,
    private readonly azureBlob: AzureBlobService,
    private readonly config: ConfigService,
  ) {}

  // ─────────────────────────────────────────────────────────────────────────────
  // REGISTRATION
  // ─────────────────────────────────────────────────────────────────────────────

  async createUser(dto: CreateUserDto) {
    // ── Pre-flight checks ─────────────────────────────────────────────────────

    if (ADMIN_ROLES.includes(dto.role)) {
      return {
        status: false,
        statusCode: HttpStatus.FORBIDDEN,
        message: 'Admin accounts cannot be self-registered.',
      };
    }

    const existing = await this.prisma.user.findUnique({
      where: { email: dto.email },
    });
    if (existing) {
      return {
        status: false,
        statusCode: HttpStatus.CONFLICT,
        message: 'An account with this email already exists.',
      };
    }

    // Compute heavy values before opening any transaction
    const passwordHash = await bcrypt.hash(dto.password, 12);
    const otp = generateOtp();
    const otpExpiry = otpExpiresAt(15);

    // ── Transaction: pure DB writes only, no network I/O ─────────────────────
    let createdUser: any;
    try {
      createdUser = await this.prisma.$transaction(async (tx) => {
        const user = await tx.user.create({
          data: {
            email: dto.email,
            fullName: dto.fullName,
            phoneNumber: dto.phoneNumber,
            passwordHash,
            role: dto.role,
            otp,
            otpExpiresAt: otpExpiry,
            // Guests are auto-approved; all others require admin approval
            status: dto.role === Role.GUEST ? 'APPROVED' : 'PENDING',
            // Expert fields
            title: dto.role === Role.EXPERT ? dto.title : null,
            yearsOfExperience:
              dto.role === Role.EXPERT ? dto.yearsOfExperience : null,
            areasOfExpertise:
              dto.role === Role.EXPERT ? dto.areasOfExpertise : [],
          },
        });

        // If NGO, create the associated Organization
        if (dto.role === Role.NGO_MEMBER) {
          await tx.organization.create({
            data: {
              name: dto.orgName!,
              cacNumber: dto.cacNumber!,
              phoneNumber: dto.orgPhoneNumber!,
              state: dto.state!,
              lga: dto.lga!,
              address: dto.address!,
              userId: user.id,
            },
          });
        }
        return user;
      });
    } catch (error) {
      this.logger.error('createUser error', error);
      return {
        status: false,
        statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
        message: 'Server error. Could not create account.',
      };
    }

    // ── Post-commit: fire-and-forget emails ───────────────────────────────────
    this.emailService
      .sendVerificationOtp({
        fullName: createdUser.fullName,
        email: createdUser.email,
        otp,
      })
      .catch((err) => this.logger.error('sendVerificationOtp failed', err));

    if (dto.role !== Role.GUEST) {
      this.prisma.user
        .findMany({
          where: { role: Role.SUPER_ADMIN, status: 'APPROVED' },
          select: { email: true },
        })
        .then((superAdmins) =>
          Promise.allSettled(
            superAdmins.map((admin) =>
              this.emailService.sendAdminApprovalNotification({
                adminEmail: admin.email,
                applicantName: createdUser.fullName,
                applicantEmail: createdUser.email,
                role: createdUser.role,
                adminDashboardUrl: `${this.config.get('ADMIN_DASHBOARD_URL')}/users/${createdUser.id}`,
              }),
            ),
          ),
        )
        .catch((err) =>
          this.logger.error('sendAdminApprovalNotification failed', err),
        );
    }

    return {
      status: true,
      statusCode: HttpStatus.CREATED,
      message:
        dto.role === Role.GUEST
          ? 'Account created. Please verify your email.'
          : 'Registration submitted. Please verify your email and await admin approval.',
      data: {
        id: createdUser.id,
        email: createdUser.email,
        role: createdUser.role,
      },
    };
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // EMAIL VERIFICATION
  // ─────────────────────────────────────────────────────────────────────────────

  async verifyEmail(dto: VerifyOtpDto) {
    try {
      const user = await this.prisma.user.findUnique({
        where: { email: dto.email },
      });

      if (!user) {
        return {
          status: false,
          statusCode: HttpStatus.NOT_FOUND,
          message: 'Account not found.',
        };
      }

      if (user.otp !== dto.otp) {
        return {
          status: false,
          statusCode: HttpStatus.BAD_REQUEST,
          message: 'Invalid OTP.',
        };
      }

      if (user.otpExpiresAt && isExpired(user.otpExpiresAt)) {
        return {
          status: false,
          statusCode: HttpStatus.BAD_REQUEST,
          message: 'OTP has expired. Please request a new one.',
        };
      }

      await this.prisma.user.update({
        where: { email: dto.email },
        data: { otp: null, otpExpiresAt: null, isEmailVerified: true },
      });

      return {
        status: true,
        statusCode: HttpStatus.OK,
        message:
          user.status === 'PENDING'
            ? 'Email verified. Your account is awaiting admin approval.'
            : 'Email verified successfully.',
      };
    } catch (error) {
      this.logger.error('verifyEmail error', error);
      return {
        status: false,
        statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
        message: 'Server error.',
      };
    }
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // LOGIN
  // ─────────────────────────────────────────────────────────────────────────────

  async login(dto: LoginDto) {
    try {
      const user = await this.prisma.user.findUnique({
        where: { email: dto.email },
        include: { organization: true },
      });

      if (!user || !(await bcrypt.compare(dto.password, user.passwordHash))) {
        return {
          status: false,
          statusCode: HttpStatus.UNAUTHORIZED,
          message: 'Invalid email or password.',
        };
      }

      if (!user.isEmailVerified) {
        return {
          status: false,
          statusCode: HttpStatus.FORBIDDEN,
          message: 'Please verify your email before logging in.',
        };
      }

      const statusMessages: Record<string, string> = {
        PENDING: 'Your account is awaiting admin approval.',
        REJECTED:
          'Your account application has been rejected. Please contact support.',
        SUSPENDED: 'Your account has been suspended. Please contact support.',
      };

      if (statusMessages[user.status]) {
        return {
          status: false,
          statusCode: HttpStatus.FORBIDDEN,
          message: statusMessages[user.status],
        };
      }

      const payload = { sub: user.id, email: user.email, role: user.role };
      const token = this.jwtService.sign(payload);

      const { passwordHash, otp, otpExpiresAt, ...safeUser } = user as any;

      return {
        status: true,
        statusCode: HttpStatus.OK,
        message: 'Login successful.',
        data: { token, user: safeUser },
      };
    } catch (error) {
      this.logger.error('login error', error);
      return {
        status: false,
        statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
        message: 'Server error.',
      };
    }
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // FORGOT PASSWORD
  // ─────────────────────────────────────────────────────────────────────────────

  async forgotPassword(dto: ForgotPasswordDto) {
    try {
      const user = await this.prisma.user.findUnique({
        where: { email: dto.email },
      });

      // Always return success to prevent user enumeration
      if (!user) {
        return {
          status: true,
          statusCode: HttpStatus.OK,
          message: 'If this email is registered, a reset OTP has been sent.',
        };
      }

      const resetToken = generateSecureToken();
      const tokenExpiry = otpExpiresAt(60);

      await this.prisma.user.update({
        where: { email: dto.email },
        data: {
          resetPasswordToken: resetToken,
          resetPasswordExpiresAt: tokenExpiry,
        },
      });

      const resetUrl = `${this.config.get('FRONTEND_URL')}/reset-password?token=${resetToken}&email=${user.email}`;

      await this.emailService.sendPasswordResetOtp({
        fullName: user.fullName,
        email: user.email,
        resetUrl,
      });

      return {
        status: true,
        statusCode: HttpStatus.OK,
        message: 'If this email is registered, a reset OTP has been sent.',
      };
    } catch (error) {
      this.logger.error('forgotPassword error', error);
      return {
        status: false,
        statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
        message: 'Server error.',
      };
    }
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // RESET PASSWORD
  // ─────────────────────────────────────────────────────────────────────────────

  async resetPassword(dto: ResetPasswordDto) {
    try {
      const user = await this.prisma.user.findUnique({
        where: { email: dto.email },
      });

      if (!user || user.resetPasswordToken !== dto.token) {
        return {
          status: false,
          statusCode: HttpStatus.BAD_REQUEST,
          message: 'Invalid reset token.',
        };
      }

      if (
        user.resetPasswordExpiresAt &&
        isExpired(user.resetPasswordExpiresAt)
      ) {
        return {
          status: false,
          statusCode: HttpStatus.BAD_REQUEST,
          message: 'Token expired.',
        };
      }

      const passwordHash = await bcrypt.hash(dto.password, 12);

      await this.prisma.user.update({
        where: { email: dto.email },
        data: {
          passwordHash,
          resetPasswordToken: null,
          resetPasswordExpiresAt: null,
        },
      });

      return {
        status: true,
        statusCode: HttpStatus.OK,
        message: 'Password reset successful. Please login.',
      };
    } catch (error) {
      this.logger.error('resetPassword error', error);
      return {
        status: false,
        statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
        message: 'Server error.',
      };
    }
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // PROFILE
  // ─────────────────────────────────────────────────────────────────────────────

  async getProfile(id: string) {
    try {
      const user = await this.prisma.user.findUnique({
        where: { id },
        include: {
          organization: true,
          badges: true,
        },
      });

      if (!user) {
        return {
          status: false,
          statusCode: HttpStatus.NOT_FOUND,
          message: 'User not found.',
        };
      }

      const { passwordHash, otp, otpExpiresAt, ...safeUser } = user as any;

      return {
        status: true,
        statusCode: HttpStatus.OK,
        message: 'Profile retrieved.',
        data: safeUser,
      };
    } catch (error) {
      this.logger.error('getProfile error', error);
      return {
        status: false,
        statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
        message: 'Server error.',
      };
    }
  }

  async updateProfile(id: string, dto: UpdateProfileDto) {
    try {
      const user = await this.prisma.user.update({
        where: { id },
        data: { ...dto },
      });

      const { passwordHash, otp, otpExpiresAt, ...safeUser } = user as any;
      return {
        status: true,
        statusCode: HttpStatus.OK,
        message: 'Profile updated.',
        data: safeUser,
      };
    } catch (error) {
      this.logger.error('updateProfile error', error);
      return {
        status: false,
        statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
        message: 'Server error.',
      };
    }
  }

  async getUserOrganizations(userId: string) {
    try {
      const user = await this.prisma.user.findUnique({
        where: { id: userId },
        include: {
          organization: true,
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
        data: user.organization,
      };
    } catch (error) {
      this.logger.error('getUserOrganization error', error);
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
  // AVATAR UPLOAD
  // ─────────────────────────────────────────────────────────────────────────────

  async uploadAvatar(userId: string, file: Express.Multer.File) {
    try {
      const user = await this.prisma.user.findUnique({ where: { id: userId } });
      if (!user) {
        return {
          status: false,
          statusCode: HttpStatus.NOT_FOUND,
          message: 'User not found.',
        };
      }

      // Remove old avatar from Azure if it exists
      if (user.avatarUrl) {
        await this.azureBlob.delete(user.avatarUrl, 'avatars');
      }

      const avatarUrl = await this.azureBlob.upload(file, 'avatars');

      await this.prisma.user.update({
        where: { id: userId },
        data: { avatarUrl },
      });

      return {
        status: true,
        statusCode: HttpStatus.OK,
        message: 'Avatar uploaded.',
        avatarUrl,
      };
    } catch (error) {
      this.logger.error('uploadAvatar error', error);
      return {
        status: false,
        statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
        message: 'Server error.',
      };
    }
  }

  async seedSuperAdmin(dto: {
    email: string;
    password: string;
    fullName: string;
    seedSecret: string;
  }) {
    // Guard against accidental exposure — requires a server-side secret
    const expected = this.config.get<string>('SEED_SECRET');
    if (!expected || dto.seedSecret !== expected) {
      return {
        status: false,
        statusCode: HttpStatus.FORBIDDEN,
        message: 'Invalid seed secret.',
      };
    }

    const existing = await this.prisma.user.findFirst({
      where: { role: Role.SUPER_ADMIN },
    });

    if (existing) {
      return {
        status: false,
        statusCode: HttpStatus.CONFLICT,
        message:
          'A Super Admin account already exists. Use the assign-permissions endpoint to manage access.',
      };
    }

    const passwordHash = await bcrypt.hash(dto.password, 12);

    const superAdmin = await this.prisma.user.create({
      data: {
        email: dto.email,
        fullName: dto.fullName,
        passwordHash,
        role: Role.SUPER_ADMIN,
        status: 'APPROVED',
        isEmailVerified: true,
      },
    });

    this.logger.warn(`Super Admin seeded: ${superAdmin.email}`);

    return {
      status: true,
      statusCode: HttpStatus.CREATED,
      message: 'Super Admin created successfully.',
      data: { id: superAdmin.id, email: superAdmin.email },
    };
  }
  // ─────────────────────────────────────────────────────────────────────────────

  // ─────────────────────────────────────────────────────────────────────────────
  // ADMIN: APPROVE / REJECT / SUSPEND / DELETE
  // ─────────────────────────────────────────────────────────────────────────────

  async approveUser(adminId: string, userId: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });

    if (!user) {
      return {
        status: false,
        statusCode: HttpStatus.NOT_FOUND,
        message: 'User not found.',
      };
    }

    if (!user.isEmailVerified) {
      return {
        status: false,
        statusCode: HttpStatus.BAD_REQUEST,
        message:
          'Cannot approve this account. The user has not verified their email address yet.',
      };
    }

    return this._updateUserStatus(adminId, userId, 'APPROVED');
  }

  async rejectUser(adminId: string, userId: string, reason?: string) {
    return this._updateUserStatus(adminId, userId, 'REJECTED', reason);
  }

  async suspendUser(adminId: string, userId: string) {
    return this._updateUserStatus(adminId, userId, 'SUSPENDED');
  }

  private async _updateUserStatus(
    adminId: string,
    userId: string,
    status: 'APPROVED' | 'REJECTED' | 'SUSPENDED',
    reason?: string,
  ) {
    try {
      const user = await this.prisma.user.findUnique({ where: { id: userId } });
      if (!user) {
        return {
          status: false,
          statusCode: HttpStatus.NOT_FOUND,
          message: 'User not found.',
        };
      }

      await this.prisma.$transaction([
        this.prisma.user.update({ where: { id: userId }, data: { status } }),
        this.prisma.auditLog.create({
          data: {
            action: `USER_${status}`,
            entity: 'User',
            entityId: userId,
            details: reason ? { reason } : undefined,
            adminId,
          },
        }),
      ]);

      // Send email notification for approval/rejection
      if (status === 'APPROVED' || status === 'REJECTED') {
        await this.emailService.sendAccountStatusNotification({
          fullName: user.fullName,
          email: user.email,
          status,
          reason,
        });

        if (status === 'APPROVED') {
          await this.emailService.sendWelcomeEmail({
            fullName: user.fullName,
            email: user.email,
            loginUrl: this.config.get('APP_LOGIN_URL') ?? '#',
          });
        }
      }

      const label = status.charAt(0) + status.slice(1).toLowerCase();
      return {
        status: true,
        statusCode: HttpStatus.OK,
        message: `User ${label} successfully.`,
      };
    } catch (error) {
      this.logger.error(`_updateUserStatus (${status}) error`, error);
      return {
        status: false,
        statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
        message: 'Server error.',
      };
    }
  }

  async deleteUser(adminId: string, userId: string) {
    try {
      const user = await this.prisma.user.findUnique({ where: { id: userId } });
      if (!user) {
        return {
          status: false,
          statusCode: HttpStatus.NOT_FOUND,
          message: 'User not found.',
        };
      }

      await this.prisma.$transaction([
        this.prisma.user.delete({ where: { id: userId } }),
        this.prisma.auditLog.create({
          data: {
            action: 'USER_DELETED',
            entity: 'User',
            entityId: userId,
            details: { email: user.email, role: user.role },
            adminId,
          },
        }),
      ]);

      return {
        status: true,
        statusCode: HttpStatus.OK,
        message: 'User deleted successfully.',
      };
    } catch (error) {
      this.logger.error('deleteUser error', error);
      return {
        status: false,
        statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
        message: 'Server error.',
      };
    }
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // ADMIN: LIST USERS
  // ─────────────────────────────────────────────────────────────────────────────

  async listUsers(query: {
    role?: Role;
    status?: string;
    page?: number;
    limit?: number;
  }) {
    try {
      const page = query.page ?? 1;
      const limit = query.limit ?? 20;
      const skip = (page - 1) * limit;

      const where: any = {};
      if (query.role) where.role = query.role;
      if (query.status) where.status = query.status;

      const [users, total] = await this.prisma.$transaction([
        this.prisma.user.findMany({
          where,
          skip,
          take: limit,
          include: {
            organization: true,
            badges: true,
          },
          orderBy: { createdAt: 'desc' },
        }),
        this.prisma.user.count({ where }),
      ]);

      const safeUsers = users.map(
        ({ passwordHash, otp, otpExpiresAt, ...u }: any) => u,
      );

      return {
        status: true,
        statusCode: HttpStatus.OK,
        message: 'Users retrieved.',
        data: {
          users: safeUsers,
          total,
          page,
          limit,
          pages: Math.ceil(total / limit),
        },
      };
    } catch (error) {
      this.logger.error('listUsers error', error);
      return {
        status: false,
        statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
        message: 'Server error.',
      };
    }
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // ADMIN: ASSIGN PERMISSIONS
  // ─────────────────────────────────────────────────────────────────────────────

  async revokePermissions(
    superAdminId: string,
    targetAdminId: string,
    permissionsToRevoke: string[],
  ) {
    try {
      const targetUser = await this.prisma.user.findUnique({
        where: { id: targetAdminId },
        include: { adminPermission: true },
      });

      if (!targetUser) {
        return {
          status: false,
          statusCode: HttpStatus.NOT_FOUND,
          message: 'Target user not found.',
        };
      }

      if (!ADMIN_ROLES.includes(targetUser.role)) {
        return {
          status: false,
          statusCode: HttpStatus.BAD_REQUEST,
          message: 'Permissions can only be managed on admin roles.',
        };
      }

      const current = targetUser.adminPermission?.permissions ?? [];
      const updated = current.filter((p) => !permissionsToRevoke.includes(p));

      await this.prisma.adminPermission.upsert({
        where: { userId: targetAdminId },
        create: { userId: targetAdminId, permissions: updated },
        update: { permissions: updated },
      });

      await this.prisma.auditLog.create({
        data: {
          action: 'PERMISSIONS_REVOKED',
          entity: 'User',
          entityId: targetAdminId,
          details: { revoked: permissionsToRevoke, remaining: updated },
          adminId: superAdminId,
        },
      });

      return {
        status: true,
        statusCode: HttpStatus.OK,
        message: 'Permissions revoked successfully.',
        data: { userId: targetAdminId, remainingPermissions: updated },
      };
    } catch (error) {
      this.logger.error('revokePermissions error', error);
      return {
        status: false,
        statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
        message: 'Server error.',
      };
    }
  }

  async assignPermissions(
    superAdminId: string,
    targetAdminId: string,
    permissions: string[],
  ) {
    try {
      const targetUser = await this.prisma.user.findUnique({
        where: { id: targetAdminId },
      });

      if (!targetUser) {
        return {
          status: false,
          statusCode: HttpStatus.NOT_FOUND,
          message: 'Target user not found.',
        };
      }

      if (!ADMIN_ROLES.includes(targetUser.role)) {
        return {
          status: false,
          statusCode: HttpStatus.BAD_REQUEST,
          message: 'Permissions can only be assigned to admin roles.',
        };
      }

      await this.prisma.adminPermission.upsert({
        where: { userId: targetAdminId },
        create: { userId: targetAdminId, permissions },
        update: { permissions },
      });

      await this.prisma.auditLog.create({
        data: {
          action: 'PERMISSIONS_UPDATED',
          entity: 'User',
          entityId: targetAdminId,
          details: { permissions },
          adminId: superAdminId,
        },
      });

      return {
        status: true,
        statusCode: HttpStatus.OK,
        message: 'Permissions updated successfully.',
        data: { userId: targetAdminId, permissions },
      };
    } catch (error) {
      this.logger.error('assignPermissions error', error);
      return {
        status: false,
        statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
        message: 'Server error.',
      };
    }
  }
}
