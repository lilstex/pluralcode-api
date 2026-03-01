import { Injectable, Logger } from '@nestjs/common';
// eslint-disable-next-line @typescript-eslint/no-require-imports
const pdfParse = require('pdf-parse');

@Injectable()
export class OcrService {
  private readonly logger = new Logger(OcrService.name);

  /**
   * Extract plain text from a file buffer.
   * Supports PDF natively. Other document types return null
   * (Word docs require a separate pipeline — add mammoth if needed).
   */
  async extractText(buffer: Buffer, mimetype: string): Promise<string | null> {
    try {
      if (mimetype === 'application/pdf') {
        return await this.extractFromPdf(buffer);
      }

      if (
        mimetype === 'text/plain' ||
        mimetype === 'text/csv' ||
        mimetype === 'text/html'
      ) {
        return buffer.toString('utf-8');
      }

      // Future: add mammoth for docx, etc.
      this.logger.warn(`No text extractor available for mimetype: ${mimetype}`);
      return null;
    } catch (error) {
      // Non-fatal — upload still proceeds, resource just won't be full-text searchable
      this.logger.error(`Text extraction failed for ${mimetype}`, error);
      return null;
    }
  }

  private async extractFromPdf(buffer: Buffer): Promise<string> {
    const result = await pdfParse(buffer);
    // Collapse whitespace to keep the stored text clean
    return result.text.replace(/\s+/g, ' ').trim();
  }
}
