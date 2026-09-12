import type { Platform } from './contracts.ts';
export const PLATFORM_LIMITS: Record<Platform, number> = { x: 280, instagram: 2200, threads: 500, tiktok: 2200 };
export function fitCaption(text: string, platform: string): string {
  const max = PLATFORM_LIMITS[platform as Platform];
  if (!max) throw new Error(`unknown platform ${platform}`);
  const chars = Array.from(text);
  return chars.length <= max ? text : `${chars.slice(0, max - 1).join('')}…`;
}
export function validateCaption(text: string, platform: string): void {
  const max = PLATFORM_LIMITS[platform as Platform];
  if (!max || !text.trim() || Array.from(text).length > max) throw new Error(`caption must contain 1–${max ?? 0} characters`);
}
