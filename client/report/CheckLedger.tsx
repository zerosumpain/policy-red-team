import type { ReactNode } from 'react';
import type { Artefact } from '$lib/policy-analysis/contracts';
import { TEST_RESULTS } from '$lib/policy-analysis/view';
import { relationWords } from '$lib/policy-analysis/matrix';
import { checkLedger, type CheckRelation } from '$lib/check-view';
import { Details, InsetText, Table } from '../govuk';
import { Bar } from './Metrics';
import { TestResult } from './TestResult';

/**
 * STRUCTURAL CHECKS, WITH THE RELATION EACH ONE NEEDED.
 *
 * The table was two columns — check name, result tag — and its bottom seven
 * rows were the same grey "Could not decide" pill seven times over. Every one
 * of the twelve carries `data.rule`, `data.reasoning` and `data.mitigation`,
 * and the report rendered none of the three, so the section's whole height was
 * bought by detail it declined to show.
 *
 * `src/lib/check-view.ts` has the arithmetic and the argument: the rule names
 * two relations, and on this run every check that could not decide tests a
 * relation the paper states zero times. That turns seven identical shrugs into
 * seven specific omissions — the paper never says who delivers anything, never
 * says who can veto anything — each with a one-sentence fix attached.
 *
 * A COUNT IS A WORD AND A SHAPE, NEVER A COLOUR. The relation bars are the
 * ink-on-grey `Bar` the report already uses in three tables; a relation the
 * paper never states draws no bar at all and says "never stated" beside an
 * empty track, because an empty bar and a short bar are not distinguishable at
 * a glance and the difference between them is the finding.
 *
 * THE CHIP STRIP RENDERS THROUGH `TestResult`, NOT THROUGH `TEST_RESULTS`.
 * Both name the same four keys and they disagree about the words: the copied
 * view layer calls `low_risk` "Relationship present" and `indeterminate` "No
 * evidence either way", while the tag on screen says "Low risk" and "Could not
 * decide". One enum, two vocabularies — so only the KEYS and their order are
 * taken from the copied file, and the component that is already on the page
 * supplies the word. Nothing in the tracked core is edited for it.
 *
 * NOT A GOV.UK ACCORDION. `Disclosure.tsx` already exports one, so building a
 * second would be duplication; and govuk-frontend 6.5's accordion sets
 * `hidden="until-found"` on collapsed content, which is invisible to Ctrl-F in
 * Firefox and Safari — and Ctrl-F is the offline pack's only interface. A
 * native `<details>` is findable in every engine.
 *
 * ITS CONTENT DOES NOT CURRENTLY REACH PAPER, AND THAT IS NOT THIS SECTION'S
 * DEFECT. The base print block opens a disclosure with
 * `details > *:not(summary) { display: block !important }`, which worked until
 * Chrome 131 re-implemented `<details>`: a closed one now clips its content
 * through `content-visibility: hidden` on a UA slot, which no `display` rule on
 * the child can reach. Measured here in print emulation on Chromium 149 — the
 * `.govuk-details__text` computes `display: block` and is laid out 1,579px
 * tall, and the `<details>` box around it is 21px. Every disclosure in the
 * report is affected, including the recommendations, the gaps and the
 * playbook's counter-measures, and the one-line fix belongs in the base with
 * the rule it repairs rather than scoped to this one section. What DOES print
 * is the whole of the ledger above — the check, both relations with their
 * counts, and the result — which is more than the two-column table it replaces
 * ever put on paper.
 *
 * THE RULE IS PRINTED VERBATIM, UNDERSCORES AND ALL. The report's standing
 * objection to an underscore is about a stored enum reaching the page as a
 * value a reader has to decode — `TestResult` exists for exactly that. This is
 * not that: it is the sentence the pipeline wrote, inside a disclosure headed
 * "what it looked for", and the two relation names in it are already set in
 * words in their own columns two cells to the left. Rewriting the run's own
 * record of the rule it applied would be a worse fault than an underscore.
 *
 * `data.inputs` AND `data.actors` ARE NOT RENDERED. Both are empty arrays on
 * some rows and not others — inputs on five of twelve, actors on seven — so
 * neither can be promised in a labelled block; and `inputs.length` is not the
 * denominator the reasoning quotes (52 against "43 of 43"), so a bar of it
 * beside that sentence would invite exactly the wrong reading.
 */
