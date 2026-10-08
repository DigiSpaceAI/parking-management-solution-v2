import React, { useEffect, useId, useRef, useState } from 'react';
import { Building2, CheckCircle2, ChevronDown, Globe, MapPin } from 'lucide-react';
import type { SiteConfig } from '../types';
import { ALL_SITES } from '../utils/withSite';

interface SiteSwitcherProps {
  /** The sites the (effective) user may choose from (/my-sites). */
  sites: SiteConfig[];
  /** Chosen site id, 'ALL', or undefined when nothing is chosen yet. */
  currentSiteId?: string;
  /** Master Admin only (AC-05). */
  allowAllSites: boolean;
  /** Switching is not possible (e.g. while viewing as another user). */
  disabled?: boolean;
  onSelect: (siteId: string) => void;
}

interface Option {
  id: string;
  label: string;
  code?: string;
  detail?: string;
}

/**
 * Header site chip + switcher (02-ux-design §3.0, L-1, AC-01/AC-04/AC-05).
 * Visible at every width: full chip ≥ 1024 px, compact chip below, where the
 * list opens as a bottom sheet. The list is a proper listbox: ↑/↓, Home/End,
 * Enter selects, Esc closes and returns focus to the chip.
 */
export const SiteSwitcher: React.FC<SiteSwitcherProps> = ({
  sites,
  currentSiteId,
  allowAllSites,
  disabled = false,
  onSelect,
}) => {
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const rootRef = useRef<HTMLDivElement>(null);
  const chipRef = useRef<HTMLButtonElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const listId = useId();

  const options: Option[] = [
    ...(allowAllSites ? [{ id: ALL_SITES, label: 'All sites', detail: `${sites.length} sites` }] : []),
    ...sites.map((s) => ({ id: s.id, label: s.siteName, code: s.siteCode, detail: s.city })),
  ];
  const canSwitch = !disabled && options.length > 1;
  const isAll = currentSiteId === ALL_SITES;
  const activeSite = !isAll && currentSiteId ? sites.find((s) => s.id === currentSiteId) : undefined;

  const close = (returnFocus: boolean) => {
    setOpen(false);
    if (returnFocus) chipRef.current?.focus();
  };

  const choose = (id: string) => {
    close(true);
    if (id !== currentSiteId) onSelect(id);
  };

  useEffect(() => {
    if (!open) return;
    const selected = options.findIndex((o) => o.id === currentSiteId);
    setActiveIndex(selected >= 0 ? selected : 0);
    listRef.current?.focus();
    const onOutside = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onOutside);
    return () => document.removeEventListener('mousedown', onOutside);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const onListKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActiveIndex((i) => Math.min(i + 1, options.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActiveIndex((i) => Math.max(i - 1, 0));
    } else if (e.key === 'Home') {
      e.preventDefault();
      setActiveIndex(0);
    } else if (e.key === 'End') {
      e.preventDefault();
      setActiveIndex(options.length - 1);
    } else if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      const option = options[activeIndex];
      if (option) choose(option.id);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      close(true);
    } else if (e.key === 'Tab') {
      close(false);
    }
  };

  const chipLabel = isAll ? 'All sites' : activeSite ? `${activeSite.siteName} · ${activeSite.siteCode}` : 'Choose a site';

  return (
    <div className="relative min-w-0" ref={rootRef}>
      <button
        ref={chipRef}
        type="button"
        onClick={() => canSwitch && setOpen((o) => !o)}
        aria-haspopup={canSwitch ? 'listbox' : undefined}
        aria-expanded={canSwitch ? open : undefined}
        aria-label={`Site: ${chipLabel}${canSwitch ? '. Switch site' : ''}`}
        className={`flex items-center gap-2 px-2.5 lg:px-3 py-1.5 rounded-xl border text-xs font-semibold max-w-full focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 ${
          canSwitch
            ? 'bg-slate-50 hover:bg-slate-100 border-slate-300 text-slate-800 cursor-pointer shadow-sm'
            : 'bg-slate-50 border-slate-200 text-slate-700 cursor-default'
        }`}
      >
        <span className="w-6 h-6 rounded-lg bg-blue-100 text-blue-700 flex items-center justify-center shrink-0" aria-hidden="true">
          {isAll ? <Globe className="w-3.5 h-3.5" /> : <Building2 className="w-3.5 h-3.5" />}
        </span>
        {/* ≥ 1024 px: "{Site name} · {CODE}"; below: the code only */}
        <span className="hidden lg:inline font-bold text-slate-900 truncate max-w-[220px]">{chipLabel}</span>
        <span className="lg:hidden font-mono font-bold text-slate-900 truncate max-w-[90px]">
          {isAll ? 'All sites' : activeSite ? activeSite.siteCode : 'Choose site'}
        </span>
        {canSwitch && <ChevronDown className="w-3.5 h-3.5 text-slate-400 shrink-0" aria-hidden="true" />}
      </button>

      {open && (
        <>
          {/* Bottom-sheet backdrop below 1024 px */}
          <div className="fixed inset-0 z-40 bg-slate-900/40 lg:hidden" aria-hidden="true" onClick={() => close(true)} />
          <div className="fixed inset-x-0 bottom-0 z-50 rounded-t-2xl lg:absolute lg:inset-x-auto lg:bottom-auto lg:left-0 lg:mt-2 lg:w-80 lg:rounded-2xl bg-white shadow-2xl border border-slate-200 p-2.5 text-xs">
            <div className="px-2 py-1.5 border-b border-slate-100 mb-1" id={`${listId}-label`}>
              <span className="font-bold text-slate-900 text-sm">Switch site</span>
            </div>
            <ul
              ref={listRef}
              id={listId}
              role="listbox"
              tabIndex={-1}
              aria-labelledby={`${listId}-label`}
              aria-activedescendant={options[activeIndex] ? `${listId}-${activeIndex}` : undefined}
              onKeyDown={onListKeyDown}
              className="space-y-1 max-h-[60vh] lg:max-h-72 overflow-y-auto focus:outline-none"
            >
              {options.map((o, i) => {
                const selected = o.id === currentSiteId;
                const active = i === activeIndex;
                return (
                  <li
                    key={o.id}
                    id={`${listId}-${i}`}
                    role="option"
                    aria-selected={selected}
                    onClick={() => choose(o.id)}
                    onMouseEnter={() => setActiveIndex(i)}
                    className={`min-h-[44px] p-2 rounded-xl flex items-center justify-between gap-2 cursor-pointer border ${
                      selected ? 'bg-blue-50 text-blue-900 font-bold border-blue-200' : 'text-slate-700 border-transparent'
                    } ${active ? 'ring-2 ring-blue-500' : ''}`}
                  >
                    <span className="flex items-center gap-2 min-w-0">
                      {o.id === ALL_SITES ? (
                        <Globe className="w-4 h-4 text-blue-600 shrink-0" aria-hidden="true" />
                      ) : (
                        <MapPin className={`w-3.5 h-3.5 shrink-0 ${selected ? 'text-blue-600' : 'text-slate-400'}`} aria-hidden="true" />
                      )}
                      <span className="min-w-0">
                        <span className="block text-xs font-bold truncate">{o.label}</span>
                        {(o.code || o.detail) && (
                          <span className="block text-[10px] text-slate-500 font-mono truncate">
                            {[o.code, o.detail].filter(Boolean).join(' · ')}
                          </span>
                        )}
                      </span>
                    </span>
                    {selected && <CheckCircle2 className="w-4 h-4 text-blue-600 shrink-0" aria-hidden="true" />}
                  </li>
                );
              })}
            </ul>
          </div>
        </>
      )}
    </div>
  );
};
