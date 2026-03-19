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
  HttpStatus,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Response } from 'express';
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
} from '../dto/events.dto';
import { EventService } from '../service/events.service';

import { JwtAuthGuard } from 'src/common/guards/jwt-auth.guard';
import { RolesGuard } from 'src/common/guards/roles.guard';
import { PermissionsGuard } from 'src/common/guards/permissions.guard';
import { Roles } from 'src/common/decorators/roles.decorator';
import { Permissions } from 'src/common/decorators/permissions.decorator';
import { CurrentUser } from 'src/common/decorators/current-user.decorator';
import { PERMISSIONS } from 'src/common/constants/permissions';

@ApiTags('Events & Webinars')
@Controller('events')
export class EventController {
  constructor(private readonly eventService: EventService) {}

  // ─────────────────────────────────────────────────────────────────────────────
  // PUBLIC / AUTHENTICATED — READ
  // ─────────────────────────────────────────────────────────────────────────────

  @Get()
  @ApiOperation({ summary: 'List all events with optional filters (public)' })
  @ApiQuery({ name: 'status', enum: EventStatus, required: false })
  @ApiQuery({ name: 'search', required: false })
  @ApiQuery({ name: 'tag', required: false })
  @ApiQuery({ name: 'dateFrom', required: false })
  @ApiQuery({ name: 'dateTo', required: false })
  @ApiQuery({ name: 'page', required: false })
  @ApiQuery({ name: 'limit', required: false })
  @ApiResponse({ status: 200, type: EventResponseDto, isArray: true })
  async listEvents(@Query() query: EventQueryDto) {
    return this.eventService.listEvents(query);
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

  // ─────────────────────────────────────────────────────────────────────────────
  // AUTHENTICATED — JITSI TOKEN
  // ─────────────────────────────────────────────────────────────────────────────

  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @Post(':id/join')
  @ApiOperation({
    summary: 'Get a Jitsi JWT token to join the event meeting room',
    description:
      'Must be registered for the event (admins exempt). ' +
      'Returns a signed JWT the frontend passes to the Jitsi IFrame API.',
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
    description:
      'Returns a .ics file compatible with Google Calendar, Outlook, and Apple Calendar.',
  })
  @ApiParam({ name: 'id', description: 'Event UUID' })
  async downloadCalendar(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: any,
    @Res() res: Response,
  ) {
    const result = await this.eventService.getIcsFile(user.id, id);

    if (!result.status) {
      return res.status(result.statusCode).json(result);
    }

    res.setHeader('Content-Type', 'text/calendar; charset=utf-8');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="event-${id}.ics"`,
    );
    return res.status(HttpStatus.OK).send(result.ics);
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // ADMIN — CREATE / UPDATE / DELETE / COVER IMAGE
  // ─────────────────────────────────────────────────────────────────────────────

  @UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard)
  @Roles(Role.SUPER_ADMIN, Role.EVENT_ADMIN, Role.NGO_MEMBER)
  @Permissions(PERMISSIONS.EVENT_WRITE)
  @ApiBearerAuth()
  @Post()
  @ApiOperation({ summary: 'Admin: Create a new event' })
  @ApiResponse({ status: 201, type: EventResponseDto })
  async createEvent(@CurrentUser() admin: any, @Body() dto: CreateEventDto) {
    return this.eventService.createEvent(admin.id, dto);
  }

  @UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard)
  @Roles(Role.SUPER_ADMIN, Role.EVENT_ADMIN)
  @Permissions(PERMISSIONS.EVENT_WRITE)
  @ApiBearerAuth()
  @Patch(':id')
  @ApiOperation({ summary: 'Admin: Update event details' })
  @ApiParam({ name: 'id', description: 'Event UUID' })
  async updateEvent(
    @CurrentUser() admin: any,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateEventDto,
  ) {
    return this.eventService.updateEvent(admin.id, id, dto);
  }

  @UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard)
  @Roles(Role.SUPER_ADMIN, Role.EVENT_ADMIN)
  @Permissions(PERMISSIONS.EVENT_WRITE)
  @ApiBearerAuth()
  @Patch(':id/cancel')
  @ApiOperation({ summary: 'Admin: Cancel an event and notify all attendees' })
  @ApiParam({ name: 'id', description: 'Event UUID' })
  async cancelEvent(
    @CurrentUser() admin: any,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CancelEventDto,
  ) {
    return this.eventService.cancelEvent(admin.id, id, dto);
  }

  @UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard)
  @Roles(Role.SUPER_ADMIN, Role.EVENT_ADMIN)
  @Permissions(PERMISSIONS.EVENT_WRITE)
  @ApiBearerAuth()
  @Patch(':id/archive')
  @ApiOperation({
    summary: 'Admin: Mark event as past and set archive URL',
    description:
      'Sets isPast=true. Optionally attach an Azure Media Services recording URL.',
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
    @CurrentUser() admin: any,
    @Param('id', ParseUUIDPipe) id: string,
    @Body('archiveUrl') archiveUrl?: string,
  ) {
    return this.eventService.markPastAndArchive(admin.id, id, archiveUrl);
  }

  @UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard)
  @Roles(Role.SUPER_ADMIN, Role.EVENT_ADMIN)
  @Permissions(PERMISSIONS.EVENT_WRITE)
  @ApiBearerAuth()
  @Post(':id/cover')
  @UseInterceptors(FileInterceptor('file'))
  @ApiOperation({ summary: 'Admin: Upload event cover image' })
  @ApiParam({ name: 'id', description: 'Event UUID' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: { file: { type: 'string', format: 'binary' } },
    },
  })
  async uploadCover(
    @CurrentUser() admin: any,
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
    return this.eventService.uploadCoverImage(admin.id, id, file);
  }

  @UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard)
  @Roles(Role.SUPER_ADMIN)
  @Permissions(PERMISSIONS.EVENT_DELETE)
  @ApiBearerAuth()
  @Delete(':id')
  @ApiOperation({ summary: 'Super Admin: Permanently delete an event' })
  @ApiParam({ name: 'id', description: 'Event UUID' })
  async deleteEvent(
    @CurrentUser() admin: any,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.eventService.deleteEvent(admin.id, id);
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // ADMIN — ATTENDEE MANAGEMENT
  // ─────────────────────────────────────────────────────────────────────────────

  @UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard)
  @Roles(Role.SUPER_ADMIN, Role.EVENT_ADMIN)
  @Permissions(PERMISSIONS.EVENT_MANAGE_ATTENDEES)
  @ApiBearerAuth()
  @Get(':id/attendees')
  @ApiOperation({
    summary: 'Admin: List all registered attendees for an event',
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
