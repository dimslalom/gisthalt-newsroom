'use client';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useWidth } from '../use-width';
import { LayersPanel, Inspector } from './panels.tsx';
import { ThemePanel } from './theme-panel.tsx';
import { CertifyButton } from './certify-button.tsx';
import { ReferencePreview } from './reference-preview.tsx';
import {
  blankNode, findNode, findParent, flatten, insertNode, removeNode, reorderNode, updateNode,
  type CanvasDef, type FieldDef, type FrameNode, type LayoutDoc, type LayoutNode, type NodeKind,
} from './doc-model.ts';

interface ElementRect { name: string; kind?: string; x: number; y: number; width: number; height: number }
interface ContrastFinding {
  nodeId: string; nodeName: string; fg: string; bg: string;
  ratio: number; required: number; pass: boolean; backdrop: 'canvas' | 'frame' | 'photo' | 'unknown';
}
interface Catalog {
  brands: { key: string; name: string }[];
  fixtures: string[];
  skins: string[];
  archetypes: { key: string; layouts: string[]; claimTypes: string[] }[];
}
interface RenderResponse {
  url?: string; error?: string; elements?: ElementRect[]; present?: string[];
  width?: number; height?: number;
  guards?: { headlineOverflowed: boolean; fittedPx: string | null; fontsPinned: boolean };
  contrast?: ContrastFinding[];
  /** The previewed claim's actual text per field key. */
  fieldValues?: Record<string, string>;
}

const CANVAS_FALLBACK: CanvasDef[] = [
  { key: 'portrait-4x5', label: 'Feed 4:5', width: 1080, height: 1350 },
  { key: 'square', label: 'Feed 1:1', width: 1080, height: 1080 },
  { key: 'story', label: 'Story 9:16', width: 1080, height: 1920 },
];

/** A real post opened for design; see /api/post-design. */
interface PostMeta {
  compositionId: string; claim: unknown; imagePath: string | null; skin: string | null;
  headline: string; captions: Record<string, string>; customised: boolean; carousel: boolean;
  accents: string[];
}

