import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import Redis from 'ioredis';

/**
 * RedisService — thin wrapper around ioredis.
 *
 * Used primarily for community presence tracking:
 *   community:presence:{communityId}  →  Redis Set of socket IDs per userId
 *   community:user-sockets:{userId}   →  Redis Set of socketIds for that user
 *
 * This dual-key design handles the multi-tab case correctly:
 * a user is only removed from a community's presence when their LAST
 * socket for that community disconnects.
 */
@Injectable()
export class RedisService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(RedisService.name);
  private client: Redis;

  onModuleInit() {
    const redisUrl = process.env.REDIS_URL;

    if (redisUrl) {
      // Use the Render connection string
      this.client = new Redis(redisUrl, {
        lazyConnect: true,
        retryStrategy: (times) => Math.min(times * 100, 3000),
      });
    } else {
      // Fallback to your local individual variables
      this.client = new Redis({
        host: process.env.REDIS_HOST ?? 'localhost',
        port: parseInt(process.env.REDIS_PORT ?? '6379', 10),
        password: process.env.REDIS_PASSWORD ?? undefined,
        db: parseInt(process.env.REDIS_DB ?? '0', 10),
        lazyConnect: true,
        retryStrategy: (times) => Math.min(times * 100, 3000),
      });
    }

    this.client.on('connect', () => this.logger.log('Redis connected'));
    this.client.on('error', (err) => this.logger.error('Redis error', err));

    this.client
      .connect()
      .catch((err) => this.logger.error('Redis initial connect failed', err));
  }

  async onModuleDestroy() {
    await this.client?.quit();
  }

  // ── Presence: join ────────────────────────────────────────────────────────

  /**
   * Record that a socket joined a community room.
   * Adds socketId to community:presence:{communityId}
   * and tracks communityId → socketId mapping on the user.
   */
  async presenceJoin(communityId: string, userId: string, socketId: string) {
    const presenceKey = `community:presence:${communityId}`;
    const userSocketsKey = `community:user-sockets:${userId}:${communityId}`;

    await Promise.all([
      this.client.sadd(presenceKey, socketId),
      this.client.sadd(userSocketsKey, socketId),
      // TTL safety net: auto-expire if server crashes (30 min)
      this.client.expire(presenceKey, 1800),
      this.client.expire(userSocketsKey, 1800),
    ]);
  }

  // ── Presence: leave ───────────────────────────────────────────────────────

  /**
   * Remove a socket from a community's presence.
   * Returns true if the user has NO remaining sockets in that community
   * (i.e. they are now fully offline from this community).
   */
  async presenceLeave(
    communityId: string,
    userId: string,
    socketId: string,
  ): Promise<boolean> {
    const presenceKey = `community:presence:${communityId}`;
    const userSocketsKey = `community:user-sockets:${userId}:${communityId}`;

    await Promise.all([
      this.client.srem(presenceKey, socketId),
      this.client.srem(userSocketsKey, socketId),
    ]);

    const remaining = await this.client.scard(userSocketsKey);
    return remaining === 0;
  }

  /**
   * Remove all sockets for a userId across ALL communities they were in.
   * Called on hard disconnect (e.g. browser close).
   * Returns list of communityIds the user was present in.
   */
  async presenceLeaveAll(userId: string, socketId: string): Promise<string[]> {
    // Find all community tracking keys for this user
    const pattern = `community:user-sockets:${userId}:*`;
    const keys = await this.client.keys(pattern);
    const communityIds: string[] = [];

    for (const key of keys) {
      await this.client.srem(key, socketId);
      const remaining = await this.client.scard(key);

      // Extract communityId from key pattern
      const communityId = key.split(':').pop()!;

      if (remaining === 0) {
        // Remove this socket from the community presence set too
        await this.client.srem(`community:presence:${communityId}`, socketId);
        communityIds.push(communityId);
      }
    }

    return communityIds;
  }

  // ── Presence: count ───────────────────────────────────────────────────────

  /** Returns the number of unique sockets (≈ online sessions) in a community. */
  async getOnlineCount(communityId: string): Promise<number> {
    return this.client.scard(`community:presence:${communityId}`);
  }

  /** Returns all socket IDs in a community (for broadcasting). */
  async getOnlineSockets(communityId: string): Promise<string[]> {
    return this.client.smembers(`community:presence:${communityId}`);
  }

  // ── Presence: global ──────────────────────────────────────────────────────

  /**
   * Returns the count and list of unique user IDs that are currently online
   * across ALL communities.
   *
   * Strategy: scan all `community:user-sockets:{userId}:{communityId}` keys,
   * extract the userId segment, and keep only users whose set is non-empty
   * (i.e. they have at least one live socket somewhere).
   *
   * Uses SCAN instead of KEYS so it does not block the Redis event loop on
   * large keyspaces (safe for production).
   */
  async getAllOnlineUsers(): Promise<{ count: number; userIds: string[] }> {
    const pattern = 'community:user-sockets:*';
    const userIds = new Set<string>();
    let cursor = '0';

    do {
      // SCAN returns [nextCursor, [key, key, ...]]
      const [nextCursor, keys] = await this.client.scan(
        cursor,
        'MATCH',
        pattern,
        'COUNT',
        100,
      );
      cursor = nextCursor;

      if (keys.length === 0) continue;

      // Check each key in parallel — only count users with >= 1 live socket
      await Promise.all(
        keys.map(async (key) => {
          const count = await this.client.scard(key);
          if (count > 0) {
            // Key format: community:user-sockets:{userId}:{communityId}
            // parts[0]=community, parts[1]=user-sockets, parts[2]=userId, parts[3]=communityId
            const parts = key.split(':');
            const userId = parts[2];
            if (userId) userIds.add(userId);
          }
        }),
      );
    } while (cursor !== '0');

    const result = [...userIds];
    return { count: result.length, userIds: result };
  }
}
