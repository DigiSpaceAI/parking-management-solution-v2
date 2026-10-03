import React from 'react';
import { cx } from './cx';

/** An ID or a time in mono, secondary colour ("E-1042", "09:14"). */
export const IdText: React.FC<{ children: React.ReactNode; className?: string }> = ({ children, className }) => (
  <span className={cx('pf-id', className)}>{children}</span>
);
