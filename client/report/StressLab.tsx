import { useEffect, useMemo, useState, type ReactNode } from 'react';
import type { Artefact } from '$lib/policy-analysis/contracts';
import { stress } from '$lib/policy-analysis/stress';
import type { leverage } from '$lib/policy-analysis/stress';
import { byCause, reading, STANDING_COLOUR, STANDING_LABEL, type CauseGroup } from '$lib/stress-view';
import { Details, Tag, WarningText } from '../govuk';
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
 * answer. `$lib/stress-view` carries the two fixes that mattered: the cause said
 * once per group rather than once per row, and a cap before the drill takes over.
 *
 * THE LEVERS ARE CHECKBOXES, not a rail of bespoke toggles. "Suppose this turns
 * out to be false" is a yes/no question asked of fourteen assumptions at once,
 * which is what GOV.UK's checkboxes component is; a bespoke rail would be three
 * accessibility problems bought to avoid one that already works. The small
 * variant, because this is a list a reader scans rather than a question they
 * answer once.
 *
 * IT WORKS IN THE OFFLINE PACK. The simulation needs no server and no model, so
 * a pack opened on a train five years from now still runs it — which is most of
 * the argument for the feature existing at all.
 */
export function StressLab({ artefacts, levers, linkTo }: {
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
}) {
  const [failed, setFailed] = useState<string[]>([]);
  const [allLevers, setAllLevers] = useState(false);
  const result = useMemo(() => reading(stress(artefacts, failed)), [artefacts, failed]);

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
  const offered = levers.slice(0, levers.length <= ALL ? levers.length : past === -1 ? levers.length : past);

  /*
   * A TICKED LEVER IS ALWAYS ON SCREEN.
   *
   * Slicing the list plainly left a reader who ticked lever fifteen and then
   * collapsed the rail with a full results panel, no ticked box anywhere on it,
   * and no way to untick the thing driving it. Keeping the ticked ones in view
   * removes the state rather than explaining it.
   */
  const failing = new Set(failed);
  const head = offered.slice(0, allLevers ? offered.length : RAIL);
  const shown = allLevers ? head : [...head, ...offered.slice(RAIL).filter((l) => failing.has(l.artefact.id))];
  const machinery = result.lost.filter((group) => !group.primary);

  /*
   * And a selection is pruned to what is still offerable.
   *
   * `stress()` would simply not match an id that is no longer in the inventory,
   * which leaves the panel showing a results block with nothing ticked and the
   * "nothing failed yet" note hidden — the same dead end, reached by the
   * artefacts changing underneath rather than by the rail collapsing.
   */
  useEffect(() => {
    const offerable = new Set(offered.map((lever) => lever.artefact.id));
    setFailed((current) => {
      const kept = current.filter((id) => offerable.has(id));
      return kept.length === current.length ? current : kept;
    });
  }, [levers]);
  const name = (artefact: Artefact): ReactNode => (linkTo ? linkTo(artefact) : artefact.label);

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

      <div className="govuk-grid-row">
        <div className="govuk-grid-column-one-half">
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
              levers.length > offered.length
                ? `${levers.length} assumptions have something resting on them. The figure beside each is how many, and the ${offered.length} most rested on are offered here — the cut runs to the end of a tie rather than through the middle of one.`
                : `The figure beside each is how many things rest on it, and they are ordered by it. Only assumptions something actually rests on are offered — ${levers.length} of them.`
            }
            values={failed}
            onChange={setFailed}
            /*
             * ONE LINE PER LEVER, and the weight is a figure IN the label.
             *
             * A GOV.UK checkbox hint renders on its own line, so putting the
             * count there made every lever two lines and the rail the tallest
             * thing on the page — which is the defect upstream rebuilt this
             * panel to escape, reintroduced by using the component correctly.
             * The fieldset's own hint says what the figure means, once.
             */
            items={shown.map((lever) => ({
              value: lever.artefact.id,
              text: (
                <>
                  {lever.artefact.label} <span className="prt-meta">{lever.dependants}</span>
                </>
              ),
            }))}
          />
          {levers.length > RAIL ? (
            <p className="govuk-body-s">
              {/* A disclosure, so it says so. GOV.UK's own show-all carries
                  `aria-expanded` and the changing label alone does not. */}
              <button type="button" className="govuk-link prt-linkbutton" aria-expanded={allLevers}
                      onClick={() => setAllLevers(!allLevers)}>
                {allLevers
                  ? `Show the ${RAIL} most rested on`
                  : `Show the ${offered.length} most rested on`}
              </button>
            </p>
          ) : null}
        </div>

        <div className="govuk-grid-column-one-half">
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
          <p className="govuk-body-l" role="status">
            {!failed.length
              ? 'Nothing failed yet. Tick an assumption and this becomes a list of what the assessment would lose — and, separately, of what a threat would lose with it.'
              : `${result.moved
                  ? `${result.moved} of ${result.population} conclusions and results lose their footing.`
                  : `No conclusion loses its footing. All ${result.population} stand without ${failed.length === 1 ? 'that assumption' : 'those assumptions'}.`}${result.disarmed.length
                  ? ` ${result.disarmed.length} of ${result.plays} ways to beat the policy are taken off the table.`
                  : ''}`}
          </p>
          {!failed.length ? null : (
            <>
              {result.unmovable ? (
                <p className="govuk-body-s prt-meta">
                  The {result.unmovable} structural {result.unmovable === 1 ? 'check is' : 'checks are'} untouched
                  whatever is failed here: they walk the relationships the policy itself states, so
                  they are the part of the assessment that does not move when a hypothesis does.
                </p>
              ) : null}
            </>
          )}
        </div>
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
