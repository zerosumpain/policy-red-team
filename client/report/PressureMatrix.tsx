import type { ReactNode } from 'react';
import { BAND_LABEL, type InterplayTarget } from '$lib/policy-analysis/view';
import { Matrix } from './Matrix';
import type { PressureBody, PressureLink } from './pressure';

/**
 * WHICH BODY IS AIMED AT WHICH PART OF THE POLICY.
 *
 * This is the join Move 4's own standfirst promises — "where three different
 * bodies are aimed at one measure, and where one body reaches across half the
 * machinery" — and until now the page made a reader perform it twelve times by
 * eye. It was a "From" column: 54 link facts printed as 54 name renderings over
 * 1,090 characters, "Department for Education" ten times, "Government" ten,
 * with the top row wrapping to four lines of blue link text.
 *
 * MEASURED BEFORE IT WAS DRAWN, because this repo already refuses a grid that
 * has not earned one: `adjacency()` will not draw a matrix below six placeable
 * relationships and Move 2 prints the refusal in words — "a grid is a picture of
 * a mesh, and 3 relationships spread across 47 bodies does not make one". This
 * join is 12 parts × 10 bodies = 120 cells with 54 filled, 45%. That is a mesh.
 *
 * A CELL IS THE WORST EXPOSURE, TO TWO DECIMALS, on the band's tint. Not a band
 * initial — "severe" and "significant" both begin with S — and not a filled
 * square, because the number is the thing a reader wants and it satisfies
 * never-colour-alone without a second glyph. The full reading is in the
 * visually-hidden sentence, in `cellSentence`'s idiom.
 *
 * NUMBERED COLUMNS, WHICH IS THE PRIMITIVE'S OWN RULE PAST SIX. On paper
 * `.prt-scroll table` is `table-layout: fixed` at 0.85em, so eleven columns get
 * about 47px each and a clipped "Department for…" sets as four broken letters a
 * line. A digit fits in any column that exists and the key below carries every
 * name at full length.
 *
 * NO CONTROL ON A COLUMN HEADER. `Matrix` offers one, and the body picker lives
 * on the body table below instead: a digit is a poor thing to press, and two
 * actor pickers 300px apart on one panel is a control a reader has to learn
 * twice.
 */
export function PressureMatrix({ targets, bodies, links, note }: {
  /** Rows: the drawn targets, in the pressure order the table above ranks them in. */
  targets: InterplayTarget[];
  /** Columns: the bodies aimed at those targets, in the body table's reach order. */
  bodies: PressureBody[];
  links: PressureLink[];
  note?: ReactNode;
}) {
  if (!targets.length || !bodies.length) return null;

  return (
    <Matrix
      caption="Which body is aimed at which part — the worst play each one could run against it"
      corner="Part of the policy / body"
      rows={targets.map((target) => ({ id: target.id, label: target.label }))}
      cols={bodies.map((body) => ({ id: body.id, label: body.label }))}
      numbered
      emptyText="No play aimed at it"
      note={note}
      cell={(row, col) => {
        const mine = links.filter((link) => link.targetId === row.id && link.actorId === col.id);
        if (!mine.length) return null;
        const worst = mine.reduce((top, link) => (link.exposure > top.exposure ? link : top), mine[0]);
        return {
          text: worst.exposure.toFixed(2),
          band: worst.band,
          sentence: `${row.label}, ${col.label}, ${mine.length} ${mine.length === 1 ? 'play' : 'plays'}, worst band ${BAND_LABEL[worst.band].toLowerCase()} at ${worst.exposure.toFixed(2)}`,
        };
      }}
    />
  );
}
