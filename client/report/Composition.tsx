import { useMemo } from 'react';
import type { Artefact } from '$lib/policy-analysis/contracts';
import type { Play } from '$lib/policy-analysis/view';
import { chainFunnel, claimCensus, machineryCensus } from '$lib/mechanisms';
import { mechanismsOf } from './selection';
import { fieldLabel } from './ArtefactValue';
import { BarChart, Figure } from './Figure';
import { Metrics } from './Metrics';
import { Table } from '../govuk';

/**
 * WHAT THE PAPER IS MADE OF — the head of Move 2, before any of its machinery.
 *
 * Move 2 asks why any of it is possible and opened on a chart of twenty-two
 * mechanism names. What the paper actually consists of, how much of its
 * machinery anybody is stated to run, and where its causal reading lands were
 * all fully computed and shown nowhere.
 *
 * THE THREE FACTS ARE ALREADY IN THE PAYLOAD AND NOTHING READS THEM.
 *  - The decomposition sorted 536 claims into thirteen categories. Grepped
 *    across the client tree, `category` appears only inside a comment.
 *  - 111 of the 151 mechanisms have nobody stated to run them, which the
 *    glossary tells the reader to look for — STRUCTURE_TERMS, term 'mechanism':
 *    "A mechanism with no operator is the commonest gap in a policy paper" —
 *    and which nothing computed.
 *  - 150 causal chains reach every one of the 151 mechanisms and narrow to
 *    eight conclusions.
 *
 * NO NEW PAYLOAD AND NOTHING UN-STUBBED. Every figure here is derived from
 * `refs`, `data.category` and the edges that already cross the wire.
 */
const BAR_COLOUR = 'var(--govuk-link-colour, #1a65a6)';

