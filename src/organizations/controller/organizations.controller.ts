import {
  Controller,
  Get,
  Patch,
  Post,
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
  ApiParam,
  ApiQuery,
  ApiConsumes,
  ApiBody,
} from '@nestjs/swagger';
import { Role } from '@prisma/client';

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
  InviteAndAddMemberDto,
  UpdateMemberRoleDto,
  OrganizationResponseDto,
  OrganizationSummaryResponseDto,
  MemberResponseDto,
  OrgDashboardResponseDto,
} from '../dto/organizations.dto';
import { OrganizationService } from '../service/organizations.service';

import { JwtAuthGuard } from 'src/common/guards/jwt-auth.guard';
import { RolesGuard } from 'src/common/guards/roles.guard';
import { PermissionsGuard } from 'src/common/guards/permissions.guard';
import { Roles } from 'src/common/decorators/roles.decorator';
import { Permissions } from 'src/common/decorators/permissions.decorator';
import { CurrentUser } from 'src/common/decorators/current-user.decorator';
import { PERMISSIONS } from 'src/common/constants/permissions';

const LOGO_PIPE = new ParseFilePipe({
  validators: [
    new MaxFileSizeValidator({ maxSize: 2 * 1024 * 1024 }),
    new FileTypeValidator({ fileType: /^image\/(jpeg|png|webp|svg\+xml)$/ }),
  ],
});

@ApiTags('Organizations')
@Controller('organizations')
export class OrganizationController {
  constructor(private readonly orgService: OrganizationService) {}

