import { useMemo, type ReactNode } from 'react';
import { BAND_LABEL, INTERPLAY_TARGETS, type Interplay, type InterplayTarget, type PersonaGroup, type Play } from '$lib/policy-analysis/view';
import type { Artefact } from '$lib/policy-analysis/contracts';
import { Details, Table } from '../../govuk';
import { BandKey, Bar } from '../Metrics';
import { PressureMatrix } from '../PressureMatrix';
import { cleanBodies, kindCounts, pressureBoard, pressurePlays, targetLookup, type PressureBody } from '../pressure';
import { filterPlays, type Selection } from '../selection';

/**
 * WHO IS COMING FOR WHAT — the head of Move 4.
 *
 * The other three moves each open with a lead that states the move's question in
 * figures: where the exposure sits, which mechanisms generate the most plays,
 * rank by what you care about. Move 4 had none, so the panel that answers "who
 * would do it" was a single twelve-row table and two sentences — 919px against
 * Threats' 6,104px and Causality's 5,330px, in a spine that presents the four as
 * peers.
 *
 * WHAT WAS MISSING WAS ALREADY WRITTEN. `interplay()` has been in the view layer
 * the whole time with its own argument for existing: "the actor board answers
 * 'who is in the room' and the playbook answers 'what could they do', and between
 * them a reader still has to hold the join in their head… that join is the whole
 * point of a game-theoretic read". It was wired to nothing here.
 *
 * A GRID, NOT A COMMA RUN. The join was a "From" column: the ten bodies pressing
 * the drawn twelve targets, printed as 54 name renderings over 1,090 characters,
 * in which "Department for Education" appeared ten times and the top row wrapped
 * to four lines of blue link text. That is a 12 × 10 matrix with 54 of its 120
 * cells filled — 45% — written out as prose and diffed by eye twelve times. The
 * report already has the test for when a grid earns its place: `adjacency()`
 * refuses one at three relationships across forty-seven bodies and says so on
 * the page. 45% is the other side of that judgement, so the column is now a
 * matrix and the target table is three columns.
 *
 * EVERY FIGURE ABOUT A BODY IS COMPUTED UNCAPPED. `interplay()` ranks the 99
 * targets, keeps the worst twelve and then derives its actor list from the links
 * that survived — which is right for the drawing and wrong for a body, and is
 * why this panel used to show ten bodies above a table of twelve, with the
 * Department for Education at 4 plays in one and 5 in the other. The drawn table
 * is still exactly what the core ranked; the body table comes from `pressure.ts`,
 * which is the same reduction with no cap. See that file for the measurements.
 */

