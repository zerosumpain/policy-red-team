import { useMemo, type ReactNode } from 'react';
import type { Artefact } from '$lib/policy-analysis/contracts';
import { itemChecks } from '$lib/research-view';
import { Table, Tag } from '../govuk';

/**
 * WHAT WAS CHECKED OUTSIDE THE PAPER ABOUT THIS ONE ITEM (phase 22 part 2).
 *
 * A compact box on every item page's overview: each evidence link drawn from
 * a source outside the paper that names this item — or that comes from a
 * source a reader supplied about it — with what it said, its grade and the
 * source. Or, plainly, that nothing outside the paper was checked for it,
 * which on most items of a real run is the honest answer and the reason the
 * two actions sit underneath.
 *
 * Capped, strongest first, and the tail counted: an item a run leaned on can
 * carry dozens of links, and the strongest few are the ones that matter.
 */
const SHOWN = 6;

export function ItemChecks({ artefacts, item, link, actions }: {
  artefacts: Artefact[];
  item: Artefact;
  link: (a: Artefact) => ReactNode;
  actions?: ReactNode;
}) {
  const rows = useMemo(() => itemChecks(artefacts, item.id), [artefacts, item.id]);
  const shown = rows.slice(0, SHOWN);
  return (
    <section aria-labelledby="checked-outside" className="prt-checked prt-checked--item">
      <h2 className="govuk-heading-m" id="checked-outside">Checked outside the paper</h2>
      {shown.length ? (
        <Table
          className="prt-table"
          caption={`${rows.length} ${rows.length === 1 ? 'link' : 'links'} to evidence from outside the paper, strongest first`}
          captionSize="s"
          scroll
          columns={[
            { header: 'What it said', width: '11rem' },
            { header: 'Grade', width: '6rem' },
            { header: 'Source' },
          ]}
          rows={shown.map((row) => [
            row.result,
            row.gradeLabel,
            <span className="prt-checked__source">
              {row.source ? link(row.source) : '—'}
              {row.supplied ? <> <Tag colour="purple">Supplied by you</Tag></> : null}
              <span className="prt-meta prt-checked__when">{row.fullText ? 'Read in full' : 'Search snippet only'}</span>
            </span>,
          ])}
        />
      ) : (
        <p className="govuk-body">Nothing outside the paper was checked for this.</p>
      )}
      {rows.length > shown.length ? (
        <p className="govuk-body-s prt-meta">And {rows.length - shown.length} more, no stronger than those above.</p>
      ) : null}
      {actions}
    </section>
  );
}
