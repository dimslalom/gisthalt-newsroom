'use client';
import { useEffect, useRef, useState } from 'react';

export interface ElementRect { name: string; x: number; y: number; width: number; height: number }
export interface ElementTransform { x?: number; y?: number; scale?: number }
export interface LayoutOverride {
  padding?: number; spacingUnit?: number; headlineMinPx?: number; headlineMaxPx?: number;
  bodyAlign?: 'start' | 'center' | 'end'; textAlign?: 'left' | 'center' | 'right';
  elements?: Record<string, ElementTransform>;
}

const CANVAS_W = 1080;
const CANVAS_H = 1350;
const HANDLE = 11; // px, screen space; the little resize-grip square

/**
 * A real design surface: drag a box to move it, drag its corner to resize it.
 * Layouts position content with CSS Grid/Flex, not literal coordinates, so
 * what's being edited is a translate+scale nudge from each element's own
 * computed position; not a free-floating canvas. That's deliberate: content
 * still flows and fits normally underneath, so the guards (fitText, contrast)
 * keep reasoning about a real box, and a saved nudge can never produce
 * something the renderer's own safety checks wouldn't also have to survive.
 *
 * Selection is owned by the parent (not local state here) so the canvas and
 * the numeric inspector next to it never disagree about which box is active.
 */
