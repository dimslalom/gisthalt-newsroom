import type { AccentKey, Skin } from './types.ts';

/** L4. Five moods. Entity colour is injected into the ones that ask for it. */
export const SKINS: Skin[] = [
  { key: 'dark',       bg: '#0A0C0E', panel: '#12161A', fg: '#F2F5F6', muted: '#7C8B93', line: '#26303A', usesEntityColour: true,  imagery: 'photo' },
  { key: 'light',      bg: '#EFEDE8', panel: '#FFFFFF', fg: '#0A0C0E', muted: '#6E7478', line: '#CFCCC4', usesEntityColour: true,  imagery: 'photo' },
  { key: 'team',       bg: '#0A0C0E', panel: '#12161A', fg: '#F2F5F6', muted: '#8C99A1', line: '#26303A', usesEntityColour: true,  imagery: 'duotone' },
  { key: 'tournament', bg: '#101418', panel: '#171C22', fg: '#F2F5F6', muted: '#7C8B93', line: '#2B3540', usesEntityColour: false, imagery: 'photo' },
  { key: 'archival',   bg: '#E8E2D4', panel: '#F5F1E6', fg: '#1A1611', muted: '#6B6253', line: '#C8BFA8', usesEntityColour: false, imagery: 'none' },
];

export const SKIN_BY_KEY = Object.fromEntries(SKINS.map((s) => [s.key, s]));

/** L5. No accents are offered: the house style is a photo plus one text box
 *  and nothing else (see doc-minimal.ts). The renderer still draws an accent
 *  for any older composition that names one. */
export const ACCENTS: AccentKey[] = [];

export function accentSets(): AccentKey[][] {
  const sets: AccentKey[][] = [[]];
  for (let i = 0; i < ACCENTS.length; i++) {
    sets.push([ACCENTS[i]!]);
    for (let j = i + 1; j < ACCENTS.length; j++) sets.push([ACCENTS[i]!, ACCENTS[j]!]);
  }
  return sets;
}
