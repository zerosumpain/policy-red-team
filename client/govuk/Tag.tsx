import type { ReactNode } from 'react';
import { cx } from './cx';

/** GOV.UK tag colours. Grey reads as "not started", blue as "in progress". */
export type TagColour =
  | 'grey' | 'green' | 'turquoise' | 'blue' | 'light-blue'
  | 'purple' | 'pink' | 'red' | 'orange' | 'yellow';

export function Tag({ children, colour, className }: { children: ReactNode; colour?: TagColour; className?: string }) {
  return <strong className={cx('govuk-tag', colour && `govuk-tag--${colour}`, className)}>{children}</strong>;
}
