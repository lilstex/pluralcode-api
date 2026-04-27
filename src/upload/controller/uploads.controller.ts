import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Query,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiBody,
  ApiConsumes,
  ApiOperation,
  ApiQuery,
  ApiTags,
} from '@nestjs/swagger';
import { UploadsService } from '../service/uploads.service';
import { FileInterceptor } from '@nestjs/platform-express';
import { AzureContainer } from 'src/providers/azure/azure.blob.service';
import { CurrentUser } from 'src/common/decorators/current-user.decorator';
import { JwtAuthGuard } from 'src/common/guards/jwt-auth.guard';
import { RolesGuard } from 'src/common/guards/roles.guard';
import { PermissionsGuard } from 'src/common/guards/permissions.guard';
import { Roles } from 'src/common/decorators/roles.decorator';
import { Role } from '@prisma/client';

@ApiTags('Uploads')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard)
@Roles(Role.SUPER_ADMIN, Role.RESOURCE_ADMIN)
@Controller('uploads')
export class UploadsController {
  constructor(private readonly uploadsService: UploadsService) {}

  @Post()
  @ApiOperation({ summary: 'Upload a file and save reference to DB' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        file: {
          type: 'string',
          format: 'binary', // This tells Swagger to show the file picker
        },
        container: {
          type: 'string',
          enum: [
            'avatars',
            'resources',
            'oda-evidence',
            'communities',
            'news-attachments',
            'org-logos',
            'categories',
            'news',
          ],
          description: 'The target Azure container for the upload',
        },
      },
      required: ['file', 'container'],
    },
  })
  @UseInterceptors(FileInterceptor('file'))
  upload(
    @UploadedFile() file: Express.Multer.File,
    @Body('container') container: AzureContainer,
    @CurrentUser() user: any,
  ) {
    return this.uploadsService.uploadFile(file, container, user.id);
  }

  @Get('me')
  @ApiOperation({ summary: 'List all my uploaded files' })
  @ApiQuery({ name: 'page', required: false })
  @ApiQuery({ name: 'limit', required: false })
  async getAllUploads(
    @Query('page') page?: number,
    @Query('limit') limit?: number,
  ) {
    return this.uploadsService.getAllUploads({ page, limit });
  }

  @Get('all')
  @ApiOperation({ summary: 'List all my uploaded files' })
  @ApiQuery({ name: 'page', required: false })
  @ApiQuery({ name: 'limit', required: false })
  async getMyFiles(
    @CurrentUser() user: any,
    @Query('page') page?: number,
    @Query('limit') limit?: number,
  ) {
    return this.uploadsService.getMyUploads(user.id, { page, limit });
  }

  @Delete('admin/:id')
  @ApiOperation({ summary: 'Admin delete file from both Azure and Database' })
  async adminRemoveFile(@Param('id') id: string) {
    return this.uploadsService.adminDeleteFile(id);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete file from both Azure and Database' })
  async removeFile(@Param('id') id: string, @CurrentUser() user: any) {
    return this.uploadsService.deleteFile(id, user.id);
  }
}
