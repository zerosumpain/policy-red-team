import { Link } from 'react-router';
import type { Detail } from '../api';
import { Details, Tag, WarningText } from '../govuk';
import { STAGES } from '$lib/policy-analysis/contracts';

/**
 * WHAT THE RUN HAS FOUND SO FAR, while it is still running.
 *
 * An eighteen-stage assessment produces its intelligence progressively: the
 * actors exist after stage 3, the exploitation playbook after stage 10, and the
 * synthesis not until the end. The page showed none of it — a task list and
 * nothing else — so a reader waiting four hours had no way to read work that had
 * been finished and stored for three of them. Measured on 2026-09-19: 1,830
 * artefacts held at stage 13, including 47 exploits and 55 actor profiles, with
 * no path to any of them.
 *
 * The drill route has never required a finished run. Everything here is
 * navigation to artefacts that were already readable and simply could not be
 * found.
 *
 * IT SAYS THAT IT IS PROVISIONAL, and means it. Later stages do not merely ADD:
 * the assurance stages exist to challenge what the earlier ones concluded, and a
 * claim that survives to stage 3 can be contradicted by evidence at stage 6 or
 * withdrawn at stage 16. Reading this as the answer would be worse than waiting,
 * so the warning is not boilerplate — it is the reason the panel can exist at
 * all.
 *
 * ORDERED BY WHAT A READER CAME FOR, not by how many there are. Somebody
 * watching a red-team assessment wants the exploits and the actor profiles; the
 * 536 claims are the raw material those were built from and can sit lower.
 */

/** The kinds worth surfacing mid-run, in the order a reader wants them. */
const INTERESTING: { kind: string; label: string; why: string }[] = [
  { kind: 'exploit', label: 'Exploitation playbook', why: 'How each actor can serve itself at the policy’s expense.' },
  { kind: 'profile', label: 'Actor profiles', why: 'What each body wants, and what its position rewards.' },
  { kind: 'finding', label: 'Findings', why: 'What the assurance stages have taken issue with.' },
  { kind: 'mechanism', label: 'Mechanisms', why: 'The machinery the paper relies on to work.' },
  { kind: 'assumption', label: 'Assumptions', why: 'What has to be true that the paper does not establish.' },
  { kind: 'scenario', label: 'Scenarios', why: 'How the policy behaves under each stress condition.' },
  { kind: 'model', label: 'Interaction models', why: 'Where the incentives point once bodies respond to each other.' },
  { kind: 'evidence', label: 'Evidence', why: 'What external sources say about the claims.' },
  { kind: 'claim', label: 'Claims', why: 'What the paper asserts, decomposed.' },
  { kind: 'actor', label: 'Actors', why: 'Every body the paper names or implies.' },
];

export function RunFindings({ detail, id }: { detail: Detail; id: string }) {
  const { artefacts, artefactMetadata } = detail;
  if (!artefacts.length) return null;

  const stageOf = new Map(artefactMetadata.map((m) => [m.id, m.stage]));
  const byKind = new Map<string, typeof artefacts>();
  for (const a of artefacts) {
    const list = byKind.get(a.kind);
    if (list) list.push(a);
    else byKind.set(a.kind, [a]);
  }

  const groups = INTERESTING.filter(({ kind }) => byKind.get(kind)?.length).map((g) => ({
    ...g,
    items: byKind.get(g.kind)!,
  }));
  if (!groups.length) return null;

  const total = groups.reduce((n, g) => n + g.items.length, 0);

  return (
    <section aria-labelledby="run-findings">
      <h2 className="govuk-heading-m" id="run-findings">What it has found so far</h2>

      <WarningText>
        This is a run in progress, and it is not the assessment. Later stages exist to challenge
        what earlier ones concluded — an actor profile written at stage 4 can be contradicted by
        evidence at stage 6, and a claim can be withdrawn at assurance. Read this to follow the
        work, not to draw a conclusion from it.
      </WarningText>

      <p className="govuk-body">
        {total.toLocaleString()} pieces of intelligence are readable now. Open any of them to see
        what it rests on and what cites it.
      </p>

      {groups.map((group) => (
        <Details key={group.kind} summary={`${group.label} — ${group.items.length}`}>
          <p className="govuk-body-s prt-meta">{group.why}</p>
          <ul className="govuk-list govuk-list--bullet">
            {/* Capped. A stage-3 run holds 569 actors, and a list that long is a
                wall rather than a way in — the drill is where you read one. */}
            {group.items.slice(0, 25).map((a) => {
              const stage = stageOf.get(a.id);
              return (
                <li key={a.id}>
                  <Link className="govuk-link" to={`/assessments/${id}/artefacts/${encodeURIComponent(a.id)}`}>
                    {a.label}
                  </Link>
                  {stage !== undefined ? (
                    <>
                      {' '}
                      <Tag colour="grey">{STAGES[stage] ?? `Stage ${stage}`}</Tag>
                    </>
                  ) : null}
                </li>
              );
            })}
          </ul>
          {group.items.length > 25 ? (
            <p className="govuk-body-s prt-meta">
              and {group.items.length - 25} more, which the finished report lists in full.
            </p>
          ) : null}
        </Details>
      ))}
    </section>
  );
}
