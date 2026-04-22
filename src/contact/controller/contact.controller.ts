import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiParam,
  ApiQuery,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { ContactService } from '../service/contact.service';
import {
  ContactMessageResponseDto,
  ContactMessageStatus,
  CreateContactMessageDto,
  ListContactMessagesDto,
  UpdateContactStatusDto,
} from '../dto/contact.dto';
import { JwtAuthGuard } from 'src/common/guards/jwt-auth.guard';
import { RolesGuard } from 'src/common/guards/roles.guard';
import { Roles } from 'src/common/decorators/roles.decorator';
import { Role } from '@prisma/client';

@ApiTags('Contact')
@Controller('contact')
export class ContactController {
  constructor(private readonly contactService: ContactService) {}

  // ── Public ───────────────────────────────────────────────────────────────────

  @Post()
  @ApiOperation({
    summary: 'Submit a contact us message (public)',
    description:
      'Saves the message to the database and forwards it to the support inbox. ' +
      'An auto-reply confirmation is also sent to the submitter.',
  })
  @ApiResponse({ status: 201, type: ContactMessageResponseDto })
  submit(@Body() dto: CreateContactMessageDto) {
    return this.contactService.submit(dto);
  }

  // ── Admin ────────────────────────────────────────────────────────────────────

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.SUPER_ADMIN, Role.CONTENT_ADMIN)
  @ApiBearerAuth()
  @Get()
  @ApiOperation({ summary: 'List all contact messages (admin)' })
  @ApiQuery({ name: 'status', enum: ContactMessageStatus, required: false })
  @ApiQuery({
    name: 'search',
    required: false,
    description: 'Search by name, email or subject',
  })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiResponse({ status: 200, type: ContactMessageResponseDto, isArray: true })
  list(@Query() query: ListContactMessagesDto) {
    return this.contactService.list(query);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.SUPER_ADMIN, Role.CONTENT_ADMIN)
  @ApiBearerAuth()
  @Get(':id')
  @ApiOperation({
    summary: 'Get a single contact message (admin)',
    description: 'Auto-marks the message as READ when first opened.',
  })
  @ApiParam({ name: 'id', description: 'ContactMessage UUID' })
  @ApiResponse({ status: 200, type: ContactMessageResponseDto })
  getById(@Param('id', ParseUUIDPipe) id: string) {
    return this.contactService.getById(id);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.SUPER_ADMIN, Role.CONTENT_ADMIN)
  @ApiBearerAuth()
  @Patch(':id/status')
  @ApiOperation({ summary: 'Update the status of a contact message (admin)' })
  @ApiParam({ name: 'id', description: 'ContactMessage UUID' })
  @ApiResponse({ status: 200, type: ContactMessageResponseDto })
  updateStatus(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateContactStatusDto,
  ) {
    return this.contactService.updateStatus(id, dto);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.SUPER_ADMIN)
  @ApiBearerAuth()
  @Delete(':id')
  @ApiOperation({ summary: 'Delete a contact message (super admin only)' })
  @ApiParam({ name: 'id', description: 'ContactMessage UUID' })
  @ApiResponse({ status: 200 })
  remove(@Param('id', ParseUUIDPipe) id: string) {
    return this.contactService.remove(id);
  }
}
