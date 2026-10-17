import React, { useState } from 'react';
import { Plus, Save, Trash2, Settings, Search, LogOut, Car, Bell } from 'lucide-react';
import {
  Button, IconButton, TextField, Select, Checkbox, Radio, StatusChip, CountBadge, SiteTag,
  PlateText, SlotCode, IdText, Banner, ViewingAsBar, useToast, EmptyState, ErrorState, Skeleton,
} from '../components';
import { formatDate, formatTime, formatINR, formatDuration } from '../../utils/format';

/** Sections for components 1–4 (002 T4). Example values only. */
export const Section: React.FC<{ title: string; children: React.ReactNode }> = ({ title, children }) => (
  <section className="pf-preview-section">
    <h2>{title}</h2>
    {children}
  </section>
);

export const Labeled: React.FC<{ label: string; children: React.ReactNode }> = ({ label, children }) => (
  <div className="pf-stack">
    <span className="pf-preview-label">{label}</span>
    <div className="pf-row">{children}</div>
  </div>
);

export const ButtonsSection: React.FC = () => {
  const [saving, setSaving] = useState(false);
  return (
    <Section title="Buttons">
      <Labeled label="Variants">
        <Button variant="primary" icon={Plus}>Add slot</Button>
        <Button variant="secondary">Cancel</Button>
        <Button variant="destructive" icon={Trash2}>Delete slot</Button>
        <Button variant="ghost">Clear filters</Button>
        <Button variant="exit" size="sm">Mark exit</Button>
      </Labeled>
      <Labeled label="Sizes">
        <Button variant="primary" size="sm">Small</Button>
        <Button variant="primary">Medium</Button>
        <Button variant="primary" size="lg">Large (48px)</Button>
      </Labeled>
      <Labeled label="Disabled · loading · guarded write">
        <Button variant="primary" disabled>Approve</Button>
        <Button variant="primary" icon={Save} loading={saving} loadingLabel="Saving…" onClick={() => { setSaving(true); setTimeout(() => setSaving(false), 1500); }}>
          Save changes
        </Button>
        <Button variant="primary" guard="Approve this request">Approve (guard)</Button>
      </Labeled>
      <Labeled label="Icon buttons">
        <IconButton icon={Settings} label="Settings" />
        <IconButton icon={Bell} label="Notifications" />
        <IconButton icon={LogOut} label="Sign out" disabled />
      </Labeled>
    </Section>
  );
};

export const FieldsSection: React.FC = () => {
  const [plate, setPlate] = useState('KA05MN1234');
  return (
    <Section title="Fields">
      <div className="pf-preview-grid">
        <TextField label="Site name" placeholder="e.g. Alphatech Pune" />
        <TextField label="Email" type="email" required help="We send the sign-in link here." defaultValue="ananya@alphatech.in" />
        <TextField label="Vehicle number" mono value={plate} onChange={(e) => setPlate(e.target.value)} />
        <TextField label="Phone number" error="Enter a 10-digit mobile number." defaultValue="98765" />
        <TextField label="Site code" disabled defaultValue="ALP" />
        <TextField label="Password" type="password" size="lg" labelAside={<a className="pf-link" href="#forgot">Forgot password?</a>} />
        <Select label="Vehicle type" placeholder="Choose…" options={[{ value: 'SEDAN', label: 'Sedan' }, { value: 'SUV', label: 'SUV' }, { value: 'TWO_WHEELER', label: 'Two-wheeler' }]} />
        <Select label="Status" error="Choose a status." options={[{ value: '', label: 'Choose…' }]} />
        <Select label="Level" disabled options={[{ value: 'B1', label: 'Basement B1' }]} />
      </div>
      <p className="pf-field-help">
        A link inside a sentence, like <a className="pf-link pf-link--inline" href="#help">the help page</a>, keeps its text size;
        a standalone link such as "Forgot password?" is a 44×44 target on touch.
      </p>
      <Labeled label="Checkbox and radio">
        <Checkbox label="Unchecked" />
        <Checkbox label="Checked" defaultChecked />
        <Checkbox label="Disabled" disabled />
        <Checkbox label="Error" invalid />
        <fieldset className="pf-row">
          <legend className="pf-sr-only">Preferred contact</legend>
          <Radio name="contact" label="Email" defaultChecked />
          <Radio name="contact" label="Phone" />
          <Radio name="contact" label="Disabled" disabled />
        </fieldset>
      </Labeled>
    </Section>
  );
};

