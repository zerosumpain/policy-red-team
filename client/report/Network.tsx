import type { ReactNode } from 'react';
import type { Artefact } from '$lib/policy-analysis/contracts';
import { adjacency, bodyLinks, cellSentence, relationWords, unplacedEdges } from '$lib/policy-analysis/matrix';
import type { Network as PolicyNetwork } from '$lib/policy-analysis/network';
import { kindLabel, shapeOf } from '$lib/relationships';
import { Details, InsetText, SummaryList, Table, Tag } from '../govuk';
import { BarChart, Figure } from './Figure';
import type { ArtefactLink } from './Report';

/**
 * HOW THEY CONNECT — the relationship graph, drawn as what it actually is.
 *
 * Upstream renders this as a live 3D force layout. This build does not, and the
 * reason is measurement rather than portability. On the Best Start in Life
 * assessment — 452 stated relationships across 420 entities — a node-link
 * picture of the busiest ends places TEN of them at eight-by-ten, and
 * forty-three at twenty-by-twenty-six, by which size it is a hairball. The
 * degree distribution is flat: 183 of 267 bodies point at one thing or nothing.
 * A policy graph is a very wide, very shallow star, and a map of it is a picture
 * that flatters the extraction while answering no question a reader has.
 *
 * So the figures here are the two that are true at any size — WHERE the
 * relationships run, and WHAT KIND they are — and the bodies-against-bodies
 * question is answered by `matrix.ts`, which decides for itself whether there is
 * a mesh worth drawing (`legible`) and degrades to a ranked list when there is
 * not. The full argument and the numbers are in `src/lib/relationships.ts`.
 *
 * The INSIGHTS lead, because they are the only thing here a reader cannot get by
 * scrolling: every one is a missing counterpart — authority nobody answers for,
 * a cost with no benefit, a body handed duties nothing points back at — computed
 * from relationships the paper itself asserted.
 */
