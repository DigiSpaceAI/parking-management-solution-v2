import React, { useId } from 'react';
import { AlertCircle } from 'lucide-react';
import { cx } from './cx';
import { Icon } from './Icon';

export interface FieldControlProps {
  id: string;
  'aria-describedby'?: string;
  'aria-invalid'?: true;
  'aria-required'?: true;
  required?: boolean;
}

export interface FieldProps {
  /** Visible label: required (WCAG 2.2, AC-19). */
  label: React.ReactNode;
  help?: React.ReactNode;
  /** An error message turns the field red and is read out with it. */
  error?: React.ReactNode;
  required?: boolean;
  /** Something next to the label on the right, e.g. a "Forgot password?" link. */
  labelAside?: React.ReactNode;
  id?: string;
  className?: string;
  /** Renders the control with the ids and aria attributes wired up. */
  children: (control: FieldControlProps) => React.ReactNode;
}

/** Label + control + help or error, with aria-describedby / aria-invalid wired. */
export const Field: React.FC<FieldProps> = ({ label, help, error, required, labelAside, id, className, children }) => {
  const auto = useId();
  const controlId = id || `pf-field-${auto}`;
  const helpId = help ? `${controlId}-help` : undefined;
  const errorId = error ? `${controlId}-error` : undefined;
  const describedBy = [errorId, helpId].filter(Boolean).join(' ') || undefined;
  const labelEl = (
    <label className="pf-field-label" htmlFor={controlId}>
      {label}
      {required && (
        <span className="pf-req" aria-hidden="true">
          *
        </span>
      )}
    </label>
  );
  return (
    <div className={cx('pf-field', className)}>
      {labelAside ? (
        <div className="pf-field-row">
          {labelEl}
          {labelAside}
        </div>
      ) : (
        labelEl
      )}
      {children({
        id: controlId,
        'aria-describedby': describedBy,
        'aria-invalid': error ? true : undefined,
        'aria-required': required ? true : undefined,
        required,
      })}
      {error && (
        <p className="pf-field-error" id={errorId}>
          <Icon icon={AlertCircle} size={16} />
          <span>{error}</span>
        </p>
      )}
      {help && !error && (
        <p className="pf-field-help" id={helpId}>
          {help}
        </p>
      )}
      {help && error && (
        <p className="pf-sr-only" id={helpId}>
          {help}
        </p>
      )}
    </div>
  );
};

type InputAttrs = Omit<React.InputHTMLAttributes<HTMLInputElement>, 'size' | 'id'>;

export interface TextFieldProps extends InputAttrs {
  label: React.ReactNode;
  help?: React.ReactNode;
  error?: React.ReactNode;
  labelAside?: React.ReactNode;
  id?: string;
  /** Plate / code entry: mono, upper-case, letter-spaced. */
  mono?: boolean;
  /** 48px (mobile apps, gate, login). */
  size?: 'md' | 'lg';
  fieldClassName?: string;
}

/** A labelled text input; the `mono` variant is for plates and codes. */
export const TextField = React.forwardRef<HTMLInputElement, TextFieldProps>(function TextField(
  { label, help, error, required, labelAside, id, mono, size = 'md', fieldClassName, className, ...input },
  ref
) {
  return (
    <Field label={label} help={help} error={error} required={required} labelAside={labelAside} id={id} className={fieldClassName}>
      {(a) => (
        <input
          ref={ref}
          className={cx('pf-input', mono && 'pf-input--mono', size === 'lg' && 'pf-input--lg', className)}
          autoCapitalize={mono ? 'characters' : input.autoCapitalize}
          spellCheck={mono ? false : input.spellCheck}
          {...input}
          {...a}
        />
      )}
    </Field>
  );
});

export interface SelectOption {
  value: string;
  label: string;
  disabled?: boolean;
}

export interface SelectProps extends Omit<React.SelectHTMLAttributes<HTMLSelectElement>, 'size' | 'id'> {
  label: React.ReactNode;
  options: SelectOption[];
  /** Shown as a first, empty option ("Choose…"). */
  placeholder?: string;
  help?: React.ReactNode;
  error?: React.ReactNode;
  id?: string;
  size?: 'md' | 'lg';
  fieldClassName?: string;
}

/** A labelled native select with the design-system chevron. */
export const Select = React.forwardRef<HTMLSelectElement, SelectProps>(function Select(
  { label, options, placeholder, help, error, required, id, size = 'md', fieldClassName, className, ...select },
  ref
) {
  return (
    <Field label={label} help={help} error={error} required={required} id={id} className={fieldClassName}>
      {(a) => (
        <span className="pf-select-wrap">
          <select ref={ref} className={cx('pf-select', size === 'lg' && 'pf-select--lg', className)} {...select} {...a}>
            {placeholder !== undefined && <option value="">{placeholder}</option>}
            {options.map((o) => (
              <option key={o.value} value={o.value} disabled={o.disabled}>
                {o.label}
              </option>
            ))}
          </select>
        </span>
      )}
    </Field>
  );
});
