// import { Injectable, Logger } from '@nestjs/common';
// import { ConfigService } from '@nestjs/config';
// import * as jwt from 'jsonwebtoken';
// import { v4 as uuidv4 } from 'uuid';

// export interface JitsiTokenPayload {
//   userId: string;
//   fullName: string;
//   email: string;
//   avatarUrl?: string;
//   isModerator: boolean;
// }

// @Injectable()
// export class JitsiService {
//   private readonly logger = new Logger(JitsiService.name);

//   private readonly appId: string;
//   private readonly appSecret: string;
//   private readonly domain: string;
//   private readonly useRS256: boolean;
//   private readonly privateKey: string;
//   private readonly keyId: string;

//   constructor(private readonly config: ConfigService) {
//     this.appId = this.config.get<string>('JITSI_APP_ID') ?? '';
//     this.appSecret = this.config.get<string>('JITSI_APP_SECRET') ?? '';
//     this.domain = this.config.get<string>('JITSI_DOMAIN') ?? '';
//     // RS256 — only needed if Jitsi uses asap_key_server
//     this.useRS256 = this.config.get<string>('JITSI_USE_RS256') === 'true';
//     this.privateKey = this.config.get<string>('JITSI_PRIVATE_KEY') ?? '';
//     this.keyId = this.config.get<string>('JITSI_KEY_ID') ?? '';
//   }

//   /**
//    * Generates a unique Jitsi room ID for a new event.
//    * Format: plrcap-<segment>-<segment>
//    */
//   generateRoomId(): string {
//     return `plrcap-${uuidv4().split('-')[0]}-${uuidv4().split('-')[0]}`;
//   }

//   /**
//    * Mints a signed JWT for self-hosted Jitsi.
//    *
//    * - HS256 (default): signed with JITSI_APP_SECRET
//    * - RS256 (optional): signed with JITSI_PRIVATE_KEY + optional kid header
//    *
//    * Token expires at event end time + 30 min buffer.
//    */
//   generateToken(
//     room: string,
//     payload: JitsiTokenPayload,
//     expiresAt: Date,
//   ): string {
//     if (!this.domain) {
//       this.logger.error('JITSI_DOMAIN is not set');
//       throw new Error(
//         'Jitsi is not configured. Set JITSI_DOMAIN in your environment.',
//       );
//     }

//     if (!this.appSecret && !this.privateKey) {
//       this.logger.warn(
//         'No Jitsi secret or private key configured — returning placeholder',
//       );
//       return 'jitsi-not-configured';
//     }

//     const now = Math.floor(Date.now() / 1000);
//     const exp = Math.floor(expiresAt.getTime() / 1000) + 30 * 60; // +30 min buffer

//     const claims = {
//       iss: this.appId,
//       aud: 'jitsi', // fixed string for self-hosted — NOT the domain
//       sub: this.domain, // your server domain e.g. "meet.yourserver.com"
//       room,
//       iat: now,
//       exp,
//       context: {
//         user: {
//           id: payload.userId ?? '',
//           name: payload.fullName,
//           email: payload.email,
//           avatar: payload.avatarUrl ?? '',
//           moderator: payload.isModerator,
//         },
//         features: {
//           livestreaming: false,
//           recording: false,
//           'screen-sharing': true,
//           'outbound-call': false,
//         },
//       },
//     };

//     if (this.useRS256) {
//       if (!this.privateKey) {
//         throw new Error(
//           'JITSI_USE_RS256=true but JITSI_PRIVATE_KEY is not set',
//         );
//       }
//       return jwt.sign(claims, this.privateKey, {
//         algorithm: 'RS256',
//         ...(this.keyId ? { keyid: this.keyId } : {}),
//       });
//     }

//     // HS256 — default for most self-hosted installs
//     return jwt.sign(claims, this.appSecret, { algorithm: 'HS256' });
//   }

//   /**
//    * Full meeting URL for embedding via the Jitsi IFrame API or deep-linking.
//    */
//   getMeetingUrl(roomId: string): string {
//     if (!this.domain) return '';
//     return `https://${this.domain}/${roomId}`;
//   }
// }

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

