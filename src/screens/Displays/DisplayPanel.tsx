import React, { useEffect, useState } from 'react';
import { Copy } from 'lucide-react';
import { Button, SidePanel, StatusChip, useNow } from '../../design-system/components';
import { formatAgo, formatDateTime, formatNumber } from '../../utils/format';
import type { DisplayFeed } from '../../display/types';
import { displayState, displaysApi, hoursText, type DisplayRow } from './api';
import { TvPreview } from './TvPreview';
import { seenText, STATE_CHIP } from './status';

/** The TV polls every 3 s; the panel's preview follows at the same pace while it is open. */
const PREVIEW_MS = 3000;

export interface DisplayPanelProps {
  display: DisplayRow | null;
  canEdit: boolean;
  onClose: () => void;
  onEdit: (d: DisplayRow) => void;
  onDuplicate: (d: DisplayRow) => void;
  onSetUp: (d: DisplayRow) => void;
  onReplace: (d: DisplayRow) => void;
  onSwitchOff: (d: DisplayRow) => void;
}

/** "7 (B1 4, B2 3)" from the preview's counts. */
function freeText(feed: DisplayFeed | null, d: DisplayRow): string {
  if (!feed || feed.state !== 'OPEN') return d.slotCount ? formatNumber(d.freeNow) : '—';
  const groups = feed.counts.groups.map((g) => `${g.label.replace(/^Basement /, '')} ${formatNumber(g.free)}`);
  return groups.length > 1 ? `${formatNumber(feed.counts.free)} (${groups.join(', ')})` : formatNumber(feed.counts.free);
}

/**
 * Display panel (UX C6; AC-17, AC-21): status and last seen, "What the screen shows now" (the
 * live preview from GET /displays/:id/preview, which doesn't move last seen), the settings, the
 * paired screen, and Edit · Set up screen · Replace link · Switch off. A switched-off display can
 * only be duplicated (03 gap 6).
 */
export const DisplayPanel: React.FC<DisplayPanelProps> = ({ display, canEdit, onClose, onEdit, onDuplicate, onSetUp, onReplace, onSwitchOff }) => {
  const now = useNow(5000);
  const [feed, setFeed] = useState<DisplayFeed | null>(null);
  const [previewAt, setPreviewAt] = useState<number | null>(null);
  const id = display?.id ?? null;
  const off = display?.status === 'SWITCHED_OFF';

  useEffect(() => {
    setFeed(null);
    setPreviewAt(null);
    if (!id || off) return;
    let live = true;
    let timer: number | undefined;
    const load = async () => {
      try {
        const r = await displaysApi.preview(id);
        if (!live) return;
        if (r.ok && r.data && typeof r.data.v === 'string') {
          setFeed(r.data);
          setPreviewAt(Date.now());
        }
      } catch {
        /* the preview goes stale like a TV would */
      }
      if (live) timer = window.setTimeout(() => void load(), PREVIEW_MS);
    };
    void load();
    return () => {
      live = false;
      window.clearTimeout(timer);
    };
  }, [id, off]);

  if (!display) return <SidePanel open={false} onClose={onClose} title="" />;
  const chip = STATE_CHIP[displayState(display)];

  return (
    <SidePanel
      open
      onClose={onClose}
      title={display.name}
      subtitle={display.location || undefined}
      className="pf-panel--wide"
      footer={
        off ? (
          <Button icon={Copy} guard disabled={!canEdit} onClick={() => onDuplicate(display)}>
            Duplicate as a new display
          </Button>
        ) : (
          <>
            <Button guard disabled={!canEdit} onClick={() => onEdit(display)}>
              Edit
            </Button>
            <Button guard disabled={!canEdit} onClick={() => onSetUp(display)}>
              Set up screen
            </Button>
            <span className="pf-grow" />
            <Button variant="ghost" guard disabled={!canEdit} onClick={() => onReplace(display)}>
              Replace link
            </Button>
            <Button variant="destructive" guard disabled={!canEdit} onClick={() => onSwitchOff(display)}>
              Switch off
            </Button>
          </>
        )
      }
    >
      <div className="pf-stack">
        <div className="pf-row-inline">
          <StatusChip status={displayState(display)} label={chip.label} tone={chip.tone} />
          <span className="pf-cell-sub">{seenText(display, now)}</span>
        </div>
        {!off && (
          <section className="pf-stack pf-stack--tight" aria-labelledby="pf-dp-now">
            <div className="pf-card-head">
              <h3 className="pf-modal-section-title" id="pf-dp-now">
                What the screen shows now
              </h3>
              <span className="pf-updated">{previewAt ? `Updated ${formatAgo(previewAt, now)}` : 'Loading…'}</span>
            </div>
            <TvPreview feed={feed} label={`Live preview of ${display.name}`} />
          </section>
        )}
        <dl className="pf-dl pf-dl--boxed">
          <dt>Shows</dt>
          <dd>{display.slotCount === 0 && !off ? `No slots left${display.missingSlots ? ` · ${formatNumber(display.missingSlots)} slots were deleted` : ''}` : display.selectionSummary}</dd>
          <dt>Free now</dt>
          <dd>{off ? '—' : freeText(feed, display)}</dd>
          <dt>Pages</dt>
          <dd>Every {display.pageSeconds} s, when more than 12 are free</dd>
          <dt>Display hours</dt>
          <dd>{display.hours.mode === 'DAILY' ? `${hoursText(display.hours)} every day, India time` : 'Always on'}</dd>
          <dt>Screen</dt>
          <dd>
            {display.pairedAt
              ? `Paired ${formatDateTime(display.pairedAt)}${display.screenAgent ? ` · browser: ${display.screenAgent}` : ''}`
              : display.setUp
                ? 'Opened with the display’s link'
                : 'Not set up yet'}
          </dd>
        </dl>
      </div>
    </SidePanel>
  );
};
