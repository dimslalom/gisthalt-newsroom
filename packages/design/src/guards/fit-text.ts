export interface Box { width: number; height: number }
export interface FitOptions { minPx: number; maxPx: number; maxLines: number }
export interface FitResult {
  px: number;
  lines: number;
  text: string;
  ellipsised: boolean;
  /** True when even minPx does not fit. The composer must then pick a
   *  longer-headline layout variant rather than shipping an overflow. */
  overflow: boolean;
}

/** Injected so the guard is pure and testable without a browser. */
export type Measure = (text: string, px: number, maxWidth: number) => { width: number; height: number; lines: number };

/**
 * Binary-search font size between floor and ceiling using the caller's own
 * measurement, then clamp line count, then ellipsise. Never a fixed size and a hope.
 */
export function fitText(text: string, box: Box, opts: FitOptions, measure: Measure): FitResult {
  const fits = (px: number) => {
    const m = measure(text, px, box.width);
    return m.lines <= opts.maxLines && m.height <= box.height && m.width <= box.width * opts.maxLines + 1;
  };

  let lo = opts.minPx;
  let hi = opts.maxPx;
  let best = -1;
  // 12 iterations resolves a 20-240px range to sub-pixel precision.
  for (let i = 0; i < 12 && lo <= hi; i++) {
    const mid = Math.floor((lo + hi) / 2);
    if (fits(mid)) { best = mid; lo = mid + 1; } else { hi = mid - 1; }
  }

  if (best < 0) {
    // Below the floor: ellipsise at minPx and report overflow so the composer
    // can switch to a layout built for long headlines.
    const truncated = ellipsise(text, box, opts.minPx, opts.maxLines, measure);
    return { px: opts.minPx, lines: opts.maxLines, text: truncated, ellipsised: true, overflow: true };
  }

  const m = measure(text, best, box.width);
  return { px: best, lines: m.lines, text, ellipsised: false, overflow: false };
}

function ellipsise(text: string, box: Box, px: number, maxLines: number, measure: Measure): string {
  const words = text.split(/\s+/);
  let out = words;
  while (out.length > 1) {
    const candidate = `${out.join(' ')}…`;
    const m = measure(candidate, px, box.width);
    if (m.lines <= maxLines && m.height <= box.height) return candidate;
    out = out.slice(0, -1);
  }
  return `${(out[0] ?? '').slice(0, 12)}…`;
}

/**
 * A crude but deterministic measurer for unit tests and for the composer's
 * pre-flight check. The browser's own measurement is authoritative at render
 * time; this exists so the guard can be reasoned about without Chromium.
 */
export function approximateMeasure(avgCharRatio = 0.52, lineHeight = 0.92): Measure {
  return (text, px, maxWidth) => {
    const charsPerLine = Math.max(1, Math.floor(maxWidth / (px * avgCharRatio)));
    const lines = Math.max(1, Math.ceil(text.length / charsPerLine));
    return { width: Math.min(text.length * px * avgCharRatio, maxWidth), height: lines * px * lineHeight, lines };
  };
}
