import React from 'react';
import { formatPlate } from '../../utils/format';
import { cx } from './cx';

/** A number plate in mono, shown with spaces ("KA 05 MN 1234"). Mono type is for data only (AC-22). */
export const PlateText: React.FC<{ plate: string | null | undefined; large?: boolean; className?: string }> = ({ plate, large, className }) => (
  <span className={cx('pf-plate', large && 'pf-plate--lg', className)}>{formatPlate(plate)}</span>
);
