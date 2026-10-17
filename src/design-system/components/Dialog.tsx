import React, { useEffect, useId, useRef } from 'react';
import { X } from 'lucide-react';
import { cx } from './cx';
import { IconButton } from './Button';

/**
 * Shared <dialog> behaviour: showModal() gives the focus trap, Esc and the
 * backdrop with no dependency. The parent owns `open`; every way the dialog
 * can close calls onClose so `open` never goes stale (05 round 1, m-1):
 *  - Esc: the cancellable "cancel" event (prevented, then onClose);
 *  - a native close we didn't start (Chrome's close-watcher on a repeated Esc,
 *    a nested <form method="dialog">): the "close" event while `open` is still true;
 *  - a click on the backdrop: only when the press both started and ended on the
 *    <dialog> itself, so a text-selection drag from the content to the backdrop
 *    doesn't close it and lose what was typed.
 * Focus returns to the element that was focused before opening, also when the
 * dialog is closed natively or unmounted while open.
 */
function useDialog(open: boolean, onClose: () => void) {
  const ref = useRef<HTMLDialogElement>(null);
  const opener = useRef<Element | null>(null);
  const openRef = useRef(open);
  const onCloseRef = useRef(onClose);
  const pressStartedOnBackdrop = useRef(false);
  openRef.current = open;
  onCloseRef.current = onClose;

  const restoreFocus = () => {
    const el = opener.current;
    opener.current = null;
    if (el instanceof HTMLElement && el.isConnected) el.focus();
  };

  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) {
      opener.current = document.activeElement;
      d.showModal();
    } else if (!open && d.open) {
      d.close();
      restoreFocus();
    }
  }, [open]);
  useEffect(() => {
    const d = ref.current;
    return () => {
      if (d?.open) {
        d.close();
        restoreFocus();
      }
    };
  }, []);

  const onCancel = (e: React.SyntheticEvent) => {
    e.preventDefault();
    onCloseRef.current();
  };
  /** The dialog closed without us closing it (close-watcher, form method="dialog"). */
  const onNativeClose = () => {
    if (openRef.current) {
      restoreFocus();
      onCloseRef.current();
    }
  };
  const onMouseDown = (e: React.MouseEvent<HTMLDialogElement>) => {
    pressStartedOnBackdrop.current = e.target === e.currentTarget;
  };
  /** A click whose press started and ended on the <dialog> itself landed on the backdrop, not the content. */
  const onClick = (e: React.MouseEvent<HTMLDialogElement>) => {
    const fromBackdrop = pressStartedOnBackdrop.current;
    pressStartedOnBackdrop.current = false;
    if (fromBackdrop && e.target === e.currentTarget) onCloseRef.current();
  };
  return { ref, dialogProps: { onCancel, onClose: onNativeClose, onMouseDown, onClick } };
}

export interface ModalProps {
  open: boolean;
  onClose: () => void;
  title: React.ReactNode;
  children?: React.ReactNode;
  /** Buttons, right-aligned: secondary first, primary last. */
  footer?: React.ReactNode;
  className?: string;
}

/** A modal (e.g. "Reject 2 requests?" with a required reason). */
export const Modal: React.FC<ModalProps> = ({ open, onClose, title, children, footer, className }) => {
  const { ref, dialogProps } = useDialog(open, onClose);
  const titleId = useId();
  return (
    <dialog ref={ref} className={cx('pf-dialog pf-dialog--modal', className)} aria-labelledby={titleId} {...dialogProps}>
      {open && (
        <div className="pf-modal">
          <div className="pf-modal-head">
            <h2 id={titleId}>{title}</h2>
            <IconButton icon={X} label="Close" onClick={onClose} />
          </div>
          {children && <div className="pf-modal-body">{children}</div>}
          {footer && <div className="pf-modal-foot">{footer}</div>}
        </div>
      )}
    </dialog>
  );
};

export interface SidePanelProps {
  open: boolean;
  onClose: () => void;
  title: React.ReactNode;
  /** A line under the title, e.g. the site code or a status chip. */
  subtitle?: React.ReactNode;
  children?: React.ReactNode;
  /** Actions at the bottom: "Edit site · Change status · ⋯". */
  footer?: React.ReactNode;
  className?: string;
}

/** Record details + actions from the right (full width below 768px). Esc and outside click close it. */
export const SidePanel: React.FC<SidePanelProps> = ({ open, onClose, title, subtitle, children, footer, className }) => {
  const { ref, dialogProps } = useDialog(open, onClose);
  const titleId = useId();
  return (
    <dialog ref={ref} className={cx('pf-dialog pf-dialog--panel', className)} aria-labelledby={titleId} {...dialogProps}>
      {open && (
        <div className="pf-panel">
          <div className="pf-panel-head">
            <div className="pf-stack">
              <h2 id={titleId}>{title}</h2>
              {subtitle && <div>{subtitle}</div>}
            </div>
            <IconButton icon={X} label="Close" onClick={onClose} className="pf-panel-close" />
          </div>
          <div className="pf-panel-body">{children}</div>
          {footer && <div className="pf-panel-foot">{footer}</div>}
        </div>
      )}
    </dialog>
  );
};