export function NetworkSection({ net, artefacts, linkTo }: {
  net: PolicyNetwork;
  artefacts: Artefact[];
  linkTo?: ArtefactLink;
}) {
  const shape = shapeOf(net);
  const grid = adjacency(net);
  const links = bodyLinks(net);
  const unplaced = unplacedEdges(net, grid);
  const byId = new Map(artefacts.map((a) => [a.id, a]));

  /** A name the reader can open, where the thing behind it is still in this copy. */
  const name = (id: string, label: string): ReactNode => {
    const artefact = byId.get(id);
    return artefact && linkTo ? linkTo(artefact) : label;
  };

  const bodies = net.nodes.filter((n) => n.kind === 'actor').length;
  const lead = shape.rows[0];
  /** Rows whose pair the paper also states the other way round. Counted, never halved: a pair is two rows and the arithmetic is one more thing to get wrong. */
  const twoWay = links.filter((link) => link.reciprocated).length;

  return (
    <>
      <p className="govuk-body">
        The paper states {net.edges.length} {net.edges.length === 1 ? 'relationship' : 'relationships'} between{' '}
        {net.nodes.length} things it names, {bodies} of them bodies. Only relationships whose both ends
        resolve are counted — a dangling end is a reference, not a relationship.
      </p>

      {/* The star, said in words before it is drawn. A reader who meets an empty
          bodies-against-bodies list without this paragraph concludes the
          extraction failed; it is the document. */}
      {lead && lead.fromKind === 'actor' && lead.toKind === 'mechanism' && lead.share >= 0.5 ? (
        <InsetText>
          {Math.round(lead.share * 100)}% of them run from a body to a piece of machinery. That is the
          shape of a paper that says who benefits and what will be done, rather than who answers to
          whom — and it is a finding about the document, not a gap in the reading. Expect the bodies
          to have little to say to each other below.
        </InsetText>
      ) : null}

      <h3 className="govuk-heading-m" id="net-shape">Where the relationships run</h3>
      <Figure
        label="where the relationships run"
        diagram={
          <BarChart
            label="Relationships by the kind of thing at each end"
            /* ONE COLOUR. Colouring these by the kind at one end made three of
               the four bars purple, which reads as a grouping that is not there
               — the categories are already named in full on every bar. Colour
               belongs where it carries something, which here is the ego map. */
            rows={shape.rows.map((row) => ({
              key: row.key,
              label: `${kindLabel(row.fromKind)} → ${kindLabel(row.toKind)}`,
              value: row.count,
              colour: '#1d70b8',
            }))}
          />
        }
        table={
          <Table
            caption="Relationships by the kind of thing at each end"
            captionSize="s"
            scroll
            columns={[{ header: 'From' }, { header: 'To' }, { header: 'Relationships', numeric: true }, { header: 'Share', numeric: true }]}
            rows={shape.rows.map((row) => [
              kindLabel(row.fromKind),
              kindLabel(row.toKind),
              String(row.count),
              `${Math.round(row.share * 100)}%`,
            ])}
          />
        }
      />

      <h3 className="govuk-heading-m" id="net-families">What kind of relationship</h3>
      <p className="govuk-body">
        Twenty-six relation types the contract defines, folded into the seven questions a reader
        actually arrives with. A paper heavy on money and light on authority is telling you
        something about where it expects compliance to come from.
      </p>
      <Figure
        label="relationships by family"
        diagram={
          <BarChart
            label="Relationships by family"
            rows={net.families.map((family) => ({
              key: family.key,
              label: family.label,
              value: family.count,
              colour: '#1d70b8',
            }))}
          />
        }
        table={
          <Table
            caption="Relationships by family"
            captionSize="s"
            scroll
            columns={[{ header: 'Family' }, { header: 'What it covers' }, { header: 'Relationships', numeric: true }, { header: 'Busiest end' }]}
            rows={net.families.map((family) => [
              family.label,
              family.what,
              String(family.count),
              family.top.length ? name(family.top[0].id, family.top[0].label) : '—',
            ])}
          />
        }
      />
      {net.unfamilied ? (
        <p className="govuk-body-s prt-meta">
          {net.unfamilied} {net.unfamilied === 1 ? 'relationship uses a relation type' : 'relationships use relation types'}{' '}
          no family claims — the vocabulary has gained something since the families were written.
        </p>
      ) : null}

      <h3 className="govuk-heading-m" id="net-bodies">Bodies against bodies</h3>
      {links.length ? (
        <>
          {/* THE FIGURES MUST DESCRIBE WHAT IS ON SCREEN. `grid.oneWay` and
              `grid.reciprocal` count the drawn grid — twelve bodies — and
              quoting them above the degraded list said "2 are stated one way
              only" over a table of thirty that all were. Each branch states its
              own. And the denominator is the PLACEABLE relationships, never all
              of them: "0 of 452" reads as a broken extraction, where "32 of 452
              run between two bodies" is the finding. */}
          <p className="govuk-body">
            {grid.placeable} of the {grid.total} stated relationships run between two bodies
            {grid.placeable !== grid.total
              ? ' — the rest run from a body to machinery or to a claim, and were never grid material'
              : ''}
            .{' '}
            {grid.legible
              ? `Of the pairs drawn below, ${grid.reciprocal} ${grid.reciprocal === 1 ? 'is' : 'are'} stated in both directions and ${grid.oneWay} one way only.`
              : twoWay
                ? `${twoWay} of the ${links.length} pairs below also have the return leg stated; the rest run one way only.`
                : `Not one of the ${links.length} ${links.length === 1 ? 'pair' : 'pairs'} below is stated in both directions.`}
          </p>
          {grid.legible ? <AdjacencyTable grid={grid} name={name} /> : <BodyLinkTable links={links} name={name} />}
          {!grid.legible ? (
            <p className="govuk-body-s prt-meta">
              Listed rather than drawn as a grid: a grid is a picture of a mesh, and {grid.placeable}{' '}
              {grid.placeable === 1 ? 'relationship' : 'relationships'} spread across {bodies} bodies
              does not make one. The list carries the same content without the empty frame.
            </p>
          ) : unplaced.length ? (
            <p className="govuk-body-s prt-meta">
              {unplaced.length} more body-to-body {unplaced.length === 1 ? 'relationship falls' : 'relationships fall'}{' '}
              outside the {grid.bodies.length} bodies drawn.
            </p>
          ) : null}
        </>
      ) : (
        <p className="govuk-body">
          The paper states no relationship between two bodies at all. Everything it wires up runs
          from a body to machinery or to a claim — which is worth knowing before reading any
          conclusion about accountability.
        </p>
      )}

      <h3 className="govuk-heading-m" id="net-insights">What the connections show</h3>
      {net.insights.length ? (
        net.insights.map((insight) => (
          <div key={insight.key} className="govuk-!-margin-bottom-6">
            <h4 className="govuk-heading-s">{insight.headline}</h4>
            <p className="govuk-body">{insight.reading}</p>
            <SummaryList
              noBorder
              rows={insight.subjects.map((subject) => ({
                key: name(subject.id, subject.label),
                value: subject.note,
              }))}
            />
          </div>
        ))
      ) : (
        <p className="govuk-body">
          Nothing structural stood out. With this few stated relationships there is not enough
          wiring to find a missing counterpart in.
        </p>
      )}
    </>
  );
}