/**
 * Self-hosted Jitsi JWT Authentication
 *
 * Your Jitsi server's prosody config (/etc/prosody/conf.avail/<domain>.cfg.lua) must have:
 *
 *   authentication    = "token"
 *   app_id            = "<matches JITSI_APP_ID in your .env>"
 *   app_secret        = "<matches JITSI_APP_SECRET in your .env>"
 *   allow_empty_token = false
 *
 * Token claim rules for self-hosted (differs from Jitsi cloud):
 *   iss  → your app_id   (must match prosody app_id exactly)
 *   aud  → "jitsi"       (fixed string — NOT your domain)
 *   sub  → your domain   (e.g. "meet.yourserver.com")
 *   room → specific room name, or "*" for a wildcard guest token
 *
 * RS256 note: if your setup uses asap_key_server (asymmetric keys), set
 * JITSI_USE_RS256=true and provide JITSI_PRIVATE_KEY as a PEM string and
 * optionally JITSI_KEY_ID. Most self-hosted installs use HS256 — check
 * your prosody config first.
 */
@Injectable()
export class JitsiService {
  private readonly logger = new Logger(JitsiService.name);

  private readonly appId: string;
  private readonly appSecret: string;
  private readonly domain: string;
  private readonly useRS256: boolean;
  private readonly privateKey: string;
  private readonly keyId: string;

  constructor(private readonly config: ConfigService) {
    this.appId = this.config.get<string>('JITSI_APP_ID') ?? '';
    this.appSecret = this.config.get<string>('JITSI_APP_SECRET') ?? '';
    this.domain = this.config.get<string>('JITSI_DOMAIN') ?? '';
    // RS256 — only needed if your Jitsi uses asap_key_server
    this.useRS256 = this.config.get<string>('JITSI_USE_RS256') === 'true';
    this.privateKey = this.config.get<string>('JITSI_PRIVATE_KEY') ?? '';
    this.keyId = this.config.get<string>('JITSI_KEY_ID') ?? '';
  }

  /**
   * Generates a unique Jitsi room ID for a new event.
   * Format: plrcap-<segment>-<segment>
   */
  generateRoomId(): string {
    return `plrcap-${uuidv4().split('-')[0]}-${uuidv4().split('-')[0]}`;
  }

  /**
   * Mints a signed JWT for self-hosted Jitsi.
   *
   * - HS256 (default): signed with JITSI_APP_SECRET
   * - RS256 (optional): signed with JITSI_PRIVATE_KEY + optional kid header
   *
   * Token expires at event end time + 30 min buffer.
   */
  generateToken(
    room: string,
    payload: JitsiTokenPayload,
    expiresAt: Date,
  ): string {
    if (!this.domain) {
      this.logger.error('JITSI_DOMAIN is not set');
      throw new Error(
        'Jitsi is not configured. Set JITSI_DOMAIN in your environment.',
      );
    }

    if (!this.appSecret && !this.privateKey) {
      this.logger.warn(
        'No Jitsi secret or private key configured — returning placeholder',
      );
      return 'jitsi-not-configured';
    }

    const now = Math.floor(Date.now() / 1000);
    const exp = Math.floor(expiresAt.getTime() / 1000) + 30 * 60; // +30 min buffer

    const isMod = payload.isModerator;

    const claims = {
      iss: this.appId,
      aud: this.appId, // must match APP_ID — not the literal string 'jitsi'
      sub: this.domain,
      room,
      iat: now,
      nbf: now - 60, // allow 60s clock skew between client and server
      exp,
      context: {
        user: {
          id: payload.userId,
          name: payload.fullName,
          email: payload.email,
          avatar: payload.avatarUrl ?? '',
          // affiliation controls Jitsi privileges — 'owner' = moderator, 'member' = participant
          affiliation: isMod ? 'owner' : 'member',
        },
        features: {
          // Moderators (event creator / admin) get full feature access
          livestreaming: isMod,
          recording: isMod,
          transcription: isMod,
          'outbound-call': isMod,
          'screen-sharing': true, // all participants can screen share
        },
      },
    };

    return jwt.sign(claims, this.appSecret, { algorithm: 'HS256' });
  }

  /**
   * Full meeting URL for embedding via the Jitsi IFrame API or deep-linking.
   */
  getMeetingUrl(roomId: string): string {
    if (!this.domain) return '';
    return `https://${this.domain}/${roomId}`;
  }
}
