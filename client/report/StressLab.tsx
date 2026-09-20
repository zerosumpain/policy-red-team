import { useEffect, useMemo, useState, type ReactNode } from 'react';
import type { Artefact } from '$lib/policy-analysis/contracts';
import { stress } from '$lib/policy-analysis/stress';
import type { leverage } from '$lib/policy-analysis/stress';
import {
  byCause, leverPreviews, reading, standingMeter, STANDING_COLOUR, STANDING_LABEL,
  type CauseGroup, type MeterRow,
} from '$lib/stress-view';
import { Details, Table, Tag, WarningText } from '../govuk';
import { Checkboxes } from '../govuk/Form';
import type { ArtefactLink } from './Report';

/**
 * WHAT IF WE ARE WRONG — the one thing on this page you run rather than read.
 *
 * The arithmetic is `stress.ts`, copied and untouched: it walks citations the
 * assessment already made, so the same switches always give the same answer and
 * no model call is made. Everything here is the reading, and upstream measured
 * the cost of getting that wrong — 1,468px with three levers pulled, two and a
 * half screens for a panel whose point is that you pull a lever and SEE the
 * answer. `$lib/stress-view` carries the fixes that mattered: the cause said
 * once per group rather than once per row, a cap before the drill takes over,
 * and now the two things a lever would do, worked out before it is pulled.
 *
 * THE LEVERS ARE CHECKBOXES, not a rail of bespoke toggles. "Suppose this turns
 * out to be false" is a yes/no question asked of twenty-nine assumptions at
 * once, which is what GOV.UK's checkboxes component is; a bespoke rail would be
 * three accessibility problems bought to avoid one that already works. The
 * small variant, because this is a list a reader scans rather than a question
 * they answer once.
 *
 * THE LAYOUT IS NOT THE FRAMEWORK GRID, and that is a fix rather than a
 * preference. This built a `govuk-grid-row` with the rail in one half-column
 * and the answer in the other, and `_base.scss` forces every
 * `govuk-grid-column-*` inside a tab panel or the pack to `width: 100%; float:
 * none` — a rule written to stop standalone GDS pages setting prose at
 * two-thirds inside a panel, and correct for the three prose components that
 * needed it. So both halves stacked: measured on the live page at 1280px the
 * first checkbox sits at y=857 and the answer at y=1316, 459px apart in the
 * DEFAULT nine-lever state, and 1,276px apart with all twenty-nine shown. The
 * lab owns its own two-column vocabulary in `parts/_lab` instead, and the
 * answer cell is sticky so a reader who ticks the bottom lever still has the
 * result beside it.
 *
 * IT WORKS IN THE OFFLINE PACK. The simulation needs no server and no model, so
 * a pack opened on a train five years from now still runs it — which is most of
 * the argument for the feature existing at all. On paper it now carries the
 * answer too, rather than nine checkboxes nobody can tick.
 */