export function ActorsLead({ artefacts = [], plays = [], interplay, personas, selection, onSelect, mechanismIds, linkTo }: {
  /**
   * OPTIONAL, LIKE `linkTo`, AND FOR THE SAME KIND OF REASON.
   *
   * Everything below the drawn table — the matrix, the body table, the tail —
   * is computed from the plays rather than from `interplay`, because
   * `interplay` caps. A caller that supplies neither gets the drawn table and
   * the persona block and nothing that would be wrong, which is the behaviour
   * a partially wired report should have. `Report` supplies both.
   */
  artefacts?: Artefact[];
  /**
   * The plays `interplay` was built from — `boardPlays`, not the raw list.
   *
   * Passed in rather than re-derived so the drawn table and the body table are
   * two readings of one input. A component that fetched its own plays would be
   * the third derivation on a panel whose defect was having two.
   */
  plays?: Play[];
  interplay: Interplay;
  personas: PersonaGroup[];
  /** Optional: a report rendered with no picker still renders every row. */
  selection?: Selection;
  onSelect?: (selection: Selection) => void;
  /** So a target that is a mechanism can be verified before it is offered as one. */
  mechanismIds?: Set<string>;
  linkTo?: (artefact: Artefact, label?: string) => ReactNode;
}) {
  const name = (artefact: Artefact | null, fallback: string) => {
    if (!artefact) return fallback;
    return linkTo ? linkTo(artefact) : artefact.label;
  };

  const byId = useMemo(() => new Map(artefacts.map((a) => [a.id, a])), [artefacts]);
  const board = useMemo(
    () => pressureBoard(pressurePlays(plays), targetLookup(artefacts)),
    [plays, artefacts],
  );

  /** The band split of each target's pressure, for the segmented bar. Keyed because the drawn rows come from the core. */
  const splits = useMemo(() => new Map(board.targets.map((t) => [t.id, t.split])), [board]);
  /** Everything under the cap, which the page used to report as a sentence and nothing else. */
  const tail = board.targets.slice(INTERPLAY_TARGETS);
  /** The denominator the captions state. `interplay` still knows it when the plays are not to hand. */
  const allTargets = board.targets.length || interplay.targets.length + interplay.hidden;

  /*
   * THE COLUMNS OF THE MATRIX ARE THE BODIES AIMED AT THE DRAWN TWELVE, in the
   * body table's own order. Two of the twelve bodies aim at none of them — that
   * is exactly why `interplay()` loses them — so their columns would be empty
   * from top to bottom, and an empty column in a grid reads as "this body does
   * nothing" rather than "this body is aimed elsewhere". They are named under
   * the grid instead.
   */
  const pressing = useMemo(() => {
    const drawn = new Set(interplay.targets.map((t) => t.id));
    const ids = new Set(board.links.filter((l) => drawn.has(l.targetId)).map((l) => l.actorId));
    return board.bodies.filter((body) => ids.has(body.id));
  }, [board, interplay]);
  const elsewhere = board.bodies.filter((body) => !pressing.some((p) => p.id === body.id));

  const widest = board.bodies[0] ?? null;
  /** The bar's own ceiling, taken once rather than per row. */
  const topPressure = Math.max(...interplay.targets.map((t) => t.pressure), 0);
  const clean = cleanBodies(board.bodies);

  const selectedBody = selection?.kind === 'actor'
    ? board.bodies.find((body) => body.id === selection.id) ?? null
    : null;
  /*
   * WHAT A SELECTED BODY IS POSITIONED TO RUN, under the table that selected it.
   *
   * Without this the control has no consequence anywhere in the panel:
   * `Report` builds this move's plays with `narrowExcept(…, 'actor')`, so
   * selecting a body deliberately leaves all three tables at their full height
   * — which is right, because the table is the picker, and which means the only
   * feedback a sighted reader would get is the pressed button's own colour.
   * `CausalityLead` answers its own bars the same way, for the same reason.
   */
  const running = selectedBody && mechanismIds
    ? filterPlays(plays, selection ?? null, mechanismIds)
    : [];

  if (!interplay.links.length && !personas.length) return null;

  /** A body name: the picker where there is one, the drill link where there is not. */
  const bodyCell = (body: PressureBody) => {
    // A body is built from the plays, so its artefact is looked up rather than
    // assumed: a record that has left the assessment degrades to its own name
    // instead of taking the panel down.
    const artefact = byId.get(body.id) ?? null;
    return (
      <>
        <BodyToggle id={body.id} label={body.label} selection={selection} onSelect={onSelect}>
          {artefact && linkTo ? linkTo(artefact, body.label) : body.label}
        </BodyToggle>
        {onSelect && linkTo && artefact ? (
          <span className="prt-meta prt-actors__open">{linkTo(artefact, 'open')}</span>
        ) : null}
      </>
    );
  };

  /**
   * A target's name, and — where the target is a mechanism the report can carry
   * — the control that carries it.
   *
   * Nine of the drawn twelve are mechanisms and three are claims, and the
   * mechanism selection they would set is machinery that already exists end to
   * end: `CausalityLead` constructs it, `parseSelection` resolves it from the
   * URL, `filterPlays` honours it. Move 4 named nine mechanisms and offered no
   * way to carry one anywhere. The claims stay plain links, and the difference
   * between a row you can press and a row you cannot becomes the visible form of
   * the distinction the kind line adds.
   *
   * VERIFIED AGAINST `mechanismIds`, not against the word: a target whose
   * artefact has gone stale degrades to a link rather than to a selection that
   * resolves to nothing.
   */
  const targetCell = (target: InterplayTarget) => {
    const isMechanism = Boolean(onSelect && mechanismIds?.has(target.id));
    const selected = selection?.kind === 'mechanism' && selection.id === target.id;
    return (
      <>
        {isMechanism && onSelect ? (
          <button
            type="button"
            className="prt-nodebar__name"
            aria-pressed={selected}
            onClick={() => onSelect(selected ? null : { kind: 'mechanism', id: target.id, label: target.label })}
          >
            {target.label}
          </button>
        ) : name(target.artefact, target.label)}
        <span className="prt-meta prt-actors__kind">
          {target.kind}
          {isMechanism && linkTo && target.artefact ? <> · {linkTo(target.artefact, 'open')}</> : null}
        </span>
      </>
    );
  };

  return (
    <section aria-labelledby="interplay">
      <h2 className="govuk-heading-l" id="interplay">Who is coming for what</h2>

      {interplay.links.length ? (
        <>
          <p className="govuk-body">
            Every way to beat the policy names the body that would do it and the part of the policy
            it defeats. The three figures below read that three ways: which parts are under the most
            pressure, which body is aimed at which part, and how far each body reaches. Nothing here
            is scored that the assessment did not already score — a part&rsquo;s pressure is the
            scores of every way to beat it aimed at that part, added up.
          </p>

          <Table
            caption={`What is aimed at — under the most pressure, the worst ${INTERPLAY_TARGETS} of ${allTargets}`}
            captionSize="s"
            scroll
            columns={[
              { header: 'Part of the policy' },
              { header: 'Ways to beat it aimed at it', numeric: true, width: '9rem' },
              { header: 'Pressure (scores added up)', numeric: true, width: '14rem' },
            ]}
            rows={interplay.targets.map((target) => [
              targetCell(target),
              String(target.incoming),
              <PressureBar pressure={target.pressure} max={topPressure} split={splits.get(target.id) ?? []} />,
            ])}
          />
          {/* THE TWO BARS IN THIS PANEL ARE ON DIFFERENT SCALES and looked
              identical. Pressure is normalised to the top row of its own table
              and runs to 5.75; the worst-play figure below is absolute on 0–1.
              A reader comparing a full pressure bar with a full worst-play bar
              was comparing a rank with a magnitude, and the only cue was the
              number of decimal places, which was an accident of the axis. */}
          <BandKey label="Each bar is split by how exposed:" />
          {/* The caption closes the figure, so the key belongs above it: the
              rule `.prt-caption` draws is where the figure ends, and a legend
              printed below that line reads as the next thing the report says. */}
          <p className="govuk-body-s prt-caption">
            Pressure adds up the scores of every way to beat it aimed at a part, so these bars compare
            parts with each other and not with the 0 to 1 score used everywhere else in the report.
          </p>

          {tail.length ? (
            <Details summary={`The other ${tail.length} parts under pressure`}>
              <p className="govuk-body-s">
                The {allTargets} parts under pressure are{' '}
                {kindLine(board.targets.map((t) => ({ kind: t.kind })))}. Every way to beat it aimed at
                any of them is in the list on the Threats tab.
              </p>
              <Table
                caption={`Under pressure, ranked ${INTERPLAY_TARGETS + 1} to ${allTargets}`}
                captionSize="s"
                scroll
                columns={[
                  { header: 'Part of the policy' },
                  { header: 'Kind' },
                  { header: 'Ways to beat it aimed at it', numeric: true, width: '9rem' },
                  { header: 'Pressure', numeric: true, width: '8rem' },
                ]}
                rows={tail.map((target) => [
                  name(byId.get(target.id) ?? null, target.label),
                  target.kind,
                  String(target.incoming),
                  target.pressure.toFixed(2),
                ])}
              />
            </Details>
          ) : null}

          <PressureMatrix
            targets={interplay.targets}
            bodies={pressing}
            links={board.links}
            note={elsewhere.length ? (
              <>
                {list(elsewhere.map((body) => `${body.label} (${body.plays})`))}{' '}
                {elsewhere.length === 1 ? 'is' : 'are'} not in the grid: every way to beat it{' '}
                {elsewhere.length === 1 ? 'it has is' : 'they have is'} aimed at a part below the
                cap. The body table below counts all {board.bodies.length}.
              </>
            ) : null}
          />

          {board.bodies.length ? (
            <>
              <div className="prt-actors__bodies">
                <Table
                  caption="Who could do it — every body with a way to beat the policy"
                  captionSize="s"
                  scroll
                  firstCellIsHeader
                  defaultOrder="reach order"
                  columns={[
                    { header: 'Body', sortable: true, name: 'Body', order: { asc: 'A to Z', desc: 'Z to A' } },
                    { header: 'Kind', sortable: true, name: 'Kind', order: { asc: 'A to Z', desc: 'Z to A' } },
                    {
                      header: `Parts it can reach (of ${allTargets})`,
                      numeric: true,
                      width: '12rem',
                      sortable: true,
                      name: 'parts it can reach',
                      order: { asc: 'fewest first', desc: 'furthest first' },
                    },
                    { header: 'Ways to beat it', numeric: true, width: '6rem', sortable: true, name: 'ways to beat it', order: { asc: 'fewest first', desc: 'most first' } },
                    {
                      header: 'The worst of them',
                      numeric: true,
                      width: '11rem',
                      sortable: true,
                      name: 'the worst of them',
                      order: { asc: 'least exposed first', desc: 'worst first' },
                    },
                    { header: 'Legality', width: '13rem' },
                  ]}
                  sortKeys={board.bodies.map((body) => [body.label, body.entityType, body.reach, body.plays, body.worst, 0])}
                  rows={board.bodies.map((body) => [
                    bodyCell(body),
                    body.entityType || '—',
                    /* The reach column is the one continuous quantity here that is
                       genuinely being ranked, so it keeps the bar; the worst play is
                       the band word plus its figure, which is how the same fact is
                       written everywhere else in the report. */
                    <Bar value={body.reach} max={allTargets} digits={0} scale={`of ${allTargets} parts under pressure`} />,
                    String(body.plays),
                    <>
                      <span className={`prt-band prt-band--${body.worstBand}`}>{BAND_LABEL[body.worstBand]}</span>{' '}
                      <span className="prt-denom">{body.worst.toFixed(2)}</span>
                    </>,
                    <span className="prt-actors__legality">
                      <span className="prt-legality">{body.compliant} inside the rules</span>
                      {/* A zero printed as "0 in a grey area" is a box a reader has to
                          read to learn nothing. Three of the twelve have none. */}
                      {body.grey ? <span className="prt-legality">{body.grey} in a grey area</span> : null}
                    </span>,
                  ])}
                />
              </div>

            {onSelect ? (
              <p className="govuk-body">
                Select a body to carry it into the other three moves. Selecting one leaves every row
                here — this table is how a body is chosen, so it never narrows itself.
              </p>
            ) : null}

            {selectedBody && running.length ? (
              /* `.prt-mech` AND NOT A SECOND VOCABULARY. It is the block
                 `CausalityLead` puts under its mechanism picker, for the same
                 reason: the answer to a press has to look like an answer and not
                 like the next section. */
              <div className="prt-mech" id="positioned">
                <h3 className="govuk-heading-m govuk-!-margin-bottom-1">
                  What {selectedBody.label} could do
                </h3>
                <ol className="govuk-list govuk-list--spaced">
                  {running.map((play) => (
                    <li key={play.artefact.id}>
                      <span className={`prt-band prt-band--${play.band}`}>{BAND_LABEL[play.band]}</span>{' '}
                      {linkTo ? linkTo(play.artefact) : play.artefact.label}
                    </li>
                  ))}
                </ol>
              </div>
            ) : null}

            {/* WHAT KIND OF THING EACH BODY IS, said once under the column that
                says it per row. Every actor artefact carries `entityType` and no
                table in this move rendered it, so a department, a regulator, a
                provider category and a user group sat at identical weight. The
                reading it produces is the sentence after the breakdown: the body
                that reaches furthest across the machinery is not an institution
                at all. */}
            <p className="govuk-body-s prt-meta">
              The {board.bodies.length} bodies are {kindLine(board.bodies.map((b) => ({ kind: b.entityType })))}.
              {widest && widest.entityType === 'concept' ? (
                <> The furthest-reaching of them, {widest.label}, reaches {widest.reach} of
                  the {allTargets} parts under pressure and is the one the assessment could
                  only classify as a concept rather than name as an institution.</>
              ) : null}
            </p>

            {/* NOT "30 OF 47" AGAIN. Move 1's tile row already carries the
                assessment-wide figure; what this move can say and that tile
                cannot is which bodies need no grey area at all, and the sentence
                is built from the counts rather than typed, so it stays true on
                the next paper. */}
            {clean.length ? (
              <p className="govuk-body">
                No body here has to break a rule to beat the policy. {list(clean.map((b) => b.label))}{' '}
                {clean.length === 1 ? 'has' : 'have'} nothing even in a grey area.
              </p>
            ) : null}
            </>
          ) : null}
        </>
      ) : null}

      {/*
        A PRIOR IS ONLY A PRIOR THE SECOND TIME. This block was a heading, three
        paragraphs and a twelve-row table under "Bodies this assessment has met
        before", and every one of the twelve `sightings` values on this run is 1
        — so its one distinguishing column read "1 paper" twelve times, saying
        the opposite of the heading, in a section that otherwise repeated the
        body table above it row for row. The library page says it plainly and is
        the page nobody lands on: "12 bodies. None has turned up in more than one
        paper yet."

        So the block renders only when there is a prior to report. The moment a
        second assessment profiles one of these bodies it returns, populated,
        saying something true.
      */}
      {priors(personas).length ? (
        <>
          <h3 className="govuk-heading-m govuk-!-margin-top-6">Bodies this assessment has met before</h3>
          <p className="govuk-body">
            The persona library holds what earlier assessments recorded about a body across other
            papers. A prior is context and never evidence — nothing in this report rests on one —
            but a body you have read about before is one you can read faster.
          </p>
          <Table
            caption="Seen in other assessments"
            captionSize="s"
            scroll
            columns={[
              { header: 'Body' },
              { header: 'Seen in', numeric: true, width: '8rem' },
              { header: 'Ways to beat it here', numeric: true, width: '8rem' },
              { header: 'The worst here', numeric: true, width: '11rem' },
            ]}
            rows={priors(personas).map((group) => [
              /* THE ACTOR'S OWN LABEL, and the library's name only where they
                 differ. `personaBoard()` groups by the library's name, and on
                 this run one of the twelve differs — "Government policy actor"
                 over the actor "Government" — so the same body appeared twice
                 on one panel under two names with identical counts and nothing
                 tying them together. It read as a thirteenth body. */
              <>
                {group.here.length && linkTo ? linkTo(group.here[0].actor) : group.here[0]?.actor.label ?? group.name}
                {group.here[0] && group.here[0].actor.label !== group.name ? (
                  <span className="prt-meta prt-actors__kind">library: {group.name}</span>
                ) : null}
              </>,
              papers(group.records.reduce((n, r) => n + r.sightings, 0)),
              String(group.plays.length),
              group.worst
                ? <span className={`prt-band prt-band--${bandOf(group.worst, group)}`}>{BAND_LABEL[bandOf(group.worst, group)]}</span>
                : <span className="prt-meta">none</span>,
            ])}
          />
        </>
      ) : personas.length ? (
        <p className="govuk-body-s prt-meta">
          All {personas.length} of these bodies have a record in the persona library and none has
          been seen in a second paper yet, so nothing here is a prior. A record becomes useful the
          second time a body turns up.
        </p>
      ) : null}
    </section>
  );
}

