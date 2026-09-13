import { assertContrast, onColourFor, contrastRatio, type ResolvedPair } from './guards/contrast.ts';
import { getLayoutOverride } from './overrides.ts';
import type { CompositionSpec, TableRow } from './types.ts';

const esc = (s: string): string =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

export const CANVAS = { width: 1080, height: 1350 } as const;

/**
 * Resolve every colour the layout will actually use, after skin and entity
 * colour injection, then hand the pairs to assertContrast. This is the only
 * place the two are allowed to disagree.
 */
export function resolveColours(spec: CompositionSpec): { vars: Record<string, string>; pairs: ResolvedPair[] } {
  const { skin, model } = spec;
  const entity = skin.usesEntityColour ? model.entity : null;
  const accent = entity?.hex ?? skin.fallbackAccent ?? (skin.key === 'archival' ? '#B4553A' : '#E4E9EB');
  const onAccent = onColourFor(accent);
  const accentText = contrastRatio(accent, skin.bg) >= 4.5 ? accent : skin.fg;
  const muted = contrastRatio(skin.muted, skin.bg) >= 4.5 && contrastRatio(skin.muted, skin.panel) >= 4.5 ? skin.muted : skin.fg;

  // team skin paints a band of the entity colour; everything on it must read.
  const vars: Record<string, string> = {
    '--bg': skin.bg,
    '--panel': skin.panel,
    '--fg': skin.fg,
    '--muted': muted,
    '--accent-text': accentText,
    '--line': skin.line,
    '--accent': accent,
    '--on-accent': onAccent,
    '--scrim': String(spec.textTreatment?.scrim ?? 0.35),
    '--over-colour': spec.textTreatment?.colour ?? skin.fg,
  };

  const pairs: ResolvedPair[] = [
    { label: 'headline on bg', fg: skin.fg, bg: skin.bg, large: true },
    { label: 'body on bg', fg: skin.fg, bg: skin.bg },
    { label: 'muted on bg', fg: muted, bg: skin.bg },
    { label: 'muted on panel', fg: muted, bg: skin.panel },
    { label: 'accent text on bg', fg: accentText, bg: skin.bg },
    { label: 'text on accent', fg: onAccent, bg: accent },
  ];
  for (const r of model.rows ?? []) {
    if (r.colour && r.onColour) pairs.push({ label: `row ${r.rank} chip`, fg: onColourFor(r.colour), bg: r.colour });
  }
  return { vars, pairs };
}

