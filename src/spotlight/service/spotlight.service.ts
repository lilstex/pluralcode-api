import { Injectable, HttpStatus, Logger } from '@nestjs/common';
import { PrismaService } from 'src/prisma.service';
import {
  UpdateSpotlightSettingsDto,
  ManualSpotlightDto,
  SetSpotlightQueueDto,
  SpotlightHistoryQueryDto,
} from '../dto/spotlight.dto';

// ─────────────────────────────────────────────────────────────────────────────
// SHARED INCLUDE
// ─────────────────────────────────────────────────────────────────────────────

const ORG_SPOTLIGHT_SELECT = {
  id: true,
  name: true,
  acronym: true,
  logoUrl: true,
  description: true,
  mission: true,
  sectors: true,
  state: true,
  lga: true,
} as const;

const ENTRY_INCLUDE = {
  org: { select: ORG_SPOTLIGHT_SELECT },
} as const;

@Injectable()
export class SpotlightService {
  private readonly logger = new Logger(SpotlightService.name);

  constructor(private readonly prisma: PrismaService) {}

  // ─────────────────────────────────────────────────────────────────────────────
  // HELPERS
  // ─────────────────────────────────────────────────────────────────────────────

  /**
   * Ensure the singleton settings row always exists.
   */
  private async getOrCreateSettings() {
    return this.prisma.spotlightSettings.upsert({
      where: { id: 'singleton' },
      create: { id: 'singleton' },
      update: {},
    });
  }

  /**
   * Pick a random approved NGO_MEMBER organization, skipping the one
   * that is currently active (if any).
   */
  private async pickRandomOrg(excludeOrgId?: string) {
    const where: any = {
      user: { role: 'NGO_MEMBER', status: 'APPROVED' },
    };
    if (excludeOrgId) {
      where.id = { not: excludeOrgId };
    }

    const count = await this.prisma.organization.count({ where });
    if (count === 0) return null;

    const skip = Math.floor(Math.random() * count);
    const orgs = await this.prisma.organization.findMany({
      where,
      skip,
      take: 1,
      select: { id: true },
    });

    return orgs[0] ?? null;
  }

  /**
   * Resolve everything needed for an auto spotlight (settings + random org).
   * Call this BEFORE opening a transaction so no reads occur inside tx.
   * Returns null if no eligible org exists.
   */
  private async prepareAutoSpotlight(excludeOrgId?: string): Promise<{
    orgId: string;
    endAt: Date;
    now: Date;
    defaultPeriodDays: number;
  } | null> {
    const settings = await this.getOrCreateSettings();
    const randomOrg = await this.pickRandomOrg(excludeOrgId);

    if (!randomOrg) {
      this.logger.warn('No eligible organizations found for auto-spotlight.');
      return null;
    }

    const now = new Date();
    const endAt = new Date(
      now.getTime() + settings.defaultPeriodDays * 24 * 60 * 60 * 1000,
    );

    return {
      orgId: randomOrg.id,
      endAt,
      now,
      defaultPeriodDays: settings.defaultPeriodDays,
    };
  }

