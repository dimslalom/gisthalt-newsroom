import type { Brand } from '@newsroom/design';
import { SKINS } from '@newsroom/design';
import { archetypes } from './archetypes/index.ts';
import { blocklist, hedgeTerms, requiredFields, tierBAllowlist } from './blocklist.ts';
import { copy } from './copy.id.ts';
import { entities } from './entities.ts';
import { tokens } from './tokens.ts';

/** A brand is configuration. Adding brand two must not touch anything in apps/. */
export const f1: Brand = {
  key: 'f1',
  vertical: 'f1',
  name: 'Lintasan',
  tokens,
  skins: SKINS,
  archetypes,
  entities,
  blocklist,
  hedgeTerms,
  tierBAllowlist,
  requiredFields,
  copy,
};

export default f1;
export { archetypes, entities, tokens, copy };
export * from './copy.id.ts';
export * from './locale.id.ts';