const BASE_CSS = String.raw`
*{box-sizing:border-box;margin:0;padding:0}
.art{width:1080px;height:1350px;position:relative;overflow:hidden;background:var(--bg);color:var(--fg);
     font-family:var(--font-body);display:grid;isolation:isolate}
.disp{font-family:var(--font-display);font-weight:700;letter-spacing:var(--ls-disp);line-height:.92;text-wrap:balance}
.lab{font-family:var(--font-mono);font-weight:500;font-size:var(--fs-lab);letter-spacing:var(--ls-lab);text-transform:uppercase}
.num{font-variant-numeric:tabular-nums;font-family:var(--font-mono)}

/* photo bed ---------------------------------------------------------- */
.bed{position:absolute;inset:0;z-index:0;overflow:hidden;background:var(--panel)}
.bed img{width:100%;height:100%;object-fit:cover;object-position:50% 35%;display:block}
.bed.duotone img{filter:grayscale(1) contrast(1.15)}
.bed.duotone::after{content:"";position:absolute;inset:0;background:var(--accent);mix-blend-mode:color;opacity:.55}
.scrim{position:absolute;inset:0;z-index:1;
  /* Two-ended: the header and footer chrome must stay legible over a busy
     photo, which is the failure the image-busy fixture exists to catch. */
  background:
    linear-gradient(to bottom, rgba(0,0,0,.72) 0%, rgba(0,0,0,.35) 9%, rgba(0,0,0,0) 18%),
    linear-gradient(to top, rgba(0,0,0,calc(var(--scrim) + .25)) 0%, rgba(0,0,0,var(--scrim)) 45%, rgba(0,0,0,0) 85%)}
.art.no-photo .bed,.art.no-photo .scrim{display:none}

/* chrome ------------------------------------------------------------- */
.layer{position:relative;z-index:3;display:grid;height:100%;padding:var(--pad);grid-template-rows:auto 1fr auto;gap:calc(var(--u)*3)}
.hdr{display:flex;align-items:baseline;justify-content:space-between;gap:var(--pad)}
.eyebrow{color:var(--accent-text)}
.logo{font-family:var(--font-display);font-weight:700;font-size:var(--fs-lab);letter-spacing:.18em;text-transform:uppercase;color:var(--fg)}
.logo .mark{color:var(--accent-text)}
.logo-svg{width:calc(var(--fs-lab) * 1.9);height:calc(var(--fs-lab) * 1.9);line-height:0}
.logo-svg svg{width:100%;height:100%;display:block}
.foot{display:flex;justify-content:space-between;align-items:end;gap:var(--u);color:var(--muted);font-size:var(--fs-fine)}
.rule{height:var(--stroke);background:var(--accent);width:120px}

.body{display:grid;align-content:end;gap:calc(var(--u)*2.5);min-height:0}
.headline{font-size:var(--fs-h1)}
.sub{font-size:var(--fs-body);color:var(--muted);max-width:820px;line-height:1.25}
.bignum{font-family:var(--font-display);font-weight:700;line-height:.8;font-size:var(--fs-mega);
        letter-spacing:-.02em;color:var(--accent-text);font-variant-numeric:tabular-nums}
.biglabel{color:var(--muted)}

blockquote{font-family:var(--font-display);font-weight:600;font-size:var(--fs-h2);line-height:1.06;
           border-left:calc(var(--stroke)*2) solid var(--accent);padding-left:calc(var(--u)*3)}
.attrib{color:var(--muted);font-size:var(--fs-fine)}

/* table -------------------------------------------------------------- */
table.rows{width:100%;border-collapse:collapse;font-size:var(--fs-body)}
table.rows td{padding:calc(var(--u)*1.25) 0;border-bottom:1px solid var(--line);vertical-align:middle}
table.rows tr:last-child td{border-bottom:0}
td.rank{width:72px;font-family:var(--font-mono);color:var(--muted);font-variant-numeric:tabular-nums}
td.chip{width:14px;padding-right:calc(var(--u)*1.5)}
td.chip i{display:block;width:8px;height:34px;background:var(--row-colour,var(--accent))}
td.primary{font-family:var(--font-display);font-weight:600;letter-spacing:-.005em;white-space:nowrap;
           overflow:hidden;text-overflow:ellipsis;max-width:420px}
td.secondary{color:var(--muted);font-size:var(--fs-fine);text-transform:uppercase;letter-spacing:.08em;
             white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:260px}
td.value{text-align:right;font-family:var(--font-mono);font-variant-numeric:tabular-nums;white-space:nowrap}
td.trailing{text-align:right;font-family:var(--font-mono);color:var(--muted);font-size:var(--fs-fine);
            font-variant-numeric:tabular-nums;white-space:nowrap;width:150px}
.rows.dense td{padding:calc(var(--u)*.6) 0;font-size:calc(var(--fs-body)*.78)}
.rows.dense td.chip i{height:22px}
.rows.roomy td{padding:calc(var(--u)*2.4) 0}

/* layouts ------------------------------------------------------------ */
.layout-hero-left .body{align-content:end;justify-items:start;text-align:left}
.layout-hero-left .headline{font-size:var(--fs-hero);max-width:900px}

.layout-hero-right .body{padding-left:calc(var(--pad)*1.2);justify-items:end;text-align:right}
.layout-hero-right .headline{font-size:var(--fs-hero);max-width:840px}
.layout-hero-right .hdr{flex-direction:row-reverse}
.layout-hero-right .foot{flex-direction:row-reverse}

.layout-full-bleed .bed img{object-position:50% 30%}
.layout-full-bleed .layer{padding:calc(var(--pad)*1.1)}
.layout-full-bleed .headline{font-size:var(--fs-hero);text-shadow:0 2px 40px rgba(0,0,0,.5)}
.layout-full-bleed .scrim{background:
  linear-gradient(to bottom,rgba(0,0,0,.75) 0%,rgba(0,0,0,.4) 10%,rgba(0,0,0,0) 20%),
  linear-gradient(to top,rgba(0,0,0,calc(var(--scrim) + .35)) 10%,rgba(0,0,0,0) 70%)}

.layout-framed .layer{padding:calc(var(--pad)*1.35)}
.layout-framed::before{content:"";position:absolute;inset:32px;border:var(--stroke) solid var(--accent);z-index:2;pointer-events:none}
.layout-framed .body{align-content:center;text-align:center;justify-items:center}
.layout-framed .headline{font-size:var(--fs-h1);max-width:780px}
.layout-framed .sub{text-align:center}

.layout-split .layer{grid-template-rows:auto auto 1fr auto}
.layout-split .bed{inset:0 0 auto 0;height:520px}
.layout-split .scrim{inset:0 0 auto 0;height:520px}
.layout-split .body{align-content:start;margin-top:calc(520px - var(--pad) - 40px)}
.layout-split .headline{font-size:var(--fs-h2)}

.layout-stacked .body{align-content:start;gap:calc(var(--u)*3)}
.layout-stacked .headline{font-size:var(--fs-h1);max-width:100%}
.layout-stacked .bed{inset:auto 0 0 0;height:430px}
.layout-stacked .scrim{display:none}

.layout-big-number .body{align-content:center;justify-items:start}
.layout-big-number .headline{font-size:var(--fs-h2);max-width:760px}
.layout-big-number .bignum{font-size:var(--fs-mega)}

.layout-portrait .bed{inset:0 0 0 auto;width:560px}
.layout-portrait .bed::after{content:"";position:absolute;inset:0;
  background:linear-gradient(to right,var(--bg) 0%,rgba(0,0,0,0) 45%)}
.layout-portrait .scrim{display:none}
/* Only the body is constrained by the portrait plate; the header and footer are
   chrome and keep the full width, so the footnote never wraps mid-date. */
.layout-portrait .body{padding-right:470px}
.layout-portrait .hdr{padding-right:470px}
.layout-portrait .headline{font-size:var(--fs-h1)}

/* accents ------------------------------------------------------------ */
.acc{position:absolute;inset:0;z-index:2;pointer-events:none}
.acc-diagonal{clip-path:polygon(0 62%,100% 40%,100% 100%,0 100%);background:var(--bg);opacity:.94}
.acc-halftone{background-image:radial-gradient(var(--accent) 1.4px,transparent 1.5px);background-size:14px 14px;opacity:.16;
              mask-image:linear-gradient(to bottom,transparent 40%,black 100%)}
.acc-grain{opacity:.10;background-image:url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='120' height='120'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='.9' numOctaves='3'/></filter><rect width='120' height='120' filter='url(%23n)'/></svg>");
            mix-blend-mode:overlay}
.acc-ticker{top:auto;height:46px;bottom:0;background:var(--accent);color:var(--on-accent);
            display:flex;align-items:center;gap:36px;padding:0 24px;overflow:hidden;white-space:nowrap;
            font-family:var(--font-mono);font-size:16px;letter-spacing:.22em;text-transform:uppercase}
.art.has-ticker .layer{padding-bottom:calc(var(--pad) + 46px)}
.acc-watermark{display:flex;align-items:flex-start;justify-content:flex-end;overflow:hidden}
.acc-watermark span{font-family:var(--font-display);font-weight:700;font-size:440px;line-height:.72;
                    color:var(--fg);opacity:.055;transform:translate(14%,-8%)}
.acc-cropmarks::before,.acc-cropmarks::after{content:"";position:absolute;width:44px;height:44px;border:2px solid var(--accent);opacity:.7}
.acc-cropmarks::before{top:22px;left:22px;border-right:0;border-bottom:0}
.acc-cropmarks::after{bottom:22px;right:22px;border-left:0;border-top:0}

/* Photos use opaque text backplates so every resolved text pair is exact.
   The scrim still treats the image; the plates protect small text and tables. */
.art:not(.no-photo) .body > *, .art:not(.no-photo) .hdr, .art:not(.no-photo) .foot {
  background:var(--bg);box-shadow:0 0 0 10px var(--bg)
}
.art:not(.no-photo).logo-bl .hdr .logo{position:absolute;bottom:110px;left:var(--pad);background:var(--bg)}
.art:not(.no-photo).logo-br .hdr .logo{position:absolute;bottom:110px;right:var(--pad);background:var(--bg)}
.art:not(.no-photo).logo-tl .hdr{flex-direction:row-reverse}
/* logo placement ----------------------------------------------------- */
.art.logo-strip .logostrip{position:absolute;z-index:4;left:0;right:0;top:0;height:74px;background:var(--bg);
  display:flex;align-items:center;justify-content:space-between;padding:0 var(--pad)}
.art.logo-strip .layer{padding-top:calc(var(--pad) + 74px)}
.art.logo-strip .hdr .logo{visibility:hidden}
`;

