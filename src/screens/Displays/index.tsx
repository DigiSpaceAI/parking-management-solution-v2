import React, { useMemo, useState } from 'react';
import { Monitor, Pencil, Plus, Power, RefreshCw, ScreenShare } from 'lucide-react';
import type { ModuleAccessRights } from '../../types';
import {
  ActionMenu, Banner, Button, EmptyState, ErrorState, Modal, PageHeader, SiteTag, StatusChip, Table, useNow, useToast, type Column,
} from '../../design-system/components';
import { formatAgo, formatNumber } from '../../utils/format';
import { useAutoRefresh } from '../../utils/useAutoRefresh';
import { COPY_SAVE_ERROR, saveErrorMessage, useSiteContext } from '../../utils/withSite';
import { displayState, displaysApi, hoursText, type DisplayRow } from './api';
import { seenText, STATE_CHIP } from './status';
import { DisplayEditor } from './DisplayEditor';
import { DisplayPanel } from './DisplayPanel';
import { ScreensGuide, SetUpDialog } from './SetUpDialog';

export interface DisplaysProps {
  siteId: string;
  /** DISPLAYS module rights (Master Admin and Site Admin by default; 03 B1). */
  rights: ModuleAccessRights;
}

type Editing = { mode: 'create'; from?: DisplayRow } | { mode: 'edit'; display: DisplayRow } | null;
type Confirm = { kind: 'replace' | 'switch-off'; display: DisplayRow } | null;
type SetUp = { display: DisplayRow; link: string | null; justSaved: boolean } | null;

/**
 * Displays (003 F4; UX C1–C7; AC-01, 02, 06, 17–21). Site Admin and Master Admin per site; All
 * sites is a read-only list with a Site column (C2). Rows open the display panel (C6) with the live
 * preview; Create and Edit open the editor (C4); a new display goes straight to Set up the screen
 * (C5: pair with a code, or its link, shown once). Writes are write-guarded (All sites, view-as).
 */
