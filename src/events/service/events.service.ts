import { Injectable, HttpStatus, Logger } from '@nestjs/common';
import { PrismaService } from 'src/prisma-module/prisma.service';
import { AzureBlobService } from 'src/providers/azure/azure.blob.service';
import { JitsiService } from 'src/providers/jitsi/jitsi.service';
import { EmailService } from 'src/providers/email/email.service';
import {
  CreateEventDto,
  UpdateEventDto,
  EventQueryDto,
  CancelEventDto,
  EventStatus,
  GuestRegisterEventDto,
} from '../dto/events.dto';
import { Cron, CronExpression } from '@nestjs/schedule';
import { NotificationsService } from 'src/notifications/service/notifications.service';
import { NotificationType } from '@prisma/client';
import { YouTubeService } from 'src/providers/youtube/youtube.service';

@Injectable()
export class EventService {
  private readonly logger = new Logger(EventService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly azureBlob: AzureBlobService,
    private readonly jitsi: JitsiService,
    private readonly emailService: EmailService,
    private readonly notifications: NotificationsService,
    private readonly youtube: YouTubeService,
  ) {}

  // ─────────────────────────────────────────────────────────────────────────────
  // HELPERS
  // ─────────────────────────────────────────────────────────────────────────────

  private resolveStatus(event: {
    startTime: Date;
    endTime: Date;
    isPast: boolean;
    isCancelled: boolean;
  }): EventStatus {
    if (event.isCancelled) return EventStatus.CANCELLED;
    if (event.isPast) return EventStatus.PAST;
    const now = new Date();
    if (now >= event.startTime && now <= event.endTime) return EventStatus.LIVE;
    return EventStatus.UPCOMING;
  }

  private buildEventResponse(event: any, jitsiService: JitsiService) {
    const { _count, registrations, ...rest } = event;
    const meetingUrl =
      event.externalMeetingUrl ?? jitsiService.getMeetingUrl(event.jitsiRoomId);
    return {
      ...rest,
      meetingUrl,
      status: this.resolveStatus(event),
      registrationCount: _count?.registrations ?? registrations?.length ?? 0,
    };
  }

  /** Admins (SUPER_ADMIN, EVENT_ADMIN) or the event creator can manage an event */
  private isOwnerOrAdmin(
    event: any,
    userId: string,
    userRole: string,
  ): boolean {
    return (
      ['SUPER_ADMIN', 'EVENT_ADMIN'].includes(userRole) ||
      event.createdById === userId
    );
  }

