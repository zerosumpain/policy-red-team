import type { ReactNode } from 'react';
import { relationWords } from '$lib/policy-analysis/matrix';
import type { Edge, EntityNode } from '$lib/policy-analysis/network';
import { kindColour, kindLabel } from '$lib/relationships';
import { Table } from '../govuk';
import { Figure } from './Figure';

/**
 * ONE ENTITY'S RELATIONSHIPS, drawn — the one place a node-link picture of a
 * policy graph is honest.
 *
 * A map of the whole graph draws almost none of it (the numbers are in
 * `$lib/relationships`). A map of what touches ONE body is small, complete and
 * answers the question a reader opened the page with.
 *
 * DIRECTION IS THE WHOLE READING. A body with eighteen outgoing duties and
 * nothing incoming is a body the paper has handed work to without wiring
 * anything back — one of the faults the network insights name in prose, visible
 * here in a second. So what points at it sits left, what it points at sits
 * right, and the subject is centred between them.
 *
 * IT WAS AN SVG AND IS NOT ANY MORE, for three reasons that are all the same
 * reason: SVG cannot do text.
 *  - Every spoke was a bare label truncated at 22 characters, so six of Skills
 *    England's relationships read "Authoritative skills…", "Data-analytics
 *    respons…", "Data-driven skills…". A box that wraps says the whole name.
 *  - The relation was printed UNDER each label rather than on the line, so the
 *    words "is accountable for" appeared six times down the right-hand side
 *    instead of once on each connector where they belong.
 *  - Nothing was a link. The obvious thing to do with a diagram of what a body
 *    is wired to is to follow one of the wires, and there was no way to.
 *
 * So the picture is a CSS grid of real boxes: the names wrap, the relation sits
 * on the connector, and every far end is an anchor into its own page — which
 * means it is keyboard-operable and announced correctly for free rather than by
 * a bespoke focus order over `<g>` elements.
 */

/**
 * How many relationships are drawn per side.
 *
 * Higher than the old SVG's eight because a wrapping box costs a row rather
 * than a slot in a fixed-height viewBox — but still capped, because a body with
 * forty-one outgoing duties makes a picture nobody reads, and the table below
 * carries every one of them either way.
 */
const DRAWN = 12;

