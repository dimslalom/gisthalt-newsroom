'use client';
import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * The brand's *saved* palette and fonts; every layout's default, not one
 * layer's override (that's the Inspector's Colour/Font fields). Backed by
 * brands/<key>/theme-override.json on the renderer; see
 * packages/design/src/theme-overrides.ts for why this stays config-as-code
 * instead of a database row.
 */

const SKIN_ROLES = ['bg', 'panel', 'fg', 'muted', 'line', 'fallbackAccent'] as const;
type SkinRole = (typeof SKIN_ROLES)[number];
const ROLE_LABEL: Record<SkinRole, string> = {
  bg: 'Background', panel: 'Panel', fg: 'Foreground text', muted: 'Muted text', line: 'Hairlines', fallbackAccent: 'Accent (no team colour)',
};
const FONT_SLOTS = ['display', 'body', 'mono'] as const;
type FontSlot = (typeof FONT_SLOTS)[number];
const FONT_LABEL: Record<FontSlot, string> = { display: 'Display / headlines', body: 'Body text', mono: 'Numerics / mono' };

const LS_SLOTS = ['disp', 'lab'] as const;
type LsSlot = (typeof LS_SLOTS)[number];
const LS_LABEL: Record<LsSlot, string> = { disp: 'Display / headlines', lab: 'Labels / eyebrow (uppercase)' };

interface SkinTheme { key: string; bg: string; panel: string; fg: string; muted: string; line: string; fallbackAccent?: string }
interface ThemeOverride {
  skins?: Record<string, Partial<Record<SkinRole, string>>>;
  fonts?: Partial<Record<FontSlot, { family: string; google?: boolean }>>;
  letterSpacing?: Partial<Record<LsSlot, string>>;
}
interface ThemeResponse {
  override: ThemeOverride;
  effective: { skins: SkinTheme[]; fonts: Record<FontSlot, string>; letterSpacing: Record<LsSlot, string> };
}

const HEX_RE = /^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i;
const firstFamily = (css: string): string => css.match(/'([^']+)'/)?.[1] ?? css.split(',')[0]?.trim() ?? css;
/** "-0.03em" -> -3 (percent), the unit a designer actually thinks in. */
const emToPercent = (em: string): number => {
  const n = parseFloat(em);
  return Number.isFinite(n) ? Math.round(n * 1000) / 10 : 0;
};

/** "DIN Condensed Bold.ttf" -> family "DIN Condensed", weight 700; a
 *  starting guess the designer can still edit before it's pinned. */
const WEIGHT_WORDS: [RegExp, number][] = [
  [/\bthin\b/i, 100], [/\bextra-?light\b/i, 200], [/\blight\b/i, 300],
  [/\bmedium\b/i, 500], [/\bsemi-?bold\b/i, 600], [/\bextra-?bold\b|\bheavy\b/i, 800],
  [/\bblack\b/i, 900], [/\bbold\b/i, 700],
];
function guessFromFileName(name: string): { family: string; weight: number } {
  const base = name.replace(/\.[^.]+$/, '');
  const weight = WEIGHT_WORDS.find(([re]) => re.test(base))?.[1] ?? 400;
  const family = base.replace(/[-_](thin|extra-?light|light|regular|normal|medium|semi-?bold|bold|extra-?bold|heavy|black|italic|oblique)\b/gi, ' ')
    .replace(/\b(thin|extra-?light|light|regular|normal|medium|semi-?bold|bold|extra-?bold|heavy|black|italic|oblique)\b/gi, ' ')
    .replace(/[-_]+/g, ' ').replace(/\s+/g, ' ').trim();
  return { family: family || base, weight };
}

/** Chunked to stay well under browsers' call-stack limit on spread args —
 *  a 32KB window is the standard safe size for this pattern. */
function bytesToBase64(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  let binary = '';
  for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(binary);
}

type FontMode = 'idle' | 'google' | 'upload';
interface UploadDraft { file: File; family: string; weight: number }

