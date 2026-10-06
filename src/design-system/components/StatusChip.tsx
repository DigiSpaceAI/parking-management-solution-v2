import React from 'react';
import type { LucideIcon } from 'lucide-react';
import { CircleCheck, CircleX, Clock, Wrench, Ban, PauseCircle, Circle } from 'lucide-react';
import { enumLabel, statusTone, type StatusTone } from '../../utils/format';
import { cx } from './cx';

/** Icons pair with the words so status is never colour alone (AC-15). */
const STATUS_ICON: Record<string, LucideIcon> = {
  VACANT: CircleCheck, APPROVED: CircleCheck, ACTIVE: CircleCheck,
  OCCUPIED: CircleX, REJECTED: CircleX,
  RESERVED: Clock, PENDING: Clock,
  MAINTENANCE: Wrench, REVOKED: Ban, ON_HOLD: PauseCircle,
};

export interface StatusChipProps {
  /** An enum value from the API (VACANT, ON_HOLD …); shown as plain words. */
  status: string;
  /** Override the words (rarely needed). */
  label?: string;
  /** Override the colour family. */
  tone?: StatusTone;
  className?: string;
}

/** Status chip: Vacant, Occupied, Reserved, Maintenance, Pending, Approved, Rejected, Revoked, On hold. */
export const StatusChip: React.FC<StatusChipProps> = ({ status, label, tone, className }) => {
  const key = status.trim().toUpperCase();
  const Glyph = STATUS_ICON[key] || Circle;
  return (
    <span className={cx('pf-chip', `pf-chip--${tone || statusTone(key)}`, className)}>
      <Glyph aria-hidden="true" strokeWidth={2} />
      {label || enumLabel(key)}
    </span>
  );
};

export interface CountBadgeProps {
  count: number;
  /** Red for alerts. */
  alert?: boolean;
  /** What is being counted, for screen readers: "3 pending requests". */
  label?: string;
  className?: string;
}

/** A count only, never words (nav and tab badges). Hidden at zero. */
export const CountBadge: React.FC<CountBadgeProps> = ({ count, alert, label, className }) => {
  if (!count) return null;
  const shown = count > 99 ? '99+' : String(count);
  return (
    // aria-label on a plain <span> is ignored by most screen readers (05 m-3): the visible "99+" is hidden
    // from them and the full sentence ("128 pending requests") is real, visually hidden text instead.
    <span className={cx('pf-count', alert && 'pf-count--alert', className)}>
      {label ? (
        <>
          <span aria-hidden="true">{shown}</span>
          <span className="pf-sr-only">{`${count} ${label}`}</span>
        </>
      ) : (
        shown
      )}
    </span>
  );
};

/** The short site code on a row in All sites mode. */
export const SiteTag: React.FC<{ code: string; name?: string; className?: string }> = ({ code, name, className }) => (
  <span className={cx('pf-site-tag', className)} title={name}>
    {code}
  </span>
);
