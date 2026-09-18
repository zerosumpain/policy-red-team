import type { ReactNode } from 'react';
import { cx } from './cx';

export interface SummaryRow {
  key: ReactNode;
  value: ReactNode;
  actions?: { href: string; text: string; visuallyHiddenText?: string }[];
}

/**
 * Key/value pairs — the backbone of the report.
 *
 * `visuallyHiddenText` on an action is not optional in practice: a column of
 * links all reading "Change" tells a screen-reader user nothing about what each
 * one changes.
 */
export function SummaryList({ rows, noBorder, className }: { rows: SummaryRow[]; noBorder?: boolean; className?: string }) {
  const anyActions = rows.some((r) => r.actions?.length);
  return (
    <dl className={cx('govuk-summary-list', noBorder && 'govuk-summary-list--no-border', className)}>
      {rows.map((row, i) => (
        <div key={i} className="govuk-summary-list__row">
          <dt className="govuk-summary-list__key">{row.key}</dt>
          <dd className="govuk-summary-list__value">{row.value}</dd>
          {anyActions ? (
            <dd className="govuk-summary-list__actions">
              {row.actions?.map((action, j) => (
                <a key={j} className="govuk-link" href={action.href}>
                  {action.text}
                  {action.visuallyHiddenText ? <span className="govuk-visually-hidden"> {action.visuallyHiddenText}</span> : null}
                </a>
              ))}
            </dd>
          ) : null}
        </div>
      ))}
    </dl>
  );
}
