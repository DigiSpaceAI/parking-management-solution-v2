import React from 'react';
import type { LucideIcon } from 'lucide-react';
import { Info, AlertTriangle, AlertCircle, CircleCheck, X, Eye } from 'lucide-react';
import { cx } from './cx';
import { Icon } from './Icon';

export type BannerTone = 'info' | 'warning' | 'danger' | 'success';
const TONE_ICON: Record<BannerTone, LucideIcon> = { info: Info, warning: AlertTriangle, danger: AlertCircle, success: CircleCheck };

export interface BannerProps {
  tone?: BannerTone;
  title?: React.ReactNode;
  children?: React.ReactNode;
  /** Buttons on the right. */
  actions?: React.ReactNode;
  /** Shows a close button. */
  onClose?: () => void;
  /** Danger and warning banners are announced (role=alert); info and success politely (role=status). */
  role?: 'alert' | 'status' | 'none';
  className?: string;
}

/** An inline message across a page or card: info, warning, danger, success. */
export const Banner: React.FC<BannerProps> = ({ tone = 'info', title, children, actions, onClose, role, className }) => {
  const r = role ?? (tone === 'danger' || tone === 'warning' ? 'alert' : 'status');
  return (
    <div className={cx('pf-banner', `pf-banner--${tone}`, className)} role={r === 'none' ? undefined : r}>
      <Icon icon={TONE_ICON[tone]} size={20} />
      <div className="pf-stack">
        {title && <span className="pf-banner-title">{title}</span>}
        {children && <div>{children}</div>}
      </div>
      {actions && <div className="pf-banner-actions">{actions}</div>}
      {onClose && (
        <button type="button" className="pf-banner-close" onClick={onClose} aria-label="Dismiss">
          <Icon icon={X} size={20} />
        </button>
      )}
    </div>
  );
};

export interface ViewingAsBarProps {
  userName: string;
  roleName: string;
  siteLabel: string;
  onExit: () => void;
}

/**
 * The "Viewing as" bar (AC-25): restyle of 001's ViewAsBanner (same copy and
 * role=status; the view-as logic stays in App/withSite and is passed in).
 */
export const ViewingAsBar: React.FC<ViewingAsBarProps> = ({ userName, roleName, siteLabel, onExit }) => (
  <div className="pf-viewing-as" role="status">
    <Icon icon={Eye} size={20} />
    <span>
      Viewing as <strong>{userName}</strong> · {roleName} · {siteLabel} — read-only
    </span>
    <button type="button" className="pf-viewing-as-exit" onClick={onExit}>
      Exit view
    </button>
  </div>
);
