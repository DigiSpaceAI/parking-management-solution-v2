import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { CircleCheck, AlertCircle, X } from 'lucide-react';
import { Icon } from './Icon';
import { cx } from './cx';

export type ToastTone = 'success' | 'error';

export interface ToastOptions {
  tone?: ToastTone;
  message: string;
  /** "Undo" or "Try again". */
  actionLabel?: string;
  onAction?: () => void;
  /**
   * ms before it closes by itself; default 4000 for success, 8000 for errors. 0 = stays until closed.
   * A toast with an action ("Undo", "Try again") stays until closed by default, and never closes by
   * itself in under 10 s (WCAG 2.2.1). Timers pause while the pointer or focus is in the toast region.
   */
  duration?: number;
}

interface ToastItem extends Required<Pick<ToastOptions, 'message'>> {
  id: number;
  tone: ToastTone;
  actionLabel?: string;
  onAction?: () => void;
}

interface ToastApi {
  show: (options: ToastOptions) => number;
  dismiss: (id: number) => void;
}

const ToastContext = createContext<ToastApi | null>(null);
/** A toast that offers an action never closes by itself sooner than this (WCAG 2.2.1 Timing adjustable). */
const ACTION_MIN_MS = 10000;

/** One toast region for the whole app, bottom-right. Success is polite (role=status); errors are role=alert. */
export const ToastProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [items, setItems] = useState<ToastItem[]>([]);
  const nextId = useRef(1);
  /** Per-toast timer: time left, when the current run started, and the pending timeout (null while paused). */
  const timers = useRef(new Map<number, { left: number; started: number; handle: ReturnType<typeof setTimeout> | null }>());
  const paused = useRef(false);

  const dismiss = useCallback((id: number) => {
    setItems((list) => list.filter((t) => t.id !== id));
    const timer = timers.current.get(id);
    if (timer?.handle) clearTimeout(timer.handle);
    timers.current.delete(id);
  }, []);

  const run = useCallback(
    (id: number) => {
      const timer = timers.current.get(id);
      if (!timer || paused.current) return;
      timer.started = Date.now();
      timer.handle = setTimeout(() => dismiss(id), timer.left);
    },
    [dismiss]
  );

  const show = useCallback(
    (o: ToastOptions) => {
      const id = nextId.current++;
      const tone = o.tone || 'success';
      const actionable = Boolean(o.actionLabel && o.onAction);
      setItems((list) => [...list.slice(-2), { id, tone, message: o.message, actionLabel: o.actionLabel, onAction: o.onAction }]);
      let duration = o.duration ?? (actionable ? 0 : tone === 'error' ? 8000 : 4000);
      if (actionable && duration > 0) duration = Math.max(duration, ACTION_MIN_MS);
      if (duration > 0) {
        timers.current.set(id, { left: duration, started: Date.now(), handle: null });
        run(id);
      }
      return id;
    },
    [run]
  );

  /** Pause every running timer while the pointer or keyboard focus is inside the region; resume on leave. */
  const pause = useCallback(() => {
    if (paused.current) return;
    paused.current = true;
    timers.current.forEach((t) => {
      if (t.handle) {
        clearTimeout(t.handle);
        t.handle = null;
        t.left = Math.max(0, t.left - (Date.now() - t.started));
      }
    });
  }, []);
  const resume = useCallback(() => {
    if (!paused.current) return;
    paused.current = false;
    timers.current.forEach((_, id) => run(id));
  }, [run]);
  const hovering = useRef(false);
  const focused = useRef(false);
  const sync = () => (hovering.current || focused.current ? pause() : resume());

  // When the last toast goes, the region may shrink away without a mouseleave/blur: start the next toast unpaused.
  useEffect(() => {
    if (items.length === 0) {
      hovering.current = false;
      focused.current = false;
      paused.current = false;
    }
  }, [items.length]);

  useEffect(() => {
    const all = timers.current;
    return () => all.forEach((t) => t.handle && clearTimeout(t.handle));
  }, []);

  const api = useMemo(() => ({ show, dismiss }), [show, dismiss]);
  const success = items.filter((t) => t.tone === 'success');
  const errors = items.filter((t) => t.tone === 'error');

  const render = (t: ToastItem) => (
    <div key={t.id} className={cx('pf-toast', `pf-toast--${t.tone}`)} data-entering="true">
      <Icon icon={t.tone === 'error' ? AlertCircle : CircleCheck} size={20} />
      <span>{t.message}</span>
      {t.actionLabel && t.onAction && (
        <button
          type="button"
          className="pf-toast-action"
          onClick={() => {
            t.onAction?.();
            dismiss(t.id);
          }}
        >
          {t.actionLabel}
        </button>
      )}
      <button type="button" className="pf-toast-close" onClick={() => dismiss(t.id)} aria-label="Dismiss">
        <Icon icon={X} size={16} />
      </button>
    </div>
  );

  return (
    <ToastContext.Provider value={api}>
      {children}
      <div
        className="pf-toast-region"
        onMouseEnter={() => { hovering.current = true; sync(); }}
        onMouseLeave={() => { hovering.current = false; sync(); }}
        onFocus={() => { focused.current = true; sync(); }}
        onBlur={(e) => {
          if (!e.currentTarget.contains(e.relatedTarget as Node | null)) { focused.current = false; sync(); }
        }}
      >
        <div role="status" aria-live="polite" className="pf-stack">
          {success.map(render)}
        </div>
        <div role="alert" aria-live="assertive" className="pf-stack">
          {errors.map(render)}
        </div>
      </div>
    </ToastContext.Provider>
  );
};

/** Show a toast: `const toast = useToast(); toast.show({ message: '3 requests approved' })`. */
export function useToast(): ToastApi {
  const api = useContext(ToastContext);
  if (!api) throw new Error('useToast needs a <ToastProvider> above it');
  return api;
}
