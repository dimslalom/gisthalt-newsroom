import { fileURLToPath } from 'node:url';
import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import type { Claim } from '@newsroom/core';

export interface Fixture {
  name: string;
  describes: string;
  claim: Claim;
  imagePath: string | null;
}

const DIR = resolve(process.env.FIXTURE_DIR ?? resolve(resolve(fileURLToPath(import.meta.url), '..'), '../../../fixtures'));

export function fixtureNames(): string[] {
  if (!existsSync(DIR)) return [];
  return readdirSync(DIR).filter((f) => f.endsWith('.json') && f !== 'passing.json').map((f) => f.replace(/\.json$/, '')).sort();
}

export function loadFixture(name: string): Fixture {
  if (!/^[a-z0-9-]+$/.test(name)) throw new Error('invalid fixture name');
  const path = resolve(DIR, `${name}.json`);
  if (!existsSync(path)) throw new Error(`no fixture "${name}" in ${DIR}`);
  const raw = JSON.parse(readFileSync(path, 'utf8')) as Omit<Fixture, 'claim'> & { claim: Omit<Claim, 'observedAt'> & { observedAt: string } };
  const image = raw.imagePath ? resolve(DIR, raw.imagePath) : null;
  return {
    name,
    describes: raw.describes,
    imagePath: image && existsSync(image) ? image : null,
    claim: { ...raw.claim, observedAt: new Date(raw.claim.observedAt) } as Claim,
  };
}

export function loadAllFixtures(): Fixture[] { return fixtureNames().map(loadFixture); }
