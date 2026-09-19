import type { RawItem } from '@newsroom/core';
import type { GeminiRouter } from './router.ts';
import { ANTI_AI_STYLE_RULES, hasBannedDash } from './style-rules.ts';

/**
 * The headline is the hook: the one line on the graphic that makes someone
 * stop scrolling. It is always Indonesian. A source title is English copy, not
 * a headline, and a generic label ("Kabar F1") is not a hook — neither may
 * ever reach a post. This module writes the hook and, more importantly, refuses
 * anything that isn't one.
 */

/** Hard ceiling. The prompt asks for HOOK_TARGET_CHARS so answers land under it. */
export const HOOK_MAX_CHARS = 80;
export const HOOK_TARGET_CHARS = 70;
export const HOOK_PROMPT_VERSION = 4;
/** Marks a claim whose `headline` passed checkHookHeadline(). */
export const HOOK_TAG = 'headline:id';

/** Placeholder labels that describe a category rather than the story. */
const GENERIC = ['kabar f1', 'kabar vct', 'kabar layar', 'berita f1', 'hasil sesi', 'klasemen pembalap', 'update f1', 'berita terbaru'];

/** A model talking about the task instead of doing it ("sumber tidak
 *  tersedia", "tidak dapat diringkas") is not a headline. */
const META = /\b(sumber|artikel|teks|konten|informasi)\b.*\b(tidak|belum)\b.*\b(tersedia|ada|lengkap|jelas|cukup)\b|\b(tidak (dapat|bisa)|gagal)\b.*\b(diringkas|dirangkum|dibuat|ditentukan|menulis|meringkas)\b|\bjudul\b.*\b(tidak|belum)\b|^(maaf|tidak ada)\b/i;

/** English function words. Two or more in a short line means it is English. */
const ENGLISH = new Set(['the', 'and', 'of', 'to', 'in', 'for', 'with', 'after', 'says', 'said', 'will', 'his', 'her', 'is', 'are', 'was', 'at', 'on', 'from', 'as', 'by', 'over', 'into', 'how', 'why', 'what', 'who', 'not', 'still', 'admits', 'reveals', 'wins', 'set', 'be', 'has', 'have']);

const words = (s: string): string[] => s.toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '').match(/[\p{L}\p{N}]+/gu) ?? [];
const numbers = (s: string): string[] => s.match(/\d+(?:[.,:]\d+)*/g) ?? [];

export interface HookSource { title: string; body: string }

/** Why this line is not a usable hook, or null when it is one. */
export function checkHookHeadline(headline: string | null | undefined, source: HookSource): string | null {
  const h = headline?.replace(/\s+/g, ' ').trim() ?? '';
  if (!h) return 'empty';
  if (h.length > HOOK_MAX_CHARS) return `longer than ${HOOK_MAX_CHARS} characters`;
  if (hasBannedDash(h)) return 'contains a banned dash';
  if (GENERIC.includes(h.toLowerCase())) return 'generic label, not a hook';
  if (META.test(h)) return 'describes the source instead of the story';
  const hw = words(h);
  if (hw.length < 3) return 'too short to be a hook';
  if (hw.filter((w) => ENGLISH.has(w)).length >= 2) return 'reads as English';
  const tw = new Set(words(source.title));
  const shared = hw.filter((w) => tw.has(w)).length;
  if (h.toLowerCase() === source.title.trim().toLowerCase() || (hw.length >= 4 && shared / hw.length > 0.8)) return 'copies the source title';
  const known = new Set(numbers(`${source.title}\n${source.body}`));
  const invented = numbers(h).filter((n) => !known.has(n));
  if (invented.length) return `number not in the source: ${invented.join(', ')}`;
  return null;
}

