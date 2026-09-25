import type { ReactNode } from 'react';
import type { Artefact } from '$lib/policy-analysis/contracts';
import type { KeyJudgement } from '$lib/writeup-view';
import { JudgementWord } from '../Judgement';

/**
 * THE VERDICT LEADS WITH WHAT IT CONCLUDED.
 *
 * The review of the real assessment (25 September) found the first things a
 * reader met were about the machine — "2,296 artefacts held", "10h 23m" — then
 * a bland headline, then the exposure bar, and the write-up arrived as section
 * 8 of 12: nineteen equal cards clipped to nine lines. Nothing on the page said
 * which of the nineteen mattered.
 *
 * So the move opens with the findings that matter most, ranked by
 * `rankFindings()` and each carrying the reason for its place: how serious the
 * worst thing it cites is, and how well supported the final review judged it.
 * The rest are in "All findings", further down the same move.
 *
 * IT TAKES JUDGEMENTS, NOT FINDINGS. Phase 19's analysis workstream adds a "key
 * judgements" artefact and a one-page brief. When they land, the judgements
 * are mapped into `KeyJudgement` (their extra fields go in `details`) and the
 * brief goes in the `brief` slot, which renders above the list and nothing
 * else here changes.
 *
 * NO ROUTER, NO FETCH: `linkTo` is optional, exactly as on `Report`, because
 * this renders in the offline pack.
 */
export function VerdictLead({ judgements, standfirst, brief, remaining, linkTo }: {
  judgements: KeyJudgement[];
  /** The rest of the executive assessment, after the headline sentence. */
  standfirst?: string;
  /** The one-page brief, when there is one. Empty until the brief workstream lands. */
  brief?: ReactNode;
  /** How many findings are in the appendix, for the sentence that points at it. */
  remaining?: number;
  linkTo?: (artefact: Artefact, label?: string) => ReactNode;
}) {
  if (!judgements.length && !standfirst && !brief) return null;

  return (
    <section aria-labelledby="main-findings" className="prt-verdict">
      <h2 className="govuk-heading-l" id="main-findings">Main findings</h2>
      {standfirst ? <p className="govuk-body-l prt-verdict__standfirst">{standfirst}</p> : null}
      {brief ? <div className="prt-verdict__brief">{brief}</div> : null}

      {judgements.length ? (
        <>
          <p className="govuk-body">
            {judgements.length === 1 ? 'The finding' : `The ${judgements.length} findings`} that
            matter most, most serious first.
            {remaining ? ` The other ${remaining} are under “All findings” further down.` : ''}
          </p>
          <ol className="prt-verdict__list">
            {judgements.map((judgement, i) => (
              <li key={judgement.id} className={`prt-verdict__item prt-verdict__item--${judgement.severity.level}`}>
                <h3 className="govuk-heading-m prt-verdict__title">
                  <span className="prt-verdict__rank" aria-hidden="true">{i + 1}</span>
                  {judgement.artefact && linkTo ? linkTo(judgement.artefact, judgement.title) : judgement.title}
                </h3>
                <div className="prt-verdict__tags">
                  <p className="prt-verdict__severity">
                    How serious: <strong>{judgement.severity.label.toLowerCase()}</strong>
                  </p>
                  <JudgementWord judgement={judgement.judgement} />
                </div>
                <p className="govuk-body prt-verdict__text">{judgement.statement}</p>
                {judgement.details?.length ? (
                  <dl className="govuk-summary-list govuk-summary-list--no-border prt-verdict__details">
                    {judgement.details.map((row) => (
                      <div key={row.label} className="govuk-summary-list__row">
                        <dt className="govuk-summary-list__key">{row.label}</dt>
                        <dd className="govuk-summary-list__value">{row.value}</dd>
                      </div>
                    ))}
                  </dl>
                ) : null}
                <p className="govuk-body-s prt-meta">
                  {judgement.severity.reason}
                  {judgement.sectionLabel ? ` From the part of the report on ${judgement.sectionLabel.toLowerCase()}.` : ''}
                </p>
              </li>
            ))}
          </ol>
        </>
      ) : null}
    </section>
  );
}
