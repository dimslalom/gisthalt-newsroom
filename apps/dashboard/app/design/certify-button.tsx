'use client';
import { Modal } from '../modal.tsx';
import { useEffect, useRef, useState } from 'react';

interface GoldenJob { running: boolean; checked: number; total: number; done: boolean; passed?: number; error?: string }

const TRACK_W = 320;
const INDETERMINATE_SCALE = 0.3;
/** How far the scaled-down bar must slide to reach the track's right edge.
 *  translateX(px) is an absolute shift unaffected by a scale earlier in the
 *  same transform's application order, so this is just the plain leftover
 *  distance; no percentage-of-scaled-box math to get backwards. */
const INDETERMINATE_TRAVEL = TRACK_W - TRACK_W * INDETERMINATE_SCALE;

/**
 * Certification, from the GUI: the button a designer reaches for after
 * finishing a layout (or several), instead of a terminal command. Runs the
 * full golden matrix in the renderer container and blocks the whole page
 * while it does; real production posts only ever pick a certified layout,
 * so a half-certified brand mid-run is a state nobody should be editing
 * through, hence the full-screen lock rather than a background toast.
 */
export function CertifyButton({ layout, label }: { layout?: string; label?: string } = {}) {
  const [job, setJob] = useState<GoldenJob | null>(null);
  const [dismissedError, setDismissedError] = useState(false);
  const poll = useRef<ReturnType<typeof setInterval> | null>(null);

  const stopPolling = () => { if (poll.current) { clearInterval(poll.current); poll.current = null; } };

  const checkStatus = async () => {
    try {
      const res = await fetch('/api/goldens/status', { cache: 'no-store' });
      const data = await res.json() as GoldenJob & { error?: string };
      setJob(data);
      if (!data.running) stopPolling();
    } catch {
      stopPolling();
    }
  };

  // Resume watching a run already in progress (e.g. this page was reloaded
  // mid-certification) instead of only ever knowing about one this tab started.
  useEffect(() => {
    void checkStatus();
    return stopPolling;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (job?.running && !poll.current) poll.current = setInterval(() => { void checkStatus(); }, 1000);
  }, [job?.running]);

  async function start() {
    setDismissedError(false);
    const res = await fetch('/api/goldens/run', {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(layout ? { layout } : {}),
    });
    if (res.status === 409 || res.ok) { await checkStatus(); }
    else { const data = await res.json() as { error?: string }; setJob({ running: false, checked: 0, total: 0, done: true, error: data.error ?? 'failed to start' }); }
  }

  const blocking = Boolean(job?.running) || (job?.done && job.error && !dismissedError);
  const pct = job && job.total > 0 ? Math.round((job.checked / job.total) * 100) : null;

  return (
    <>
      <button type="button" onClick={() => void start()} disabled={Boolean(job?.running)} style={{ fontSize: 12 }}>
        {job?.running ? 'Certifying…' : (label ?? 'Certify all designs')}
      </button>

      {blocking && (
        <Modal label={job?.running ? 'Certification in progress' : 'Certification failed'} className="certification-modal" onDismiss={job?.running ? undefined : () => setDismissedError(true)}>
          {job?.running ? (
            <>
              <div className="panel-title" style={{ fontSize: 16 }}>Certifying every design…</div>
              <div style={{ fontSize: 12, color: 'var(--muted)' }}>
                Don&apos;t close this tab or navigate away until it finishes.
              </div>
              <div style={{ width: TRACK_W, maxWidth: '100%', height: 8, borderRadius: 4, background: 'var(--panel)', overflow: 'hidden', border: '1px solid var(--line)' }}>
                <div style={{
                  height: '100%', width: '100%', background: 'var(--accent)', transformOrigin: 'left',
                  // Fill amount is always a scaleX of a full-width bar, never
                  // a literal width change; the determinate fill updates on
                  // every ~1s poll tick, and a `width` transition would force
                  // a layout recalc each time; `transform` is compositor-only.
                  transition: 'transform .3s ease',
                  transform: pct !== null ? `scaleX(${pct / 100})` : `scaleX(${INDETERMINATE_SCALE})`,
                  ...(pct === null ? { animation: 'certify-indeterminate 1.2s ease-in-out infinite' } : {}),
                }} />
              </div>
              <div style={{ fontSize: 12, color: 'var(--muted)', fontFamily: 'ui-monospace, monospace' }}>
                {job.total > 0 ? `${job.checked} / ${job.total} renders checked` : 'starting…'}
              </div>
              {/* Indeterminate: the scaled-down bar sliding to the track's
                  right edge and back. translateX must come before scaleX in
                  the transform list; written left-to-right, each function
                  applies to the result of the ones after it, so translateX
                  here is the outermost step and its px value lands in the
                  track's real coordinate space, not the bar's shrunk one. */}
              <style>{`@keyframes certify-indeterminate { 0% { transform: translateX(0px) scaleX(${INDETERMINATE_SCALE}); } 50% { transform: translateX(${INDETERMINATE_TRAVEL}px) scaleX(${INDETERMINATE_SCALE}); } 100% { transform: translateX(0px) scaleX(${INDETERMINATE_SCALE}); } }`}</style>
            </>
          ) : (
            <div style={{ display: 'grid', gap: 12, justifyItems: 'center', maxWidth: 420, textAlign: 'center' }}>
              <div className="panel-title" style={{ fontSize: 16, color: 'var(--bad)' }}>Certification failed</div>
              <div style={{ fontSize: 12, color: 'var(--muted)', whiteSpace: 'pre-wrap', maxHeight: 200, overflowY: 'auto' }}>
                {job?.error}
              </div>
              <button type="button" onClick={() => setDismissedError(true)} style={{ fontSize: 12 }}>Close</button>
            </div>
          )}
        </Modal>
      )}

      {job?.done && !job.error && job.passed !== undefined && !blocking && (
        <CertifySuccessToast passed={job.passed} total={job.total} onDone={() => setJob(null)} />
      )}
    </>
  );
}

/** A brief, dismiss-itself confirmation once a run finishes clean; the
 *  full-screen lock already made the wait unmissable, so success doesn't
 *  need another modal, just a quiet acknowledgement. */
function CertifySuccessToast({ passed, total, onDone }: { passed: number; total: number; onDone: () => void }) {
  useEffect(() => {
    const t = setTimeout(onDone, 4000);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return (
    <div style={{
      position: 'fixed', bottom: 20, right: 20, zIndex: 1500, fontSize: 12,
      background: 'var(--panel)', border: '1px solid var(--line)', borderRadius: 'var(--radius-panel)', padding: '8px 12px', color: 'var(--fg)',
    }}>
      Certified {passed}/{total} designs.
    </div>
  );
}
