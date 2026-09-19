import { useMemo } from 'react';
import { factLabel, stageFacts } from '$lib/policy-analysis/stage-facts';
import { Details, Table } from '../../govuk';
import { Metrics } from '../Metrics';
import { byReason, readable } from '../warnings';

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
 * THE COUNTING IS `stage-facts.ts`, which is copied from upstream and had been
 * wired to nothing. A second parser written here recognised four sentence shapes
 * where the copied one recognises eight, and undercounted by 227 "not covered"
 * and 22 "unavailable" items — in the one view whose premise is that an
 * undercount is the serious direction.
 */
export function ProvenanceLead({ stages }: { stages: { warnings: string[] }[] }) {
  const warnings = useMemo(() => stages.flatMap((s) => (s.warnings ?? []).map(readable)), [stages]);
  const facts = useMemo(() => stageFacts(warnings), [warnings]);
  const reasons = useMemo(() => byReason(warnings), [warnings]);

  if (!facts.length) return null;

  return (
    <section aria-labelledby="discarded">
      <h2 className="govuk-heading-l" id="discarded">What was discarded, and why</h2>
      <p className="govuk-body">
        An assessment is what survived. This is the rest: every piece of model output the pipeline
        refused, every reference it could not resolve, and the reason it gave in each case.
      </p>

      {/*
        `factLabel` writes each sentence, so the wording is the copied layer's
        and one change lands everywhere. The label is stripped of its leading
        figure because the figure is the card.
      */}
      {/*
        THREE ACROSS, NOT SIX. Six figures on one row gave each 160px, so every
        label wrapped to three lines and the cards stood at three different
        heights — a row of figures that reads as a ragged paragraph is not a row
        of figures. Two rows of three give each label one line.
      */}
      <Metrics
        columns={3}
        metrics={facts.map((fact) => ({
          label: factLabel(fact).replace(/^\d[\d,]*\s*(of\s+[\d,]+\s*)?/, ''),
          value: fact.count.toLocaleString(),
          note: fact.of !== null ? `of ${fact.of.toLocaleString()}` : undefined,
        }))}
      />

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
                  {/* `<pre>` rather than a paragraph: a zod union lists twenty-six
                      quoted kinds and reflowing it as prose made a wall nobody
                      could read a value out of. It scrolls in its own box. */}
                  <pre className="prt-contract">{entry.reason}</pre>
                  {entry.affected.length ? (
                    <p className="govuk-body-s prt-meta">Affected: {entry.affected.join('; ')}</p>
                  ) : null}
                </Details>
              </>,
            ])}
          />
        </>
      ) : null}

      <p className="govuk-body-s prt-meta govuk-!-margin-top-4">
        Read from {warnings.length} warnings the run recorded about itself.
      </p>
    </section>
  );
}
