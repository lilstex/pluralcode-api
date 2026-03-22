import {
  Injectable,
  Logger,
  InternalServerErrorException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  BlobServiceClient,
  BlockBlobClient,
  ContainerClient,
} from '@azure/storage-blob';
import { v4 as uuidv4 } from 'uuid';
import * as path from 'path';

export type AzureContainer =
  | 'avatars'
  | 'resources'
  | 'oda-evidence'
  | 'communities'
  | 'news-attachments'
  | 'org-logos'
  | 'news';

@Injectable()
export class AzureBlobService {
  private readonly logger = new Logger(AzureBlobService.name);
  private readonly blobServiceClient: BlobServiceClient;

  constructor(private config: ConfigService) {
    const connectionString = this.config.get<string>(
      'AZURE_STORAGE_CONNECTION_STRING',
    );
    this.blobServiceClient =
      BlobServiceClient.fromConnectionString(connectionString);
  }

  /**
   * Upload a file buffer to Azure Blob Storage.
   * Returns the public URL of the uploaded blob.
   */
  async upload(
    file: Express.Multer.File,
    container: AzureContainer,
  ): Promise<string> {
    try {
      const containerClient: ContainerClient =
        this.blobServiceClient.getContainerClient(container);

      // Ensure container exists (creates silently if already present)
      await containerClient.createIfNotExists({ access: 'blob' });

      const ext = path.extname(file.originalname);
      const blobName = `${uuidv4()}${ext}`;
      const blockBlobClient: BlockBlobClient =
        containerClient.getBlockBlobClient(blobName);

      await blockBlobClient.uploadData(file.buffer, {
        blobHTTPHeaders: { blobContentType: file.mimetype },
      });

      this.logger.log(`Uploaded to Azure [${container}]: ${blobName}`);
      return blockBlobClient.url;
    } catch (error) {
      this.logger.error('Azure upload failed', error);
      throw new InternalServerErrorException('File upload to storage failed.');
    }
  }

  /**
   * Delete a blob by its full URL.
   */
  async delete(blobUrl: string, container: AzureContainer): Promise<void> {
    try {
      const containerClient =
        this.blobServiceClient.getContainerClient(container);
      const blobName = blobUrl.split('/').pop();
      if (!blobName) return;
      const blockBlobClient = containerClient.getBlockBlobClient(blobName);
      await blockBlobClient.deleteIfExists();
      this.logger.log(`Deleted from Azure [${container}]: ${blobName}`);
    } catch (error) {
      this.logger.error('Azure delete failed', error);
    }
  }
}
