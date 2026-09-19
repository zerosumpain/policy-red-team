import { useMemo } from 'react';
import { STAGES } from '$lib/policy-analysis/contracts';
import { Details, Table } from '../../govuk';
import { byReason, parseStage, totals, type StageWarnings } from '../warnings';

/**
 * WHAT THE RUN THREW AWAY, AND WHY.
 *
 * An assessment is what survived. Nothing in this client rendered stage
 * warnings, and on the Post-16 run there were 256 of them carrying the figures
 * that decide whether the report overclaims: 68 groups of model output
 * discarded, 80 artefacts refused by a stage contract, 113 references dropped,
 * 4 pages never analysed.
 *
 * THE FIGURE THAT MATTERS is that 26 plays were rejected for resting on
 * something other than an assumption — so forty-seven plays survived out of
 * seventy-three written. A report that says "47 plays" without that is
 * overclaiming, which is why this is a view and not a footnote.
 *
 * It parses prose, and `warnings.ts` says at length why that is a stopgap.
 */
export function ProvenanceLead({ stages }: { stages: { warnings: string[] }[] }) {
  const parsed: StageWarnings[] = useMemo(
    () => stages.map((stage, i) => parseStage(i, STAGES[i] ?? `Stage ${i}`, stage.warnings ?? [])),
    [stages],
  );
  const figures = useMemo(() => totals(parsed), [parsed]);
  const reasons = useMemo(() => byReason(parsed), [parsed]);

  const anything = figures.groups + figures.artefacts + figures.references + figures.pagesUnread;
  if (!anything) return null;

  return (
    <section aria-labelledby="discarded">
      <h2 className="govuk-heading-l" id="discarded">What was discarded, and why</h2>
      <p className="govuk-body">
        An assessment is what survived. This is the rest: every piece of model output the pipeline
        refused, every reference it could not resolve, and the reason it gave in each case.
      </p>

      <dl className="prt-figures">
        <div>
          <dt>Groups of model output discarded</dt>
          <dd>{figures.groups}</dd>
        </div>
        <div>
          <dt>Artefacts refused by a stage contract</dt>
          <dd>{figures.artefacts}</dd>
        </div>
        <div>
          <dt>References dropped as unresolvable</dt>
          <dd>{figures.references}</dd>
        </div>
        <div>
          <dt>Pages carrying no policy text</dt>
          <dd>{figures.pagesUnread}{figures.pagesTotal ? ` of ${figures.pagesTotal}` : ''}</dd>
        </div>
      </dl>

      {reasons.length ? (
        <>
          <h3 className="govuk-heading-m" id="why-refused">Why output was refused</h3>
          <p className="govuk-body">
            Each stage validates its own output against a contract, and anything that fails is
            dropped rather than repaired. These are the reasons, rolled up across the run.
          </p>
          <Table
            caption="Reasons output was refused, largest first"
            columns={[{ header: 'Artefacts', numeric: true }, { header: 'What happened' }]}
            rows={reasons.map((entry) => [
              entry.count,
              <>
                {entry.human}
                {/* The contract's own words are kept, never replaced: the exact
                    reason is the only thing that makes a discard checkable. */}
                <Details summary="The contract’s own words">
                  <p className="govuk-body-s"><code>{entry.reason}</code></p>
                  {entry.affected.length ? (
                    <p className="govuk-body-s prt-meta">Affected: {entry.affected.join('; ')}</p>
                  ) : null}
                </Details>
              </>,
            ])}
          />
        </>
      ) : null}

      {figures.notes ? (
        <p className="govuk-body-s prt-meta govuk-!-margin-top-4">
          A further {figures.notes} warnings are notes about what the paper does not say, rather
          than output that was discarded. They are why so much of the assessment reads as
          provisional.
        </p>
      ) : null}
    </section>
  );
}
