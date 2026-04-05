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
  Res,
  Req,
  HttpStatus,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Response, Request } from 'express';
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
  CreateEventDto,
  UpdateEventDto,
  EventQueryDto,
  CancelEventDto,
  EventStatus,
  EventResponseDto,
  JitsiTokenResponseDto,
  GuestRegisterEventDto,
} from '../dto/events.dto';
import { EventService } from '../service/events.service';

import { JwtAuthGuard } from 'src/common/guards/jwt-auth.guard';
import { OptionalJwtGuard } from 'src/common/guards/optional-jwt.guard';
import { RolesGuard } from 'src/common/guards/roles.guard';
import { PermissionsGuard } from 'src/common/guards/permissions.guard';
import { Roles } from 'src/common/decorators/roles.decorator';
import { Permissions } from 'src/common/decorators/permissions.decorator';
import { CurrentUser } from 'src/common/decorators/current-user.decorator';
import { PERMISSIONS } from 'src/common/constants/permissions';
import { UserService } from 'src/users/service/users.service';

@ApiTags('Events & Webinars')
@Controller('events')
export class EventController {
  constructor(
    private readonly eventService: EventService,
    private readonly userService: UserService,
  ) {}

  // ─────────────────────────────────────────────────────────────────────────────
  // STATIC ROUTES — must precede :id wildcard
  // ─────────────────────────────────────────────────────────────────────────────

  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @Get('my/registrations')
  @ApiOperation({
    summary: 'Get all events the current user has registered for',
  })
  @ApiQuery({ name: 'page', required: false })
  @ApiQuery({ name: 'limit', required: false })
  async getMyRegistrations(
    @CurrentUser() user: any,
    @Query('page') page?: number,
    @Query('limit') limit?: number,
  ) {
    return this.eventService.getMyRegistrations(user.id, { page, limit });
  }

  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @Get('my/created')
  @ApiOperation({
    summary: 'Get all events created by the current user (NGO, Expert, Admin)',
    description:
      'Returns events where createdById matches the authenticated user. Supports status filter.',
  })
  @ApiQuery({ name: 'status', enum: EventStatus, required: false })
  @ApiQuery({ name: 'page', required: false })
  @ApiQuery({ name: 'limit', required: false })
  async getMyCreatedEvents(
    @CurrentUser() user: any,
    @Query('status') status?: EventStatus,
    @Query('page') page?: number,
    @Query('limit') limit?: number,
  ) {
    return this.eventService.getMyCreatedEvents(user.id, {
      status,
      page,
      limit,
    });
  }

