import { mulberry32 } from '@newsroom/core';

export interface PacingConfig {
  /** Random 0-9 minute offset on every interval. Never an exact cadence. */
  jitterMaxMinutes: number;
  quietHours: { startHour: number; endHour: number };
  dailyCap: number;
  killSwitch: boolean;
  /** Quiet hours are lifted only when a real event is running. */
  eventRunning: boolean;
}

export const defaultPacing = (): PacingConfig => ({
  // Configurable only so tests and dry runs can collapse it. Never set this to
  // 0 against a live account: an exact cadence is the cheapest bot signal there is.
  jitterMaxMinutes: Number(process.env.PUBLISH_JITTER_MAX_MINUTES ?? 9),
  quietHours: { startHour: 1, endHour: 6 },
  dailyCap: 3,
  killSwitch: process.env.PUBLISH_KILL_SWITCH === 'true',
  eventRunning: process.env.LIVE_WINDOW === '1',
});

export type PacingVerdict =
  | { allowed: true; delayMs: number; reason: string }
  | { allowed: false; reason: string; retryAt: Date | null };

export function inQuietHours(now: Date, cfg: PacingConfig): boolean {
  const h = now.getHours();
  const { startHour, endHour } = cfg.quietHours;
  return startHour < endHour ? h >= startHour && h < endHour : h >= startHour || h < endHour;
}

/** Jitter is deterministic per key, so a retry does not re-roll into a new slot. */
export function jitterMs(key: string, cfg: PacingConfig): number {
  let h = 2166136261;
  for (let i = 0; i < key.length; i++) { h ^= key.charCodeAt(i); h = Math.imul(h, 16777619); }
  return Math.floor(mulberry32(h >>> 0)() * cfg.jitterMaxMinutes * 60_000);
}

/**
 * Pacing lives in code, not in a cron expression. Every publish passes through
 * here, including a manual approval from Discord.
 */
export function checkPacing(
  args: { now: Date; postsToday: number; idempotencyKey: string },
  cfg: PacingConfig,
): PacingVerdict {
  if (cfg.killSwitch) return { allowed: false, reason: 'global kill switch is on', retryAt: null };

  if (args.postsToday >= cfg.dailyCap) {
    const tomorrow = new Date(args.now);
    tomorrow.setHours(24, 0, 0, 0);
    return { allowed: false, reason: `daily cap ${cfg.dailyCap} reached`, retryAt: tomorrow };
  }

  if (inQuietHours(args.now, cfg) && !cfg.eventRunning) {
    const wake = new Date(args.now);
    wake.setHours(cfg.quietHours.endHour, 0, 0, 0);
    if (wake <= args.now) wake.setDate(wake.getDate() + 1);
    // A 3am post with no event behind it is a pure bot signal.
    return { allowed: false, reason: 'quiet hours, no event running', retryAt: wake };
  }

  const delay = jitterMs(args.idempotencyKey, cfg);
  return { allowed: true, delayMs: delay, reason: `jittered by ${Math.round(delay / 60000)}m` };
}
