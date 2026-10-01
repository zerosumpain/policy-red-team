import type { ReactNode } from 'react';
import type { Artefact } from '$lib/policy-analysis/contracts';
import type { ClearedBody } from '$lib/policy-analysis/cleared';

/**
 * CHECKED AND CLEARED — the bodies the red team found no material way for to
 * beat the policy (phase 22).
 *
 * These rows used to be counted as ways to beat it: eight of the 46 on the real
 * Best Start run. They are left out of every figure now (`plays()`), and this
 * is the one place they are shown — once, on Threats, because "we looked at
 * children and babies and they cannot beat it" is a result of the red team,
 * and a reader checking whether a body was considered should find it here
 * rather than conclude it was missed.
 *
 * TWO KINDS OF ROW, said apart. A body whose only row is a clearance is a
 * cleared body and gets a line with its reason. A clearance written BESIDE real
 * plays — "Limited room for Jobcentre Plus exploitation" after two ways it can
 * — is a note that the body had nothing further, so it is named in one
 * sentence underneath rather than listed as if the body were clear.
 */
export function Cleared({ bodies, notes, actors, linkTo }: {
  bodies: ClearedBody[];
  /** Bodies by id, to name whose note each clearance row was. */
  actors: Map<string, Artefact>;
  /** Clearance rows written by a body that also has real ways to beat it. */
  notes: Artefact[];
  linkTo?: (artefact: Artefact, label?: string) => ReactNode;
}) {
  if (!bodies.length && !notes.length) return null;
  const name = (a: Artefact, label?: string) => (linkTo ? linkTo(a, label) : (label ?? a.label));
  const bodyName = (row: Artefact) => actors.get(String(row.data.actorId))?.label ?? row.label;
  return (
    <>
      {bodies.length ? (
        <>
          <p className="govuk-body">
            {bodies.length === 1 ? '1 body was' : `${bodies.length} bodies were`} checked and had no material way to
            beat the policy. {bodies.length === 1 ? 'It is' : 'They are'} not counted in any figure on these pages.
          </p>
          <ul className="govuk-list prt-cleared">
            {bodies.map((body) => (
              <li key={body.row.id} className="prt-cleared__item">
                <span className="prt-cleared__name">{name(body.row, body.name)}</span>
                <span className="prt-cleared__reason">{body.reason}</span>
              </li>
            ))}
          </ul>
        </>
      ) : null}
      {notes.length ? (
        <p className="govuk-body-s prt-meta">
          {notes.length === 1 ? 'One more row was' : `${notes.length} more rows were`} a body saying it had nothing
          beyond the ways already listed for it, and {notes.length === 1 ? 'is' : 'are'} not counted either:{' '}
          {/* The BODY's name as the link text: "Limited room to exploit" five
              times over says nothing about whose note it was. */}
          {notes.map((row, i) => (
            <span key={row.id}>{i ? (i === notes.length - 1 ? ' and ' : ', ') : ''}{name(row, bodyName(row))}</span>
          ))}.
        </p>
      ) : null}
    </>
  );
}
