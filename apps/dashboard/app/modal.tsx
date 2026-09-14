'use client';
import { useEffect, useLayoutEffect, useRef, type ReactNode } from 'react';

/** Native modal makes the page inert and returns focus to the opener. */
export function Modal({ children, label, onDismiss, className = '' }: { children: ReactNode; label: string; onDismiss?: () => void; className?: string }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = ref.current!;
    const opener = document.activeElement as HTMLElement | null;
    dialog.showModal();
    return () => { dialog.close(); opener?.focus(); };
  }, []);
  // Replacing the focused control (for example Enlarge) must keep focus inside.
  useLayoutEffect(() => {
    const dialog = ref.current;
    if (dialog?.open && !dialog.contains(document.activeElement)) {
      (dialog.querySelector<HTMLElement>('button:not(:disabled), [tabindex="0"]') ?? dialog).focus();
    }
  });
  return <dialog ref={ref} className={`modal-layer ${className}`} aria-label={label} tabIndex={-1}
    onCancel={(e) => { e.preventDefault(); onDismiss?.(); }}
    onClick={(e) => { if (e.target === e.currentTarget) onDismiss?.(); }}
    onKeyDown={(e) => {
      if (e.key !== 'Tab') return;
      const controls = Array.from(e.currentTarget.querySelectorAll<HTMLElement>('button:not(:disabled), a[href], input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex="0"]')).filter(el => el.getClientRects().length);
      const first = controls[0], last = controls.at(-1);
      if (!first) { e.preventDefault(); e.currentTarget.focus(); }
      else if (e.shiftKey && (document.activeElement === first || document.activeElement === e.currentTarget)) { e.preventDefault(); last?.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    }}>{children}</dialog>;
}
