import { useMemo, type ReactNode } from 'react';
import type { Artefact } from '$lib/policy-analysis/contracts';
import { Table } from '../govuk';
import { BarChart, Figure } from './Figure';

/**
 * THE BODIES THE PAPER DOES NOT PIN DOWN.
 *
 * Twelve `resolution_candidate` artefacts have been in every payload since the
 * pipeline was written, holding 158 candidate records between them — every one
 * of which resolves to a real actor artefact — and nothing in `client/` reads
 * the kind or either of its data keys. What the report said instead was half a
 * sentence in the smallest grey type on the Actors panel: "171 candidate
 * records stand for 55 names — entity resolution keeps candidates apart rather
 * than merging them".
 *
 * WHY KEEPING THEM APART IS THE RIGHT BEHAVIOUR AND STILL WORTH SHOWING: the
 * pipeline refuses to merge two mentions it cannot prove are the same body, so
 * "Employers" stands as 25 records rather than one. That is a deliberate,
 * conservative choice, and its cost is invisible until you see which names it
 * falls hardest on. Skills England, Employers, Government and Students and
 * learners carry 24, 25, 23 and 23.
 *
 * THE RECONCILING SENTENCE IS NOT OPTIONAL. Move 2's "Bodies the paper appears
 * to name more than once" already reports a different split for some of the
 * same names, because the network section counts only bodies the paper places
 * in a stated relationship while these rows count every extracted mention. Two
 * numbers for Employers on one report with nothing saying why is worse than the
 * sentence this replaces.
 */

/** The label without the prefix the pipeline writes: "Unresolved: Skills England" → "Skills England". */
const subject = (label: string) => label.replace(/^unresolved:\s*/i, '');

const BAR_COLOUR = 'var(--govuk-link-colour, #1a65a6)';

export function Resolution({ artefacts, linkTo }: {
  artefacts: Artefact[];
  linkTo?: (artefact: Artefact, label?: string) => ReactNode;
}) {
  const byId = useMemo(() => new Map(artefacts.map((a) => [a.id, a])), [artefacts]);
  const rows = useMemo(() => artefacts
    .filter((a) => a.kind === 'resolution_candidate')
    .map((a) => ({
      id: a.id,
      label: subject(a.label),
      candidates: Array.isArray(a.data.candidates)
        ? (a.data.candidates as unknown[]).filter((c): c is string => typeof c === 'string')
        : [],
      reason: String(a.data.reason ?? '').trim(),
    }))
    .sort((a, b) => b.candidates.length - a.candidates.length || a.label.localeCompare(b.label)),
  [artefacts]);

  if (!rows.length) return null;

  const total = rows.reduce((n, row) => n + row.candidates.length, 0);
  /*
   * THE SHARED REASON, STATED ONCE WITH ITS COUNT. Eleven of the twelve carry
   * the identical sentence, so printing it on every row would be eleven
   * repetitions of one fact and would bury the twelfth, which is the only one
   * that says something different.
   */
  const reasons = new Map<string, number>();
  for (const row of rows) reasons.set(row.reason, (reasons.get(row.reason) ?? 0) + 1);
  const ranked = [...reasons.entries()].sort((a, b) => b[1] - a[1]);
  const [common, commonCount] = ranked[0] ?? ['', 0];
  const others = rows.filter((row) => row.reason !== common);

  return (
    <>
      <p className="govuk-body">
        Where the paper names a body in a way the assessment cannot tie to one organisation, the
        mentions are kept as separate records rather than merged. That is deliberate: merging two
        bodies that turn out to be different would pin a way to beat the policy on the wrong one. These are the{' '}
        {rows.length} names it could not pin down, and the {total} records standing behind them.
      </p>

      <Figure
        label="the names the assessment could not pin down"
        /* The bars are HTML and read at 320px, so there is nothing for the
           breakpoint flip to rescue — `Figure`'s own note on the two charts in
           Move 2, which are the same construction. */
        flipAtNarrow={false}
        diagram={
          <BarChart
            label="Candidate records kept apart, by the name they were mentioned under"
            total={total}
            /* ONE INK. The rows are one category counted twelve ways and the
               name is on every bar, so a colour per bar would be a grouping
               that is not there — the argument `Network` makes for its own
               two charts. */
            rows={rows.map((row) => ({
              key: row.id,
              label: row.label,
              value: row.candidates.length,
              colour: BAR_COLOUR,
            }))}
          />
        }
        table={
          <Table
            caption="Candidate records kept apart, by the name they were mentioned under"
            captionSize="s"
            scroll
            columns={[
              { header: 'Name as the paper writes it' },
              { header: 'Records kept apart', numeric: true, width: '10rem' },
              { header: 'Why they were not merged' },
            ]}
            rows={rows.map((row) => [
              /* The first candidate is a real actor artefact, so the name has a
                 way into one of the records it stands for. It is one of the
                 many rather than the resolved body, which is exactly the point
                 the section is making, so the link is on the record and the
                 sentence says which. */
              row.candidates.length && byId.get(row.candidates[0]) && linkTo
                ? linkTo(byId.get(row.candidates[0]) as Artefact, row.label)
                : row.label,
              String(row.candidates.length),
              row.reason || '—',
            ])}
          />
        }
      />

      {common ? (
        <p className="govuk-body-s prt-meta">
          &ldquo;{common}&rdquo; — the reason given for {commonCount} of the {rows.length}.
          {others.map((row) => (
            <span key={row.id}> {row.label}: &ldquo;{row.reason}&rdquo;</span>
          ))}
        </p>
      ) : null}

      <p className="govuk-body">
        These count every record the assessment kept apart. The count under &ldquo;How they
        connect&rdquo; on the Causes tab is smaller for some of the same names because it counts
        only the bodies the paper places in a stated link.
      </p>
    </>
  );
}
