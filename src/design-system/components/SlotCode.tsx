import React from 'react';
import { cx } from './cx';

/** A slot code in mono ("B1-042"). Large on slot cards; regular in tables. */
export const SlotCode: React.FC<{ code: string; large?: boolean; className?: string }> = ({ code, large, className }) => (
  <span className={cx(large ? 'pf-slot-code' : 'pf-mono', className)}>{code}</span>
);
