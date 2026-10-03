import React, { useId } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { formatNumber } from '../../utils/format';
import { cx } from './cx';
import { Icon } from './Icon';

export interface PaginationProps {
  /** 1-based. */
  page: number;
  pageSize: number;
  total: number;
  onPage: (page: number) => void;
  /** Tables: 25/50. Slot grids: 12/20/36/60. Leave out to hide the "per page" select. */
  pageSizes?: number[];
  onPageSize?: (size: number) => void;
  /** What the items are, for the label: "slots", "requests". */
  noun?: string;
  className?: string;
}

/** Page numbers with gaps: 1 … 4 5 6 … 54. */
function pageList(page: number, pages: number): Array<number | 'gap'> {
  if (pages <= 7) return Array.from({ length: pages }, (_, i) => i + 1);
  const out: Array<number | 'gap'> = [1];
  const from = Math.max(2, page - 1);
  const to = Math.min(pages - 1, page + 1);
  if (from > 2) out.push('gap');
  for (let p = from; p <= to; p++) out.push(p);
  if (to < pages - 1) out.push('gap');
  out.push(pages);
  return out;
}

/** One pagination bar: "Showing 1–20 of 1,080", page numbers, rows per page. */
export const Pagination: React.FC<PaginationProps> = ({ page, pageSize, total, onPage, pageSizes, onPageSize, noun = 'items', className }) => {
  const selectId = useId();
  const pages = Math.max(1, Math.ceil(total / pageSize));
  const current = Math.min(Math.max(1, page), pages);
  const first = total === 0 ? 0 : (current - 1) * pageSize + 1;
  const last = Math.min(total, current * pageSize);
  return (
    <nav className={cx('pf-pager', className)} aria-label={`Pages of ${noun}`}>
      <span aria-live="polite">
        Showing {formatNumber(first)}–{formatNumber(last)} of {formatNumber(total)}
      </span>
      <div className="pf-row">
        {pageSizes && onPageSize && (
          <span className="pf-page-select">
            <label htmlFor={selectId}>Per page</label>
            <span className="pf-select-wrap">
              <select id={selectId} className="pf-select" value={pageSize} onChange={(e) => onPageSize(Number(e.target.value))}>
                {pageSizes.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </span>
          </span>
        )}
        <div className="pf-pager-pages">
          <button type="button" className="pf-page" disabled={current <= 1} onClick={() => onPage(current - 1)} aria-label="Previous page">
            <Icon icon={ChevronLeft} size={16} />
          </button>
          {pageList(current, pages).map((p, i) =>
            p === 'gap' ? (
              <span key={`gap-${i}`} className="pf-pager-ellipsis" aria-hidden="true">
                …
              </span>
            ) : (
              <button
                key={p}
                type="button"
                className="pf-page"
                aria-current={p === current ? 'page' : undefined}
                aria-label={`Page ${p}`}
                onClick={() => onPage(p)}
              >
                {p}
              </button>
            )
          )}
          <button type="button" className="pf-page" disabled={current >= pages} onClick={() => onPage(current + 1)} aria-label="Next page">
            <Icon icon={ChevronRight} size={16} />
          </button>
        </div>
      </div>
    </nav>
  );
};
