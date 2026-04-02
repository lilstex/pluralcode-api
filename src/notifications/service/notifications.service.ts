import { Injectable, HttpStatus, Logger } from '@nestjs/common';
import { NotificationType } from '@prisma/client';
import { PrismaService } from 'src/prisma-module/prisma.service';
import {
  CreateNotificationDto,
  NotificationQueryDto,
  MarkReadDto,
} from '../dto/notifications.dto';

@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);

  constructor(private readonly prisma: PrismaService) {}

  // ─────────────────────────────────────────────────────────────────────────────
  // CREATE  (called internally by other services — not exposed via HTTP POST)
  // ─────────────────────────────────────────────────────────────────────────────

  /**
   * Creates a single notification for one recipient.
   *
   * Fire-and-forget pattern recommended:
   *   this.notificationsService.create({ ... }).catch(err => this.logger.error(...))
   *
   * Returns the created notification so callers can inspect it if needed,
   * but errors are swallowed with a log — a notification failure should never
   * break the primary action that triggered it.
   */
  async create(dto: CreateNotificationDto) {
    try {
      const notification = await this.prisma.notification.create({
        data: {
          userId: dto.userId,
          type: dto.type,
          title: dto.title,
          body: dto.body,
          link: dto.link ?? null,
          meta: dto.meta ?? null,
        },
      });
      return notification;
    } catch (error) {
      this.logger.error('NotificationsService.create error', error);
      return null;
    }
  }

  /**
   * Bulk-creates notifications for multiple recipients in a single transaction.
   * Use this for fan-out scenarios (e.g. notify all event attendees of a change).
   */
  async createMany(dtos: CreateNotificationDto[]) {
    if (!dtos.length) return;
    try {
      await this.prisma.notification.createMany({
        data: dtos.map((dto) => ({
          userId: dto.userId,
          type: dto.type,
          title: dto.title,
          body: dto.body,
          link: dto.link ?? null,
          meta: dto.meta ?? null,
        })),
        skipDuplicates: true,
      });
    } catch (error) {
      this.logger.error('NotificationsService.createMany error', error);
    }
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // LIST  (authenticated user's own notifications)
  // ─────────────────────────────────────────────────────────────────────────────

  async listForUser(userId: string, query: NotificationQueryDto) {
    try {
      const page = Math.max(1, parseInt(String(query.page ?? '1'), 10) || 1);
      const limit = Math.min(
        100,
        Math.max(1, parseInt(String(query.limit ?? '20'), 10) || 20),
      );
      const skip = (page - 1) * limit;

      const where: any = { userId };
      if (query.isRead !== undefined) where.isRead = query.isRead;
      if (query.type) where.type = query.type;

      const [notifications, total, unreadCount] =
        await this.prisma.$transaction([
          this.prisma.notification.findMany({
            where,
            skip,
            take: limit,
            orderBy: { createdAt: 'desc' },
          }),
          this.prisma.notification.count({ where }),
          // Always return current unread count alongside the list
          this.prisma.notification.count({ where: { userId, isRead: false } }),
        ]);

      return {
        status: true,
        statusCode: HttpStatus.OK,
        message: 'Notifications retrieved.',
        data: {
          notifications,
          total,
          unreadCount,
          page,
          limit,
          pages: Math.ceil(total / limit),
        },
      };
    } catch (error) {
      this.logger.error('listForUser error', error);
      return {
        status: false,
        statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
        message: 'Server error.',
      };
    }
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // UNREAD COUNT  (lightweight — for notification bell badge)
  // ─────────────────────────────────────────────────────────────────────────────

  async getUnreadCount(userId: string) {
    try {
      const count = await this.prisma.notification.count({
        where: { userId, isRead: false },
      });
      return {
        status: true,
        statusCode: HttpStatus.OK,
        message: 'Unread count retrieved.',
        data: { unreadCount: count },
      };
    } catch (error) {
      this.logger.error('getUnreadCount error', error);
      return {
        status: false,
        statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
        message: 'Server error.',
      };
    }
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // MARK AS READ
  // ─────────────────────────────────────────────────────────────────────────────

  /**
   * Mark specific notifications as read.
   * Only updates notifications that belong to the requesting user — prevents
   * a user marking another user's notifications as read.
   */
  async markRead(userId: string, dto: MarkReadDto) {
    try {
      const { count } = await this.prisma.notification.updateMany({
        where: {
          id: { in: dto.ids },
          userId, // ownership check
          isRead: false,
        },
        data: { isRead: true },
      });

      return {
        status: true,
        statusCode: HttpStatus.OK,
        message: `${count} notification(s) marked as read.`,
        data: { updatedCount: count },
      };
    } catch (error) {
      this.logger.error('markRead error', error);
      return {
        status: false,
        statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
        message: 'Server error.',
      };
    }
  }

  /**
   * Mark ALL unread notifications as read for the requesting user.
   */
  async markAllRead(userId: string) {
    try {
      const { count } = await this.prisma.notification.updateMany({
        where: { userId, isRead: false },
        data: { isRead: true },
      });

      return {
        status: true,
        statusCode: HttpStatus.OK,
        message: `${count} notification(s) marked as read.`,
        data: { updatedCount: count },
      };
    } catch (error) {
      this.logger.error('markAllRead error', error);
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

  /**
   * Delete a single notification.
   * Ownership is enforced — users can only delete their own notifications.
   */
  async deleteOne(userId: string, notificationId: string) {
    try {
      const notification = await this.prisma.notification.findUnique({
        where: { id: notificationId },
        select: { id: true, userId: true },
      });

      if (!notification) {
        return {
          status: false,
          statusCode: HttpStatus.NOT_FOUND,
          message: 'Notification not found.',
        };
      }

      if (notification.userId !== userId) {
        return {
          status: false,
          statusCode: HttpStatus.FORBIDDEN,
          message: 'You do not have permission to delete this notification.',
        };
      }

      await this.prisma.notification.delete({ where: { id: notificationId } });

      return {
        status: true,
        statusCode: HttpStatus.OK,
        message: 'Notification deleted.',
      };
    } catch (error) {
      this.logger.error('deleteOne error', error);
      return {
        status: false,
        statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
        message: 'Server error.',
      };
    }
  }

  /**
   * Delete ALL notifications for the requesting user (clear inbox).
   */
  async deleteAll(userId: string) {
    try {
      const { count } = await this.prisma.notification.deleteMany({
        where: { userId },
      });

      return {
        status: true,
        statusCode: HttpStatus.OK,
        message: `${count} notification(s) deleted.`,
        data: { deletedCount: count },
      };
    } catch (error) {
      this.logger.error('deleteAll error', error);
      return {
        status: false,
        statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
        message: 'Server error.',
      };
    }
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // ADMIN: BROADCAST
  // ─────────────────────────────────────────────────────────────────────────────

  /**
   * Send a SYSTEM_ANNOUNCEMENT to every approved user.
   * Runs in chunks of 500 to avoid hitting Prisma batch limits.
   */
  async broadcast(title: string, body: string, link?: string) {
    try {
      const users = await this.prisma.user.findMany({
        where: { status: 'APPROVED' },
        select: { id: true },
      });

      const CHUNK = 500;
      let created = 0;

      for (let i = 0; i < users.length; i += CHUNK) {
        const chunk = users.slice(i, i + CHUNK);
        const result = await this.prisma.notification.createMany({
          data: chunk.map((u) => ({
            userId: u.id,
            type: NotificationType.SYSTEM_ANNOUNCEMENT,
            title,
            body,
            link: link ?? null,
          })),
          skipDuplicates: true,
        });
        created += result.count;
      }

      this.logger.log(`broadcast: sent "${title}" to ${created} users`);

      return {
        status: true,
        statusCode: HttpStatus.CREATED,
        message: `Announcement sent to ${created} user(s).`,
        data: { sentCount: created },
      };
    } catch (error) {
      this.logger.error('broadcast error', error);
      return {
        status: false,
        statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
        message: 'Server error.',
      };
    }
  }
}