export function hookPrompt(item: Pick<RawItem, 'title' | 'body' | 'sourceDomain'>, opts: { brandName?: string; voiceGuide?: string; rejected?: string } = {}): string {
  return `Tulis SATU judul berbahasa Indonesia untuk grafik berita${opts.brandName ? ` akun ${opts.brandName}` : ''}.

Judul ini adalah hook utama postingan: satu-satunya teks besar di gambar, yang membuat orang berhenti scroll.

ATURAN KERAS:
- Bahasa Indonesia yang wajar, bukan terjemahan kaku dan bukan salinan judul sumber.
- Usahakan maksimum ${HOOK_TARGET_CHARS} karakter; lebih dari ${HOOK_MAX_CHARS} karakter pasti ditolak. Tanpa titik di akhir. Tanpa emoji. Tanpa tagar.
- Sebut subjek utama (nama pembalap, tim, pemain, atau judul film) di awal.
- Pakai kata kerja aktif yang kuat dan spesifik pada inti cerita. Hindari judul umum seperti "Kabar F1".
- HANYA fakta yang ada di SUMBER. Jangan menambah angka, posisi, hasil, nama, atau klaim, termasuk yang ditulis dengan kata ("ketujuh", "tiga").
- Atribusi harus tepat: kalau sumber berisi ucapan atau pendapat seseorang, subjek judul adalah orang yang mengatakannya, bukan orang yang dibicarakan.
- Kalau sumber berupa rumor atau laporan belum resmi, tandai dengan "Kabarnya" atau "Dikabarkan".
- Istilah teknis balap tetap dalam bahasa Inggris (pole, undercut, safety car, dan sejenisnya).
- Kalau SUMBER tidak berisi cerita yang cukup untuk judul, balas {"headline": ""}. Jangan menulis tentang sumbernya.
- Balas JSON saja: {"headline": "..."}
${opts.rejected ? `\nJudul sebelumnya ditolak karena: ${opts.rejected}. Perbaiki.\n` : ''}
${ANTI_AI_STYLE_RULES}
${opts.voiceGuide ? `\nSUARA BRAND:\n${opts.voiceGuide}\n` : ''}
SUMBER (${item.sourceDomain}):
JUDUL: ${item.title}
ISI: ${item.body.slice(0, 2500)}`;
}

export interface HookResult {
  headline: string | null;
  /** No model was reachable; try again later rather than giving up on the claim. */
  offline: boolean;
  reason: string | null;
}

/** Up to three attempts; each retry is told why the previous one was rejected. */
export async function writeHookHeadline(
  router: GeminiRouter,
  item: Pick<RawItem, 'title' | 'body' | 'sourceDomain' | 'sourceKey' | 'externalId'>,
  opts: { brandName?: string; voiceGuide?: string } = {},
): Promise<HookResult> {
  let rejected: string | undefined;
  for (let attempt = 0; attempt < 3; attempt++) {
    let res;
    try {
      // The extract route: Flash-Lite first, Flash as its fallback. The copy
      // route is Flash alone with no fallback, so one 503 spike from it left
      // every claim without a hook.
      res = await router.call<{ headline?: unknown }>({
        purpose: 'extract', json: true, maxOutputTokens: 512,
        prompt: hookPrompt(item, { ...opts, rejected }),
        // Bump HOOK_PROMPT_VERSION whenever the prompt changes, or cached hooks
        // written under the old rules keep being served.
        cacheKey: `hook:v${HOOK_PROMPT_VERSION}:${item.sourceKey}:${item.externalId}:${item.title}:${attempt}`,
      });
    } catch (e) {
      return { headline: null, offline: false, reason: (e as Error).message };
    }
    if (res.offline) return { headline: null, offline: true, reason: 'no model available' };
    const candidate = typeof res.json?.headline === 'string' ? res.json.headline.replace(/\s+/g, ' ').trim().replace(/\.$/, '') : '';
    const problem = checkHookHeadline(candidate, item);
    if (!problem) return { headline: candidate, offline: false, reason: null };
    rejected = problem;
  }
  return { headline: null, offline: false, reason: rejected ?? 'rejected' };
}
