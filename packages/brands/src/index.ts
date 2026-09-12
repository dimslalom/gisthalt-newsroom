import vct from '../../../brands/vct/index.ts';
import film from '../../../brands/film/index.ts';
import type { Brand } from '@newsroom/design';
import f1 from '@newsroom/brand-f1';

/**
 * The registry. Adding brand two is one import and one array entry here, plus
 * a new folder under brands/. Nothing under apps/ changes.
 */
export const brands: Brand[] = [f1, vct, film];

export function brandByKey(key: string): Brand {
  const b = brands.find((x) => x.key === key);
  if (!b) throw new Error(`unknown brand "${key}"; known: ${brands.map((x) => x.key).join(', ')}`);
  return b;
}

export function brandForVertical(vertical: string): Brand {
  const b = brands.find((x) => x.vertical === vertical);
  if (!b) throw new Error(`no brand configured for vertical "${vertical}"`);
  return b;
}
