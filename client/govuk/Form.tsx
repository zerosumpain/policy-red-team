import type { ReactNode, InputHTMLAttributes, TextareaHTMLAttributes, SelectHTMLAttributes } from 'react';
import { cx } from './cx';

/**
 * The form controls, and the three things GOV.UK insists on for every one of
 * them: a real `<label>` tied to the control, a hint that the control POINTS AT
 * with `aria-describedby`, and an error message that is part of that same
 * description rather than text that merely sits nearby.
 *
 * All three are handled here, from an `id` and an optional `hint`/`error`, so a
 * form cannot accidentally ship a field that looks right and reads as an unlabelled
 * box. That is the single most common accessibility failure in a form, and the
 * reason these are components rather than class names in the pages.
 */
function describedBy(id: string, hint?: ReactNode, error?: string): string | undefined {
  const ids = [hint ? `${id}-hint` : '', error ? `${id}-error` : ''].filter(Boolean);
  return ids.length ? ids.join(' ') : undefined;
}

function Hint({ id, children }: { id: string; children: ReactNode }) {
  return <div id={`${id}-hint`} className="govuk-hint">{children}</div>;
}

function ErrorMessage({ id, children }: { id: string; children: string }) {
  return (
    <p id={`${id}-error`} className="govuk-error-message">
      <span className="govuk-visually-hidden">Error:</span> {children}
    </p>
  );
}

export function FormGroup({ error, children }: { error?: string; children: ReactNode }) {
  return <div className={cx('govuk-form-group', error && 'govuk-form-group--error')}>{children}</div>;
}

export interface FieldProps {
  id: string;
  name?: string;
  label: ReactNode;
  labelSize?: 's' | 'm' | 'l';
  hint?: ReactNode;
  error?: string;
}

export function Input({ id, name, label, labelSize = 's', hint, error, className, ...rest }:
  FieldProps & { className?: string } & InputHTMLAttributes<HTMLInputElement>) {
  return (
    <FormGroup error={error}>
      <label className={cx('govuk-label', labelSize !== 'm' && `govuk-label--${labelSize}`)} htmlFor={id}>{label}</label>
      {hint ? <Hint id={id}>{hint}</Hint> : null}
      {error ? <ErrorMessage id={id}>{error}</ErrorMessage> : null}
      <input
        className={cx('govuk-input', error && 'govuk-input--error', className)}
        id={id} name={name ?? id} type="text"
        aria-describedby={describedBy(id, hint, error)}
        {...rest}
      />
    </FormGroup>
  );
}

export function Textarea({ id, name, label, labelSize = 's', hint, error, rows = 5, ...rest }:
  FieldProps & TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <FormGroup error={error}>
      <label className={cx('govuk-label', labelSize !== 'm' && `govuk-label--${labelSize}`)} htmlFor={id}>{label}</label>
      {hint ? <Hint id={id}>{hint}</Hint> : null}
      {error ? <ErrorMessage id={id}>{error}</ErrorMessage> : null}
      <textarea
        className={cx('govuk-textarea', error && 'govuk-textarea--error')}
        id={id} name={name ?? id} rows={rows}
        aria-describedby={describedBy(id, hint, error)}
        {...rest}
      />
    </FormGroup>
  );
}

export function Select({ id, name, label, labelSize = 's', hint, error, options, ...rest }:
  FieldProps & { options: { value: string; text: string }[] } & SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <FormGroup error={error}>
      <label className={cx('govuk-label', labelSize !== 'm' && `govuk-label--${labelSize}`)} htmlFor={id}>{label}</label>
      {hint ? <Hint id={id}>{hint}</Hint> : null}
      {error ? <ErrorMessage id={id}>{error}</ErrorMessage> : null}
      <select className={cx('govuk-select', error && 'govuk-select--error')} id={id} name={name ?? id}
              aria-describedby={describedBy(id, hint, error)} {...rest}>
        {options.map((option) => <option key={option.value} value={option.value}>{option.text}</option>)}
      </select>
    </FormGroup>
  );
}

export function FileUpload({ id, name, label, labelSize = 's', hint, error, ...rest }:
  FieldProps & InputHTMLAttributes<HTMLInputElement>) {
  return (
    <FormGroup error={error}>
      <label className={cx('govuk-label', labelSize !== 'm' && `govuk-label--${labelSize}`)} htmlFor={id}>{label}</label>
      {hint ? <Hint id={id}>{hint}</Hint> : null}
      {error ? <ErrorMessage id={id}>{error}</ErrorMessage> : null}
      <input className={cx('govuk-file-upload', error && 'govuk-file-upload--error')} id={id} name={name ?? id}
             type="file" aria-describedby={describedBy(id, hint, error)} {...rest} />
    </FormGroup>
  );
}

/**
 * Radios, in a fieldset with a legend.
 *
 * The fieldset is not optional. A group of radios without one is a set of
 * unrelated controls whose shared question is never announced — the reader hears
 * "Standard" and "Deep" with no idea what is being asked.
 */
export function Radios({ id, name, legend, legendSize = 'm', hint, error, items, value, onChange, isPageHeading }: {
  id: string;
  name?: string;
  legend: ReactNode;
  legendSize?: 's' | 'm' | 'l' | 'xl';
  hint?: ReactNode;
  error?: string;
  items: { value: string; text: ReactNode; hint?: ReactNode }[];
  value?: string;
  onChange?: (value: string) => void;
  isPageHeading?: boolean;
}) {
  const legendEl = (
    <legend className={cx('govuk-fieldset__legend', `govuk-fieldset__legend--${legendSize}`)}>
      {isPageHeading ? <h1 className="govuk-fieldset__heading">{legend}</h1> : legend}
    </legend>
  );
  return (
    <FormGroup error={error}>
      <fieldset className="govuk-fieldset" aria-describedby={describedBy(id, hint, error)}>
        {legendEl}
        {hint ? <Hint id={id}>{hint}</Hint> : null}
        {error ? <ErrorMessage id={id}>{error}</ErrorMessage> : null}
        <div className="govuk-radios" data-module="govuk-radios">
          {items.map((item) => {
            const itemId = `${id}-${item.value}`;
            return (
              <div className="govuk-radios__item" key={item.value}>
                <input className="govuk-radios__input" id={itemId} name={name ?? id} type="radio"
                       value={item.value} checked={value === item.value}
                       aria-describedby={item.hint ? `${itemId}-hint` : undefined}
                       onChange={(e) => onChange?.(e.currentTarget.value)} />
                <label className="govuk-label govuk-radios__label" htmlFor={itemId}>{item.text}</label>
                {item.hint ? <div id={`${itemId}-hint`} className="govuk-hint govuk-radios__hint">{item.hint}</div> : null}
              </div>
            );
          })}
        </div>
      </fieldset>
    </FormGroup>
  );
}