  @Post('join')
  @ApiOperation({
    summary: 'Get a Jitsi JWT token to join the event meeting room',
    description:
      'Must be registered for the event (admins and event creators are exempt). ' +
      'Returns token, meetingUrl, and tokenizedUrl (meetingUrl + ?jwt=token). ',
  })
  @ApiQuery({ name: 'eventId', required: true })
  @ApiQuery({ name: 'email', required: true })
  @ApiResponse({ status: 200, type: JitsiTokenResponseDto })
  async joinEventViaEmail(
    @Query('email') email: string,
    @Query('eventId') eventId: string,
  ) {
    // Get user by email
    const user = await this.userService.getUserByEmail(email);
    return this.eventService.getJitsiToken(user.id, eventId, user.role);
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // PUBLIC READ
  // ─────────────────────────────────────────────────────────────────────────────

  @UseGuards(OptionalJwtGuard)
  @ApiBearerAuth()
  @Get()
  @ApiOperation({
    summary: 'List all events with optional filters',
    description:
      'Public endpoint. When an auth token is provided, each event includes ' +
      '`isRegistered` (whether the user has registered) and `isOwned` ' +
      '(whether the user created it). These flags are absent for unauthenticated requests.',
  })
  @ApiQuery({ name: 'status', enum: EventStatus, required: false })
  @ApiQuery({ name: 'search', required: false })
  @ApiQuery({ name: 'tag', required: false })
  @ApiQuery({ name: 'dateFrom', required: false })
  @ApiQuery({ name: 'dateTo', required: false })
  @ApiQuery({ name: 'page', required: false })
  @ApiQuery({ name: 'limit', required: false })
  @ApiResponse({ status: 200, type: EventResponseDto, isArray: true })
  async listEvents(@Query() query: EventQueryDto, @Req() req: Request) {
    const userId = (req as any).user?.id;
    return this.eventService.listEvents(query, userId);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a single event by ID (public)' })
  @ApiParam({ name: 'id', description: 'Event UUID' })
  @ApiResponse({ status: 200, type: EventResponseDto })
  async getEvent(@Param('id', ParseUUIDPipe) id: string) {
    return this.eventService.getEvent(id);
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // AUTHENTICATED — REGISTRATION
  // ─────────────────────────────────────────────────────────────────────────────

  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @Post(':id/register')
  @ApiOperation({
    summary: 'Register for an event',
    description: 'Creates a registration and emails an ICS calendar invite.',
  })
  @ApiParam({ name: 'id', description: 'Event UUID' })
  async register(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: any,
  ) {
    return this.eventService.registerForEvent(user.id, id);
  }

  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @Delete(':id/register')
  @ApiOperation({ summary: 'Cancel your registration for an event' })
  @ApiParam({ name: 'id', description: 'Event UUID' })
  async unregister(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: any,
  ) {
    return this.eventService.unregisterFromEvent(user.id, id);
  }

  @Post(':id/register/guest')
  @ApiOperation({
    summary: 'Guest registration for a public event (no account required)',
    description:
      'Allows unauthenticated users to register for public events. ' +
      'Requires full name and email. A confirmation email with an ICS invite is sent. ' +
      'Only works for events where isPublic = true.',
  })
  @ApiParam({ name: 'id', description: 'Event UUID' })
  @ApiResponse({ status: 201, description: 'Guest registration successful.' })
  async guestRegister(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: GuestRegisterEventDto,
  ) {
    return this.eventService.guestRegisterForEvent(id, dto);
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // AUTHENTICATED — JITSI TOKEN
  // ─────────────────────────────────────────────────────────────────────────────

  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @Post(':id/join')
  @ApiOperation({
    summary: 'Get a Jitsi JWT token to join the event meeting room',
    description:
      'Must be registered for the event (admins and event creators are exempt). ' +
      'Returns token, meetingUrl, and tokenizedUrl (meetingUrl + ?jwt=token). ' +
      'The frontend should open tokenizedUrl — no username/password prompt.',
  })
  @ApiParam({ name: 'id', description: 'Event UUID' })
  @ApiResponse({ status: 200, type: JitsiTokenResponseDto })
  async joinEvent(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: any,
  ) {
    return this.eventService.getJitsiToken(user.id, id, user.role);
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // AUTHENTICATED — ICS CALENDAR DOWNLOAD
  // ─────────────────────────────────────────────────────────────────────────────

  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @Get(':id/calendar')
  @ApiOperation({
    summary: 'Download ICS calendar file for a registered event',
  })
  @ApiParam({ name: 'id', description: 'Event UUID' })
  async downloadCalendar(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: any,
    @Res() res: Response,
  ) {
    const result = await this.eventService.getIcsFile(user.id, id);
    if (!result.status) return res.status(result.statusCode).json(result);
    res.setHeader('Content-Type', 'text/calendar; charset=utf-8');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="event-${id}.ics"`,
    );
    return res.status(HttpStatus.OK).send(result.ics);
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // CREATE — Admin + NGO_MEMBER + EXPERT
  // ─────────────────────────────────────────────────────────────────────────────

  @UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard)
  @Roles(Role.SUPER_ADMIN, Role.EVENT_ADMIN, Role.NGO_MEMBER, Role.EXPERT)
  @Permissions(PERMISSIONS.EVENT_WRITE)
  @ApiBearerAuth()
  @Post()
  @ApiOperation({
    summary: 'Create a new event',
    description:
      'Available to SUPER_ADMIN, EVENT_ADMIN, NGO_MEMBER, and EXPERT. The creator automatically becomes the meeting moderator. Set isPublic=false to make the event private (authenticated users only).',
  })
  @ApiResponse({ status: 201, type: EventResponseDto })
  async createEvent(@CurrentUser() user: any, @Body() dto: CreateEventDto) {
    return this.eventService.createEvent(user.id, dto);
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // UPDATE — owner or admin
  // ─────────────────────────────────────────────────────────────────────────────

  @UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard)
  @Roles(Role.SUPER_ADMIN, Role.EVENT_ADMIN, Role.NGO_MEMBER, Role.EXPERT)
  @Permissions(PERMISSIONS.EVENT_WRITE)
  @ApiBearerAuth()
  @Patch(':id')
  @ApiOperation({
    summary: 'Update event details',
    description:
      'Only the event creator, SUPER_ADMIN, or EVENT_ADMIN can update. Returns 403 for other users.',
  })
  @ApiParam({ name: 'id', description: 'Event UUID' })
  async updateEvent(
    @CurrentUser() user: any,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateEventDto,
  ) {
    return this.eventService.updateEvent(user.id, user.role, id, dto);
  }

  @UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard)
  @Roles(Role.SUPER_ADMIN, Role.EVENT_ADMIN, Role.NGO_MEMBER, Role.EXPERT)
  @Permissions(PERMISSIONS.EVENT_WRITE)
  @ApiBearerAuth()
  @Patch(':id/cancel')
  @ApiOperation({
    summary: 'Cancel an event and notify all attendees',
    description:
      'Only the event creator, SUPER_ADMIN, or EVENT_ADMIN can cancel.',
  })
  @ApiParam({ name: 'id', description: 'Event UUID' })
  async cancelEvent(
    @CurrentUser() user: any,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CancelEventDto,
  ) {
    return this.eventService.cancelEvent(user.id, user.role, id, dto);
  }

  @UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard)
  @Roles(Role.SUPER_ADMIN, Role.EVENT_ADMIN, Role.NGO_MEMBER, Role.EXPERT)
  @Permissions(PERMISSIONS.EVENT_WRITE)
  @ApiBearerAuth()
  @Patch(':id/archive')
  @ApiOperation({
    summary: 'Mark event as past and optionally set archive recording URL',
    description:
      'Only the event creator, SUPER_ADMIN, or EVENT_ADMIN can archive.',
  })
  @ApiParam({ name: 'id', description: 'Event UUID' })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        archiveUrl: {
          type: 'string',
          example: 'https://storage.azure.com/media/recording.mp4',
        },
      },
    },
  })
  async archiveEvent(
    @CurrentUser() user: any,
    @Param('id', ParseUUIDPipe) id: string,
    @Body('archiveUrl') archiveUrl?: string,
  ) {
    return this.eventService.markPastAndArchive(
      user.id,
      user.role,
      id,
      archiveUrl,
    );
  }

  @UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard)
  @Roles(Role.SUPER_ADMIN, Role.EVENT_ADMIN, Role.NGO_MEMBER, Role.EXPERT)
  @Permissions(PERMISSIONS.EVENT_WRITE)
  @ApiBearerAuth()
  @Post(':id/cover')
  @UseInterceptors(FileInterceptor('file'))
  @ApiOperation({ summary: 'Upload event cover image (owner or admin)' })
  @ApiParam({ name: 'id', description: 'Event UUID' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: { file: { type: 'string', format: 'binary' } },
    },
  })
  async uploadCover(
    @CurrentUser() user: any,
    @Param('id', ParseUUIDPipe) id: string,
    @UploadedFile(
      new ParseFilePipe({
        validators: [
          new MaxFileSizeValidator({ maxSize: 5 * 1024 * 1024 }),
          new FileTypeValidator({ fileType: /^image\/(jpeg|png|webp)$/ }),
        ],
      }),
    )
    file: Express.Multer.File,
  ) {
    return this.eventService.uploadCoverImage(user.id, user.role, id, file);
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // YOUTUBE — MANUAL UPLOAD
  // ─────────────────────────────────────────────────────────────────────────────

  @UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard)
  @Roles(Role.SUPER_ADMIN, Role.EVENT_ADMIN)
  @Permissions(PERMISSIONS.EVENT_WRITE)
  @ApiBearerAuth()
  @Post(':id/upload-recording')
  @ApiOperation({
    summary: 'Admin: Upload event recording to YouTube',
    description:
      'Uploads a recording to the configured PLRCAP YouTube channel. ' +
      'Provide either a public URL (e.g. Jitsi download link) or a server file path as recordingSource. ' +
      'On success, the YouTube URL is saved as the event archiveUrl. ' +
      'Privacy defaults to "unlisted" unless overridden.',
  })
  @ApiParam({ name: 'id', description: 'Event UUID' })
  @ApiBody({
    schema: {
      type: 'object',
      required: ['recordingSource'],
      properties: {
        recordingSource: {
          type: 'string',
          example: 'https://recordings.jitsi.example/room123.mp4',
        },
        privacyStatus: {
          type: 'string',
          enum: ['public', 'unlisted', 'private'],
          default: 'unlisted',
        },
      },
    },
  })
  async uploadRecording(
    @CurrentUser() user: any,
    @Param('id', ParseUUIDPipe) id: string,
    @Body('recordingSource') recordingSource: string,
    @Body('privacyStatus') privacyStatus?: 'public' | 'unlisted' | 'private',
  ) {
    return this.eventService.uploadRecordingToYouTube(
      user.id,
      user.role,
      id,
      recordingSource,
      privacyStatus,
    );
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // JITSI WEBHOOK — called by Jitsi server when a recording becomes available
  // ─────────────────────────────────────────────────────────────────────────────

  @Post('jitsi/webhook')
  @ApiOperation({
    summary: '[Internal] Jitsi recording webhook — do not call manually',
    description:
      'This endpoint is called by the Jitsi server when a meeting recording is ready. ' +
      'It automatically uploads the recording to YouTube and saves the URL on the event. ' +
      'DevOps must configure Jitsi to POST to this URL with a shared secret header. ' +
      'See docs/DEVOPS.md for configuration instructions.',
  })
  async jitsiWebhook(@Body() payload: Record<string, any>) {
    return this.eventService.handleJitsiWebhook(payload);
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // DELETE — owner or SUPER_ADMIN
  // ─────────────────────────────────────────────────────────────────────────────

  @UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard)
  @Roles(Role.SUPER_ADMIN, Role.EVENT_ADMIN, Role.NGO_MEMBER, Role.EXPERT)
  @Permissions(PERMISSIONS.EVENT_DELETE)
  @ApiBearerAuth()
  @Delete(':id')
  @ApiOperation({
    summary: 'Permanently delete an event',
    description:
      'Only the event creator or SUPER_ADMIN can delete. Returns 403 for others.',
  })
  @ApiParam({ name: 'id', description: 'Event UUID' })
  async deleteEvent(
    @CurrentUser() user: any,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.eventService.deleteEvent(user.id, user.role, id);
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // ADMIN — ATTENDEE MANAGEMENT
  // ─────────────────────────────────────────────────────────────────────────────

  @UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard)
  @Roles(Role.SUPER_ADMIN, Role.EVENT_ADMIN, Role.NGO_MEMBER, Role.EXPERT)
  @Permissions(PERMISSIONS.EVENT_MANAGE_ATTENDEES)
  @ApiBearerAuth()
  @Get(':id/attendees')
  @ApiOperation({
    summary: 'List all registered attendees for an event (owner or admin)',
  })
  @ApiParam({ name: 'id', description: 'Event UUID' })
  @ApiQuery({ name: 'page', required: false })
  @ApiQuery({ name: 'limit', required: false })
  async listAttendees(
    @Param('id', ParseUUIDPipe) id: string,
    @Query('page') page?: number,
    @Query('limit') limit?: number,
  ) {
    return this.eventService.listAttendees(id, { page, limit });
  }

  @UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard)
  @Roles(Role.SUPER_ADMIN, Role.EVENT_ADMIN)
  @Permissions(PERMISSIONS.EVENT_MANAGE_ATTENDEES)
  @ApiBearerAuth()
  @Delete(':id/attendees/:userId')
  @ApiOperation({ summary: 'Admin: Remove a specific attendee from an event' })
  @ApiParam({ name: 'id', description: 'Event UUID' })
  @ApiParam({ name: 'userId', description: 'User UUID to remove' })
  async removeAttendee(
    @CurrentUser() admin: any,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('userId', ParseUUIDPipe) userId: string,
  ) {
    return this.eventService.removeAttendee(admin.id, id, userId);
  }
}