export function StressLab({ artefacts, levers, linkTo, failed: given, onFailedChange }: {
  artefacts: Artefact[];
  /**
   * Computed by the caller, not here.
   *
   * The report has to know whether there are any levers BEFORE it decides to
   * print a heading — a section whose body turns out to be nothing is a heading
   * over blank space — so the caller runs `leverage()` either way and this takes
   * the answer rather than running it a second time.
   */
  levers: ReturnType<typeof leverage>;
  linkTo?: ArtefactLink;
  /**
   * The scenario, where the caller is holding it.
   *
   * THE ONE STATE ON THE PAGE THAT WAS NOT IN THE URL. `move` and `selection`
   * were lifted into the address bar because following a play out of the report
   * and pressing Back reset them; the lab has exactly the same journey — every
   * artefact name in every result list is a drill link — and none of the fix. A
   * three-lever scenario picked out of twenty-nine was destroyed by following
   * any result, by a reload, and by sending the address to a colleague.
   *
   * Written to both, in the `Figure` pattern, so a controlled caller that later
   * stops passing a value — the offline pack, where the URL is never read back
   * — does not throw the reader's scenario away on the next render.
   */
  failed?: string[];
  onFailedChange?: (next: string[]) => void;
}) {
  const [own, setOwn] = useState<string[]>([]);
  const failed = given ?? own;
  const setFailed = (next: string[]) => {
    setOwn(next);
    onFailedChange?.(next);
  };

  const [allLevers, setAllLevers] = useState(false);
  const [order, setOrder] = useState<'plays' | 'rested'>('plays');
  const result = useMemo(() => reading(stress(artefacts, failed)), [artefacts, failed]);
  const meter = useMemo(() => standingMeter(stress(artefacts, failed)), [artefacts, failed]);

  /** Drawn before the list asks to be opened, and after. Upstream's figures. */
  const RAIL = 9;
  const ALL = 24;
  /*
   * THE CAP DOES NOT CUT THROUGH A TIE.
   *
   * `levers` is ordered by how much of the assessment rests on each assumption,
   * and a flat slice at 24 landed in the middle of a seven-way tie on the real
   * run: ranks 23 to 29 all have nine dependants, two were offered and five were
   * not, separated by 0.032 on a product of three model judgements. A reader
   * cannot see that boundary and there is nothing behind it — the compute is
   * under a millisecond either way, and the cap is paying for height.
   *
   * So it runs on to the end of whatever group it lands in. Here that is 24 plus
   * five; it cannot run away, because the tail of the distribution is assumptions
   * with one dependant and the list is sorted.
   */
  const edge = levers[ALL - 1]?.dependants;
  const past = levers.findIndex((lever, i) => i >= ALL && lever.dependants !== edge);
  const offered = useMemo(
    () => levers.slice(0, levers.length <= ALL ? levers.length : past === -1 ? levers.length : past),
    [levers, past],
  );

  /*
   * WHAT EACH LEVER WOULD DO, BEFORE IT IS TICKED.
   *
   * 29 simulations at 0.5ms each: 30ms, measured, with no server and no model
   * call — which is the same argument that lets the panel exist in the offline
   * pack at all. Memoised on the offered set rather than on `failed`, because
   * the preview of a lever does not depend on what else is ticked; it is always
   * "this one, on its own".
   */
  const previews = useMemo(() => leverPreviews(artefacts, offered), [artefacts, offered]);

  /*
   * ORDERED BY WHAT IT WOULD DO, NOT BY HOW MANY THINGS MENTION IT.
   *
   * The rail was ranked by `dependants`, and measured against the real
   * simulation for all 29 that number predicts neither outcome: the top-ranked
   * lever (30 dependants) takes 3 of 47 plays off the table, while the two that
   * take 9 each rank 7th and 9th — the second of them being the last one
   * visible before "Show the 29". In the other direction rank 1 moves 38 of 60
   * conclusions and rank 27 moves 23, so it is not monotonic there either.
   *
   * The CUT is still by dependants and stays that way: it is upstream's, it is
   * about which assumptions are worth offering at all, and re-cutting by
   * outcome would quietly change which 29 exist. Only the ORDER inside the
   * offered set is the reader's, and the hint says so.
   */
  const ranked = useMemo(() => {
    if (order === 'rested') return offered;
    return [...offered].sort((a, b) => {
      const x = previews.by.get(a.artefact.id);
      const y = previews.by.get(b.artefact.id);
      return (y?.disarms ?? 0) - (x?.disarms ?? 0)
        || (y?.moves ?? 0) - (x?.moves ?? 0)
        || b.dependants - a.dependants;
    });
  }, [offered, previews, order]);

  /*
   * A TICKED LEVER IS ALWAYS ON SCREEN.
   *
   * Slicing the list plainly left a reader who ticked lever fifteen and then
   * collapsed the rail with a full results panel, no ticked box anywhere on it,
   * and no way to untick the thing driving it. Keeping the ticked ones in view
   * removes the state rather than explaining it.
   */
  const failing = new Set(failed);
  const head = ranked.slice(0, allLevers ? ranked.length : RAIL);
  const shown = allLevers ? head : [...head, ...ranked.slice(RAIL).filter((l) => failing.has(l.artefact.id))];
  const machinery = result.lost.filter((group) => !group.primary);

  /*
   * And a selection is pruned to what is still offerable.
   *
   * `stress()` would simply not match an id that is no longer in the inventory,
   * which leaves the panel showing a results block with nothing ticked and the
   * "nothing failed yet" note hidden — the same dead end, reached by the
   * artefacts changing underneath rather than by the rail collapsing. It is
   * also the validator on the way IN now that the scenario arrives from the
   * URL: an id somebody pasted that is no longer a lever is dropped here.
   */
  useEffect(() => {
    const offerable = new Set(offered.map((lever) => lever.artefact.id));
    const kept = failed.filter((id) => offerable.has(id));
    if (kept.length !== failed.length) setFailed(kept);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only when the
    // inventory changes: reacting to `failed` would fight the reader's ticks.
  }, [offered]);

  const name = (artefact: Artefact): ReactNode => (linkTo ? linkTo(artefact) : artefact.label);
  const sortButton = (key: typeof order, text: string) => (
    <button type="button" className="govuk-button govuk-button--secondary"
            aria-pressed={order === key} onClick={() => setOrder(key)}>
      {text}<span className="govuk-visually-hidden"> — order the assumptions below</span>
    </button>
  );

  return (
    <>
      <div className="govuk-grid-row">
        <div className="govuk-grid-column-two-thirds">
          <p className="govuk-body">
            Suppose an assumption turns out to be false. This walks the citations the assessment
            already made — a play names the preconditions it needs, a conclusion names its
            hypotheses and its results — and reports what stops standing. It reasons from what is
            written down, so the same switches always give the same answer and nothing here costs
            a model call.
          </p>
          <WarningText>
            A conclusion that loses its footing is not thereby wrong. It is no longer supported by
            what was offered for it, which is a different and more useful thing to know.
          </WarningText>
        </div>
      </div>

      {/* `is-untouched` is read only by the print stylesheet: CSS cannot ask
          whether any descendant checkbox is checked, and the paper copy needs
          to drop the rail when nobody pulled anything and keep it when they
          did. */}
      <div className={`prt-lab${failed.length ? '' : ' is-untouched'}`}>
        <div className="prt-lab__levers">
          {/* The same vocabulary as the Diagram / Table switch, for the same
              reason: GOV.UK has no toggle, and a solid green button would make
              a sort control the loudest object in the section. */}
          <div className="govuk-button-group prt-figtoggle">
            {sortButton('plays', 'Most plays removed')}
            {sortButton('rested', 'Most rested on')}
          </div>
          <Checkboxes
            id="stress-lever"
            small
            legendSize="s"
            legend="Suppose these turn out to be false"
            /* THE TWO NUMBERS HAVE TO AGREE. The hint said 111 assumptions were
               offered while the button said "show all 24", and levers 25 to 111
               had no route to the screen at all. The cap is upstream's and is
               deliberate; claiming it was everything was not. */
            hint={
              <>
                {levers.length > offered.length
                  ? `${levers.length} assumptions have something resting on them, and the ${offered.length} most rested on are offered here — the cut runs to the end of a tie rather than through the middle of one. `
                  : `Only assumptions something actually rests on are offered — ${levers.length} of them. `}
                The two figures beside each are what it would do on its own: plays it would take off
                the table, out of {previews.population.plays}, and conclusions it would undercut,
                out of {previews.population.conclusions}.
              </>
            }
            values={failed}
            onChange={setFailed}
            /*
             * THE CONSEQUENCE IS IN THE LABEL, and it is two bars rather than
             * one grey numeral.
             *
             * NOT the item `hint` slot: a GOV.UK checkbox hint renders on its
             * own line, so putting anything there made every lever two lines
             * and the rail the tallest thing on the page — the defect upstream
             * rebuilt this panel to escape, reintroduced by using the component
             * correctly.
             *
             * The bars and the figures are `aria-hidden` with a sentence in
             * their place, because `Checkboxes` puts `item.text` inside the
             * `<label>` (Form.tsx:232) and two bare numbers would be announced
             * as part of the assumption's name.
             */
            items={shown.map((lever) => {
              const preview = previews.by.get(lever.artefact.id) ?? { disarms: 0, moves: 0 };
              return {
                value: lever.artefact.id,
                text: (
                  <span className="prt-lever">
                    <span className="prt-lever__name">{lever.artefact.label}</span>
                    <LeverFigure value={preview.disarms} max={previews.most.disarms} tone="disarm" />
                    <LeverFigure value={preview.moves} max={previews.most.moves} tone="move" />
                    <span className="govuk-visually-hidden">
                      {' — '}takes {preview.disarms} of {previews.population.plays} plays off the table;
                      undercuts {preview.moves} of {previews.population.conclusions} conclusions.
                    </span>
                  </span>
                ),
              };
            })}
          />
          {ranked.length > RAIL ? (
            <p className="govuk-body-s">
              {/* A disclosure, so it says so. GOV.UK's own show-all carries
                  `aria-expanded` and the changing label alone does not. */}
              <button type="button" className="govuk-link prt-linkbutton" aria-expanded={allLevers}
                      onClick={() => setAllLevers(!allLevers)}>
                {allLevers
                  ? `Show the ${RAIL} most consequential`
                  : `Show all ${ranked.length}`}
              </button>
            </p>
          ) : null}
        </div>

        <div className="prt-lab__answer">
          {/*
            ONE LIVE REGION, ALWAYS MOUNTED.
            It used to be inside the `failed.length` branch, so the element did
            not exist until the first lever was ticked and arrived already
            populated — and a live region inserted and filled in the same frame
            is not reliably announced by NVDA or JAWS. So the first pull, which
            is the whole point of the panel, was silent, and every one after it
            spoke. The region is here whatever the state; only its sentence
            changes. `Feedback.tsx` records the other half of this mechanic.
          */}
          <p className={`govuk-body-l${failed.length ? '' : ' prt-lab__empty'}`} role="status">
            {!failed.length
              ? 'Nothing failed yet. Tick an assumption and the meter below moves — and this becomes a list of what the assessment would lose, and, separately, of what a threat would lose with it.'
              : `${result.moved
                  ? `${result.moved} of ${result.population} conclusions and results lose their footing.`
                  : `No conclusion loses its footing. All ${result.population} stand without ${failed.length === 1 ? 'that assumption' : 'those assumptions'}.`}${result.disarmed.length
                  ? ` ${result.disarmed.length} of ${result.plays} ways to beat the policy are taken off the table.`
                  : ''}`}
          </p>
          <StandingMeter rows={meter} />
          {result.unmovable ? (
            <p className="govuk-body-s prt-meta">
              The {result.unmovable} structural {result.unmovable === 1 ? 'check is' : 'checks are'} untouched
              whatever is failed here: they walk the relationships the policy itself states, so
              they are the part of the assessment that does not move when a hypothesis does.
            </p>
          ) : null}
        </div>
      </div>

      {/*
        THE PAPER COPY, AND THE PACK'S ANSWER TO A MOUSE NOBODY HAS.
        The printed copy of this section was nine dead checkboxes and, in 24px,
        "Nothing failed yet. Tick an assumption…" — true in 100% of printed
        copies, because `failed` starts empty and nothing on paper can change
        it. The section whose entire payload is the simulation contributed
        nothing at all to the two artefacts a policy reader is most likely to be
        handed. All 29 rows cost 30ms and no server, so paper gets the answer.
      */}
      <div className="prt-lab__static">
        <Table
          caption={`Every assumption offered here, and what failing it alone would cost — ${offered.length} of ${levers.length}`}
          captionSize="s"
          columns={[
            { header: 'Suppose this is false' },
            { header: 'Things resting on it', numeric: true },
            { header: 'Plays taken off the table', numeric: true },
            { header: 'Conclusions undercut', numeric: true },
          ]}
          rows={ranked.map((lever) => {
            const preview = previews.by.get(lever.artefact.id) ?? { disarms: 0, moves: 0 };
            return [
              lever.artefact.label,
              String(lever.dependants),
              `${preview.disarms} of ${previews.population.plays}`,
              `${preview.moves} of ${previews.population.conclusions}`,
            ];
          })}
        />
      </div>

      {failed.length ? (
        /* Set apart from the controls above it. The results run full width while
           the levers sit in a half-column, so without this the first heading
           reads as another thing in the left rail. */
        <div className="govuk-!-margin-top-6">
          {result.lost.filter((group) => group.primary).map((group) => (
            <section key={group.key} aria-labelledby={`stress-${group.key}`}>
              <h3 className="govuk-heading-s" id={`stress-${group.key}`}>
                {group.label} — {group.rows.length} of {group.population}
              </h3>
              {byCause(group.rows).map((cause) => (
                <Cause key={cause.direct.join('|') || 'consequential'} group={cause}
                       fallback="What they rest on no longer stands." name={name} />
              ))}
            </section>
          ))}

          {/* THE MACHINERY, ON REQUEST. That a model and a scenario also lost
              their footing is HOW the conclusions above lost theirs — true, and
              not the answer to the question that was asked. In the flow it was
              half the height of a panel already running to three screens. */}
          {machinery.length ? (
            <Details
              summary={`What this cost the machinery beneath them — ${machinery.reduce((n, g) => n + g.rows.length, 0)}`}
            >
              {machinery.map((group) => (
                <div key={group.key}>
                  <h4 className="govuk-heading-s">
                    {group.label} — {group.rows.length} of {group.population}
                  </h4>
                  {byCause(group.rows).map((cause) => (
                    <Cause key={cause.direct.join('|') || 'consequential'} group={cause}
                           fallback="What they rest on no longer stands." name={name} />
                  ))}
                </div>
              ))}
            </Details>
          ) : null}

          {/* THE OPPOSITE DIRECTION, and it gets its own heading rather than a
              row in the list above. The same switch that costs a conclusion its
              footing costs an actor the thing they needed to be true. */}
          {result.disarmed.length ? (
            <section aria-labelledby="stress-disarmed">
              <h3 className="govuk-heading-s" id="stress-disarmed">
                Taken off the table — {result.disarmed.length} of {result.plays}
              </h3>
              <p className="govuk-body-s prt-meta">
                The good news on this page. An actor needed the failed assumption to be true to run
                these, so they are not available if it is false.
              </p>
              {byCause(result.disarmed).map((cause) => (
                <Cause key={cause.direct.join('|') || 'consequential'} group={cause}
                       fallback="A precondition they needed is gone." name={name} />
              ))}
            </section>
          ) : null}

          {/* A CONCLUSION ABOUT A THREAT THAT HAS GONE HAS NOT BEEN UNDERMINED.
              It no longer applies. These used to sit in the lost lists carrying
              a red "nothing left supporting it" three inches above the same
              event reported as good news — see `eased` in $lib/stress-view. */}
          {result.eased.length ? (
            <section aria-labelledby="stress-eased">
              <h3 className="govuk-heading-s" id="stress-eased">
                No longer applies — {result.eased.length}
              </h3>
              <p className="govuk-body-s prt-meta">
                Everything these rested on that stopped standing was a threat taken off the table.
                They have not been undermined; what they were about is gone.
              </p>
              <ul className="govuk-list govuk-list--bullet">
                {result.eased.map((row) => (
                  <li key={row.artefact.id}>
                    {name(row.artefact)} <Tag colour="green">No longer applies</Tag>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}

          {!result.lost.length ? (
            /* Gated on what FELL. Gating it on "anything moved" suppressed the
               sentence in exactly the case where it is true: a lever that only
               disarms threats moves plenty and undermines nothing. */
            <p className="govuk-body">
              That is worth knowing on its own: nothing the assessment concluded was resting on
              {failed.length === 1 ? ' it' : ' them'}.
            </p>
          ) : null}
        </div>
      ) : null}
    </>
  );
}

/**
 * ONE OF THE TWO FIGURES ON A LEVER, as a length and a number.
 *
 * TWO SCALES, NOT ONE, and each is named in the fieldset's hint. The plays
 * figure runs 0–9 and the conclusions figure 0–38 on this run; drawn on one
 * shared axis the plays bars would all be stubs and the panel would say, in
 * geometry, that taking nine ways to beat the policy off the table is a small
 * thing. Both bars are `aria-hidden`; the sentence beside them carries both
 * numbers with both denominators.
 *
 * THE GOOD DIRECTION IS GREEN, which is the one colour decision in here and it
 * is not free choice: `STANDING_COLOUR` has said `disarmed: 'green'` since the
 * module was written, because a play taken off the table is the only good news
 * the simulation produces. Colour is never the only signal — the figure is
 * printed beside every bar and the sentence names which is which.
 */
function LeverFigure({ value, max, tone }: { value: number; max: number; tone: 'disarm' | 'move' }) {
  const share = max > 0 ? Math.min(100, (value / max) * 100) : 0;
  return (
    <span className={`prt-lever__fig prt-lever__fig--${tone}`} aria-hidden="true">
      <span className="prt-lever__track">
        {/* A floor of nothing rather than a hairline: a lever that disarms zero
            plays must draw NO bar, because an empty track is the reading. */}
        {value ? <span className="prt-lever__fill" style={{ width: `${Math.max(share, 4)}%` }} /> : null}
      </span>
      <span className="prt-lever__n">{value}</span>
    </span>
  );
}

/**
 * HOW MUCH OF THE ASSESSMENT IS STILL STANDING, drawn at zero levers as well.
 *
 * The right-hand half of this panel used to be one sentence saying a feature
 * existed. At zero this reads 100% Unchanged across five populations, which
 * teaches the instrument before anything is touched; each tick moves it.
 *
 * NOT `StackedBar`. That component makes every segment a `<button>`, and its
 * segments are a selector for the report's band filter — five bars of up to
 * four segments here would be twenty focusable controls that do nothing, in the
 * middle of a panel whose real controls are the twenty-nine above them.
 *
 * PLAYS ARE SET APART AND LAST, because they move in the opposite direction:
 * `Reading` refuses to add a disarmed play to the conclusions that fell, and
 * so does this.
 */
function StandingMeter({ rows }: { rows: MeterRow[] }) {
  const present = rows.flatMap((row) => row.counts.map((count) => count.standing));
  const key = (['unsupported', 'weakened', 'disarmed', 'holds'] as const).filter((standing) => present.includes(standing));

  return (
    <div className="prt-standing">
      <h3 className="govuk-heading-s">What is still standing</h3>
      <ul className="prt-standing__rows">
        {rows.map((row) => (
          <li key={row.key} className={`prt-standing__row${row.key === 'plays' ? ' prt-standing__row--apart' : ''}`}>
            <span className="prt-standing__name">{row.label}</span>
            <span className="prt-standing__track" aria-hidden="true">
              {row.counts.map((count) => (
                <span key={count.standing}
                      className={`prt-standing__seg prt-standing__seg--${count.standing}`}
                      style={{ width: `${(count.count / row.total) * 100}%` }} />
              ))}
            </span>
            <span className="prt-standing__n" aria-hidden="true">
              {row.moved ? `${row.moved} of ${row.total}` : `${row.total}`}
            </span>
            {/* The track is a picture and the figure beside it is a fragment;
                this is the row as a sentence, which is what a screen reader
                reads instead of both. */}
            <span className="govuk-visually-hidden">
              {row.label}: {row.counts.map((count) => `${count.count} ${STANDING_LABEL[count.standing].toLowerCase()}`).join(', ')}, of {row.total}.
            </span>
          </li>
        ))}
      </ul>
      <p className="prt-bandkey prt-standing__key">
        {key.map((standing) => (
          <span key={standing} className="prt-bandkey__item">
            <span className={`prt-stack__swatch prt-standing__swatch--${standing}`} aria-hidden="true" />
            {STANDING_LABEL[standing]}
          </span>
        ))}
      </p>
    </div>
  );
}

/**
 * One reason, and everything that fell for it.
 *
 * THE CAUSE IS SAID ONCE, and only the half of it that is the same for every
 * row. A direct reason names the assumption the reader just failed and is
 * therefore shared; a consequential one names whatever each row happened to cite
 * and is different every time. Printing the second kind per row is what took
 * this panel to three screens on a real assessment — six recommendations each
 * explaining at length that the conclusions beneath them had gone.
 *
 * The count replaces it, and the names behind the count are one click away in
 * the drill, which is the page that exists for exactly this question.
 */
function Cause({ group, fallback, name }: {
  group: CauseGroup;
  /** What to say when every reason was a consequence and there is no shared sentence. */
  fallback: string;
  name: (artefact: Artefact) => ReactNode;
}) {
  /** Drawn before the count takes over. The drill holds all of them either way. */
  const SHOWN = 5;
  const row = ({ row, knockOn }: CauseGroup['rows'][number]) => (
    <li key={row.artefact.id}>
      {name(row.artefact)}{' '}
      <Tag colour={STANDING_COLOUR[row.standing]}>{STANDING_LABEL[row.standing]}</Tag>
      {knockOn ? (
        <span className="prt-meta"> · {knockOn} of what it cites no longer {knockOn === 1 ? 'stands' : 'stand'}</span>
      ) : null}
    </li>
  );

  return (
    <div className="govuk-!-margin-bottom-4">
      <p className="govuk-body-s">
        {group.direct.length
          ? group.direct.map((line, i) => <span key={i}>{i ? ', and ' : ''}{line}</span>)
          : fallback}
      </p>
      <ul className="govuk-list govuk-list--bullet">{group.rows.slice(0, SHOWN).map(row)}</ul>
      {group.rows.length > SHOWN ? (
        <Details summary={`The other ${group.rows.length - SHOWN}`}>
          <ul className="govuk-list govuk-list--bullet">{group.rows.slice(SHOWN).map(row)}</ul>
        </Details>
      ) : null}
    </div>
  );
}
