import React from 'react';
import { Button, Card, EmptyState } from '../../design-system/components';
import { formatNumber } from '../../utils/format';
import type { LiveSlot } from '../../utils/slots';
import { palletTitle, plateTail, statusInitial, tileAriaLabel, tileNumber, type ZonePallet } from '../../utils/liveZones';

export interface ZonesViewProps {
  pallets: ZonePallet<LiveSlot>[];
  /** The 2-wheeler slots of this level have no zone yet: say where to set one (AC-12). */
  allUnzoned: boolean;
  onOpen: (slot: LiveSlot) => void;
  onClearFilters: () => void;
}

/**
 * 2-wheeler Zones view (UX D): one pallet per zone under its level heading. Header "B1 · Zone Z1", "12 free / 40" and a thin bar;
 * tiles show the slot number only (full name on hover, focus and in the drawer), a colour and an initial V / O / R / M,
 * and the last 4 characters of the plate when occupied. A tile opens the slot drawer.
 */
export const ZonesView: React.FC<ZonesViewProps> = ({ pallets, allUnzoned, onOpen, onClearFilters }) => {
  if (pallets.length === 0) {
    return (
      <Card>
        <EmptyState title="No slots match these filters" text="Try another level or status, or clear the search." actions={<Button onClick={onClearFilters}>Clear filters</Button>} />
      </Card>
    );
  }
  const levels = pallets.reduce<string[]>((acc, p) => (acc.indexOf(p.level) === -1 ? [...acc, p.level] : acc), []);
  return (
    <div className="pf-stack">
      {allUnzoned && <p className="pf-card-note" role="status">Zones are not set for these slots. Set a zone in Inventory.</p>}
      {levels.map((level) => (
        <section key={level} className="pf-stack" aria-label={`Level ${level}`}>
          <h3 className="pf-zones-level">{level}</h3>
          <div className="pf-zone-pallets">
            {pallets.filter((p) => p.level === level).map((p) => {
              const notFree = p.total - p.free;
              const pct = p.total > 0 ? Math.max(0, Math.min(100, (notFree / p.total) * 100)) : 0;
              return (
                <Card key={p.id} className="pf-zone-pallet">
                  <div className="pf-zone-head">
                    <h4>{palletTitle(p)}</h4>
                    <span className="pf-card-note">{formatNumber(p.free)} free / {formatNumber(p.total)}</span>
                  </div>
                  <div className="pf-occ-track" role="meter" aria-valuemin={0} aria-valuemax={p.total} aria-valuenow={notFree} aria-valuetext={`${formatNumber(p.free)} free of ${formatNumber(p.total)}`} aria-label={`${palletTitle(p)}, not free`}>
                    <span className="pf-occ-fill" style={{ '--pf-occ': `${pct}%` } as React.CSSProperties} />
                  </div>
                  <div className="pf-tiles pf-ztiles">
                    {p.slots.map((s) => (
                      <button
                        key={s.id}
                        type="button"
                        className={`pf-tile pf-ztile pf-tile--${s.status.toLowerCase()}`}
                        title={s.slotNumber}
                        aria-label={tileAriaLabel(s)}
                        onClick={() => onOpen(s)}
                      >
                        <span>{tileNumber(s)} <b aria-hidden="true">{statusInitial(s.status)}</b></span>
                        {s.status === 'OCCUPIED' && s.currentVehicle && <small>{plateTail(s.currentVehicle)}</small>}
                      </button>
                    ))}
                  </div>
                </Card>
              );
            })}
          </div>
        </section>
      ))}
    </div>
  );
};
