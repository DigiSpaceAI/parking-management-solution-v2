import React, { useEffect, useId, useRef, useState } from 'react';
import type { LucideIcon } from 'lucide-react';
import { Check, ChevronDown, Globe, MapPin, MoreHorizontal, X } from 'lucide-react';
import { formatAgo } from '../../utils/format';
import { cx } from './cx';
import { Icon } from './Icon';
import { IconButton } from './Button';
import { CountBadge } from './StatusChip';
import { useGuard } from '../guard';
import logoUrl from '../brand/parkflows-logo.svg';
import markUrl from '../brand/parkflows-mark.svg';

/* App shell, design-system order 8 (002 tech design): TopBar + NavGroupList + NavDrawer (<1024px)
   + PageHeader + SiteSwitcher, plus the "⋯" ActionMenu the page template needs (AC-09). */

/** Re-renders every `ms` so "Updated 12s ago" stays true. */
export function useNow(ms = 5000): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), ms);
    return () => clearInterval(t);
  }, [ms]);
  return now;
}

/** Closes a popup on a press outside `root` and on Escape (focus goes back to `trigger`). */
function useDismiss(open: boolean, close: (returnFocus: boolean) => void, root: React.RefObject<HTMLElement | null>) {
  const closeRef = useRef(close);
  closeRef.current = close;
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent | TouchEvent) => {
      if (root.current && !root.current.contains(e.target as Node)) closeRef.current(false);
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('touchstart', onDown);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('touchstart', onDown);
    };
  }, [open, root]);
}

// ---- Brand ----

export interface BrandProps {
  href?: string;
  onClick?: (e: React.MouseEvent<HTMLAnchorElement>) => void;
}

/** The one logo (AC-21): full logo from 768px, the mark alone below (full logo needs ≥ 24px high and room). */
export const Brand: React.FC<BrandProps> = ({ href = '#', onClick }) => (
  <a className="pf-brand" href={href} onClick={onClick} aria-label="ParkFlows home">
    <img className="pf-brand-logo" src={logoUrl} alt="" width={141} height={32} />
    <img className="pf-brand-mark" src={markUrl} alt="" width={32} height={32} />
  </a>
);

// ---- Navigation ----

export interface NavItem {
  id: string;
  label: string;
  icon: LucideIcon;
  href: string;
  /** Count badge only (AC-07); hidden at zero. */
  count?: number;
  /** What the count counts, for screen readers: "pending requests". */
  countLabel?: string;
  alert?: boolean;
}

export interface NavGroup {
  label: string;
  items: NavItem[];
}

export interface NavGroupListProps {
  groups: NavGroup[];
  current: string | null;
  /** Called on a click (e.g. to close the drawer). The link's href does the navigation unless the handler prevents it. */
  onNavigate?: (id: string, e: React.MouseEvent<HTMLAnchorElement>) => void;
  label?: string;
  className?: string;
}

/** One grouped list of the modules the user may open (AC-07). Labels equal the page titles. */
export const NavGroupList: React.FC<NavGroupListProps> = ({ groups, current, onNavigate, label = 'Main', className }) => (
  <nav className={cx('pf-nav', className)} aria-label={label}>
    {groups
      .filter((g) => g.items.length > 0)
      .map((g) => (
        <div key={g.label} className="pf-nav-section" role="group" aria-label={g.label}>
          <div className="pf-nav-group" aria-hidden="true">
            {g.label}
          </div>
          {g.items.map((item) => (
            <a
              key={item.id}
              className="pf-nav-item"
              href={item.href}
              aria-current={item.id === current ? 'page' : undefined}
              onClick={(e) => onNavigate?.(item.id, e)}
            >
              <Icon icon={item.icon} size={20} />
              <span className="pf-nav-label">{item.label}</span>
              {item.count ? <CountBadge count={item.count} alert={item.alert} label={item.countLabel} /> : null}
            </a>
          ))}
        </div>
      ))}
  </nav>
);

export interface NavDrawerProps {
  open: boolean;
  onClose: () => void;
  children: React.ReactNode;
}

