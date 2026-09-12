import type { Claim } from '@newsroom/core';
import type { RenderResult } from './render.ts';
export interface RenderRequest {
  brand: string; claim?: Claim; fixture?: string; archetype?: string; layout?: string;
  skin?: string; accents?: string[]; imagePath?: string | null; fileName?: string; reshuffle?: number;
}
/** Both production and previews use the same renderer process. */
export async function renderRemote(body: RenderRequest): Promise<RenderResult & { url: string }> {
  const res = await fetch(`${process.env.RENDERER_URL ?? 'http://127.0.0.1:8787'}/render`, {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body), signal: AbortSignal.timeout(120_000),
  });
  if (!res.ok) throw new Error(`renderer: ${res.status} ${await res.text()}`);
  return await res.json() as RenderResult & { url: string };
}
