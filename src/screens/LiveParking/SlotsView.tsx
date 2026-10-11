import React from 'react';
import { Card, EmptyState, Pagination, SegmentedControl, SlotCard, SlotRow, Button } from '../../design-system/components';
import type { SlotStatus } from '../../design-system/components';
import { decodeSlot, heightOf, type LiveSlot } from '../../utils/slots';

export type Layout = 'cards' | 'list';
export const SLOT_PAGE_SIZES = [12, 20, 36, 60];

export interface SlotsViewProps {
  slots: LiveSlot[]; // already filtered and sorted
  page: number;
  pageSize: number;
  onPage: (p: number) => void;
  onPageSize: (n: number) => void;
  layout: Layout;
  onLayout: (l: Layout) => void;
  onOpen: (slot: LiveSlot) => void;
  onMarkExit: (slot: LiveSlot) => void;
  onClearFilters: () => void;
  /** All sites mode: the site code for each slot (AC-24). */
  siteCodeFor?: (siteId: string | undefined) => string;
}

/** Paged slot cards (UX S3 card B) or the list (D): one pagination bar, 12/20/36/60 per page (AC-14). */
export const SlotsView: React.FC<SlotsViewProps> = ({
  slots, page, pageSize, onPage, onPageSize, layout, onLayout, onOpen, onMarkExit, onClearFilters, siteCodeFor,
}) => {
  const pages = Math.max(1, Math.ceil(slots.length / pageSize));
  const current = Math.min(page, pages);
  const shown = slots.slice((current - 1) * pageSize, current * pageSize);
  const common = (s: LiveSlot) => ({
    code: s.slotNumber,
    status: s.status as SlotStatus,
    decode: decodeSlot(s),
    slotType: s.slotType,
    ev: s.slotType === 'EV',
    plate: s.currentVehicle,
    inSince: s.inSince,
    heightM: heightOf(s),
    lengthM: s.lengthM,
    siteCode: siteCodeFor ? siteCodeFor(s.siteId) : undefined,
    onOpen: () => onOpen(s),
    onMarkExit: () => onMarkExit(s),
  });

  return (
    <Card
      title="Slots"
      actions={
        <SegmentedControl
          idBase="lp-layout"
          label="Layout"
          hasPanels={false}
          value={layout}
          onChange={(id) => onLayout(id as Layout)}
          options={[
            { id: 'cards', label: 'Cards' },
            { id: 'list', label: 'List' },
          ]}
        />
      }
    >
      <div className="pf-stack">
        <p className="pf-card-note">Vacant first. Click a slot to see details, record an entry or exit, or change its status.</p>
        {slots.length === 0 ? (
          <EmptyState
            title="No slots match these filters"
            text="Try another level, status or slot type, or clear the search."
            actions={<Button onClick={onClearFilters}>Clear filters</Button>}
          />
        ) : layout === 'cards' ? (
          <div className="pf-slot-grid">
            {shown.map((s) => (
              <SlotCard key={s.id} {...common(s)} />
            ))}
          </div>
        ) : (
          <>
            {/* The list becomes cards below 768px (UX 10-08 decision). */}
            <div className="pf-slot-grid pf-only-phone">
              {shown.map((s) => (
                <SlotCard key={s.id} {...common(s)} />
              ))}
            </div>
            <div className="pf-table-wrap pf-hide-phone">
              <table className="pf-table pf-slot-table">
                <caption className="pf-sr-only">Parking slots</caption>
                <thead>
                  <tr>
                    <th scope="col">Status</th>
                    <th scope="col">Slot</th>
                    <th scope="col">Type</th>
                    <th scope="col" className="is-num pf-col-wide">
                      Height
                    </th>
                    <th scope="col" className="is-num pf-col-wide">
                      Length
                    </th>
                    <th scope="col" className="is-num pf-col-mid">
                      Size (H × L)
                    </th>
                    <th scope="col">Vehicle</th>
                    <th scope="col">
                      <span className="pf-sr-only">Action</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {shown.map((s) => (
                    <SlotRow key={s.id} {...common(s)} />
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
        {slots.length > 0 && (
          <Pagination page={current} pageSize={pageSize} total={slots.length} onPage={onPage} pageSizes={SLOT_PAGE_SIZES} onPageSize={onPageSize} noun="slots" />
        )}
      </div>
    </Card>
  );
};