/** The nav below 1024px: a <dialog> from the left (focus trap, Esc and backdrop from showModal). */
export const NavDrawer: React.FC<NavDrawerProps> = ({ open, onClose, children }) => {
  const ref = useRef<HTMLDialogElement>(null);
  const opener = useRef<Element | null>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) {
      opener.current = document.activeElement;
      d.showModal();
    } else if (!open && d.open) {
      d.close();
      if (opener.current instanceof HTMLElement && opener.current.isConnected) opener.current.focus();
    }
  }, [open]);
  // A wider window turns the drawer into the permanent nav: close it.
  useEffect(() => {
    if (!open || typeof window.matchMedia !== 'function') return;
    const mq = window.matchMedia('(min-width: 1024px)');
    const onChange = () => mq.matches && onCloseRef.current();
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, [open]);
  return (
    <dialog
      ref={ref}
      className="pf-drawer"
      aria-label="Menu"
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      onClose={() => open && onClose()}
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      {open && (
        <>
          <div className="pf-drawer-head">
            <Brand />
            <IconButton icon={X} label="Close menu" onClick={onClose} />
          </div>
          {children}
        </>
      )}
    </dialog>
  );
};

// ---- Menus ----

export interface ActionMenuItem {
  label: string;
  onSelect: () => void;
  icon?: LucideIcon;
  destructive?: boolean;
  disabled?: boolean;
  /** A write action: the 001 write guard disables it in All sites mode and view-as. */
  guard?: boolean;
}

export interface ActionMenuProps {
  items: ActionMenuItem[];
  /** Accessible name of the trigger, e.g. "More actions" or "More actions for Rahul Sharma". */
  label?: string;
  align?: 'start' | 'end';
  className?: string;
}

