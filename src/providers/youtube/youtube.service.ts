import { Injectable, Logger } from '@nestjs/common';
import { google } from 'googleapis';
import * as fs from 'fs';
import * as https from 'https';
import * as http from 'http';

export interface YouTubeUploadOptions {
  title: string;
  description: string;
  privacyStatus: 'public' | 'unlisted' | 'private';
  /** Local file path OR a public HTTPS URL to the recording */
  source: string;
}

export interface YouTubeUploadResult {
  videoId: string;
  videoUrl: string;
}

/**
 * YouTubeService — uploads recorded meeting videos to the PLRCAP YouTube channel.
 *
 * Authentication uses a pre-authorised OAuth2 refresh token stored in environment
 * variables. The token only needs to be generated once; Google will refresh it
 * automatically using the refresh_token.
 *
 * See docs/DEVOPS.md for full setup instructions.
 */
@Injectable()
export class YouTubeService {
  private readonly logger = new Logger(YouTubeService.name);

  private getAuthClient() {
    const clientId = process.env.YOUTUBE_CLIENT_ID;
    const clientSecret = process.env.YOUTUBE_CLIENT_SECRET;
    const refreshToken = process.env.YOUTUBE_REFRESH_TOKEN;

    if (!clientId || !clientSecret || !refreshToken) {
      throw new Error(
        'YouTube OAuth2 credentials are not configured. ' +
          'Set YOUTUBE_CLIENT_ID, YOUTUBE_CLIENT_SECRET, and YOUTUBE_REFRESH_TOKEN in .env — ' +
          'see docs/DEVOPS.md for instructions.',
      );
    }

    const auth = new google.auth.OAuth2(clientId, clientSecret);
    auth.setCredentials({ refresh_token: refreshToken });
    return auth;
  }

  /**
   * Upload a recording to YouTube.
   * source can be a local absolute file path or a public HTTPS URL.
   * YouTube API streams directly — no temp file needed for URL sources.
   */
  async uploadRecording(
    options: YouTubeUploadOptions,
  ): Promise<YouTubeUploadResult> {
    const auth = this.getAuthClient();
    const youtube = google.youtube({ version: 'v3', auth });

    const { title, description, privacyStatus, source } = options;

    let mediaBody: NodeJS.ReadableStream;

    if (source.startsWith('http://') || source.startsWith('https://')) {
      mediaBody = await this.streamFromUrl(source);
    } else {
      if (!fs.existsSync(source))
        throw new Error(`Recording file not found: ${source}`);
      mediaBody = fs.createReadStream(source);
    }

    this.logger.log(`Uploading to YouTube: "${title}" [${privacyStatus}]`);

    const response = await youtube.videos.insert({
      part: ['snippet', 'status'],
      requestBody: {
        snippet: {
          title,
          description,
          categoryId: '27', // Education
        },
        status: {
          privacyStatus,
          selfDeclaredMadeForKids: false,
        },
      },
      media: { mimeType: 'video/mp4', body: mediaBody },
    });

    const videoId = response.data.id!;
    const videoUrl = `https://www.youtube.com/watch?v=${videoId}`;

    this.logger.log(`YouTube upload complete: ${videoUrl}`);
    return { videoId, videoUrl };
  }

  private streamFromUrl(url: string): Promise<NodeJS.ReadableStream> {
    return new Promise((resolve, reject) => {
      const protocol = url.startsWith('https') ? https : http;
      protocol
        .get(url, (res) => {
          if (res.statusCode && res.statusCode >= 400) {
            reject(
              new Error(
                `Failed to stream recording from URL: HTTP ${res.statusCode}`,
              ),
            );
            return;
          }
          resolve(res);
        })
        .on('error', reject);
    });
  }
}
