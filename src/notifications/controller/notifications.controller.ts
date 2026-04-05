import {
  Controller,
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
  Post,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiParam,
} from '@nestjs/swagger';
import { Role } from '@prisma/client';

import { NotificationsService } from '../service/notifications.service';
import { NotificationQueryDto, MarkReadDto } from '../dto/notifications.dto';

import { JwtAuthGuard } from 'src/common/guards/jwt-auth.guard';
import { RolesGuard } from 'src/common/guards/roles.guard';
import { Roles } from 'src/common/decorators/roles.decorator';
import { CurrentUser } from 'src/common/decorators/current-user.decorator';

// ─────────────────────────────────────────────────────────────────────────────
// Broadcast body DTO (inline — only used in one admin endpoint)
// ─────────────────────────────────────────────────────────────────────────────
import { IsString, IsNotEmpty, IsOptional } from 'class-validator';
import { ApiPropertyOptional, ApiProperty } from '@nestjs/swagger';

class BroadcastDto {
  @ApiProperty({ example: 'Platform Maintenance' })
  @IsNotEmpty()
  @IsString()
  title: string;

  @ApiProperty({
    example: 'The platform will be down for maintenance on Sunday 2am–4am WAT.',
  })
  @IsNotEmpty()
  @IsString()
  body: string;

  @ApiPropertyOptional({ example: '/announcements' })
  @IsOptional()
  @IsString()
  link?: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Controller
// ─────────────────────────────────────────────────────────────────────────────

@ApiTags('Notifications')
@Controller('notifications')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class NotificationsController {
  constructor(private readonly notificationsService: NotificationsService) {}

  // ── STATIC ROUTES  (declare before any :id params) ───────────────────────

  /**
   * GET /notifications/unread-count
   * Lightweight endpoint polled by the frontend notification bell badge.
   */
  @Get('unread-count')
  @ApiOperation({
    summary: 'Get unread notification count for the current user',
  })
  @ApiResponse({ status: 200, description: '{ unreadCount: number }' })
  getUnreadCount(@CurrentUser() user: any) {
    return this.notificationsService.getUnreadCount(user.id);
  }

  /**
   * PATCH /notifications/mark-all-read
   * Mark every unread notification as read in one call.
   */
  @Patch('mark-all-read')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Mark all notifications as read' })
  markAllRead(@CurrentUser() user: any) {
    return this.notificationsService.markAllRead(user.id);
  }

  /**
   * DELETE /notifications/clear
   * Delete all notifications for the current user.
   */
  @Delete('clear')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Delete all notifications for the current user' })
  deleteAll(@CurrentUser() user: any) {
    return this.notificationsService.deleteAll(user.id);
  }

  /**
   * POST /notifications/admin/broadcast
   * Admin-only: send a SYSTEM_ANNOUNCEMENT to all approved users.
   */
  @Post('admin/broadcast')
  @UseGuards(RolesGuard)
  @Roles(Role.SUPER_ADMIN, Role.CONTENT_ADMIN)
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary:
      'Broadcast a system announcement to all approved users (admin only)',
  })
  broadcast(@Body() dto: BroadcastDto) {
    return this.notificationsService.broadcast(dto.title, dto.body, dto.link);
  }

  // ── PARAMETERISED ROUTES ─────────────────────────────────────────────────

  /**
   * GET /notifications
   * Paginated list of the current user's notifications.
   * Optional filters: isRead, type, page, limit.
   */
  @Get()
  @ApiOperation({ summary: 'List notifications for the current user' })
  @ApiResponse({
    status: 200,
    description: 'Paginated notification list with unreadCount',
  })
  list(@CurrentUser() user: any, @Query() query: NotificationQueryDto) {
    return this.notificationsService.listForUser(user.id, query);
  }

  /**
   * PATCH /notifications/mark-read
   * Mark specific notification IDs as read.
   */
  @Patch('mark-read')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Mark specific notifications as read' })
  markRead(@CurrentUser() user: any, @Body() dto: MarkReadDto) {
    return this.notificationsService.markRead(user.id, dto);
  }

  /**
   * DELETE /notifications/:id
   * Delete a single notification (must belong to the current user).
   */
  @Delete(':id')
  @HttpCode(HttpStatus.OK)
  @ApiParam({ name: 'id', type: String })
  @ApiOperation({ summary: 'Delete a single notification' })
  deleteOne(@CurrentUser() user: any, @Param('id', ParseUUIDPipe) id: string) {
    return this.notificationsService.deleteOne(user.id, id);
  }
}
