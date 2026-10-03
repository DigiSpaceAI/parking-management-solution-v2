import React, { forwardRef } from 'react';
import type { LucideIcon } from 'lucide-react';
import { cx } from './cx';
import { Icon } from './Icon';
import { useGuard } from '../guard';

export type ButtonVariant = 'primary' | 'secondary' | 'destructive' | 'ghost' | 'exit';
export type ButtonSize = 'sm' | 'md' | 'lg';

export interface ButtonProps extends Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, 'children'> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  /** Full width. */
  block?: boolean;
  /** Leading icon. */
  icon?: LucideIcon;
  /** Shows a spinner, keeps the width and sets aria-busy. Pass the verb as `loadingLabel` ("Saving…"). */
  loading?: boolean;
  loadingLabel?: string;
  /**
   * A write action: apply the 001 write guard (disabled with a reason in All
   * sites mode and while viewing as another user, AC-24/AC-25). `true` keeps
   * the button's own title; a string becomes the title when writes are allowed.
   */
  guard?: boolean | string;
  children: React.ReactNode;
}

/** Primary / secondary / destructive / ghost / exit (outlined danger for "Mark exit"); sm / md / lg. */
export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = 'secondary', size = 'md', block, icon, loading = false, loadingLabel, guard, children, className, disabled, title, type = 'button', ...rest },
  ref
) {
  const useGuardFn = useGuard();
  const g = guard ? useGuardFn(typeof guard === 'string' ? guard : title) : null;
  const isDisabled = !!disabled || !!g?.disabled || loading;
  return (
    <button
      ref={ref}
      type={type}
      className={cx(
        'pf-btn',
        `pf-btn--${variant}`,
        size !== 'md' && `pf-btn--${size}`,
        block && 'pf-btn--block',
        className
      )}
      disabled={isDisabled}
      title={g ? g.title : title}
      aria-busy={loading || undefined}
      data-write-guard={g ? '' : undefined}
      {...rest}
    >
      {loading ? <span className="pf-spinner" aria-hidden="true" /> : icon ? <Icon icon={icon} size={16} /> : null}
      <span>{loading && loadingLabel ? loadingLabel : children}</span>
    </button>
  );
});

export interface IconButtonProps extends Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, 'children'> {
  icon: LucideIcon;
  /** Required: an icon-only button always has a label. */
  label: string;
  guard?: boolean;
}

/** An icon-only button (40px). The label is announced and shown as a tooltip. */
export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(function IconButton(
  { icon, label, guard, className, disabled, type = 'button', ...rest },
  ref
) {
  const useGuardFn = useGuard();
  const g = guard ? useGuardFn(label) : null;
  return (
    <button
      ref={ref}
      type={type}
      className={cx('pf-icon-btn', className)}
      aria-label={label}
      title={g?.disabled ? g.title : label}
      disabled={!!disabled || !!g?.disabled}
      data-write-guard={g ? '' : undefined}
      {...rest}
    >
      <Icon icon={icon} size={20} />
    </button>
  );
});
