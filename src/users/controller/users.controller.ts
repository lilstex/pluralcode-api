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
  LoginDto,
  VerifyOtpDto,
  ForgotPasswordDto,
  ResetPasswordDto,
  UpdateProfileDto,
  UpsertExpertProfileDto,
  UpdateUserOrganizationDto,
  SignUpResponseDto,
  LoginResponseDto,
  UserResponseDto,
  ForgotPasswordResponseDto,
  DeleteUserResponseDto,
  UploadAvatarResponseDto,
} from '../dto/users.dto';
import { UserService } from '../service/users.service';

import { JwtAuthGuard } from 'src/common/guards/jwt-auth.guard';
import { RolesGuard } from 'src/common/guards/roles.guard';
import { PermissionsGuard } from 'src/common/guards/permissions.guard';
import { Roles } from 'src/common/decorators/roles.decorator';
import { Permissions } from 'src/common/decorators/permissions.decorator';
import { CurrentUser } from 'src/common/decorators/current-user.decorator';
import { PERMISSIONS } from 'src/common/constants/permissions';

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
      'NGO Members require org details (orgName, cacNumber, orgPhoneNumber, state, lga). ' +
      'Experts require title, phoneNumber, yearsOfExperience, areasOfExpertise.',
  })
  @ApiResponse({ status: 201, type: SignUpResponseDto })
  async signUp(@Body() dto: CreateUserDto) {
    return this.userService.createUser(dto);
  }

  @Post('login')
  @ApiOperation({ summary: 'Authenticate and receive a JWT token' })
  @ApiResponse({ status: 200, type: LoginResponseDto })
  async login(@Body() dto: LoginDto) {
    return this.userService.login(dto);
  }

  @Post('verify-email')
  @ApiOperation({ summary: 'Verify email using OTP sent at registration' })
  async verifyEmail(@Body() dto: VerifyOtpDto) {
    return this.userService.verifyEmail(dto);
  }

  @Post('resend-otp')
  @ApiOperation({
    summary: 'Resend email verification OTP',
    description:
      'Issues a fresh 6-digit OTP to the supplied email if it is registered and not yet verified. ' +
      'Always returns 200 to prevent email enumeration.',
  })
  @ApiBody({
    schema: {
      type: 'object',
      required: ['email'],
      properties: { email: { type: 'string', example: 'john.doe@ngo.org' } },
    },
  })
  async resendOtp(@Body('email') email: string) {
    return this.userService.resendOtp(email);
  }

  @Post('forgot-password')
  @ApiOperation({ summary: 'Request a password reset link via email' })
  @ApiResponse({ status: 200, type: ForgotPasswordResponseDto })
  async forgotPassword(@Body() dto: ForgotPasswordDto) {
    return this.userService.forgotPassword(dto);
  }

  @Post('reset-password')
  @ApiOperation({ summary: 'Reset password using token from the reset link' })
  async resetPassword(@Body() dto: ResetPasswordDto) {
    return this.userService.resetPassword(dto);
  }

  @Post('seed-super-admin')
  @ApiOperation({
    summary: 'One-time Super Admin account creation (disable after first use)',
    description:
      'Requires SEED_SECRET env variable to match. Can only be called once.',
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

  // ─────────────────────────────────────────────────────────────────────────────
  // AUTHENTICATED — OWN PROFILE
  // ─────────────────────────────────────────────────────────────────────────────

  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @Get('profile')
  @ApiOperation({
    summary:
      'Get the current authenticated user profile (includes org or expertProfile)',
  })
  @ApiResponse({ status: 200, type: UserResponseDto })
  async getProfile(@CurrentUser() user: any) {
    return this.userService.getProfile(user.id);
  }

  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @Patch('profile')
  @ApiOperation({ summary: 'Update basic profile (fullName, phoneNumber)' })
  @ApiResponse({ status: 200, type: UserResponseDto })
  async updateProfile(@CurrentUser() user: any, @Body() dto: UpdateProfileDto) {
    return this.userService.updateProfile(user.id, dto);
  }

  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @Post('profile/avatar')
  @UseInterceptors(FileInterceptor('file'))
  @ApiOperation({ summary: 'Upload profile avatar (max 2MB, JPEG/PNG/WebP)' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: { file: { type: 'string', format: 'binary' } },
    },
  })
  @ApiResponse({ status: 200, type: UploadAvatarResponseDto })
  async uploadAvatar(
    @CurrentUser() user: any,
    @UploadedFile(
      new ParseFilePipe({
        validators: [
          new MaxFileSizeValidator({ maxSize: 2 * 1024 * 1024 }),
          new FileTypeValidator({ fileType: /^image\/(jpeg|png|webp)$/ }),
        ],
      }),
    )
    file: Express.Multer.File,
  ) {
    return this.userService.uploadAvatar(user.id, file);
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // AUTHENTICATED — EXPERT PROFILE (EXPERT role only)
  // ─────────────────────────────────────────────────────────────────────────────

  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @Get('profile/expert')
  @ApiOperation({ summary: 'Get your own expert profile (EXPERT role only)' })
  async getMyExpertProfile(@CurrentUser() user: any) {
    return this.userService.getExpertProfile(user.id);
  }

  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @Patch('profile/expert')
  @ApiOperation({
    summary: 'Create or update your expert profile (EXPERT role only)',
    description:
      'All fields are optional — only provided fields are updated. ' +
      'Call this after registration to fill in the full expert profile.',
  })
  async upsertExpertProfile(
    @CurrentUser() user: any,
    @Body() dto: UpsertExpertProfileDto,
  ) {
    return this.userService.upsertExpertProfile(user.id, dto);
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // PUBLIC — EXPERTS DIRECTORY
  // ─────────────────────────────────────────────────────────────────────────────

  @Get('experts')
  @ApiOperation({ summary: 'Browse the experts directory (public)' })
  @ApiQuery({
    name: 'search',
    required: false,
    description: 'Search by name, employer or about text',
  })
  @ApiQuery({
    name: 'expertise',
    required: false,
    description: 'Filter by area of expertise e.g. "Governance"',
  })
  @ApiQuery({ name: 'page', required: false })
  @ApiQuery({ name: 'limit', required: false })
  async listExperts(
    @Query('search') search?: string,
    @Query('expertise') expertise?: string,
    @Query('page') page?: number,
    @Query('limit') limit?: number,
  ) {
    return this.userService.listExperts({ search, expertise, page, limit });
  }

  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @Get('experts/drop-down')
  @ApiOperation({ summary: 'Lists experts in a dropdown' })
  async dropDownListExperts() {
    return this.userService.dropDownListExperts();
  }

  @Get('experts/:userId')
  @ApiOperation({
    summary: 'Get a specific expert profile by user ID (public)',
  })
  @ApiParam({ name: 'userId', description: 'User UUID' })
  async getExpertProfile(@Param('userId', ParseUUIDPipe) userId: string) {
    return this.userService.getExpertProfile(userId);
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // AUTHENTICATED — NGO ORGANIZATION (NGO_MEMBER role)
  // ─────────────────────────────────────────────────────────────────────────────

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.NGO_MEMBER, Role.SUPER_ADMIN)
  @ApiBearerAuth()
  @Get('profile/organization')
  @ApiOperation({
    summary: 'Get the organization owned by the current NGO user (full detail)',
  })
  async getMyOrganization(@CurrentUser() user: any) {
    return this.userService.getUserOrganization(user.id);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.NGO_MEMBER)
  @ApiBearerAuth()
  @Patch('profile/organization')
  @ApiOperation({
    summary: 'Update your organization details (NGO_MEMBER only)',
  })
  async updateOrganization(
    @CurrentUser() user: any,
    @Body() dto: UpdateUserOrganizationDto,
  ) {
    return this.userService.updateOrganization(user.id, dto);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.NGO_MEMBER)
  @ApiBearerAuth()
  @Post('profile/organization/logo')
  @UseInterceptors(FileInterceptor('file'))
  @ApiOperation({
    summary: 'Upload organization logo (max 2MB, JPEG/PNG/WebP/SVG)',
  })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: { file: { type: 'string', format: 'binary' } },
    },
  })
  async uploadLogo(
    @CurrentUser() user: any,
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
    return this.userService.uploadLogo(user.id, file);
  }

  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @Get('guests')
  @ApiOperation({ summary: 'Drop down list of all guest users' })
  async guestUsersList() {
    return this.userService.guestUsersList();
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
    Role.NGO_MEMBER,
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
  @ApiQuery({
    name: 'search',
    required: false,
    description: 'Search by fullName or email',
  })
  @ApiQuery({ name: 'page', required: false })
  @ApiQuery({ name: 'limit', required: false })
  async listUsers(
    @Query('role') role?: Role,
    @Query('status') status?: string,
    @Query('search') search?: string,
    @Query('page') page?: number,
    @Query('limit') limit?: number,
  ) {
    return this.userService.listUsers({ role, status, search, page, limit });
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
  @ApiResponse({ status: 200, type: DeleteUserResponseDto })
  async deleteUser(
    @CurrentUser() admin: any,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.userService.deleteUser(admin.id, id);
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // ADMIN: RBAC PERMISSIONS
  // ─────────────────────────────────────────────────────────────────────────────

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.SUPER_ADMIN)
  @ApiBearerAuth()
  @Patch(':id/permissions')
  @ApiOperation({
    summary: 'Super Admin: Assign or override permissions for an admin user',
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
  })
  @ApiParam({ name: 'id', description: 'Target admin User UUID' })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        permissions: {
          type: 'array',
          items: { type: 'string' },
          example: ['event:delete'],
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
}
