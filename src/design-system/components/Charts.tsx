import React, { useEffect, useRef, useState } from 'react';
import { formatNumber } from '../../utils/format';
import { cx } from './cx';

export interface OccupancyBarProps {
  occupied: number;
  total: number;
  /** Shown instead of the bar when total is 0: "— no slots yet". */
  emptyLabel?: string;
  className?: string;
}

/** Occupancy bar with "412 / 1,080" (Sites table, Overview levels). Red from 90% full. */
export const OccupancyBar: React.FC<OccupancyBarProps> = ({ occupied, total, emptyLabel = '— no slots yet', className }) => {
  if (!total) return <span className={cx('pf-occ-label', className)}>{emptyLabel}</span>;
  const pct = Math.max(0, Math.min(100, (occupied / total) * 100));
  const text = `${formatNumber(occupied)} / ${formatNumber(total)}`;
  return (
    <div className={cx('pf-occ', pct >= 90 && 'pf-occ--high', className)}>
      <div
        className="pf-occ-track"
        role="meter"
        aria-valuemin={0}
        aria-valuemax={total}
        aria-valuenow={occupied}
        aria-valuetext={`${text} occupied`}
        aria-label="Occupied"
      >
        <span className="pf-occ-fill" style={{ '--pf-occ': `${pct}%` } as React.CSSProperties} />
      </div>
      <span className="pf-occ-label">{text}</span>
    </div>
  );
};

export interface BarChartProps {
  values: number[];
  /** One per value, e.g. "06", "07" … for hours. */
  labels: string[];
  /** Describes the chart; also the caption of the data table for screen readers. */
  title: string;
  /** Header of the value column in the screen-reader table, e.g. "Entries". */
  valueName?: string;
  /** Pixel height of the bar area. */
  height?: number;
  className?: string;
}

const MIN_BAR = 24; // px per bar, so a 12px value label always fits
const LABEL = 16; // caption line height
const TOP = 20;

/**
 * A simple bar chart in plain SVG on tokens: a value label on each bar, the
 * peak darker, no library. Drawn in real pixels (measured), so text stays at
 * the 12px caption size; when bars would be narrower than 24px the chart
 * scrolls sideways inside its own box. A table carries the numbers for screen readers.
 */
export const BarChart: React.FC<BarChartProps> = ({ values, labels, title, valueName = 'Value', height = 160, className }) => {
  const box = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => setWidth(Math.floor(entry.contentRect.width)));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const n = values.length;
  const w = Math.max(width, n * MIN_BAR);
  const slot = n ? w / n : 0;
  const barW = Math.max(8, slot * 0.6);
  const max = Math.max(1, ...values);
  const peak = values.indexOf(Math.max(...values));
  const plotH = height;
  const svgH = TOP + plotH + LABEL + 4;
  return (
    <figure className={cx('pf-bars-figure', className)}>
      <div className="pf-bars-scroll" ref={box}>
        {width > 0 && (
          <svg className="pf-bars" width={w} height={svgH} viewBox={`0 0 ${w} ${svgH}`} aria-hidden="true" focusable="false">
            <line className="pf-bars-base" x1={0} x2={w} y1={TOP + plotH + 0.5} y2={TOP + plotH + 0.5} />
            {values.map((v, i) => {
              const h = v > 0 ? Math.max(2, (v / max) * plotH) : 0;
              const x = i * slot + (slot - barW) / 2;
              const isPeak = i === peak && v > 0;
              return (
                <g key={i}>
                  {h > 0 && <rect className={cx('pf-bars-bar', isPeak && 'pf-bars-bar--peak')} x={x} y={TOP + plotH - h} width={barW} height={h} rx={2} />}
                  <text className={cx('pf-bars-value', isPeak && 'pf-bars-value--peak')} x={x + barW / 2} y={TOP + plotH - h - 4}>
                    {formatNumber(v)}
                  </text>
                  <text className="pf-bars-axis" x={x + barW / 2} y={TOP + plotH + LABEL}>
                    {labels[i]}
                  </text>
                </g>
              );
            })}
          </svg>
        )}
      </div>
      <figcaption>{title}</figcaption>
      <table className="pf-sr-only">
        <caption>{title}</caption>
        <thead>
          <tr>
            <th scope="col">Label</th>
            <th scope="col">{valueName}</th>
          </tr>
        </thead>
        <tbody>
          {values.map((v, i) => (
            <tr key={i}>
              <th scope="row">{labels[i]}</th>
              <td>{formatNumber(v)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </figure>
  );
};