export const Displays: React.FC<DisplaysProps> = ({ siteId, rights }) => {
  const toast = useToast();
  const ctx = useSiteContext();
  const now = useNow(5000);
  const [rows, setRows] = useState<DisplayRow[]>([]);
  const [openId, setOpenId] = useState<string | null>(null);
  const [editing, setEditing] = useState<Editing>(null);
  const [setUp, setSetUp] = useState<SetUp>(null);
  const [confirm, setConfirm] = useState<Confirm>(null);
  const [busy, setBusy] = useState(false);
  const [guideOpen, setGuideOpen] = useState(false);
  const allSites = ctx.isAllSites;
  const canCreate = rights.canCreate && !allSites;
  const canEdit = rights.canEdit && !allSites;

  const refresh = useAutoRefresh(
    async (isCurrent) => {
      const r = await displaysApi.list();
      if (!r.ok) return false;
      if (!isCurrent()) return false;
      setRows((r.data.displays || []).slice().sort((a, b) => a.name.localeCompare(b.name)));
      return true;
    },
    [siteId]
  );
  const loading = refresh.loading && !refresh.updatedAt;

  // AC-17 / AC-21: offline screens and displays with no slots left need attention.
  const attention = useMemo(() => {
    const out: string[] = [];
    for (const d of rows) {
      if (d.status !== 'ACTIVE') continue;
      const st = displayState(d);
      if (st === 'OFFLINE') {
        const ago = d.lastSeenAt ? formatAgo(d.lastSeenAt, now) : '';
        out.push(/ ago$/.test(ago) ? `${d.name} has been offline for ${ago.replace(/ ago$/, '')}.` : `${d.name} is offline.`);
      }
      if (d.slotCount === 0) out.push(`${d.name} has no slots left to show.`);
    }
    return out;
  }, [rows, now]);
  const needAttention = rows.filter((d) => d.status === 'ACTIVE' && (displayState(d) === 'OFFLINE' || d.slotCount === 0)).length;

  const openRow = rows.find((r) => r.id === openId) ?? null;

  const doConfirm = async () => {
    if (!confirm) return;
    setBusy(true);
    try {
      const d = confirm.display;
      if (confirm.kind === 'replace') {
        const r = await displaysApi.replace(d.id);
        if (r.ok && r.data.link) {
          toast.show({ tone: 'success', message: 'Link replaced' });
          setConfirm(null);
          setSetUp({ display: d, link: r.data.link, justSaved: false });
        } else toast.show({ tone: 'error', message: saveErrorMessage(r.data) });
      } else {
        const r = await displaysApi.switchOff(d.id);
        if (r.ok) {
          toast.show({ tone: 'success', message: 'Display switched off' });
          setConfirm(null);
        } else toast.show({ tone: 'error', message: saveErrorMessage(r.data) });
      }
      await refresh.refresh();
    } catch {
      toast.show({ tone: 'error', message: COPY_SAVE_ERROR });
    } finally {
      setBusy(false);
    }
  };

  if (editing) {
    return (
      <DisplayEditor
        display={editing.mode === 'edit' ? editing.display : null}
        from={editing.mode === 'create' ? editing.from ?? null : null}
        others={rows}
        onCancel={() => setEditing(null)}
        onSaved={(display, link) => {
          setEditing(null);
          if (link) setSetUp({ display, link, justSaved: true });
          else toast.show({ tone: 'success', message: 'Display saved' });
          void refresh.refresh();
        }}
      />
    );
  }

  const menuFor = (d: DisplayRow) => {
    const off = d.status === 'SWITCHED_OFF';
    return (
      <ActionMenu
        label={`Actions for ${d.name}`}
        items={[
          { label: 'Edit', icon: Pencil, guard: true, disabled: !canEdit || off, onSelect: () => setEditing({ mode: 'edit', display: d }) },
          { label: 'Set up screen', icon: ScreenShare, guard: true, disabled: !canEdit || off, onSelect: () => setSetUp({ display: d, link: null, justSaved: false }) },
          { label: 'Replace link', icon: RefreshCw, guard: true, disabled: !canEdit || off, onSelect: () => setConfirm({ kind: 'replace', display: d }) },
          { label: 'Switch off', icon: Power, guard: true, destructive: true, disabled: !canEdit || off, onSelect: () => setConfirm({ kind: 'switch-off', display: d }) },
        ]}
      />
    );
  };

  const shows = (d: DisplayRow) =>
    d.status === 'ACTIVE' && d.slotCount === 0 ? (
      <span>
        <span className="pf-text-warning">No slots left</span>
        {d.missingSlots > 0 ? ` · ${formatNumber(d.missingSlots)} slots were deleted` : ''}
      </span>
    ) : (
      d.selectionSummary
    );
  const status = (d: DisplayRow) => {
    const chip = STATE_CHIP[displayState(d)];
    return (
      <span className="pf-stack pf-stack--tight pf-display-status">
        <StatusChip status={displayState(d)} label={chip.label} tone={chip.tone} />
        <span className="pf-cell-sub">{seenText(d, now)}</span>
      </span>
    );
  };
  const nameCell = (d: DisplayRow) => (
    <span className="pf-stack pf-stack--tight">
      <strong>{d.name}</strong>
      {d.location && <span className="pf-cell-sub">{d.location}</span>}
    </span>
  );
  const siteCell = (d: DisplayRow) => {
    const s = ctx.sites.find((x) => x.id === d.siteId);
    return (
      <span className="pf-row-inline">
        <SiteTag code={s?.siteCode || ctx.siteCodeFor(d.siteId)} /> {s?.siteName || ''}
      </span>
    );
  };
  const columns: Column<DisplayRow>[] = allSites
    ? [
        { key: 'name', header: 'Display', render: nameCell },
        { key: 'site', header: 'Site', render: siteCell },
        { key: 'shows', header: 'Shows', kind: 'secondary', render: shows },
        { key: 'status', header: 'Status', render: status },
        { key: 'hours', header: 'Hours', width: 'wide', render: (d) => hoursText(d.hours) },
      ]
    : [
        { key: 'name', header: 'Display', render: nameCell },
        { key: 'shows', header: 'Shows', kind: 'secondary', render: shows },
        { key: 'status', header: 'Status', render: status },
        { key: 'free', header: 'Free now', kind: 'num', render: (d) => (d.status === 'ACTIVE' && displayState(d) !== 'OFFLINE' && d.slotCount > 0 ? formatNumber(d.freeNow) : '—') },
        { key: 'hours', header: 'Hours', width: 'wide', render: (d) => hoursText(d.hours) },
      ];

  const createButton = (
    <Button variant="primary" icon={Plus} guard disabled={!canCreate} onClick={() => setEditing({ mode: 'create' })}>
      Create display
    </Button>
  );

  return (
    <>
      <PageHeader
        title="Displays"
        description={allSites ? 'Every site’s screens. Choose a site to create or change its displays.' : 'Screens at entrances and ramps that show drivers the free slots, live.'}
        updatedAt={refresh.updatedAt}
        primary={rights.canCreate ? createButton : undefined}
      />
      {allSites && (
        <Banner tone="info" title="All sites is view only.">
          To create, edit or switch off a display, choose its site in the site switcher.
        </Banner>
      )}
      {!allSites && needAttention > 0 && (
        <Banner tone="warning" title={`${needAttention} ${needAttention === 1 ? 'display needs' : 'displays need'} attention.`}>
          {attention.join(' ')}
        </Banner>
      )}
      {refresh.error && !refresh.updatedAt ? (
        <ErrorState title="Couldn’t load displays" onRetry={() => void refresh.refresh()} />
      ) : !loading && rows.length === 0 ? (
        <div className="pf-card">
          <EmptyState
            icon={Monitor}
            title={allSites ? 'No displays on any site yet' : 'No displays yet'}
            text="A display is a TV or screen at an entrance or ramp. It shows drivers which slots are free, updated within a few seconds. Choose the levels or slots it covers, then open its link on the screen."
            actions={
              <>
                {rights.canCreate && !allSites && createButton}
                <button type="button" className="pf-link" onClick={() => setGuideOpen(true)}>
                  Which screens work?
                </button>
              </>
            }
          />
        </div>
      ) : (
        <div className="pf-card pf-stack">
          <Table
            caption="Displays"
            columns={columns}
            rows={rows}
            rowKey={(d) => d.id}
            loading={loading}
            onRowClick={(d) => setOpenId(d.id)}
            rowMenu={allSites || !rights.canEdit ? undefined : menuFor}
          />
          <p className="pf-card-note">Offline means the screen hasn’t been in touch for 2 minutes.</p>
        </div>
      )}

      <DisplayPanel
        display={openRow}
        canEdit={canEdit}
        onClose={() => setOpenId(null)}
        onEdit={(d) => {
          setOpenId(null);
          setEditing({ mode: 'edit', display: d });
        }}
        onDuplicate={(d) => {
          setOpenId(null);
          setEditing({ mode: 'create', from: d });
        }}
        onSetUp={(d) => setSetUp({ display: d, link: null, justSaved: false })}
        onReplace={(d) => setConfirm({ kind: 'replace', display: d })}
        onSwitchOff={(d) => setConfirm({ kind: 'switch-off', display: d })}
      />

      <SetUpDialog
        open={!!setUp}
        display={setUp?.display ?? null}
        link={setUp?.link ?? null}
        justSaved={!!setUp?.justSaved}
        onClose={() => setSetUp(null)}
        onPaired={() => void refresh.refresh()}
        onReplace={(d) => {
          setSetUp(null);
          setConfirm({ kind: 'replace', display: d });
        }}
        onGuide={() => setGuideOpen(true)}
      />

      <Modal
        open={!!confirm}
        onClose={() => setConfirm(null)}
        title={confirm ? (confirm.kind === 'replace' ? `Replace the link for “${confirm.display.name}”?` : `Switch off “${confirm.display.name}”?`) : ''}
        footer={
          <>
            <Button onClick={() => setConfirm(null)}>Cancel</Button>
            <Button
              variant={confirm?.kind === 'switch-off' ? 'destructive' : 'primary'}
              guard
              loading={busy}
              loadingLabel={confirm?.kind === 'switch-off' ? 'Switching off…' : 'Replacing…'}
              onClick={() => void doConfirm()}
            >
              {confirm?.kind === 'switch-off' ? 'Switch off display' : 'Replace link'}
            </Button>
          </>
        }
      >
        {confirm?.kind === 'replace' ? (
          <div className="pf-stack">
            <p>Use this if the link was shared by mistake or the screen was swapped.</p>
            <ul className="pf-list">
              <li>The screen using the current link stops showing slots within 1 minute and says “This display has been switched off”.</li>
              <li>You get a new link and pairing code. The display’s settings stay the same.</li>
            </ul>
          </div>
        ) : (
          <div className="pf-stack">
            <p>The screen stops showing slots within 1 minute and says “This display has been switched off — ask your site admin”. Its link stops working for good.</p>
            <p className="pf-text-secondary">The display stays in the list as Switched off. To use the screen again, duplicate the display and set the copy up.</p>
          </div>
        )}
      </Modal>

      <ScreensGuide open={guideOpen} onClose={() => setGuideOpen(false)} />
    </>
  );
};
