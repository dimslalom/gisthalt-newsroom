import type { Claim } from '@newsroom/core';
import { dedupeHash } from '@newsroom/core';
import type { GeminiRouter } from './router.ts';

/**
 * Copy only. Every fact in the caption is already confirmed and present in
 * `fields`; the model is asked to phrase, never to add. Cached by claim hash,
 * so a retry or a design reshuffle costs nothing.
 */
export function captionPrompt(fields: Record<string, unknown>, platform: string, maxChars: number, fallback: string, voiceGuide?: string): string {
  return `Tulis caption media sosial berbahasa Indonesia untuk akun berita.

ATURAN KERAS:
- Gunakan HANYA fakta dari FIELDS. Jangan menambah angka, nama, atau klaim apa pun.
- Maksimum ${maxChars} karakter, termasuk tagar.
- Jangan menyertakan URL apa pun.
- Nada: ringkas, faktual, percaya diri. Bukan clickbait.
- Platform: ${platform}.
- Balas hanya dengan teks caption.
${voiceGuide ? `\nSUARA DAN GAYA BRAND (wajib diikuti):\n${voiceGuide}\n` : ''}
FIELDS: ${JSON.stringify(fields)}

Caption cadangan (pakai gaya ini jika ragu): ${fallback}`;
}

export async function writeCaption(
  router: GeminiRouter,
  claim: Claim,
  fields: Record<string, unknown>,
  platform: string,
  maxChars: number,
  fallback: string,
  voiceGuide?: string,
): Promise<{ caption: string; model: string; cached: boolean; usedFallback: boolean }> {
  if (claim.sourceTier === 'A') return { caption: fallback, model: 'none', cached: false, usedFallback: true };
  try {
    const res = await router.call({
      purpose: 'copy',
      prompt: captionPrompt(fields, platform, maxChars, fallback, voiceGuide),
      cacheKey: `caption:${dedupeHash(claim)}:${platform}:${voiceGuide ? 'v' : 'nov'}`,
      maxOutputTokens: 400,
    });
    const text = res.text.trim();
    // A caption that smuggled in a URL or overran the limit is discarded, not patched.
    const allowedNumbers = new Set((JSON.stringify(fields) + fallback).match(/\d+(?:[.:]\d+)*/g) ?? []);
    const supportedNumbers = (text.match(/\d+(?:[.:]\d+)*/g) ?? []).every(n=>allowedNumbers.has(n));
    const clean = text && supportedNumbers && !/https?:\/\//i.test(text) && text.length <= maxChars;
    return {
      caption: clean ? text : fallback,
      model: res.model,
      cached: res.cached,
      usedFallback: !clean,
    };
  } catch {
    return { caption: fallback, model: 'none', cached: false, usedFallback: true };
  }
}
