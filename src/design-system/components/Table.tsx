import React, { useEffect, useRef } from 'react';
import { ArrowDown, ArrowUp, ArrowUpDown, X } from 'lucide-react';
import { cx } from './cx';
import { Icon } from './Icon';
import { Checkbox } from './Checkbox';
import { Skeleton } from './States';
import { Button } from './Button';

export interface Column<T> {
  key: string;
  header: string;
  render: (row: T) => React.ReactNode;
  sortable?: boolean;
  /** Right-aligned tabular numbers, or secondary (grey) text. */
  kind?: 'num' | 'secondary';
  /** Hide this column in the phone card view (it's repeated elsewhere). */
  hideInCard?: boolean;
}

export type SortDir = 'asc' | 'desc';

export interface TableProps<T> {
  columns: Column<T>[];
  rows: T[];
  rowKey: (row: T) => string;
  /** Read out before the table, e.g. "Pending pass requests". */
  caption: string;
  onRowClick?: (row: T) => void;
  sort?: { key: string; dir: SortDir };
  onSort?: (key: string) => void;
  /** Multi-select with a select-all checkbox (bulk actions). */
  selected?: Set<string>;
  onSelectedChange?: (next: Set<string>) => void;
  /** A "⋯" menu or a row action, rendered in the last cell. */
  rowMenu?: (row: T) => React.ReactNode;
  /** A short name for a row, used for the row checkbox label: "Select Rahul Sharma". */
  rowLabel?: (row: T) => string;
  loading?: boolean;
  /** Shown instead of rows when there are none (EmptyState). */
  empty?: React.ReactNode;
  /** Rows become cards below 768px (default on). */
  cardsOnPhone?: boolean;
  className?: string;
}

const MAX_COLUMNS = 7;

