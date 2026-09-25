import { useState, type ReactNode } from 'react';
import type { Artefact } from '$lib/policy-analysis/contracts';
import { divergePeak } from '$lib/figures';
import { RELATION_FAMILIES } from '$lib/policy-analysis/glossary';
import { adjacency, bodyLinks, cellSentence, relationWords, unplacedEdges } from '$lib/policy-analysis/matrix';
import { isBody, type Network as PolicyNetwork } from '$lib/policy-analysis/network';
import {
  degreeRows, depthOf, egoOf, insightPopulations, kindLabel, labelIndex,
  originSplit, sharedTail, shapeOf,
} from '$lib/relationships';
import { Details, InsetText, SummaryList, Table, Tag, WarningText } from '../govuk';
import { DegreeStrip } from './DegreeStrip';
import { DivergePlot } from './Diverge';
import { EgoMap } from './EgoMap';
import { BarChart, Figure } from './Figure';
import { VocabularyGrid, type VocabularyFamily } from './VocabularyGrid';
import type { ArtefactLink } from './Report';
import type { Selection } from './selection';

/**
 * One blue, named once.
 *
 * `#1d70b8` was written into both bar charts here — a third raw copy of a
 * palette entry the design system has a token for. It is the framework's link
 * colour because these bars are the same "this is a quantity you can follow"
 * that a link is, and because a role should track the palette rather than pin a
 * hex that a brand refresh moves.
 */
const BAR_COLOUR = 'var(--govuk-link-colour, #1a65a6)';

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
 * THAT REFUSAL HAS NOT CHANGED, AND THE STAR IS NOW DRAWN ANYWAY. What was
 * missing was not a map but the SHAPE: how much of this reading the paper
 * actually said, which end of the arrow each thing sits at, how long the
 * longest chain is, and which of the twenty-six relation types the document
 * never uses. Four figures, none of them a node-link picture, each of them a
 * fact the section used to assert in prose — in one case five times.
 *
 * A node-link picture IS legible around ONE entity, which is why an insight
 * subject can open an `EgoMap` under itself: what points at this body and what
 * it points at, drawn where the graph is small enough to draw.
 *
 * The INSIGHTS lead, because they are the only thing here a reader cannot get by
 * scrolling: every one is a missing counterpart — authority nobody answers for,
 * a cost with no benefit, a body handed duties nothing points back at — computed
 * from relationships the paper itself asserted.
 */
