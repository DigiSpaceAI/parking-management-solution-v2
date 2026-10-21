import React, { useEffect, useMemo, useState } from 'react';
import { Banner, Button, Checkbox, Field, Modal, Radio, SegmentedControl, Select, SidePanel, TextField, useToast } from '../../design-system/components';
import { COPY_SAVE_ERROR, saveErrorMessage, useSiteContext } from '../../utils/withSite';
import type { DisplayFeed } from '../../display/types';
import { displayState, displaysApi, istDays, istIso, type DisplayRow } from './api';
import { TvPreview } from './TvPreview';

export const MESSAGE_MAX = 140;
const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;
const COPY_TEXT = 'Write a message (up to 140 characters).';
const COPY_TARGET = 'Choose at least one display.';
const COPY_END = 'Pick an end time later than now.';

/** The end picked in the console, as the API wants it; null = "When I clear it". Validated: > now + 1 min (03 v1.2). */
function endIso(mode: 'CLEAR' | 'AT', date: string, time: string): { iso: string | null; error: string | null } {
  if (mode === 'CLEAR') return { iso: null, error: null };
  if (!HHMM.test(time)) return { iso: null, error: 'Use 24-hour time, like 14:00.' };
  const iso = istIso(date, time);
  return Date.parse(iso) <= Date.now() + 60000 ? { iso: null, error: COPY_END } : { iso, error: null };
}

/** A sensible default end: the next whole hour, IST. */
function nextHour(): string {
  const d = new Date(Date.now() + 330 * 60000 + 3600000);
  return `${String(d.getUTCHours()).padStart(2, '0')}:00`;
}

// ---- C9: Show a message on displays -------------------------------------------------------

export interface MessagePanelProps {
  open: boolean;
  /** The site's displays (the panel lists only these: AC-30). */
  displays: DisplayRow[];
  /** Preselected display (row menu "Show a message…"). */
  initialId?: string | null;
  onClose: () => void;
  onDone: () => void;
}

/**
 * Show a message on displays (UX C9; AC-23, AC-30): the message (≤ 140, counter), Banner above
 * slots or Full screen, the displays (all at this site, including ones added later — 03 O-3 — or
 * some), when it ends (IST), and a live preview of the first chosen display in the chosen mode.
 * One message per display: a new one replaces the old one on the displays it targets.
 */
