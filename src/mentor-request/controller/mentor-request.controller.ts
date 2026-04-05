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
  ParseUUIDPipe,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiParam,
} from '@nestjs/swagger';
import { Role } from '@prisma/client';

import {
  CreateMentorRequestDto,
  UpdateMentorRequestDto,
  RespondToMentorRequestDto,
  AdminUpdateMentorRequestDto,
  ListMentorRequestsQueryDto,
  MentorRequestListResponseDto,
  MentorRequestSingleResponseDto,
  MentorRequestActionResponseDto,
} from '../dto/mentor-request.dto';
import { MentorRequestService } from '../service/mentor-request.service';

import { JwtAuthGuard } from 'src/common/guards/jwt-auth.guard';
import { RolesGuard } from 'src/common/guards/roles.guard';
import { Roles } from 'src/common/decorators/roles.decorator';
import { CurrentUser } from 'src/common/decorators/current-user.decorator';

@ApiTags('Mentor Requests')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('mentor-requests')
export class MentorRequestController {
  constructor(private readonly mentorRequestService: MentorRequestService) {}

  // ─────────────────────────────────────────────────────────────────────────────
  // NGO/GUEST ROUTES  (role: NGO_MEMBER)
  // ─────────────────────────────────────────────────────────────────────────────

  @Post()
  @UseGuards(RolesGuard)
  @Roles(Role.NGO_MEMBER, Role.GUEST)
  @ApiOperation({
    summary: 'Submit a mentor request',
    description:
      'NGO submits a mentorship request to a specific expert. ' +
      'Duplicate PENDING or APPROVED requests to the same mentor are rejected. ' +
      'acceptedTerms must be true.',
  })
  @ApiResponse({ status: 201, type: MentorRequestActionResponseDto })
  async create(@CurrentUser() user: any, @Body() dto: CreateMentorRequestDto) {
    return this.mentorRequestService.createRequest(user.id, dto);
  }

  @Get('my')
  @UseGuards(RolesGuard)
  @Roles(Role.NGO_MEMBER, Role.GUEST)
  @ApiOperation({
    summary: 'List own mentor requests',
    description:
      'Returns all mentor requests submitted by the authenticated user.',
  })
  @ApiResponse({ status: 200, type: MentorRequestListResponseDto })
  async getMyRequests(
    @CurrentUser() user: any,
    @Query() query: ListMentorRequestsQueryDto,
  ) {
    return this.mentorRequestService.getMyRequestsAsNgo(user.id, query);
  }

  @Get('my/:id')
  @UseGuards(RolesGuard)
  @Roles(Role.NGO_MEMBER, Role.GUEST)
  @ApiOperation({ summary: 'Get a specific own mentor request (NGO view)' })
  @ApiParam({ name: 'id', type: String })
  @ApiResponse({ status: 200, type: MentorRequestSingleResponseDto })
  async getMyRequestById(
    @CurrentUser() user: any,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.mentorRequestService.getMyRequestById(user.id, id);
  }

  @Patch('my/:id')
  @UseGuards(RolesGuard)
  @Roles(Role.NGO_MEMBER, Role.GUEST)
  @ApiOperation({
    summary: 'Edit a pending mentor request',
    description: 'Only PENDING requests can be edited.',
  })
  @ApiParam({ name: 'id', type: String })
  @ApiResponse({ status: 200, type: MentorRequestActionResponseDto })
  async updateMyRequest(
    @CurrentUser() user: any,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateMentorRequestDto,
  ) {
    return this.mentorRequestService.updateRequest(user.id, id, dto);
  }

