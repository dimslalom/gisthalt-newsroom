'use client';
import {
  COLOUR_ROLES, FONT_FAMILIES, FONT_STEPS, KIND_ICON, blankNode, flatten,
  type Colour, type FieldDef, type FontFamily, type FontSpec, type FrameNode, type LayoutNode,
  type NodeKind, type Paint, type Size, type TextNode, type TextSource,
} from './doc-model.ts';

/* ---------------------------------------------------------- layers panel */

/**
 * The layers panel. Order here is paint order: later siblings draw on top,
 * which is why reorder is a first-class control rather than a nicety.
 */
export function LayersPanel({
  root, selected, onSelect, onAdd, onRemove, onReorder, onToggleHidden,
}: {
  root: FrameNode;
  selected: string | null;
  onSelect: (id: string) => void;
  onAdd: (kind: NodeKind) => void;
  onRemove: (id: string) => void;
  onReorder: (id: string, delta: number) => void;
  onToggleHidden: (id: string) => void;
}) {
  const rows = flatten(root);
  return (
    <div className="card" style={{ display: 'grid', gap: 10, alignContent: 'start' }}>
      <div className="row" style={{ justifyContent: 'space-between' }}>
        <strong className="panel-title">Layers</strong>
        <span style={{ fontSize: 11, color: 'var(--muted)' }}>{rows.length} nodes</span>
      </div>

      <div style={{ display: 'grid', gap: 1, maxHeight: 420, overflowY: 'auto' }}>
        {rows.map(({ node, depth }) => {
          const isSel = node.id === selected;
          const isRoot = node.id === root.id;
          return (
            <div
              key={node.id}
              onClick={() => onSelect(node.id)}
              style={{
                display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer',
                padding: '5px 7px', borderRadius: 2, fontSize: 12,
                paddingLeft: 7 + depth * 13,
                background: isSel ? 'color-mix(in srgb, var(--accent) 16%, transparent)' : 'transparent',
                color: node.hidden ? 'var(--muted)' : 'var(--fg)',
                opacity: node.hidden ? 0.55 : 1,
                border: `1px solid ${isSel ? 'var(--accent)' : 'transparent'}`,
              }}
            >
              <span style={{ width: 14, textAlign: 'center', color: 'var(--muted)', fontFamily: 'ui-monospace,monospace' }}>{KIND_ICON[node.kind]}</span>
              <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{node.name}</span>
              {node.kind === 'text' && node.source.type === 'field' && (
                <span title={`bound to ${node.source.field}`} style={{ fontSize: 9, color: 'var(--accent)', letterSpacing: '.06em' }}>DATA</span>
              )}
              {!isRoot && (
                <span className="row" style={{ gap: 2, flexWrap: 'nowrap' }} onClick={(e) => e.stopPropagation()}>
                  <MiniBtn title="Move up (behind)" onClick={() => onReorder(node.id, -1)}>↑</MiniBtn>
                  <MiniBtn title="Move down (in front)" onClick={() => onReorder(node.id, 1)}>↓</MiniBtn>
                  <MiniBtn title={node.hidden ? 'Show' : 'Hide'} onClick={() => onToggleHidden(node.id)}>{node.hidden ? '○' : '●'}</MiniBtn>
                  <MiniBtn title="Delete" onClick={() => onRemove(node.id)}>✕</MiniBtn>
                </span>
              )}
            </div>
          );
        })}
      </div>

      <div style={{ borderTop: '1px solid var(--line)', paddingTop: 9 }}>
        <div style={{ fontSize: 11, color: 'var(--muted)', marginBottom: 6 }}>
          Add into {selected ? 'the selected frame' : 'the canvas'}
        </div>
        <div className="row" style={{ gap: 5 }}>
          {(['frame', 'text', 'image', 'rows', 'logo', 'shape'] as NodeKind[]).map((k) => (
            <button key={k} onClick={() => onAdd(k)} style={{ fontSize: 11, padding: '4px 8px' }}>
              {KIND_ICON[k]} {k}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

function MiniBtn({ children, onClick, title }: { children: React.ReactNode; onClick: () => void; title: string }) {
  return (
    <button
      title={title}
      aria-label={title}
      onClick={onClick}
      style={{ fontSize: 10, padding: '1px 5px', lineHeight: 1.4, minWidth: 0, background: 'transparent', borderColor: 'transparent', color: 'var(--muted)' }}
    >{children}</button>
  );
}

/* ------------------------------------------------------------- inspector */

export function Inspector({
  node, parent, fields, present, values, onChange,
}: {
  node: LayoutNode | null;
  parent: FrameNode | null;
  fields: FieldDef[];
  present: Set<string>;
  /** The previewed claim's actual text per field key. */
  values?: Record<string, string>;
  onChange: (patch: Partial<LayoutNode>) => void;
}) {
  if (!node) {
    return <div className="card"><p style={{ fontSize: 12, color: 'var(--muted)', margin: 0 }}>Select a layer or click an element on the canvas.</p></div>;
  }
  const isAbs = node.position?.mode === 'absolute';
  return (
    <div className="card" style={{ display: 'grid', gap: 12, alignContent: 'start' }}>
      <Field label="Name">
        <input value={node.name} onChange={(e) => onChange({ name: e.target.value })} />
      </Field>

      {node.kind === 'text' && <TextProps node={node} fields={fields} present={present} values={values} onChange={onChange} />}
      {node.kind === 'frame' && <FrameProps node={node} onChange={onChange} />}
      {node.kind === 'image' && <ImageProps node={node} onChange={onChange} />}
      {node.kind === 'rows' && <RowsProps node={node} onChange={onChange} />}
      {node.kind === 'logo' && (
        <Field label="Variant">
          <Select value={node.variant ?? 'auto'} options={['auto', 'svg', 'text', 'mark']} onChange={(v) => onChange({ variant: v as 'auto' })} />
        </Field>
      )}
      {node.kind === 'shape' && (
        <>
          <Field label="Shape"><Select value={node.shape} options={['rect', 'line']} onChange={(v) => onChange({ shape: v as 'rect' })} /></Field>
          <ColourField label="Colour" value={node.colour ?? { ref: 'accent' }} onChange={(v) => { if (v !== 'none') onChange({ colour: v }); }} />
        </>
      )}

      <Section title="Layout" />
      <Field label="Position">
        <Select
          value={isAbs ? 'absolute' : 'flow'}
          options={['flow', 'absolute']}
          onChange={(v) => onChange({ position: v === 'absolute' ? { mode: 'absolute', top: 0, left: 0, width: 1, height: 1 } : { mode: 'flow' } })}
        />
      </Field>
      <p style={{ fontSize: 11, color: 'var(--muted)', margin: '-6px 0 0' }}>
        {isAbs
          ? 'Free-placed: this element ignores the stack and is pinned to the canvas. Content length no longer pushes it around; which also means long text can overflow it.'
          : `Flows in its parent stack (${parent?.axis ?? 'vertical'}). Content length is absorbed by the layout, so an unseen claim still fits.`}
      </p>

      {isAbs ? (
        <AbsoluteInsets node={node} onChange={onChange} />
      ) : (
        <div className="row">
          <SizeField label="Width" size={node.width} onChange={(width) => onChange({ width })} />
          <SizeField label="Height" size={node.height} onChange={(height) => onChange({ height })} />
        </div>
      )}

      <ColourField
        label="Background plate" allowNone
        value={paintToColourValue(node.background)}
        onChange={(v) => onChange({ background: colourValueToPaint(v) })}
      />
      <PaddingField node={node} onChange={onChange} />
    </div>
  );
}

/** Insets for a free-placed node, entered as percentages of the canvas. They
 *  are stored as fractions so the same placement survives a canvas change.
 *  which is the whole reason absolute position isn't stored in pixels. */
function AbsoluteInsets({ node, onChange }: { node: LayoutNode; onChange: (p: Partial<LayoutNode>) => void }) {
  const pos = node.position?.mode === 'absolute' ? node.position : { mode: 'absolute' as const };
  const keys = ['top', 'left', 'width', 'height'] as const;
  return (
    <div className="row">
      {keys.map((k) => (
        <Field key={k} label={`${k} %`} flex>
          <input
            type="number" step={1}
            value={Math.round((pos[k] ?? 0) * 100)}
            onChange={(e) => onChange({ position: { ...pos, mode: 'absolute', [k]: Number(e.target.value) / 100 } })}
          />
        </Field>
      ))}
    </div>
  );
}

/* ---------------------------------------------------------- text + binding */

function TextProps({ node, fields, present, values, onChange }: {
  node: TextNode; fields: FieldDef[]; present: Set<string>;
  values?: Record<string, string>;
  onChange: (patch: Partial<LayoutNode>) => void;
}) {
  const src = node.source;
  const bound = src.type === 'field';
  const def = bound ? fields.find((f) => f.key === src.field) : undefined;
  const missingOnSample = bound && !present.has(src.field);

  const setSource = (s: TextSource) => onChange({ source: s } as Partial<LayoutNode>);

  return (
    <>
      <Section title="Content" />
      <div className="row" style={{ gap: 6 }}>
        <button type="button" aria-pressed={!bound}
          className={`toggle ${!bound ? 'on' : ''}`}
          // Start from the real wording on the claim being previewed, so
          // overriding one post's headline begins from its actual headline.
          onClick={() => setSource({ type: 'static', value: bound ? (values?.[src.field] ?? def?.label ?? 'Text') : '' })}
        >Static text</button>
        <button type="button" aria-pressed={bound}
          className={`toggle ${bound ? 'on' : ''}`}
          onClick={() => setSource({ type: 'field', field: 'headline' })}
        >Linked to data</button>
      </div>

      {src.type === 'static' ? (
        <Field label="Text">
          <textarea rows={2} value={src.value} onChange={(e) => setSource({ type: 'static', value: e.target.value })}
            style={{ background: 'var(--panel-2)', color: 'var(--fg)', border: '1px solid var(--line)', borderRadius: 'var(--radius-control)', padding: '6px 8px', fontFamily: 'inherit', fontSize: 13, resize: 'vertical' }} />
        </Field>
      ) : (
        <>
          <Field label="Data field">
            <select value={src.field} onChange={(e) => setSource({ ...src, field: e.target.value })}>
              {(['Content', 'Context', 'Brand'] as const).map((g) => {
                const opts = fields.filter((f) => f.group === g && f.type === 'text');
                if (!opts.length) return null;
                return (
                  <optgroup key={g} label={g}>
                    {opts.map((f) => (
                      <option key={f.key} value={f.key}>
                        {f.label}{f.optional ? ' (optional)' : ''}{present.has(f.key) ? '' : '; empty on this sample'}
                      </option>
                    ))}
                  </optgroup>
                );
              })}
            </select>
          </Field>
          {def?.hint && <p style={{ fontSize: 11, color: 'var(--muted)', margin: '-6px 0 0' }}>{def.hint}</p>}
          {missingOnSample && (
            <p style={{ fontSize: 11, color: 'var(--warn)', margin: '-4px 0 0' }}>
              This field is empty on the sample being previewed, so the element disappears and the stack closes the gap.
              Set a fallback below if this slot needs to hold its place.
            </p>
          )}
          <Field label="Fallback when empty (optional)">
            <input value={src.fallback ?? ''} placeholder="leave blank to hide the element"
              onChange={(e) => setSource({ ...src, fallback: e.target.value || undefined })} />
          </Field>
          <FormatEditor source={src} onChange={setSource} />
        </>
      )}

      <Section title="Type" />
      <div className="row">
        <FontField value={node.font} onChange={(v) => onChange({ font: v })} />
        <Field label="Size step" flex><Select value={node.step ?? 'body'} options={FONT_STEPS} onChange={(v) => onChange({ step: v as 'body' })} /></Field>
        <Field label="Weight" flex>
          <input type="number" step={100} min={100} max={900} value={node.weight ?? 400} onChange={(e) => onChange({ weight: Number(e.target.value) })} />
        </Field>
      </div>
      {node.step === 'fit' ? (
        <>
          <p style={{ fontSize: 11, color: 'var(--muted)', margin: 0 }}>
            Fit re-measures this text in the real browser at render time and picks the largest size that stays inside these bounds.
            This is the setting that keeps a headline nobody has read yet from overflowing.
          </p>
          <div className="row">
            <Field label="Min px" flex><input type="number" value={node.fit?.minPx ?? 34} onChange={(e) => onChange({ fit: { ...(node.fit ?? { minPx: 34, maxPx: 118, lines: 3 }), minPx: Number(e.target.value) } })} /></Field>
            <Field label="Max px" flex><input type="number" value={node.fit?.maxPx ?? 118} onChange={(e) => onChange({ fit: { ...(node.fit ?? { minPx: 34, maxPx: 118, lines: 3 }), maxPx: Number(e.target.value) } })} /></Field>
            <Field label="Max lines" flex><input type="number" value={node.fit?.lines ?? 3} onChange={(e) => onChange({ fit: { ...(node.fit ?? { minPx: 34, maxPx: 118, lines: 3 }), lines: Number(e.target.value) } })} /></Field>
          </div>
        </>
      ) : (
        <Field label="Max lines (blank = unlimited)">
          <input type="number" value={node.maxLines ?? ''} onChange={(e) => onChange({ maxLines: e.target.value ? Number(e.target.value) : undefined })} />
        </Field>
      )}
      <div className="row">
        <ColourField label="Colour" value={node.colour ?? { ref: 'fg' }} onChange={(v) => { if (v !== 'none') onChange({ colour: v }); }} />
        <Field label="Align" flex><Select value={node.align ?? 'left'} options={['left', 'center', 'right']} onChange={(v) => onChange({ align: v as 'left' })} /></Field>
        <Field label="Case" flex><Select value={node.transform ?? 'none'} options={['none', 'uppercase', 'lowercase']} onChange={(v) => onChange({ transform: v as 'none' })} /></Field>
      </div>
    </>
  );
}

function FormatEditor({ source, onChange }: { source: Extract<TextSource, { type: 'field' }>; onChange: (s: TextSource) => void }) {
  const fmts = source.format ?? [];
  const set = (next: typeof fmts) => onChange({ ...source, format: next.length ? next : undefined });
  return (
    <Field label="Formatting (applied in order)">
      <div style={{ display: 'grid', gap: 5 }}>
        {fmts.map((f, i) => (
          <div key={i} className="row" style={{ gap: 5, flexWrap: 'nowrap' }}>
            <select value={f.key} onChange={(e) => set(fmts.map((x, j) => (j === i ? { key: e.target.value as 'upper' } : x)))} style={{ flex: 1 }}>
              {['upper', 'lower', 'truncate', 'prefix', 'suffix'].map((k) => <option key={k} value={k}>{k}</option>)}
            </select>
            {(f.key === 'truncate' || f.key === 'prefix' || f.key === 'suffix') && (
              <input
                style={{ width: 90 }}
                value={String(f.arg ?? (f.key === 'truncate' ? 60 : ''))}
                onChange={(e) => set(fmts.map((x, j) => (j === i ? { ...x, arg: f.key === 'truncate' ? Number(e.target.value) || 0 : e.target.value } : x)))}
              />
            )}
            <button onClick={() => set(fmts.filter((_, j) => j !== i))} style={{ padding: '3px 7px', fontSize: 11 }}>✕</button>
          </div>
        ))}
        <button onClick={() => set([...fmts, { key: 'upper' }])} style={{ fontSize: 11, padding: '3px 8px', justifySelf: 'start' }}>+ add format</button>
      </div>
    </Field>
  );
}

/* ------------------------------------------------------- other node props */

function FrameProps({ node, onChange }: { node: FrameNode; onChange: (p: Partial<LayoutNode>) => void }) {
  return (
    <>
      <Section title="Stack" />
      <div className="row">
        <Field label="Direction" flex><Select value={node.axis} options={['vertical', 'horizontal']} onChange={(v) => onChange({ axis: v as 'vertical' })} /></Field>
        <Field label="Gap (units)" flex><input type="number" step={0.5} value={node.gap ?? 0} onChange={(e) => onChange({ gap: Number(e.target.value) })} /></Field>
      </div>
      <div className="row">
        <Field label="Distribute" flex><Select value={node.justify ?? 'start'} options={['start', 'center', 'end', 'between']} onChange={(v) => onChange({ justify: v as 'start' })} /></Field>
        <Field label="Align" flex><Select value={node.align ?? 'stretch'} options={['stretch', 'start', 'center', 'end']} onChange={(v) => onChange({ align: v as 'stretch' })} /></Field>
      </div>
      <p style={{ fontSize: 11, color: 'var(--muted)', margin: 0 }}>
        Distribute runs along the {node.axis === 'horizontal' ? 'horizontal' : 'vertical'} axis; Align runs across it.
      </p>
    </>
  );
}

function ImageProps({ node, onChange }: { node: import('./doc-model.ts').ImageNode; onChange: (p: Partial<LayoutNode>) => void }) {
  return (
    <>
      <Section title="Photo" />
      <p style={{ fontSize: 11, color: 'var(--muted)', margin: 0 }}>
        Always the claim&apos;s own image. There is no upload; an unattended pipeline must not depend on an asset a human forgot to add.
      </p>
      <div className="row">
        <Field label="Fit" flex><Select value={node.fit ?? 'cover'} options={['cover', 'contain']} onChange={(v) => onChange({ fit: v as 'cover' })} /></Field>
        <Field label="Treatment" flex><Select value={node.treatment ?? 'none'} options={['none', 'duotone', 'grayscale']} onChange={(v) => onChange({ treatment: v as 'none' })} /></Field>
      </div>
      <div className="row">
        <Field label="Focal X %" flex><input type="number" value={Math.round((node.focal?.x ?? 0.5) * 100)} onChange={(e) => onChange({ focal: { x: Number(e.target.value) / 100, y: node.focal?.y ?? 0.35 } })} /></Field>
        <Field label="Focal Y %" flex><input type="number" value={Math.round((node.focal?.y ?? 0.35) * 100)} onChange={(e) => onChange({ focal: { x: node.focal?.x ?? 0.5, y: Number(e.target.value) / 100 } })} /></Field>
      </div>
      <label className="row" style={{ fontSize: 12, gap: 6 }}>
        <input type="checkbox" checked={node.scrim !== false} onChange={(e) => onChange({ scrim: e.target.checked })} />
        Darkening scrim (keeps text legible over a busy photo)
      </label>
    </>
  );
}

function RowsProps({ node, onChange }: { node: import('./doc-model.ts').RowsNode; onChange: (p: Partial<LayoutNode>) => void }) {
  const all = ['rank', 'chip', 'primary', 'secondary', 'value', 'trailing'] as const;
  const cols = node.columns ?? [...all];
  return (
    <>
      <Section title="Table" />
      <Field label="Density"><Select value={node.density ?? 'auto'} options={['auto', 'dense', 'roomy']} onChange={(v) => onChange({ density: v as 'auto' })} /></Field>
      <Field label="Columns">
        <div className="row" style={{ gap: 5 }}>
          {all.map((c) => (
            <button type="button" aria-pressed={cols.includes(c)} key={c} className={`toggle ${cols.includes(c) ? 'on' : ''}`}
              onClick={() => onChange({ columns: cols.includes(c) ? cols.filter((x) => x !== c) : [...all].filter((x) => cols.includes(x) || x === c) })}>
              {c}
            </button>
          ))}
        </div>
      </Field>
    </>
  );
}

/* ------------------------------------------------------------- colour + font */

const isHexColour = (c: Colour | 'none' | undefined): c is { hex: string; alpha?: number } =>
  !!c && c !== 'none' && 'hex' in c;

/** background/fill only ever round-trips a flat colour here; a document that
 *  already carries a gradient plate keeps it (nothing here can produce one),
 *  this just gives the first stop as the editable colour. */
function paintToColourValue(p: Paint | undefined): Colour | 'none' {
  if (!p || p.type === 'none') return 'none';
  if (p.type === 'solid') return p.colour;
  return p.stops[0]?.colour ?? { ref: 'accent' };
}
function colourValueToPaint(v: Colour | 'none'): Paint {
  return v === 'none' ? { type: 'none' } : { type: 'solid', colour: v };
}

/** Token-or-literal colour picker: the same open model paint.ts resolves —
 *  a brand token role, or a hex the designer picked, coexisting the same way
 *  a document's own colour declarations already do. */
function ColourField({ label, value, onChange, allowNone }: {
  label: string; value: (Colour | 'none') | undefined; onChange: (v: Colour | 'none') => void; allowNone?: boolean;
}) {
  const isNone = value === 'none';
  const custom = isHexColour(value);
  const ref = !isNone && !custom && value ? (value as { ref: string }).ref : 'fg';
  const hex = custom ? value.hex : '#ffffff';
  const mode: 'none' | 'token' | 'custom' = isNone ? 'none' : custom ? 'custom' : 'token';

  return (
    <Field label={label} flex>
      <div style={{ display: 'grid', gap: 4 }}>
        <div className="row" style={{ gap: 4, flexWrap: 'nowrap' }}>
          {allowNone && (
            <button type="button" aria-pressed={mode === 'none'} className={`toggle ${mode === 'none' ? 'on' : ''}`}
              onClick={() => onChange('none')} style={{ fontSize: 10, padding: '2px 6px' }}>None</button>
          )}
          <button type="button" aria-pressed={mode === 'token'} className={`toggle ${mode === 'token' ? 'on' : ''}`}
            onClick={() => onChange({ ref })} style={{ fontSize: 10, padding: '2px 6px' }}>Token</button>
          <button type="button" aria-pressed={mode === 'custom'} className={`toggle ${mode === 'custom' ? 'on' : ''}`}
            onClick={() => onChange({ hex })} style={{ fontSize: 10, padding: '2px 6px' }}>Custom</button>
        </div>
        {mode === 'token' && <Select value={ref} options={COLOUR_ROLES} onChange={(v) => onChange({ ref: v })} />}
        {mode === 'custom' && (
          <div className="row" style={{ gap: 4, flexWrap: 'nowrap' }}>
            <input type="color" value={/^#[0-9a-f]{6}$/i.test(hex) ? hex : '#ffffff'}
              onChange={(e) => onChange({ hex: e.target.value, alpha: isHexColour(value) ? value.alpha : undefined })}
              style={{ width: 30, height: 27, padding: 1, border: '1px solid var(--line)', background: 'none' }} />
            <input value={hex} placeholder="#rrggbb"
              onChange={(e) => onChange({ hex: e.target.value, alpha: isHexColour(value) ? value.alpha : undefined })}
              style={{ flex: 1 }} />
          </div>
        )}
      </div>
    </Field>
  );
}

/** Brand-token-or-custom font family, mirroring ColourField's split. A custom
 *  family is raw CSS: it only actually renders if that font is already loaded
 *  (the brand's own @font-face, or a system font baked into the render
 *  container); typing an arbitrary Google Font name here won't fetch it. */
function FontField({ value, onChange }: { value: FontSpec | undefined; onChange: (v: FontSpec) => void }) {
  const custom = !!value && 'family' in value;
  const token = !custom ? (value as { token: FontFamily } | undefined)?.token ?? 'body' : 'body';
  const family = custom ? value.family : '';
  const mode: 'token' | 'custom' = custom ? 'custom' : 'token';

  return (
    <Field label="Font" flex>
      <div style={{ display: 'grid', gap: 4 }}>
        <div className="row" style={{ gap: 4, flexWrap: 'nowrap' }}>
          <button type="button" aria-pressed={mode === 'token'} className={`toggle ${mode === 'token' ? 'on' : ''}`}
            onClick={() => onChange({ token })} style={{ fontSize: 10, padding: '2px 6px' }}>Brand</button>
          <button type="button" aria-pressed={mode === 'custom'} className={`toggle ${mode === 'custom' ? 'on' : ''}`}
            onClick={() => onChange({ family: family || 'Georgia, serif' })} style={{ fontSize: 10, padding: '2px 6px' }}>Custom</button>
        </div>
        {mode === 'token'
          ? <Select value={token} options={FONT_FAMILIES} onChange={(v) => onChange({ token: v as FontFamily })} />
          : <input value={family} placeholder="e.g. Georgia, serif" onChange={(e) => onChange({ family: e.target.value })} />}
      </div>
    </Field>
  );
}

/* --------------------------------------------------------------- controls */

function SizeField({ label, size, onChange }: { label: string; size: Size | undefined; onChange: (s: Size | undefined) => void }) {
  const mode = size?.mode ?? 'auto';
  return (
    <Field label={label} flex>
      <div className="row" style={{ gap: 4, flexWrap: 'nowrap' }}>
        <select value={mode} onChange={(e) => {
          const v = e.target.value;
          onChange(v === 'auto' ? undefined : v === 'fixed' ? { mode: 'fixed', px: size?.px ?? 200 } : { mode: v as 'hug' });
        }} style={{ flex: 1 }}>
          <option value="auto">auto</option>
          <option value="hug">hug</option>
          <option value="fill">fill</option>
          <option value="fixed">fixed</option>
        </select>
        {mode === 'fixed' && (
          <input type="number" style={{ width: 72 }} value={size?.px ?? 200} onChange={(e) => onChange({ mode: 'fixed', px: Number(e.target.value) })} />
        )}
      </div>
    </Field>
  );
}

function PaddingField({ node, onChange }: { node: LayoutNode; onChange: (p: Partial<LayoutNode>) => void }) {
  const p = node.padding ?? {};
  return (
    <Field label="Padding (units: top / right / bottom / left)">
      <div className="row" style={{ gap: 4, flexWrap: 'nowrap' }}>
        {(['top', 'right', 'bottom', 'left'] as const).map((k) => (
          <input key={k} type="number" step={0.5} style={{ width: 58 }} value={p[k] ?? 0}
            onChange={(e) => onChange({ padding: { ...p, [k]: Number(e.target.value) } })} />
        ))}
      </div>
    </Field>
  );
}

function Field({ label, children, flex }: { label: string; children: React.ReactNode; flex?: boolean }) {
  return (
    <label className="field" style={flex ? { flex: 1, minWidth: 90 } : undefined}>
      {label}
      {children}
    </label>
  );
}

function Select({ value, options, onChange }: { value: string; options: readonly string[]; onChange: (v: string) => void }) {
  return (
    <select value={value} onChange={(e) => onChange(e.target.value)}>
      {options.map((o) => <option key={o} value={o}>{o}</option>)}
    </select>
  );
}

function Section({ title }: { title: string }) {
  return (
    <div style={{ borderTop: '1px solid var(--line)', paddingTop: 9, fontSize: 14, color: 'var(--fg)' }}>
      {title}
    </div>
  );
}