/**
 * A body name as the picker, or as whatever the caller renders without one.
 *
 * EXPORTED because the twelve-row table in `Report`'s "Who is involved" covers
 * the same twelve bodies and must offer the same control — two tables on one
 * panel where only one name is pressable is a control a reader cannot learn.
 *
 * `prt-nodebar__name` AND NOT `prt-linkbutton`: the base hides `.prt-linkbutton`
 * outright in print, so a body name rendered as a link-button would vanish from
 * the printed report, and this is the row's only name. `prt-nodebar__name`
 * already carries the yellow GDS focus ring and the pressed weight, and is the
 * class `CausalityLead`'s mechanism picker wears one move over.
 *
 * OPENING IS NOT SELECTING, which `selection.ts` argues in writing, so the drill
 * link stays a separate control rather than being folded into this one.
 */
export function BodyToggle({ id, label, selection, onSelect, children }: {
  id: string;
  label: string;
  selection?: Selection;
  onSelect?: (selection: Selection) => void;
  /** What renders where there is no picker — a link, usually. */
  children?: ReactNode;
}) {
  if (!onSelect) return <>{children ?? label}</>;
  const selected = selection?.kind === 'actor' && selection.id === id;
  return (
    <button
      type="button"
      className="prt-nodebar__name"
      aria-pressed={selected}
      onClick={() => onSelect(selected ? null : { kind: 'actor', id, label })}
    >
      {label}
    </button>
  );
}