export const MessagePanel: React.FC<MessagePanelProps> = ({ open, displays, initialId, onClose, onDone }) => {
  const toast = useToast();
  const ctx = useSiteContext();
  const active = displays.filter((d) => d.status === 'ACTIVE');
  const [text, setText] = useState('');
  const [mode, setMode] = useState<'BANNER' | 'FULL'>('BANNER');
  const [all, setAll] = useState(false);
  const [ids, setIds] = useState<string[]>([]);
  const [ends, setEnds] = useState<'CLEAR' | 'AT'>('CLEAR');
  const days = useMemo(() => istDays(31), [open]); // eslint-disable-line react-hooks/exhaustive-deps
  const [date, setDate] = useState(days[0].value);
  const [time, setTime] = useState(nextHour());
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [feed, setFeed] = useState<DisplayFeed | null>(null);

  useEffect(() => {
    if (!open) return;
    setText('');
    setMode('BANNER');
    setAll(false);
    setIds(initialId ? [initialId] : []);
    setEnds('CLEAR');
    setDate(days[0].value);
    setTime(nextHour());
    setErrors({});
    setFormError(null);
  }, [open, initialId]); // eslint-disable-line react-hooks/exhaustive-deps

  const chosen = all ? active.map((d) => d.id) : ids;
  const previewId = chosen[0] ?? null;
  // The preview: the first chosen display's live feed, with this message in place of any override (AC-29).
  useEffect(() => {
    setFeed(null);
    if (!open || !previewId) return;
    let live = true;
    void displaysApi.preview(previewId).then((r) => {
      if (live && r.ok && typeof r.data.v === 'string') setFeed(r.data);
    });
    return () => {
      live = false;
    };
  }, [open, previewId]);
  const end = endIso(ends, date, time);
  const previewFeed = useMemo<DisplayFeed | null>(() => {
    if (!feed) return null;
    const msg = text.trim() ? { id: 'preview', text: text.trim().slice(0, MESSAGE_MAX), mode, endsAt: end.iso } : null;
    return { ...feed, v: `${feed.v}-preview`, override: { message: msg, forcedFull: feed.override ? feed.override.forcedFull : null } };
  }, [feed, text, mode, end.iso]);

  const toggle = (id: string) => setIds((x) => (x.includes(id) ? x.filter((y) => y !== id) : [...x, id]));
  const note = (d: DisplayRow) => {
    if (d.override?.forcedFull) return 'forced Parking full';
    if (displayState(d) === 'OFFLINE') return 'offline, shows it when back';
    if (displayState(d) === 'NOT_SET_UP') return 'not set up yet, shows it once connected';
    return d.location;
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const next: Record<string, string> = {};
    const t = text.trim();
    if (!t || t.length > MESSAGE_MAX) next.text = COPY_TEXT;
    if (!chosen.length) next.target = COPY_TARGET;
    if (end.error) next.endsAt = end.error;
    setErrors(next);
    setFormError(null);
    if (Object.keys(next).length) return;
    setBusy(true);
    try {
      const r = await displaysApi.createMessage({ text: t, mode, target: all ? { all: true } : { displayIds: ids }, endsAt: end.iso });
      if (r.ok) {
        toast.show({ tone: 'success', message: `Message shown on ${chosen.length} ${chosen.length === 1 ? 'display' : 'displays'}` });
        onDone();
        onClose();
      } else if (r.data.errors && Object.keys(r.data.errors).length) {
        const er = r.data.errors;
        setErrors({ text: er.text || '', target: er.target || '', endsAt: er.endsAt || '' });
        if (!er.text && !er.target && !er.endsAt) setFormError(saveErrorMessage(r.data));
      } else setFormError(saveErrorMessage(r.data));
    } catch {
      setFormError(COPY_SAVE_ERROR);
    } finally {
      setBusy(false);
    }
  };

  const siteName = ctx.activeSite?.siteName || 'this site';
  return (
    <SidePanel
      open={open}
      onClose={onClose}
      title="Show a message on displays"
      className="pf-panel--wide"
      footer={
        <>
          <span className="pf-card-note">Recorded in the audit log.</span>
          <span className="pf-grow" />
          <Button onClick={onClose}>Cancel</Button>
          <Button type="submit" form="pf-message-form" variant="primary" guard loading={busy} loadingLabel="Showing…">
            {chosen.length ? `Show on ${chosen.length} ${chosen.length === 1 ? 'display' : 'displays'}` : 'Show on displays'}
          </Button>
        </>
      }
    >
      <form id="pf-message-form" className="pf-stack" onSubmit={submit} noValidate>
        {formError && <Banner tone="danger">{formError}</Banner>}
        <Field
          label="Message"
          required
          error={errors.text || undefined}
          help="Short and plain: what changed and where to go."
          labelAside={
            <span className={text.length > MESSAGE_MAX ? 'pf-counter pf-counter--over' : 'pf-counter'} aria-live="polite">
              {text.length} / {MESSAGE_MAX}
            </span>
          }
        >
          {(c) => <textarea {...c} className="pf-input pf-textarea" rows={3} value={text} onChange={(e) => setText(e.target.value.replace(/[\r\n]+/g, ' '))} />}
        </Field>

        <div className="pf-field">
          <span className="pf-field-label" id="pf-msg-mode">
            Show as
          </span>
          <SegmentedControl
            idBase="pf-msg-mode"
            label="Show as"
            hasPanels={false}
            value={mode}
            onChange={(v) => setMode(v as 'BANNER' | 'FULL')}
            options={[
              { id: 'BANNER', label: 'Banner above slots' },
              { id: 'FULL', label: 'Full screen' },
            ]}
          />
          {mode === 'BANNER' ? (
            <p className="pf-field-help">Slots stay live under the message. The screen shows 8 slot cards instead of 12.</p>
          ) : (
            <p className="pf-field-warning">Drivers won’t see any slots while this is on.</p>
          )}
        </div>

        <fieldset className="pf-fieldset pf-stack pf-stack--tight" aria-describedby={errors.target ? 'pf-msg-target-error' : undefined}>
          <legend className="pf-field-label">
            Displays<span className="pf-req" aria-hidden="true">*</span>
          </legend>
          <Checkbox
            label={<b>{`All displays at ${siteName} (${active.length})`}</b>}
            checked={all}
            onChange={(e) => {
              setAll(e.target.checked);
              setErrors((x) => ({ ...x, target: '' }));
            }}
          />
          {all && <p className="pf-field-help">Including displays added later, while the message is on.</p>}
          <div className="pf-indent pf-stack pf-stack--tight">
            {active.map((d) => (
              <Checkbox
                key={d.id}
                label={
                  <span>
                    {d.name}
                    {note(d) && <span className="pf-text-muted"> · {note(d)}</span>}
                  </span>
                }
                checked={all || ids.includes(d.id)}
                disabled={all}
                onChange={() => {
                  toggle(d.id);
                  setErrors((x) => ({ ...x, target: '' }));
                }}
              />
            ))}
          </div>
          {errors.target && (
            <p className="pf-field-error" id="pf-msg-target-error" role="alert">
              {errors.target}
            </p>
          )}
        </fieldset>

        <fieldset className="pf-fieldset pf-stack pf-stack--tight">
          <legend className="pf-field-label">Ends</legend>
          <div className="pf-row-inline">
            <Radio name="pf-msg-ends" label="When I clear it" checked={ends === 'CLEAR'} onChange={() => setEnds('CLEAR')} />
            <Radio name="pf-msg-ends" label="At a time" checked={ends === 'AT'} onChange={() => setEnds('AT')} />
          </div>
          {ends === 'AT' && (
            <div className="pf-form-row pf-form-row--end">
              <TextField label="End time" mono inputMode="numeric" placeholder="14:00" value={time} onChange={(e) => { setTime(e.target.value); setErrors((x) => ({ ...x, endsAt: '' })); }} />
              <Select label="End date" options={days} value={date} onChange={(e) => { setDate(e.target.value); setErrors((x) => ({ ...x, endsAt: '' })); }} />
            </div>
          )}
          {errors.endsAt ? (
            <p className="pf-field-error" role="alert">
              {errors.endsAt}
            </p>
          ) : (
            <p className="pf-field-help">India time. The screens go back to normal by themselves.</p>
          )}
        </fieldset>

        {previewId && (
          <section className="pf-stack pf-stack--tight" aria-labelledby="pf-msg-preview">
            <span className="pf-field-label" id="pf-msg-preview">
              Preview · {displays.find((d) => d.id === previewId)?.name}
            </span>
            <TvPreview feed={previewFeed} label={`Preview of the message on ${displays.find((d) => d.id === previewId)?.name}`} />
          </section>
        )}
      </form>
    </SidePanel>
  );
};

