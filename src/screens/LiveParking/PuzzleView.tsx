import React from 'react';
import { Button, Card, EmptyState, Pagination, SiteTag, SlotCard, SlotCode, type SlotStatus } from '../../design-system/components';
import { formatNumber } from '../../utils/format';
import { compareTopFirst, decodeSlot, heightOf, palletLevelOf, type LiveSlot } from '../../utils/slots';

export interface PuzzleModule {
  id: string;
  basement: string;
  siteId?: string;
  pallets: LiveSlot[];
}

export const STACKERS_PER_PAGE = 6;

export interface PuzzleViewProps {
  modules: PuzzleModule[];
  page: number;
  onPage: (p: number) => void;
  onOpen: (slot: LiveSlot) => void;
  onMarkExit: (slot: LiveSlot) => void;
  onClearFilters: () => void;
  siteCodeFor?: (siteId: string | undefined) => string;
}

/**
 * Puzzle wise status (UX S3): one card per stacker, its pallets as compact slot cards,
 * top level first (palletLevel, or the -S<n> rule); 6 stackers per page, 2 per row.
 * The PLC line is honest: no controller feed exists, so "— not connected" (AC-04, AC-06).
 */
export const PuzzleView: React.FC<PuzzleViewProps> = ({ modules, page, onPage, onOpen, onMarkExit, onClearFilters, siteCodeFor }) => {
  if (modules.length === 0) {
    return (
      <Card>
        <EmptyState
          title="No puzzle stackers match these filters"
          text="Ground and driveway slots are flat, so they don't appear here."
          actions={<Button onClick={onClearFilters}>Clear filters</Button>}
        />
      </Card>
    );
  }
  const pages = Math.max(1, Math.ceil(modules.length / STACKERS_PER_PAGE));
  const current = Math.min(page, pages);
  const shown = modules.slice((current - 1) * STACKERS_PER_PAGE, current * STACKERS_PER_PAGE);
  return (
    <div className="pf-stack">
      <div className="pf-puzzles">
        {shown.map((m) => {
          const pallets = [...m.pallets].sort(compareTopFirst);
          const free = pallets.filter((p) => p.status === 'VACANT').length;
          const occ = pallets.filter((p) => p.status === 'OCCUPIED').length;
          return (
            <Card key={`${m.siteId ?? ''}|${m.id}`} className="pf-puzzle">
              <div className="pf-puzzle-head">
                <div className="pf-stack pf-stack--tight">
                  <h3>
                    Puzzle stacker <SlotCode code={m.id} />
                    <SiteTag code={m.basement} />
                    {siteCodeFor && <SiteTag code={siteCodeFor(m.siteId)} />}
                  </h3>
                  <span className="pf-card-note">{pallets.length} pallets · top level first</span>
                </div>
                <p className="pf-puzzle-counts">
                  <b>{formatNumber(free)} free</b>
                  <br />
                  {formatNumber(occ)} occupied
                </p>
              </div>
              <div className="pf-pallets">
                {pallets.map((p) => (
                  <SlotCard
                    key={p.id}
                    compact
                    code={p.slotNumber}
                    status={p.status as SlotStatus}
                    decode={decodeSlot(p)}
                    level={palletLevelOf(p)}
                    slotType={p.slotType}
                    ev={p.slotType === 'EV'}
                    plate={p.currentVehicle}
                    inSince={p.inSince}
                    heightM={heightOf(p)}
                    lengthM={p.lengthM}
                    onOpen={() => onOpen(p)}
                    onMarkExit={() => onMarkExit(p)}
                  />
                ))}
              </div>
              <div className="pf-plc">
                <span>Stacker controller (PLC)</span>
                <span>— not connected</span>
              </div>
            </Card>
          );
        })}
      </div>
      <Card>
        <Pagination page={current} pageSize={STACKERS_PER_PAGE} total={modules.length} onPage={onPage} noun="puzzle stackers" />
      </Card>
    </div>
  );
};
