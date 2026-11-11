import React, { useEffect, useMemo, useState } from 'react';
import { ArrowLeft, X } from 'lucide-react';
import type { ParkingType } from '../../types';
import { Banner, Button, Checkbox, ErrorState, PageHeader, Radio, SegmentedControl, Select, Skeleton, SlotCode, TabPanel, TextField } from '../../design-system/components';
import { formatNumber } from '../../utils/format';
import type { LiveSlot } from '../../utils/slots';
import { COPY_SAVE_ERROR, saveErrorMessage, useSiteContext } from '../../utils/withSite';
import { useAutoRefresh } from '../../utils/useAutoRefresh';
import type { DisplayHours } from '../../display/types';
import { displaysApi, type Level, type DisplayInput, type DisplayOptions, type DisplayRow, type DisplaySelection, type VehicleClass } from './api';
import { areaLabel, draftFeed, isEmptySelection, levelLabel, selectedSlots } from './draft';
import { TvPreview } from './TvPreview';
import { SlotRulesSection, type SlotRules } from './SlotRules';
import { LayoutPicker, SUMMARY_CARDS_MAX_LEVELS, tooManyForCards } from './LayoutPicker';
import { countSlots } from '../../utils/slotCounts';
import type { DisplayLayout } from './api';

export interface DisplayEditorProps {
  /** Edit this display; null = create. */
  display: DisplayRow | null;
  /** Create a copy of this display's settings (a switched-off display, gap 6). */
  from: DisplayRow | null;
  /** The site's other displays ("copy the selection from another display"). */
  others: DisplayRow[];
  onCancel: () => void;
  /**
   * `link` only on create: the display's own link, shown once (C5). `warning`: the display was
   * saved but its hide/pin rules weren't (US-17), so the caller still shows the link.
   */
  onSaved: (display: DisplayRow, link: string | null, warning?: string) => void;
}

type PickBy = 'levels' | 'zones' | 'slots';
const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;
const EMPTY_SELECTION: DisplaySelection = { levels: [], areas: [], slotIds: [], vehicleClass: 'ALL' };

/** "B1 · Puzzles · 36" style tile label. */
function tileLabel(name: string, n: number): string {
  return `${name} · ${formatNumber(n)} ${n === 1 ? 'slot' : 'slots'}`;
}

/**
 * Create / edit a display (UX C4; AC-01, AC-02, AC-12, AC-22). Left: name, location, what it
 * shows (whole levels, zones = level + parking type (03 "Zones"), single slots with code search,
 * "a whole puzzle" and "copy from another display"), vehicle type, page time and display hours.
 * Right: the live preview (the real TV page) of the selection as it is now, from the site's
 * slots. An empty selection can't be saved.
 */