export function NetworkSection({ net, artefacts, linkTo, selection, onClearSelection }: {
  net: PolicyNetwork;
  artefacts: Artefact[];
  linkTo?: ArtefactLink;
  /**
   * What the reader has narrowed the report to.
   *
   * MEASURED: about 4,450px of this panel — the whole of "How they connect" —
   * was byte-identical whether or not a mechanism had been chosen, because this
   * component never took the selection. Selecting one changed three paragraphs
   * in the lead above and nothing here. Optional, because the offline pack
   * renders this with no selection at all.
   */
  selection?: Selection;
  onClearSelection?: () => void;
}) {
  const shape = shapeOf(net);
  const grid = adjacency(net);
  const links = bodyLinks(net);
  const unplaced = unplacedEdges(net, grid);
  const byId = new Map(artefacts.map((a) => [a.id, a]));
  const nodeById = labelIndex(net);
  const origin = originSplit(net);
  const depth = depthOf(net);
  const populations = insightPopulations(net);

  /**
   * A name the reader can open, where the thing behind it is still in this copy.
   *
   * THE COMPOSED LABEL IS PASSED ON, and leaving it out was a real defect. Two
   * of these insights are about a RELATIONSHIP rather than a body: `network()`
   * sets their subject id to the edge's and composes the label as "A → B". A
   * link rendered from the artefact alone printed the model's own name for that
   * edge instead — the one thing on the row that does not say which direction
   * the insight is about. The offline pack, with no renderer at all, was
   * printing it correctly the whole time.
   */
  const name = (id: string, label: string): ReactNode => {
    const artefact = byId.get(id);
    return artefact && linkTo ? linkTo(artefact, label) : label;
  };

  // `isBody` rather than a second `kind === 'actor'`: BODY_KINDS is the copied
  // definition of what counts as a body, and it has drifted once already.
  const bodies = net.nodes.filter(isBody).length;
  const lead = shape.rows[0];
  /** Rows whose pair the paper also states the other way round. Counted, never halved: a pair is two rows and the arithmetic is one more thing to get wrong. */
  const twoWay = links.filter((link) => link.reciprocated).length;

  /*
   * ALL SEVEN FAMILIES, RANKED, WITH EVERY RELATION THEY DEFINE.
   *
   * `panels()` ends `.filter((p) => p.count > 0)` in the tracked core, so on
   * this run `net.families` is four entries and the three empty ones — Delivery
   * and data, Influence, Dependence — never reached the page, under a
   * standfirst promising seven. Rebuilt from `RELATION_FAMILIES`, which is a
   * read of the glossary rather than an edit of it, so an empty family draws a
   * zero and says so.
   *
   * RANKED RATHER THAN IN DECLARATION ORDER, which is a presentation decision
   * and belongs here rather than in `panels()`. The chart's only job is a
   * comparison and the paragraph above it asks for a specific one — money
   * against authority — and vocabulary order drew the smallest bar first, the
   * two largest in the middle and the second smallest last. `sort` is stable, so
   * the three zeroes keep the glossary's order among themselves.
   */
  const familyPanels = new Map(net.families.map((panel) => [String(panel.key), panel]));
  const families: (VocabularyFamily & { read: number; inferred: number })[] = RELATION_FAMILIES
    .map((family) => {
      const panel = familyPanels.get(family.key);
      const counted = new Map((panel?.relations ?? []).map((r) => [r.relation, r.count]));
      const split = origin.byFamily[family.key] ?? { read: 0, inferred: 0 };
      return {
        key: family.key,
        label: family.label,
        what: family.what,
        count: panel?.count ?? 0,
        colour: BAR_COLOUR,
        read: split.read,
        inferred: split.inferred,
        relations: family.relations
          .map((relation) => ({ relation, words: relationWords(relation), count: counted.get(relation) ?? 0 }))
          .sort((a, b) => b.count - a.count || a.words.localeCompare(b.words)),
      };
    })
    .sort((a, b) => b.count - a.count);

  const familiedTotal = families.reduce((sum, family) => sum + family.count, 0);
  const definedRelations = families.reduce((sum, family) => sum + family.relations.length, 0);
  const statedRelations = families.reduce((sum, family) => sum + family.relations.filter((r) => r.count).length, 0);
  const usedFamilies = families.filter((family) => family.count).length;
  const emptyFamilies = families.filter((family) => !family.count);
  /** A family the paper uses and never once states: the bar is entirely the model's reading of the structure. */
  const allInferred = families.filter((family) => family.count && !family.read);

  return (
    <>
      {selection?.kind === 'mechanism' ? (
        <MechanismDossier
          net={net}
          selection={selection}
          name={name}
          onClearSelection={onClearSelection}
        />
      ) : null}

      {/*
        IT SAYS WHICH POPULATION IT IS COUNTING, AND WHO SAID SO.
        This read "The paper states 106 relationships between 120 things it
        names, 47 of them bodies" — two separate overclaims in one sentence. The
        first: `nodesOf` only mints a node when an edge touches one, so these are
        the things the paper PLACES IN A RELATIONSHIP, not the things it names,
        and Move 4 counts the other population and reports 55 bodies from the
        same assessment. The second is worse: of the 106, only 21 carry
        `origin: 'extracted_fact'`. Four in five were inferred from the paper's
        structure and were being presented as things the document stated.
      */}
      <p className="govuk-body">
        This reading holds {net.edges.length} {net.edges.length === 1 ? 'relationship' : 'relationships'} between{' '}
        {net.nodes.length} things it places in one, {bodies} of them bodies — {origin.read} lifted from
        the paper's own words, {origin.inferred} inferred from its structure.
      </p>
      <p className="govuk-body-s prt-meta">
        {origin.withPage} of the {origin.total} name a page of the document; the rest cite none. Only
        relationships whose both ends resolve are counted — a dangling end is a reference, not a
        relationship — so a body the paper names but never connects to anything is not in this
        count. The &ldquo;Who is involved&rdquo; tab counts those.
      </p>

      <h3 className="govuk-heading-m" id="net-depth">How deep the wiring goes</h3>
      <DegreeStrip depth={depth} />

      {/* The argument, once. The 61-word version of this opened with "95% of
          them run from a body to a piece of machinery", which the figure below
          it draws and the depth block above it draws again; what is left is the
          part no figure carries. */}
      {lead && lead.fromKind === 'actor' && lead.toKind === 'mechanism' && lead.share >= 0.5 ? (
        <InsetText>
          That is the shape of a paper that says who benefits and what will be done, rather than who
          answers to whom — a finding about the document, not a gap in the reading.
        </InsetText>
      ) : null}

      <h3 className="govuk-heading-m" id="net-shape">Where the relationships run</h3>
      <Figure
        label="where the relationships run"
        /* The diagram is HTML and reads at 320px, so there is nothing for the
           breakpoint flip to rescue. See `Figure`'s own note. */
        flipAtNarrow={false}
        diagram={
          <BarChart
            label="Relationships by the kind of thing at each end"
            total={shape.total}
            /* ONE COLOUR. Colouring these by the kind at one end made three of
               the four bars purple, which reads as a grouping that is not there
               — the categories are already named in full on every bar. Colour
               belongs where it carries something, which here is the ego map. */
            rows={shape.rows.map((row) => ({
              key: row.key,
              label: `${kindLabel(row.fromKind)} → ${kindLabel(row.toKind)}`,
              value: row.count,
              colour: BAR_COLOUR,
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
        The contract defines {definedRelations} relation types in {families.length} families. This
        paper uses {statedRelations}, in {usedFamilies} of them. A paper heavy on money and light on
        authority is telling you something about where it expects compliance to come from.
      </p>
      <Figure
        label="relationships by family"
        flipAtNarrow={false}
        diagram={
          <VocabularyGrid
            families={families}
            total={familiedTotal}
            caption="Every relation type the contract defines, under the family it belongs to. A dashed chip is one this paper never uses."
          />
        }
        table={
          <Table
            caption="Relationships by family, and the relation types under each"
            captionSize="s"
            scroll
            firstCellIsHeader
            columns={[
              { header: 'Family' },
              { header: 'Relationships', numeric: true, width: '8rem' },
              { header: 'How it was arrived at' },
              { header: 'Stated' },
              { header: 'Never stated' },
            ]}
            rows={families.map((family) => [
              <>
                {family.label}
                <span className="prt-vocab__what">{family.what}</span>
              </>,
              String(family.count),
              `${family.read} read · ${family.inferred} inferred`,
              family.relations.filter((r) => r.count).map((r) => `${r.words} ${r.count}`).join(' · ') || '—',
              family.relations.filter((r) => !r.count).map((r) => r.words).join(', ') || '—',
            ])}
          />
        }
      />
      {emptyFamilies.length ? (
        <p className="govuk-body">
          {emptyFamilies.length} of the {families.length} families {emptyFamilies.length === 1 ? 'is' : 'are'} empty.
          The paper wires no {emptyFamilies.map((family) => family.label.toLowerCase()).join(', no ')} at all.
        </p>
      ) : null}
      {allInferred.length ? (
        <p className="govuk-body-s prt-meta">
          {/* The cross-tab the chart cannot show: a bar the standfirst invites a
              reader to weigh, built entirely out of the model's structural
              reading. On this run every one of the nine Authority relationships
              is inferred and none is read. */}
          Not one {allInferred.map((family) => family.label.toLowerCase()).join(' or ')} relationship was
          read off the page:{' '}
          {allInferred.map((family) => `all ${family.inferred} of them`).join(' and ')} were inferred from
          the paper's structure.
        </p>
      ) : null}
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
              own. The share of all relationships that get this far used to be
              spelled out here too, and it is the first bar of "Where the
              relationships run" two figures up: the same three numbers under a
              second heading is the duplicate this report has already deleted a
              playbook table to avoid. */}
          <p className="govuk-body">
            {grid.legible
              ? `Of the pairs drawn below, ${grid.reciprocal} ${grid.reciprocal === 1 ? 'is' : 'are'} stated in both directions and ${grid.oneWay} one way only.`
              : twoWay
                ? `Of the ${grid.placeable} body-to-body relationships, ${twoWay} of the ${links.length} pairs below also have the return leg stated; the rest run one way only.`
                : `Of the ${grid.placeable} body-to-body relationships, not one of the ${links.length} ${links.length === 1 ? 'pair' : 'pairs'} below is stated in both directions.`}
          </p>
          {grid.legible ? <AdjacencyTable grid={grid} name={name} /> : <BodyLinkTable links={links} name={name} />}
          {!grid.legible ? (
            <p className="govuk-body-s prt-meta">
              Listed rather than drawn as a grid — <a className="govuk-link" href="#net-shape">where the
              relationships run</a> is why.
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
        <Insights net={net} nodeById={nodeById} populations={populations} name={name} />
      ) : (
        <p className="govuk-body">
          Nothing stood out. With this few stated relationships there is not enough to find a
          missing counterpart in.
        </p>
      )}
    </>
  );
}

/**
 * WHAT THE SELECTION MEANS HERE, WHICH IS NOT AN EGO MAP.
 *
 * The obvious move — draw the chosen mechanism's own graph — dies on
 * measurement. `egoOf` run over all 22 play-generating mechanisms on the live
 * run returns out-degree 0 for every single one, and in-degree 1 for fourteen
 * of them. An ego map of a mechanism in this paper is a hub, one box and a
 * sentence: a node-link picture with one data point, in a section whose whole
 * argument is against pictures that flatter the extraction.
 *
 * So the selection gets a dossier instead: what is wired to it, and the
 * sentence that IS the Move 2 answer for a mechanism in a paper shaped like
 * this one — nothing runs back the other way.
 */
function MechanismDossier({ net, selection, name, onClearSelection }: {
  net: PolicyNetwork;
  selection: Extract<Selection, { kind: 'mechanism' }>;
  name: (id: string, label: string) => ReactNode;
  onClearSelection?: () => void;
}) {
  const ego = egoOf(net, selection.id);
  const index = labelIndex(net);
  const nameOf = (id: string) => name(id, index.get(id)?.label ?? id);

  return (
    <div className="govuk-!-margin-bottom-6">
      <h3 className="govuk-heading-m" id="net-selected">What is wired to “{selection.label}”</h3>
      {ego.in.length || ego.out.length ? (
        <>
          {ego.in.length ? (
            <SummaryList
              noBorder
              rows={ego.in.map((edge) => ({
                key: relationWords(edge.relation),
                value: nameOf(edge.fromId),
              }))}
            />
          ) : null}
          <p className="govuk-body">
            {ego.out.length
              ? `It also points at ${ego.out.length} ${ego.out.length === 1 ? 'thing' : 'things'} in the paper.`
              : `Nothing in the paper runs the other way: “${selection.label}” points at nothing.`}
          </p>
        </>
      ) : (
        <WarningText>
          The paper states no link touching this part of the policy at all — it opens up a way to
          beat the policy and is connected to nothing.
        </WarningText>
      )}
      {onClearSelection ? (
        <p className="govuk-body">
          <button type="button" className="prt-linkbutton" onClick={onClearSelection}>
            Show the whole graph
          </button>
        </p>
      ) : null}
    </div>
  );
}

/**
 * THE SEVEN INSIGHT BLOCKS, INDEXED AND DRAWN.
 *
 * MEASURED off the live report at 1280px: "What the connections show" ran from
 * page y≈3367 to y≈6360, about 2,990px — 55% of the whole Causality panel — as
 * seven repetitions of one shape, a heading, a 19px paragraph and a borderless
 * key/value column. The seven `reading` paragraphs are 256 words of string
 * literal in the tracked core and are byte-identical on every assessment ever
 * produced; the 30 subject rows beneath them are the only part that differs
 * between runs, and they were set in the same size and weight as the prose. A
 * reader could not tell that "Holds authority, answers to no one" stands for one
 * body and "Authority and money that run one way only" stands for 55 pairs.
 *
 * Four things change and the blocks themselves stay:
 *  - an index, so the seven are a list you can skip into rather than a scroll;
 *  - the population beside the count, because two of these lists were stating
 *    their own cap as the denominator;
 *  - the reading demoted to `govuk-body-s prt-meta`, so the per-run subjects
 *    lead the eye instead of the sentence that never changes;
 *  - and the two insights whose notes are a direction and a count drawn as
 *    centre-line bars instead of spelled out ten times.
 *
 * NOT RE-SORTED BY WEIGHT. `insights()` documents in writing that
 * `duplicate-bodies` and `attributed-but-unconnected` come first because they
 * are caveats on every figure below them rather than findings beside them, and
 * sorting by subject count would put `one-way` at the top. They are marked
 * "Read first" in the index instead.
 */
const SHOWN = 5;
const CAVEATS = new Set(['duplicate-bodies', 'attributed-but-unconnected']);

function Insights({ net, nodeById, populations, name }: {
  net: PolicyNetwork;
  nodeById: ReturnType<typeof labelIndex>;
  populations: Record<string, number>;
  name: (id: string, label: string) => ReactNode;
}) {
  /** One ego map open at a time, keyed by subject id: a section with six of them open is the hairball this file refuses. */
  const [openEgo, setOpenEgo] = useState<string | null>(null);

  /*
   * THE TWO INSIGHTS WHOSE NOTES ARE A SHAPE, JOINED BACK TO THE NUMBERS.
   *
   * `insights()` formats "10 relationships — 7 out, 3 in" into `subject.note`
   * for the bodies and the mirror of it for the machinery: ten rows, every one
   * of them a direction and a count written as English, in a section that
   * already has a bar vocabulary 3,000px above it. Five of the six top bodies
   * are N out / 0 in and all five machinery rows are 0 out / N in, which is a
   * paper that never states a return line — and reading it as ten sentences
   * makes a reader do that comparison ten times.
   *
   * ONE PEAK ACROSS BOTH, computed here rather than inside each plot, because
   * the two blocks are one comparison: normalised separately, 9 out and 6 in
   * would draw at the same length.
   */
  const degreeByKey = new Map(
    net.insights
      .filter((insight) => insight.key === 'load-bearing' || insight.key === 'load-bearing-machinery')
      .map((insight) => [
        insight.key,
        degreeRows(net, insight.subjects).map((row) => ({
          id: row.id,
          label: row.label,
          left: row.out,
          right: row.in,
          node: name(row.id, row.label),
        })),
      ]),
  );
  const degreePeak = divergePeak([...degreeByKey.values()].flat());

  const shownOf = (insight: PolicyNetwork['insights'][number]) => {
    const population = populations[insight.key] ?? insight.subjects.length;
    return population > insight.subjects.length
      ? `${insight.subjects.length} of ${population}`
      : String(insight.subjects.length);
  };

  return (
    <>
      <ul className="govuk-list govuk-!-margin-bottom-6">
        {net.insights.map((insight) => (
          <li key={insight.key}>
            <a className="govuk-link" href={`#insight-${insight.key}`}>{insight.headline}</a>{' '}
            <span className="prt-meta">— {shownOf(insight)}</span>{' '}
            {/* `.prt-legality` is this build's "a word in a box, never a
                colour" mark, and that is exactly what this is: an ordering
                instruction, not a severity. */}
            {CAVEATS.has(insight.key) ? <span className="prt-legality">Read first</span> : null}
          </li>
        ))}
      </ul>

      {net.insights.map((insight) => {
        const population = populations[insight.key] ?? insight.subjects.length;
        const rows = degreeByKey.get(insight.key);

        /*
         * THE CLAUSE EVERY ROW REPEATS, SAID ONCE.
         *
         * "Carries a cost, gains nothing the paper names" renders three rows
         * whose value is the identical five words "bears a cost; no benefit
         * recorded", and "Carries duties the paper never wires up" ends all
         * five of its rows with "; nothing in the paper points back at it".
         * The first is the whole note and the names can be a sentence; the
         * second has a real prefix per row — a count, sometimes a page range —
         * so only the tail moves out.
         */
        const notes = insight.subjects.map((subject) => subject.note);
        const identical = notes.length > 1 && new Set(notes).size === 1 ? notes[0] : '';
        const tail = identical ? '' : sharedTail(notes);
        const value = (note: string) => (tail ? note.slice(0, note.length - tail.length - 2) : note);

        /*
         * THE WAY INTO A SUBJECT'S OWN GRAPH SITS IN THE VALUE CELL.
         *
         * It was in the key, beside the name, and the key column is 14rem: at
         * that width "Office for Students" and the control could not share a
         * line, so all five rows of the longest block grew a second line and
         * the column read as a list of two-line names. In the value cell it
         * runs on from the note, which is one line on every row here.
         */
        const subjectRow = (subject: { id: string; label: string; note: string }) => ({
          key: name(subject.id, subject.label),
          value: (
            <>
              {value(subject.note)}
              {nodeById.has(subject.id) ? (
                <>
                  {' '}
                  <button
                    type="button"
                    className="prt-linkbutton"
                    aria-expanded={openEgo === subject.id}
                    aria-controls={`ego-${subject.id}`}
                    onClick={() => setOpenEgo(openEgo === subject.id ? null : subject.id)}
                  >
                    {openEgo === subject.id ? 'hide its relationships' : 'see its relationships'}
                    {/* Six of these in one block all reading "see its
                        relationships" tells a screen-reader user nothing about
                        whose — the defect `SummaryList`'s own
                        `visuallyHiddenText` exists to prevent. */}
                    <span className="govuk-visually-hidden"> — {subject.label}</span>
                  </button>
                </>
              ) : null}
            </>
          ),
        });

        return (
          <div key={insight.key} className="govuk-!-margin-bottom-6">
            {/* `tabIndex={-1}` so the index link above lands focus on the
                heading rather than scrolling the page and leaving the keyboard
                where it was. */}
            <h4 className="govuk-heading-s" id={`insight-${insight.key}`} tabIndex={-1}>{insight.headline}</h4>
            <p className="govuk-body-s prt-meta">
              {population > insight.subjects.length ? `Showing ${insight.subjects.length} of ${population}. ` : ''}
              {insight.reading}
              {tail ? ` On every one of these: ${tail}.` : ''}
            </p>

            {rows ? (
              <DivergePlot
                rows={rows}
                leftLabel="outgoing"
                rightLabel="incoming"
                peak={degreePeak}
                caption={`Left is what the thing points at, right is what points at it. One scale across both of these figures: the longest bar in either is ${degreePeak}.`}
              />
            ) : identical ? (
              // No key/value column for a list whose every value is the same
              // sentence: the clause is in the paragraph above and this is the
              // names.
              <p className="govuk-body">
                {identical.charAt(0).toUpperCase()}{identical.slice(1)}:{' '}
                {insight.subjects.map((subject, i) => (
                  <span key={subject.id}>
                    {i ? ', ' : ''}{name(subject.id, subject.label)}
                  </span>
                ))}.
              </p>
            ) : (
              <>
                <SummaryList noBorder rows={insight.subjects.slice(0, SHOWN).map(subjectRow)} />
                {insight.subjects.length > SHOWN ? (
                  <Details summary={`The other ${insight.subjects.length - SHOWN}`}>
                    <SummaryList noBorder rows={insight.subjects.slice(SHOWN).map(subjectRow)} />
                  </Details>
                ) : null}
                {/* The open map sits under the whole list rather than inside a
                    `<dd>`: a summary list row is a definition pair and a
                    figure is not a definition. */}
                {insight.subjects.some((subject) => subject.id === openEgo) ? (
                  <SubjectEgo net={net} nodeById={nodeById} id={openEgo as string} name={name} />
                ) : null}
              </>
            )}
          </div>
        );
      })}
    </>
  );
}

/**
 * ONE ENTITY'S OWN RELATIONSHIPS, where the graph is small enough to draw.
 *
 * `EgoMap` was built for exactly the fault these rows describe — its own
 * header says "a body with eighteen outgoing duties and nothing incoming is a
 * body the paper has handed work to without wiring anything back" — and until
 * now had one caller, the drill page. Five rows here read "9 duties attributed;
 * nothing in the paper points back at it" over a component that draws that in a
 * second, and it imports no router, so it is safe for the pack.
 *
 * GUARDED ON THE NODE INDEX at the call site, and the guard is load-bearing:
 * the `one-way` insight's subjects carry EDGE ids ("s3_043_edge_009"), so the
 * control would open an empty map on all eight of them. The LINK to the
 * artefact stays either way — this is an addition to the row, not a
 * replacement for the way into the record.
 */
function SubjectEgo({ net, nodeById, id, name }: {
  net: PolicyNetwork;
  nodeById: ReturnType<typeof labelIndex>;
  id: string;
  name: (id: string, label: string) => ReactNode;
}) {
  const node = nodeById.get(id);
  if (!node) return null;
  const ego = egoOf(net, id);
  return (
    <div id={`ego-${id}`} className="govuk-!-margin-bottom-4">
      <EgoMap
        node={node}
        incoming={ego.in}
        outgoing={ego.out}
        kindOf={(other) => nodeById.get(other)?.kind ?? 'other'}
        linkFor={(other) => name(other, nodeById.get(other)?.label ?? other)}
      />
    </div>
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
        rows={grid.bodies.map((from, i) => [
          name(from.id, from.label),
          ...grid.bodies.map((to, j) => {
            // The row index is already in hand. `indexOf` inside the inner map
            // was correct but ran an O(n) scan n² times, and would scale
            // cubically the day the cap is raised for a meshier paper.
            const cell = grid.rows[i]?.[j] ?? null;
            if (!cell) return <span className="govuk-visually-hidden">No stated relationship</span>;
            // RELATIONSHIPS, not distinct relation types. `relations` is the
            // vocabulary used on this pair; `ids` is the relationships
            // themselves, which is what `placeable` and `shown` count in the
            // sentence directly above this table.
            return (
              <>
                {cell.ids.length}
                <span className="govuk-visually-hidden"> — {cellSentence(from.label, to.label, cell)}</span>
              </>
            );
          }),
        ])}
      />
      {grid.omitted.length ? (
        <p className="govuk-body-s prt-meta">
          {/* The cap DRAWS the busiest and drops the tail — `adjacency()` sorts
              by placeable links and takes the first twelve. Calling what it
              dropped "busier than average" said the opposite of the rule. */}
          The grid draws the {grid.bodies.length} bodies with the most
          body-to-body relationships. {grid.omitted.length} quieter{' '}
          {grid.omitted.length === 1 ? 'one is' : 'ones are'} left off:{' '}
          {grid.omitted.slice(0, 5).map((b) => b.label).join(', ')}
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
  /*
   * MEASURED at thirty: 1,616 pixels, the tallest single thing in this section.
   * Twelve is two screens' worth of pairs and the remainder is one disclosure
   * away — the same cap the adjacency grid draws itself at.
   */
  const SHOWN_PAIRS = 12;
  return (
    <>
      <Table
        caption={`Body-to-body relationships, busiest pair first${links.length > SHOWN_PAIRS ? ` — the first ${SHOWN_PAIRS} of ${links.length} pairs` : ''}`}
        captionSize="s"
        scroll
        /*
         * RELATIONSHIPS, NOT DISTINCT RELATION TYPES — the fix the adjacency grid
         * already documents, applied to the list it degrades into.
         *
         * `bodyLinks` dedupes a pair's relation WORDS while keeping every edge id,
         * and this printed the words. On the real run the sentence above reads "3
         * of the 106 stated relationships run between two bodies" over a table of
         * two rows, because the paper states "UK Research and Innovation — funds →
         * Universities" as two separate edges and one word came out. The rows now
         * sum to the number in the sentence, and a pair the paper states twice is
         * visible as such.
         */
        columns={[
          { header: 'This body' },
          { header: 'Stands in this relation' },
          { header: 'To this body' },
          { header: 'Relationships', numeric: true, width: '8rem' },
          { header: 'Both ways?' },
        ]}
        rows={links.slice(0, SHOWN_PAIRS).map((link) => [
          name(link.fromId, link.fromLabel),
          link.relations.map(relationWords).join(', '),
          name(link.toId, link.toLabel),
          String(link.ids.length),
          link.reciprocated ? <Tag colour="green">Yes</Tag> : <span className="prt-meta">One way</span>,
        ])}
      />
      {links.length > SHOWN_PAIRS ? (
        <Details summary={`The other ${links.length - SHOWN_PAIRS}`}>
          <ul className="govuk-list govuk-list--bullet">
            {links.slice(SHOWN_PAIRS).map((link) => (
              <li key={`${link.fromId}-${link.toId}`}>
                {/* Every relation the pair stands in, the same as the table row
                    above — this printed only the first, which is dormant while
                    the tail is short and wrong the moment it is not. */}
                {name(link.fromId, link.fromLabel)} {link.relations.map(relationWords).join(', ')}{' '}
                {name(link.toId, link.toLabel)}
              </li>
            ))}
          </ul>
        </Details>
      ) : null}
    </>
  );
}
