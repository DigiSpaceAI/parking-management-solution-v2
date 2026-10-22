import React, { useMemo, useState } from 'react';
import { Button, Pagination, SegmentedControl, SlotCode, StatusChip, Table, TextField, type Column } from '../../design-system/components';
import { formatNumber } from '../../utils/format';
import { decodeSlot, type LiveSlot } from '../../utils/slots';

export interface SlotRules {
  hidden: string[];
  pinned: string[];
}

/** 03 v1.2: at most 200 of each. */
export const MAX_RULES = 200;
const PAGE = 8;

export interface SlotRulesSectionProps {
  /** The slots in the display's selection (before hiding). */
  slots: LiveSlot[];
  rules: SlotRules;
  onChange: (next: SlotRules) => void;
}

type Show = 'all' | 'pinned' | 'hidden';

/**
 * Slots on this display (UX C11; US-17, AC-26, AC-27): hide or pin single slots on this display
 * only. Hidden = never shown and not counted; pinned = page 1, first within its status group;
 * vacant still first. A slot is never both. The rules are saved with the display (POST
 * /displays/:id/slot-rules) and reach the screen within 5 s.
 */
export const SlotRulesSection: React.FC<SlotRulesSectionProps> = ({ slots, rules, onChange }) => {
  const [find, setFind] = useState('');
  const [show, setShow] = useState<Show>('all');
  const [page, setPage] = useState(1);
  const hidden = useMemo(() => new Set(rules.hidden), [rules.hidden]);
  const pinned = useMemo(() => new Set(rules.pinned), [rules.pinned]);
  const ids = useMemo(() => new Set(slots.map((s) => s.id)), [slots]);
  // Only rules for slots still in the selection count (deleted or deselected slots drop out on save).
  const pinCount = rules.pinned.filter((id) => ids.has(id)).length;
  const hideCount = rules.hidden.filter((id) => ids.has(id)).length;

  const needle = find.trim().toUpperCase();
  const rows = useMemo(
    () =>
      slots
        .filter((s) => (show === 'pinned' ? pinned.has(s.id) : show === 'hidden' ? hidden.has(s.id) : true))
        .filter((s) => !needle || s.slotNumber.toUpperCase().includes(needle))
        .sort((a, b) => a.slotNumber.localeCompare(b.slotNumber, undefined, { numeric: true })),
    [slots, show, pinned, hidden, needle]
  );
  const pages = Math.max(1, Math.ceil(rows.length / PAGE));
  const current = Math.min(page, pages);
  const pageRows = rows.slice((current - 1) * PAGE, current * PAGE);

  const set = (id: string, kind: 'pin' | 'hide') => {
    const isOn = kind === 'pin' ? pinned.has(id) : hidden.has(id);
    const nextPinned = rules.pinned.filter((x) => x !== id);
    const nextHidden = rules.hidden.filter((x) => x !== id);
    if (!isOn) (kind === 'pin' ? nextPinned : nextHidden).push(id); // turning one on turns the other off
    if (nextPinned.length > MAX_RULES || nextHidden.length > MAX_RULES) return;
    onChange({ pinned: nextPinned, hidden: nextHidden });
  };

  const state = (s: LiveSlot) => (pinned.has(s.id) ? 'Pinned · page 1' : hidden.has(s.id) ? 'Hidden' : 'Shown');
  const columns: Column<LiveSlot>[] = [
    {
      key: 'slot',
      header: 'Slot',
      render: (s) => (
        <span className="pf-stack pf-stack--tight">
          <SlotCode code={s.slotNumber} />
          <span className="pf-cell-sub">{decodeSlot(s)}</span>
        </span>
      ),
    },
    { key: 'status', header: 'Status now', render: (s) => <StatusChip status={s.status} /> },
    {
      key: 'state',
      header: 'On this display',
      render: (s) => <span className={pinned.has(s.id) ? 'pf-rule-pinned' : hidden.has(s.id) ? 'pf-text-muted' : undefined}>{state(s)}</span>,
    },
    {
      key: 'actions',
      header: 'Pin or hide',
      hideInCard: false,
      render: (s) => (
        <span className="pf-row-inline pf-rule-actions">
          <Button size="sm" variant="ghost" aria-pressed={pinned.has(s.id)} aria-label={`${pinned.has(s.id) ? 'Unpin' : 'Pin'} ${s.slotNumber}`} onClick={() => set(s.id, 'pin')}>
            {pinned.has(s.id) ? 'Unpin' : 'Pin'}
          </Button>
          <Button size="sm" variant="ghost" aria-pressed={hidden.has(s.id)} aria-label={`${hidden.has(s.id) ? 'Show' : 'Hide'} ${s.slotNumber}`} onClick={() => set(s.id, 'hide')}>
            {hidden.has(s.id) ? 'Show' : 'Hide'}
          </Button>
        </span>
      ),
    },
  ];

  return (
    <section className="pf-stack pf-slot-rules" aria-labelledby="pf-rules-title">
      <div className="pf-stack pf-stack--tight">
        <h2 className="pf-card-title" id="pf-rules-title">
          Slots on this display
        </h2>
        <p className="pf-text-secondary">
          Hide or pin slots on <b>this display only</b>. Their status in Live parking and on other displays doesn’t change.
        </p>
      </div>
      {slots.length === 0 ? (
        <p className="pf-card-note">Choose what the display shows first; its slots are listed here.</p>
      ) : (
        <>
          <div className="pf-form-row pf-form-row--end">
            <TextField label="Find a slot" mono placeholder="e.g. B1-014" value={find} onChange={(e) => { setFind(e.target.value); setPage(1); }} />
            <SegmentedControl
              idBase="pf-rules"
              label="Show"
              hasPanels={false}
              value={show}
              onChange={(v) => { setShow(v as Show); setPage(1); }}
              options={[
                { id: 'all', label: 'All', count: slots.length },
                { id: 'pinned', label: 'Pinned', count: pinCount },
                { id: 'hidden', label: 'Hidden', count: hideCount },
              ]}
            />
          </div>
          <Table caption="Slots on this display" columns={columns} rows={pageRows} rowKey={(s) => s.id} empty={<p className="pf-card-note">No slots match.</p>} />
          {rows.length > PAGE && <Pagination page={current} pageSize={PAGE} total={rows.length} onPage={setPage} noun="slots" />}
          <ul className="pf-list pf-text-secondary">
            <li>
              <b>Hidden</b> slots never appear on this display and aren’t counted in its free numbers.
            </li>
            <li>
              <b>Pinned</b> slots always show on page 1, first within their status group: a pinned vacant slot comes first among vacant slots, a pinned occupied slot first among occupied ones.
            </li>
            <li>Vacant still comes first: a pinned occupied slot never takes the place of a vacant slot.</li>
          </ul>
          <p>
            <b>
              {formatNumber(pinCount)} pinned · {formatNumber(hideCount)} hidden
            </b>{' '}
            · {formatNumber(slots.length)} slots in the selection, {formatNumber(slots.length - hideCount)} can appear
          </p>
        </>
      )}
    </section>
  );
};
