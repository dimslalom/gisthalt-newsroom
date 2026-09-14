import type { Store, ReviewRow } from '@newsroom/db';

export interface ReviewCard {
  title: string;
  description: string;
  fields: { name: string; value: string; inline?: boolean }[];
  /** Every rendered image for this composition (a carousel has more than one),
   * in post order. The first is the embed's own preview image. */
  imagePaths: string[];
  footer: string;
  colour: number;
}

const DASH = '–';

const PLATFORM_LABELS: Record<string, string> = { x: 'X', instagram: 'Instagram', threads: 'Threads', tiktok: 'TikTok' };

/**
 * One embed with the rendered image attached, so design and copy are judged in
 * the same glance on a phone. Pure, so it is testable without a gateway.
 */
export function buildReviewCard(store: Store, review: ReviewRow, now: Date): ReviewCard {
  const claim = store.getClaim(review.claimId);
  const item = claim ? store.getItem(claim.itemId) : undefined;
  const comp = review.compositionId ? store.getComposition(review.compositionId) : undefined;

  const numbers = claim ? Object.values(claim.values).filter((v) => typeof v === 'number').length : 0;
  const quote = claim?.supportingQuote;
  const quoteField = quote
    ? `“${quote.slice(0, 300)}”`
    : `support found for 0 of ${numbers} numbers`;

  const minutesLeft = Math.max(0, Math.round((review.expiresAt.getTime() - now.getTime()) / 60_000));

  // X's caption stays the description (it's the platform the whole card is
  // framed around); every other platform gets its own field so a reviewer can
  // catch a platform-specific miss without opening the design editor.
  const otherCaptions = comp
    ? Object.entries(comp.captionByPlatform)
        .filter(([platform]) => platform !== 'x')
        .map(([platform, text]) => ({
          name: PLATFORM_LABELS[platform] ?? platform,
          value: (text || DASH).slice(0, 1024),
          inline: false,
        }))
    : [];

  return {
    title: claim?.headline ?? item?.title ?? '(no headline)',
    description: comp?.captionByPlatform.x ?? '(not yet composed)',
    colour: minutesLeft < 15 ? 0xef4d5a : 0xf0a33a,
    fields: [
      { name: 'Rule', value: `${review.rule} — ${review.reason}`, inline: false },
      { name: 'Source', value: `tier ${claim?.sourceTier ?? '?'} · ${claim?.sourceDomain ?? DASH}`, inline: true },
      { name: 'Claim', value: `\`${claim?.claimType ?? DASH}\``, inline: true },
      { name: 'Supporting quote', value: quoteField, inline: false },
      ...(item?.rawUrl ? [{ name: 'Link', value: item.rawUrl, inline: false }] : []),
      ...otherCaptions,
    ],
    imagePaths: comp?.imagePaths ?? [],
    footer: `expires in ${minutesLeft}m · ${review.id.slice(0, 8)}`,
  };
}

/** Approving must be one tap. Everything after Publish is the exception path. */
export const BUTTONS = [
  { id: 'publish', label: 'Publish', style: 'primary' as const },
  { id: 'edit', label: 'Edit caption', style: 'secondary' as const },
  { id: 'reshuffle', label: 'Reshuffle design', style: 'secondary' as const },
  { id: 'hold', label: 'Hold for second source', style: 'secondary' as const },
  { id: 'reject', label: 'Reject', style: 'danger' as const },
];