export function ThemePanel({ brand, skin, onChanged }: { brand: string; skin: string; onChanged: () => void }) {
  const [data, setData] = useState<ThemeResponse | null>(null);
  const [busy, setBusy] = useState<string | null>(null); // which field is in flight
  const [error, setError] = useState<string | null>(null);
  const [fontMode, setFontMode] = useState<Record<FontSlot, FontMode>>({ display: 'idle', body: 'idle', mono: 'idle' });
  const [fontDraft, setFontDraft] = useState<Record<FontSlot, string>>({ display: '', body: '', mono: '' });
  const [uploadDraft, setUploadDraft] = useState<Partial<Record<FontSlot, UploadDraft>>>({});
  const fileInputs = useRef<Partial<Record<FontSlot, HTMLInputElement>>>({});

  const load = useCallback(async () => {
    const res = await fetch(`/api/theme?brand=${brand}`, { cache: 'no-store' });
    const json = await res.json() as ThemeResponse;
    setData(json);
  }, [brand]);

  useEffect(() => { void load(); }, [load]);

  const activeSkin = data?.effective.skins.find((s) => s.key === skin) ?? data?.effective.skins[0];
  const overrideForSkin = data?.override.skins?.[activeSkin?.key ?? ''] ?? {};

  async function saveColour(role: SkinRole, hex: string) {
    if (!activeSkin || !HEX_RE.test(hex)) return;
    setBusy(`skin:${role}`); setError(null);
    try {
      const res = await fetch('/api/theme', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ brand, patch: { skins: { [activeSkin.key]: { [role]: hex } } } }),
      });
      const json = await res.json() as { error?: string };
      if (json.error) setError(json.error); else { await load(); onChanged(); }
    } finally { setBusy(null); }
  }

  async function resetColour(role: SkinRole) {
    if (!activeSkin) return;
    setBusy(`skin:${role}`); setError(null);
    try {
      await fetch('/api/theme?clear=1', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ brand, skin: activeSkin.key, role }),
      });
      await load(); onChanged();
    } finally { setBusy(null); }
  }

  async function fetchFont(slot: FontSlot) {
    const family = fontDraft[slot].trim();
    if (!family) return;
    setBusy(`font:${slot}`); setError(null);
    try {
      const res = await fetch('/api/theme/font', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ brand, slot, family }),
      });
      const json = await res.json() as { error?: string };
      if (json.error) { setError(`${family}: ${json.error}`); return; }
      setFontDraft((d) => ({ ...d, [slot]: '' }));
      setFontMode((m) => ({ ...m, [slot]: 'idle' }));
      await load(); onChanged();
    } finally { setBusy(null); }
  }

  function pickUploadFile(slot: FontSlot) {
    fileInputs.current[slot]?.click();
  }

  function onFileChosen(slot: FontSlot, file: File | undefined) {
    if (!file) return;
    setUploadDraft((d) => ({ ...d, [slot]: { file, ...guessFromFileName(file.name) } }));
    setFontMode((m) => ({ ...m, [slot]: 'upload' }));
  }

  async function confirmUpload(slot: FontSlot) {
    const draft = uploadDraft[slot];
    if (!draft?.family.trim()) return;
    setBusy(`font:${slot}`); setError(null);
    try {
      const fileBase64 = bytesToBase64(await draft.file.arrayBuffer());
      const res = await fetch('/api/theme/font/upload', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ brand, slot, family: draft.family.trim(), weight: draft.weight, fileBase64 }),
      });
      const json = await res.json() as { error?: string };
      if (json.error) { setError(`${draft.file.name}: ${json.error}`); return; }
      setUploadDraft((d) => { const next = { ...d }; delete next[slot]; return next; });
      setFontMode((m) => ({ ...m, [slot]: 'idle' }));
      await load(); onChanged();
    } finally { setBusy(null); }
  }

  async function resetFont(slot: FontSlot) {
    setBusy(`font:${slot}`); setError(null);
    try {
      await fetch('/api/theme?clear=1', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ brand, font: slot }),
      });
      setFontMode((m) => ({ ...m, [slot]: 'idle' }));
      await load(); onChanged();
    } finally { setBusy(null); }
  }

  async function saveTracking(slot: LsSlot, percent: number) {
    if (!Number.isFinite(percent)) return;
    setBusy(`ls:${slot}`); setError(null);
    try {
      const res = await fetch('/api/theme', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ brand, patch: { letterSpacing: { [slot]: percent } } }),
      });
      const json = await res.json() as { error?: string };
      if (json.error) setError(json.error); else { await load(); onChanged(); }
    } finally { setBusy(null); }
  }

  async function resetTracking(slot: LsSlot) {
    setBusy(`ls:${slot}`); setError(null);
    try {
      await fetch('/api/theme?clear=1', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ brand, letterSpacing: slot }),
      });
      await load(); onChanged();
    } finally { setBusy(null); }
  }

  if (!data || !activeSkin) return <p style={{ fontSize: 12, color: 'var(--muted)' }}>Loading brand theme…</p>;

  return (
    <div className="theme-panel" style={{ display: 'grid', gap: 16 }}>
      <div>
        <div className="panel-title" style={{ fontSize: 14, marginBottom: 8 }}>Palette <span className="metadata">{activeSkin.key} skin</span></div>
        <div className="theme-palette">
          {SKIN_ROLES.map((role) => {
            const value = activeSkin[role] ?? '';
            const overridden = overrideForSkin[role] !== undefined;
            return (
              <div key={role} style={{ display: 'grid', gap: 3 }}>
                <label style={{ fontSize: 11, color: 'var(--muted)' }}><span className="metadata"><span>{ROLE_LABEL[role]}</span>{overridden && <span>custom</span>}</span></label>
                <div className="row" style={{ gap: 4, flexWrap: 'nowrap' }}>
                  <input type="color" value={HEX_RE.test(value) ? value.slice(0, 7) : '#000000'}
                    onChange={(e) => void saveColour(role, e.target.value)}
                    style={{ width: 28, height: 27, padding: 1, border: '1px solid var(--line)', background: 'none' }} />
                  <input defaultValue={value} key={value} placeholder="#rrggbb"
                    onBlur={(e) => { if (e.target.value !== value) void saveColour(role, e.target.value); }}
                    style={{ flex: 1, fontSize: 11 }} />
                  {overridden && (
                    <button type="button" title="Reset to brand default" disabled={busy === `skin:${role}`}
                      onClick={() => void resetColour(role)} style={{ fontSize: 10, padding: '3px 6px' }}>↺</button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <div>
        <div className="panel-title" style={{ fontSize: 14, marginBottom: 8 }}>Fonts</div>
        <div style={{ display: 'grid', gap: 10 }}>
          {FONT_SLOTS.map((slot) => {
            const current = firstFamily(data.effective.fonts[slot]);
            const overridden = Boolean(data.override.fonts?.[slot]);
            const pinned = data.override.fonts?.[slot]?.google;
            const mode = fontMode[slot];
            const draft = uploadDraft[slot];
            return (
              <div key={slot} style={{ display: 'grid', gap: 6 }}>
                <div className="row" style={{ gap: 6, flexWrap: 'nowrap', alignItems: 'flex-end' }}>
                  <div style={{ minWidth: 130 }}>
                    <div style={{ fontSize: 11, color: 'var(--muted)' }}>{FONT_LABEL[slot]}</div>
                    <div style={{ fontSize: 13 }}><span>{current}</span><span className="metadata">{overridden ? (pinned ? 'Google Font' : 'Uploaded') : 'Brand default'}</span></div>
                  </div>
                  <div className="row" style={{ gap: 4, flexWrap: 'nowrap', marginLeft: 'auto' }}>
                    <button type="button" aria-pressed={mode === 'google'}
                      className={`toggle ${mode === 'google' ? 'on' : ''}`}
                      onClick={() => setFontMode((m) => ({ ...m, [slot]: m[slot] === 'google' ? 'idle' : 'google' }))}
                      style={{ fontSize: 11, padding: '4px 8px' }}>Google Fonts</button>
                    <button type="button" onClick={() => pickUploadFile(slot)} style={{ fontSize: 11, padding: '4px 8px' }}>Upload font</button>
                    <input ref={(el) => { if (el) fileInputs.current[slot] = el; }} type="file" accept=".ttf,.otf,.woff,.woff2"
                      style={{ display: 'none' }} onChange={(e) => { onFileChosen(slot, e.target.files?.[0]); e.target.value = ''; }} />
                    {overridden && (
                      <button type="button" title="Reset to brand default" disabled={busy === `font:${slot}`}
                        onClick={() => void resetFont(slot)} style={{ fontSize: 10, padding: '4px 6px' }}>↺</button>
                    )}
                  </div>
                </div>

                {mode === 'google' && (
                  <div className="row" style={{ gap: 6, flexWrap: 'nowrap' }}>
                    <input value={fontDraft[slot]} placeholder="e.g. Poppins" autoFocus
                      onChange={(e) => setFontDraft((d) => ({ ...d, [slot]: e.target.value }))}
                      style={{ flex: 1, fontSize: 12 }} />
                    <button type="button" disabled={busy === `font:${slot}` || !fontDraft[slot].trim()}
                      onClick={() => void fetchFont(slot)} style={{ fontSize: 11, padding: '4px 8px', whiteSpace: 'nowrap' }}>
                      {busy === `font:${slot}` ? 'Fetching…' : 'Fetch & use'}
                    </button>
                    <button type="button" onClick={() => setFontMode((m) => ({ ...m, [slot]: 'idle' }))}
                      style={{ fontSize: 11, padding: '4px 8px' }}>Cancel</button>
                  </div>
                )}

                {mode === 'upload' && draft && (
                  <div className="row" style={{ gap: 6, flexWrap: 'nowrap', alignItems: 'flex-end' }}>
                    <div style={{ fontSize: 11, color: 'var(--muted)', maxWidth: 140, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={draft.file.name}>
                      {draft.file.name}
                    </div>
                    <label className="field" style={{ flex: 1 }}>Family
                      <input value={draft.family} onChange={(e) => setUploadDraft((d) => ({ ...d, [slot]: { ...draft, family: e.target.value } }))} />
                    </label>
                    <label className="field" style={{ width: 80 }}>Weight
                      <input type="number" step={100} min={100} max={900} value={draft.weight}
                        onChange={(e) => setUploadDraft((d) => ({ ...d, [slot]: { ...draft, weight: Number(e.target.value) } }))} />
                    </label>
                    <button type="button" disabled={busy === `font:${slot}` || !draft.family.trim()}
                      onClick={() => void confirmUpload(slot)} style={{ fontSize: 11, padding: '4px 8px', whiteSpace: 'nowrap' }}>
                      {busy === `font:${slot}` ? 'Uploading…' : 'Use this font'}
                    </button>
                    <button type="button" onClick={() => { setUploadDraft((d) => { const next = { ...d }; delete next[slot]; return next; }); setFontMode((m) => ({ ...m, [slot]: 'idle' })); }}
                      style={{ fontSize: 11, padding: '4px 8px' }}>Cancel</button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
        <p style={{ fontSize: 11, color: 'var(--muted)', margin: '6px 0 0' }}>
          Fetch a Google Font or upload a font file. Fonts are stored with this brand.
        </p>
      </div>

      <div>
        <div className="panel-title" style={{ fontSize: 14, marginBottom: 8 }}>Tracking (letter-spacing)</div>
        <div className="row" style={{ gap: 14, flexWrap: 'wrap' }}>
          {LS_SLOTS.map((slot) => {
            const percent = emToPercent(data.effective.letterSpacing[slot]);
            const overridden = data.override.letterSpacing?.[slot] !== undefined;
            return (
              <div key={slot} style={{ display: 'grid', gap: 3 }}>
                <label style={{ fontSize: 11, color: 'var(--muted)' }}><span className="metadata"><span>{LS_LABEL[slot]}</span>{overridden && <span>custom</span>}</span></label>
                <div className="row" style={{ gap: 4, flexWrap: 'nowrap' }}>
                  <input type="number" step={0.5} defaultValue={percent} key={percent}
                    onBlur={(e) => { const v = Number(e.target.value); if (v !== percent) void saveTracking(slot, v); }}
                    style={{ width: 70, fontSize: 12 }} />
                  <span style={{ fontSize: 12, color: 'var(--muted)', alignSelf: 'center' }}>%</span>
                  {overridden && (
                    <button type="button" title="Reset to brand default" disabled={busy === `ls:${slot}`}
                      onClick={() => void resetTracking(slot)} style={{ fontSize: 10, padding: '3px 6px' }}>↺</button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {error && <p style={{ fontSize: 12, color: 'var(--bad)', margin: 0 }}>{error}</p>}
    </div>
  );
}