function rowsHtml(rows: TableRow[]): string {
  const density = rows.length >= 14 ? 'dense' : rows.length <= 5 ? 'roomy' : '';
  const body = rows.map((r) => `
      <tr${r.colour ? ` style="--row-colour:${esc(r.colour)}"` : ''}>
        <td class="rank">${esc(r.rank)}</td>
        <td class="chip"><i></i></td>
        <td class="primary">${esc(r.primary)}</td>
        <td class="secondary">${esc(r.secondary ?? '')}</td>
        <td class="value">${esc(r.value)}</td>
        <td class="trailing">${esc(r.trailing ?? '')}</td>
      </tr>`).join('');
  return `<table class="rows ${density}"><tbody>${body}</tbody></table>`;
}

export interface TemplateOptions {
  fontsCss?: string;
  /** Absolute path or data URI. The renderer resolves this before calling. */
  imageSrc?: string | null;
  /** Skip the client-side fitText pass (used by the pure unit tests). */
  noFit?: boolean;
}

/** Turns a fully-resolved CompositionSpec into one self-contained HTML document. */
export function renderArtHtml(spec: CompositionSpec, opts: TemplateOptions = {}): string {
  const { brand, archetype, model, skin, layout, accents } = spec;
  const { vars, pairs } = resolveColours(spec);
  assertContrast(pairs); // fails the render rather than shipping something unreadable

  const t = brand.tokens;
  const hasPhoto = Boolean(opts.imageSrc) && skin.imagery !== 'none';
  const logo = spec.logoPlacement ?? 'tr';
  // A visual editor's saved adjustments for this exact archetype+layout, if any.
  const override = getLayoutOverride(brand.key, archetype.key, layout);

  /**
   * Every element the editor can select is tagged and, if it has a saved
   * transform, nudged by it — translate + uniform scale from its own
   * Grid/Flex-computed position, growing from its top-left corner. Content
   * still flows and fits normally underneath: the transform is a final
   * compositing step layered on top, exactly like moving a layer on a design
   * canvas, so the guards above (fitText, contrast) still reason about the
   * real, untransformed box.
   */
  const el = (name: string, extraStyle = ''): string => {
    const tr = override.elements?.[name];
    const transform = tr && (tr.x || tr.y || (tr.scale && tr.scale !== 1))
      ? `transform:translate(${tr.x ?? 0}px,${tr.y ?? 0}px) scale(${tr.scale ?? 1});transform-origin:top left;`
      : '';
    const style = `${transform}${extraStyle}`;
    return ` data-el="${name}"${style ? ` style="${style}"` : ''}`;
  };

  const tokenVars = {
    '--fs-mega': `${t.fs.mega}px`, '--fs-hero': `${t.fs.hero}px`, '--fs-h1': `${t.fs.h1}px`,
    '--fs-h2': `${t.fs.h2}px`, '--fs-body': `${t.fs.body}px`, '--fs-lab': `${t.fs.lab}px`,
    '--fs-fine': `${t.fs.fine}px`, '--ls-lab': t.ls.lab, '--ls-disp': t.ls.disp,
    '--pad': `${override.padding ?? t.pad}px`, '--stroke': `${t.stroke}px`,
    '--u': `${override.spacingUnit ?? t.unit}px`, '--r': `${t.radius}px`,
    '--font-display': t.fonts.display, '--font-body': t.fonts.body, '--font-mono': t.fonts.mono,
    ...vars,
  };
  const rootVars = Object.entries(tokenVars).map(([k, v]) => `${k}:${v}`).join(';');
  const bodyStyle = [
    override.bodyAlign ? `align-content:${override.bodyAlign}` : '',
    override.textAlign ? `text-align:${override.textAlign}` : '',
  ].filter(Boolean).join(';');

  const logoMarkup = t.logo.svgMarkup
    ? `<div class="logo logo-svg"${el('logo')}>${t.logo.svgMarkup}</div>`
    : `<div class="logo"${el('logo')}><span class="mark">${esc(t.logo.mark)}</span> ${esc(t.logo.text)}</div>`;

  const accentMarkup = accents.map((a) => {
    if (a === 'ticker') {
      const items = [model.eyebrow, model.footnote, brand.name].filter(Boolean);
      return `<div class="acc acc-ticker">${items.map((i) => `<span>${esc(i)}</span>`).join('')}</div>`;
    }
    if (a === 'watermark') {
      const word = (model.bigNumber ?? model.eyebrow.split(' ')[0] ?? brand.tokens.logo.mark).slice(0, 3);
      return `<div class="acc acc-watermark"><span>${esc(word)}</span></div>`;
    }
    return `<div class="acc acc-${a}"></div>`;
  }).join('');

  const bodyBlocks = [
    model.bigNumber ? `<div class="bignum num"${el('bignum')}>${esc(model.bigNumber)}</div>` : '',
    model.bigLabel ? `<div class="lab biglabel"${el('biglabel')}>${esc(model.bigLabel)}</div>` : '',
    model.quote ? `<blockquote${el('quote')}>${esc(model.quote)}</blockquote>` : '',
    `<h1 class="disp headline" data-fit="${opts.noFit ? '' : '1'}" data-fit-min="${override.headlineMinPx ?? 34}" data-fit-max="${override.headlineMaxPx ?? t.fs.hero}" data-fit-lines="3"${el('headline')}>${esc(model.headline)}</h1>`,
    model.subhead ? `<p class="sub"${el('subhead')}>${esc(model.subhead)}</p>` : '',
    model.attribution ? `<p class="attrib lab"${el('attribution')}>${esc(model.attribution)}</p>` : '',
    model.rows?.length ? `<div${el('rows')}>${rowsHtml(model.rows)}</div>` : '',
  ].filter(Boolean).join('\n      ');

  const classes = [
    'art', `skin-${skin.key}`, `layout-${layout}`,
    hasPhoto ? '' : 'no-photo',
    accents.includes('ticker') ? 'has-ticker' : '',
    logo === 'strip' ? 'logo-strip' : `logo-${logo}`,
  ].filter(Boolean).join(' ');

  return `<!doctype html><html><head><meta charset="utf-8">
<style>
${opts.fontsCss ?? ''}
${BASE_CSS}
</style></head><body style="margin:0;background:#202428">
<div class="${classes}" style="${rootVars}">
  ${hasPhoto ? `<div class="bed ${skin.imagery === 'duotone' ? 'duotone' : ''}"${el('photo')}><img src="${esc(opts.imageSrc!)}" alt=""></div><div class="scrim"></div>` : ''}
  ${accentMarkup}
  ${logo === 'strip' ? `<div class="logostrip">${logoMarkup}<span class="lab">${esc(model.eyebrow)}</span></div>` : ''}
  <div class="layer">
    <header class="hdr">
      <span class="lab eyebrow"${el('eyebrow')}>${esc(model.eyebrow)}</span>
      ${logoMarkup}
    </header>
    <main class="body"${bodyStyle ? ` style="${bodyStyle}"` : ''}>
      ${bodyBlocks}
    </main>
    <footer class="foot">
      <span class="lab"${el('footnote')}>${esc(model.footnote)}</span>
      <span class="rule"></span>
    </footer>
  </div>
</div>
${opts.noFit ? '' : FIT_SCRIPT}
</body></html>`;
}

