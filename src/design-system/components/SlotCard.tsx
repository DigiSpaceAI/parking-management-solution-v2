import React from 'react';
import type { LucideIcon } from 'lucide-react';
import { CircleCheck, CircleX, Clock, Wrench, Zap, MoveVertical, MoveHorizontal } from 'lucide-react';
import { enumLabel, formatNumber, formatPlate, formatSince } from '../../utils/format';
import { cx } from './cx';
import { Icon } from './Icon';
import { Button } from './Button';
import { StatusChip, SiteTag } from './StatusChip';

export type SlotStatus = 'VACANT' | 'OCCUPIED' | 'RESERVED' | 'MAINTENANCE';

const BAND_ICON: Record<SlotStatus, LucideIcon> = { VACANT: CircleCheck, OCCUPIED: CircleX, RESERVED: Clock, MAINTENANCE: Wrench };

/** "2.5 m" or "—" (missing values are never invented). */
export function formatMetres(value: number | null | undefined): string {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? `${formatNumber(value, 1)} m` : '—';
}

/** "1.8 × 5.0 m" for the list's Size column at 768–1279px (NFR-5); "—" for a missing side. */
export function sizeText(h: number | null | undefined, l: number | null | undefined): string {
  const f = (v: number | null | undefined) => (typeof v === 'number' && Number.isFinite(v) && v > 0 ? formatNumber(v, 1) : '—');
  return `${f(h)} × ${f(l)} m`;
}

export interface SlotCardProps {
  code: string;
  status: SlotStatus;
  /** The line that explains the code: "Puzzle 03 · Pallet 1" / "Ground · Bay 14". */
  decode?: string;
  /** Slot type for the chip, e.g. "SUV" / "TWO_WHEELER" (shown as words). */
  slotType?: string;
  ev?: boolean;
  /** Occupied only. */
  plate?: string | null;
  /** ISO time of the open entry log: today → "In since 09:14", earlier → "In since 3 Oct 2026, 09:14"; missing → "In since —". */
  inSince?: string | null;
  heightM?: number | null;
  lengthM?: number | null;
  /** Puzzle view: "Level 3" on the band. */
  level?: number | null;
  /** Pallet variant inside a puzzle stacker card. */
  compact?: boolean;
  /** Open the slot details. */
  onOpen?: () => void;
  /** Shows the outlined "Mark exit" (write-guarded) on an occupied slot. */
  onMarkExit?: () => void;
  selected?: boolean;
  /** Site code, shown in All sites mode so every slot shows its site (AC-24). */
  siteCode?: string;
  className?: string;
}

/** Live parking slot card (option B · status band, approved 2026-10-03). */
export const SlotCard: React.FC<SlotCardProps> = ({
  code, status, decode, slotType, ev, plate, inSince, heightM, lengthM, level, compact, onOpen, onMarkExit, selected, siteCode, className,
}) => {
  const occupied = status === 'OCCUPIED';
  const statusWord = enumLabel(status);
  const body = (
    <>
      <span className={cx('pf-slot-band', `pf-slot-band--${status.toLowerCase()}`)}>
        <Icon icon={BAND_ICON[status]} size={16} />
        <span>{statusWord}</span>
        {level ? <span className="pf-slot-band-end">Level {level}</span> : null}
      </span>
      <span className="pf-slot-body">
        <span className="pf-slot-head">
          <span className="pf-slot-code">{code}</span>
          {siteCode && <SiteTag code={siteCode} />}
          {slotType && (
            <span className="pf-chip pf-chip--neutral">
              {ev && <Zap aria-hidden="true" strokeWidth={2} />}
              {enumLabel(slotType)}
              {ev && <span className="pf-sr-only">, EV charging</span>}
            </span>
          )}
        </span>
        {decode && <span className="pf-slot-decode">{decode}</span>}
        {occupied ? (
          <span className="pf-stack">
            <span className="pf-slot-plate">{formatPlate(plate)}</span>
            <span className="pf-slot-since">In since {inSince ? formatSince(inSince) : '—'}</span>
          </span>
        ) : null}
        <span className="pf-slot-dims">
          <span className="pf-slot-dim">
            <Icon icon={MoveVertical} size={16} />
            <span>
              <small>Height</small>
              <b>{formatMetres(heightM)}</b>
            </span>
          </span>
          <span className="pf-slot-dim">
            <Icon icon={MoveHorizontal} size={16} />
            <span>
              <small>Length</small>
              <b>{formatMetres(lengthM)}</b>
            </span>
          </span>
        </span>
      </span>
    </>
  );
  return (
    <article className={cx('pf-slot', compact && 'pf-slot--compact', className)} aria-label={`Slot ${code}, ${statusWord}${occupied && plate ? `, ${formatPlate(plate)}` : ''}`}>
      {onOpen ? (
        <button type="button" className="pf-slot-hit" onClick={onOpen} aria-pressed={selected || undefined}>
          {body}
        </button>
      ) : (
        <div className="pf-slot-hit">{body}</div>
      )}
      <div className="pf-slot-foot">
        {occupied && onMarkExit && (
          <Button variant="exit" size="sm" block guard onClick={onMarkExit} aria-label={`Mark exit for slot ${code}`}>
            Mark exit
          </Button>
        )}
      </div>
    </article>
  );
};

export interface SlotRowProps extends Omit<SlotCardProps, 'compact' | 'level'> {}

/** Live parking list view (D): Status · Slot · Type · Height · Length · Vehicle · Mark exit (Height and Length merge into Size at 768–1279px). Use inside a pf-table. */
export const SlotRow: React.FC<SlotRowProps> = ({ code, status, decode, slotType, ev, plate, inSince, heightM, lengthM, onOpen, onMarkExit, siteCode }) => {
  const occupied = status === 'OCCUPIED';
  return (
    <tr
      className={cx('pf-slot-row', !onOpen && 'pf-row-static')}
      tabIndex={onOpen ? 0 : undefined}
      onClick={onOpen}
      onKeyDown={
        onOpen
          ? (e) => {
              if ((e.key === 'Enter' || e.key === ' ') && e.target === e.currentTarget) {
                e.preventDefault();
                onOpen();
              }
            }
          : undefined
      }
    >
      <td>
        <StatusChip status={status} />
      </td>
      <td>
        <span className="pf-stack pf-stack--tight">
          <span className="pf-slot-code">
            {code} {siteCode && <SiteTag code={siteCode} />}
          </span>
          {decode && <span className="pf-slot-since">{decode}</span>}
        </span>
      </td>
      <td className="is-secondary">
        {slotType ? enumLabel(slotType) : '—'}
        {ev && ' · EV'}
      </td>
      <td className="is-num pf-col-wide">{formatMetres(heightM)}</td>
      <td className="is-num pf-col-wide">{formatMetres(lengthM)}</td>
      <td className="is-num pf-col-mid">{sizeText(heightM, lengthM)}</td>
      <td>
        {occupied ? (
          <span className="pf-stack">
            <span className="pf-plate">{formatPlate(plate)}</span>
            <span className="pf-slot-since">In since {inSince ? formatSince(inSince) : '—'}</span>
          </span>
        ) : (
          <span className="pf-slot-since-none">—</span>
        )}
      </td>
      <td onClick={(e) => e.stopPropagation()}>
        {occupied && onMarkExit && (
          <Button variant="exit" size="sm" guard onClick={onMarkExit} aria-label={`Mark exit for slot ${code}`}>
            Mark exit
          </Button>
        )}
      </td>
    </tr>
  );
};
