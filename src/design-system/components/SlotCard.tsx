import React from 'react';
import type { LucideIcon } from 'lucide-react';
import { CircleCheck, CircleX, Clock, Wrench, Zap, MoveVertical, MoveHorizontal } from 'lucide-react';
import { enumLabel, formatNumber, formatPlate, formatTime } from '../../utils/format';
import { cx } from './cx';
import { Icon } from './Icon';
import { Button } from './Button';
import { StatusChip } from './StatusChip';

export type SlotStatus = 'VACANT' | 'OCCUPIED' | 'RESERVED' | 'MAINTENANCE';

const BAND_ICON: Record<SlotStatus, LucideIcon> = { VACANT: CircleCheck, OCCUPIED: CircleX, RESERVED: Clock, MAINTENANCE: Wrench };

/** "2.5 m" or "—" (missing values are never invented). */
export function formatMetres(value: number | null | undefined): string {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? `${formatNumber(value, 1)} m` : '—';
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
  /** ISO time of the open entry log; missing → "In since —". */
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
  className?: string;
}

/** Live parking slot card (option B · status band, approved 2026-10-03). */
export const SlotCard: React.FC<SlotCardProps> = ({
  code, status, decode, slotType, ev, plate, inSince, heightM, lengthM, level, compact, onOpen, onMarkExit, selected, className,
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
            <span className="pf-slot-since">In since {inSince ? formatTime(inSince) : '—'}</span>
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

export interface SlotRowProps extends Omit<SlotCardProps, 'compact' | 'decode' | 'level'> {}

/** Live parking list view (D): Status · Slot · Type · Height · Length · Vehicle · Mark exit. Use inside a pf-table. */
export const SlotRow: React.FC<SlotRowProps> = ({ code, status, slotType, ev, plate, inSince, heightM, lengthM, onOpen, onMarkExit }) => {
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
        <span className="pf-slot-code">{code}</span>
      </td>
      <td className="is-secondary">
        {slotType ? enumLabel(slotType) : '—'}
        {ev && ' · EV'}
      </td>
      <td className="is-num">{formatMetres(heightM)}</td>
      <td className="is-num">{formatMetres(lengthM)}</td>
      <td>
        {occupied ? (
          <span className="pf-stack">
            <span className="pf-plate">{formatPlate(plate)}</span>
            <span className="pf-slot-since">In since {inSince ? formatTime(inSince) : '—'}</span>
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