  @Delete('my/:id')
  @UseGuards(RolesGuard)
  @Roles(Role.NGO_MEMBER, Role.GUEST)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Cancel (withdraw) a pending mentor request',
    description: 'Deletes the request. Only PENDING requests can be cancelled.',
  })
  @ApiParam({ name: 'id', type: String })
  @ApiResponse({ status: 200, type: MentorRequestActionResponseDto })
  async cancelMyRequest(
    @CurrentUser() user: any,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.mentorRequestService.cancelRequest(user.id, id);
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // EXPERT ROUTES  (role: EXPERT)
  // ─────────────────────────────────────────────────────────────────────────────

  @Get('incoming')
  @UseGuards(RolesGuard)
  @Roles(Role.EXPERT)
  @ApiOperation({
    summary: 'List incoming mentor requests (Expert view)',
    description: 'Returns all requests directed at the authenticated expert.',
  })
  @ApiResponse({ status: 200, type: MentorRequestListResponseDto })
  async getIncoming(
    @CurrentUser() user: any,
    @Query() query: ListMentorRequestsQueryDto,
  ) {
    return this.mentorRequestService.getIncomingRequests(user.id, query);
  }

  @Get('incoming/:id')
  @UseGuards(RolesGuard)
  @Roles(Role.EXPERT)
  @ApiOperation({ summary: 'View a specific incoming request (Expert)' })
  @ApiParam({ name: 'id', type: String })
  @ApiResponse({ status: 200, type: MentorRequestSingleResponseDto })
  async getIncomingById(
    @CurrentUser() user: any,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.mentorRequestService.getIncomingRequestById(user.id, id);
  }

  @Patch('incoming/:id/respond')
  @UseGuards(RolesGuard)
  @Roles(Role.EXPERT)
  @ApiOperation({
    summary: 'Accept or decline an incoming request (Expert)',
    description:
      'Expert sets action to "APPROVED" or "DECLINED". ' +
      'An optional message is sent to the NGO on decline.',
  })
  @ApiParam({ name: 'id', type: String })
  @ApiResponse({ status: 200, type: MentorRequestActionResponseDto })
  async respond(
    @CurrentUser() user: any,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: RespondToMentorRequestDto,
  ) {
    return this.mentorRequestService.respondToRequest(user.id, id, dto);
  }

  @Patch('incoming/:id/complete')
  @UseGuards(RolesGuard)
  @Roles(Role.EXPERT)
  @ApiOperation({
    summary: 'Mark an active mentorship as completed (Expert)',
    description: 'Only APPROVED mentorships can be marked as completed.',
  })
  @ApiParam({ name: 'id', type: String })
  @ApiResponse({ status: 200, type: MentorRequestActionResponseDto })
  async complete(
    @CurrentUser() user: any,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.mentorRequestService.completeRequest(user.id, id);
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // ADMIN ROUTES  (role: SUPER_ADMIN)
  // ─────────────────────────────────────────────────────────────────────────────

  @Get('admin')
  @UseGuards(RolesGuard)
  @Roles(Role.SUPER_ADMIN)
  @ApiOperation({ summary: '[Admin] List all mentor requests' })
  @ApiResponse({ status: 200, type: MentorRequestListResponseDto })
  async adminList(@Query() query: ListMentorRequestsQueryDto) {
    return this.mentorRequestService.adminListAll(query);
  }

  @Get('admin/stats')
  @UseGuards(RolesGuard)
  @Roles(Role.SUPER_ADMIN)
  @ApiOperation({ summary: '[Admin] Mentor request status counts' })
  async adminStats() {
    return this.mentorRequestService.getStats();
  }

  @Get('admin/:id')
  @UseGuards(RolesGuard)
  @Roles(Role.SUPER_ADMIN)
  @ApiOperation({ summary: '[Admin] Get any mentor request by ID' })
  @ApiParam({ name: 'id', type: String })
  @ApiResponse({ status: 200, type: MentorRequestSingleResponseDto })
  async adminGetById(@Param('id', ParseUUIDPipe) id: string) {
    return this.mentorRequestService.adminGetById(id);
  }

  @Patch('admin/:id/status')
  @UseGuards(RolesGuard)
  @Roles(Role.SUPER_ADMIN)
  @ApiOperation({
    summary: '[Admin] Override the status of any mentor request',
  })
  @ApiParam({ name: 'id', type: String })
  @ApiResponse({ status: 200, type: MentorRequestActionResponseDto })
  async adminUpdateStatus(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: AdminUpdateMentorRequestDto,
  ) {
    return this.mentorRequestService.adminUpdateStatus(id, dto);
  }

  @Delete('admin/:id')
  @UseGuards(RolesGuard)
  @Roles(Role.SUPER_ADMIN)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '[Admin] Hard-delete a mentor request' })
  @ApiParam({ name: 'id', type: String })
  @ApiResponse({ status: 200, type: MentorRequestActionResponseDto })
  async adminDelete(@Param('id', ParseUUIDPipe) id: string) {
    return this.mentorRequestService.adminDelete(id);
  }
}