export const ChipsSection: React.FC = () => (
  <Section title="Status chips, badges, tags and data text">
    <Labeled label="Slot status">
      {['VACANT', 'OCCUPIED', 'RESERVED', 'MAINTENANCE'].map((s) => <StatusChip key={s} status={s} />)}
    </Labeled>
    <Labeled label="Request and site status">
      {['PENDING', 'APPROVED', 'REJECTED', 'REVOKED', 'ON_HOLD'].map((s) => <StatusChip key={s} status={s} />)}
    </Labeled>
    <Labeled label="Counts and site tags">
      <CountBadge count={3} label="pending requests" />
      <CountBadge count={12} alert label="open alerts" />
      <CountBadge count={150} label="items" />
      <SiteTag code="ALP" name="Alphatech Pune" />
      <SiteTag code="TPH" name="Tech Park HQ" />
    </Labeled>
    <Labeled label="Data text (mono only here)">
      <PlateText plate="KA05MN1234" />
      <SlotCode code="B1-042" />
      <IdText>E-1042</IdText>
      <IdText>{formatTime('2026-10-03T03:44:00Z')}</IdText>
    </Labeled>
    <Labeled label="Formats (IST, Indian grouping)">
      <span>{formatDate('2026-09-25T03:44:00Z')}</span>
      <span>{formatINR(177000)}</span>
      <span>{formatDuration((7 * 24 + 22) * 3600000)}</span>
    </Labeled>
  </Section>
);

export const FeedbackSection: React.FC = () => {
  const toast = useToast();
  return (
    <Section title="Banners, toasts and states">
      <Banner tone="info" title="Example data">Names, plates and numbers on this page are examples.</Banner>
      <Banner tone="warning" title="On hold since 12 Sep 2026">Reason: contract renewal.</Banner>
      <Banner tone="danger" onClose={() => undefined}>That email and password don&apos;t match. Check them and try again.</Banner>
      <Banner tone="success" actions={<Button size="sm">View</Button>}>3 requests approved.</Banner>
      <ViewingAsBar userName="Ananya Sharma" roleName="Site Admin" siteLabel="Alphatech Pune" onExit={() => toast.show({ message: 'Back to your own view' })} />
      <Labeled label="Toasts">
        <Button onClick={() => toast.show({ message: '1 request approved' })}>Success</Button>
        <Button onClick={() => toast.show({ message: '2 requests approved', actionLabel: 'Undo', onAction: () => undefined })}>Success + undo</Button>
        <Button onClick={() => toast.show({ tone: 'error', message: 'Couldn’t save. Nothing was changed.', actionLabel: 'Try again', onAction: () => undefined })}>Error + retry</Button>
      </Labeled>
      <div className="pf-preview-grid">
        <div className="pf-card"><EmptyState icon={Car} title="No pending requests for Alphatech Pune" text="New pass requests appear here." /></div>
        <div className="pf-card"><EmptyState icon={Search} title="No slots match these filters" actions={<Button variant="secondary">Clear filters</Button>} /></div>
        <div className="pf-card"><ErrorState onRetry={() => undefined} /></div>
        <div className="pf-card pf-stack">
          <Skeleton variant="title" width="60%" />
          <Skeleton width="90%" />
          <Skeleton width="75%" />
          <Skeleton variant="block" />
        </div>
      </div>
    </Section>
  );
};