export function EgoMap({ node, incoming, outgoing, kindOf, linkFor }: {
  node: EntityNode;
  incoming: Edge[];
  outgoing: Edge[];
  /**
   * What kind of thing an id is, for the box's colour.
   *
   * From the caller rather than off the edge: `Edge` carries `fromId`/`toId`
   * and no kinds, and the resolved kind lives on the network's node index —
   * which the caller already builds, because it needs it for the labels too.
   */
  kindOf: (id: string) => string;
  /** How the far end of a relationship is rendered — an anchor where there is one. */
  linkFor: (id: string) => ReactNode;
}) {
  const shownIn = incoming.slice(0, DRAWN);
  const shownOut = outgoing.slice(0, DRAWN);
  const hidden = (incoming.length - shownIn.length) + (outgoing.length - shownOut.length);
  /*
   * The kinds this map draws, in the order they appear: the hub, then whatever
   * its spokes are. `kindLabel` folds the raw kind into the same five slots
   * `kindColour` does, so two kinds that share a colour share one key entry, and
   * a map of one body and eleven mechanisms gets two entries rather than twelve.
   */
  const kinds = [...new Map(
    [node.kind, ...shownIn.map((e) => kindOf(e.fromId)), ...shownOut.map((e) => kindOf(e.toId))]
      .map((kind) => [kindLabel(kind), kind] as const),
  ).values()];

  /*
   * FROM AND TO, not "this body" and "to this".
   *
   * The columns used to be written from the subject's point of view, which is
   * true for half the rows and a lie for the other half: an incoming row put the
   * OTHER entity under "This body" and the subject under "To this", so a screen
   * reader navigating by column header announced the wrong one every time. The
   * relationship has a direction of its own and the headers name it.
   */
  const rows: ReactNode[][] = [
    ...incoming.map((edge) => [
      'Points at this',
      linkFor(edge.fromId),
      relationWords(edge.relation),
      <span key="s" className="prt-meta">{node.label}</span>,
    ]),
    ...outgoing.map((edge) => [
      'This points at',
      <span key="s" className="prt-meta">{node.label}</span>,
      relationWords(edge.relation),
      linkFor(edge.toId),
    ]),
  ];

  return (
    <Figure
      label="what connects to this"
      diagram={(
        <figure className="govuk-!-margin-0">
          {/* A SIDE WITH NOTHING ON IT DOES NOT TAKE A THIRD OF THE PICTURE.
              183 of 267 bodies on a real assessment have relationships in one
              direction only, and reserving the empty column pushed the subject
              hard against one edge with half the figure blank. The heading
              still appears — "nothing points at it" is the finding — it is just
              not given a column of its own. */}
          <div className={`prt-ego${incoming.length ? '' : ' prt-ego--no-in'}${outgoing.length ? '' : ' prt-ego--no-out'}`}>
            <div className="prt-ego__side prt-ego__side--in">
              <h3 className="prt-ego__head">
                Points at this{incoming.length ? ` — ${incoming.length}` : ''}
              </h3>
              {shownIn.length ? shownIn.map((edge) => (
                <div key={edge.artefact.id} className="prt-ego__row">
                  <span className="prt-ego__node" style={{ borderColor: kindColour(kindOf(edge.fromId)) }}>
                    {linkFor(edge.fromId)}
                  </span>
                  <Connector relation={relationWords(edge.relation)} />
                </div>
              )) : (
                <p className="govuk-body-s prt-meta">
                  Nothing in the paper points at it.
                </p>
              )}
            </div>

            {/* The subject, centred between the two sides and coloured by what
                kind of thing it is — the same five-colour key the relationship
                section uses, so a reader learns it once. */}
            <div className="prt-ego__hub">
              <span className="prt-ego__subject" style={{ borderColor: kindColour(node.kind) }}>
                {node.label}
              </span>
            </div>

            <div className="prt-ego__side prt-ego__side--out">
              <h3 className="prt-ego__head">
                This points at{outgoing.length ? ` — ${outgoing.length}` : ''}
              </h3>
              {shownOut.length ? shownOut.map((edge) => (
                <div key={edge.artefact.id} className="prt-ego__row">
                  <Connector relation={relationWords(edge.relation)} />
                  <span className="prt-ego__node" style={{ borderColor: kindColour(kindOf(edge.toId)) }}>
                    {linkFor(edge.toId)}
                  </span>
                </div>
              )) : (
                <p className="govuk-body-s prt-meta">
                  It points at nothing in the paper.
                </p>
              )}
            </div>
          </div>
          <figcaption className="govuk-body-s prt-meta">
            {/*
              THE KEY, NAMING ONLY THE KINDS THIS MAP ACTUALLY DRAWS.
              The border colour is the only thing that says whether a box is a
              body or a piece of machinery, and there was no key anywhere in the
              app: the comment above says a reader "learns it once" from the
              relationship section, and that section deliberately refuses the ramp
              ("colour belongs where it carries something, which here is the ego
              map"). It matters on a star graph — 101 of 106 edges run actor to
              mechanism, so nearly every map is a hub of one colour with spokes of
              another, and "Enhanced reception offer" does not say which it is.
              `kindLabel` and `kindColour` both go through `kindSlot`, so the key
              cannot drift from the boxes.
            */}
            <span className="prt-ego__key">
              {kinds.map((kind) => (
                <span key={kind} className="prt-ego__keyitem">
                  <span className="prt-ego__swatch" style={{ borderColor: kindColour(kind) }} aria-hidden="true" />
                  {kindLabel(kind)}
                </span>
              ))}
            </span>
            Every box opens that entity&rsquo;s own page.
            {hidden ? ` ${hidden} more ${hidden === 1 ? 'relationship is' : 'relationships are'} in the table.` : ''}
            {' '}
            <span className="govuk-visually-hidden">
              {node.label} has {incoming.length} incoming and {outgoing.length} outgoing
              relationships. The same relationships are available as a table.
            </span>
          </figcaption>
        </figure>
      )}
      table={(
        <Table
          caption="Every relationship the paper states about this"
          captionSize="s"
          scroll
          columns={[{ header: 'Direction' }, { header: 'From' }, { header: 'Stands in this relation' }, { header: 'To' }]}
          rows={rows}
        />
      )}
    />
  );
}

/**
 * The line between two boxes, with the relation ON it.
 *
 * A rule drawn across the cell and the words sitting on it with the page's own
 * background behind them — which is why the arrowhead is a character rather
 * than a border trick: it has to sit at the end of a line whose length is
 * whatever the grid gave the column.
 */
function Connector({ relation }: { relation: string }) {
  return (
    <span className="prt-ego__link" aria-hidden="true">
      <span className="prt-ego__rel">{relation}</span>
    </span>
  );
}