// ---- C10: Force Parking full ------------------------------------------------------------

export interface ForceFullDialogProps {
  display: DisplayRow | null;
  onClose: () => void;
  onDone: () => void;
}

/** "Force “Parking full” on …?" (UX C10; AC-25): ends when cleared or at a time today (IST). */
export const ForceFullDialog: React.FC<ForceFullDialogProps> = ({ display, onClose, onDone }) => {
  const toast = useToast();
  const [ends, setEnds] = useState<'CLEAR' | 'AT'>('CLEAR');
  const [time, setTime] = useState(nextHour());
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    setEnds('CLEAR');
    setTime(nextHour());
    setError(null);
  }, [display?.id]);
  if (!display) return <Modal open={false} onClose={onClose} title="" />;

  const submit = async () => {
    const end = endIso(ends, istDays(1)[0].value, time);
    if (end.error) {
      setError(end.error);
      return;
    }
    setBusy(true);
    try {
      const r = await displaysApi.forceFull(display.id, end.iso);
      if (r.ok) {
        toast.show({ tone: 'success', message: `“Parking full” forced on ${display.name}` });
        onDone();
        onClose();
      } else setError((r.data.errors && r.data.errors.endsAt) || saveErrorMessage(r.data));
    } catch {
      setError(COPY_SAVE_ERROR);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open
      onClose={onClose}
      title={`Force “Parking full” on ${display.name}?`}
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="destructive" guard loading={busy} loadingLabel="Forcing…" onClick={() => void submit()}>
            Force Parking full
          </Button>
        </>
      }
    >
      <div className="pf-stack">
        <p>
          The screen shows <b>Parking full</b> and hides vacant slots, even if some are free. Drivers are told not to enter. Slots in Live parking don’t change.
        </p>
        <fieldset className="pf-fieldset pf-stack pf-stack--tight">
          <legend className="pf-field-label">Ends</legend>
          <Radio name="pf-ff-ends" label="When I clear it" checked={ends === 'CLEAR'} onChange={() => setEnds('CLEAR')} />
          <Radio name="pf-ff-ends" label="At a time today" checked={ends === 'AT'} onChange={() => setEnds('AT')} />
          {ends === 'AT' && (
            <TextField label="End time (today, India time)" mono inputMode="numeric" placeholder="18:00" value={time} onChange={(e) => { setTime(e.target.value); setError(null); }} />
          )}
        </fieldset>
        {error && (
          <p className="pf-field-error" role="alert">
            {error}
          </p>
        )}
      </div>
    </Modal>
  );
};

/** Clear every override on one display (C8 "Clear", acts at once, no confirm — it only returns the screen to normal). */
export async function clearOverrides(d: DisplayRow): Promise<{ ok: boolean; message?: string }> {
  const o = d.override;
  try {
    if (o?.message) {
      const r = await displaysApi.clearMessage(o.message.id, [d.id]);
      if (!r.ok) return { ok: false, message: saveErrorMessage(r.data) };
    }
    if (o?.forcedFull) {
      const r = await displaysApi.clearForceFull(d.id);
      if (!r.ok) return { ok: false, message: saveErrorMessage(r.data) };
    }
    return { ok: true };
  } catch {
    return { ok: false, message: COPY_SAVE_ERROR };
  }
}
