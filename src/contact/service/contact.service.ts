import { HttpStatus, Injectable, Logger } from '@nestjs/common';
import { EmailService } from 'src/providers/email/email.service';
import {
  CreateContactMessageDto,
  UpdateContactStatusDto,
  ListContactMessagesDto,
  ContactMessageStatus,
} from '../dto/contact.dto';
import { PrismaService } from 'src/prisma-module/prisma.service';

@Injectable()
export class ContactService {
  private readonly logger = new Logger(ContactService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly email: EmailService,
  ) {}

  // ── Public ───────────────────────────────────────────────────────────────────

  async submit(dto: CreateContactMessageDto) {
    try {
      const message = await this.prisma.contactMessage.create({
        data: {
          name: dto.name.trim(),
          email: dto.email.trim().toLowerCase(),
          phone: dto.phone?.trim() ?? null,
          subject: dto.subject.trim(),
          message: dto.message.trim(),
        },
      });

      // Fire emails — forward to support inbox + auto-reply to sender.
      // Both are fire-and-forget; a mail failure should not fail the submission.
      this.email
        .sendContactNotification(message)
        .catch((err) =>
          this.logger.error('Contact notification email failed', err),
        );

      this.email
        .sendContactAutoReply({ name: message.name, email: message.email })
        .catch((err) =>
          this.logger.error('Contact auto-reply email failed', err),
        );

      return {
        status: true,
        statusCode: HttpStatus.CREATED,
        message: 'Your message has been received. We will be in touch shortly.',
        data: { id: message.id },
      };
    } catch (error) {
      this.logger.error('ContactService.submit error', error);
      return {
        status: false,
        statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
        message: 'Server error.',
      };
    }
  }

  // ── Admin ────────────────────────────────────────────────────────────────────

  async list(query: ListContactMessagesDto) {
    try {
      const page = Math.max(1, query.page ?? 1);
      const limit = Math.min(100, Math.max(1, query.limit ?? 20));
      const skip = (page - 1) * limit;

      const where: any = {};
      if (query.status) where.status = query.status;
      if (query.search) {
        where.OR = [
          { name: { contains: query.search, mode: 'insensitive' } },
          { email: { contains: query.search, mode: 'insensitive' } },
          { subject: { contains: query.search, mode: 'insensitive' } },
        ];
      }

      const [messages, total] = await Promise.all([
        this.prisma.contactMessage.findMany({
          where,
          skip,
          take: limit,
          orderBy: { createdAt: 'desc' },
        }),
        this.prisma.contactMessage.count({ where }),
      ]);

      return {
        status: true,
        statusCode: HttpStatus.OK,
        message: 'Messages retrieved.',
        data: {
          messages,
          total,
          page,
          limit,
          pages: Math.ceil(total / limit),
          // Unread count — always useful for badge indicators
          unreadCount: await this.prisma.contactMessage.count({
            where: { status: ContactMessageStatus.UNREAD },
          }),
        },
      };
    } catch (error) {
      this.logger.error('ContactService.list error', error);
      return {
        status: false,
        statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
        message: 'Server error.',
      };
    }
  }

  async getById(id: string) {
    try {
      const message = await this.prisma.contactMessage.findUnique({
        where: { id },
      });
      if (!message)
        return {
          status: false,
          statusCode: HttpStatus.NOT_FOUND,
          message: 'Message not found.',
        };

      // Auto-mark as READ when an admin opens it
      if (message.status === ContactMessageStatus.UNREAD) {
        await this.prisma.contactMessage.update({
          where: { id },
          data: { status: ContactMessageStatus.READ },
        });
        message.status = ContactMessageStatus.READ;
      }

      return {
        status: true,
        statusCode: HttpStatus.OK,
        message: 'Message retrieved.',
        data: message,
      };
    } catch (error) {
      this.logger.error('ContactService.getById error', error);
      return {
        status: false,
        statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
        message: 'Server error.',
      };
    }
  }

  async updateStatus(id: string, dto: UpdateContactStatusDto) {
    try {
      const message = await this.prisma.contactMessage.findUnique({
        where: { id },
      });
      if (!message)
        return {
          status: false,
          statusCode: HttpStatus.NOT_FOUND,
          message: 'Message not found.',
        };

      const updated = await this.prisma.contactMessage.update({
        where: { id },
        data: { status: dto.status },
      });

      return {
        status: true,
        statusCode: HttpStatus.OK,
        message: 'Status updated.',
        data: updated,
      };
    } catch (error) {
      this.logger.error('ContactService.updateStatus error', error);
      return {
        status: false,
        statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
        message: 'Server error.',
      };
    }
  }

  async remove(id: string) {
    try {
      const message = await this.prisma.contactMessage.findUnique({
        where: { id },
      });
      if (!message)
        return {
          status: false,
          statusCode: HttpStatus.NOT_FOUND,
          message: 'Message not found.',
        };

      await this.prisma.contactMessage.delete({ where: { id } });
      return {
        status: true,
        statusCode: HttpStatus.OK,
        message: 'Message deleted.',
      };
    } catch (error) {
      this.logger.error('ContactService.remove error', error);
      return {
        status: false,
        statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
        message: 'Server error.',
      };
    }
  }
}
