/**
 * Formatting lives in exactly one place. Every "missing" value renders as a
 * dash, never as blank space and never as the string "undefined".
 */
export const DASH = '–';

/**
 * Lap times arrive as float seconds (93.662), not formatted strings, and race
 * durations arrive the same way. Formatted in exactly one place.
 */
export function lapTime(seconds: number | null | undefined): string {
  if (seconds === null || seconds === undefined || !Number.isFinite(seconds)) return DASH;
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds - h * 3600) / 60);
  const s = seconds - h * 3600 - m * 60;
  const ss = s.toFixed(3).padStart(6, '0');
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${ss}`;
  return m > 0 ? `${m}:${ss}` : ss;
}

/** gap_to_leader is 0 for P1, not null. P1 gets a dash, not "+0.000". */
export function gap(value: number | string | null | undefined, position?: number | null): string {
  if (position === 1) return DASH;
  if (value === null || value === undefined || value === '') return DASH;
  if (typeof value === 'string') return value.startsWith('+') ? value : `+${value}`; // "+1 LAP"
  if (!Number.isFinite(value) || value === 0) return DASH;
  return `+${value.toFixed(3)}`;
}

export function pos(p: number | null | undefined, status?: string | null): string {
  if (status && status !== 'classified') return status.toUpperCase(); // DNF, DNS, DSQ
  if (p === null || p === undefined || !Number.isFinite(p)) return DASH;
  return String(p);
}

export function num(v: number | null | undefined): string {
  return v === null || v === undefined || !Number.isFinite(v) ? DASH : String(v);
}

export function text(v: string | null | undefined): string {
  const s = (v ?? '').trim();
  return s === '' || s.toLowerCase() === 'undefined' ? DASH : s;
}

/** "12 Sep 2026" in Indonesian for the copy layer. */
const ID_MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];
export function dateId(d: Date | string | null | undefined): string {
  if (!d) return 'TBA';
  const dt = typeof d === 'string' ? new Date(d) : d;
  if (Number.isNaN(dt.getTime())) return 'TBA';
  return `${dt.getUTCDate()} ${ID_MONTHS[dt.getUTCMonth()]} ${dt.getUTCFullYear()}`;
}
