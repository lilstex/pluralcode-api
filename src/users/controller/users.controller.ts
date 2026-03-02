/* eslint-disable @typescript-eslint/no-unused-vars */
import {
  Controller,
  Post,
  Get,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
  UseInterceptors,
  UploadedFile,
  ParseFilePipe,
  MaxFileSizeValidator,
  FileTypeValidator,
  ParseUUIDPipe,
  HttpStatus,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiBody,
  ApiParam,
  ApiQuery,
  ApiConsumes,
} from '@nestjs/swagger';
import { Role } from '@prisma/client';

import {
  CreateUserDto,
  ResetPasswordDto,
  UpdateProfileDto,
  SignUpResponseDto,
  LoginResponseDto,
  UserResponseDto,
  ForgotPasswordResponseDto,
  DeleteUserResponseDto,
  UploadAvatarResponseDto,
  LoginDto,
  VerifyOtpDto,
  ForgotPasswordDto,
  UpdateOrganizationDto,
} from '../dto/users.dto';
import { UserService } from '../service/users.service';

import { JwtAuthGuard } from 'src/common/guards/jwt-auth.guard';
import { RolesGuard } from 'src/common/guards/roles.guard';
import { PermissionsGuard } from 'src/common/guards/permissions.guard';
import { Roles } from 'src/common/decorators/roles.decorator';
import { Permissions } from 'src/common/decorators/permissions.decorator';
import { CurrentUser } from 'src/common/decorators/current-user.decorator';
import { PERMISSIONS } from 'src/common/constants/permissions';

const multerMemoryStorage = { storage: undefined }; // Uses memoryStorage by default in NestJS

@ApiTags('Users & Authentication')
@Controller('users')
export class UserController {
  constructor(private readonly userService: UserService) {}

  // ─────────────────────────────────────────────────────────────────────────────
  // PUBLIC AUTH ROUTES
  // ─────────────────────────────────────────────────────────────────────────────

  @Post('signup')
  @ApiOperation({
    summary: 'Register a new user (Guest, NGO Member, or Expert)',
    description:
      'NGOs require org details. Experts require title/experience. Guests require name/email.',
  })
  @ApiResponse({
    status: 201,
    description: 'Registration successful',
    type: SignUpResponseDto,
  })
  @ApiResponse({
    status: 400,
    description: 'Validation error or duplicate email',
  })
  async signUp(@Body() dto: CreateUserDto) {
    return this.userService.createUser(dto);
  }

  @Post('login')
  @ApiOperation({ summary: 'Authenticate and receive a JWT token' })
  @ApiResponse({
    status: 200,
    description: 'Login successful',
    type: LoginResponseDto,
  })
  @ApiResponse({ status: 401, description: 'Invalid credentials' })
  async login(@Body() dto: LoginDto) {
    return this.userService.login(dto);
  }

  @Post('verify-email')
  @ApiOperation({
    summary: 'Verify email address using OTP sent at registration',
  })
  @ApiResponse({ status: 200, description: 'Email verified' })
  async verifyEmail(@Body() dto: VerifyOtpDto) {
    return this.userService.verifyEmail(dto);
  }

  @Post('forgot-password')
  @ApiOperation({ summary: 'Request a password reset OTP' })
  @ApiResponse({
    status: 200,
    description: 'OTP dispatched if email exists',
    type: ForgotPasswordResponseDto,
  })
  async forgotPassword(@Body() dto: ForgotPasswordDto) {
    return this.userService.forgotPassword(dto);
  }

