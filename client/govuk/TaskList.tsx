import type { ReactNode } from 'react';
import { Tag, type TagColour } from './Tag';
import { cx } from './cx';

export interface Task {
  title: ReactNode;
  hint?: ReactNode;
  href?: string;
  status: { text?: ReactNode; tag?: { text: ReactNode; colour?: TagColour } };
}

/**
 * The eighteen stages, and anything else that is a list of things with a state.
 *
 * THE `aria-describedby` IS THE COMPONENT. A sighted reader sees the status
 * beside the name; a screen reader only knows they belong together because the
 * link points at the hint and status ids. Omitting it leaves a list of links
 * whose states are read out as loose text somewhere nearby, which is the exact
 * failure this pattern exists to prevent — so the ids are generated here rather
 * than left to the caller.
 */
export function TaskList({ items, idPrefix = 'task-list' }: { items: Task[]; idPrefix?: string }) {
  return (
    <ul className="govuk-task-list">
      {items.map((item, index) => {
        const hintId = `${idPrefix}-${index + 1}-hint`;
        const statusId = `${idPrefix}-${index + 1}-status`;
        const describedBy = cx(item.hint ? hintId : '', statusId).trim();
        return (
          <li key={index} className={cx('govuk-task-list__item', item.href && 'govuk-task-list__item--with-link')}>
            <div className="govuk-task-list__name-and-hint">
              {item.href ? (
                <a className="govuk-link govuk-task-list__link" href={item.href} aria-describedby={describedBy}>
                  {item.title}
                </a>
              ) : (
                <div>{item.title}</div>
              )}
              {item.hint ? <div id={hintId} className="govuk-task-list__hint">{item.hint}</div> : null}
            </div>
            <div className="govuk-task-list__status" id={statusId}>
              {item.status.tag ? <Tag colour={item.status.tag.colour}>{item.status.tag.text}</Tag> : item.status.text}
            </div>
          </li>
        );
      })}
    </ul>
  );
}
