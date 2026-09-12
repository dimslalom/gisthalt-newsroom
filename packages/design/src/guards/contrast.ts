export interface ContrastPair { label: string; fg: string; bg: string; ratio: number; required: number }

export class ContrastError extends Error {
  readonly pairs: ContrastPair[];
  constructor(pairs: ContrastPair[]) {
    super(`contrast failure: ${pairs.map((p) => `${p.label} ${p.ratio.toFixed(2)}:1 < ${p.required}:1`).join('; ')}`);
    this.name = 'ContrastError';
    this.pairs = pairs;
  }
}

export function parseHex(hex: string): [number, number, number] {
  const h = hex.replace('#', '').trim();
  const full = h.length === 3 ? h.split('').map((c) => c + c).join('') : h;
  if (!/^[0-9a-fA-F]{6}$/.test(full)) throw new Error(`not a hex colour: ${hex}`);
  return [
    parseInt(full.slice(0, 2), 16),
    parseInt(full.slice(2, 4), 16),
    parseInt(full.slice(4, 6), 16),
  ];
}

export function relativeLuminance(hex: string): number {
  const [r, g, b] = parseHex(hex).map((v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  }) as [number, number, number];
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export function contrastRatio(fg: string, bg: string): number {
  const a = relativeLuminance(fg);
  const b = relativeLuminance(bg);
  const [hi, lo] = a > b ? [a, b] : [b, a];
  return (hi + 0.05) / (lo + 0.05);
}

/**
 * The contrast-checked pairing stored alongside every entity hex.
 * Tries the brand's own ink and paper first; a handful of real team colours
 * (Ferrari red among them) clear 4.5:1 against pure black but not against the
 * slightly-lifted token, so pure black and white are the last resort before
 * giving up and returning the best of a bad set.
 */
export function onColourFor(hex: string, dark = '#0A0C0E', light = '#F2F5F6'): string {
  const candidates = [dark, light, '#000000', '#FFFFFF'];
  const scored = candidates.map((c) => ({ c, r: contrastRatio(c, hex) }));
  return (scored.find((s) => s.r >= 4.5) ?? scored.sort((a, b) => b.r - a.r)[0]!).c;
}

export interface ResolvedPair { label: string; fg: string; bg: string; large?: boolean }

/**
 * WCAG check on every text-on-background pair the layout actually resolved,
 * AFTER skin and entity colour injection. Fails the render: an unreadable post
 * is worse than a missed post, so it goes to review rather than out.
 */
export function assertContrast(pairs: ResolvedPair[]): void {
  const failures = pairs
    .map((p) => {
      const required = p.large ? 3 : 4.5;
      return { ...p, ratio: contrastRatio(p.fg, p.bg), required };
    })
    .filter((p) => p.ratio < p.required);
  if (failures.length) throw new ContrastError(failures);
}
