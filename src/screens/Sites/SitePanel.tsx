import React, { useEffect, useState } from 'react';
import { Eye, Pencil, RefreshCw } from 'lucide-react';
import type { AppUser, SiteConfig, SiteStatus, SiteSummaryRow } from '../../types';
import { ActionMenu, Banner, Button, Modal, Radio, SidePanel, SiteTag, Skeleton, StatusChip, TextField } from '../../design-system/components';
import { formatDate, formatINR, formatNumber } from '../../utils/format';
import { COPY_SAVE_ERROR, saveErrorMessage } from '../../utils/withSite';
import { DomainsList } from '../shell/DomainsList';

export interface SitePanelProps {
  row: SiteSummaryRow | null;
  site: SiteConfig | null;
  /** Writes are not possible (viewing as another user). */
  readOnly: boolean;
  onClose: () => void;
  /** After a change: reload the table, toast. */
  onSaved: (message: string) => void;
  onViewAs?: (user: AppUser) => void;
}

type EditForm = { siteName: string; city: string; address: string; contactPerson: string; contactEmail: string; contactPhone: string };

type ContactField = 'address' | 'contactPerson' | 'contactEmail' | 'contactPhone';
const CONTACT_FIELDS: { key: ContactField; label: string }[] = [
  { key: 'address', label: 'Address' },
  { key: 'contactPerson', label: 'Contact person' },
  { key: 'contactEmail', label: 'Contact email' },
  { key: 'contactPhone', label: 'Contact phone' },
];

/**
 * 06 BUG-R1B-7 (AC-04/AC-05): before a0410b1, onboarding stored these made-up values when the
 * Master left a field blank, and they were shown as real. New sites store '' instead; sites
 * onboarded before keep them until edited, so the console treats exactly these values as not
 * entered. Only these four patterns, nothing else, is treated this way.
 */
function isMadeUpAtOnboarding(site: SiteConfig, key: ContactField): boolean {
  const v = (site[key] || '').trim();
  if (!v) return false;
  switch (key) {
    case 'address':
      return !!site.city && v === `${site.city} Parking Complex`;
    case 'contactPerson':
      return v === 'Site Facility Manager';
    case 'contactEmail':
      return !!site.siteCode && v.toLowerCase() === `admin@${site.siteCode.toLowerCase()}.com`;
    case 'contactPhone':
      return v.replace(/\s/g, '') === '+919800000000';
  }
}

/** The value to show and edit: what the Master entered, or '' when nothing real was entered. */
function enteredValue(site: SiteConfig | null, key: ContactField): string {
  if (!site) return '';
  const v = (site[key] || '').trim();
  return v && !isMadeUpAtOnboarding(site, key) ? v : '';
}

async function post(url: string, body: unknown) {
  const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  let data: { success?: boolean; message?: string; errorCode?: string; errors?: Record<string, string> } = {};
  try {
    data = await res.json();
  } catch {
    data = {};
  }
  return { ok: res.ok && data.success !== false, data };
}

/**
 * Site details (UX S5): city, address and contacts ("— not entered" when missing, BUG-R1B-7), capacity, billing, site admins, email domains,
 * onboarded date; on hold shows the reason. Actions: Edit site (POST /sites/update, B5),
 * Change status (POST /sites/status), "⋯" View as site admin (001 view-as, read-only).
 */
