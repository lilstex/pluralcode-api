import { Logger } from '@nestjs/common';
import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  OnGatewayConnection,
  OnGatewayDisconnect,
  ConnectedSocket,
  MessageBody,
  WsException,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { JwtService } from '@nestjs/jwt';
import { RedisService } from 'src/providers/redis/redis.service';

// ─────────────────────────────────────────────────────────────────────────────
// PAYLOAD TYPES
// ─────────────────────────────────────────────────────────────────────────────

interface JoinRoomPayload {
  communityId: string;
}
interface LeaveRoomPayload {
  communityId: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// GATEWAY
// ─────────────────────────────────────────────────────────────────────────────

/**
 * CommunityGateway — handles real-time events for the Community module.
 *
 * Responsibilities:
 *  1. Presence tracking (who is online in which community room)
 *  2. Pushing new-topic notifications to all members of a community
 *  3. Pushing @mention notifications directly to the mentioned user's sockets
 *
 * Authentication: JWT is expected in the handshake auth object.
 *   Client: io('/communities', { auth: { token: 'Bearer <jwt>' } })
 *
 * Unauthenticated connections are accepted but receive no userId — they can
 * only receive public broadcasts (e.g. new topic in a public community).
 */
@WebSocketGateway({
  namespace: '/communities',
  cors: {
    origin: process.env.FRONTEND_URL ?? '*',
    credentials: true,
  },
})
export class CommunityGateway
  implements OnGatewayConnection, OnGatewayDisconnect
{
  @WebSocketServer()
  private readonly server: Server;

  private readonly logger = new Logger(CommunityGateway.name);

  // socketId → { userId, communityIds[] } — in-memory map for fast disconnect cleanup
  private readonly socketMeta = new Map<
    string,
    { userId: string | null; communityIds: Set<string> }
  >();

  constructor(
    private readonly redis: RedisService,
    private readonly jwt: JwtService,
  ) {}

  // ─────────────────────────────────────────────────────────────────────────
  // LIFECYCLE
  // ─────────────────────────────────────────────────────────────────────────

  async handleConnection(client: Socket) {
    const userId = this.extractUserId(client);
    this.socketMeta.set(client.id, { userId, communityIds: new Set() });
    this.logger.debug(
      `Socket connected: ${client.id}  userId=${userId ?? 'guest'}`,
    );
  }

  async handleDisconnect(client: Socket) {
    const meta = this.socketMeta.get(client.id);
    if (!meta) return;

    const { userId } = meta;

    // Remove from Redis presence for every room this socket was in
    if (userId) {
      const leftCommunities = await this.redis.presenceLeaveAll(
        userId,
        client.id,
      );

      // Broadcast updated count to each community the user fully left
      for (const communityId of leftCommunities) {
        const onlineCount = await this.redis.getOnlineCount(communityId);
        this.server.to(communityId).emit('presence:updated', {
          communityId,
          onlineCount,
        });
      }
    }

    this.socketMeta.delete(client.id);
    this.logger.debug(
      `Socket disconnected: ${client.id}  userId=${userId ?? 'guest'}`,
    );
  }

  // ─────────────────────────────────────────────────────────────────────────
  // CLIENT EVENTS
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Client emits 'joinCommunity' when the user opens a community page.
   * Adds them to the Socket.io room and updates Redis presence.
   */
  @SubscribeMessage('joinCommunity')
  async handleJoin(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: JoinRoomPayload,
  ) {
    const { communityId } = payload;
    if (!communityId) throw new WsException('communityId is required');

    const meta = this.socketMeta.get(client.id);
    const userId = meta?.userId ?? null;

    // Join Socket.io room — allows targeted broadcasts
    await client.join(communityId);
    meta?.communityIds.add(communityId);

    if (userId) {
      await this.redis.presenceJoin(communityId, userId, client.id);
    }

    const onlineCount = await this.redis.getOnlineCount(communityId);

    // Notify everyone in the room (including the joiner) of the new count
    this.server.to(communityId).emit('presence:updated', {
      communityId,
      onlineCount,
    });

    // Acknowledge the join to the calling client
    return { event: 'joinedCommunity', communityId, onlineCount };
  }

  /**
   * Client emits 'leaveCommunity' when navigating away.
   */
  @SubscribeMessage('leaveCommunity')
  async handleLeave(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: LeaveRoomPayload,
  ) {
    const { communityId } = payload;
    if (!communityId) return;

    const meta = this.socketMeta.get(client.id);
    const userId = meta?.userId ?? null;

    await client.leave(communityId);
    meta?.communityIds.delete(communityId);

    if (userId) {
      const fullyLeft = await this.redis.presenceLeave(
        communityId,
        userId,
        client.id,
      );

      if (fullyLeft) {
        const onlineCount = await this.redis.getOnlineCount(communityId);
        this.server.to(communityId).emit('presence:updated', {
          communityId,
          onlineCount,
        });
      }
    }

    return { event: 'leftCommunity', communityId };
  }

  // ─────────────────────────────────────────────────────────────────────────
  // SERVER-SIDE BROADCASTS (called by CommunityService)
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Broadcast a new topic to all members currently in the community room.
   * Called by CommunityService.createTopic() after the DB write.
   */
  broadcastNewTopic(
    communityId: string,
    topic: {
      id: string;
      title: string;
      body: string;
      communityId: string;
      author: { id: string; fullName: string; avatarUrl?: string };
      createdAt: Date;
    },
  ) {
    this.server.to(communityId).emit('topic:new', topic);
  }

  /**
   * Push a real-time mention notification directly to a specific user's sockets.
   * Called by CommunityService.createComment() for each @mentioned userId.
   */
  broadcastMention(
    mentionedUserId: string,
    payload: {
      communityId: string;
      topicId: string;
      commentId: string;
      topicTitle: string;
      mentionedBy: string;
    },
  ) {
    // Find all sockets belonging to this user and emit directly
    this.server.sockets.sockets.forEach((socket) => {
      const meta = this.socketMeta.get(socket.id);
      if (meta?.userId === mentionedUserId) {
        socket.emit('mention:received', payload);
      }
    });
  }

  // ─────────────────────────────────────────────────────────────────────────
  // HELPERS
  // ─────────────────────────────────────────────────────────────────────────

  private extractUserId(client: Socket): string | null {
    try {
      const raw = client.handshake.auth?.token as string | undefined;
      if (!raw) return null;

      const token = raw.replace(/^Bearer\s+/i, '');
      const payload = this.jwt.verify<{ sub: string }>(token, {
        secret: process.env.JWT_SECRET,
      });
      return payload.sub ?? null;
    } catch {
      return null; // Invalid/expired token — treat as guest
    }
  }
}
