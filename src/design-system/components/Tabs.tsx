import React, { useRef } from 'react';
import type { LucideIcon } from 'lucide-react';
import { cx } from './cx';
import { CountBadge } from './StatusChip';
import { Icon } from './Icon';
import { formatNumber } from '../../utils/format';

export interface TabItem {
  id: string;
  label: string;
  count?: number;
  disabled?: boolean;
  icon?: LucideIcon;
}

/** Arrow-key navigation shared by tab-like lists (roving tabindex; Home/End). */
function useRovingKeys(items: { id: string; disabled?: boolean }[], onPick: (id: string) => void) {
  const refs = useRef(new Map<string, HTMLButtonElement | null>());
  const onKeyDown = (e: React.KeyboardEvent, current: string) => {
    const enabled = items.filter((i) => !i.disabled);
    const at = enabled.findIndex((i) => i.id === current);
    let next = -1;
    if (e.key === 'ArrowRight' || e.key === 'ArrowDown') next = (at + 1) % enabled.length;
    else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') next = (at - 1 + enabled.length) % enabled.length;
    else if (e.key === 'Home') next = 0;
    else if (e.key === 'End') next = enabled.length - 1;
    if (next < 0) return;
    e.preventDefault();
    const id = enabled[next].id;
    onPick(id);
    refs.current.get(id)?.focus();
  };
  return { refs, onKeyDown };
}

/**
 * Which item gets tabIndex=0 (05 round 1, m-4): the selected one if it is enabled, otherwise the first
 * enabled item, so keyboard users can always Tab into the list even when `value` matches nothing or
 * points at a disabled item.
 */
function tabStop(items: { id: string; disabled?: boolean }[], value: string): string | undefined {
  return items.find((i) => i.id === value && !i.disabled)?.id ?? items.find((i) => !i.disabled)?.id;
}

export interface TabsProps {
  tabs: TabItem[];
  value: string;
  onChange: (id: string) => void;
  /** Accessible name of the tab list, e.g. "Request status". */
  label: string;
  /** Prefix for tab/panel ids; panels use `${idBase}-panel-${id}`. */
  idBase: string;
  className?: string;
}

/** Tabs with counts (Requests · Registered · Rejected). Render the panel with <TabPanel>. */
export const Tabs: React.FC<TabsProps> = ({ tabs, value, onChange, label, idBase, className }) => {
  const { refs, onKeyDown } = useRovingKeys(tabs, onChange);
  const stop = tabStop(tabs, value);
  return (
    <div className={cx('pf-tabs', className)} role="tablist" aria-label={label}>
      {tabs.map((t) => {
        const selected = t.id === value;
        return (
          <button
            key={t.id}
            ref={(el) => {
              refs.current.set(t.id, el);
            }}
            type="button"
            role="tab"
            id={`${idBase}-tab-${t.id}`}
            aria-selected={selected}
            aria-controls={`${idBase}-panel-${t.id}`}
            tabIndex={t.id === stop ? 0 : -1}
            disabled={t.disabled}
            className="pf-tab"
            onClick={() => onChange(t.id)}
            onKeyDown={(e) => onKeyDown(e, t.id)}
          >
            {t.icon && <Icon icon={t.icon} size={16} />}
            {t.label}
            {t.count !== undefined && <CountBadge count={t.count} />}
          </button>
        );
      })}
    </div>
  );
};

/** The panel that belongs to a tab in <Tabs> or <SegmentedControl>. */
export const TabPanel: React.FC<{ idBase: string; id: string; children: React.ReactNode; className?: string }> = ({ idBase, id, children, className }) => (
  <div role="tabpanel" id={`${idBase}-panel-${id}`} aria-labelledby={`${idBase}-tab-${id}`} tabIndex={0} className={className}>
    {children}
  </div>
);

export interface SegmentedControlProps {
  options: TabItem[];
  value: string;
  onChange: (id: string) => void;
  label: string;
  idBase: string;
  className?: string;
  /**
   * true (default): the switcher owns <TabPanel>s, so it is a tablist (Live parking slots · Puzzle wise status).
   * false: it only changes how the same content is shown (Cards | List), so it is a radio group with no panels.
   */
  hasPanels?: boolean;
}

/** View switcher: "Live parking slots (n) · Puzzle wise status (n)" (tabs), "Cards | List" (radio group). */
export const SegmentedControl: React.FC<SegmentedControlProps> = ({ options, value, onChange, label, idBase, className, hasPanels = true }) => {
  const { refs, onKeyDown } = useRovingKeys(options, onChange);
  const stop = tabStop(options, value);
  return (
    <div className={cx('pf-seg', className)} role={hasPanels ? 'tablist' : 'radiogroup'} aria-label={label}>
      {options.map((o) => {
        const selected = o.id === value;
        const a11y = hasPanels
          ? { role: 'tab', id: `${idBase}-tab-${o.id}`, 'aria-selected': selected, 'aria-controls': `${idBase}-panel-${o.id}` }
          : { role: 'radio', 'aria-checked': selected };
        return (
          <button
            key={o.id}
            ref={(el) => {
              refs.current.set(o.id, el);
            }}
            type="button"
            {...a11y}
            tabIndex={o.id === stop ? 0 : -1}
            disabled={o.disabled}
            className="pf-seg-btn"
            onClick={() => onChange(o.id)}
            onKeyDown={(e) => onKeyDown(e, o.id)}
          >
            {o.icon && <Icon icon={o.icon} size={16} />}
            {o.label}
            {o.count !== undefined && <span className="pf-num">({formatNumber(o.count)})</span>}
          </button>
        );
      })}
    </div>
  );
};

export interface LevelOption {
  id: string;
  label: string;
  free: number;
  total: number;
}

export interface LevelButtonsProps {
  levels: LevelOption[];
  value: string;
  onChange: (id: string) => void;
  /** Accessible name, e.g. "Level". */
  label: string;
  className?: string;
}

/** Level filter: "All parking · Basement B1 · …" each with "N free / total". One choice (radio group). */
export const LevelButtons: React.FC<LevelButtonsProps> = ({ levels, value, onChange, label, className }) => {
  const { refs, onKeyDown } = useRovingKeys(levels, onChange);
  const stop = tabStop(levels, value);
  return (
    <div className={cx('pf-level', className)} role="radiogroup" aria-label={label}>
      {levels.map((l) => {
        const checked = l.id === value;
        return (
          <button
            key={l.id}
            ref={(el) => {
              refs.current.set(l.id, el);
            }}
            type="button"
            role="radio"
            aria-checked={checked}
            tabIndex={l.id === stop ? 0 : -1}
            className="pf-level-btn"
            onClick={() => onChange(l.id)}
            onKeyDown={(e) => onKeyDown(e, l.id)}
          >
            {l.label}
            <small>
              {formatNumber(l.free)} free / {formatNumber(l.total)}
            </small>
          </button>
        );
      })}
    </div>
  );
};
