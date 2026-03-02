import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as jwt from 'jsonwebtoken';
import { v4 as uuidv4 } from 'uuid';

export interface JitsiTokenPayload {
  userId: string;
  fullName: string;
  email: string;
  avatarUrl?: string;
  isModerator: boolean;
}

@Injectable()
export class JitsiService {
  private readonly logger = new Logger(JitsiService.name);
  private readonly appId: string;
  private readonly appSecret: string;
  private readonly jitsiDomain: string;

  constructor(private readonly config: ConfigService) {
    this.appId = this.config.get<string>('JITSI_APP_ID') ?? '';
    this.appSecret = this.config.get<string>('JITSI_APP_SECRET') ?? '';
    this.jitsiDomain = this.config.get<string>('JITSI_DOMAIN') ?? 'meet.jit.si';
  }

  /**
   * Generates a unique Jitsi room ID for a new event.
   * Format: plrcap-<uuid-segment> — human-readable but collision-resistant.
   */
  generateRoomId(): string {
    return `plrcap-${uuidv4().split('-')[0]}-${uuidv4().split('-')[0]}`;
  }

  /**
   * Mints a signed JWT for Jitsi authentication.
   * The frontend embeds this token in the Jitsi IFrame API config.
   * Token expires after the event end time + 30 min buffer.
   */
  generateToken(
    room: string,
    payload: JitsiTokenPayload,
    expiresAt: Date,
  ): string {
    if (!this.appSecret) {
      this.logger.warn(
        'JITSI_APP_SECRET not set — returning unsigned placeholder token',
      );
      return 'jitsi-secret-not-configured';
    }

    const now = Math.floor(Date.now() / 1000);
    const exp = Math.floor(expiresAt.getTime() / 1000) + 30 * 60; // +30 min buffer

    const claims = {
      iss: this.appId,
      aud: this.jitsiDomain,
      sub: this.jitsiDomain,
      room,
      iat: now,
      exp,
      context: {
        user: {
          id: payload.userId,
          name: payload.fullName,
          email: payload.email,
          avatar: payload.avatarUrl ?? '',
          moderator: payload.isModerator,
        },
        features: {
          livestreaming: false,
          recording: false,
          'screen-sharing': true,
          'outbound-call': false,
        },
      },
    };

    return jwt.sign(claims, this.appSecret, { algorithm: 'HS256' });
  }

  /**
   * Returns the full Jitsi meeting URL for a given room.
   */
  getMeetingUrl(roomId: string): string {
    return `https://${this.jitsiDomain}/${roomId}`;
  }
}