/**
 * The grid, when there is a mesh to draw.
 *
 * A matrix is the one diagram that needs no table beside it, because it IS a
 * table: a row of full cells is a body everything runs through, an empty column
 * is a body nothing answers to, and the two halves of the diagonal show which
 * relationships the paper states in one direction only. Rendered with real row
 * and column headers, so a screen reader announces "Department, regulates,
 * Providers" rather than reading a wall of numbers.
 */
function AdjacencyTable({ grid, name }: {
  grid: ReturnType<typeof adjacency>;
  name: (id: string, label: string) => ReactNode;
}) {
  return (
    <>
      <Table
        caption="Each row is the body asserting the relationship; each column the body it is asserted about"
        captionSize="s"
        scroll
        firstCellIsHeader
        columns={[{ header: 'From ↓ / about →' }, ...grid.bodies.map((body) => ({ header: body.label, numeric: true }))]}
        rows={grid.bodies.map((from) => [
          name(from.id, from.label),
          ...grid.bodies.map((to, j) => {
            const cell = grid.rows[grid.bodies.indexOf(from)]?.[j] ?? null;
            if (!cell) return <span className="govuk-visually-hidden">No stated relationship</span>;
            return (
              <>
                {cell.relations.length}
                <span className="govuk-visually-hidden"> — {cellSentence(from.label, to.label, cell)}</span>
              </>
            );
          }),
        ])}
      />
      {grid.omitted.length ? (
        <p className="govuk-body-s prt-meta">
          {grid.omitted.length} busier-than-average {grid.omitted.length === 1 ? 'body is' : 'bodies are'} not
          on the grid: {grid.omitted.slice(0, 5).map((b) => b.label).join(', ')}
          {grid.omitted.length > 5 ? ', and others' : ''}.
        </p>
      ) : null}
    </>
  );
}

/** What the grid degrades to: the same content, busiest pair first, no empty frame. */
function BodyLinkTable({ links, name }: {
  links: ReturnType<typeof bodyLinks>;
  name: (id: string, label: string) => ReactNode;
}) {
  const SHOWN = 30;
  return (
    <>
      <Table
        caption="Every relationship the paper states between two bodies"
        captionSize="s"
        scroll
        columns={[{ header: 'This body' }, { header: 'Stands in this relation' }, { header: 'To this body' }, { header: 'Both ways?' }]}
        rows={links.slice(0, SHOWN).map((link) => [
          name(link.fromId, link.fromLabel),
          link.relations.map(relationWords).join(', '),
          name(link.toId, link.toLabel),
          link.reciprocated ? <Tag colour="green">Yes</Tag> : <span className="prt-meta">One way</span>,
        ])}
      />
      {links.length > SHOWN ? (
        <Details summary={`The other ${links.length - SHOWN}`}>
          <ul className="govuk-list govuk-list--bullet">
            {links.slice(SHOWN).map((link) => (
              <li key={`${link.fromId}-${link.toId}`}>
                {name(link.fromId, link.fromLabel)} {relationWords(link.relations[0])}{' '}
                {name(link.toId, link.toLabel)}
              </li>
            ))}
          </ul>
        </Details>
      ) : null}
    </>
  );
}