/**
 * The browser half of fitText. Binary-searches using the browser's own
 * measurement, which is the only measurement that counts, then falls back to
 * ellipsis at the floor. Runs before the screenshot is taken.
 */
const FIT_SCRIPT = `<script>
(function(){
  function fit(el){
    var min = +el.dataset.fitMin || 28, max = +el.dataset.fitMax || 120, lines = +el.dataset.fitLines || 3;
    var box = el.parentElement.getBoundingClientRect();
    var maxH = Math.max(80, box.height);
    function ok(px){
      el.style.fontSize = px + 'px';
      var lh = parseFloat(getComputedStyle(el).lineHeight) || px;
      return el.scrollHeight <= maxH && Math.round(el.scrollHeight / lh) <= lines && el.scrollWidth <= el.clientWidth + 1;
    }
    var lo = min, hi = max, best = -1;
    for (var i = 0; i < 12 && lo <= hi; i++){
      var mid = Math.floor((lo + hi) / 2);
      if (ok(mid)) { best = mid; lo = mid + 1; } else { hi = mid - 1; }
    }
    if (best < 0){
      el.style.fontSize = min + 'px';
      el.dataset.overflow = '1';
      el.style.display = '-webkit-box';
      el.style.webkitLineClamp = String(lines);
      el.style.webkitBoxOrient = 'vertical';
      el.style.overflow = 'hidden';
    } else {
      el.style.fontSize = best + 'px';
    }
    el.dataset.fitted = el.style.fontSize;
  }
  document.querySelectorAll('[data-fit="1"]').forEach(fit);
  window.__fitDone = true;
})();
</script>`;