  /**
   * Write-only: create the spotlight entry and set AUTO mode.
   * Must be called with a pre-resolved plan from prepareAutoSpotlight().
   * Safe to call inside a transaction — does NO reads of its own.
   */
  private async writeAutoSpotlight(
    tx: any,
    plan: { orgId: string; endAt: Date; now: Date; defaultPeriodDays: number },
  ): Promise<void> {
    await tx.spotlightEntry.create({
      data: {
        orgId: plan.orgId,
        startAt: plan.now,
        endAt: plan.endAt,
        isActive: true,
        wasAuto: true,
        order: null,
      },
    });

    await tx.spotlightSettings.upsert({
      where: { id: 'singleton' },
      create: { id: 'singleton', mode: 'AUTO' },
      update: { mode: 'AUTO' },
    });

    this.logger.log(
      `Auto-activated spotlight for org ${plan.orgId}. Duration: ${plan.defaultPeriodDays}d.`,
    );
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // PUBLIC — CURRENT SPOTLIGHT
  // ─────────────────────────────────────────────────────────────────────────────

  async getCurrentSpotlight() {
    try {
      const entry = await this.prisma.spotlightEntry.findFirst({
        where: { isActive: true },
        include: ENTRY_INCLUDE,
      });

      if (!entry) {
        return {
          status: true,
          statusCode: HttpStatus.OK,
          message: 'No active spotlight.',
          data: null,
        };
      }

      const secondsRemaining = Math.max(
        0,
        Math.floor((entry.endAt.getTime() - Date.now()) / 1000),
      );

      return {
        status: true,
        statusCode: HttpStatus.OK,
        message: 'Current spotlight retrieved.',
        data: { ...entry, secondsRemaining },
      };
    } catch (error) {
      this.logger.error('getCurrentSpotlight error', error);
      return {
        status: false,
        statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
        message: 'Server error.',
      };
    }
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // ADMIN — SETTINGS
  // ─────────────────────────────────────────────────────────────────────────────

  async getSettings() {
    try {
      const settings = await this.getOrCreateSettings();
      return {
        status: true,
        statusCode: HttpStatus.OK,
        message: 'Settings retrieved.',
        data: settings,
      };
    } catch (error) {
      this.logger.error('getSettings error', error);
      return {
        status: false,
        statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
        message: 'Server error.',
      };
    }
  }

  async updateSettings(dto: UpdateSpotlightSettingsDto) {
    try {
      const settings = await this.prisma.spotlightSettings.upsert({
        where: { id: 'singleton' },
        create: { id: 'singleton', defaultPeriodDays: dto.defaultPeriodDays },
        update: { defaultPeriodDays: dto.defaultPeriodDays },
      });
      return {
        status: true,
        statusCode: HttpStatus.OK,
        message: 'Settings updated.',
        data: settings,
      };
    } catch (error) {
      this.logger.error('updateSettings error', error);
      return {
        status: false,
        statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
        message: 'Server error.',
      };
    }
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // ADMIN — MANUAL SPOTLIGHT
  // ─────────────────────────────────────────────────────────────────────────────

  /**
   * Immediately spotlight a single NGO.
   * Archives the current active entry (if any), clears any pending queue,
   * creates a new active entry, and sets mode to MANUAL.
   */
  async setManualSpotlight(dto: ManualSpotlightDto) {
    try {
      // Validate org exists
      const org = await this.prisma.organization.findUnique({
        where: { id: dto.orgId },
        select: { id: true },
      });
      if (!org) {
        return {
          status: false,
          statusCode: HttpStatus.NOT_FOUND,
          message: 'Organization not found.',
        };
      }

      const settings = await this.getOrCreateSettings();
      const durationDays = dto.durationDays ?? settings.defaultPeriodDays;
      const now = new Date();
      const endAt = new Date(
        now.getTime() + durationDays * 24 * 60 * 60 * 1000,
      );

      await this.prisma.$transaction(async (tx) => {
        // Archive the current active entry
        const active = await tx.spotlightEntry.findFirst({
          where: { isActive: true },
        });
        if (active) {
          await tx.spotlightHistory.create({
            data: {
              orgId: active.orgId,
              startAt: active.startAt,
              endAt: now,
              wasAuto: active.wasAuto,
            },
          });
          await tx.spotlightEntry.delete({ where: { id: active.id } });
        }

        // Delete all pending (non-active) queue entries
        await tx.spotlightEntry.deleteMany({ where: { isActive: false } });

        // Create new active entry
        await tx.spotlightEntry.create({
          data: {
            orgId: dto.orgId,
            startAt: now,
            endAt,
            isActive: true,
            wasAuto: false,
            order: null,
          },
        });

        // Set mode to MANUAL
        await tx.spotlightSettings.upsert({
          where: { id: 'singleton' },
          create: { id: 'singleton', mode: 'MANUAL' },
          update: { mode: 'MANUAL' },
        });
      });

      const entry = await this.prisma.spotlightEntry.findFirst({
        where: { isActive: true },
        include: ENTRY_INCLUDE,
      });

      return {
        status: true,
        statusCode: HttpStatus.CREATED,
        message: 'Manual spotlight activated.',
        data: entry,
      };
    } catch (error) {
      this.logger.error('setManualSpotlight error', error);
      return {
        status: false,
        statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
        message: 'Server error.',
      };
    }
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // ADMIN — QUEUE
  // ─────────────────────────────────────────────────────────────────────────────

  /**
   * Replace the pending queue with a new ordered sequence.
   * The currently active entry is NOT touched — it runs to completion.
   * Mode is set to MANUAL.
   */
  async setQueue(dto: SetSpotlightQueueDto) {
    try {
      // Validate all orgs exist
      const orgIds = dto.items.map((i) => i.orgId);
      const found = await this.prisma.organization.findMany({
        where: { id: { in: orgIds } },
        select: { id: true },
      });
      if (found.length !== orgIds.length) {
        const foundIds = new Set(found.map((o) => o.id));
        const missing = orgIds.filter((id) => !foundIds.has(id));
        return {
          status: false,
          statusCode: HttpStatus.NOT_FOUND,
          message: `Organizations not found: ${missing.join(', ')}`,
        };
      }

      const settings = await this.getOrCreateSettings();

      await this.prisma.$transaction(async (tx) => {
        // Delete only pending (non-active) entries
        await tx.spotlightEntry.deleteMany({ where: { isActive: false } });

        // Determine start time: after the currently active entry ends, or now
        const active = await tx.spotlightEntry.findFirst({
          where: { isActive: true },
        });
        let cursor = active ? active.endAt : new Date();

        // Build queue entries in order
        for (let i = 0; i < dto.items.length; i++) {
          const item = dto.items[i];
          const endAt = new Date(
            cursor.getTime() +
              (item.durationDays ?? settings.defaultPeriodDays) *
                24 *
                60 *
                60 *
                1000,
          );
          await tx.spotlightEntry.create({
            data: {
              orgId: item.orgId,
              startAt: cursor,
              endAt,
              isActive: false,
              wasAuto: false,
              order: i,
            },
          });
          cursor = endAt;
        }

        // Set mode to MANUAL
        await tx.spotlightSettings.upsert({
          where: { id: 'singleton' },
          create: { id: 'singleton', mode: 'MANUAL' },
          update: { mode: 'MANUAL' },
        });
      });

      const queue = await this.prisma.spotlightEntry.findMany({
        where: { isActive: false },
        include: ENTRY_INCLUDE,
        orderBy: { order: 'asc' },
      });

      return {
        status: true,
        statusCode: HttpStatus.CREATED,
        message: 'Spotlight queue set.',
        data: queue,
      };
    } catch (error) {
      this.logger.error('setQueue error', error);
      return {
        status: false,
        statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
        message: 'Server error.',
      };
    }
  }

  async getQueue() {
    try {
      const queue = await this.prisma.spotlightEntry.findMany({
        where: { isActive: false },
        include: ENTRY_INCLUDE,
        orderBy: { order: 'asc' },
      });

      return {
        status: true,
        statusCode: HttpStatus.OK,
        message: 'Queue retrieved.',
        data: queue,
      };
    } catch (error) {
      this.logger.error('getQueue error', error);
      return {
        status: false,
        statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
        message: 'Server error.',
      };
    }
  }

  /**
   * Clear all pending queue entries and return to AUTO mode.
   *
   * If there is already an active spotlight running, it continues uninterrupted
   * until it naturally expires — tick() will then auto-select the next org.
   *
   * If there is NO active spotlight (the queue WAS the only thing keeping the
   * platform spotlighted), we immediately auto-select a random approved org so
   * there is never a gap in coverage.
   */
  async clearQueue() {
    try {
      let autoStarted = false;

      // ── Reads happen BEFORE the transaction to avoid timeout ────────────────
      // Check if there is a currently running spotlight
      const currentActive = await this.prisma.spotlightEntry.findFirst({
        where: { isActive: true },
        select: { id: true },
      });

      // If nothing is running we will need to start one — resolve the org and
      // duration now, outside the tx, so the transaction only does writes.
      const autoPlan = !currentActive
        ? await this.prepareAutoSpotlight()
        : null;

      // ── Transaction: writes only (fast, well within 5 s timeout) ────────────
      await this.prisma.$transaction(async (tx) => {
        // Remove all pending (non-active) queue entries
        await tx.spotlightEntry.deleteMany({ where: { isActive: false } });

        // Switch to AUTO mode
        await tx.spotlightSettings.upsert({
          where: { id: 'singleton' },
          create: { id: 'singleton', mode: 'AUTO' },
          update: { mode: 'AUTO' },
        });

        // If nothing was running and we found an org to spotlight, write it now
        if (!currentActive && autoPlan) {
          await this.writeAutoSpotlight(tx, autoPlan);
          autoStarted = true;
        }
        // If there IS an active entry: leave it running. When it expires,
        // tick() will auto-select the next org because mode is now AUTO.
      });

      const entry = autoStarted
        ? await this.prisma.spotlightEntry.findFirst({
            where: { isActive: true },
            include: ENTRY_INCLUDE,
          })
        : null;

      return {
        status: true,
        statusCode: HttpStatus.OK,
        message: autoStarted
          ? 'Queue cleared. Auto mode enabled and a new spotlight has been started immediately.'
          : 'Queue cleared. Auto mode enabled. The current spotlight will continue until it expires.',
        data: entry,
      };
    } catch (error) {
      this.logger.error('clearQueue error', error);
      return {
        status: false,
        statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
        message: 'Server error.',
      };
    }
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // ADMIN — HISTORY
  // ─────────────────────────────────────────────────────────────────────────────

  async getHistory(query: SpotlightHistoryQueryDto) {
    try {
      const page = Math.max(1, parseInt(String(query.page ?? '1'), 10) || 1);
      const limit = Math.min(
        100,
        Math.max(1, parseInt(String(query.limit ?? '20'), 10) || 20),
      );
      const skip = (page - 1) * limit;

      const [history, total] = await this.prisma.$transaction([
        this.prisma.spotlightHistory.findMany({
          skip,
          take: limit,
          include: { org: { select: ORG_SPOTLIGHT_SELECT } },
          orderBy: { startAt: 'desc' },
        }),
        this.prisma.spotlightHistory.count(),
      ]);

      return {
        status: true,
        statusCode: HttpStatus.OK,
        message: 'History retrieved.',
        data: { history, total, page, limit, pages: Math.ceil(total / limit) },
      };
    } catch (error) {
      this.logger.error('getHistory error', error);
      return {
        status: false,
        statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
        message: 'Server error.',
      };
    }
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // SCHEDULER — TICK (called by SpotlightScheduler every hour)
  // ─────────────────────────────────────────────────────────────────────────────

  async tick() {
    try {
      const now = new Date();

      // ── 1. Check if active entry has expired ────────────────────────────────
      const active = await this.prisma.spotlightEntry.findFirst({
        where: { isActive: true },
      });

      if (active && active.endAt <= now) {
        // Archive it
        await this.prisma.$transaction(async (tx) => {
          await tx.spotlightHistory.create({
            data: {
              orgId: active.orgId,
              startAt: active.startAt,
              endAt: active.endAt,
              wasAuto: active.wasAuto,
            },
          });
          await tx.spotlightEntry.delete({ where: { id: active.id } });
        });

        this.logger.log(
          `Spotlight expired for org ${active.orgId}. Archived to history.`,
        );

        // ── 2. Find next pending entry in queue ───────────────────────────────
        const next = await this.prisma.spotlightEntry.findFirst({
          where: { isActive: false, startAt: { lte: now } },
          orderBy: { order: 'asc' },
        });

        if (next) {
          // Activate next in queue
          await this.prisma.spotlightEntry.update({
            where: { id: next.id },
            data: { isActive: true, startAt: now },
          });
          this.logger.log(
            `Spotlight advanced to queued org ${next.orgId} (order ${next.order}).`,
          );
        } else {
          // ── 3. Fall back to AUTO ─────────────────────────────────────────────
          const pendingCount = await this.prisma.spotlightEntry.count({
            where: { isActive: false },
          });

          if (pendingCount === 0) {
            // Truly empty — resolve org outside tx, then write inside
            const autoPlan = await this.prepareAutoSpotlight(active.orgId);
            if (autoPlan) {
              await this.prisma.$transaction(async (tx) => {
                await this.writeAutoSpotlight(tx, autoPlan);
              });
            }
          } else {
            // There are future-dated pending entries — wait for them
            this.logger.log(
              'No immediately due queue entries. Waiting for scheduled ones.',
            );
          }
        }
      } else if (!active) {
        // ── No active entry at all — bootstrap ──────────────────────────────
        const next = await this.prisma.spotlightEntry.findFirst({
          where: { isActive: false, startAt: { lte: now } },
          orderBy: { order: 'asc' },
        });

        if (next) {
          await this.prisma.spotlightEntry.update({
            where: { id: next.id },
            data: { isActive: true, startAt: now },
          });
          this.logger.log(
            `No active spotlight. Activated queued org ${next.orgId}.`,
          );
        } else {
          const autoPlan = await this.prepareAutoSpotlight();
          if (autoPlan) {
            await this.prisma.$transaction(async (tx) => {
              await this.writeAutoSpotlight(tx, autoPlan);
            });
          }
        }
      }
    } catch (error) {
      this.logger.error('tick error', error);
    }
  }
}