/**
 * A pressure bar, divided by the band of the plays that make it up.
 *
 * SEGMENTED BY SUMMED EXPOSURE, NOT BY PLAY COUNT. The bar's whole length is a
 * sum of exposure, so a reader reads a segment's width as a contribution to
 * that sum; sizing the segments by how many plays are in each band would draw
 * six limited plays wider than two severe ones inside a bar whose length says
 * the opposite.
 *
 * IT IS WORTH DRAWING BECAUSE THE SPLIT IS THE RESIDUAL. Measured across the 99
 * targets, "Plays aimed at it" and "Pressure" correlate at r = 0.986 — two
 * columns carrying one signal — and the finding is in the difference: the Sector
 * Based Work Academy Programme takes six plays for 3.39 of pressure where the
 * Authoritative skills intelligence mechanism takes six for 4.40. Sorted on
 * pressure, that row reads as an ordering glitch until you can see that a fifth
 * of its pressure is severe where the other's is five sixths.
 */
function PressureBar({ pressure, max, split }: {
  pressure: number;
  max: number;
  split: { band: string; exposure: number }[];
}) {
  const share = max ? Math.max(0, Math.min(1, pressure / max)) * 100 : 0;
  return (
    <span className="prt-pressure">
      <span className="prt-pressure__track" aria-hidden="true">
        <span className="prt-pressure__fill" style={{ width: `${share}%` }}>
          {split.map((entry) => (
            <span
              key={entry.band}
              className={`prt-pressure__seg prt-band--${entry.band}`}
              style={{ flexGrow: entry.exposure }}
            />
          ))}
        </span>
      </span>
      <span className="prt-pressure__value">
        {pressure.toFixed(2)}
        {/* The split, for anyone not looking at it — the same construction
            `CausalityLead` uses on its mechanism bars, and the reason the bar
            needs no second encoding to satisfy never-colour-alone. */}
        <span className="govuk-visually-hidden">
          {' — '}{split.map((entry) => `${entry.exposure.toFixed(2)} ${entry.band}`).join(', ')}
        </span>
      </span>
    </span>
  );
}

