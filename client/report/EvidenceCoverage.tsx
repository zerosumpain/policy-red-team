import { useMemo, type ReactNode } from 'react';
import type { Artefact } from '$lib/policy-analysis/contracts';
import { evidenceShape } from '$lib/evidence-view';
import { InsetText, Table } from '../govuk';
import { Metrics } from './Metrics';

/**
 * WHAT IS BACKED UP — and what "backed up" turns out to mean.
 *
 * The section was four equal `Metrics` cards reading 15 Supports, 0
 * Contradicts, 0 Mixed, 0 Insufficient: three quarters of it the numeral zero,
 * the one non-zero figure on a green rule, and a reader scanning it concludes
 * the paper checks out. `src/lib/evidence-view.ts` carries what the payload
 * actually says — all fifteen links are the paper quoting itself, they reach 14
 * of 536 claims, and the paper's own 47 cited-evidence claims carry none of
 * them — and every sentence below is computed there rather than written here.
 *
 * THE FOUR CARDS COLLAPSE WHEN THREE OF THEM ARE ZERO. A degenerate row is not
 * a chart, it is one number and three restatements of "no"; one card and a
 * tally line say the same thing in a quarter of the height and stop the zeros
 * reading as reassurance. The four cards come straight back on a run whose
 * research stage returns something, which is the only reason the branch exists
 * rather than the row simply being deleted.
 *
 * NO COVERAGE TRACK. A marked span of 15 in 536 is 2.8% of the width and needs
 * a minimum-width floor to be visible at all — a bar that exists only because
 * of its floor is a picture of nothing, and the sentence beside it is strictly
 * more informative.
 *
 * NO STANDING COLUMN IN THE TABLE. All fifteen rows are `supports`, so a chip
 * column would be fifteen identical chips; the mix is stated once above, where
 * one reading of it is enough.
 */

/**
 * The tone on a card's rule, where the four cards are still drawn.
 *
 * It agrees with the label and carries nothing a reader could miss —
 * "contradicts" is not an alarm, it is the thing a red team is looking for.
 * Moved off `Report` with the block it belonged to.
 */
const EVIDENCE_TONE: Record<string, 'good' | 'severe' | 'moderate' | 'limited'> = {
  supports: 'good', contradicts: 'severe', mixed: 'moderate', insufficient: 'limited',
};

export function EvidenceCoverage({ artefacts, mix, linkTo }: {
  artefacts: Artefact[];
  /** `evidenceMix()` from the view layer — the four result counts, in enum order. */
  mix: { key: string; label: string; count: number }[];
  /** Optional, exactly as on `Report`: a report rendered without links still renders. */
  linkTo?: (artefact: Artefact, label?: string) => ReactNode;
}) {
  /*
   * MEMOISED ON `artefacts`, which is a stable prop between fetches. This walks
   * 2,296 artefacts twice to build the id map and the three kind filters, and
   * the report re-renders on every stage event while a run is in flight.
   */
  const shape = useMemo(() => evidenceShape(artefacts), [artefacts]);
  if (!shape.total) return null;

  const degenerate = mix.filter((entry) => entry.count).length <= 1;

  return (
    <>
      {degenerate ? (
        <>
          <Metrics
            metrics={[{
              label: 'evidence links',
              value: shape.total.toLocaleString(),
              note: shape.external
                ? `${shape.external} from outside the paper`
                : 'none from outside the paper',
            }]}
          />
          {/*
            THE THREE ZEROS, AS A TALLY RATHER THAN AS THREE CARDS. They are
            still on the page and still exact — what has gone is the three
            equal boxes that made "nothing contradicted" look like a finding of
            its own rather than the absence of one.
          */}
          <p className="govuk-body-s prt-meta">
            {mix.map((entry) => `${entry.label} ${entry.count}`).join(' · ')}
          </p>
        </>
      ) : (
        <Metrics
          columns={4}
          metrics={mix.map((entry) => ({
            label: entry.label,
            value: entry.count.toLocaleString(),
            tone: EVIDENCE_TONE[entry.key] ?? 'neutral',
          }))}
        />
      )}

      {shape.reading.map((line) => <p className="govuk-body" key={line}>{line}</p>)}

      <div className="prt-evidence">
        <Table
          caption="Every evidence link, and what it does not establish"
          captionSize="s"
          scroll
          firstCellIsHeader
          columns={[
            { header: 'What it backs' },
            { header: 'Page', numeric: true, width: '5rem' },
            { header: 'Kind of evidence' },
            { header: 'What it does not establish' },
          ]}
          rows={shape.rows.map((row) => [
            /*
              THE CLAIM, NOT THE EVIDENCE ARTEFACT'S OWN LABEL. Every one of the
              fifteen is called "Evidence for <the claim>", so a column of them
              is the word "Evidence" fifteen times followed by the thing a
              reader actually wants — and the claim is a real artefact with a
              drill behind it, which the evidence row's label is not.
            */
            /*
              MEASURED IN A SPAN, NOT ON THE CELL. Auto table layout sizes a
              column to its content's max-content width and treats `max-width`
              on a `td` inconsistently across browsers; a block-level span
              inside the cell is constrained everywhere. Without it the two
              prose columns asked for about 1,350px inside a 920px panel and
              the table scrolled sideways on a desktop screen.
            */
            <span className="prt-evidence__backs">
              {row.backs ? (linkTo ? linkTo(row.backs) : row.backs.label) : row.label}
            </span>,
            row.page === null ? <span className="prt-meta">—</span> : String(row.page),
            <span className="prt-evidence__kind">{row.evidenceType || '—'}</span>,
            <span className="prt-evidence__dispute">{row.dispute || '—'}</span>,
          ])}
        />
      </div>

      {/*
        GATED ON THE RUN ACTUALLY HOLDING A RETRIEVED SOURCE. This note —
        "A search excerpt is weak evidence and is labelled as one. A retrieval
        date is not a publication date." — describes a class of evidence this
        run does not contain, printed directly under a figure saying so. It is
        right and useful on a run that did retrieve something, and on this one
        it was the report warning a reader about evidence that is not there.
      */}
      {shape.external ? (
        <InsetText>
          A search excerpt is weak evidence and is labelled as one. A retrieval date is not a
          publication date.
        </InsetText>
      ) : null}
    </>
  );
}
