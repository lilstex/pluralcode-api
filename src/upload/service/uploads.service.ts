import {
  Injectable,
  HttpStatus,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from 'src/prisma-module/prisma.service';
import {
  AzureBlobService,
  AzureContainer,
} from 'src/providers/azure/azure.blob.service';

@Injectable()
export class UploadsService {
  private readonly logger = new Logger(UploadsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly azureBlob: AzureBlobService,
  ) {}

  async uploadFile(
    file: Express.Multer.File,
    container: AzureContainer,
    userId: string,
  ) {
    try {
      // 1. Upload to Azure
      const url = await this.azureBlob.upload(file, container);
      const fileName = file.originalname;

      // 2. Save to Database
      const upload = await this.prisma.upload.create({
        data: {
          fileName,
          url,
          container,
          mimeType: file.mimetype,
          fileSize: file.size,
          uploadedById: userId,
        },
      });

      return {
        status: true,
        statusCode: HttpStatus.CREATED,
        message: 'File uploaded and registered.',
        data: upload,
      };
    } catch (error) {
      this.logger.error('Upload failed', error);
      return { status: false, statusCode: 500, message: 'Upload failed.' };
    }
  }

  async getMyUploads(userId: string, query: { page?: number; limit?: number }) {
    const { page, limit, skip } = this.safePaginate(query.page, query.limit);

    const [items, total] = await this.prisma.$transaction([
      this.prisma.upload.findMany({
        where: { uploadedById: userId },
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.upload.count({ where: { uploadedById: userId } }),
    ]);

    return {
      status: true,
      statusCode: HttpStatus.OK,
      data: items,
      meta: { total, page, limit, pages: Math.ceil(total / limit) },
    };
  }

  async getAllUploads(query: { page?: number; limit?: number }) {
    const { page, limit, skip } = this.safePaginate(query.page, query.limit);

    const [items, total] = await this.prisma.$transaction([
      this.prisma.upload.findMany({
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.upload.count(),
    ]);

    return {
      status: true,
      statusCode: HttpStatus.OK,
      data: items,
      meta: { total, page, limit, pages: Math.ceil(total / limit) },
    };
  }

  async deleteFile(id: string, userId: string) {
    const upload = await this.prisma.upload.findFirst({
      where: { id, uploadedById: userId },
    });

    if (!upload) throw new NotFoundException('File record not found.');

    // 1. Delete from Azure
    await this.azureBlob.delete(upload.url, upload.container as AzureContainer);

    // 2. Delete from DB
    await this.prisma.upload.delete({ where: { id } });

    return {
      status: true,
      statusCode: HttpStatus.OK,
      message: 'File removed from storage and database.',
    };
  }

  async adminDeleteFile(id: string) {
    const upload = await this.prisma.upload.findFirst({
      where: { id },
    });

    if (!upload) throw new NotFoundException('File record not found.');

    // 1. Delete from Azure
    await this.azureBlob.delete(upload.url, upload.container as AzureContainer);

    // 2. Delete from DB
    await this.prisma.upload.delete({ where: { id } });

    return {
      status: true,
      statusCode: HttpStatus.OK,
      message: 'File removed from storage and database.',
    };
  }

  private safePaginate(page: any, limit: any) {
    const p = Math.max(1, parseInt(String(page ?? '1'), 10) || 1);
    const l = Math.min(
      100,
      Math.max(1, parseInt(String(limit ?? '20'), 10) || 20),
    );
    return { page: p, limit: l, skip: (p - 1) * l };
  }
}
