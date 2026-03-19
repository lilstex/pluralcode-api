import { Injectable, HttpStatus, Logger } from '@nestjs/common';
import { PrismaService } from 'src/prisma.service';
import { AzureBlobService } from 'src/providers/azure/azure.blob.service';
import { JitsiService } from 'src/providers/jitsi/jitsi.service';
import { EmailService } from 'src/providers/email/email.service';
import {
  CreateEventDto,
  UpdateEventDto,
  EventQueryDto,
  CancelEventDto,
  EventStatus,
} from '../dto/events.dto';

@Injectable()
export class EventService {
  private readonly logger = new Logger(EventService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly azureBlob: AzureBlobService,
    private readonly jitsi: JitsiService,
    private readonly emailService: EmailService,
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
    return {
      ...rest,
      meetingUrl:
        event.externalMeetingUrl ??
        jitsiService.getMeetingUrl(event.jitsiRoomId),
      status: this.resolveStatus(event),
      registrationCount: _count?.registrations ?? registrations?.length ?? 0,
    };
  }

  /**
   * Generates an ICS calendar file string for an event.
   * Compatible with Google Calendar, Outlook, and Apple Calendar.
   */
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

  async createEvent(adminId: string, dto: CreateEventDto) {
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
      const meetingUrl = this.jitsi.getMeetingUrl(jitsiRoomId);

      const event = await this.prisma.event.create({
        data: {
          title: dto.title,
          description: dto.description,
          startTime: start,
          endTime: end,
          jitsiRoomId,
          capacity: dto.capacity ?? null,
          tags: dto.tags ?? [],
          externalMeetingUrl: meetingUrl ?? null,
        },
        include: { _count: { select: { registrations: true } } },
      });

      await this.prisma.auditLog.create({
        data: {
          action: 'EVENT_CREATED',
          entity: 'Event',
          entityId: event.id,
          details: { title: event.title, startTime: event.startTime } as any,
          adminId,
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

  async listEvents(query: EventQueryDto) {
    try {
      const page = Math.max(1, parseInt(String(query.page ?? '1'), 10) || 1);
      const limit = Math.min(
        100,
        Math.max(1, parseInt(String(query.limit ?? '20'), 10) || 20),
      );
      const skip = (page - 1) * limit;

      const where: any = {};

      if (query.search) {
        where.OR = [
          { title: { contains: query.search, mode: 'insensitive' } },
          { description: { contains: query.search, mode: 'insensitive' } },
        ];
      }

      if (query.tag) {
        where.tags = { has: query.tag };
      }

      if (query.dateFrom || query.dateTo) {
        where.startTime = {};
        if (query.dateFrom) where.startTime.gte = new Date(query.dateFrom);
        if (query.dateTo) where.startTime.lte = new Date(query.dateTo);
      }

      // Map status filter to DB fields
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

      return {
        status: true,
        statusCode: HttpStatus.OK,
        message: 'Events retrieved.',
        data: {
          events: events.map((e) => this.buildEventResponse(e, this.jitsi)),
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

      if (!event) {
        return {
          status: false,
          statusCode: HttpStatus.NOT_FOUND,
          message: 'Event not found.',
        };
      }

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
  // UPDATE
  // ─────────────────────────────────────────────────────────────────────────────

  async updateEvent(adminId: string, id: string, dto: UpdateEventDto) {
    try {
      const event = await this.prisma.event.findUnique({ where: { id } });
      if (!event) {
        return {
          status: false,
          statusCode: HttpStatus.NOT_FOUND,
          message: 'Event not found.',
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
          adminId,
        },
      });

      // If times changed, notify registered attendees
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

  async cancelEvent(adminId: string, id: string, dto: CancelEventDto) {
    try {
      const event = await this.prisma.event.findUnique({ where: { id } });
      if (!event) {
        return {
          status: false,
          statusCode: HttpStatus.NOT_FOUND,
          message: 'Event not found.',
        };
      }

      if (event.isCancelled) {
        return {
          status: false,
          statusCode: HttpStatus.BAD_REQUEST,
          message: 'Event is already cancelled.',
        };
      }

      if (event.isPast) {
        return {
          status: false,
          statusCode: HttpStatus.BAD_REQUEST,
          message: 'Cannot cancel a past event.',
        };
      }

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
            adminId,
          },
        }),
      ]);

      // Notify all registered attendees
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

  async deleteEvent(adminId: string, id: string) {
    try {
      const event = await this.prisma.event.findUnique({ where: { id } });
      if (!event) {
        return {
          status: false,
          statusCode: HttpStatus.NOT_FOUND,
          message: 'Event not found.',
        };
      }

      // Delete cover image from Azure if present
      if (event.coverImageUrl) {
        await this.azureBlob.delete(event.coverImageUrl, 'avatars');
      }

      await this.prisma.$transaction([
        this.prisma.eventRegistration.deleteMany({ where: { eventId: id } }),
        this.prisma.event.delete({ where: { id } }),
        this.prisma.auditLog.create({
          data: {
            action: 'EVENT_DELETED',
            entity: 'Event',
            entityId: id,
            details: { title: event.title } as any,
            adminId,
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
    adminId: string,
    eventId: string,
    file: Express.Multer.File,
  ) {
    try {
      const event = await this.prisma.event.findUnique({
        where: { id: eventId },
      });
      if (!event) {
        return {
          status: false,
          statusCode: HttpStatus.NOT_FOUND,
          message: 'Event not found.',
        };
      }

      if (event.coverImageUrl) {
        await this.azureBlob.delete(event.coverImageUrl, 'avatars');
      }

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
          adminId,
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
  // MARK PAST / SET ARCHIVE URL (called by admin after event ends)
  // ─────────────────────────────────────────────────────────────────────────────

  async markPastAndArchive(
    adminId: string,
    eventId: string,
    archiveUrl?: string,
  ) {
    try {
      const event = await this.prisma.event.findUnique({
        where: { id: eventId },
      });
      if (!event) {
        return {
          status: false,
          statusCode: HttpStatus.NOT_FOUND,
          message: 'Event not found.',
        };
      }

      await this.prisma.event.update({
        where: { id: eventId },
        data: {
          isPast: true,
          archiveUrl: archiveUrl ?? null,
        },
      });

      await this.prisma.auditLog.create({
        data: {
          action: 'EVENT_ARCHIVED',
          entity: 'Event',
          entityId: eventId,
          details: { archiveUrl } as any,
          adminId,
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

      if (!event) {
        return {
          status: false,
          statusCode: HttpStatus.NOT_FOUND,
          message: 'Event not found.',
        };
      }

      if (event.isCancelled) {
        return {
          status: false,
          statusCode: HttpStatus.BAD_REQUEST,
          message: 'This event has been cancelled.',
        };
      }

      if (event.isPast) {
        return {
          status: false,
          statusCode: HttpStatus.BAD_REQUEST,
          message: 'This event has already ended.',
        };
      }

      // Capacity check
      if (event.capacity && event._count.registrations >= event.capacity) {
        return {
          status: false,
          statusCode: HttpStatus.CONFLICT,
          message: 'This event is fully booked.',
        };
      }

      // Duplicate check
      const existing = await this.prisma.eventRegistration.findUnique({
        where: { userId_eventId: { userId, eventId } },
      });

      if (existing) {
        return {
          status: false,
          statusCode: HttpStatus.CONFLICT,
          message: 'You are already registered for this event.',
        };
      }

      const registration = await this.prisma.eventRegistration.create({
        data: { userId, eventId },
        include: { user: { select: { fullName: true, email: true } } },
      });

      // Send confirmation email + ICS attachment (fire-and-forget)
      const meetingUrl =
        event.externalMeetingUrl ?? this.jitsi.getMeetingUrl(event.jitsiRoomId);
      const icsContent = this.generateIcs({
        id: event.id,
        title: event.title,
        description: event.description,
        startTime: event.startTime,
        endTime: event.endTime,
        meetingUrl,
      });

      this.emailService
        .sendEventRegistrationConfirmation({
          fullName: registration.user.fullName,
          email: registration.user.email,
          eventTitle: event.title,
          startTime: event.startTime,
          endTime: event.endTime,
          meetingUrl,
          icsContent,
        })
        .catch((err) =>
          this.logger.error('sendEventRegistrationConfirmation failed', err),
        );

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

  async unregisterFromEvent(userId: string, eventId: string) {
    try {
      const registration = await this.prisma.eventRegistration.findUnique({
        where: { userId_eventId: { userId, eventId } },
      });

      if (!registration) {
        return {
          status: false,
          statusCode: HttpStatus.NOT_FOUND,
          message: 'Registration not found.',
        };
      }

      const event = await this.prisma.event.findUnique({
        where: { id: eventId },
      });
      if (event?.isPast) {
        return {
          status: false,
          statusCode: HttpStatus.BAD_REQUEST,
          message: 'Cannot unregister from a past event.',
        };
      }

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
            event: {
              include: { _count: { select: { registrations: true } } },
            },
          },
          orderBy: { createdAt: 'desc' },
        }),
        this.prisma.eventRegistration.count({ where: { userId } }),
      ]);

      const data = registrations.map((r) => ({
        registrationId: r.id,
        registeredAt: r.createdAt,
        event: this.buildEventResponse(r.event, this.jitsi),
      }));

      return {
        status: true,
        statusCode: HttpStatus.OK,
        message: 'Registrations retrieved.',
        data: {
          registrations: data,
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
      if (!event) {
        return {
          status: false,
          statusCode: HttpStatus.NOT_FOUND,
          message: 'Event not found.',
        };
      }

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

      if (!registration) {
        return {
          status: false,
          statusCode: HttpStatus.NOT_FOUND,
          message: 'Registration not found.',
        };
      }

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

  async getJitsiToken(userId: string, eventId: string, userRole: string) {
    try {
      const event = await this.prisma.event.findUnique({
        where: { id: eventId },
      });
      if (!event) {
        return {
          status: false,
          statusCode: HttpStatus.NOT_FOUND,
          message: 'Event not found.',
        };
      }

      if (event.isCancelled) {
        return {
          status: false,
          statusCode: HttpStatus.BAD_REQUEST,
          message: 'This event has been cancelled.',
        };
      }

      // Only registered users can get a token (unless they are admins)
      const isAdmin = ['SUPER_ADMIN', 'EVENT_ADMIN', 'NGO_MEMBER'].includes(
        userRole,
      );

      if (!isAdmin) {
        const registration = await this.prisma.eventRegistration.findUnique({
          where: { userId_eventId: { userId, eventId } },
        });

        if (!registration) {
          return {
            status: false,
            statusCode: HttpStatus.FORBIDDEN,
            message: 'You must register for this event before joining.',
          };
        }
      }

      const user = await this.prisma.user.findUnique({
        where: { id: userId },
        select: { id: true, fullName: true, email: true, avatarUrl: true },
      });

      if (!user) {
        return {
          status: false,
          statusCode: HttpStatus.NOT_FOUND,
          message: 'User not found.',
        };
      }

      const isModerator = isAdmin;

      const token = this.jitsi.generateToken(
        event.jitsiRoomId,
        {
          userId: user.id,
          fullName: user.fullName,
          email: user.email,
          avatarUrl: user.avatarUrl ?? undefined,
          isModerator,
        },
        event.endTime,
      );

      return {
        status: true,
        statusCode: HttpStatus.OK,
        message: 'Jitsi token generated.',
        data: {
          token,
          roomId: event.jitsiRoomId,
          meetingUrl:
            event.externalMeetingUrl ??
            this.jitsi.getMeetingUrl(event.jitsiRoomId),
          expiresAt: event.endTime.toISOString(),
        },
      };
    } catch (error) {
      this.logger.error('getJitsiToken error', error);
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

      if (!event) {
        return {
          status: false,
          statusCode: HttpStatus.NOT_FOUND,
          message: 'Event not found.',
        };
      }

      if (!registration) {
        return {
          status: false,
          statusCode: HttpStatus.FORBIDDEN,
          message: 'You are not registered for this event.',
        };
      }

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

  // ─────────────────────────────────────────────────────────────────────────────
  // PRIVATE: EMAIL NOTIFICATION HELPERS
  // ─────────────────────────────────────────────────────────────────────────────

  private async notifyAttendeesOfUpdate(event: any) {
    const registrations = await this.prisma.eventRegistration.findMany({
      where: { eventId: event.id },
      include: { user: { select: { fullName: true, email: true } } },
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
            this.jitsi.getMeetingUrl(event.jitsiRoomId),
        }),
      ),
    );
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
  }
}