export function DesignStudio({ catalog, initial, postId }: {
  catalog: Catalog;
  initial?: { brand: string; archetype: string; layout: string };
  /** Edit one post's own design with its real claim, instead of a layout template. */
  postId?: string;
}) {
  const [post, setPost] = useState<PostMeta | null>(null);
  const [brand, setBrand] = useState(initial?.brand ?? catalog.brands[0]?.key ?? 'f1');
  const [archetype, setArchetype] = useState(initial?.archetype ?? catalog.archetypes[0]?.key ?? '');
  const [layout, setLayout] = useState(initial?.layout ?? catalog.archetypes[0]?.layouts[0] ?? 'hero-left');
  const [fixture, setFixture] = useState(catalog.fixtures[0] ?? 'classification-basic');
  const [skin, setSkin] = useState(catalog.skins[0] ?? 'dark');
  const [canvasKey, setCanvasKey] = useState('portrait-4x5');
  const [canvases, setCanvases] = useState<CanvasDef[]>(CANVAS_FALLBACK);
  const [themeOpen, setThemeOpen] = useState(false);

  const [doc, setDoc] = useState<LayoutDoc | null>(null);
  const [fields, setFields] = useState<FieldDef[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [preview, setPreview] = useState<RenderResponse | null>(null);
  const [busy, setBusy] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [undoStack, setUndoStack] = useState<FrameNode[]>([]);

  const layouts = catalog.archetypes.find((a) => a.key === archetype)?.layouts ?? [];
  const canvas = canvases.find((c) => c.key === canvasKey) ?? CANVAS_FALLBACK[0]!;
  const present = useMemo(() => new Set(preview?.present ?? []), [preview]);

  /* ------------------------------------------------------------ load doc */

  const loadDoc = useCallback(async () => {
    try {
    if (postId) {
      const res = await fetch(`/api/post-design?compositionId=${postId}`, { cache: 'no-store' });
      const data = await res.json() as PostMeta & { doc: LayoutDoc | null; fields?: FieldDef[]; canvases?: CanvasDef[]; error?: string };
      if (data.error) { setStatus(`Could not load this post: ${data.error}`); return; }
      setPost({
        compositionId: data.compositionId, claim: data.claim, imagePath: data.imagePath, skin: data.skin,
        headline: data.headline, captions: data.captions, customised: data.customised, carousel: data.carousel,
        accents: data.accents,
      });
      setDoc(data.doc);
      if (data.fields) setFields(data.fields);
      if (data.canvases?.length) setCanvases(data.canvases);
      if (data.doc) setCanvasKey(data.doc.canvas);
    } else {
      const res = await fetch(`/api/layout-doc?brand=${brand}&archetype=${archetype}&layout=${layout}`, { cache: 'no-store' });
      const data = await res.json() as { doc: LayoutDoc | null; fields?: FieldDef[]; canvases?: CanvasDef[] };
      setDoc(data.doc);
      if (data.fields) setFields(data.fields);
      if (data.canvases?.length) setCanvases(data.canvases);
      if (data.doc) setCanvasKey(data.doc.canvas);
    }
    setSelected(null);
    setDirty(false);
    setUndoStack([]);
    } catch (e) { setStatus(`Could not load design: ${(e as Error).message}`); }
  }, [postId, brand, archetype, layout]);

  useEffect(() => { void loadDoc(); }, [loadDoc]);

  /* -------------------------------------------------------------- render */

  // The preview always goes through the renderer container, and always sends
  // the in-memory document; so what's on screen is the unsaved edit, drawn by
  // the exact code path that will draw production PNGs. A post previews with
  // its own claim and photo; a layout previews with a sample fixture.
  const renderNow = useCallback(async (d: LayoutDoc | null) => {
    if (postId && !post) return;
    setBusy(true);
    try {
      const subject = post
        ? { claim: post.claim, imagePath: post.imagePath, skin: post.skin ?? undefined, accents: post.accents }
        : { fixture, skin };
      const res = await fetch('/api/render', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ brand, archetype, layout, ...subject, canvas: canvasKey, doc: d ?? undefined }),
      });
      setPreview(await res.json() as RenderResponse);
    } catch (e) {
      setPreview({ error: (e as Error).message });
    } finally { setBusy(false); }
  }, [postId, post, brand, archetype, layout, fixture, skin, canvasKey]);

  // Debounced: typing in a text field shouldn't fire a browser render per keystroke.
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => { void renderNow(doc); }, 350);
    return () => { if (timer.current) clearTimeout(timer.current); };
  }, [doc, renderNow]);

  /* ---------------------------------------------------------- doc edits */

  const mutate = useCallback((fn: (root: FrameNode) => FrameNode) => {
    setDoc((d) => {
      if (!d) return d;
      setUndoStack((s) => [...s.slice(-24), d.root]);
      setDirty(true);
      return { ...d, root: fn(d.root) };
    });
  }, []);

  const undo = () => {
    setUndoStack((s) => {
      if (!s.length) return s;
      const prev = s[s.length - 1]!;
      setDoc((d) => (d ? { ...d, root: prev } : d));
      setDirty(true);
      return s.slice(0, -1);
    });
  };

  const selectedNode = doc && selected ? findNode(doc.root, selected) : null;
  const selectedParent = doc && selected ? findParent(doc.root, selected) : null;

  const addNode = (kind: NodeKind) => {
    if (!doc) return;
    // Drop into the selected frame, or the selected node's parent, or the root.
    const target = selectedNode?.kind === 'frame' ? selectedNode : selectedParent ?? doc.root;
    const node = blankNode(kind);
    mutate((root) => insertNode(root, target.id, node));
    setSelected(node.id);
  };

  /* ----------------------------------------------------------- persistence */

  async function save() {
    if (!doc) return;
    setBusy(true);
    try {
    if (post) {
      const res = await fetch('/api/post-design', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ compositionId: post.compositionId, doc: { ...doc, canvas: canvasKey } }),
      });
      const data = await res.json() as { error?: string };
      setBusy(false);
      if (data.error) { setStatus(`Save failed: ${data.error}`); return; }
      setPost({ ...post, customised: true });
      setDirty(false);
      setStatus('Saved to this post only. Its image is re-rendered and ready to export.');
      return;
    }
    const res = await fetch('/api/layout-doc', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ brand, archetype, layout, doc: { ...doc, canvas: canvasKey } }),
    });
    const data = await res.json() as { doc?: LayoutDoc; error?: string };
    setBusy(false);
    if (data.error) { setStatus(`Save failed: ${data.error}`); return; }
    if (data.doc) setDoc(data.doc);
    setDirty(false);
    setStatus('Saved to brands/' + brand + '/layouts.json');
    } catch (e) { setStatus(`Save failed: ${(e as Error).message}`); }
    finally { setBusy(false); }
  }

  async function seed() {
    setBusy(true);
    const res = await fetch('/api/layout-doc?op=seed', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ brand, archetype, layout }),
    });
    const data = await res.json() as { doc?: LayoutDoc };
    setBusy(false);
    if (data.doc) { setDoc(data.doc); setCanvasKey(data.doc.canvas); setDirty(false); setUndoStack([]); setStatus('Forked the built-in layout into an editable document.'); }
  }

  async function discard() {
    try {
    if (post) {
      if (!confirm('Reset this post to its layout design? Your edits to this post are removed.')) return;
      setBusy(true);
      const res = await fetch('/api/post-design?op=reset', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ compositionId: post.compositionId }),
      });
      const data = await res.json() as { error?: string };
      setBusy(false);
      if (data.error) { setStatus(`Reset failed: ${data.error}`); return; }
      setStatus('Reset to the layout design. The post image is re-rendered.');
      void loadDoc();
      return;
    }
    if (!confirm(`Delete the document for ${archetype}/${layout}? This layout goes back to the built-in CSS template.`)) return;
    setBusy(true);
    await fetch('/api/layout-doc?op=delete', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ brand, archetype, layout }),
    });
    setBusy(false);
    setStatus('Document deleted; this layout uses the built-in template again.');
    void loadDoc();
    } catch (e) { setStatus(`Reset failed: ${(e as Error).message}`); }
    finally { setBusy(false); }
  }

  /* ------------------------------------------------------------------ UI */

  if (postId && !doc) {
    return <p style={{ fontSize: 12, color: status ? 'var(--bad)' : 'var(--muted)' }}>{status ?? 'Loading post…'}</p>;
  }

  return (
    <div style={{ display: 'grid', gap: 14 }}>
      {post ? (
        <PostPanel post={post} archetype={archetype} layout={layout} dirty={dirty}
          canvases={canvases} canvasKey={canvasKey} onCanvas={(key) => { setCanvasKey(key); setDirty(true); }} />
      ) : (
      <>
      <ReferencePreview brand={brand} archetype={archetype} layout={layout} />
      <div className="card">
        <div className="row">
          <label className="field">Brand
            <select value={brand} onChange={(e) => setBrand(e.target.value)}>
              {catalog.brands.map((b) => <option key={b.key} value={b.key}>{b.name}</option>)}
            </select>
          </label>
          <label className="field">Archetype
            <select value={archetype} onChange={(e) => { setArchetype(e.target.value); const a = catalog.archetypes.find((x) => x.key === e.target.value); if (a) setLayout(a.layouts[0]!); }}>
              {catalog.archetypes.map((a) => <option key={a.key} value={a.key}>{a.key}</option>)}
            </select>
          </label>
          <label className="field">Layout
            <select value={layout} onChange={(e) => setLayout(e.target.value)}>
              {layouts.map((l) => <option key={l} value={l}>{l}</option>)}
            </select>
          </label>
          <label className="field">Sample claim
            <select value={fixture} onChange={(e) => setFixture(e.target.value)}>
              {catalog.fixtures.map((f) => <option key={f} value={f}>{f}</option>)}
            </select>
          </label>
          <label className="field">Skin
            <select value={skin} onChange={(e) => setSkin(e.target.value)}>
              {catalog.skins.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          </label>
          <label className="field">Canvas
            <select value={canvasKey} onChange={(e) => { setCanvasKey(e.target.value); setDirty(true); }} disabled={!doc}>
              {canvases.map((c) => <option key={c.key} value={c.key}>{c.label}</option>)}
            </select>
          </label>
          <button type="button" onClick={() => setThemeOpen((v) => !v)} style={{ alignSelf: 'end', fontSize: 12 }}>
            {themeOpen ? 'Hide' : 'Edit'} brand palette &amp; fonts
          </button>
          <div style={{ alignSelf: 'end' }}>
            <CertifyButton layout={`${brand}/${archetype}/${layout}`} label="Certify this layout" />
          </div>
        </div>
        {themeOpen && (
          <div style={{ borderTop: '1px solid var(--line)', marginTop: 12, paddingTop: 12 }}>
            <ThemePanel brand={brand} skin={skin} onChanged={() => void renderNow(doc)} />
          </div>
        )}
      </div>
      </>
      )}

      {!doc ? (
        <div className="empty" style={{ display: 'grid', gap: 12, justifyItems: 'start' }}>
          <p style={{ margin: 0, maxWidth: '60ch' }}>
            <span className="metadata"><span>{archetype}</span><span>{layout}</span></span>
            This layout uses a built-in template. Create an editable copy to arrange layers and change their properties.
          </p>
          <button className="primary" onClick={seed} disabled={busy}>Create editable copy</button>
        </div>
      ) : (
        <div className="studio-workspace">
          <LayersPanel
            root={doc.root}
            selected={selected}
            onSelect={setSelected}
            onAdd={addNode}
            onRemove={(id) => { mutate((r) => removeNode(r, id)); if (selected === id) setSelected(null); }}
            onReorder={(id, d) => mutate((r) => reorderNode(r, id, d))}
            onToggleHidden={(id) => {
              const n = findNode(doc.root, id);
              mutate((r) => updateNode(r, id, { hidden: !n?.hidden }));
            }}
          />

          <div className="studio-viewer">
            <div className="row" style={{ justifyContent: 'space-between' }}>
              <div className="row" style={{ gap: 7 }}>
                <button className="primary" onClick={save} disabled={busy || !dirty || Boolean(post?.carousel)}>{dirty ? 'Save' : 'Saved'}</button>
                <button onClick={undo} disabled={!undoStack.length}>Undo</button>
                <button onClick={() => void loadDoc()} disabled={!dirty}>Revert</button>
                {post
                  ? <button className="danger" onClick={discard} disabled={busy || !post.customised}>Reset to layout design</button>
                  : <button className="danger" onClick={discard}>Delete document</button>}
              </div>
              <span style={{ fontSize: 11, color: busy ? 'var(--accent)' : 'var(--muted)' }}>
                {busy ? 'rendering…' : `${canvas.width}×${canvas.height}`}
              </span>
            </div>

            <Canvas
              preview={preview}
              canvas={canvas}
              doc={doc}
              selected={selected}
              onSelect={setSelected}
              onMoveAbsolute={(id, pos) => mutate((r) => updateNode(r, id, { position: pos }))}
            />

            {preview?.error && <p style={{ color: 'var(--bad)', fontSize: 12, margin: 0 }}>{preview.error}</p>}
            {preview?.guards && (
              <div className="row" style={{ fontSize: 11, color: 'var(--muted)', gap: 14 }}>
                <span>fitted: {preview.guards.fittedPx ?? 'Not measured'}</span>
                <span style={{ color: preview.guards.headlineOverflowed ? 'var(--warn)' : undefined }}>
                  overflow: {preview.guards.headlineOverflowed ? 'clamped' : 'none'}
                </span>
                <span>fonts pinned: {preview.guards.fontsPinned ? 'yes' : 'no'}</span>
              </div>
            )}
            <ContrastWarnings findings={preview?.contrast} onSelect={setSelected} />
            {status && <p style={{ fontSize: 12, color: status.startsWith('Save failed') ? 'var(--bad)' : 'var(--muted)', margin: 0 }}>{status}</p>}
          </div>

          <Inspector
            node={selectedNode}
            parent={selectedParent}
            fields={fields}
            present={present}
            values={preview?.fieldValues}
            onChange={(patch) => { if (selected) mutate((r) => updateNode(r, selected, patch)); }}
          />
        </div>
      )}
    </div>
  );
}