/** "1 paper", "5 papers" — a sightings count reads as English or it reads as a bug. */
const papers = (n: number) => `${n} ${n === 1 ? 'paper' : 'papers'}`;

/** The groups the library has actually seen more than once. Empty on this run, and that is the finding. */
const priors = (groups: PersonaGroup[]) =>
  groups.filter((group) => group.records.reduce((n, r) => n + r.sightings, 0) > 1);

/** "Ofsted, Ofqual and Parliament" — an English list, because a comma run reads as a field. */
function list(items: string[]): string {
  if (items.length <= 1) return items[0] ?? '';
  return `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`;
}

/** "55 mechanisms, 41 claims and 3 assumptions" — a composition, counted in `pressure.ts` and worded here. */
function kindLine(items: { kind: string }[]): string {
  return list(kindCounts(items).map(({ kind, count }) => `${count} ${count === 1 ? kind : plural(kind)}`));
}

/**
 * Enough pluralisation for the words these two sentences actually use.
 *
 * The words are the artefact kinds — mechanism, claim, assumption — and the
 * entity types the profiles write: department, agency, provider, user group,
 * concept. "Agency" is the one that needs the y-rule, and it printed
 * "5 agencys" before this existed.
 */
const plural = (word: string) => {
  if (word.endsWith('s')) return word;
  if (/[^aeiou]y$/.test(word)) return `${word.slice(0, -1)}ies`;
  return `${word}s`;
};

/**
 * The band of a group's worst play, read off the play rather than recomputed.
 *
 * `worst` is an exposure and the bands are the assessment's own cuts of it; the
 * play that produced the figure already carries its band, so the group's plays
 * are asked rather than the number re-classified. A second thresholding here
 * would be a second opinion about severity.
 */
function bandOf(worst: number, group: PersonaGroup) {
  return group.plays.find((p) => p.exposure === worst)?.band ?? 'limited';
}