export function CheckLedger({ checks, net, linkTo }: {
  checks: Artefact[];
  /** The resolved graph, already memoised on `Report`: only its edges are read. */
  net: { edges: { relation: string }[] };
  /** Optional, exactly as on `Report`: a report rendered without links still renders. */
  linkTo?: (artefact: Artefact, label?: string) => ReactNode;
}) {
  /*
   * NOT MEMOISED, DELIBERATELY. `Report` calls `checks(artefacts)` fresh on
   * every render, so a memo keyed on it would miss every time and read as a
   * guard that is not guarding anything — the exact failure that file
   * documents for its own shaping ("two memos documented as protecting the
   * shaping, protecting nothing"). This walks twelve checks and 106 edges; the
   * expensive thing on the page is `network()`, and that one is memoised at
   * the root and passed in.
   */
  const ledger = checkLedger(checks, net.edges, TEST_RESULTS.map((r) => r.key));
  if (!ledger.rows.length) return null;

  /** One relation cell: the words, and how often the paper actually says it. */
  const relation = (value: CheckRelation | null) => {
    if (!value) return <span className="prt-meta">—</span>;
    return (
      <span className="prt-checkledger__rel">
        <span className="prt-checkledger__relname">{relationWords(value.relation)}</span>
        {value.count ? (
          <Bar value={value.count} max={ledger.peak} digits={0} scale={`stated in the paper, 0 to ${ledger.peak}`} />
        ) : (
          <span className="prt-checkledger__never">
            <span className="prt-checkledger__empty" aria-hidden="true" />
            never stated
          </span>
        )}
      </span>
    );
  };

  return (
    <>
      {ledger.reading ? <p className="govuk-body">{ledger.reading}</p> : null}

      {/*
        THE TALLY, ONCE, ABOVE THE ROWS — and not as a `StackedBar`, whose
        `tone` prop resolves to `.prt-band--*`. That is the exposure ramp, and
        `Report.tsx` argues at length that four bands cannot mean two things on
        one page.
      */}
      <p className="prt-checkledger__counts">
        {ledger.counts.map((entry) => (
          <span key={entry.key} className="prt-checkledger__count">
            <TestResult value={entry.key} />
            <span className="prt-denom">{entry.count}</span>
          </span>
        ))}
      </p>

      <div className="prt-checkledger">
        <Table
          caption="What the policy's own wiring was tested against"
          captionSize="s"
          scroll
          firstCellIsHeader
          columns={[
            { header: 'Check' },
            { header: 'Relation tested' },
            { header: 'Counterpart it requires' },
            { header: 'Result' },
            { header: 'Why' },
          ]}
          rows={ledger.rows.map((row) => [
            linkTo ? linkTo(row.artefact) : row.artefact.label,
            relation(row.trigger),
            relation(row.counterpart),
            <TestResult value={row.result} />,
            /*
              IN ITS OWN COLUMN, NOT IN THE ROW HEADER. A disclosure inside the
              `<th scope="row">` is re-read by a screen reader every time the
              reader moves to another cell in the row, which is four extra
              announcements of "Why, collapsed" per check.
            */
            <Details summary="Why">
              {row.rule ? (
                <>
                  <p className="prt-checkledger__label">What it looked for</p>
                  <p className="govuk-body-s">{row.rule}</p>
                </>
              ) : null}
              {row.reasoning || row.artefact.statement ? (
                <>
                  <p className="prt-checkledger__label">What it found</p>
                  <p className="govuk-body-s">{row.reasoning || row.artefact.statement}</p>
                </>
              ) : null}
              {/*
                THE MITIGATION IS THE ACTION AND IS SET AS ONE. Twelve of twelve
                carry it, all twelve distinct, and it is the only actionable
                sentence in the section — "Add review points, feedback and
                authority to adapt." An inset because it is what to do, not
                what happened.
              */}
              {row.mitigation ? <InsetText>{row.mitigation}</InsetText> : null}
            </Details>,
          ])}
        />
      </div>
    </>
  );
}
