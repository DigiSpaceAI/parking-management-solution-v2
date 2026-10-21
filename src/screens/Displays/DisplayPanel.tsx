import React, { useEffect, useState } from 'react';
import { Copy } from 'lucide-react';
import { Button, SidePanel, StatusChip, useNow } from '../../design-system/components';
import { useGuard } from '../../design-system/guard';
import { formatAgo, formatDateTime, formatNumber } from '../../utils/format';
import type { DisplayFeed } from '../../display/types';
import { displayState, displaysApi, hoursText, type DisplayRow } from './api';
import { TvPreview } from './TvPreview';
import { hasOverride, overrideLines, seenText, STATE_CHIP } from './status';

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
  /** 03 v1.2 overrides (UX C10). */
  onMessage: (d: DisplayRow) => void;
  onForceFull: (d: DisplayRow) => void;
  onClear: (d: DisplayRow) => void;
  clearing: string | null;
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
export const DisplayPanel: React.FC<DisplayPanelProps> = ({ display, canEdit, onClose, onEdit, onDuplicate, onSetUp, onReplace, onSwitchOff, onMessage, onForceFull, onClear, clearing }) => {
  const now = useNow(5000);
  const guard = useGuard()('Force Parking full');
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
  const override = !off && hasOverride(display.override) ? display.override : null;
  const forced = !!override?.forcedFull;
  // "Really vacant now" (C10): the preview feed keeps the real slots and counts under forced full (03 v1.2).
  const reallyVacant = feed && feed.state === 'OPEN' ? feed.counts.free : display.freeNow;

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
        {override && (
          <div className="pf-override-box" role="status">
            <span className="pf-stack pf-stack--tight">
              <b>{override.forcedFull && !override.message ? 'Override active: forced Parking full' : override.message && !override.forcedFull ? `Override active: ${override.message.mode === 'FULL' ? 'full-screen' : 'banner'} message` : 'Override active: message and forced Parking full'}</b>
              {override.message && <span className="pf-override-text">“{override.message.text}”</span>}
              {overrideLines(override, now).map((l) => (
                <span key={l} className="pf-cell-sub">
                  {l}
                </span>
              ))}
            </span>
            <Button size="sm" guard disabled={!canEdit} loading={clearing === display.id} loadingLabel="Clearing…" aria-label={`Clear override on ${display.name}`} onClick={() => onClear(display)}>
              Clear
            </Button>
          </div>
        )}
        {!off && (
          <div className="pf-switch-row">
            <span className="pf-stack pf-stack--tight">
              <b id="pf-ff-label">Force Parking full</b>
              <span className="pf-cell-sub" id="pf-ff-help">
                Use when a level is blocked or the gate is stopped.
              </span>
            </span>
            <button
              type="button"
              role="switch"
              className="pf-switch"
              aria-checked={forced}
              aria-labelledby="pf-ff-label"
              aria-describedby="pf-ff-help"
              {...guard}
              disabled={!canEdit || guard.disabled}
              onClick={() => (forced ? onClear({ ...display, override: { hidden: 0, pinned: 0, forcedFull: override!.forcedFull } }) : onForceFull(display))}
            >
              <span className="pf-switch-knob" aria-hidden="true" />
            </button>
          </div>
        )}
        {!off && (
          <section className="pf-stack pf-stack--tight" aria-labelledby="pf-dp-now">
            <div className="pf-card-head">
              <h3 className="pf-modal-section-title" id="pf-dp-now">
                What the screen shows now
              </h3>
              <span className="pf-updated">{previewAt ? `Updated ${formatAgo(previewAt, now)}` : 'Loading…'}</span>
            </div>
            <TvPreview feed={feed} label={`Live preview of ${display.name}`} badge={override ? <span className="pf-override-badge">Override active</span> : undefined} />
            {canEdit && (
              <button type="button" className="pf-link pf-push-start" onClick={() => onMessage(display)}>
                Show a message on this display…
              </button>
            )}
          </section>
        )}
        <dl className="pf-dl pf-dl--boxed">
          {forced && (
            <>
              <dt>Really vacant now</dt>
              <dd>
                {formatNumber(reallyVacant)} {reallyVacant === 1 ? 'slot' : 'slots'} (hidden on this screen)
              </dd>
            </>
          )}
          <dt>Shows</dt>
          <dd>{display.slotCount === 0 && !off ? `No slots left${display.missingSlots ? ` · ${formatNumber(display.missingSlots)} slots were deleted` : ''}` : display.selectionSummary}</dd>
          {!forced && (
            <>
              <dt>Free now</dt>
              <dd>{off ? '—' : freeText(feed, display)}</dd>
            </>
          )}
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
