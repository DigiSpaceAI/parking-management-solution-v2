import React from 'react';
import type { LucideIcon } from 'lucide-react';
import { cx } from './cx';

export type IconSize = 16 | 20 | 24;

export interface IconProps {
  /** A Lucide icon component (outline, 2px stroke). */
  icon: LucideIcon;
  size?: IconSize;
  /** Give a label only when the icon carries meaning on its own; otherwise it's hidden from screen readers. */
  label?: string;
  className?: string;
}

const SIZE_CLASS: Record<IconSize, string> = { 16: 'pf-icon pf-icon--sm', 20: 'pf-icon', 24: 'pf-icon pf-icon--lg' };

/** The one way to draw an icon: Lucide, outline, 2px stroke, 16/20/24px. */
export const Icon: React.FC<IconProps> = ({ icon: Glyph, size = 20, label, className }) => (
  <Glyph
    className={cx(SIZE_CLASS[size], className)}
    strokeWidth={2}
    aria-hidden={label ? undefined : true}
    aria-label={label}
    role={label ? 'img' : undefined}
    focusable={false}
  />
);
