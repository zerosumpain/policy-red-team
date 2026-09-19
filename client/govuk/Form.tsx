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

/**
 * A set of yes/no choices — GOV.UK's checkboxes.
 *
 * Written to mirror `Radios` line for line, because they are the same component
 * with a different input type and the one thing that must not drift between
 * them is the `aria-describedby` wiring: a hint that is not pointed at from the
 * input it describes is a hint a screen-reader user never hears.
 *
 * The stress test is what this exists for. Failing an assumption is a yes/no
 * question asked of fourteen assumptions at once, and the alternative — a rail
 * of bespoke toggle buttons — is three accessibility problems bought to avoid
 * a component that already exists.
 */
export function Checkboxes({ id, name, legend, legendSize = 'm', hint, error, items, values = [], onChange, isPageHeading, small }: {
  id: string;
  name?: string;
  legend: ReactNode;
  legendSize?: 's' | 'm' | 'l' | 'xl';
  hint?: ReactNode;
  error?: string;
  items: { value: string; text: ReactNode; hint?: ReactNode }[];
  values?: string[];
  onChange?: (values: string[]) => void;
  isPageHeading?: boolean;
  /** GOV.UK's small variant, for a long list the reader scans rather than answers once. */
  small?: boolean;
}) {
  const selected = new Set(values);
  const toggle = (value: string) => {
    const next = new Set(selected);
    if (next.has(value)) next.delete(value);
    else next.add(value);
    // The caller's order, not the click order: a list that reshuffles as it is
    // ticked is a list nobody can keep their place in.
    //
    // AND `items` IS THE ORDER, NOT THE UNIVERSE. Filtering the selection
    // through the rendered items silently dropped anything ticked that was not
    // on screen — so a caller showing nine of twenty-four lost the reader's
    // choice the moment they ticked a tenth, and the answer changed for a reason
    // nothing on the page stated. What is not rendered is kept, at the end.
    const known = items.map((item) => item.value);
    const shown = known.filter((v) => next.has(v));
    const offscreen = [...next].filter((v) => !known.includes(v));
    onChange?.([...shown, ...offscreen]);
  };

  return (
    <FormGroup error={error}>
      <fieldset className="govuk-fieldset" aria-describedby={describedBy(id, hint, error)}>
        <legend className={cx('govuk-fieldset__legend', `govuk-fieldset__legend--${legendSize}`)}>
          {isPageHeading ? <h1 className="govuk-fieldset__heading">{legend}</h1> : legend}
        </legend>
        {hint ? <Hint id={id}>{hint}</Hint> : null}
        {error ? <ErrorMessage id={id}>{error}</ErrorMessage> : null}
        <div className={cx('govuk-checkboxes', small && 'govuk-checkboxes--small')} data-module="govuk-checkboxes">
          {items.map((item) => {
            const itemId = `${id}-${item.value}`;
            return (
              <div className="govuk-checkboxes__item" key={item.value}>
                <input className="govuk-checkboxes__input" id={itemId} name={name ?? id} type="checkbox"
                       value={item.value} checked={selected.has(item.value)}
                       aria-describedby={item.hint ? `${itemId}-hint` : undefined}
                       onChange={() => toggle(item.value)} />
                <label className="govuk-label govuk-checkboxes__label" htmlFor={itemId}>{item.text}</label>
                {item.hint ? <div id={`${itemId}-hint`} className="govuk-hint govuk-checkboxes__hint">{item.hint}</div> : null}
              </div>
            );
          })}
        </div>
      </fieldset>
    </FormGroup>
  );
}
