/**
 * The dashboard NEVER renders templates itself. Windows and Linux rasterise
 * type differently, so a local preview can fit where the container overflows.
 * Every pixel on these screens came out of the renderer service.
 */
export const RENDERER_URL = process.env.RENDERER_URL ?? 'http://127.0.0.1:8787';

export async function rendererFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${RENDERER_URL}${path}`, { cache: 'no-store', ...init });
  if (!res.ok) throw new Error(`renderer ${path}: ${res.status} ${await res.text()}`);
  return (await res.json()) as T;
}

export const rendererImage = (url: string): string => `/api/render/image?path=${encodeURIComponent(url)}`;

export interface Catalog {
  brands: { key: string; name: string }[];
  fixtures: string[];
  skins: string[];
  archetypes: { key: string; layouts: string[]; claimTypes: string[] }[];
}

export async function getCatalog(brand = 'f1'): Promise<Catalog | null> {
  try { return await rendererFetch<Catalog>(`/catalog?brand=${brand}`); } catch { return null; }
}
