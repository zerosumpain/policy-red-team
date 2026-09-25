import { useMemo, useState, type ReactNode } from 'react';
import type { Artefact } from '$lib/policy-analysis/contracts';
import { BAND_LABEL, type Play } from '$lib/policy-analysis/view';
import { TIER_SHORT, watchCsv, watchList } from '$lib/watch-list';
import { Button } from '../govuk';
import { usePrinting } from './usePrinting';

/** Rows shown before the reader asks for the rest. The CSV always carries every row. */
const SHOWN = 10;

/**
 * WHAT TO WATCH FOR — one row per way to beat the policy.
 *
 * For somebody who has to monitor the policy rather than study it: the early
 * warning sign, what would stop it, and the recommendation that answers it.
 * The arithmetic is `$lib/watch-list`, which takes its links from
 * `linkRecommendation()` and says which kind of link each one is.
 *
 * THE DOWNLOAD IS BUILT IN THE BROWSER, from the rows already on the page, so
 * it works in the offline pack with the network blocked: a `Blob`, an object
 * URL and a `download` attribute. Nothing is fetched. A browser that cannot do
 * that (no `URL.createObjectURL`) is not offered the button, rather than being
 * offered one that does nothing.
 *
 * A TABLE, NOT CARDS. Four long text columns at 1280px is a wide table, so it
 * scrolls inside `.prt-scroll` (with `contain: paint`, the AGENTS.md rule that
 * stops a wide table widening a 320px page) and folds on paper through the
 * print block's `table-layout: fixed`.
 */
export function WatchList({ list, recs, artefacts, filename, linkTo, offline = false }: {
  /** Already narrowed by the carried selection. */
  list: Play[];
  recs: Artefact[];
  artefacts: Artefact[];
  /** What the saved file is called. */
  filename: string;
  linkTo?: (artefact: Artefact, label?: string) => ReactNode;
  /** The pack is a document read with Ctrl-F, so it shows every row. */
  offline?: boolean;
}) {
  const [asked, setAll] = useState(false);
  // Called unconditionally: `asked || usePrinting()` would skip the hook on
  // any render where the list was already open.
  const printing = usePrinting();
  const all = asked || printing || offline;
  const rows = useMemo(() => watchList(list, recs, artefacts), [list, recs, artefacts]);
  if (!rows.length) return null;

  const visible = all ? rows : rows.slice(0, SHOWN);
  const answered = rows.filter((row) => row.recommendation).length;
  const owners = rows.some((row) => row.owner);
  const canSave = typeof URL !== 'undefined' && typeof URL.createObjectURL === 'function' && typeof Blob !== 'undefined';

  const save = () => {
    const url = URL.createObjectURL(new Blob([watchCsv(rows)], { type: 'text/csv;charset=utf-8' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    // Revoked on the next task, not synchronously: Firefox cancels a download
    // whose object URL is revoked in the same task as the click.
    setTimeout(() => URL.revokeObjectURL(url), 0);
  };

  return (
    <>
      <p className="govuk-body">
        For each way to beat the policy: the first sign that someone is doing it, what would stop it,
        and the recommendation in this report that answers it. {answered} of {rows.length} are
        answered by a recommendation; {rows.length - answered === 0 ? 'none is' : `${rows.length - answered} are`} not.
      </p>
      {canSave ? (
        <Button variant="secondary" onClick={save}>
          Download the watch list (CSV, {rows.length} rows)
        </Button>
      ) : null}
      <div className="prt-scroll prt-watch">
        <table className="govuk-table prt-watch__table">
          <caption className="govuk-table__caption govuk-table__caption--s">
            What to watch for, worst first{all || rows.length <= SHOWN ? '' : ` — the first ${SHOWN} of ${rows.length}`}
          </caption>
          <thead className="govuk-table__head">
            <tr className="govuk-table__row">
              <th scope="col" className="govuk-table__header prt-watch__play">Way to beat it</th>
              <th scope="col" className="govuk-table__header">Early warning sign</th>
              <th scope="col" className="govuk-table__header">What would stop it</th>
              <th scope="col" className="govuk-table__header">Recommendation that answers it</th>
              {owners ? <th scope="col" className="govuk-table__header">Who owns it</th> : null}
            </tr>
          </thead>
          <tbody className="govuk-table__body">
            {visible.map((row) => (
              <tr key={row.play.artefact.id} className="govuk-table__row">
                <th scope="row" className="govuk-table__header prt-watch__play">
                  {linkTo ? linkTo(row.play.artefact) : row.play.artefact.label}
                  <span className="prt-watch__who">
                    <span className={`prt-band prt-band--${row.play.band}`}>{BAND_LABEL[row.play.band]}</span>
                    {row.play.actor ? ` ${row.play.actor.label}` : ''}
                  </span>
                </th>
                <td className="govuk-table__cell">{row.warning || <span className="prt-meta">Not given</span>}</td>
                <td className="govuk-table__cell">{row.counter || <span className="prt-meta">Not given</span>}</td>
                <td className="govuk-table__cell">
                  {row.recommendation ? (
                    <>
                      {linkTo ? linkTo(row.recommendation) : row.recommendation.label}
                      {row.tier ? <span className="prt-meta prt-watch__tier"> — {TIER_SHORT[row.tier]}</span> : null}
                    </>
                  ) : <span className="prt-meta">None in this report</span>}
                </td>
                {owners ? <td className="govuk-table__cell">{row.owner || <span className="prt-meta">Not named</span>}</td> : null}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {rows.length > SHOWN && !offline ? (
        <Button variant="secondary" onClick={() => setAll(!asked)} aria-expanded={all}>
          {all ? `Show the first ${SHOWN}` : `Show all ${rows.length}`}
        </Button>
      ) : null}
      <p className="govuk-body-s prt-meta">
        A recommendation is linked where one of the findings it answers names the way to beat it,
        where both rest on the same assumption, or where both target the same part of the policy.
        The link says which.
      </p>
    </>
  );
}
