/**
 * Anti-AI-language hard rules, human-readable version at
 * docs/writing-style-rules.md. Injected into every prompt that produces text
 * a reader will see (captions, headlines) — brand voice guides layer persona
 * and domain vocabulary on top of this, they never replace it.
 */
export const ANTI_AI_STYLE_RULES = `GAYA PENULISAN (wajib, berlaku di atas gaya brand mana pun):
- JANGAN pakai em dash (—), en dash (–), atau tanda hubung ganda (--). Kalau perlu menyambung dua gagasan, pecah jadi dua kalimat atau pakai koma.
- Minimalkan titik koma dan titik dua yang bersifat retoris/dramatis (titik dua struktural untuk label/jadwal/skor masih boleh).
- Kalimat aktif, bukan pasif berlapis. Padat dan wajar, jangan kaku seperti terjemahan mesin.
- Jangan pakai pola "bukan cuma X, tapi Y" atau variasinya.
- Jangan paksakan rangkaian tiga kata sifat/frasa sejajar sekaligus.
- Variasikan panjang kalimat, jangan seragam.
- Dilarang pakai klise: menyelami, permadani, lanskap, membuka potensi, memberdayakan, krusial, mulus, terpenting, mercusuar, menavigasi, tak terbantahkan, "di era digital ini".
- Jangan pakai basa-basi pembuka atau penutup formulaic ("kesimpulannya", "sebagai penutup").`;

/** Em dash, en dash, and double hyphen — the one rule cheap enough to enforce in code, not just ask for. */
export function hasBannedDash(text: string): boolean {
  return /[—–]|--/.test(text);
}
