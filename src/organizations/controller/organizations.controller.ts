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
  CreateOrganizationDto,
  UpdateOrganizationDto,
  AssignUsersToOrgDto,
  RemoveUsersFromOrgDto,
  OrganizationResponseDto,
} from '../dto/organizations.dto';
import { OrganizationService } from '../service/organizations.service';

import { JwtAuthGuard } from 'src/common/guards/jwt-auth.guard';
import { RolesGuard } from 'src/common/guards/roles.guard';
import { PermissionsGuard } from 'src/common/guards/permissions.guard';
import { Roles } from 'src/common/decorators/roles.decorator';
import { Permissions } from 'src/common/decorators/permissions.decorator';
import { CurrentUser } from 'src/common/decorators/current-user.decorator';
import { PERMISSIONS } from 'src/common/constants/permissions';

@ApiTags('Organizations')
@Controller('organizations')
export class OrganizationController {
  constructor(private readonly orgService: OrganizationService) {}

  // ─────────────────────────────────────────────────────────────────────────────
  // CREATE
  // ─────────────────────────────────────────────────────────────────────────────

  @UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard)
  @Roles(Role.SUPER_ADMIN, Role.CONTENT_ADMIN)
  @Permissions(PERMISSIONS.ORG_CREATE)
  @ApiBearerAuth()
  @Post()
  @ApiOperation({ summary: 'Admin: Create a new organization' })
  @ApiResponse({
    status: 201,
    description: 'Organization created',
    type: OrganizationResponseDto,
  })
  async createOrganization(
    @CurrentUser() admin: any,
    @Body() dto: CreateOrganizationDto,
  ) {
    return this.orgService.createOrganization(admin.id, dto);
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // READ
  // ─────────────────────────────────────────────────────────────────────────────

  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @Permissions(PERMISSIONS.ORG_READ)
  @ApiBearerAuth()
  @Get()
  @ApiOperation({ summary: 'List all organizations with optional filters' })
  @ApiQuery({ name: 'sector', required: false })
  @ApiQuery({ name: 'state', required: false })
  @ApiQuery({
    name: 'search',
    required: false,
    description: 'Search by name or CAC number',
  })
  @ApiQuery({ name: 'page', required: false, example: 1 })
  @ApiQuery({ name: 'limit', required: false, example: 20 })
  async listOrganizations(
    @Query('sector') sector?: string,
    @Query('state') state?: string,
    @Query('search') search?: string,
    @Query('page') page?: number,
    @Query('limit') limit?: number,
  ) {
    return this.orgService.listOrganizations({
      sector,
      state,
      search,
      page,
      limit,
    });
  }

  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @Permissions(PERMISSIONS.ORG_READ)
  @ApiBearerAuth()
  @Get(':id')
  @ApiOperation({ summary: 'Get a single organization by ID' })
  @ApiParam({ name: 'id', description: 'Organization UUID' })
  @ApiResponse({
    status: 200,
    description: 'Organization retrieved',
    type: OrganizationResponseDto,
  })
  async getOrganization(@Param('id', ParseUUIDPipe) id: string) {
    return this.orgService.getOrganization(id);
  }

  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @Permissions(PERMISSIONS.ORG_READ)
  @ApiBearerAuth()
  @Get(':id/members')
  @ApiOperation({ summary: 'List all members of an organization' })
  @ApiParam({ name: 'id', description: 'Organization UUID' })
  async getOrganizationMembers(@Param('id', ParseUUIDPipe) id: string) {
    return this.orgService.getOrganizationMembers(id);
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // UPDATE
  // ─────────────────────────────────────────────────────────────────────────────

  @UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard)
  @Roles(Role.SUPER_ADMIN, Role.CONTENT_ADMIN)
  @Permissions(PERMISSIONS.ORG_UPDATE)
  @ApiBearerAuth()
  @Patch(':id')
  @ApiOperation({ summary: 'Admin: Update organization details' })
  @ApiParam({ name: 'id', description: 'Organization UUID' })
  async updateOrganization(
    @CurrentUser() admin: any,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateOrganizationDto,
  ) {
    return this.orgService.updateOrganization(admin.id, id, dto);
  }

  @UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard)
  @Roles(Role.SUPER_ADMIN, Role.CONTENT_ADMIN)
  @Permissions(PERMISSIONS.ORG_UPDATE)
  @ApiBearerAuth()
  @Post(':id/logo')
  @UseInterceptors(FileInterceptor('file'))
  @ApiOperation({
    summary: 'Admin: Upload organization logo to Azure Blob Storage',
  })
  @ApiParam({ name: 'id', description: 'Organization UUID' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: { file: { type: 'string', format: 'binary' } },
    },
  })
  async uploadLogo(
    @CurrentUser() admin: any,
    @Param('id', ParseUUIDPipe) id: string,
    @UploadedFile(
      new ParseFilePipe({
        validators: [
          new MaxFileSizeValidator({ maxSize: 2 * 1024 * 1024 }),
          new FileTypeValidator({
            fileType: /^image\/(jpeg|png|webp|svg\+xml)$/,
          }),
        ],
      }),
    )
    file: Express.Multer.File,
  ) {
    return this.orgService.uploadLogo(admin.id, id, file);
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // USER ASSIGNMENT
  // ─────────────────────────────────────────────────────────────────────────────

  @UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard)
  @Roles(Role.SUPER_ADMIN, Role.CONTENT_ADMIN)
  @Permissions(PERMISSIONS.ORG_ASSIGN_USER)
  @ApiBearerAuth()
  @Post(':id/members')
  @ApiOperation({
    summary: 'Admin: Assign one or more users to an organization',
    description:
      'Users can belong to multiple organizations. Any user type can be assigned.',
  })
  @ApiParam({ name: 'id', description: 'Organization UUID' })
  async assignUsers(
    @CurrentUser() admin: any,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: AssignUsersToOrgDto,
  ) {
    return this.orgService.assignUsers(admin.id, id, dto);
  }

  @UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard)
  @Roles(Role.SUPER_ADMIN, Role.CONTENT_ADMIN)
  @Permissions(PERMISSIONS.ORG_REMOVE_USER)
  @ApiBearerAuth()
  @Delete(':id/members')
  @ApiOperation({
    summary: 'Admin: Remove one or more users from an organization',
  })
  @ApiParam({ name: 'id', description: 'Organization UUID' })
  async removeUsers(
    @CurrentUser() admin: any,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: RemoveUsersFromOrgDto,
  ) {
    return this.orgService.removeUsers(admin.id, id, dto);
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // DELETE
  // ─────────────────────────────────────────────────────────────────────────────

  @UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard)
  @Roles(Role.SUPER_ADMIN)
  @Permissions(PERMISSIONS.ORG_DELETE)
  @ApiBearerAuth()
  @Delete(':id')
  @ApiOperation({ summary: 'Super Admin: Permanently delete an organization' })
  @ApiParam({ name: 'id', description: 'Organization UUID' })
  async deleteOrganization(
    @CurrentUser() admin: any,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.orgService.deleteOrganization(admin.id, id);
  }
}
