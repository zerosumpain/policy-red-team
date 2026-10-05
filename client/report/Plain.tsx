import type { Artefact } from '$lib/policy-analysis/contracts';
import { plainRows } from '$lib/policy-analysis/plain';
import { TermText } from './Term';

/**
 * THE PLAIN-WORDS BLOCK, drawn first on a way to beat it, a scenario and a key
 * judgement (phase 23, P2–P3): who, what they do, what goes wrong and for
 * whom, what it is like, why it matters — one short line each, labelled the
 * same way every time so a reader scanning thirty cards finds "what goes
 * wrong" in the same place on each.
 *
 * A DESCRIPTION LIST, the brief's own pattern (`Brief.tsx`). Renders nothing
 * for an older row, so the two live runs read exactly as they did.
 */
export function PlainBlock({ artefact, className }: { artefact: Artefact; className?: string }) {
  const rows = plainRows(artefact);
  if (!rows.length) return null;
  return (
    <dl className={`prt-plain${className ? ` ${className}` : ''}`}>
      {rows.map((row) => (
        <div key={row.key} className={`prt-plain__row prt-plain__row--${row.key}`}>
          <dt className="prt-plain__label">{row.label}</dt>
          <dd className="prt-plain__text"><TermText text={row.text} /></dd>
        </div>
      ))}
    </dl>
  );
}
