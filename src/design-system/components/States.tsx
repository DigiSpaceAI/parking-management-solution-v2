import React, { useEffect, useState } from 'react';
import type { LucideIcon } from 'lucide-react';
import { Inbox, AlertTriangle, WifiOff, RotateCw } from 'lucide-react';
import { Icon } from './Icon';
import { Button } from './Button';
import { cx } from './cx';

export interface EmptyStateProps {
  icon?: LucideIcon;
  /** Name what is empty and where: "No pending requests for Alphatech Pune". */
  title: string;
  text?: React.ReactNode;
  /** The next step, e.g. a "Clear filters" or "Add slot" button. */
  actions?: React.ReactNode;
  className?: string;
}

/** Nothing here yet, plus the next step. */
export const EmptyState: React.FC<EmptyStateProps> = ({ icon = Inbox, title, text, actions, className }) => (
  <div className={cx('pf-state', className)}>
    <span className="pf-state-icon">
      <Icon icon={icon} size={24} />
    </span>
    <h3 className="pf-state-title">{title}</h3>
    {text && <p className="pf-state-text">{text}</p>}
    {actions && <div className="pf-row">{actions}</div>}
  </div>
);

/** Follows the browser's online/offline events. */
function useOnline(): boolean {
  const [online, setOnline] = useState(() => (typeof navigator === 'undefined' ? true : navigator.onLine !== false));
  useEffect(() => {
    const up = () => setOnline(true);
    const down = () => setOnline(false);
    window.addEventListener('online', up);
    window.addEventListener('offline', down);
    return () => {
      window.removeEventListener('online', up);
      window.removeEventListener('offline', down);
    };
  }, []);
  return online;
}

export interface ErrorStateProps {
  title?: string;
  text?: React.ReactNode;
  onRetry?: () => void;
  retrying?: boolean;
  className?: string;
}

/**
 * A failed load with Try again. Says "You're offline" only when the browser
 * really has no network (navigator.onLine === false, AC-27); any other failure
 * is "Something went wrong".
 */
export const ErrorState: React.FC<ErrorStateProps> = ({ title, text, onRetry, retrying, className }) => {
  const online = useOnline();
  return (
    <div className={cx('pf-state pf-state--error', className)} role="alert">
      <span className="pf-state-icon">
        <Icon icon={online ? AlertTriangle : WifiOff} size={24} />
      </span>
      <h3 className="pf-state-title">{online ? title || 'Something went wrong' : "You're offline"}</h3>
      <p className="pf-state-text">
        {online ? text || 'We couldn’t load this. Try again.' : 'Check your connection. You can try again when you’re back online.'}
      </p>
      {onRetry && (
        <div className="pf-row">
          <Button icon={RotateCw} onClick={onRetry} loading={retrying} loadingLabel="Trying again…">
            Try again
          </Button>
        </div>
      )}
    </div>
  );
};

export interface SkeletonProps {
  variant?: 'text' | 'title' | 'block' | 'kpi';
  /** CSS width, e.g. "40%" or "120px". */
  width?: string;
  className?: string;
}

/** A loading placeholder (no shimmer; nothing moves under reduce-motion anyway). */
export const Skeleton: React.FC<SkeletonProps> = ({ variant = 'text', width, className }) => (
  <span
    className={cx('pf-skel', `pf-skel--${variant}`, className)}
    aria-hidden="true"
    style={{ '--pf-w': width } as React.CSSProperties}
  />
);
