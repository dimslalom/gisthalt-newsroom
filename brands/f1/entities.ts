import { onColourFor } from '@newsroom/design';
import type { EntityColour } from '@newsroom/design';

/**
 * The single cheapest source of variety. Colours live in a data table, not in
 * CSS, and every row carries its contrast-checked text pairing so
 * light-on-Mercedes-cyan can never happen.
 * Seeded from OpenF1's `team_colour`; verified values from the Madrid weekend.
 */
const RAW: Record<string, { name: string; hex: string }> = {
  mercedes:      { name: 'Mercedes',        hex: '#00D7B6' },
  ferrari:       { name: 'Ferrari',         hex: '#ED1131' },
  red_bull:      { name: 'Red Bull Racing', hex: '#4781D7' },
  mclaren:       { name: 'McLaren',         hex: '#F47600' },
  racing_bulls:  { name: 'Racing Bulls',    hex: '#6C98FF' },
  aston_martin:  { name: 'Aston Martin',    hex: '#229971' },
  alpine:        { name: 'Alpine',          hex: '#00A1E8' },
  williams:      { name: 'Williams',        hex: '#1868DB' },
  haas:          { name: 'Haas',            hex: '#9C9FA2' },
  kick_sauber:   { name: 'Kick Sauber',     hex: '#01C00E' },
  audi:          { name: 'Audi',            hex: '#BB2649' },
  cadillac:      { name: 'Cadillac',        hex: '#B4975A' },
};

export const entities: Record<string, EntityColour> = Object.fromEntries(
  Object.entries(RAW).map(([key, v]) => [key, { key, name: v.name, hex: v.hex, onColour: onColourFor(v.hex) }]),
);

const slug = (s: string) => s.toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');

/** Resolve a team by name, slug, or a raw hex the API handed us. */
export function resolveEntity(nameOrHex: string | null | undefined): EntityColour | null {
  if (!nameOrHex) return null;
  const raw = String(nameOrHex).trim();
  if (/^#?[0-9a-fA-F]{6}$/.test(raw)) {
    const hex = raw.startsWith('#') ? raw : `#${raw}`;
    const known = Object.values(entities).find((e) => e.hex.toLowerCase() === hex.toLowerCase());
    return known ?? { key: slug(hex), name: hex, hex, onColour: onColourFor(hex) };
  }
  const k = slug(raw);
  return entities[k]
    ?? Object.values(entities).find((e) => slug(e.name) === k)
    ?? Object.values(entities).find((e) => k.includes(slug(e.name)) || slug(e.name).includes(k))
    ?? null;
}
