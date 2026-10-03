import React from 'react';
import { cx } from './cx';
import { Skeleton } from './States';

export interface CardProps {
  title?: React.ReactNode;
  /** Buttons or links on the right of the title. */
  actions?: React.ReactNode;
  children?: React.ReactNode;
  className?: string;
  /** Heading level for the title (default h2). */
  headingLevel?: 2 | 3;
}

/** A white card with an optional title row. */
export const Card: React.FC<CardProps> = ({ title, actions, children, className, headingLevel = 2 }) => {
  const H = headingLevel === 3 ? 'h3' : 'h2';
  return (
    <section className={cx('pf-card', className)}>
      {(title || actions) && (
        <div className="pf-card-head">
          {title && <H className="pf-card-title">{title}</H>}
          {actions && <div className="pf-card-head-actions">{actions}</div>}
        </div>
      )}
      {children}
    </section>
  );
};

export interface KpiCardProps {
  label: string;
  /** The real figure. Leave it undefined when there is no data: the card shows "—" + `emptyReason` (AC-05). Never pass 0 as a stand-in. */
  value?: React.ReactNode;
  /** One line on why there is no number, e.g. "No vehicles logged today". */
  emptyReason?: string;
  /** A meta line under the value, e.g. "3 active · 1 on hold". */
  meta?: React.ReactNode;
  loading?: boolean;
  className?: string;
}

/** A KPI: value, "—" + reason, or loading. */
export const KpiCard: React.FC<KpiCardProps> = ({ label, value, emptyReason, meta, loading, className }) => {
  const empty = !loading && (value === undefined || value === null || value === '');
  return (
    <div className={cx('pf-card pf-card--kpi', className)} aria-busy={loading || undefined}>
      <div className="pf-kpi">
        <span className="pf-kpi-label">{label}</span>
        {loading ? (
          <>
            <Skeleton variant="kpi" width="45%" />
            <span className="pf-sr-only">Loading</span>
          </>
        ) : empty ? (
          <>
            <span className="pf-kpi-value pf-kpi-value--empty" aria-label="No data">
              —
            </span>
            {emptyReason && <span className="pf-kpi-meta">{emptyReason}</span>}
          </>
        ) : (
          <>
            <span className="pf-kpi-value">{value}</span>
            {meta && <span className="pf-kpi-meta">{meta}</span>}
          </>
        )}
      </div>
    </div>
  );
};
