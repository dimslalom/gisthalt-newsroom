import vct from '../../../brands/vct/index.ts';
import film from '../../../brands/film/index.ts';
import { applyThemeOverride, type Brand } from '@newsroom/design';
import f1 from '@newsroom/brand-f1';

/**
 * The registry. Adding brand two is one import and one array entry here, plus
 * a new folder under brands/. Nothing under apps/ changes.
 */
export const brands: Brand[] = [f1, vct, film];

/** Both lookups apply the brand's saved theme override (see
 *  theme-overrides.ts) on the way out, so every render path — the preview,
 *  production publishing, and the golden matrix — sees the same effective
 *  palette and fonts without a rebuild. `brands` itself stays the coded
 *  defaults for anything that genuinely wants those, e.g. the catalog list. */
export function brandByKey(key: string): Brand {
  const b = brands.find((x) => x.key === key);
  if (!b) throw new Error(`unknown brand "${key}"; known: ${brands.map((x) => x.key).join(', ')}`);
  return applyThemeOverride(b);
}

export function brandForVertical(vertical: string): Brand {
  const b = brands.find((x) => x.vertical === vertical);
  if (!b) throw new Error(`no brand configured for vertical "${vertical}"`);
  return applyThemeOverride(b);
}

/** Saved publishing identity; keys and Chrome profile IDs never change on rename. */
export interface WorkspaceBrand { key: string; name: string; vertical: Brand['vertical'] }
interface Settings { setting<T>(key: string, fallback: T): T }
export const accountPlatforms = ['x', 'instagram', 'threads', 'tiktok'] as const;
export function workspaceBrands(store: Settings): WorkspaceBrand[] {
  return brands.map(({ key, name, vertical }) => store.setting<WorkspaceBrand>(`brand:${key}`, { key, name, vertical }));
}
export function workspaceBrand(store: Settings, key: string): WorkspaceBrand {
  const brand = workspaceBrands(store).find((b) => b.key === key);
  if (!brand) throw new Error('unknown publishing brand');
  return brand;
}
export function platformsForBrand(store: Settings, key: string): typeof accountPlatforms[number][] {
  return store.setting(`brandPlatforms:${key}`, [...accountPlatforms]);
}