  private generateIcs(event: {
    id: string;
    title: string;
    description: string;
    startTime: Date;
    endTime: Date;
    meetingUrl: string;
  }): string {
    const fmt = (d: Date) =>
      d.toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';
    const escape = (s: string) =>
      s
        .replace(/\\/g, '\\\\')
        .replace(/;/g, '\\;')
        .replace(/,/g, '\\,')
        .replace(/\n/g, '\\n');

    return [
      'BEGIN:VCALENDAR',
      'VERSION:2.0',
      'PRODID:-//PLRCAP NGO Hub//Events//EN',
      'CALSCALE:GREGORIAN',
      'METHOD:REQUEST',
      'BEGIN:VEVENT',
      `UID:${event.id}@plrcap.org`,
      `DTSTAMP:${fmt(new Date())}`,
      `DTSTART:${fmt(event.startTime)}`,
      `DTEND:${fmt(event.endTime)}`,
      `SUMMARY:${escape(event.title)}`,
      `DESCRIPTION:${escape(event.description)}\\n\\nJoin: ${escape(event.meetingUrl)}`,
      `LOCATION:${escape(event.meetingUrl)}`,
      'STATUS:CONFIRMED',
      'END:VEVENT',
      'END:VCALENDAR',
    ].join('\r\n');
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // CREATE
  // ─────────────────────────────────────────────────────────────────────────────

  async createEvent(creatorId: string, dto: CreateEventDto) {
    try {
      const start = new Date(dto.startTime);
      const end = new Date(dto.endTime);

      if (end <= start) {
        return {
          status: false,
          statusCode: HttpStatus.BAD_REQUEST,
          message: 'End time must be after start time.',
        };
      }
      if (start <= new Date()) {
        return {
          status: false,
          statusCode: HttpStatus.BAD_REQUEST,
          message: 'Start time must be in the future.',
        };
      }

      const jitsiRoomId = this.jitsi.generateRoomId();

      const event = await this.prisma.event.create({
        data: {
          title: dto.title,
          description: dto.description,
          startTime: start,
          endTime: end,
          jitsiRoomId,
          // externalMeetingUrl is only set when the creator supplies a third-party
          // URL (Zoom, Google Meet, etc.) via dto.externalMeetingUrl.
          // For platform-hosted Jitsi events the URL is derived on-demand from jitsiRoomId.
          externalMeetingUrl: dto.externalMeetingUrl ?? null,
          capacity: dto.capacity ?? null,
          tags: dto.tags ?? [],
          isPublic: dto.isPublic ?? true,
          createdById: creatorId,
        },
        include: { _count: { select: { registrations: true } } },
      });

      await this.prisma.auditLog.create({
        data: {
          action: 'EVENT_CREATED',
          entity: 'Event',
          entityId: event.id,
          details: { title: event.title, startTime: event.startTime } as any,
          adminId: creatorId,
        },
      });

      return {
        status: true,
        statusCode: HttpStatus.CREATED,
        message: 'Event created successfully.',
        data: this.buildEventResponse(event, this.jitsi),
      };
    } catch (error) {
      this.logger.error('createEvent error', error);
      return {
        status: false,
        statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
        message: 'Server error.',
      };
    }
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // LIST & GET
  // ─────────────────────────────────────────────────────────────────────────────

  async listEvents(query: EventQueryDto, userId?: string) {
    try {
      const page = Math.max(1, parseInt(String(query.page ?? '1'), 10) || 1);
      const limit = Math.min(
        100,
        Math.max(1, parseInt(String(query.limit ?? '20'), 10) || 20),
      );
      const skip = (page - 1) * limit;
      const where: any = {};

      // Unauthenticated users only see public events
      if (!userId) where.isPublic = true;

      if (query.search) {
        where.OR = [
          { title: { contains: query.search, mode: 'insensitive' } },
          { description: { contains: query.search, mode: 'insensitive' } },
        ];
      }
      if (query.tag) where.tags = { has: query.tag };
      if (query.dateFrom || query.dateTo) {
        where.startTime = {};
        if (query.dateFrom) where.startTime.gte = new Date(query.dateFrom);
        if (query.dateTo) where.startTime.lte = new Date(query.dateTo);
      }
      if (query.status) {
        const now = new Date();
        switch (query.status) {
          case EventStatus.UPCOMING:
            where.startTime = { gt: now };
            where.isPast = false;
            where.isCancelled = false;
            break;
          case EventStatus.LIVE:
            where.startTime = { lte: now };
            where.endTime = { gte: now };
            where.isCancelled = false;
            break;
          case EventStatus.PAST:
            where.isPast = true;
            break;
          case EventStatus.CANCELLED:
            where.isCancelled = true;
            break;
        }
      }

      const [events, total] = await this.prisma.$transaction([
        this.prisma.event.findMany({
          where,
          skip,
          take: limit,
          include: { _count: { select: { registrations: true } } },
          orderBy: { startTime: 'asc' },
        }),
        this.prisma.event.count({ where }),
      ]);

      // For authenticated users — resolve which events they've registered for
      // and which ones they own, in a single batch query each
      let registeredSet = new Set<string>();
      let ownedSet = new Set<string>();

      if (userId && events.length > 0) {
        const eventIds = events.map((e) => e.id);

        const [registrations] = await Promise.all([
          this.prisma.eventRegistration.findMany({
            where: { userId, eventId: { in: eventIds } },
            select: { eventId: true },
          }),
        ]);

        registeredSet = new Set(registrations.map((r) => r.eventId));
        ownedSet = new Set(
          events.filter((e) => e.createdById === userId).map((e) => e.id),
        );
      }

      const formatted = events.map((e) => ({
        ...this.buildEventResponse(e, this.jitsi),
        ...(userId !== undefined && {
          isRegistered: registeredSet.has(e.id),
          isOwned: ownedSet.has(e.id),
        }),
      }));

      return {
        status: true,
        statusCode: HttpStatus.OK,
        message: 'Events retrieved.',
        data: {
          events: formatted,
          total,
          page,
          limit,
          pages: Math.ceil(total / limit),
        },
      };
    } catch (error) {
      this.logger.error('listEvents error', error);
      return {
        status: false,
        statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
        message: 'Server error.',
      };
    }
  }

  async getEvent(id: string) {
    try {
      const event = await this.prisma.event.findUnique({
        where: { id },
        include: {
          _count: { select: { registrations: true } },
          registrations: {
            take: 5,
            include: {
              user: { select: { id: true, fullName: true, avatarUrl: true } },
            },
            orderBy: { createdAt: 'asc' },
          },
        },
      });
      if (!event)
        return {
          status: false,
          statusCode: HttpStatus.NOT_FOUND,
          message: 'Event not found.',
        };
      return {
        status: true,
        statusCode: HttpStatus.OK,
        message: 'Event retrieved.',
        data: this.buildEventResponse(event, this.jitsi),
      };
    } catch (error) {
      this.logger.error('getEvent error', error);
      return {
        status: false,
        statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
        message: 'Server error.',
      };
    }
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // MY CREATED EVENTS
  // ─────────────────────────────────────────────────────────────────────────────

  async getMyCreatedEvents(
    userId: string,
    query: { page?: number; limit?: number; status?: EventStatus },
  ) {
    try {
      const page = Math.max(1, parseInt(String(query.page ?? '1'), 10) || 1);
      const limit = Math.min(
        100,
        Math.max(1, parseInt(String(query.limit ?? '20'), 10) || 20),
      );
      const skip = (page - 1) * limit;
      const where: any = { createdById: userId };

      if (query.status) {
        const now = new Date();
        switch (query.status) {
          case EventStatus.UPCOMING:
            where.isPast = false;
            where.isCancelled = false;
            where.startTime = { gt: now };
            break;
          case EventStatus.LIVE:
            where.startTime = { lte: now };
            where.endTime = { gte: now };
            where.isCancelled = false;
            break;
          case EventStatus.PAST:
            where.isPast = true;
            break;
          case EventStatus.CANCELLED:
            where.isCancelled = true;
            break;
        }
      }

      const [events, total] = await this.prisma.$transaction([
        this.prisma.event.findMany({
          where,
          skip,
          take: limit,
          include: { _count: { select: { registrations: true } } },
          orderBy: { startTime: 'desc' },
        }),
        this.prisma.event.count({ where }),
      ]);

      return {
        status: true,
        statusCode: HttpStatus.OK,
        message: 'Your created events retrieved.',
        data: {
          events: events.map((e) => this.buildEventResponse(e, this.jitsi)),
          total,
          page,
          limit,
          pages: Math.ceil(total / limit),
        },
      };
    } catch (error) {
      this.logger.error('getMyCreatedEvents error', error);
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

  async updateEvent(
    userId: string,
    userRole: string,
    id: string,
    dto: UpdateEventDto,
  ) {
    try {
      const event = await this.prisma.event.findUnique({ where: { id } });
      if (!event)
        return {
          status: false,
          statusCode: HttpStatus.NOT_FOUND,
          message: 'Event not found.',
        };

      if (!this.isOwnerOrAdmin(event, userId, userRole)) {
        return {
          status: false,
          statusCode: HttpStatus.FORBIDDEN,
          message: 'You do not have permission to update this event.',
        };
      }
      if (event.isCancelled) {
        return {
          status: false,
          statusCode: HttpStatus.BAD_REQUEST,
          message: 'Cannot update a cancelled event.',
        };
      }

      const data: any = { ...dto };
      if (dto.startTime) data.startTime = new Date(dto.startTime);
      if (dto.endTime) data.endTime = new Date(dto.endTime);

      if (data.startTime && data.endTime && data.endTime <= data.startTime) {
        return {
          status: false,
          statusCode: HttpStatus.BAD_REQUEST,
          message: 'End time must be after start time.',
        };
      }

      const updated = await this.prisma.event.update({
        where: { id },
        data,
        include: { _count: { select: { registrations: true } } },
      });

      await this.prisma.auditLog.create({
        data: {
          action: 'EVENT_UPDATED',
          entity: 'Event',
          entityId: id,
          details: { ...dto } as any,
          adminId: userId,
        },
      });

      if (dto.startTime || dto.endTime) {
        this.notifyAttendeesOfUpdate(updated).catch((err) =>
          this.logger.error('notifyAttendeesOfUpdate failed', err),
        );
      }

      return {
        status: true,
        statusCode: HttpStatus.OK,
        message: 'Event updated.',
        data: this.buildEventResponse(updated, this.jitsi),
      };
    } catch (error) {
      this.logger.error('updateEvent error', error);
      return {
        status: false,
        statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
        message: 'Server error.',
      };
    }
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // CANCEL
  // ─────────────────────────────────────────────────────────────────────────────

  async cancelEvent(
    userId: string,
    userRole: string,
    id: string,
    dto: CancelEventDto,
  ) {
    try {
      const event = await this.prisma.event.findUnique({ where: { id } });
      if (!event)
        return {
          status: false,
          statusCode: HttpStatus.NOT_FOUND,
          message: 'Event not found.',
        };

      if (!this.isOwnerOrAdmin(event, userId, userRole)) {
        return {
          status: false,
          statusCode: HttpStatus.FORBIDDEN,
          message: 'You do not have permission to cancel this event.',
        };
      }
      if (event.isCancelled)
        return {
          status: false,
          statusCode: HttpStatus.BAD_REQUEST,
          message: 'Event is already cancelled.',
        };
      if (event.isPast)
        return {
          status: false,
          statusCode: HttpStatus.BAD_REQUEST,
          message: 'Cannot cancel a past event.',
        };

      await this.prisma.$transaction([
        this.prisma.event.update({
          where: { id },
          data: { isCancelled: true, cancellationReason: dto.reason ?? null },
        }),
        this.prisma.auditLog.create({
          data: {
            action: 'EVENT_CANCELLED',
            entity: 'Event',
            entityId: id,
            details: { reason: dto.reason } as any,
            adminId: userId,
          },
        }),
      ]);

      this.notifyAttendeesCancellation(event, dto.reason).catch((err) =>
        this.logger.error('notifyAttendeesCancellation failed', err),
      );

      return {
        status: true,
        statusCode: HttpStatus.OK,
        message: 'Event cancelled.',
      };
    } catch (error) {
      this.logger.error('cancelEvent error', error);
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

  async deleteEvent(userId: string, userRole: string, id: string) {
    try {
      const event = await this.prisma.event.findUnique({ where: { id } });
      if (!event)
        return {
          status: false,
          statusCode: HttpStatus.NOT_FOUND,
          message: 'Event not found.',
        };

      if (!this.isOwnerOrAdmin(event, userId, userRole)) {
        return {
          status: false,
          statusCode: HttpStatus.FORBIDDEN,
          message: 'You do not have permission to delete this event.',
        };
      }

      if (event.coverImageUrl)
        await this.azureBlob.delete(event.coverImageUrl, 'avatars');

      await this.prisma.$transaction([
        this.prisma.eventRegistration.deleteMany({ where: { eventId: id } }),
        this.prisma.event.delete({ where: { id } }),
        this.prisma.auditLog.create({
          data: {
            action: 'EVENT_DELETED',
            entity: 'Event',
            entityId: id,
            details: { title: event.title } as any,
            adminId: userId,
          },
        }),
      ]);

      return {
        status: true,
        statusCode: HttpStatus.OK,
        message: 'Event deleted.',
      };
    } catch (error) {
      this.logger.error('deleteEvent error', error);
      return {
        status: false,
        statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
        message: 'Server error.',
      };
    }
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // COVER IMAGE
  // ─────────────────────────────────────────────────────────────────────────────

  async uploadCoverImage(
    userId: string,
    userRole: string,
    eventId: string,
    file: Express.Multer.File,
  ) {
    try {
      const event = await this.prisma.event.findUnique({
        where: { id: eventId },
      });
      if (!event)
        return {
          status: false,
          statusCode: HttpStatus.NOT_FOUND,
          message: 'Event not found.',
        };

      if (!this.isOwnerOrAdmin(event, userId, userRole)) {
        return {
          status: false,
          statusCode: HttpStatus.FORBIDDEN,
          message: 'You do not have permission to update this event.',
        };
      }

      if (event.coverImageUrl)
        await this.azureBlob.delete(event.coverImageUrl, 'avatars');
      const coverImageUrl = await this.azureBlob.upload(file, 'avatars');
      await this.prisma.event.update({
        where: { id: eventId },
        data: { coverImageUrl },
      });
      await this.prisma.auditLog.create({
        data: {
          action: 'EVENT_COVER_UPDATED',
          entity: 'Event',
          entityId: eventId,
          adminId: userId,
        },
      });

      return {
        status: true,
        statusCode: HttpStatus.OK,
        message: 'Cover image uploaded.',
        coverImageUrl,
      };
    } catch (error) {
      this.logger.error('uploadCoverImage error', error);
      return {
        status: false,
        statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
        message: 'Server error.',
      };
    }
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // ARCHIVE
  // ─────────────────────────────────────────────────────────────────────────────

  async markPastAndArchive(
    userId: string,
    userRole: string,
    eventId: string,
    archiveUrl?: string,
  ) {
    try {
      const event = await this.prisma.event.findUnique({
        where: { id: eventId },
      });
      if (!event)
        return {
          status: false,
          statusCode: HttpStatus.NOT_FOUND,
          message: 'Event not found.',
        };

      if (!this.isOwnerOrAdmin(event, userId, userRole)) {
        return {
          status: false,
          statusCode: HttpStatus.FORBIDDEN,
          message: 'You do not have permission to archive this event.',
        };
      }

      await this.prisma.event.update({
        where: { id: eventId },
        data: { isPast: true, archiveUrl: archiveUrl ?? null },
      });
      await this.prisma.auditLog.create({
        data: {
          action: 'EVENT_ARCHIVED',
          entity: 'Event',
          entityId: eventId,
          details: { archiveUrl } as any,
          adminId: userId,
        },
      });

      return {
        status: true,
        statusCode: HttpStatus.OK,
        message: 'Event marked as past and archived.',
      };
    } catch (error) {
      this.logger.error('markPastAndArchive error', error);
      return {
        status: false,
        statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
        message: 'Server error.',
      };
    }
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // REGISTRATION
  // ─────────────────────────────────────────────────────────────────────────────

  async registerForEvent(userId: string, eventId: string) {
    try {
      const event = await this.prisma.event.findUnique({
        where: { id: eventId },
        include: { _count: { select: { registrations: true } } },
      });

      if (!event)
        return {
          status: false,
          statusCode: HttpStatus.NOT_FOUND,
          message: 'Event not found.',
        };
      if (!event.isPublic)
        return {
          status: false,
          statusCode: HttpStatus.FORBIDDEN,
          message:
            'This is a private event. You must be logged in to register.',
        };
      if (event.isCancelled)
        return {
          status: false,
          statusCode: HttpStatus.BAD_REQUEST,
          message: 'This event has been cancelled.',
        };
      if (event.isPast)
        return {
          status: false,
          statusCode: HttpStatus.BAD_REQUEST,
          message: 'This event has already ended.',
        };

      if (event.capacity && event._count.registrations >= event.capacity) {
        return {
          status: false,
          statusCode: HttpStatus.CONFLICT,
          message: 'This event is fully booked.',
        };
      }

      const existing = await this.prisma.eventRegistration.findUnique({
        where: { userId_eventId: { userId, eventId } },
      });
      if (existing)
        return {
          status: false,
          statusCode: HttpStatus.CONFLICT,
          message: 'You are already registered for this event.',
        };

      const registration = await this.prisma.eventRegistration.create({
        data: { userId, eventId },
        include: { user: { select: { fullName: true, email: true } } },
      });

      // ICS attachment: embed the raw meeting URL so calendar apps (Outlook,
      // Google Calendar) display a proper LOCATION / clickable link.
      // For Jitsi events the raw URL has no JWT — that is intentional, the ICS
      // is informational only and the user must join through the frontend.
      const rawMeetingUrl =
        event.externalMeetingUrl ?? this.jitsi.getMeetingUrl(event.jitsiRoomId);

      const icsContent = this.generateIcs({
        id: event.id,
        title: event.title,
        description: event.description,
        startTime: event.startTime,
        endTime: event.endTime,
        meetingUrl: rawMeetingUrl,
      });

      const frontendUrl =
        process.env.FRONTEND_URL ?? 'https://dev-plrcap.vercel.app';

      const emailJoinUrl =
        event.externalMeetingUrl ??
        `${frontendUrl}/events/meeting?eventId=${event.id}&email=${registration.user.email}`;

      this.emailService
        .sendEventRegistrationConfirmation({
          fullName: registration.user.fullName,
          email: registration.user.email,
          eventTitle: event.title,
          startTime: event.startTime,
          endTime: event.endTime,
          meetingUrl: emailJoinUrl,
          icsContent,
        })
        .catch((err) =>
          this.logger.error('sendEventRegistrationConfirmation failed', err),
        );

      this.notifications
        .create({
          userId,
          type: NotificationType.EVENT_REGISTRATION_CONFIRMED,
          title: 'Registration Confirmed',
          body: `You have successfully registered for "${event.title}".`,
          link: `${process.env.FRONTEND_URL}/resources/events`,
          meta: { eventTitle: event.title, startTime: event.startTime },
        })
        .catch((err) => this.logger.error('notification failed', err));

      return {
        status: true,
        statusCode: HttpStatus.CREATED,
        message:
          'Registration successful. Check your email for the calendar invite.',
        data: { registrationId: registration.id, eventId, userId },
      };
    } catch (error) {
      this.logger.error('registerForEvent error', error);
      return {
        status: false,
        statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
        message: 'Server error.',
      };
    }
  }

  async guestRegisterForEvent(eventId: string, dto: GuestRegisterEventDto) {
    try {
      const event = await this.prisma.event.findUnique({
        where: { id: eventId },
        include: { _count: { select: { registrations: true } } },
      });

      if (!event)
        return {
          status: false,
          statusCode: HttpStatus.NOT_FOUND,
          message: 'Event not found.',
        };
      if (!event.isPublic)
        return {
          status: false,
          statusCode: HttpStatus.FORBIDDEN,
          message:
            'This is a private event. Guest registration is not allowed.',
        };
      if (event.isCancelled)
        return {
          status: false,
          statusCode: HttpStatus.BAD_REQUEST,
          message: 'This event has been cancelled.',
        };
      if (event.isPast)
        return {
          status: false,
          statusCode: HttpStatus.BAD_REQUEST,
          message: 'This event has already ended.',
        };

      if (event.capacity && event._count.registrations >= event.capacity) {
        return {
          status: false,
          statusCode: HttpStatus.CONFLICT,
          message: 'This event is fully booked.',
        };
      }

      // Check for duplicate guest email registration
      const existing = await this.prisma.eventRegistration.findUnique({
        where: { guestEmail_eventId: { guestEmail: dto.guestEmail, eventId } },
      });
      if (existing)
        return {
          status: false,
          statusCode: HttpStatus.CONFLICT,
          message: 'This email address is already registered for this event.',
        };

      const registration = await this.prisma.eventRegistration.create({
        data: { eventId, guestName: dto.guestName, guestEmail: dto.guestEmail },
      });

      // Email confirmation with ICS
      const frontendUrl =
        process.env.FRONTEND_URL ?? 'https://dev-plrcap.vercel.app';

      const rawMeetingUrl =
        event.externalMeetingUrl ??
        `${frontendUrl}/events?eventId=${event.id}&email=${dto.guestEmail}`;

      const icsContent = this.generateIcs({
        id: event.id,
        title: event.title,
        description: event.description,
        startTime: event.startTime,
        endTime: event.endTime,
        meetingUrl: rawMeetingUrl,
      });

      this.emailService
        .sendEventRegistrationConfirmation({
          fullName: dto.guestName,
          email: dto.guestEmail,
          eventTitle: event.title,
          startTime: event.startTime,
          endTime: event.endTime,
          meetingUrl: rawMeetingUrl,
          icsContent,
        })
        .catch((err) => this.logger.error('guestRegister email failed', err));

      return {
        status: true,
        statusCode: HttpStatus.CREATED,
        message:
          'Guest registration successful. A confirmation has been sent to your email.',
        data: {
          registrationId: registration.id,
          eventId,
          guestEmail: dto.guestEmail,
        },
      };
    } catch (error) {
      this.logger.error('guestRegisterForEvent error', error);
      return {
        status: false,
        statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
        message: 'Server error.',
      };
    }
  }

  async unregisterFromEvent(userId: string, eventId: string) {
    try {
      const registration = await this.prisma.eventRegistration.findUnique({
        where: { userId_eventId: { userId, eventId } },
      });
      if (!registration)
        return {
          status: false,
          statusCode: HttpStatus.NOT_FOUND,
          message: 'Registration not found.',
        };

      const event = await this.prisma.event.findUnique({
        where: { id: eventId },
      });
      if (event?.isPast)
        return {
          status: false,
          statusCode: HttpStatus.BAD_REQUEST,
          message: 'Cannot unregister from a past event.',
        };

      await this.prisma.eventRegistration.delete({
        where: { userId_eventId: { userId, eventId } },
      });

      return {
        status: true,
        statusCode: HttpStatus.OK,
        message: 'Successfully unregistered from event.',
      };
    } catch (error) {
      this.logger.error('unregisterFromEvent error', error);
      return {
        status: false,
        statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
        message: 'Server error.',
      };
    }
  }

  async getMyRegistrations(
    userId: string,
    query: { page?: number; limit?: number },
  ) {
    try {
      const page = Math.max(1, parseInt(String(query.page ?? '1'), 10) || 1);
      const limit = Math.min(
        100,
        Math.max(1, parseInt(String(query.limit ?? '20'), 10) || 20),
      );
      const skip = (page - 1) * limit;

      const [registrations, total] = await this.prisma.$transaction([
        this.prisma.eventRegistration.findMany({
          where: { userId },
          skip,
          take: limit,
          include: {
            event: { include: { _count: { select: { registrations: true } } } },
          },
          orderBy: { createdAt: 'desc' },
        }),
        this.prisma.eventRegistration.count({ where: { userId } }),
      ]);

      return {
        status: true,
        statusCode: HttpStatus.OK,
        message: 'Registrations retrieved.',
        data: {
          registrations: registrations.map((r) => ({
            registrationId: r.id,
            registeredAt: r.createdAt,
            event: this.buildEventResponse(r.event, this.jitsi),
          })),
          total,
          page,
          limit,
          pages: Math.ceil(total / limit),
        },
      };
    } catch (error) {
      this.logger.error('getMyRegistrations error', error);
      return {
        status: false,
        statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
        message: 'Server error.',
      };
    }
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // ADMIN: ATTENDEE MANAGEMENT
  // ─────────────────────────────────────────────────────────────────────────────

  async listAttendees(
    eventId: string,
    query: { page?: number; limit?: number },
  ) {
    try {
      const page = Math.max(1, parseInt(String(query.page ?? '1'), 10) || 1);
      const limit = Math.min(
        200,
        Math.max(1, parseInt(String(query.limit ?? '50'), 10) || 50),
      );
      const skip = (page - 1) * limit;

      const event = await this.prisma.event.findUnique({
        where: { id: eventId },
      });
      if (!event)
        return {
          status: false,
          statusCode: HttpStatus.NOT_FOUND,
          message: 'Event not found.',
        };

      const [registrations, total] = await this.prisma.$transaction([
        this.prisma.eventRegistration.findMany({
          where: { eventId },
          skip,
          take: limit,
          include: {
            user: {
              select: {
                id: true,
                fullName: true,
                email: true,
                role: true,
                avatarUrl: true,
                organization: { select: { name: true } },
              },
            },
          },
          orderBy: { createdAt: 'asc' },
        }),
        this.prisma.eventRegistration.count({ where: { eventId } }),
      ]);

      return {
        status: true,
        statusCode: HttpStatus.OK,
        message: 'Attendees retrieved.',
        data: {
          eventId,
          attendees: registrations.map((r) => ({
            registrationId: r.id,
            registeredAt: r.createdAt,
            guestName: r.guestName,
            guestEmail: r.guestEmail,
            ...r.user,
          })),
          total,
          page,
          limit,
          pages: Math.ceil(total / limit),
        },
      };
    } catch (error) {
      this.logger.error('listAttendees error', error);
      return {
        status: false,
        statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
        message: 'Server error.',
      };
    }
  }

  async removeAttendee(adminId: string, eventId: string, userId: string) {
    try {
      const registration = await this.prisma.eventRegistration.findUnique({
        where: { userId_eventId: { userId, eventId } },
      });
      if (!registration)
        return {
          status: false,
          statusCode: HttpStatus.NOT_FOUND,
          message: 'Registration not found.',
        };

      await this.prisma.$transaction([
        this.prisma.eventRegistration.delete({
          where: { userId_eventId: { userId, eventId } },
        }),
        this.prisma.auditLog.create({
          data: {
            action: 'EVENT_ATTENDEE_REMOVED',
            entity: 'EventRegistration',
            entityId: registration.id,
            details: { eventId, userId } as any,
            adminId,
          },
        }),
      ]);

      return {
        status: true,
        statusCode: HttpStatus.OK,
        message: 'Attendee removed.',
      };
    } catch (error) {
      this.logger.error('removeAttendee error', error);
      return {
        status: false,
        statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
        message: 'Server error.',
      };
    }
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // JITSI TOKEN
  // ─────────────────────────────────────────────────────────────────────────────

  // async getJitsiToken(userId: string, eventId: string, userRole: string) {
  //   try {
  //     const event = await this.prisma.event.findUnique({
  //       where: { id: eventId },
  //     });
  //     if (!event)
  //       return {
  //         status: false,
  //         statusCode: HttpStatus.NOT_FOUND,
  //         message: 'Event not found.',
  //       };
  //     if (event.isCancelled)
  //       return {
  //         status: false,
  //         statusCode: HttpStatus.BAD_REQUEST,
  //         message: 'This event has been cancelled.',
  //       };

  //     const isAdmin = ['SUPER_ADMIN', 'EVENT_ADMIN'].includes(userRole);
  //     const isEventCreator = event.createdById === userId;

  //     // Admins and the event creator bypass the registration check
  //     if (!isAdmin && !isEventCreator) {
  //       const registration = await this.prisma.eventRegistration.findUnique({
  //         where: { userId_eventId: { userId, eventId } },
  //       });
  //       if (!registration) {
  //         return {
  //           status: false,
  //           statusCode: HttpStatus.FORBIDDEN,
  //           message: 'You must register for this event before joining.',
  //         };
  //       }
  //     }

  //     const user = await this.prisma.user.findUnique({
  //       where: { id: userId },
  //       select: { id: true, fullName: true, email: true, avatarUrl: true },
  //     });
  //     if (!user)
  //       return {
  //         status: false,
  //         statusCode: HttpStatus.NOT_FOUND,
  //         message: 'User not found.',
  //       };

  //     // Moderator = admin OR event creator
  //     const isModerator = isAdmin || isEventCreator;

  //     const token = this.jitsi.generateToken(
  //       event.jitsiRoomId,
  //       {
  //         userId: user.id,
  //         fullName: user.fullName,
  //         email: user.email,
  //         avatarUrl: user.avatarUrl ?? undefined,
  //         isModerator,
  //       },
  //       event.endTime,
  //     );

  //     // For external meetings the URL is a third-party link (Zoom etc.) — no JWT appended.
  //     // For Jitsi rooms we append the JWT so the user enters directly without a lobby prompt.
  //     const meetingUrl =
  //       event.externalMeetingUrl ??
  //       `${this.jitsi.getMeetingUrl(event.jitsiRoomId)}?jwt=${token}`;

  //     return {
  //       status: true,
  //       statusCode: HttpStatus.OK,
  //       message: 'Jitsi token generated.',
  //       data: {
  //         token,
  //         roomId: event.jitsiRoomId,
  //         meetingUrl, // open this URL directly — JWT already embedded for Jitsi events
  //         isModerator,
  //         expiresAt: event.endTime.toISOString(),
  //       },
  //     };
  //   } catch (error) {
  //     this.logger.error('getJitsiToken error', error);
  //     return {
  //       status: false,
  //       statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
  //       message: 'Server error.',
  //     };
  //   }
  // }

  // Authenticated app callers — thin wrapper that resolves email and delegates
  async getJitsiToken(userId: string, eventId: string, userRole: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { email: true },
    });
    if (!user)
      return {
        status: false,
        statusCode: HttpStatus.NOT_FOUND,
        message: 'User not found.',
      };
    return this.getJitsiTokenByEmail(user.email, eventId, userRole);
  }

  // Primary resolver — handles platform users AND unauthenticated guests
  async getJitsiTokenByEmail(
    email: string,
    eventId: string,
    userRole?: string,
  ) {
    try {
      const event = await this.prisma.event.findUnique({
        where: { id: eventId },
      });
      if (!event)
        return {
          status: false,
          statusCode: HttpStatus.NOT_FOUND,
          message: 'Event not found.',
        };
      if (event.isCancelled)
        return {
          status: false,
          statusCode: HttpStatus.BAD_REQUEST,
          message: 'This event has been cancelled.',
        };

      // ── Resolve caller identity ─────────────────────────────────────────────
      // Try platform user first; guests won't have a user row at all.
      const platformUser = await this.prisma.user.findUnique({
        where: { email },
        select: {
          id: true,
          fullName: true,
          email: true,
          avatarUrl: true,
          role: true,
        },
      });

      // Effective role: explicit arg (authenticated call) → DB role (known user via
      // email link) → 'GUEST' (no platform account)
      const effectiveRole = userRole ?? platformUser?.role ?? 'GUEST';
      const isAdmin = ['SUPER_ADMIN', 'EVENT_ADMIN'].includes(effectiveRole);
      const isEventCreator = platformUser
        ? event.createdById === platformUser.id
        : false;

      // ── Registration check ──────────────────────────────────────────────────
      // Admins and the event creator are always allowed in.
      // Everyone else must have a registration row matched by userId OR guestEmail —
      // covering both app registrations and email-link guest registrations.
      if (!isAdmin && !isEventCreator) {
        const orClauses: any[] = [{ guestEmail: email, eventId }];
        if (platformUser) orClauses.push({ userId: platformUser.id, eventId });

        const registration = await this.prisma.eventRegistration.findFirst({
          where: { OR: orClauses },
        });
        if (!registration)
          return {
            status: false,
            statusCode: HttpStatus.FORBIDDEN,
            message: 'You must register for this event before joining.',
          };
      }

      // ── Build Jitsi identity ────────────────────────────────────────────────
      const isModerator = isAdmin || isEventCreator;

      let jitsiIdentity: {
        userId: string;
        fullName: string;
        email: string;
        avatarUrl?: string;
        isModerator: boolean;
      };

      if (platformUser) {
        jitsiIdentity = {
          userId: platformUser.id,
          fullName: platformUser.fullName,
          email: platformUser.email,
          avatarUrl: platformUser.avatarUrl ?? undefined,
          isModerator,
        };
      } else {
        // Guest — pull display name from their registration row
        const guestReg = await this.prisma.eventRegistration.findUnique({
          where: { guestEmail_eventId: { guestEmail: email, eventId } },
          select: { guestName: true, guestEmail: true },
        });
        if (!guestReg)
          return {
            status: false,
            statusCode: HttpStatus.FORBIDDEN,
            message: 'No registration found for this email.',
          };

        jitsiIdentity = {
          userId: `guest:${email}`, // synthetic — Jitsi requires a non-empty string
          fullName: guestReg.guestName ?? email,
          email: guestReg.guestEmail!,
          avatarUrl: undefined,
          isModerator: false, // guests are never moderators
        };
      }

      const token = this.jitsi.generateToken(
        event.jitsiRoomId,
        jitsiIdentity,
        event.endTime,
      );

      // External meetings (Zoom etc.) → URL only, no JWT.
      // Jitsi rooms → embed the JWT so the participant skips the lobby prompt.
      const meetingUrl =
        event.externalMeetingUrl ??
        `${this.jitsi.getMeetingUrl(event.jitsiRoomId)}?jwt=${token}`;

      return {
        status: true,
        statusCode: HttpStatus.OK,
        message: 'Jitsi token generated.',
        data: {
          token,
          roomId: event.jitsiRoomId,
          meetingUrl,
          isModerator,
          expiresAt: event.endTime.toISOString(),
        },
      };
    } catch (error) {
      this.logger.error('getJitsiTokenByEmail error', error);
      return {
        status: false,
        statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
        message: 'Server error.',
      };
    }
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // ICS DOWNLOAD
  // ─────────────────────────────────────────────────────────────────────────────

  async getIcsFile(userId: string, eventId: string) {
    try {
      const [event, registration] = await Promise.all([
        this.prisma.event.findUnique({ where: { id: eventId } }),
        this.prisma.eventRegistration.findUnique({
          where: { userId_eventId: { userId, eventId } },
        }),
      ]);
      if (!event)
        return {
          status: false,
          statusCode: HttpStatus.NOT_FOUND,
          message: 'Event not found.',
        };
      if (!registration)
        return {
          status: false,
          statusCode: HttpStatus.FORBIDDEN,
          message: 'You are not registered for this event.',
        };

      const meetingUrl =
        event.externalMeetingUrl ?? this.jitsi.getMeetingUrl(event.jitsiRoomId);
      const ics = this.generateIcs({
        id: event.id,
        title: event.title,
        description: event.description,
        startTime: event.startTime,
        endTime: event.endTime,
        meetingUrl,
      });

      return {
        status: true,
        statusCode: HttpStatus.OK,
        message: 'ICS generated.',
        ics,
      };
    } catch (error) {
      this.logger.error('getIcsFile error', error);
      return {
        status: false,
        statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
        message: 'Server error.',
      };
    }
  }

  /**
   * Webhook handler called by Jitsi when a meeting ends and a recording
   * is available for download.
   *
   * Jitsi sends a POST to /events/jitsi/webhook with a JSON body.
   * DevOps must configure the Jitsi server to call this endpoint.
   * See docs/DEVOPS.md for the full Jitsi webhook configuration.
   *
   * Expected payload shape (simplified — varies by Jitsi version):
   * {
   *   "event":      "RECORDING_AVAILABLE",
   *   "roomName":   "<jitsiRoomId>",
   *   "recordingUrl": "https://..."
   * }
   */
  async handleJitsiWebhook(payload: Record<string, any>) {
    try {
      const { event: eventType, roomName, recordingUrl } = payload;

      if (eventType !== 'RECORDING_AVAILABLE' || !roomName || !recordingUrl) {
        this.logger.warn(
          'Jitsi webhook: unrecognised or incomplete payload',
          payload,
        );
        return { status: false, message: 'Unrecognised webhook payload.' };
      }

      // Look up the event by Jitsi room ID
      const event = await this.prisma.event.findUnique({
        where: { jitsiRoomId: roomName },
      });

      if (!event) {
        this.logger.warn(
          `Jitsi webhook: no event found for roomName=${roomName}`,
        );
        return {
          status: false,
          message: `No event found for room ${roomName}.`,
        };
      }

      this.logger.log(
        `Jitsi webhook: recording available for event "${event.title}" — auto-uploading to YouTube`,
      );

      const privacyStatus =
        (process.env.YOUTUBE_DEFAULT_PRIVACY as any) ?? 'unlisted';

      const description =
        `Recording of the PLRCAP event: "${event.title}"\n` +
        `Date: ${event.startTime.toLocaleDateString('en-GB')}\n\n` +
        `${event.description}`;

      const result = await this.youtube.uploadRecording({
        title: event.title,
        description,
        privacyStatus,
        source: recordingUrl,
      });

      await this.prisma.event.update({
        where: { id: event.id },
        data: { archiveUrl: result.videoUrl, isPast: true },
      });

      await this.prisma.auditLog.create({
        data: {
          action: 'EVENT_RECORDING_AUTO_UPLOADED',
          entity: 'Event',
          entityId: event.id,
          details: {
            videoId: result.videoId,
            videoUrl: result.videoUrl,
            roomName,
          } as any,
          adminId: 'SYSTEM',
        },
      });

      this.logger.log(
        `Auto-upload complete for "${event.title}": ${result.videoUrl}`,
      );
      return {
        status: true,
        message: 'Recording uploaded.',
        videoUrl: result.videoUrl,
      };
    } catch (error) {
      this.logger.error('handleJitsiWebhook error', error);
      return {
        status: false,
        message: `Webhook processing failed: ${error.message}`,
      };
    }
  }

  /**
   * Manually trigger a YouTube upload for a completed event recording.
   * The recordingSource can be a public URL (e.g. Jitsi recording download link)
   * or an absolute file path on the server.
   *
   * Privacy defaults to 'unlisted' so only people with the link can view it.
   * Admin can override by passing privacyStatus explicitly.
   */
  async uploadRecordingToYouTube(
    userId: string,
    userRole: string,
    eventId: string,
    recordingSource: string,
    privacyStatus: 'public' | 'unlisted' | 'private' = 'unlisted',
  ) {
    try {
      const event = await this.prisma.event.findUnique({
        where: { id: eventId },
      });
      if (!event)
        return { status: false, statusCode: 404, message: 'Event not found.' };

      if (!this.isOwnerOrAdmin(event, userId, userRole)) {
        return {
          status: false,
          statusCode: 403,
          message: 'You do not have permission to upload this recording.',
        };
      }

      const description =
        `Recording of the PLRCAP event: "${event.title}"\n` +
        `Date: ${event.startTime.toLocaleDateString('en-GB')}\n\n` +
        `${event.description}`;

      const result = await this.youtube.uploadRecording({
        title: event.title,
        description,
        privacyStatus,
        source: recordingSource,
      });

      // Save the YouTube URL as the archiveUrl
      await this.prisma.event.update({
        where: { id: eventId },
        data: { archiveUrl: result.videoUrl, isPast: true },
      });

      await this.prisma.auditLog.create({
        data: {
          action: 'EVENT_RECORDING_UPLOADED',
          entity: 'Event',
          entityId: eventId,
          details: {
            videoId: result.videoId,
            videoUrl: result.videoUrl,
            privacyStatus,
          } as any,
          adminId: userId,
        },
      });

      return {
        status: true,
        statusCode: 200,
        message: 'Recording uploaded to YouTube successfully.',
        data: { videoId: result.videoId, videoUrl: result.videoUrl },
      };
    } catch (error) {
      this.logger.error('uploadRecordingToYouTube error', error);
      return {
        status: false,
        statusCode: 500,
        message: `Upload failed: ${error.message}`,
      };
    }
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // PRIVATE: EMAIL HELPERS
  // ─────────────────────────────────────────────────────────────────────────────

  private async notifyAttendeesOfUpdate(event: any) {
    const registrations = await this.prisma.eventRegistration.findMany({
      where: { eventId: event.id },
      include: { user: { select: { id: true, fullName: true, email: true } } },
    });

    await Promise.allSettled(
      registrations.map((r) =>
        this.emailService.sendEventUpdateNotification({
          fullName: r.user.fullName,
          email: r.user.email,
          eventTitle: event.title,
          startTime: event.startTime,
          endTime: event.endTime,
          meetingUrl:
            event.externalMeetingUrl ??
            `${process.env.FRONTEND_URL}/events?eventId=${event.id}&email=${r.user.email}`,
        }),
      ),
    );
    this.notifications
      .createMany(
        registrations.map((r) => ({
          userId: r.user.id,
          type: NotificationType.EVENT_UPDATED,
          title: 'Event Updated',
          body: `"${event.title}" has been updated. Check the new details.`,
          link: `${process.env.FRONTEND_URL}/resources/events`,
          meta: {
            eventTitle: event.title,
            startTime: event.startTime,
            endTime: event.endTime,
          },
        })),
      )
      .catch((err) => this.logger.error('notification fan-out failed', err));
  }

  private async notifyAttendeesCancellation(event: any, reason?: string) {
    const registrations = await this.prisma.eventRegistration.findMany({
      where: { eventId: event.id },
      include: { user: { select: { fullName: true, email: true } } },
    });
    await Promise.allSettled(
      registrations.map((r) =>
        this.emailService.sendEventCancellationNotification({
          fullName: r.user.fullName,
          email: r.user.email,
          eventTitle: event.title,
          reason,
        }),
      ),
    );

    // Fan-out to all attendees after cancellation:
    const attendeeIds = registrations.map((r) => r.userId);
    this.notifications
      .createMany(
        attendeeIds.map((uid) => ({
          userId: uid,
          type: NotificationType.EVENT_CANCELLED,
          title: 'Event Cancelled',
          body: `"${event.title}" has been cancelled. ${reason ?? ''}`.trim(),
          link: `${process.env.FRONTEND_URL}/resources/events`,
          meta: { eventTitle: event.title, reason: reason },
        })),
      )
      .catch((err) => this.logger.error('notification fan-out failed', err));
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // SCHEDULED: Mark past events
  // ─────────────────────────────────────────────────────────────────────────────

  /**
   * Runs every day at 01:00 AM server time.
   */
  @Cron(CronExpression.EVERY_DAY_AT_1AM)
  async markExpiredEventsAsPast(): Promise<void> {
    try {
      const now = new Date();

      await this.prisma.event.updateMany({
        where: {
          isPast: false,
          isCancelled: false,
          endTime: { lt: now },
        },
        data: { isPast: true },
      });
    } catch (error) {
      this.logger.error('markExpiredEventsAsPast failed', error);
    }
  }
}