/* -------------------------------------------------------------- post mode */

const PLATFORM_LABEL: Record<string, string> = { x: 'X', instagram: 'Instagram', threads: 'Threads', tiktok: 'TikTok' };

/**
 * What this post is, and everything needed to post it by hand. Downloads read
 * the post's saved render, so they're held back while there are unsaved
 * edits; otherwise the file you post would silently be the previous design.
 */
function PostPanel({ post, archetype, layout, dirty, canvases, canvasKey, onCanvas }: {
  post: PostMeta; archetype: string; layout: string; dirty: boolean;
  canvases: CanvasDef[]; canvasKey: string; onCanvas: (key: string) => void;
}) {
  const [copied, setCopied] = useState<string | null>(null);
  const [captionStatus, setCaptionStatus] = useState<string | null>(null);
  const exportHref = (format: 'feed' | 'vertical') => `/api/post-export?compositionId=${post.compositionId}&format=${format}`;

  async function saveCaption(platform: string, caption: string) {
    try {
      const res = await fetch('/api/post-design', {
        method: 'PATCH', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ compositionId: post.compositionId, platform, caption }),
      });
      const data = await res.json() as { error?: string };
      if (!res.ok) throw new Error(data.error ?? 'Caption save failed');
      setCaptionStatus(`${PLATFORM_LABEL[platform] ?? platform} caption saved.`);
    } catch (e) { setCaptionStatus(`Caption save failed: ${(e as Error).message}`); }
  }

  return (
    <div className="card" style={{ display: 'grid', gap: 12 }}>
      <div className="row" style={{ justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div style={{ display: 'grid', gap: 4, maxWidth: '70ch' }}>
          <strong className="panel-title" style={{ fontSize: 16 }}>{post.headline}</strong>
          <span className="metadata">
            <span>{archetype}</span><span>{layout}</span>
            <span>{post.customised ? 'Custom design for this post' : 'Using the layout design'}</span>
          </span>
        </div>
        <label className="field">Canvas
          <select value={canvasKey} onChange={(e) => onCanvas(e.target.value)}>
            {canvases.map((c) => <option key={c.key} value={c.key}>{c.label}</option>)}
          </select>
        </label>
      </div>

      {post.carousel && (
        <p style={{ fontSize: 12, color: 'var(--warn)', margin: 0 }}>
          This is a carousel. Slides can&apos;t be edited one at a time here yet, so download them from Review.
        </p>
      )}

      <div className="row" style={{ gap: 8 }}>
        {dirty
          ? <span style={{ fontSize: 12, color: 'var(--warn)' }}>Save changes before downloading.</span>
          : <>
              <a className="button-link" href={exportHref('feed')} download>Download saved artwork ({canvases.find((c) => c.key === canvasKey)?.label ?? canvasKey})</a>
              <a className="button-link" href={exportHref('vertical')} download>Download 9:16 (TikTok)</a>
            </>}
      </div>

      <div className="caption-grid">
        {Object.entries(post.captions).map(([platform, caption]) => (
          <label className="field" key={platform}>
            <span className="metadata"><span>{PLATFORM_LABEL[platform] ?? platform}</span></span>
            <textarea defaultValue={caption} rows={4} onBlur={(e) => void saveCaption(platform, e.target.value)} />
            <button type="button" style={{ justifySelf: 'start', fontSize: 11, padding: '3px 8px' }}
              onClick={(e) => {
                const text = e.currentTarget.parentElement?.querySelector('textarea')?.value ?? caption;
                void navigator.clipboard.writeText(text);
                setCopied(platform);
              }}>{copied === platform ? 'Copied' : `Copy ${PLATFORM_LABEL[platform] ?? platform} caption`}</button>
          </label>
        ))}
      </div>
      {captionStatus && <p role="status" style={{ fontSize: 12, margin: 0 }}>{captionStatus}</p>}
    </div>
  );
}

/* ------------------------------------------------------------------ canvas */

/** The preview is scaled to fit both ways, not just by width; a 9:16 story is
 *  1920 tall and would otherwise run off the pane and take the layers panel's
 *  scroll position with it. */
const MAX_W = 520;
const MAX_H = 660;

/**
 * The design surface. Boxes come from the renderer's own post-layout
 * measurement of every node, so what you click is where the element actually
 * landed; not where the editor guessed it would.
 *
 * Dragging moves free-placed elements only. That's not a limitation to work
 * around, it's the model: a flowed element's position is a consequence of the
 * stack, so dragging one would either be ignored or would silently convert it
 * to absolute and quietly forfeit the guarantee that long content still fits.
 * The inspector says which mode a node is in, and switching is one click.
 */
function Canvas({
  preview, canvas, doc, selected, onSelect, onMoveAbsolute,
}: {
  preview: RenderResponse | null;
  canvas: CanvasDef;
  doc: LayoutDoc;
  selected: string | null;
  onSelect: (id: string) => void;
  onMoveAbsolute: (id: string, pos: NonNullable<LayoutNode['position']>) => void;
}) {
  const viewer = useWidth(MAX_W);
  const scale = Math.min(Math.max(1, viewer.width - 2) / canvas.width, MAX_W / canvas.width, MAX_H / canvas.height);
  const displayW = canvas.width * scale;
  const displayH = canvas.height * scale;
  const drag = useRef<{ id: string; startX: number; startY: number; base: { top: number; left: number }; mode: 'move' | 'resize'; size: { w: number; h: number } } | null>(null);
  const [, tick] = useState(0);

  useEffect(() => {
    function onMove(e: PointerEvent) {
      const d = drag.current;
      if (!d) return;
      const dx = (e.clientX - d.startX) / displayW;
      const dy = (e.clientY - d.startY) / displayH;
      if (d.mode === 'move') {
        onMoveAbsolute(d.id, { mode: 'absolute', top: round3(d.base.top + dy), left: round3(d.base.left + dx), width: round3(d.size.w), height: round3(d.size.h) });
      } else {
        onMoveAbsolute(d.id, { mode: 'absolute', top: round3(d.base.top), left: round3(d.base.left), width: round3(Math.max(0.02, d.size.w + dx)), height: round3(Math.max(0.02, d.size.h + dy)) });
      }
      tick((n) => n + 1);
    }
    function onUp() { drag.current = null; }
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    return () => { window.removeEventListener('pointermove', onMove); window.removeEventListener('pointerup', onUp); };
  }, [displayW, displayH, onMoveAbsolute]);

  const rects = preview?.elements ?? [];
  const byId = new Map(flatten(doc.root).map(({ node }) => [node.id, node]));

  return (
    <div ref={viewer.ref} style={{ minWidth: 0, width: '100%' }}>
    <div className="art-frame" style={{ position: 'relative', width: displayW, height: displayH, userSelect: 'none', touchAction: 'none' }}>
      {preview?.url && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={`/api/render/image?path=${encodeURIComponent(preview.url)}`} alt="" width={displayW} height={displayH}
          style={{ display: 'block', width: displayW, height: displayH, pointerEvents: 'none' }} draggable={false} />
      )}
      {rects.map((r) => {
        const node = byId.get(r.name);
        if (!node) return null;
        const isSel = selected === r.name;
        const isAbs = node.position?.mode === 'absolute';
        const isRoot = r.name === doc.root.id;
        if (isRoot) return null;
        return (
          <div
            key={r.name}
            onPointerDown={(e) => {
              e.stopPropagation();
              onSelect(r.name);
              if (!isAbs) return;
              const p = node.position as { top?: number; left?: number; width?: number; height?: number };
              drag.current = {
                id: r.name, mode: 'move', startX: e.clientX, startY: e.clientY,
                base: { top: p.top ?? 0, left: p.left ?? 0 },
                size: { w: p.width ?? 1, h: p.height ?? 1 },
              };
            }}
            title={`${node.name}${isAbs ? ': drag to move' : ': flows in its stack'}`}
            style={{
              position: 'absolute',
              left: r.x * scale, top: r.y * scale,
              width: Math.max(2, r.width * scale), height: Math.max(2, r.height * scale),
              border: isSel ? '2px solid var(--accent)' : '1px dashed color-mix(in srgb, var(--accent) 45%, transparent)',
              background: isSel ? 'color-mix(in srgb, var(--accent) 8%, transparent)' : 'transparent',
              cursor: isAbs ? 'move' : 'pointer', boxSizing: 'border-box',
            }}
          >
            {isSel && (
              <>
                <span style={{
                  position: 'absolute', top: -17, left: -2, fontSize: 10, fontFamily: 'ui-monospace,monospace',
                  color: '#171717', background: 'var(--accent)', padding: '1px 5px', borderRadius: 3,
                  whiteSpace: 'nowrap', pointerEvents: 'none',
                }}>{node.name}{isAbs ? '' : ' (flow)'}</span>
                {isAbs && (
                  <div
                    onPointerDown={(e) => {
                      e.stopPropagation();
                      const p = node.position as { top?: number; left?: number; width?: number; height?: number };
                      drag.current = {
                        id: r.name, mode: 'resize', startX: e.clientX, startY: e.clientY,
                        base: { top: p.top ?? 0, left: p.left ?? 0 },
                        size: { w: p.width ?? 1, h: p.height ?? 1 },
                      };
                    }}
                    style={{ position: 'absolute', right: -5, bottom: -5, width: 10, height: 10, background: 'var(--accent)', border: '1px solid #171717', cursor: 'nwse-resize' }}
                  />
                )}
              </>
            )}
          </div>
        );
      })}
    </div>
    </div>
  );
}

const round3 = (n: number): number => Math.round(n * 1000) / 1000;

/**
 * Live, per-node contrast warnings; the editor half of guards/contrast-scan.ts.
 * Never blocks: a document is free to carry a failing pairing while it's being
 * worked on. Only certification (the golden run) turns this into a hard stop.
 */
function ContrastWarnings({ findings, onSelect }: { findings?: ContrastFinding[]; onSelect: (id: string) => void }) {
  const failing = (findings ?? []).filter((f) => !f.pass);
  if (!failing.length) return null;
  return (
    <div style={{ display: 'grid', gap: 4, fontSize: 11, color: 'var(--warn)' }}>
      {failing.map((f) => (
        <button
          key={f.nodeId}
          onClick={() => onSelect(f.nodeId)}
          style={{
            textAlign: 'left', background: 'transparent', border: '1px solid var(--warn)', borderRadius: 4,
            padding: '4px 8px', color: 'var(--warn)', cursor: 'pointer', fontSize: 11,
          }}
        >
          Low contrast on &ldquo;{f.nodeName}&rdquo;: {f.ratio.toFixed(2)}:1 against its {f.backdrop} backdrop, needs {f.required}:1
        </button>
      ))}
    </div>
  );
}