  @Post('reset-password')
  @ApiOperation({
    summary: 'Reset password using OTP from forgot-password flow',
  })
  @ApiResponse({ status: 200, description: 'Password reset successful' })
  async resetPassword(@Body() dto: ResetPasswordDto) {
    return this.userService.resetPassword(dto);
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // AUTHENTICATED USER ROUTES
  // ─────────────────────────────────────────────────────────────────────────────

  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @Get('profile')
  @ApiOperation({ summary: 'Get the current authenticated user profile' })
  @ApiResponse({
    status: 200,
    description: 'Profile retrieved',
    type: UserResponseDto,
  })
  async getProfile(@CurrentUser() user: any) {
    return this.userService.getProfile(user.id);
  }

  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @Patch('profile')
  @ApiOperation({ summary: 'Update the current authenticated user profile' })
  @ApiResponse({
    status: 200,
    description: 'Profile updated',
    type: UserResponseDto,
  })
  async updateProfile(@CurrentUser() user: any, @Body() dto: UpdateProfileDto) {
    return this.userService.updateProfile(user.id, dto);
  }

  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @Post('profile/avatar')
  @UseInterceptors(FileInterceptor('file'))
  @ApiOperation({
    summary: 'Upload a profile avatar image to Azure Blob Storage',
  })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: { file: { type: 'string', format: 'binary' } },
    },
  })
  @ApiResponse({
    status: 200,
    description: 'Avatar uploaded',
    type: UploadAvatarResponseDto,
  })
  async uploadAvatar(
    @CurrentUser() user: any,
    @UploadedFile(
      new ParseFilePipe({
        validators: [
          new MaxFileSizeValidator({ maxSize: 2 * 1024 * 1024 }), // 2MB
          new FileTypeValidator({ fileType: /^image\/(jpeg|png|webp)$/ }),
        ],
      }),
    )
    file: Express.Multer.File,
  ) {
    return this.userService.uploadAvatar(user.id, file);
  }

  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @ApiBearerAuth()
  @Get('profile/organization')
  @ApiOperation({
    summary: 'Get the organization owned by the current NGO user',
  })
  async getMyOrganizations(@CurrentUser() user: any) {
    return this.userService.getUserOrganizations(user.id);
  }

  @UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard)
  @Roles(Role.NGO_MEMBER, Role.SUPER_ADMIN)
  @ApiBearerAuth()
  @Patch('organization/:id')
  @ApiOperation({ summary: 'Update organization details' })
  @ApiParam({ name: 'id', description: 'Organization UUID' })
  async updateOrganization(
    @CurrentUser() admin: any,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateOrganizationDto,
  ) {
    return this.userService.updateOrganization(admin.id, id, dto);
  }

  @UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard)
  @Roles(Role.NGO_MEMBER, Role.SUPER_ADMIN)
  @ApiBearerAuth()
  @Post(':id/logo')
  @UseInterceptors(FileInterceptor('file'))
  @ApiOperation({
    summary: 'Upload organization logo to Azure Blob Storage',
  })
  @ApiParam({ name: 'id', description: 'Organization UUID' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: { file: { type: 'string', format: 'binary' } },
    },
  })
  async uploadLogo(
    @CurrentUser() admin: any,
    @Param('id', ParseUUIDPipe) id: string,
    @UploadedFile(
      new ParseFilePipe({
        validators: [
          new MaxFileSizeValidator({ maxSize: 2 * 1024 * 1024 }),
          new FileTypeValidator({
            fileType: /^image\/(jpeg|png|webp|svg\+xml)$/,
          }),
        ],
      }),
    )
    file: Express.Multer.File,
  ) {
    return this.userService.uploadLogo(admin.id, id, file);
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // ADMIN: USER MANAGEMENT
  // ─────────────────────────────────────────────────────────────────────────────

  @UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard)
  @Roles(
    Role.SUPER_ADMIN,
    Role.CONTENT_ADMIN,
    Role.EVENT_ADMIN,
    Role.RESOURCE_ADMIN,
  )
  @Permissions(PERMISSIONS.USER_READ)
  @ApiBearerAuth()
  @Get()
  @ApiOperation({ summary: 'Admin: List all users with optional filters' })
  @ApiQuery({ name: 'role', enum: Role, required: false })
  @ApiQuery({
    name: 'status',
    required: false,
    enum: ['PENDING', 'APPROVED', 'REJECTED', 'SUSPENDED'],
  })
  @ApiQuery({ name: 'page', required: false, example: 1 })
  @ApiQuery({ name: 'limit', required: false, example: 20 })
  async listUsers(
    @Query('role') role?: Role,
    @Query('status') status?: string,
    @Query('page') page?: number,
    @Query('limit') limit?: number,
  ) {
    return this.userService.listUsers({ role, status, page, limit });
  }

  @UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard)
  @Roles(Role.SUPER_ADMIN)
  @Permissions(PERMISSIONS.USER_APPROVE)
  @ApiBearerAuth()
  @Patch(':id/approve')
  @ApiOperation({ summary: 'Super Admin: Approve a pending user registration' })
  @ApiParam({ name: 'id', description: 'User UUID' })
  async approveUser(
    @CurrentUser() admin: any,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.userService.approveUser(admin.id, id);
  }

  @UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard)
  @Roles(Role.SUPER_ADMIN)
  @Permissions(PERMISSIONS.USER_APPROVE)
  @ApiBearerAuth()
  @Patch(':id/reject')
  @ApiOperation({ summary: 'Super Admin: Reject a pending user registration' })
  @ApiParam({ name: 'id', description: 'User UUID' })
  async rejectUser(
    @CurrentUser() admin: any,
    @Param('id', ParseUUIDPipe) id: string,
    @Body('reason') reason?: string,
  ) {
    return this.userService.rejectUser(admin.id, id, reason);
  }

  @UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard)
  @Roles(Role.SUPER_ADMIN)
  @Permissions(PERMISSIONS.USER_SUSPEND)
  @ApiBearerAuth()
  @Patch(':id/suspend')
  @ApiOperation({ summary: 'Super Admin: Suspend a user account' })
  @ApiParam({ name: 'id', description: 'User UUID' })
  async suspendUser(
    @CurrentUser() admin: any,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.userService.suspendUser(admin.id, id);
  }

  @UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard)
  @Roles(Role.SUPER_ADMIN)
  @Permissions(PERMISSIONS.USER_DELETE)
  @ApiBearerAuth()
  @Delete(':id')
  @ApiOperation({ summary: 'Super Admin: Permanently delete a user account' })
  @ApiParam({ name: 'id', description: 'User UUID' })
  @ApiResponse({
    status: 200,
    description: 'User deleted',
    type: DeleteUserResponseDto,
  })
  async deleteUser(
    @CurrentUser() admin: any,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.userService.deleteUser(admin.id, id);
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // ADMIN: RBAC PERMISSIONS ASSIGNMENT
  // ─────────────────────────────────────────────────────────────────────────────

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.SUPER_ADMIN)
  @ApiBearerAuth()
  @Patch(':id/permissions')
  @ApiOperation({
    summary:
      'Super Admin: Assign or update fine-grained permissions for an admin user',
    description:
      'Overrides the default role permissions with a custom set. Use permission keys from the PERMISSIONS constant.',
  })
  @ApiParam({ name: 'id', description: 'Target admin User UUID' })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        permissions: {
          type: 'array',
          items: { type: 'string' },
          example: ['event:read', 'event:write', 'user:read'],
        },
      },
    },
  })
  async assignPermissions(
    @CurrentUser() superAdmin: any,
    @Param('id', ParseUUIDPipe) targetAdminId: string,
    @Body('permissions') permissions: string[],
  ) {
    return this.userService.assignPermissions(
      superAdmin.id,
      targetAdminId,
      permissions,
    );
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.SUPER_ADMIN)
  @ApiBearerAuth()
  @Patch(':id/permissions/revoke')
  @ApiOperation({
    summary: 'Super Admin: Revoke specific permissions from an admin user',
    description:
      'Removes only the listed permissions. Permissions not listed are left intact.',
  })
  @ApiParam({ name: 'id', description: 'Target admin User UUID' })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        permissions: {
          type: 'array',
          items: { type: 'string' },
          example: ['event:delete', 'user:read'],
        },
      },
    },
  })
  async revokePermissions(
    @CurrentUser() superAdmin: any,
    @Param('id', ParseUUIDPipe) targetAdminId: string,
    @Body('permissions') permissions: string[],
  ) {
    return this.userService.revokePermissions(
      superAdmin.id,
      targetAdminId,
      permissions,
    );
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // SUPER ADMIN SEEDING (one-time setup, disabled after first use)
  // ─────────────────────────────────────────────────────────────────────────────

  @Post('seed-super-admin')
  @ApiOperation({
    summary: 'One-time Super Admin account creation',
    description:
      'Can only be called once. Requires the SEED_SECRET env variable to match. ' +
      'Disable or remove this endpoint after first use in production.',
  })
  @ApiBody({
    schema: {
      type: 'object',
      required: ['email', 'password', 'fullName', 'seedSecret'],
      properties: {
        email: { type: 'string', example: 'admin@plrcap.org' },
        fullName: { type: 'string', example: 'Platform Administrator' },
        password: { type: 'string', example: 'SuperSecure123!' },
        seedSecret: { type: 'string', example: 'your-seed-secret-from-env' },
      },
    },
  })
  async seedSuperAdmin(
    @Body()
    body: {
      email: string;
      password: string;
      fullName: string;
      seedSecret: string;
    },
  ) {
    return this.userService.seedSuperAdmin(body);
  }
}
