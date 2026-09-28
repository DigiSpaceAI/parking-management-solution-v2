import React, { useCallback, useEffect, useState } from 'react';
import { Globe, MapPin, X } from 'lucide-react';
import type { WhitelistedDomain } from '../types';
import { useSiteContext } from '../utils/withSite';

interface DomainWhitelistPanelProps {
  /** The user's role may edit the whitelist (REGISTRATION canEdit); the server enforces it too. */
  canEdit: boolean;
}

const DOMAIN_RE = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+$/;

/**
 * Allowed email domains for self-registration, per site (PRD Addendum C, AC-57).
 * Each entry is labelled "This site" (or its site code in All sites mode) or
 * "All sites" (platform-wide). A Site Admin adds and removes only their own
 * site's domains; platform-wide entries are Master Admin only. New domains go
 * to the site chosen in the header; a Master Admin in All sites mode adds a
 * platform-wide domain. The list comes from GET /domains, which the fetch
 * wrapper scopes to the active site (that site's entries + platform-wide ones).
 */
export const DomainWhitelistPanel: React.FC<DomainWhitelistPanelProps> = ({ canEdit }) => {
  const { siteId, activeSite, isAllSites, isViewAs, isMaster, siteCodeFor } = useSiteContext();
  const [domains, setDomains] = useState<WhitelistedDomain[]>([]);
  const [loadState, setLoadState] = useState<'loading' | 'ready' | 'error'>('loading');
  const [newDomain, setNewDomain] = useState('');
  const [inputError, setInputError] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null);

  const load = useCallback(async () => {
    setLoadState('loading');
    try {
      const res = await fetch('/api/v1/domains');
      const data = (await res.json()) as { domains?: WhitelistedDomain[] };
      if (!res.ok) throw new Error(String(res.status));
      setDomains(Array.isArray(data.domains) ? data.domains : []);
      setLoadState('ready');
    } catch {
      setLoadState('error');
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const singleSite = !!siteId && !isAllSites;
  const canAdd = canEdit && !isViewAs && (singleSite || (isAllSites && isMaster));
  const canRemove = (d: WhitelistedDomain) => {
    if (!canEdit || isViewAs) return false;
    if (isMaster) return isAllSites || !d.siteId || d.siteId === siteId;
    return !!d.siteId && d.siteId === siteId;
  };
  const scopeLabel = (d: WhitelistedDomain) =>
    !d.siteId ? 'All sites' : singleSite && d.siteId === siteId ? 'This site' : siteCodeFor(d.siteId);

  const add = async (e: React.FormEvent) => {
    e.preventDefault();
    const clean = newDomain.trim().toLowerCase().replace(/^@/, '');
    if (!DOMAIN_RE.test(clean)) {
      setInputError('Enter a domain like company.com');
      return;
    }
    setInputError('');
    setBusy(true);
    setMessage(null);
    try {
      const res = await fetch('/api/v1/domains/add', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ domain: clean }),
      });
      const data = (await res.json().catch(() => ({}))) as { success?: boolean; message?: string };
      if (res.ok && data.success !== false) {
        setNewDomain('');
        setMessage({ kind: 'ok', text: `@${clean} allowed for ${isAllSites ? 'all sites' : activeSite?.siteName || 'this site'}.` });
        load();
      } else {
        setMessage({ kind: 'error', text: data.message || 'Couldn’t save. Nothing was changed.' });
      }
    } catch {
      setMessage({ kind: 'error', text: 'Couldn’t save. Nothing was changed.' });
    } finally {
      setBusy(false);
    }
  };

  const remove = async (d: WhitelistedDomain) => {
    setBusy(true);
    setMessage(null);
    try {
      const res = await fetch('/api/v1/domains/remove', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ domainId: d.id }),
      });
      const data = (await res.json().catch(() => ({}))) as { success?: boolean; message?: string };
      if (res.ok && data.success !== false) {
        setMessage({ kind: 'ok', text: `@${d.domain} removed.` });
        load();
      } else {
        setMessage({ kind: 'error', text: data.message || 'Couldn’t save. Nothing was changed.' });
      }
    } catch {
      setMessage({ kind: 'error', text: 'Couldn’t save. Nothing was changed.' });
    } finally {
      setBusy(false);
    }
  };

  const inputId = 'domain-whitelist-input';

  return (
    <section className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm">
      <h3 className="text-sm font-bold text-slate-900">Allowed email domains</h3>
      <p className="text-xs text-slate-600 mt-1">Employees can self-register only with an email from these domains.</p>

      <div className="mt-3 flex flex-wrap gap-2" aria-live="polite">
        {loadState === 'loading' && <span className="text-xs text-slate-500">Loading…</span>}
        {loadState === 'error' && (
          <span role="alert" className="text-xs text-rose-700">
            We couldn't load this. Check your connection and try again.{' '}
            <button type="button" onClick={load} className="font-bold underline">
              Try again
            </button>
          </span>
        )}
        {loadState === 'ready' && domains.length === 0 && (
          <span className="text-xs text-slate-500">No domains allowed yet. Registration stays closed until one is added.</span>
        )}
        {loadState === 'ready' &&
          domains.map((d) => (
            <span
              key={d.id}
              className={`inline-flex items-center gap-1.5 pl-2.5 pr-1.5 py-1 rounded-lg border text-xs font-mono ${
                d.isActive === false ? 'bg-slate-50 border-slate-200 text-slate-500' : 'bg-blue-50 border-blue-200 text-blue-900'
              }`}
            >
              <span>@{d.domain}</span>
              <span
                className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-sans font-bold ${
                  d.siteId ? 'bg-white text-slate-700 border border-slate-200' : 'bg-indigo-100 text-indigo-800'
                }`}
              >
                {d.siteId ? <MapPin className="w-3 h-3" aria-hidden="true" /> : <Globe className="w-3 h-3" aria-hidden="true" />}
                {scopeLabel(d)}
              </span>
              {d.isActive === false && <span className="font-sans text-[10px]">inactive</span>}
              {canRemove(d) && (
                <button
                  type="button"
                  onClick={() => remove(d)}
                  disabled={busy}
                  aria-label={`Remove @${d.domain}`}
                  title="Remove"
                  className="p-1 rounded hover:bg-rose-100 text-slate-500 hover:text-rose-700 disabled:opacity-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
                >
                  <X className="w-3 h-3" aria-hidden="true" />
                </button>
              )}
            </span>
          ))}
      </div>

      {!isMaster && loadState === 'ready' && domains.some((d) => !d.siteId) && (
        <p className="text-[11px] text-slate-500 mt-2">Domains marked All sites are managed by your Master Admin.</p>
      )}

      {canAdd && (
        <form onSubmit={add} className="mt-4" noValidate>
          <label htmlFor={inputId} className="block text-xs font-semibold text-slate-700">
            Add a domain
          </label>
          <div className="mt-1 flex gap-2">
            <input
              id={inputId}
              value={newDomain}
              onChange={(e) => setNewDomain(e.target.value)}
              placeholder="company.com"
              aria-invalid={!!inputError}
              aria-describedby={`${inputId}-help${inputError ? ` ${inputId}-error` : ''}`}
              className="flex-1 min-w-0 px-3 py-2 border border-slate-300 rounded-xl text-sm font-mono focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <button
              type="submit"
              disabled={busy || !newDomain.trim()}
              className="px-4 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-sm font-bold disabled:opacity-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2"
            >
              {busy ? 'Adding…' : 'Add'}
            </button>
          </div>
          {inputError && (
            <p id={`${inputId}-error`} className="mt-1 text-xs text-rose-700">
              {inputError}
            </p>
          )}
          <p id={`${inputId}-help`} className="mt-1 text-[11px] text-slate-500">
            {isAllSites
              ? 'New domains apply to every site.'
              : `New domains apply to ${activeSite?.siteName || 'this site'} only.`}
            {isMaster && !isAllSites && ' To allow a domain for every site, switch to All sites.'}
          </p>
        </form>
      )}

      {message && (
        <p role={message.kind === 'error' ? 'alert' : 'status'} className={`mt-2 text-xs ${message.kind === 'error' ? 'text-rose-700' : 'text-emerald-700'}`}>
          {message.text}
        </p>
      )}
    </section>
  );
};
