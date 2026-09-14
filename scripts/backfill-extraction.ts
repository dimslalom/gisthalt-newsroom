import { resolve } from 'node:path';
import { getStore } from '@newsroom/db';
import { GeminiRouter, extractClaim } from '@newsroom/llm';
import { toRawItem } from '@newsroom/pipeline';

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const store = getStore(resolve('.data/store.json'));
const router = new GeminiRouter(store);

const stale = store.claims.filter((c) => c.tags.includes('unextracted'));
console.log(`${stale.length} unextracted claims to retry (paced at 1 per 2.5s to stay under the 30 rpm budget)\n`);

let fixed = 0, stillOffline = 0, verbatim = 0, failed = 0;
for (const claim of stale) {
  const item = store.getItem(claim.itemId);
  if (!item) { console.log(`skip ${claim.id}: source item missing`); continue; }
  try {
    const out = await extractClaim(router, toRawItem(item));
    if (out.claim?.tags?.includes('unextracted')) {
      stillOffline++;
      console.log(`OFFLINE  ${claim.headline?.slice(0, 60)}`);
    } else if (!out.claim) {
      failed++;
      console.log(`NO CLAIM ${claim.headline?.slice(0, 60)}`);
    } else {
      const before = claim.headline;
      const sameAsSource = out.claim.headline?.trim() === item.title.trim();
      claim.headline = out.claim.headline ?? claim.headline;
      claim.entities = out.claim.entities;
      claim.values = out.claim.values;
      claim.supportingQuote = out.quoteViolation ? null : out.claim.supportingQuote;
      claim.claimType = out.claim.claimType;
      claim.tags = [...(out.claim.tags ?? []), ...(out.quoteViolation ? [`quote:${out.quoteViolation}`] : [])];
      claim.extractedBy = 'gemini';
      if (sameAsSource) { verbatim++; console.log(`VERBATIM "${before?.slice(0, 50)}" (model echoed the English title)`); }
      else { fixed++; console.log(`FIXED    "${before?.slice(0, 50)}" -> "${claim.headline?.slice(0, 50)}"`); }
    }
  } catch (e) {
    failed++;
    console.log(`ERROR    ${claim.headline?.slice(0, 60)} :: ${(e as Error).message}`);
  }
  await sleep(2500);
}

store.saveNow();
console.log(`\ndone: ${fixed} fixed, ${verbatim} verbatim (model didn't translate), ${stillOffline} rate-limited, ${failed} hard failed, ${stale.length} total`);
