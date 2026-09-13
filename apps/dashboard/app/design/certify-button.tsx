'use client';
import { useEffect, useRef, useState } from 'react';

interface GoldenJob { running: boolean; checked: number; total: number; done: boolean; passed?: number; error?: string }

/**
 * Certification, from the GUI: the button a designer reaches for after
 * finishing a layout (or several), instead of a terminal command. Runs the
 * full golden matrix in the renderer container and blocks the whole page
 * while it does — real production posts only ever pick a certified layout,
 * so a half-certified brand mid-run is a state nobody should be editing
 * through, hence the full-screen lock rather than a background toast.
 */
export function CertifyButton() {
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
    const res = await fetch('/api/goldens/run', { method: 'POST' });
    if (res.status === 409 || res.ok) { await checkStatus(); }
    else { const data = await res.json() as { error?: string }; setJob({ running: false, checked: 0, total: 0, done: true, error: data.error ?? 'failed to start' }); }
  }

  const blocking = Boolean(job?.running) || (job?.done && job.error && !dismissedError);
  const pct = job && job.total > 0 ? Math.round((job.checked / job.total) * 100) : null;

  return (
    <>
      <button type="button" onClick={() => void start()} disabled={Boolean(job?.running)} style={{ fontSize: 12 }}>
        {job?.running ? 'Certifying…' : 'Certify all designs'}
      </button>

      {blocking && (
        <div
          role="dialog" aria-modal="true"
          style={{
            position: 'fixed', inset: 0, zIndex: 2000, background: 'color-mix(in srgb, black 80%, transparent)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 18,
            cursor: job?.running ? 'wait' : 'default',
          }}
        >
          {job?.running ? (
            <>
              <div style={{ fontSize: 16, color: 'var(--fg)', fontWeight: 600 }}>Certifying every design…</div>
              <div style={{ fontSize: 12, color: 'var(--muted)' }}>
                Don&apos;t close this tab or navigate away until it finishes.
              </div>
              <div style={{ width: 320, height: 8, borderRadius: 4, background: 'var(--panel)', overflow: 'hidden', border: '1px solid var(--line)' }}>
                <div style={{
                  height: '100%', width: pct !== null ? `${pct}%` : '30%', background: 'var(--accent)',
                  transition: 'width .3s ease',
                  // Indeterminate state: transform, not margin-left, so the
                  // looping animation is compositor-only and never triggers layout.
                  ...(pct === null ? { animation: 'certify-indeterminate 1.2s ease-in-out infinite' } : {}),
                }} />
              </div>
              <div style={{ fontSize: 12, color: 'var(--muted)', fontFamily: 'ui-monospace, monospace' }}>
                {job.total > 0 ? `${job.checked} / ${job.total} renders checked` : 'starting…'}
              </div>
              {/* A 30%-wide bar needs to travel the remaining 70% of the
                  track; translateX's percentage is relative to the bar's own
                  width, so that's 70/30*100 ≈ 233%, not 70%. */}
              <style>{`@keyframes certify-indeterminate { 0% { transform: translateX(0%); } 50% { transform: translateX(233%); } 100% { transform: translateX(0%); } }`}</style>
            </>
          ) : (
            <div style={{ display: 'grid', gap: 12, justifyItems: 'center', maxWidth: 420, textAlign: 'center' }}>
              <div style={{ fontSize: 16, color: 'var(--bad)', fontWeight: 600 }}>Certification failed</div>
              <div style={{ fontSize: 12, color: 'var(--muted)', whiteSpace: 'pre-wrap', maxHeight: 200, overflowY: 'auto' }}>
                {job?.error}
              </div>
              <button type="button" onClick={() => setDismissedError(true)} style={{ fontSize: 12 }}>Close</button>
            </div>
          )}
        </div>
      )}

      {job?.done && !job.error && job.passed !== undefined && !blocking && (
        <CertifySuccessToast passed={job.passed} total={job.total} onDone={() => setJob(null)} />
      )}
    </>
  );
}

/** A brief, dismiss-itself confirmation once a run finishes clean — the
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
      background: 'var(--panel)', border: '1px solid var(--line)', borderRadius: 6, padding: '8px 12px', color: 'var(--fg)',
    }}>
      Certified {passed}/{total} — designs are live for production publishing.
    </div>
  );
}