/** Data table: ≤7 columns, sort, row click, select-all, row menu, loading rows; cards below 768px (AC-12). */
export function Table<T>({
  columns, rows, rowKey, caption, onRowClick, sort, onSort, selected, onSelectedChange, rowMenu, rowLabel,
  loading, empty, cardsOnPhone = true, className,
}: TableProps<T>) {
  if (import.meta.env?.DEV && columns.length > MAX_COLUMNS) {
    console.warn(`[design-system] Table "${caption}" has ${columns.length} columns; the design allows ${MAX_COLUMNS} (AC-12).`);
  }
  const selectable = !!selected && !!onSelectedChange;
  const keys = rows.map(rowKey);
  const allSelected = selectable && keys.length > 0 && keys.every((k) => selected!.has(k));
  const someSelected = selectable && !allSelected && keys.some((k) => selected!.has(k));
  const headCheck = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (headCheck.current) headCheck.current.indeterminate = someSelected;
  }, [someSelected]);

  const toggle = (k: string) => {
    if (!selectable) return;
    const next = new Set(selected);
    if (next.has(k)) next.delete(k);
    else next.add(k);
    onSelectedChange!(next);
  };
  const toggleAll = () => onSelectedChange?.(allSelected ? new Set() : new Set(keys));
  const onRowKey = (e: React.KeyboardEvent, row: T) => {
    if (onRowClick && (e.key === 'Enter' || e.key === ' ') && e.target === e.currentTarget) {
      e.preventDefault();
      onRowClick(row);
    }
  };
  const colCount = columns.length + (selectable ? 1 : 0) + (rowMenu ? 1 : 0);
  const stop = (e: React.SyntheticEvent) => e.stopPropagation();

  return (
    <div className={cx('pf-table-wrap', className)} data-cards={cardsOnPhone ? 'true' : undefined}>
      <table className="pf-table" aria-busy={loading || undefined}>
        <caption className="pf-sr-only">{caption}</caption>
        <thead>
          <tr>
            {selectable && (
              <th className="pf-col-check" scope="col">
                <Checkbox ref={headCheck} srLabel="Select all rows" checked={allSelected} onChange={toggleAll} disabled={loading || rows.length === 0} />
              </th>
            )}
            {columns.map((c) => {
              const active = sort?.key === c.key;
              return (
                <th
                  key={c.key}
                  scope="col"
                  className={cx(c.kind === 'num' && 'is-num')}
                  aria-sort={c.sortable ? (active ? (sort!.dir === 'asc' ? 'ascending' : 'descending') : 'none') : undefined}
                >
                  {c.sortable && onSort ? (
                    <button type="button" className="pf-sort" onClick={() => onSort(c.key)}>
                      {c.header}
                      <Icon icon={active ? (sort!.dir === 'asc' ? ArrowUp : ArrowDown) : ArrowUpDown} size={16} />
                    </button>
                  ) : (
                    c.header
                  )}
                </th>
              );
            })}
            {rowMenu && (
              <th scope="col">
                <span className="pf-sr-only">Actions</span>
              </th>
            )}
          </tr>
        </thead>
        <tbody>
          {loading &&
            Array.from({ length: 5 }, (_, i) => (
              <tr key={`skel-${i}`} className="pf-row-static">
                {Array.from({ length: colCount }, (_, j) => (
                  <td key={j}>
                    <Skeleton width={j === 0 ? '70%' : '50%'} />
                  </td>
                ))}
              </tr>
            ))}
          {!loading && rows.length === 0 && empty && (
            <tr className="pf-row-static">
              <td colSpan={colCount}>{empty}</td>
            </tr>
          )}
          {!loading &&
            rows.map((row) => {
              const k = rowKey(row);
              const isSel = selectable && selected!.has(k);
              return (
                <tr
                  key={k}
                  className={cx(!onRowClick && 'pf-row-static')}
                  aria-selected={selectable ? isSel : undefined}
                  tabIndex={onRowClick ? 0 : undefined}
                  onClick={onRowClick ? () => onRowClick(row) : undefined}
                  onKeyDown={onRowClick ? (e) => onRowKey(e, row) : undefined}
                >
                  {selectable && (
                    <td className="pf-col-check" onClick={stop}>
                      <Checkbox srLabel={rowLabel ? `Select ${rowLabel(row)}` : 'Select row'} checked={isSel} onChange={() => toggle(k)} />
                    </td>
                  )}
                  {columns.map((c) => (
                    <td key={c.key} className={cx(c.kind === 'num' && 'is-num', c.kind === 'secondary' && 'is-secondary')}>
                      {c.render(row)}
                    </td>
                  ))}
                  {rowMenu && (
                    <td className="pf-col-menu" onClick={stop}>
                      {rowMenu(row)}
                    </td>
                  )}
                </tr>
              );
            })}
        </tbody>
      </table>

      {cardsOnPhone && (
        <div className="pf-table-cards" aria-label={caption} role="group">
          {loading &&
            Array.from({ length: 3 }, (_, i) => (
              <div key={i} className="pf-table-card">
                <Skeleton variant="title" width="50%" />
                <Skeleton width="80%" />
              </div>
            ))}
          {!loading && rows.length === 0 && empty}
          {!loading &&
            rows.map((row) => {
              const k = rowKey(row);
              const isSel = selectable && selected!.has(k);
              const [head, ...rest] = columns.filter((c) => !c.hideInCard);
              return (
                <div
                  key={k}
                  className="pf-table-card"
                  data-selected={isSel ? 'true' : undefined}
                  tabIndex={onRowClick ? 0 : undefined}
                  onClick={onRowClick ? () => onRowClick(row) : undefined}
                  onKeyDown={onRowClick ? (e) => onRowKey(e, row) : undefined}
                >
                  <div className="pf-row">
                    {selectable && (
                      <span onClick={stop}>
                        <Checkbox srLabel={rowLabel ? `Select ${rowLabel(row)}` : 'Select row'} checked={isSel} onChange={() => toggle(k)} />
                      </span>
                    )}
                    {head && <div>{head.render(row)}</div>}
                    {rowMenu && (
                      <span className="pf-banner-actions" onClick={stop}>
                        {rowMenu(row)}
                      </span>
                    )}
                  </div>
                  <dl>
                    {rest.map((c) => (
                      <React.Fragment key={c.key}>
                        <dt>{c.header}</dt>
                        <dd>{c.render(row)}</dd>
                      </React.Fragment>
                    ))}
                  </dl>
                </div>
              );
            })}
        </div>
      )}
    </div>
  );
}

export interface BulkBarProps {
  count: number;
  /** "selected" is appended: "2 selected". */
  children: React.ReactNode;
  onClear: () => void;
  className?: string;
}

/** Bulk-action bar shown while rows are selected: "2 selected · Approve 2 · Reject · Clear". */
export const BulkBar: React.FC<BulkBarProps> = ({ count, children, onClear, className }) => {
  if (count <= 0) return null;
  return (
    <div className={cx('pf-bulkbar', className)} role="region" aria-label="Bulk actions">
      <span className="pf-bulkbar-count" aria-live="polite">
        {count} selected
      </span>
      <div className="pf-bulkbar-actions">
        {children}
        <Button variant="ghost" icon={X} onClick={onClear}>
          Clear
        </Button>
      </div>
    </div>
  );
};