export const SitePanel: React.FC<SitePanelProps> = ({ row, site, readOnly, onClose, onSaved, onViewAs }) => {
  const [mode, setMode] = useState<'view' | 'edit'>('view');
  const [form, setForm] = useState<EditForm>({ siteName: '', city: '', address: '', contactPerson: '', contactEmail: '', contactPhone: '' });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [statusOpen, setStatusOpen] = useState(false);
  const [nextStatus, setNextStatus] = useState<SiteStatus>('ACTIVE');
  const [holdReason, setHoldReason] = useState('');
  const [statusError, setStatusError] = useState<string | null>(null);
  const [admins, setAdmins] = useState<AppUser[] | null>(null);
  const open = !!row;

  useEffect(() => {
    setMode('view');
    setErrors({});
    setFormError(null);
    setAdmins(null);
    if (!row) return;
    let live = true;
    (async () => {
      try {
        const res = await fetch('/api/v1/rbac/users');
        const data = (await res.json()) as { users?: AppUser[] };
        if (!live) return;
        setAdmins(
          res.ok
            ? (data.users || []).filter((u) => u.roleId !== 'role-master-admin' && u.siteScopeType !== 'ALL_SITES' && (u.assignedSiteIds || []).includes(row.id) && u.roleId === 'role-site-manager')
            : []
        );
      } catch {
        if (live) setAdmins([]);
      }
    })();
    return () => {
      live = false;
    };
  }, [row?.id]);

  if (!row) return <SidePanel open={false} onClose={onClose} title="" />;

  const startEdit = () => {
    setForm({
      siteName: site?.siteName || row.siteName,
      city: site?.city || row.city,
      address: enteredValue(site, 'address'),
      contactPerson: enteredValue(site, 'contactPerson'),
      contactEmail: enteredValue(site, 'contactEmail'),
      contactPhone: enteredValue(site, 'contactPhone'),
    });
    setErrors({});
    setFormError(null);
    setMode('edit');
  };
  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    const next: Record<string, string> = {};
    if (!form.siteName.trim()) next.siteName = 'Enter the site name.';
    if (!form.city.trim()) next.city = 'Enter the city.';
    setErrors(next);
    if (Object.keys(next).length) return;
    setBusy(true);
    setFormError(null);
    try {
      const { ok, data } = await post('/api/v1/sites/update', { siteId: row.id, ...form });
      if (ok) {
        setMode('view');
        onSaved('Site details saved');
      } else {
        if (data.errors && Object.keys(data.errors).length) setErrors(data.errors);
        else setFormError(saveErrorMessage(data));
      }
    } catch {
      setFormError(COPY_SAVE_ERROR);
    } finally {
      setBusy(false);
    }
  };
  const openStatus = () => {
    setNextStatus(row.status);
    setHoldReason(row.holdReason || '');
    setStatusError(null);
    setStatusOpen(true);
  };
  const saveStatus = async () => {
    if (nextStatus === 'ON_HOLD' && !holdReason.trim()) {
      setStatusError('Give a reason. Site admins see it while the site is on hold.');
      return;
    }
    setBusy(true);
    try {
      const { ok, data } = await post('/api/v1/sites/status', { siteId: row.id, status: nextStatus, holdReason: nextStatus === 'ON_HOLD' ? holdReason.trim() : undefined });
      if (ok) {
        setStatusOpen(false);
        onSaved(`Status changed to ${nextStatus === 'ON_HOLD' ? 'on hold' : nextStatus === 'ACTIVE' ? 'active' : 'deactivated'}`);
      } else setStatusError(saveErrorMessage(data));
    } catch {
      setStatusError(COPY_SAVE_ERROR);
    } finally {
      setBusy(false);
    }
  };

  const pricing = site?.pricing;
  const set = (k: keyof EditForm) => (e: React.ChangeEvent<HTMLInputElement>) => setForm((f) => ({ ...f, [k]: e.target.value }));
  const viewAsItems =
    onViewAs && admins && admins.length
      ? admins.map((u) => ({ label: `View as ${u.fullName}`, icon: Eye, onSelect: () => onViewAs(u) }))
      : [];

  return (
    <>
      <SidePanel
        open={open}
        onClose={onClose}
        title={mode === 'edit' ? `Edit ${row.siteName}` : row.siteName}
        subtitle={
          <span className="pf-row">
            <SiteTag code={row.siteCode} />
            <StatusChip status={row.status} />
          </span>
        }
        footer={
          mode === 'edit' ? (
            <>
              <Button key="save" type="submit" form="pf-site-form" variant="primary" loading={busy} loadingLabel="Saving…" disabled={readOnly}>
                Save changes
              </Button>
              <Button key="cancel" onClick={() => setMode('view')}>Cancel</Button>
            </>
          ) : (
            <>
              <Button key="edit" variant="primary" icon={Pencil} onClick={startEdit} disabled={readOnly || !site}>
                Edit site
              </Button>
              <Button key="status" icon={RefreshCw} onClick={openStatus} disabled={readOnly}>
                Change status
              </Button>
              {viewAsItems.length > 0 && <ActionMenu label={`More actions for ${row.siteName}`} items={viewAsItems} />}
            </>
          )
        }
      >
        {mode === 'edit' ? (
          <form id="pf-site-form" className="pf-stack" onSubmit={save} noValidate>
            {formError && <Banner tone="danger">{formError}</Banner>}
            <TextField label="Site name" required value={form.siteName} error={errors.siteName} onChange={set('siteName')} />
            <TextField label="City" required value={form.city} error={errors.city} onChange={set('city')} />
            <TextField label="Address" value={form.address} error={errors.address} onChange={set('address')} />
            <TextField label="Contact person" value={form.contactPerson} error={errors.contactPerson} onChange={set('contactPerson')} />
            <TextField label="Contact email" type="email" value={form.contactEmail} error={errors.contactEmail} onChange={set('contactEmail')} />
            <TextField label="Contact phone" type="tel" value={form.contactPhone} error={errors.contactPhone} onChange={set('contactPhone')} />
            <p className="pf-card-note">The site code ({row.siteCode}) can't be changed: records and passes use it.</p>
            {site && CONTACT_FIELDS.some(({ key }) => isMadeUpAtOnboarding(site, key)) && (
              <p className="pf-card-note">
                Contact details that were filled in automatically when the site was onboarded are left blank here. Saving clears them; enter the real ones if you have them.
              </p>
            )}
          </form>
        ) : (
          <>
            {row.status === 'ON_HOLD' && (
              <Banner tone="warning" title="On hold.">
                Reason: {row.holdReason || '—'}
              </Banner>
            )}
            <dl className="pf-dl">
              <dt>City</dt>
              <dd>{row.city || '—'}</dd>
              {CONTACT_FIELDS.map(({ key, label }) => (
                <React.Fragment key={key}>
                  <dt>{label}</dt>
                  <dd>{site ? enteredValue(site, key) || '— not entered' : "— couldn't load the site details"}</dd>
                </React.Fragment>
              ))}
              <dt>Capacity</dt>
              <dd>{row.total ? `${formatNumber(row.total)} slots` : '— no slots yet'}</dd>
              <dt>Billing</dt>
              <dd>
                {pricing
                  ? `${formatINR(pricing.hourlyRate)} an hour · ${formatINR(pricing.dailyMaxRate)} a day (max) · ${formatINR(pricing.monthlyPassRate)} a month · ${pricing.taxPercentage}% tax`
                  : '—'}
              </dd>
              <dt>Site admins</dt>
              <dd>{admins === null ? <Skeleton width="60%" /> : admins.length ? admins.map((u) => u.fullName).join(', ') : 'None yet'}</dd>
              <dt>Onboarded</dt>
              <dd>{formatDate(row.onboardedAt)}</dd>
            </dl>
            <section className="pf-stack" aria-labelledby="pf-site-domains">
              <h3 className="pf-modal-section-title" id="pf-site-domains">
                Email domains
              </h3>
              <DomainsList canEdit={!readOnly} siteId={row.id} />
            </section>
          </>
        )}
      </SidePanel>

      <Modal
        open={statusOpen}
        onClose={() => setStatusOpen(false)}
        title={`Change the status of ${row.siteName}`}
        footer={
          <>
            <Button onClick={() => setStatusOpen(false)}>Cancel</Button>
            <Button variant="primary" loading={busy} loadingLabel="Saving…" disabled={readOnly || nextStatus === row.status && nextStatus !== 'ON_HOLD'} onClick={() => void saveStatus()}>
              Save status
            </Button>
          </>
        }
      >
        <div className="pf-stack">
          <fieldset className="pf-fieldset">
            <legend className="pf-field-label">Status</legend>
            <Radio name="site-status" label="Active: the site works as normal" checked={nextStatus === 'ACTIVE'} onChange={() => setNextStatus('ACTIVE')} />
            <Radio name="site-status" label="On hold: no new entries; exits still work" checked={nextStatus === 'ON_HOLD'} onChange={() => setNextStatus('ON_HOLD')} />
            <Radio name="site-status" label="Deactivated" checked={nextStatus === 'DEACTIVATED'} onChange={() => setNextStatus('DEACTIVATED')} />
          </fieldset>
          {nextStatus === 'ON_HOLD' && <TextField label="Reason" required value={holdReason} maxLength={200} onChange={(e) => setHoldReason(e.target.value)} />}
          {statusError && <Banner tone="danger">{statusError}</Banner>}
        </div>
      </Modal>
    </>
  );
};
