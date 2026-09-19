// Regenerates every brand's layouts.json from the minimal house style
// (packages/design/src/doc-minimal.ts): one document per archetype + layout slot.
// Layouts change, so re-run `pnpm golden --update` on Linux afterwards to re-certify.
import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { brands } from '@newsroom/brands';
import { minimalDoc, resolvedLayouts, type LayoutDocFile } from '@newsroom/design';

for (const brand of brands) {
  const file: LayoutDocFile = {};
  for (const archetype of brand.archetypes) {
    for (const slot of resolvedLayouts(brand.key, archetype.key, archetype.layouts)) {
      (file[archetype.key] ??= {})[slot.key] = minimalDoc(slot.key, slot.label);
    }
  }
  const path = resolve('brands', brand.key, 'layouts.json');
  writeFileSync(path, `${JSON.stringify(file, null, 2)}\n`);
  const count = Object.values(file).reduce((n, a) => n + Object.keys(a).length, 0);
  console.log(`${brand.key}: ${count} layouts -> ${path}`);
}