export const DisplayEditor: React.FC<DisplayEditorProps> = ({ display, from, others, onCancel, onSaved }) => {
  const ctx = useSiteContext();
  const seed = display || from;
  const [name, setName] = useState(display ? display.name : from ? `${from.name} (copy)` : '');
  const [location, setLocation] = useState(seed?.location ?? '');
  const [sel, setSel] = useState<DisplaySelection>(seed ? { ...seed.selection } : EMPTY_SELECTION);
  const [pageSeconds, setPageSeconds] = useState(String(seed?.pageSeconds ?? 8));
  const [hoursMode, setHoursMode] = useState<'ALWAYS' | 'DAILY'>(seed?.hours.mode ?? 'ALWAYS');
  const [on, setOn] = useState(seed && seed.hours.mode === 'DAILY' ? seed.hours.on : '07:00');
  const [off, setOff] = useState(seed && seed.hours.mode === 'DAILY' ? seed.hours.off : '23:00');
  const [pickBy, setPickBy] = useState<PickBy>(seed && !seed.selection.levels.length && seed.selection.areas.length ? 'zones' : seed && !seed.selection.levels.length && seed.selection.slotIds.length ? 'slots' : 'levels');
  const [find, setFind] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [options, setOptions] = useState<DisplayOptions | null>(null);
  const [slots, setSlots] = useState<LiveSlot[]>([]);
  // US-17 hide / pin on this display only (C11). A copy keeps the rules of the display it copies.
  const initialRules: SlotRules = seed?.slotRules ? { hidden: [...seed.slotRules.hidden], pinned: [...seed.slotRules.pinned] } : { hidden: [], pinned: [] };
  const [rules, setRules] = useState<SlotRules>(initialRules);
  // 03 v1.5 (AC-38): default Slot cards; a copy keeps the layout of the display it copies.
  const [layout, setLayout] = useState<DisplayLayout>(seed?.layout ?? 'SLOT_CARDS');

  // Options (levels, zones, slots) once; the site's live slots with the same 15 s refresh as the console.
  useEffect(() => {
    let live = true;
    void displaysApi.options().then((r) => {
      if (live && r.ok) setOptions({ levels: r.data.levels || [], areas: r.data.areas || [], slots: r.data.slots || [] });
    });
    return () => {
      live = false;
    };
  }, [ctx.siteId]);
  const live = useAutoRefresh(
    async (isCurrent) => {
      const res = await fetch('/api/v1/slots');
      if (!res.ok) return false;
      const data = (await res.json()) as { slots?: LiveSlot[] } | LiveSlot[];
      if (!isCurrent()) return false;
      setSlots(Array.isArray(data) ? data : data.slots || []);
      return true;
    },
    [ctx.siteId]
  );

  const hours: DisplayHours = hoursMode === 'DAILY' ? { mode: 'DAILY', on, off } : { mode: 'ALWAYS' };
  // The selection before hiding (listed in "Slots on this display"), and what can appear on screen.
  const inSel = useMemo(() => selectedSlots(slots, sel), [slots, sel]);
  const chosen = useMemo(() => inSel.filter((s) => !rules.hidden.includes(s.id)), [inSel, rules.hidden]);
  // 03 v1.5 (AC-42, S-3): the same countSlots as the TV feed and Live parking.
  const counts = useMemo(() => countSlots(chosen), [chosen]);
  const freeNow = counts.free;
  const feed = useMemo(
    () =>
      live.updatedAt
        ? draftFeed({ slots, selection: sel, place: location, siteName: ctx.activeSite?.siteName, hours, pageSeconds: Number(pageSeconds) || 8, hidden: rules.hidden, pinned: rules.pinned, layout })
        : null,
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [slots, sel, location, ctx.activeSite?.siteName, hoursMode, on, off, pageSeconds, live.updatedAt, rules, layout]
  );

  const toggleLevel = (level: Level) =>
    setSel((s) => ({ ...s, levels: s.levels.includes(level) ? s.levels.filter((l) => l !== level) : [...s.levels, level] }));
  const hasArea = (level: Level, pt: ParkingType) => sel.areas.some((a) => a.level === level && a.parkingType === pt);
  const toggleArea = (level: Level, pt: ParkingType) =>
    setSel((s) => ({ ...s, areas: hasArea(level, pt) ? s.areas.filter((a) => !(a.level === level && a.parkingType === pt)) : [...s.areas, { level, parkingType: pt }] }));
  const addSlots = (ids: string[]) => setSel((s) => ({ ...s, slotIds: [...s.slotIds, ...ids.filter((id) => !s.slotIds.includes(id))] }));
  const removeSlot = (id: string) => setSel((s) => ({ ...s, slotIds: s.slotIds.filter((x) => x !== id) }));

  const slotById = useMemo(() => new Map((options?.slots || []).map((s) => [s.id, s])), [options]);
  const needle = find.trim().toUpperCase();
  const matches = needle ? (options?.slots || []).filter((s) => s.code.toUpperCase().includes(needle) && !sel.slotIds.includes(s.id)).slice(0, 8) : [];
  const puzzles = useMemo(() => {
    const m = new Map<string, string[]>();
    for (const s of options?.slots || []) if (s.puzzleNumber) m.set(s.puzzleNumber, [...(m.get(s.puzzleNumber) || []), s.id]);
    return [...m.entries()].sort((a, b) => a[0].localeCompare(b[0], undefined, { numeric: true }));
  }, [options]);
  const copyable = others.filter((o) => o.id !== display?.id && o.siteId === (display?.siteId ?? ctx.siteId));

  /** A field's error goes as soon as it is edited; the rest stay until the next Save. */
  const clear = (...keys: string[]) => setErrors((e) => (keys.some((k) => e[k]) ? Object.fromEntries(Object.entries(e).filter(([k]) => !keys.includes(k))) : e));
  useEffect(() => clear('selection'), [sel.levels.length, sel.areas.length, sel.slotIds.length]); // eslint-disable-line react-hooks/exhaustive-deps
  const levelOrder = (l: string) => ['B1', 'B2', 'B3', 'Ground', 'Driveway'].indexOf(l);

  const validate = (): Record<string, string> => {
    const e: Record<string, string> = {};
    if (!name.trim()) e.name = 'Give the display a name.';
    else if (name.trim().length > 60) e.name = 'Keep the name to 60 characters or fewer.';
    if (location.trim().length > 80) e.location = 'Keep the location to 80 characters or fewer.';
    if (isEmptySelection(sel)) e.selection = 'Choose at least one level, zone or slot.';
    const ps = Number(pageSeconds);
    if (!/^\d+$/.test(pageSeconds.trim()) || ps < 5 || ps > 30) e.pageSeconds = 'Choose 5 to 30 seconds.';
    if (hoursMode === 'DAILY') {
      if (!HHMM.test(on)) e.on = 'Use 24-hour time, like 07:00.';
      if (!HHMM.test(off)) e.off = 'Use 24-hour time, like 23:00.';
      if (HHMM.test(on) && on === off) e.off = 'Choose an off time different from the on time.';
    }
    if (layout === 'SUMMARY_CARDS' && counts.rows.length > SUMMARY_CARDS_MAX_LEVELS) e.layout = tooManyForCards(counts.rows.length);
    return e;
  };

  const save = async (ev: React.FormEvent) => {
    ev.preventDefault();
    const e = validate();
    setErrors(e);
    setFormError(null);
    if (Object.keys(e).length) return;
    const input: DisplayInput = { name: name.trim(), location: location.trim(), selection: sel, pageSeconds: Number(pageSeconds), hours, layout };
    setSaving(true);
    try {
      const r = display ? await displaysApi.update(display.id, input) : await displaysApi.create(input);
      if (r.ok && r.data.display) {
        const saved = r.data.display;
        const link = display ? null : (r.data as { link?: string }).link ?? null;
        // US-17: only rules for slots still in the selection are kept (deleted or deselected slots drop out).
        const keep = new Set(inSel.map((s) => s.id));
        const next: SlotRules = { hidden: rules.hidden.filter((id) => keep.has(id)), pinned: rules.pinned.filter((id) => keep.has(id)) };
        const before = seed?.slotRules || { hidden: [], pinned: [] };
        const same = (a: string[], b: string[]) => a.length === b.length && a.every((x) => b.includes(x));
        const changed = display ? !(same(next.hidden, before.hidden) && same(next.pinned, before.pinned)) : next.hidden.length + next.pinned.length > 0;
        if (!changed) onSaved(saved, link);
        else {
          let warning: string | undefined;
          try {
            const rr = await displaysApi.slotRules(saved.id, next);
            if (!rr.ok) warning = `Display saved, but the hidden and pinned slots weren't: ${saveErrorMessage(rr.data)}`;
          } catch {
            warning = "Display saved, but the hidden and pinned slots weren't. Try again.";
          }
          onSaved(saved, link, warning);
        }
      } else if (r.data.errors && Object.keys(r.data.errors).length) {
        setErrors(r.data.errors);
      } else setFormError(saveErrorMessage(r.data));
    } catch {
      setFormError(COPY_SAVE_ERROR);
    } finally {
      setSaving(false);
    }
  };

  const title = display ? `Edit ${display.name}` : 'Create display';
  const tiles = (items: { key: string; label: string; checked: boolean; onChange: () => void }[]) => (
    <div className="pf-check-tiles">
      {items.map((t) => (
        <Checkbox key={t.key} className="pf-check-tile" label={t.label} checked={t.checked} onChange={t.onChange} invalid={!!errors.selection} />
      ))}
    </div>
  );

  return (
    <>
      <button type="button" className="pf-link pf-back" onClick={onCancel}>
        <ArrowLeft aria-hidden="true" strokeWidth={2} /> Displays
      </button>
      <PageHeader title={title} description="Choose what this screen shows. The preview updates as you go." />
      <div className="pf-display-edit">
        <form className="pf-card pf-stack pf-display-form" onSubmit={save} noValidate aria-label="Display settings">
          {formError && <Banner tone="danger">{formError}</Banner>}
          <div className="pf-form-grid">
            <TextField label="Name" required value={name} maxLength={60} error={errors.name} help="Shown in the console only, not on the screen." onChange={(e) => { setName(e.target.value); clear('name'); }} />
            <TextField label="Location" value={location} maxLength={80} error={errors.location} help="Shown at the top of the screen, e.g. “Main entrance”." onChange={(e) => { setLocation(e.target.value); clear('location'); }} />
          </div>

          <fieldset className="pf-fieldset pf-stack" aria-describedby={errors.selection ? 'pf-sel-error' : undefined}>
            <legend className="pf-field-label">
              What it shows<span className="pf-req" aria-hidden="true">*</span>
            </legend>
            <SegmentedControl
              idBase="pf-pick"
              label="Choose by"
              value={pickBy}
              onChange={(id) => setPickBy(id as PickBy)}
              options={[
                { id: 'levels', label: 'Whole levels', count: sel.levels.length || undefined },
                { id: 'zones', label: 'Zones', count: sel.areas.length || undefined },
                { id: 'slots', label: 'Single slots', count: sel.slotIds.length || undefined },
              ]}
            />
            {!options ? (
              <Skeleton width="70%" />
            ) : (
              <>
                {pickBy === 'levels' && (
                <TabPanel idBase="pf-pick" id="levels">
                  {options.levels.length === 0 ? (
                    <p className="pf-card-note">This site has no slots yet. Add them under Inventory first.</p>
                  ) : (
                    tiles(options.levels.slice().sort((a, b) => levelOrder(a.level) - levelOrder(b.level)).map((l) => ({ key: l.level, label: tileLabel(levelLabel(l.level), l.slots), checked: sel.levels.includes(l.level), onChange: () => toggleLevel(l.level) })))
                  )}
                </TabPanel>
                )}
                {pickBy === 'zones' && (
                <TabPanel idBase="pf-pick" id="zones">
                  {tiles(
                    options.areas.slice().sort((a, b) => levelOrder(a.level) - levelOrder(b.level)).map((a) => ({
                      key: `${a.level}-${a.parkingType}`,
                      label: tileLabel(a.label || areaLabel(a.level, a.parkingType), a.slots),
                      checked: hasArea(a.level, a.parkingType),
                      onChange: () => toggleArea(a.level, a.parkingType),
                    }))
                  )}
                  <p className="pf-field-help">Zones are the puzzle, stacker and open-bay groups of each level, as set up under Inventory.</p>
                </TabPanel>
                )}
                {pickBy === 'slots' && (
                <TabPanel idBase="pf-pick" id="slots">
                  <div className="pf-stack">
                    <TextField label="Find slots by code" mono placeholder="e.g. B1-P03" value={find} onChange={(e) => setFind(e.target.value)} />
                    {needle && (
                      <ul className="pf-pick-results" aria-label="Matching slots">
                        {matches.length === 0 ? (
                          <li className="pf-card-note">No slot code contains “{find.trim()}”.</li>
                        ) : (
                          matches.map((s) => (
                            <li key={s.id}>
                              <Button size="sm" onClick={() => addSlots([s.id])} aria-label={`Add slot ${s.code}`}>
                                Add <SlotCode code={s.code} />
                              </Button>
                            </li>
                          ))
                        )}
                      </ul>
                    )}
                    <div className="pf-form-grid">
                      {puzzles.length > 0 && (
                        <Select
                          label="Add a whole puzzle"
                          value=""
                          placeholder="Choose a puzzle…"
                          options={puzzles.map(([p, ids]) => ({ value: p, label: `${p} · ${ids.length} slots` }))}
                          onChange={(e) => {
                            const ids = puzzles.find(([p]) => p === e.target.value)?.[1];
                            if (ids) addSlots(ids);
                          }}
                        />
                      )}
                      {copyable.length > 0 && (
                        <Select
                          label="Copy the selection from"
                          value=""
                          placeholder="Choose a display…"
                          options={copyable.map((o) => ({ value: o.id, label: o.name }))}
                          onChange={(e) => {
                            const o = copyable.find((x) => x.id === e.target.value);
                            if (o) setSel({ ...o.selection });
                          }}
                        />
                      )}
                    </div>
                    {sel.slotIds.length > 0 && (
                      <ul className="pf-slot-chips" aria-label="Chosen slots">
                        {sel.slotIds.map((id) => {
                          const code = slotById.get(id)?.code ?? 'Deleted slot';
                          return (
                            <li key={id} className="pf-chip pf-chip--info">
                              <SlotCode code={code} />
                              <button type="button" className="pf-chip-remove" aria-label={`Remove ${code}`} onClick={() => removeSlot(id)}>
                                <X aria-hidden="true" strokeWidth={2} />
                              </button>
                            </li>
                          );
                        })}
                      </ul>
                    )}
                    <p className="pf-field-help">
                      {formatNumber(sel.slotIds.length)} single {sel.slotIds.length === 1 ? 'slot' : 'slots'} chosen. Single slots add to any levels and zones chosen.
                    </p>
                  </div>
                </TabPanel>
                )}
              </>
            )}
            {errors.selection && (
              <p className="pf-field-error" id="pf-sel-error" role="alert">
                {errors.selection}
              </p>
            )}
          </fieldset>

          <LayoutPicker
            value={layout}
            counts={counts}
            readOnly={ctx.canWrite ? null : ctx.writeDisabledReason}
            error={errors.layout}
            onChange={(l) => {
              setLayout(l);
              clear('layout');
            }}
          />

          <div className="pf-form-grid">
            <div className="pf-field">
              <span className="pf-field-label" id="pf-vc-label">
                Vehicle type
              </span>
              <SegmentedControl
                idBase="pf-vc"
                label="Vehicle type"
                hasPanels={false}
                value={sel.vehicleClass}
                onChange={(id) => setSel((s) => ({ ...s, vehicleClass: id as VehicleClass }))}
                options={[
                  { id: 'ALL', label: 'All' },
                  { id: '4W', label: '4-wheelers' },
                  { id: '2W', label: '2-wheelers' },
                ]}
              />
            </div>
            <TextField
              label="Change page every (seconds)"
              inputMode="numeric"
              value={pageSeconds}
              error={errors.pageSeconds}
              help="5–30. Used only when there are more free slots than fit."
              onChange={(e) => { setPageSeconds(e.target.value); clear('pageSeconds'); }}
            />
          </div>

          <fieldset className="pf-fieldset pf-stack">
            <legend className="pf-field-label">Display hours</legend>
            <div className="pf-row-inline">
              <Radio name="pf-hours" label="Always on" checked={hoursMode === 'ALWAYS'} onChange={() => setHoursMode('ALWAYS')} />
              <Radio name="pf-hours" label="Set hours" checked={hoursMode === 'DAILY'} onChange={() => setHoursMode('DAILY')} />
            </div>
            {hoursMode === 'DAILY' && (
              <div className="pf-form-row pf-form-row--end">
                <TextField label="Screen on at" mono inputMode="numeric" placeholder="07:00" value={on} error={errors.on} onChange={(e) => { setOn(e.target.value); clear('on', 'off'); }} />
                <TextField label="Screen off at" mono inputMode="numeric" placeholder="23:00" value={off} error={errors.off} onChange={(e) => { setOff(e.target.value); clear('off'); }} />
                <p className="pf-field-help pf-grow">
                  Every day, India time. Outside these hours the screen shows “Closed — opens at {HHMM.test(on) ? on : 'HH:mm'}”.
                </p>
              </div>
            )}
          </fieldset>

          <SlotRulesSection slots={inSel} rules={rules} onChange={setRules} />

          <div className="pf-form-actions">
            <Button onClick={onCancel}>Cancel</Button>
            <Button type="submit" variant="primary" guard loading={saving} loadingLabel="Saving…">
              Save display
            </Button>
          </div>
        </form>

        <aside className="pf-card pf-stack pf-display-preview" aria-label="Live preview">
          <div className="pf-card-head">
            <h2 className="pf-card-title">Live preview</h2>
          </div>
          {live.error && !live.updatedAt ? (
            <ErrorState title="Couldn’t load the slots for the preview" onRetry={() => void live.refresh()} />
          ) : (
            <TvPreview feed={feed} label={`Live preview of ${name.trim() || 'this display'}`} />
          )}
          <p>
            <b>
              {formatNumber(chosen.length)} {chosen.length === 1 ? 'slot' : 'slots'}
            </b>{' '}
            in this selection · <b>{formatNumber(freeNow)} free now</b>
          </p>
          {layout === 'SUMMARY' ? (
            <p className="pf-card-note">Free = vacant slots only. Up to 6 basements fit on one screen; more change page every {Number(pageSeconds) >= 5 && Number(pageSeconds) <= 30 ? Number(pageSeconds) : 8} s, and the totals always cover all of them.</p>
          ) : (
            <p className="pf-card-note">
              The screen fits {layout === 'SUMMARY_CARDS' ? 8 : 12} slot cards. Free slots come first by slot code; when more are free, only free slots are shown, on pages that change every{' '}
              {Number(pageSeconds) >= 5 && Number(pageSeconds) <= 30 ? Number(pageSeconds) : 8} s.
            </p>
          )}
        </aside>
      </div>
    </>
  );
};