export function BoundingBoxEditor({
  imageUrl, elements, override, savedElements, displayWidth, selected, onSelect, onChange,
}: {
  imageUrl: string;
  elements: ElementRect[];
  override: LayoutOverride;
  /** The transform baked into `elements`' measured geometry; i.e. what was
   *  actually saved and rendered. The gap between this and `override`'s
   *  current (possibly still-being-dragged) value is what moves the box on
   *  screen live, without a re-render round trip for every pixel of drag. */
  savedElements?: Record<string, ElementTransform>;
  displayWidth: number;
  selected: string | null;
  onSelect: (name: string | null) => void;
  onChange: (elements: Record<string, ElementTransform>) => void;
}) {
  const scale = displayWidth / CANVAS_W;
  const displayHeight = CANVAS_H * scale;
  const dragRef = useRef<{
    name: string; mode: 'move' | 'resize';
    startX: number; startY: number;
    base: ElementTransform; rect: ElementRect; current: Record<string, ElementTransform>;
  } | null>(null);
  const [, forceRender] = useState(0);

  useEffect(() => {
    function onMove(e: PointerEvent) {
      const d = dragRef.current;
      if (!d) return;
      const dxCanvas = (e.clientX - d.startX) / scale;
      const dyCanvas = (e.clientY - d.startY) / scale;
      if (d.mode === 'move') {
        d.current = { ...d.current, [d.name]: { ...d.current[d.name], x: Math.round((d.base.x ?? 0) + dxCanvas), y: Math.round((d.base.y ?? 0) + dyCanvas) } };
      } else {
        // Resize from the top-left corner (the transform-origin the renderer
        // uses): growing the box by dx over its own natural width scales it.
        const growth = 1 + dxCanvas / Math.max(40, d.rect.width);
        const newScale = Math.round(Math.max(0.2, Math.min(4, (d.base.scale ?? 1) * growth)) * 100) / 100;
        d.current = { ...d.current, [d.name]: { ...d.current[d.name], scale: newScale } };
      }
      onChange(d.current);
      forceRender((n) => n + 1);
    }
    function onUp() { dragRef.current = null; }
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    return () => { window.removeEventListener('pointermove', onMove); window.removeEventListener('pointerup', onUp); };
  }, [scale]); // eslint-disable-line react-hooks/exhaustive-deps

  function startDrag(e: React.PointerEvent, name: string, mode: 'move' | 'resize', rect: ElementRect) {
    e.preventDefault();
    e.stopPropagation();
    onSelect(name);
    dragRef.current = { name, mode, startX: e.clientX, startY: e.clientY, base: override.elements?.[name] ?? {}, rect, current: { ...(override.elements ?? {}) } };
  }

  return (
    <div
      style={{ position: 'relative', width: displayWidth, height: displayHeight, background: '#111111', userSelect: 'none', touchAction: 'none' }}
      onPointerDown={() => onSelect(null)}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={imageUrl} alt="" width={displayWidth} height={displayHeight} style={{ display: 'block', width: displayWidth, height: displayHeight, pointerEvents: 'none' }} draggable={false} />
      {elements.map((rect) => {
        const tr = override.elements?.[rect.name];
        const isSelected = selected === rect.name;
        // rect already reflects savedTr (it's measured from the last real
        // render); the box follows the mouse live by applying only the delta
        // between what's currently being edited and what was last saved.
        const savedTr = savedElements?.[rect.name];
        const dx = (tr?.x ?? 0) - (savedTr?.x ?? 0);
        const dy = (tr?.y ?? 0) - (savedTr?.y ?? 0);
        const relativeScale = (tr?.scale ?? 1) / (savedTr?.scale ?? 1);
        return (
          <div
            key={rect.name}
            onPointerDown={(e) => startDrag(e, rect.name, 'move', rect)}
            title={`${rect.name}: drag to move; drag the corner to resize`}
            style={{
              position: 'absolute',
              left: (rect.x + dx) * scale, top: (rect.y + dy) * scale,
              width: rect.width * relativeScale * scale, height: rect.height * relativeScale * scale,
              border: isSelected ? '2px solid var(--accent)' : '1px dashed rgba(255,255,255,.55)',
              background: isSelected ? 'rgba(255,255,255,.08)' : 'transparent',
              cursor: 'move', boxSizing: 'border-box',
            }}
          >
            <span style={{
              position: 'absolute', top: -18, left: 0, fontSize: 10, fontFamily: 'ui-monospace,monospace',
              color: isSelected ? 'var(--accent)' : 'rgba(255,255,255,.75)', background: '#222222', padding: '1px 4px',
              borderRadius: 3, whiteSpace: 'nowrap', pointerEvents: 'none',
            }}>
              {rect.name}{tr && (tr.x || tr.y || (tr.scale && tr.scale !== 1)) ? ' •' : ''}
            </span>
            {isSelected && (
              <div
                onPointerDown={(e) => startDrag(e, rect.name, 'resize', rect)}
                title="Drag to resize"
                style={{
                  position: 'absolute', right: -HANDLE / 2, bottom: -HANDLE / 2, width: HANDLE, height: HANDLE,
                  background: 'var(--accent)', border: '1px solid #171717', borderRadius: 2, cursor: 'nwse-resize',
                }}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}

/** The numeric readout + reset for whichever box is selected; precise entry
 *  for anyone who'd rather type a number than eyeball a drag. */
export function ElementInspector({
  name, transform, onChange, onReset,
}: {
  name: string | null;
  transform: ElementTransform | undefined;
  onChange: (t: ElementTransform) => void;
  onReset: () => void;
}) {
  if (!name) return <p style={{ fontSize: 12, color: 'var(--muted)', margin: 0 }}>Click a box to select it.</p>;
  const t = transform ?? {};
  return (
    <div style={{ display: 'grid', gap: 8 }}>
      <div className="row" style={{ justifyContent: 'space-between' }}>
        <strong style={{ fontSize: 13 }}>{name}</strong>
        <button onClick={onReset} disabled={!transform}>Reset</button>
      </div>
      <div className="row">
        <label className="field" style={{ flex: 1 }}>X (px)
          <input type="number" value={t.x ?? 0} onChange={(e) => onChange({ ...t, x: Number(e.target.value) || 0 })} />
        </label>
        <label className="field" style={{ flex: 1 }}>Y (px)
          <input type="number" value={t.y ?? 0} onChange={(e) => onChange({ ...t, y: Number(e.target.value) || 0 })} />
        </label>
        <label className="field" style={{ flex: 1 }}>Scale
          <input type="number" step={0.05} min={0.2} max={4} value={t.scale ?? 1} onChange={(e) => onChange({ ...t, scale: Number(e.target.value) || 1 })} />
        </label>
      </div>
    </div>
  );
}
