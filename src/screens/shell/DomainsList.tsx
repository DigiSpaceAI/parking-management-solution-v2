import React, { useCallback, useEffect, useState } from 'react';
import { Plus, X } from 'lucide-react';
import type { WhitelistedDomain } from '../../types';
import { Banner, Button, EmptyState, ErrorState, IconButton, Skeleton, StatusChip, TextField } from '../../design-system/components';
import { COPY_SAVE_ERROR, saveErrorMessage, useSiteContext, withSite } from '../../utils/withSite';

const DOMAIN_RE = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+$/;

export interface DomainsListProps {
  /** The role may edit the list (REGISTRATION canEdit); the server enforces it too. */
  canEdit: boolean;
  /**
   * Manage this site's list instead of the header's site (Master Sites panel). The site
   * goes in the URL (?siteId=), which wins over the header (001 withSite).
   */
  siteId?: string;
}

/**
 * Allowed email domains for employee pass requests (001 AC-57), on design-system
 * components: replaces DomainWhitelistPanel inside Employees & vehicles and the
 * Sites side panel. Entries are "This site" or "All sites" (platform-wide, Master only).
 */
export const DomainsList: React.FC<DomainsListProps> = ({ canEdit, siteId: forSite }) => {
  const ctx = useSiteContext();
  const siteId = forSite ?? ctx.siteId;
  const [domains, setDomains] = useState<WhitelistedDomain[]>([]);
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading');
  const [value, setValue] = useState('');
  const [inputError, setInputError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const url = (path: string) => (forSite ? withSite(path, forSite) : path);

  const load = useCallback(async () => {
    setState('loading');
    try {
      const res = await fetch(forSite ? withSite('/api/v1/domains/manage', forSite) : '/api/v1/domains/manage');
      if (!res.ok) throw new Error(String(res.status));
      const data = (await res.json()) as { domains?: WhitelistedDomain[] };
      setDomains(Array.isArray(data.domains) ? data.domains : []);
      setState('ready');
    } catch {
      setState('error');
    }
  }, [forSite]);
  useEffect(() => {
    void load();
  }, [load]);

  const allSites = !forSite && ctx.isAllSites;
  const single = !!siteId && !allSites;
  const writable = canEdit && !ctx.isViewAs;
  const canAdd = writable && (single || (allSites && ctx.isMaster));
  const canRemove = (d: WhitelistedDomain) => writable && (ctx.isMaster ? allSites || !d.siteId || d.siteId === siteId : !!d.siteId && d.siteId === siteId);
  const scope = (d: WhitelistedDomain) => (!d.siteId ? 'All sites' : single && d.siteId === siteId ? 'This site' : ctx.siteCodeFor(d.siteId));

  const post = async (path: string, body: unknown, ok: string) => {
    setBusy(true);
    setMessage(null);
    try {
      const res = await fetch(url(path), { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      const data = (await res.json().catch(() => ({}))) as { success?: boolean; message?: string; errorCode?: string };
      if (res.ok && data.success !== false) {
        setMessage({ ok: true, text: ok });
        await load();
        return true;
      }
      setMessage({ ok: false, text: saveErrorMessage(data) });
    } catch {
      setMessage({ ok: false, text: COPY_SAVE_ERROR });
    } finally {
      setBusy(false);
    }
    return false;
  };
  const add = async (e: React.FormEvent) => {
    e.preventDefault();
    const clean = value.trim().toLowerCase().replace(/^@/, '');
    if (!DOMAIN_RE.test(clean)) {
      setInputError('Enter a domain like company.com');
      return;
    }
    setInputError(null);
    if (await post('/api/v1/domains/add', { domain: clean }, `@${clean} allowed for ${allSites ? 'all sites' : 'this site'}.`)) setValue('');
  };

  return (
    <div className="pf-stack">
      <p className="pf-card-note">Employees can request a pass only with an email at one of these domains.</p>
      {message && <Banner tone={message.ok ? 'success' : 'danger'}>{message.text}</Banner>}
      {state === 'loading' ? (
        <div className="pf-stack">
          <Skeleton width="60%" />
          <Skeleton width="50%" />
        </div>
      ) : state === 'error' ? (
        <ErrorState title="Couldn't load the domains" onRetry={() => void load()} />
      ) : domains.length === 0 ? (
        <EmptyState title="No domains yet" text={canAdd ? 'Add your company domain so employees can request a pass.' : undefined} />
      ) : (
        <ul className="pf-domains">
          {domains.map((d) => (
            <li key={d.id}>
              <span className="pf-domain-name">@{d.domain}</span>
              <StatusChip status={d.siteId ? 'ACTIVE' : 'INFO'} label={scope(d)} tone={d.siteId ? 'neutral' : 'info'} />
              {canRemove(d) && <IconButton icon={X} label={`Remove @${d.domain}`} disabled={busy} onClick={() => void post('/api/v1/domains/remove', { domainId: d.id }, `@${d.domain} removed.`)} />}
            </li>
          ))}
        </ul>
      )}
      {canAdd && (
        <form className="pf-form-row pf-form-row--end" onSubmit={add} noValidate>
          <TextField label={allSites ? 'Add a domain for all sites' : 'Add a domain'} fieldClassName="pf-grow" placeholder="company.com" value={value} error={inputError} onChange={(e) => setValue(e.target.value)} />
          <Button type="submit" icon={Plus} loading={busy} loadingLabel="Adding…">
            Add
          </Button>
        </form>
      )}
    </div>
  );
};