/** The "⋯" menu: secondary page or row actions (AC-09). Arrow keys, Home/End, Esc. */
export const ActionMenu: React.FC<ActionMenuProps> = ({ items, label = 'More actions', align = 'end', className }) => {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const itemRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const menuId = useId();
  const guardFn = useGuard();
  const resolved = items.map((it) => {
    const g = it.guard ? guardFn(it.label) : null;
    return { ...it, isDisabled: !!it.disabled || !!g?.disabled, title: g?.disabled ? g.title : undefined };
  });
  const close = (returnFocus: boolean) => {
    setOpen(false);
    if (returnFocus) trigger.current?.focus();
  };
  useDismiss(open, close, root);
  useEffect(() => {
    if (open) itemRefs.current.find((b) => b && !b.disabled)?.focus();
  }, [open]);
  const move = (from: number, step: number) => {
    const enabled = itemRefs.current.map((b, i) => (b && !b.disabled ? i : -1)).filter((i) => i >= 0);
    if (!enabled.length) return;
    const at = enabled.indexOf(from);
    const next = step === Infinity ? enabled[enabled.length - 1] : step === -Infinity ? enabled[0] : enabled[(at + step + enabled.length) % enabled.length];
    itemRefs.current[next]?.focus();
  };
  const onKeyDown = (e: React.KeyboardEvent, i: number) => {
    if (e.key === 'ArrowDown') move(i, 1);
    else if (e.key === 'ArrowUp') move(i, -1);
    else if (e.key === 'Home') move(i, -Infinity);
    else if (e.key === 'End') move(i, Infinity);
    else if (e.key === 'Escape') {
      e.stopPropagation();
      close(true);
    } else if (e.key === 'Tab') close(false);
    else return;
    if (e.key !== 'Tab') e.preventDefault();
  };
  if (!items.length) return null;
  return (
    <div className={cx('pf-pop', align === 'start' && 'pf-pop--start', className)} ref={root}>
      <button
        ref={trigger}
        type="button"
        className="pf-icon-btn"
        aria-label={label}
        title={label}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        onClick={() => setOpen((o) => !o)}
        onKeyDown={(e) => {
          if (e.key === 'ArrowDown' && !open) {
            e.preventDefault();
            setOpen(true);
          }
        }}
      >
        <Icon icon={MoreHorizontal} size={20} />
      </button>
      {open && (
        <div className="pf-menu" role="menu" id={menuId} aria-label={label}>
          {resolved.map((it, i) => (
            <button
              key={it.label}
              ref={(el) => {
                itemRefs.current[i] = el;
              }}
              type="button"
              role="menuitem"
              tabIndex={-1}
              className={cx('pf-menu-item', it.destructive && 'pf-menu-item--danger')}
              disabled={it.isDisabled}
              title={it.title}
              data-write-guard={it.guard ? '' : undefined}
              onClick={() => {
                close(true);
                it.onSelect();
              }}
              onKeyDown={(e) => onKeyDown(e, i)}
            >
              {it.icon && <Icon icon={it.icon} size={16} />}
              <span>{it.label}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
};

// ---- Page header ----

export interface PageHeaderProps {
  title: string;
  /** One line under the title (AC-09). */
  description?: React.ReactNode;
  /** When the data on the page was last loaded: "Updated 12s ago" (AC-11). Leave undefined for pages that don't refresh. */
  updatedAt?: number | null;
  /** At most one primary action (AC-09). */
  primary?: React.ReactNode;
  /** Everything else goes in the "⋯" menu. */
  menu?: ActionMenuItem[];
  className?: string;
}

/** The page template's head: H1, optional description and "Updated Xs ago", one primary action + "⋯". */
export const PageHeader: React.FC<PageHeaderProps> = ({ title, description, updatedAt, primary, menu, className }) => {
  const now = useNow();
  return (
    <header className={cx('pf-page-head', className)}>
      <div className="pf-page-head-text">
        <h1 tabIndex={-1} data-page-title="">
          {title}
        </h1>
        {description && <p>{description}</p>}
        {updatedAt !== undefined && <span className="pf-updated">{updatedAt ? `Updated ${formatAgo(updatedAt, Math.max(now, updatedAt))}` : 'Loading…'}</span>}
      </div>
      {(primary || (menu && menu.length > 0)) && (
        <div className="pf-page-head-actions">
          {primary}
          {menu && menu.length > 0 && <ActionMenu items={menu} label={`More actions: ${title}`} />}
        </div>
      )}
    </header>
  );
};

// ---- Site switcher ----

export interface SwitcherSite {
  id: string;
  name: string;
  code: string;
  city?: string;
}

export interface SiteSwitcherProps {
  sites: SwitcherSite[];
  /** Chosen site id, `allId`, or null when nothing is chosen yet. */
  value: string | null;
  /** Offer "All sites" (Master Admin only, 001 AC-05). */
  allowAll: boolean;
  allId: string;
  /** No switching (e.g. while viewing as another user). */
  disabled?: boolean;
  onSelect: (siteId: string) => void;
}

/**
 * The one place the current site is shown (AC-23), reachable at every width (AC-18).
 * Restyle of 001's SiteSwitcher with the same listbox behaviour: ↑/↓, Home/End, Enter
 * selects, Esc closes and returns focus. Below 768px it shows the code only and the
 * list opens full width under the top bar.
 */
export const SiteSwitcher: React.FC<SiteSwitcherProps> = ({ sites, value, allowAll, allId, disabled = false, onSelect }) => {
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const root = useRef<HTMLDivElement>(null);
  const chip = useRef<HTMLButtonElement>(null);
  const list = useRef<HTMLUListElement>(null);
  const listId = useId();
  const options = [
    ...(allowAll ? [{ id: allId, name: 'All sites', code: '', city: `${sites.length} sites` }] : []),
    ...sites,
  ];
  const canSwitch = !disabled && options.length > 1;
  const isAll = value === allId;
  const current = !isAll && value ? sites.find((s) => s.id === value) : undefined;
  const name = isAll ? 'All sites' : current ? current.name : 'Choose a site';
  const label = isAll ? 'All sites' : current ? `${current.name} · ${current.code}` : 'Choose a site';

  const close = (returnFocus: boolean) => {
    setOpen(false);
    if (returnFocus) chip.current?.focus();
  };
  useDismiss(open, close, root);
  useEffect(() => {
    if (!open) return;
    const i = options.findIndex((o) => o.id === value);
    setActive(i >= 0 ? i : 0);
    list.current?.focus();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);
  const choose = (id: string) => {
    close(true);
    if (id !== value) onSelect(id);
  };
  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') setActive((i) => Math.min(i + 1, options.length - 1));
    else if (e.key === 'ArrowUp') setActive((i) => Math.max(i - 1, 0));
    else if (e.key === 'Home') setActive(0);
    else if (e.key === 'End') setActive(options.length - 1);
    else if (e.key === 'Enter' || e.key === ' ') {
      const o = options[active];
      if (o) choose(o.id);
    } else if (e.key === 'Escape') {
      e.stopPropagation();
      close(true);
    } else if (e.key === 'Tab') {
      close(false);
      return;
    } else return;
    e.preventDefault();
  };

  const face = (
    <>
      <Icon icon={isAll ? Globe : MapPin} size={16} />
      <span className="pf-switcher-name">{name}</span>
      {current && <span className="pf-site-tag">{current.code}</span>}
      {canSwitch && <Icon icon={ChevronDown} size={16} />}
    </>
  );

  if (!canSwitch) {
    return (
      <span className="pf-switcher" aria-disabled="true" role="group" aria-label={`Site: ${label}`}>
        {face}
      </span>
    );
  }
  return (
    <div className="pf-pop pf-pop--start pf-pop--sheet" ref={root}>
      <button
        ref={chip}
        type="button"
        className="pf-switcher"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={`Site: ${label}. Switch site`}
        onClick={() => setOpen((o) => !o)}
      >
        {face}
      </button>
      {open && (
        <div className="pf-menu">
          <div className="pf-menu-head" id={`${listId}-label`}>
            Switch site
          </div>
          <ul
            ref={list}
            id={listId}
            role="listbox"
            tabIndex={-1}
            className="pf-menu-list"
            aria-labelledby={`${listId}-label`}
            aria-activedescendant={options[active] ? `${listId}-${active}` : undefined}
            onKeyDown={onKeyDown}
          >
            {options.map((o, i) => (
              <li
                key={o.id}
                id={`${listId}-${i}`}
                role="option"
                aria-selected={o.id === value}
                data-active={i === active ? 'true' : undefined}
                className="pf-menu-item"
                onClick={() => choose(o.id)}
                onMouseEnter={() => setActive(i)}
              >
                <Icon icon={o.id === allId ? Globe : MapPin} size={16} />
                <span className="pf-menu-item-text">
                  <span>{o.name}</span>
                  {(o.code || o.city) && <small>{[o.code, o.city].filter(Boolean).join(' · ')}</small>}
                </span>
                {o.id === value && <Check className="pf-check-icon" aria-hidden="true" strokeWidth={2} />}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
};

// ---- Top-bar popups: notifications and account ----

export interface TopBarMenuEntry {
  label: string;
  /** A link (hash route). */
  href?: string;
  onSelect?: () => void;
  icon?: LucideIcon;
  count?: number;
}

export interface TopBarMenuProps {
  /** The trigger: an icon, or an account face. */
  trigger: React.ReactNode;
  triggerClassName?: string;
  /** Accessible name of the trigger, e.g. "Notifications: 3 pending requests, 2 alerts". */
  label: string;
  /** A block at the top (who is signed in, or "Nothing needs your attention"). */
  head?: React.ReactNode;
  entries: TopBarMenuEntry[];
}

/** A small menu off the top bar (notifications, account). Links and buttons as menu items. */
export const TopBarMenu: React.FC<TopBarMenuProps> = ({ trigger, triggerClassName = 'pf-icon-btn', label, head, entries }) => {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const btn = useRef<HTMLButtonElement>(null);
  const refs = useRef<Array<HTMLElement | null>>([]);
  const menuId = useId();
  const close = (returnFocus: boolean) => {
    setOpen(false);
    if (returnFocus) btn.current?.focus();
  };
  useDismiss(open, close, root);
  useEffect(() => {
    if (open) refs.current[0]?.focus();
  }, [open]);
  const onKeyDown = (e: React.KeyboardEvent, i: number) => {
    const n = entries.length;
    let next = -1;
    if (e.key === 'ArrowDown') next = (i + 1) % n;
    else if (e.key === 'ArrowUp') next = (i - 1 + n) % n;
    else if (e.key === 'Home') next = 0;
    else if (e.key === 'End') next = n - 1;
    else if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      close(true);
      return;
    } else if (e.key === 'Tab') {
      close(false);
      return;
    }
    if (next >= 0) {
      e.preventDefault();
      refs.current[next]?.focus();
    }
  };
  return (
    <div className="pf-pop" ref={root}>
      <button
        ref={btn}
        type="button"
        className={triggerClassName}
        aria-label={label}
        title={label}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        onClick={() => setOpen((o) => !o)}
      >
        {trigger}
      </button>
      {open && (
        <div className="pf-menu" id={menuId} role="menu" aria-label={label}>
          {head && (
            <div className="pf-menu-head" role="none">
              {head}
            </div>
          )}
          {head && entries.length > 0 && <div className="pf-menu-sep" role="separator" />}
          {entries.map((e, i) => {
            const body = (
              <>
                {e.icon && <Icon icon={e.icon} size={16} />}
                <span className="pf-menu-item-text">{e.label}</span>
                {e.count ? <CountBadge count={e.count} /> : null}
              </>
            );
            const common = {
              ref: (el: HTMLElement | null) => {
                refs.current[i] = el;
              },
              role: 'menuitem',
              tabIndex: -1,
              className: 'pf-menu-item',
              onKeyDown: (ev: React.KeyboardEvent) => onKeyDown(ev, i),
            };
            return e.href ? (
              <a key={e.label} href={e.href} {...common} onClick={() => close(false)}>
                {body}
              </a>
            ) : (
              <button
                key={e.label}
                type="button"
                {...common}
                onClick={() => {
                  close(false);
                  e.onSelect?.();
                }}
              >
                {body}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
};

/** Initials for the account button: "Priya Nair" → "PN". */
export function initials(name: string | null | undefined): string {
  const parts = (name || '').trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return '?';
  return ((parts[0][0] || '') + (parts.length > 1 ? parts[parts.length - 1][0] : '')).toUpperCase();
}
