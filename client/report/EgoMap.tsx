import type { ReactNode } from 'react';
import { axisLabel, relationWords } from '$lib/policy-analysis/matrix';
import type { Edge, EntityNode } from '$lib/policy-analysis/network';
import { EGO_SPOKES, egoLayout, kindColour } from '$lib/relationships';
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
 * here in a second. So incoming sits left, outgoing right, and the subject is
 * centred against the taller side rather than each side being centred on its own.
 */
export function EgoMap({ node, incoming, outgoing, labelOf, linkFor }: {
  node: EntityNode;
  incoming: Edge[];
  outgoing: Edge[];
  labelOf: (id: string) => string;
  /** How the far end of a relationship is rendered in the table. */
  linkFor: (id: string) => ReactNode;
}) {
  const shownIn = incoming.slice(0, EGO_SPOKES);
  const shownOut = outgoing.slice(0, EGO_SPOKES);
  const hidden = incoming.length - shownIn.length + (outgoing.length - shownOut.length);
  const layout = egoLayout(shownIn.length, shownOut.length);

  const WIDTH = 760;
  const LEFT_END = 210;
  const CENTRE_X = 380;
  const RIGHT_START = 550;
  const colour = kindColour(node.kind);

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
          <div className="prt-scroll" tabIndex={0} role="region" aria-label="What connects to this, as a diagram">
            <svg
              viewBox={`0 0 ${WIDTH} ${layout.height}`}
              width="100%"
              style={{ maxWidth: WIDTH, minWidth: 520 }}
              role="img"
              aria-label={
                `Relationship diagram for ${node.label}. ` +
                `${incoming.length} ${incoming.length === 1 ? 'relationship points' : 'relationships point'} at it` +
                `${incoming.length ? `: ${shownIn.map((e) => `${labelOf(e.fromId)} ${relationWords(e.relation)} it`).join('; ')}` : ''}. ` +
                `It points at ${outgoing.length}` +
                `${outgoing.length ? `: ${shownOut.map((e) => `it ${relationWords(e.relation)} ${labelOf(e.toId)}`).join('; ')}` : ''}. ` +
                'The same relationships are available as a table.'
              }
            >
              {shownIn.map((edge, i) => (
                <g key={`in-${edge.artefact.id}`}>
                  <line x1={LEFT_END} y1={layout.left[i]} x2={CENTRE_X - 96} y2={layout.centreY} stroke="#505a5f" strokeWidth="1.5" />
                  <text x={LEFT_END - 8} y={layout.left[i] + 4} textAnchor="end" fontSize="13" fill="#0b0c0c">
                    {axisLabel(labelOf(edge.fromId), 22)}
                  </text>
                  <text x={LEFT_END - 8} y={layout.left[i] + 17} textAnchor="end" fontSize="11" fill="#505a5f">
                    {relationWords(edge.relation)} →
                  </text>
                </g>
              ))}
              {shownOut.map((edge, i) => (
                <g key={`out-${edge.artefact.id}`}>
                  <line x1={CENTRE_X + 96} y1={layout.centreY} x2={RIGHT_START} y2={layout.right[i]} stroke="#505a5f" strokeWidth="1.5" />
                  <text x={RIGHT_START + 8} y={layout.right[i] + 4} fontSize="13" fill="#0b0c0c">
                    {axisLabel(labelOf(edge.toId), 22)}
                  </text>
                  <text x={RIGHT_START + 8} y={layout.right[i] + 17} fontSize="11" fill="#505a5f">
                    → {relationWords(edge.relation)}
                  </text>
                </g>
              ))}
              <rect x={CENTRE_X - 96} y={layout.centreY - 20} width="192" height="40" fill={colour} />
              <text x={CENTRE_X} y={layout.centreY + 5} textAnchor="middle" fontSize="14" fill="#ffffff">
                {axisLabel(node.label, 24)}
              </text>
            </svg>
          </div>
          <figcaption className="govuk-body-s prt-meta">
            What points at it on the left, what it points at on the right.
            {hidden ? ` ${hidden} more in the table.` : ''}
          </figcaption>
        </figure>
      )}
      table={(
        <Table
          caption="Every relationship the paper states about this"
          captionSize="s"
          scroll
          columns={[{ header: 'Direction' }, { header: 'This body' }, { header: 'Stands in this relation' }, { header: 'To this' }]}
          rows={rows}
        />
      )}
    />
  );
}