export function Composition({ artefacts, list, mechanismIds }: {
  artefacts: Artefact[];
  list: Play[];
  /** Passed in rather than rebuilt, so one definition of "is a mechanism" serves every view. */
  mechanismIds: Set<string>;
}) {
  const claims = useMemo(() => claimCensus(artefacts), [artefacts]);
  const census = useMemo(
    () => machineryCensus(artefacts, list, mechanismIds, (play) => mechanismsOf(play, mechanismIds)),
    [artefacts, list, mechanismIds],
  );
  const funnel = useMemo(() => chainFunnel(artefacts, mechanismIds), [artefacts, mechanismIds]);

  if (!claims.total && !census.named) return null;

  const largest = claims.rows[0];
  const smallest = claims.rows[claims.rows.length - 1];

  return (
    <>
      {claims.total ? (
        <>
          <h3 className="govuk-heading-m" id="composition-claims">What the paper asserts</h3>
          <p className="govuk-body">
            The run read {countOf(artefacts, 'passage')} passages and wrote {claims.total} separate
            assertions, each sorted into one of {claims.rows.length} kinds. This is the paper&rsquo;s
            own shape before anything is read into it: how much of it says what it wants, against
            how much says who decides.
          </p>
          {/*
            THIRTEEN BARS IN ONE INK, NOT A THIRTEEN-SEGMENT STACK. A stacked bar
            of 536 claims grouped thirteen ways puts the smallest category
            (dependency, 2.1%) at about 10px in a 500px bar and needs thirteen
            distinguishable fills — which breaks the report's one-ramp rule and
            the rule that colour is never the only signal. Every category is
            named on its own row instead, and the colour carries nothing.
          */}
          <Figure
            label="what the paper asserts"
            flipAtNarrow={false}
            diagram={(
              <BarChart
                label="Assertions by kind"
                total={claims.total}
                rows={claims.rows.map((row) => ({
                  key: row.key,
                  label: fieldLabel(row.key),
                  value: row.count,
                  colour: BAR_COLOUR,
                }))}
              />
            )}
            table={(
              <Table
                caption="Assertions by kind"
                captionSize="s"
                scroll
                columns={[{ header: 'Kind' }, { header: 'Assertions', numeric: true }, { header: 'Share', numeric: true }]}
                rows={claims.rows.map((row) => [
                  fieldLabel(row.key),
                  String(row.count),
                  `${Math.round((row.count / claims.total) * 100)}%`,
                ])}
              />
            )}
          />
          {largest && smallest && largest.key !== smallest.key ? (
            <p className="govuk-body">
              {fieldLabel(largest.key)} is the largest kind at {largest.count};{' '}
              {fieldLabel(smallest.key).toLowerCase()} the smallest at {smallest.count}. A paper
              that states what it wants far more often than who decides is the same reading the
              checks on how the policy is set up reach from the other direction, on the Verdict tab.
            </p>
          ) : null}
        </>
      ) : null}

      {census.named ? (
        <>
          <h3 className="govuk-heading-m govuk-!-margin-top-6" id="composition-machinery">
            How much of the policy has someone named to run it
          </h3>
          <p className="govuk-body">
            A part of the policy is something the paper sets up — a fund, a duty, a regulator. The
            first question to ask of each is whether the paper says who runs it, because a part with
            nobody named to run it is the commonest gap in a policy paper. Here is the answer for this one.
          </p>
          {/*
            NOT SELECTABLE, deliberately. `Metrics` is a `<dl>` of `<dt>`/`<dd>`
            pairs with a documented fix for an ordering defect axe cannot see;
            buttons inside it would break that content model, and `Selection`
            has no kind for "machinery nobody is stated to run".
          */}
          <Metrics
            columns={4}
            metrics={[
              { label: 'parts of the policy the paper sets up', value: census.named },
              {
                label: 'open up at least one way to beat it',
                value: census.generating,
                note: 'the chart on the Causes tab',
              },
              {
                label: 'have a named operator',
                value: census.withOperator,
                note: 'something is accountable for it, or has authority over it',
              },
              {
                label: 'appear in no stated relationship at all',
                value: census.unconnected,
              },
            ]}
          />
          <p className="govuk-body">
            {census.playsOnUnoperated} of the {census.playsOnMechanism} ways to beat it that name a
            part of the policy rest only on parts the paper never says who runs
            {census.named - census.withOperator
              ? `, and ${census.named - census.withOperator} of the ${census.named} parts have nobody named to run them at all`
              : ''}
            .
          </p>
        </>
      ) : null}

      {funnel.chains ? (
        <>
          <h3 className="govuk-heading-m govuk-!-margin-top-6" id="composition-chains">
            Where the chains of cause and effect lead
          </h3>
          {/*
            THREE STAGES, EQUAL WIDTH, WITH THE FIGURE PRINTED IN EACH. A funnel
            drawn to scale would put the last stage — eight — at about one pixel
            against 710, and a funnel drawn NOT to scale is a chart that lies
            about a length. The narrowing is in the numbers and in the reading
            order, which is where it can be read.
          */}
          <ol className="prt-chainflow">
            <li className="prt-chainflow__stage">
              <span className="prt-chainflow__n">{funnel.mechanisms}</span>
              <span className="prt-chainflow__label">parts of the policy a chain runs through</span>
            </li>
            <li className="prt-chainflow__stage">
              <span className="prt-chainflow__n">{funnel.assumptionCitations}</span>
              <span className="prt-chainflow__label">
                times an assumption is cited, across {funnel.chains} chains of cause and effect
              </span>
            </li>
            <li className="prt-chainflow__stage">
              <span className="prt-chainflow__n">{funnel.conclusions}</span>
              <span className="prt-chainflow__label">
                conclusions the chains reach, of {countOf(artefacts, 'finding')} the run wrote
              </span>
            </li>
          </ol>
          <p className="govuk-body-s prt-meta">
            A citation, not a distinct assumption: two chains resting on the same thing are counted
            twice, because the figure is how much work the chains do. Every chain&rsquo;s own
            assumptions are shown when you select the part of the policy it runs through, on the
            Causes tab.
          </p>
        </>
      ) : null}
    </>
  );
}

/** How many artefacts of one kind the run wrote — a denominator, said in full. */
function countOf(artefacts: Artefact[], kind: string): number {
  return artefacts.reduce((n, artefact) => (artefact.kind === kind ? n + 1 : n), 0);
}
