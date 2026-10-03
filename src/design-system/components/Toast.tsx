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
  /** ms before it closes by itself; default 4000 for success, 8000 for errors. 0 = stays until closed. */
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

/** One toast region for the whole app, bottom-right. Success is polite (role=status); errors are role=alert. */
export const ToastProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [items, setItems] = useState<ToastItem[]>([]);
  const nextId = useRef(1);
  const timers = useRef(new Map<number, ReturnType<typeof setTimeout>>());

  const dismiss = useCallback((id: number) => {
    setItems((list) => list.filter((t) => t.id !== id));
    const timer = timers.current.get(id);
    if (timer) clearTimeout(timer);
    timers.current.delete(id);
  }, []);

  const show = useCallback(
    (o: ToastOptions) => {
      const id = nextId.current++;
      const tone = o.tone || 'success';
      setItems((list) => [...list.slice(-2), { id, tone, message: o.message, actionLabel: o.actionLabel, onAction: o.onAction }]);
      const duration = o.duration ?? (tone === 'error' ? 8000 : 4000);
      if (duration > 0) timers.current.set(id, setTimeout(() => dismiss(id), duration));
      return id;
    },
    [dismiss]
  );

  useEffect(() => {
    const all = timers.current;
    return () => all.forEach((t) => clearTimeout(t));
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
      <div className="pf-toast-region">
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
