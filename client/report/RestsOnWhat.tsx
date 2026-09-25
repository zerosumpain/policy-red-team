import { useMemo, type ReactNode } from 'react';
import type { Artefact } from '$lib/policy-analysis/contracts';
import { stress, type leverage, type StressRow } from '$lib/policy-analysis/stress';
import { reading, STANDING_LABEL } from '$lib/stress-view';

/** How many assumptions are shown. */
const SHOWN = 5;
/**
 * How many of the most-cited assumptions are run. `leverage()` returns every
 * assumption anything cites — 414 on the real assessment — and one run of the
 * stress test is about a millisecond there, so the tail is not worth the wait.
 */
const CANDIDATES = 60;
/** How many names a group lists before it counts the rest. */
const NAMES = 3;

/**
 * WHAT RESTS ON WHAT — for the assumptions that hold up most of the report,
 * what falls if each one is wrong.
 *
 * NOTHING HERE IS COMPUTED A SECOND TIME. `stress()` walks the citations the
 * assessment made and `reading()` sorts what moved into the two directions the
 * stress test keeps apart: conclusions that lose their support, and ways to
 * beat the policy that stop working because they needed the same thing to be
 * true. This is the stress test run once per assumption, before anybody ticks
 * anything, and laid out as a short tree per assumption rather than a graph —
 * the graph is a star (AGENTS.md), and a star drawn as a picture places almost
 * none of it.
 *
 * WHICH ASSUMPTIONS: THE ONES WHOSE FAILURE COSTS THE MOST. `leverage()` orders
 * by how many things cite an assumption, and `leverPreviews` measured that this
 * predicts neither outcome. So the `CANDIDATES` most-cited are each run and the
 * five that take down the most of what the report
 * SHOWS — its current recommendations and findings, not the superseded drafts
 * still in storage — are the ones printed.
 */
export function RestsOnWhat({ artefacts, levers, shown, linkTo, onStress }: {
  artefacts: Artefact[];
  levers: ReturnType<typeof leverage>;
  /** Ids of the recommendations and findings the report prints. */
  shown: Set<string>;
  linkTo?: (artefact: Artefact, label?: string) => ReactNode;
  onStress?: () => void;
}) {
  const trees = useMemo(() => {
    const visible = (row: StressRow) => shown.has(row.artefact.id);
    return levers
      .slice(0, CANDIDATES)
      .map((lever) => {
        const result = reading(stress(artefacts, [lever.artefact.id]));
        const group = (key: string) => (result.lost.find((g) => g.key === key)?.rows ?? []).filter(visible);
        const recs = group('recommendations');
        const findings = group('findings');
        return { assumption: lever.artefact, recs, findings, disarmed: result.disarmed, weight: recs.length * 2 + findings.length };
      })
      .filter((tree) => tree.weight > 0 || tree.disarmed.length > 0)
      .sort((a, b) => b.weight - a.weight || b.disarmed.length - a.disarmed.length)
      .slice(0, SHOWN);
  }, [artefacts, levers, shown]);

  if (!trees.length) return null;

  const names = (rows: StressRow[], tag: boolean): ReactNode => (
    <ul className="prt-rests-tree__names">
      {rows.slice(0, NAMES).map((row) => (
        <li key={row.artefact.id}>
          {linkTo ? linkTo(row.artefact) : row.artefact.label}
          {tag ? <span className="prt-meta"> — {STANDING_LABEL[row.standing].toLowerCase()}</span> : null}
        </li>
      ))}
      {rows.length > NAMES ? <li className="prt-meta">and {rows.length - NAMES} more</li> : null}
    </ul>
  );

  return (
    <>
      <p className="govuk-body">
        Some assumptions hold up much more of the report than others. For the {trees.length} that
        matter most, this shows what would lose its support if the assumption turned out to be
        wrong — and which ways to beat the policy would stop working, because they need it too.
      </p>
      <ol className="prt-rests-tree">
        {trees.map((tree) => (
          <li key={tree.assumption.id} className="prt-rests-tree__item">
            <h3 className="govuk-heading-s prt-rests-tree__head">
              If &ldquo;{tree.assumption.label}&rdquo; is wrong
            </h3>
            <ul className="prt-rests-tree__branches">
              {tree.recs.length ? (
                <li>
                  <strong>{tree.recs.length} {tree.recs.length === 1 ? 'recommendation loses' : 'recommendations lose'} support</strong>
                  {names(tree.recs, true)}
                </li>
              ) : null}
              {tree.findings.length ? (
                <li>
                  <strong>{tree.findings.length} {tree.findings.length === 1 ? 'finding loses' : 'findings lose'} support</strong>
                  {names(tree.findings, true)}
                </li>
              ) : null}
              {!tree.recs.length && !tree.findings.length ? (
                <li>No finding or recommendation in this report rests on it.</li>
              ) : null}
              {tree.disarmed.length ? (
                <li>
                  <strong>
                    {tree.disarmed.length} {tree.disarmed.length === 1 ? 'way to beat the policy stops' : 'ways to beat the policy stop'} working
                  </strong>
                  <span className="prt-meta"> — good news for the policy</span>
                  {names(tree.disarmed, false)}
                </li>
              ) : null}
            </ul>
          </li>
        ))}
      </ol>
      {onStress ? (
        <p className="govuk-body-s">
          <button type="button" className="prt-linkbutton" onClick={onStress}>
            Switch off any assumption yourself in &ldquo;What if we are wrong&rdquo;
          </button>
        </p>
      ) : null}
    </>
  );
}
