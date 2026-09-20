import type { Depth } from '$lib/relationships';

/**
 * HOW DEEP THE WIRING GOES — the star, drawn.
 *
 * `relationships.ts` has said in a comment since it was written that a policy
 * graph is "a very wide, very shallow star", the section says in prose that 95%
 * of relationships run from a body to a piece of machinery, and Move 2 makes
 * the same argument five more times across thirty insight rows of "9
 * relationships — 9 out, 0 in". None of it was ever a figure.
 *
 * It is sharper than any of those sentences. Measured on the live run: of the
 * 120 entities the paper places in a relationship, 46 only ever point at
 * something, 73 are only ever pointed at, and exactly ONE — Universities — is at
 * both ends of an arrow. Nothing in the paper is stated in both directions, and
 * there are 21 two-step paths in the entire graph, all of them through that one
 * entity. A reader who meets that has met the document's shape before reading a
 * single finding about it.
 *
 * TWO LISTS, TWO SCALES, AND EACH ONE SAYS WHICH. `Metrics`'s `Bar` carries the
 * same warning in writing: two bar lists in one panel look identical and are
 * normalised to different things, and hearing "73" and "81" with no scale is
 * hearing two numbers that cannot be compared. The first list is a share of the
 * 120 entities; the second is a share of the commonest degree.
 *
 * HTML ON `.prt-nodebar`, NOT SVG, and no toggle over it. The counts are
 * already real text in the third column of every row, so a table beside it
 * would be the same three columns again under a second pair of buttons — and
 * `Figure`'s own argument is that a toggle exists where the picture and the
 * table answer different questions, which here they do not.
 */
export function DegreeStrip({ depth }: { depth: Depth }) {
  if (!depth.total) return null;

  const ends = [
    { key: 'out', label: 'Points at something, nothing points back', count: depth.outOnly },
    { key: 'in', label: 'Pointed at, points at nothing', count: depth.inOnly },
    { key: 'both', label: 'At both ends of an arrow', count: depth.both },
    ...(depth.isolated ? [{ key: 'none', label: 'In the graph but at neither end', count: depth.isolated }] : []),
  ];

  // A share of the WHOLE population rather than of the biggest row, because
  // these four partition it: "73 of 120" is the reading, and normalising to 73
  // would draw the commonest case as a full bar and say nothing.
  const share = (count: number) => (depth.total > 0 ? (count / depth.total) * 100 : 0);
  const tallest = Math.max(0, ...depth.degrees.map((step) => step.count));

  return (
    <div className="prt-degree">
      <h4 className="govuk-heading-s">Which end of the arrow each thing sits at</h4>
      <figure className="prt-degree__block">
        {/* A list rather than `role="img"` with the reading in an
            `aria-label`: every row is real text, and `role="img"` on a `<ul>`
            is not an allowed role — it takes the list semantics off every
            item under it. Only the empty track is hidden. */}
        <ul className="prt-nodebars">
          {ends.map((end) => (
            <li key={end.key} className="prt-nodebar">
              <span>{end.label}</span>
              <span className="prt-nodebar__bar" aria-hidden="true">
                {end.count ? <span className="prt-nodebar__seg prt-degree__seg" style={{ width: `${share(end.count)}%` }} /> : null}
              </span>
              <span className="prt-nodebar__n">
                <strong>{end.count}</strong>{` · ${Math.round(share(end.count))}%`}
              </span>
            </li>
          ))}
        </ul>
        <figcaption className="govuk-body-s prt-meta">
          Each bar is a share of the {depth.total} things the paper places in a relationship.
        </figcaption>
      </figure>

      <p className="govuk-body">{depthSentence(depth)}</p>

      <h4 className="govuk-heading-s">How many relationships each thing holds</h4>
      <figure className="prt-degree__block">
        <ul className="prt-nodebars">
          {depth.degrees.map((step) => (
            <li key={step.degree} className="prt-nodebar">
              <span>{step.degree} {step.degree === 1 ? 'relationship' : 'relationships'}</span>
              <span className="prt-nodebar__bar" aria-hidden="true">
                {step.count ? (
                  <span
                    className="prt-nodebar__seg prt-degree__seg"
                    style={{ width: `${tallest > 0 ? (step.count / tallest) * 100 : 0}%` }}
                  />
                ) : null}
              </span>
              <span className="prt-nodebar__n">
                <strong>{step.count}</strong> {step.count === 1 ? 'thing' : 'things'}
              </span>
            </li>
          ))}
        </ul>
        <figcaption className="govuk-body-s prt-meta">
          Each bar is a share of the {tallest} things at the commonest degree — a different scale
          from the figure above. This is the long tail: most of what the paper connects, it connects once.
        </figcaption>
      </figure>
    </div>
  );
}

/**
 * The one sentence the two figures do not say on their own.
 *
 * EVERY TWO-STEP PATH RUNS THROUGH AN ENTITY THAT IS AT BOTH ENDS, by
 * definition — a middle needs something coming in and something going out — so
 * where there is exactly one such entity, naming it is arithmetic rather than a
 * claim. It is written that way round because the interesting case is the one
 * on this run: a graph of 106 relationships with a single joint in it.
 */
function depthSentence(depth: Depth): string {
  const of = `of the ${depth.total} things this paper connects`;
  if (!depth.both) {
    return `Nothing ${of} is at both ends of an arrow, so the paper contains no chain of two relationships anywhere: every relationship it states is a single hop that stops.`;
  }
  const named = depth.both === 1 ? ` — ${depth.bothNodes[0].label}` : '';
  const through = depth.both === 1 ? ', and every one of them runs through that one thing' : '';
  const paths = depth.twoHop === 1 ? 'is 1 two-step path' : `are ${depth.twoHop} two-step paths`;
  return `Just ${depth.both} ${of} ${depth.both === 1 ? 'is' : 'are'} at both ends of an arrow${named}. Everything else is a single hop that stops: there ${paths} in the whole graph${through}.`;
}
