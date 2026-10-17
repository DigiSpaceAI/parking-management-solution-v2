import React from 'react';
import { Check } from 'lucide-react';
import { cx } from './cx';

export interface CheckboxProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'type'> {
  /** Visible label. For a table-row checkbox with no visible text, pass `srLabel` instead. */
  label?: React.ReactNode;
  srLabel?: string;
  /** Marks the control invalid (pair it with a message in the surrounding form). */
  invalid?: boolean;
}

/** Checkbox: 20px box inside a 44px touch row. */
export const Checkbox = React.forwardRef<HTMLInputElement, CheckboxProps>(function Checkbox(
  { label, srLabel, invalid, className, ...input },
  ref
) {
  return (
    <label className={cx('pf-check', className)}>
      <input ref={ref} type="checkbox" aria-invalid={invalid || undefined} aria-label={label ? undefined : srLabel} {...input} />
      <span className="pf-check-box" aria-hidden="true">
        <Check strokeWidth={3} />
      </span>
      {label && <span>{label}</span>}
    </label>
  );
});

export interface RadioProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'type'> {
  label: React.ReactNode;
  invalid?: boolean;
}

/** Radio button; group several with the same `name` inside a <fieldset> with a <legend>. */
export const Radio = React.forwardRef<HTMLInputElement, RadioProps>(function Radio({ label, invalid, className, ...input }, ref) {
  return (
    <label className={cx('pf-check pf-check--radio', className)}>
      <input ref={ref} type="radio" aria-invalid={invalid || undefined} {...input} />
      <span className="pf-check-box" aria-hidden="true" />
      <span>{label}</span>
    </label>
  );
});
