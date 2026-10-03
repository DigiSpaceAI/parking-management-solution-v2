import React, { useEffect, useId, useRef } from 'react';
import { X } from 'lucide-react';
import { cx } from './cx';
import { IconButton } from './Button';

/**
 * Shared <dialog> behaviour: showModal() gives the focus trap, Esc and the
 * backdrop with no dependency. Esc (the native "cancel" event) and a click on
 * the backdrop (outside the content) both call onClose; the parent owns `open`.
 * Focus returns to the element that was focused before opening.
 */
function useDialog(open: boolean, onClose: () => void) {
  const ref = useRef<HTMLDialogElement>(null);
  const opener = useRef<Element | null>(null);
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) {
      opener.current = document.activeElement;
      d.showModal();
    } else if (!open && d.open) {
      d.close();
      if (opener.current instanceof HTMLElement) opener.current.focus();
    }
  }, [open]);
  useEffect(() => {
    const d = ref.current;
    return () => {
      if (d?.open) d.close();
    };
  }, []);
  const onCancel = (e: React.SyntheticEvent) => {
    e.preventDefault();
    onClose();
  };
  /** A click whose target is the <dialog> itself landed on the backdrop, not the content. */
  const onClick = (e: React.MouseEvent<HTMLDialogElement>) => {
    if (e.target === e.currentTarget) onClose();
  };
  return { ref, onCancel, onClick };
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
  const { ref, onCancel, onClick } = useDialog(open, onClose);
  const titleId = useId();
  return (
    <dialog ref={ref} className={cx('pf-dialog pf-dialog--modal', className)} aria-labelledby={titleId} onCancel={onCancel} onClick={onClick}>
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
  const { ref, onCancel, onClick } = useDialog(open, onClose);
  const titleId = useId();
  return (
    <dialog ref={ref} className={cx('pf-dialog pf-dialog--panel', className)} aria-labelledby={titleId} onCancel={onCancel} onClick={onClick}>
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
