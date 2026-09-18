import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { cx } from './cx';

type Variant = 'primary' | 'secondary' | 'warning' | 'inverse';

/**
 * A button, or a link that looks like one.
 *
 * `disabled` also sets `aria-disabled`, because GOV.UK's guidance is that a
 * disabled control must still be announced as one — and because a link styled as
 * a button cannot be disabled at all, only removed.
 */
export function Button({
  children, variant = 'primary', href, className, disabled, ...rest
}: {
  children: ReactNode;
  variant?: Variant;
  href?: string;
  className?: string;
} & ButtonHTMLAttributes<HTMLButtonElement>) {
  const classes = cx(
    'govuk-button',
    variant !== 'primary' && `govuk-button--${variant}`,
    disabled && 'govuk-button--disabled',
    className
  );
  if (href) {
    return (
      <a href={href} role="button" draggable={false} className={classes} data-module="govuk-button">
        {children}
      </a>
    );
  }
  return (
    <button type="button" className={classes} data-module="govuk-button" disabled={disabled} aria-disabled={disabled || undefined} {...rest}>
      {children}
    </button>
  );
}

/** Buttons and links set side by side, aligned on their text baseline. */
export function ButtonGroup({ children }: { children: ReactNode }) {
  return <div className="govuk-button-group">{children}</div>;
}