  // ─────────────────────────────────────────────────────────────────────────────
  // PUBLIC / AUTHENTICATED — DIRECTORY
  // ─────────────────────────────────────────────────────────────────────────────

  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @Get()
  @ApiOperation({
    summary: 'Browse the NGO directory',
    description:
      'Returns a summary list. Supports search, sector filter, state filter, and pagination.',
  })
  @ApiQuery({
    name: 'search',
    required: false,
    description: 'Search by name, acronym, or CAC number',
  })
  @ApiQuery({ name: 'sector', required: false, example: 'Health' })
  @ApiQuery({ name: 'state', required: false, example: 'Lagos' })
  @ApiQuery({ name: 'page', required: false, example: 1 })
  @ApiQuery({ name: 'limit', required: false, example: 20 })
  @ApiResponse({
    status: 200,
    type: OrganizationSummaryResponseDto,
    isArray: true,
  })
  listOrganizations(@Query() query: OrgQueryDto) {
    return this.orgService.listOrganizations(query);
  }

  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @Get('my-memberships')
  @ApiOperation({
    summary: 'List all organizations I belong to as a member',
    description:
      'Available to any authenticated user. Returns orgs where the user has an active membership.',
  })
  getMyMemberships(@CurrentUser() user: any) {
    return this.orgService.getMyMemberships(user.id);
  }

  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @Delete('my-memberships/:organizationId')
  @ApiOperation({ summary: 'Leave an organization I am a member of' })
  @ApiParam({ name: 'organizationId', description: 'Organization UUID' })
  leaveOrganizationEarly(
    @CurrentUser() user: any,
    @Param('organizationId', ParseUUIDPipe) organizationId: string,
  ) {
    return this.orgService.leaveOrganization(user.id, organizationId);
  }

  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @Get(':id')
  @ApiOperation({ summary: 'Get full organization profile by ID' })
  @ApiParam({ name: 'id', description: 'Organization UUID' })
  @ApiResponse({ status: 200, type: OrganizationResponseDto })
  getOrganization(@Param('id', ParseUUIDPipe) id: string) {
    return this.orgService.getOrganizationById(id);
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // NGO_MEMBER — OWN ORGANIZATION PROFILE
  // ─────────────────────────────────────────────────────────────────────────────

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.NGO_MEMBER)
  @ApiBearerAuth()
  @Get('me/dashboard')
  @ApiOperation({
    summary: 'Get my organization dashboard overview (NGO_MEMBER)',
    description:
      'Returns profile completion %, activity/assessment counts, points & badges earned, ' +
      'up to 10 upcoming events, and the 10 most recent program activities.',
  })
  @ApiResponse({ status: 200, type: OrgDashboardResponseDto })
  getMyDashboard(@CurrentUser() user: any) {
    return this.orgService.getDashboard(user.id);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.NGO_MEMBER, Role.SUPER_ADMIN)
  @ApiBearerAuth()
  @Get('me/profile')
  @ApiOperation({ summary: 'Get my full organization profile (NGO_MEMBER)' })
  @ApiResponse({ status: 200, type: OrganizationResponseDto })
  getMyOrg(@CurrentUser() user: any) {
    return this.orgService.getMyOrganization(user.id);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.NGO_MEMBER)
  @ApiBearerAuth()
  @Patch('me/profile')
  @ApiOperation({
    summary: 'Update my organization profile (NGO_MEMBER)',
    description: 'All fields are optional. Partial updates supported.',
  })
  @ApiResponse({ status: 200, type: OrganizationResponseDto })
  updateMyOrg(@CurrentUser() user: any, @Body() dto: UpdateOrganizationDto) {
    return this.orgService.updateMyOrganization(user.id, dto);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.NGO_MEMBER)
  @ApiBearerAuth()
  @Post('me/logo')
  @UseInterceptors(FileInterceptor('file'))
  @ApiOperation({
    summary: 'Upload my organization logo (max 2MB, JPEG/PNG/WebP/SVG)',
  })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: { file: { type: 'string', format: 'binary' } },
    },
  })
  uploadLogo(
    @CurrentUser() user: any,
    @UploadedFile(LOGO_PIPE) file: Express.Multer.File,
  ) {
    return this.orgService.uploadLogo(user.id, file);
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // NGO_MEMBER — MEMBER MANAGEMENT
  // ─────────────────────────────────────────────────────────────────────────────

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.NGO_MEMBER)
  @ApiBearerAuth()
  @Get('me/members')
  @ApiOperation({ summary: 'List all active members of my organization' })
  @ApiResponse({ status: 200, type: MemberResponseDto, isArray: true })
  listMembers(@CurrentUser() user: any) {
    return this.orgService.listMembers(user.id);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.NGO_MEMBER)
  @ApiBearerAuth()
  @Post('me/members')
  @ApiOperation({
    summary: 'Add a GUEST user as a member of my organization',
    description: 'Target user must have GUEST role and APPROVED status.',
  })
  @ApiResponse({ status: 201, type: MemberResponseDto })
  addMember(@CurrentUser() user: any, @Body() dto: AddMemberDto) {
    return this.orgService.addMember(user.id, dto);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.NGO_MEMBER)
  @ApiBearerAuth()
  @Post('me/members/invite')
  @ApiOperation({
    summary: 'Invite a new user and add them as a member (NGO_MEMBER)',
    description:
      'Creates a new GUEST account for a user who is not yet on the platform, ' +
      'then immediately adds them as a member of your organization. ' +
      'A verification OTP is sent to their email. ' +
      'If the email is already registered, use POST me/members instead.',
  })
  @ApiResponse({ status: 201, type: MemberResponseDto })
  inviteAndAddMember(
    @CurrentUser() user: any,
    @Body() dto: InviteAndAddMemberDto,
  ) {
    return this.orgService.inviteAndAddMember(user.id, dto);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.NGO_MEMBER)
  @ApiBearerAuth()
  @Patch('me/members/:memberId')
  @ApiOperation({ summary: "Update a member's role within my organization" })
  @ApiParam({ name: 'memberId', description: 'OrganizationMember UUID' })
  updateMemberRole(
    @CurrentUser() user: any,
    @Param('memberId', ParseUUIDPipe) memberId: string,
    @Body() dto: UpdateMemberRoleDto,
  ) {
    return this.orgService.updateMemberRole(user.id, memberId, dto);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.NGO_MEMBER)
  @ApiBearerAuth()
  @Delete('me/members/:memberId')
  @ApiOperation({ summary: 'Remove a member from my organization' })
  @ApiParam({ name: 'memberId', description: 'OrganizationMember UUID' })
  removeMember(
    @CurrentUser() user: any,
    @Param('memberId', ParseUUIDPipe) memberId: string,
  ) {
    return this.orgService.removeMember(user.id, memberId);
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // NGO_MEMBER — ACTIVITIES
  // ─────────────────────────────────────────────────────────────────────────────

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.NGO_MEMBER)
  @ApiBearerAuth()
  @Post('me/activities')
  @ApiOperation({ summary: 'Add a program/activity to my organization' })
  addActivity(@CurrentUser() user: any, @Body() dto: CreateActivityDto) {
    return this.orgService.addActivity(user.id, dto);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.NGO_MEMBER)
  @ApiBearerAuth()
  @Patch('me/activities/:id')
  @ApiOperation({ summary: 'Update an activity record' })
  @ApiParam({ name: 'id', description: 'Activity UUID' })
  updateActivity(
    @CurrentUser() user: any,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateActivityDto,
  ) {
    return this.orgService.updateActivity(user.id, id, dto);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.NGO_MEMBER)
  @ApiBearerAuth()
  @Delete('me/activities/:id')
  @ApiOperation({ summary: 'Delete an activity record' })
  @ApiParam({ name: 'id', description: 'Activity UUID' })
  deleteActivity(
    @CurrentUser() user: any,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.orgService.deleteActivity(user.id, id);
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // NGO_MEMBER — DONORS
  // ─────────────────────────────────────────────────────────────────────────────

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.NGO_MEMBER)
  @ApiBearerAuth()
  @Post('me/donors')
  @ApiOperation({ summary: 'Add a donor/funder record to my organization' })
  addDonor(@CurrentUser() user: any, @Body() dto: CreateDonorDto) {
    return this.orgService.addDonor(user.id, dto);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.NGO_MEMBER)
  @ApiBearerAuth()
  @Patch('me/donors/:id')
  @ApiOperation({ summary: 'Update a donor record' })
  @ApiParam({ name: 'id', description: 'Donor UUID' })
  updateDonor(
    @CurrentUser() user: any,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateDonorDto,
  ) {
    return this.orgService.updateDonor(user.id, id, dto);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.NGO_MEMBER)
  @ApiBearerAuth()
  @Delete('me/donors/:id')
  @ApiOperation({ summary: 'Delete a donor record' })
  @ApiParam({ name: 'id', description: 'Donor UUID' })
  deleteDonor(
    @CurrentUser() user: any,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.orgService.deleteDonor(user.id, id);
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // NGO_MEMBER — ASSESSMENTS
  // ─────────────────────────────────────────────────────────────────────────────

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.NGO_MEMBER)
  @ApiBearerAuth()
  @Post('me/assessments')
  @ApiOperation({
    summary: 'Add an external assessment record to my organization',
  })
  addAssessment(@CurrentUser() user: any, @Body() dto: CreateAssessmentDto) {
    return this.orgService.addAssessment(user.id, dto);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.NGO_MEMBER)
  @ApiBearerAuth()
  @Patch('me/assessments/:id')
  @ApiOperation({ summary: 'Update an assessment record' })
  @ApiParam({ name: 'id', description: 'Assessment UUID' })
  updateAssessment(
    @CurrentUser() user: any,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateAssessmentDto,
  ) {
    return this.orgService.updateAssessment(user.id, id, dto);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.NGO_MEMBER)
  @ApiBearerAuth()
  @Delete('me/assessments/:id')
  @ApiOperation({ summary: 'Delete an assessment record' })
  @ApiParam({ name: 'id', description: 'Assessment UUID' })
  deleteAssessment(
    @CurrentUser() user: any,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.orgService.deleteAssessment(user.id, id);
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // SUPER ADMIN — MANAGE ANY ORGANIZATION
  // ─────────────────────────────────────────────────────────────────────────────

  @UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard)
  @Roles(Role.SUPER_ADMIN)
  @Permissions(PERMISSIONS.ORG_UPDATE)
  @ApiBearerAuth()
  @Patch(':id')
  @ApiOperation({
    summary: 'Admin: Update any organization by ID',
    description: 'Same field set as the owner update. All fields optional.',
  })
  @ApiParam({ name: 'id', description: 'Organization UUID' })
  @ApiResponse({ status: 200, type: OrganizationResponseDto })
  updateOrganization(
    @CurrentUser() admin: any,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateOrganizationDto,
  ) {
    return this.orgService.updateOrganizationByAdmin(admin.id, id, dto);
  }

  @UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard)
  @Roles(Role.SUPER_ADMIN)
  @Permissions(PERMISSIONS.ORG_UPDATE)
  @ApiBearerAuth()
  @Post(':id/logo')
  @UseInterceptors(FileInterceptor('file'))
  @ApiOperation({ summary: 'Admin: Upload logo for any organization' })
  @ApiParam({ name: 'id', description: 'Organization UUID' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: { file: { type: 'string', format: 'binary' } },
    },
  })
  uploadLogoAdmin(
    @CurrentUser() admin: any,
    @Param('id', ParseUUIDPipe) id: string,
    @UploadedFile(LOGO_PIPE) file: Express.Multer.File,
  ) {
    return this.orgService.uploadLogoByAdmin(admin.id, id, file);
  }

  @UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard)
  @Roles(Role.SUPER_ADMIN)
  @Permissions(PERMISSIONS.ORG_DELETE)
  @ApiBearerAuth()
  @Delete(':id')
  @ApiOperation({
    summary: 'Admin: Permanently delete an organization',
    description:
      'Cascades to activities, donors, assessments, and members. Also removes Azure logo.',
  })
  @ApiParam({ name: 'id', description: 'Organization UUID' })
  deleteOrganization(
    @CurrentUser() admin: any,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.orgService.deleteOrganization(admin.id, id);
  }
}
