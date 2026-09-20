import type { Artefact } from '$lib/policy-analysis/contracts';
import type { leverage } from '$lib/policy-analysis/stress';
import { fragileAssumptions } from '$lib/policy-analysis/view';
import { Bar } from './Metrics';

/**
 * WHAT THE CONCLUSION RESTS ON — two rankings of the same 444 assumptions that
 * do not overlap at all.
 *
 * `fragileAssumptions()` has existed in the core since the beginning and had no
 * caller on the page. It is not unused elsewhere: `report-doc.ts` uses it to
 * print "The assumptions most likely to change the conclusion" into the .docx a
 * reader downloads from this very report — so the Word file has a section the
 * web page does not, about the thing the web page spends a whole panel on.
 *
 * THE TWO RANKINGS DISAGREE COMPLETELY, and that is the finding rather than a
 * tidy-up. Measured on this run: zero of the top ten by the assessment's own
 * priority appear anywhere in the twenty-nine the stress lab offers as levers.
 * The nine levers on screen carry priorities 0.336–0.729; the assessment's own
 * most-consequential assumptions carry 0.95, 0.95, 0.94 — and one or two
 * dependants each. The report's importance judgement and the report's
 * structural load point at two disjoint sets, and the page showed one of them
 * with no indication the other existed.
 *
 * NOT THE THREE-BAR CHART THE FINDING ASKED FOR. Importance runs 0.60–0.95,
 * uncertainty 0.30–1.00 and consequence 0.50–0.95 over 444 rows, with means of
 * 0.846, 0.827 and 0.821 — thirty bars all sitting at about 85% of their track.
 * A chart whose every mark is the same length is a decoration. Each column gets
 * one bar, for the quantity it is ranked by, and prints the other quantity as a
 * figure so the disagreement is visible row by row.
 *
 * NO ROUTER AND NO LINK OUT. This renders in the offline pack, where there is
 * no router at all; `onStress` is a callback the report fills in with its own
 * move-and-scroll, and where the caller does not offer one the section is a
 * reading rather than a control.
 */
export function Fragile({ artefacts, levers, onStress }: {
  artefacts: Artefact[];
  /** Already computed by the caller for the stress lab; not run a second time. */
  levers: ReturnType<typeof leverage>;
  /** Open the stress lab, where the left-hand column is the rail. */
  onStress?: () => void;
}) {
  const SHOWN = 8;
  if (!levers.length) return null;

  const num = (v: unknown) => (Number.isFinite(Number(v)) ? Number(v) : 0);
  const priorityOf = (a: Artefact) =>
    num(a.data.priority) || num(a.data.importance) * num(a.data.uncertainty) * num(a.data.consequence);

  const rested = levers.slice(0, SHOWN);
  const dependants = new Map(levers.map((lever) => [lever.artefact.id, lever.dependants]));
  const judged = fragileAssumptions(artefacts).slice(0, SHOWN);
  if (!judged.length) return null;

  const restedIds = new Set(rested.map((lever) => lever.artefact.id));
  const shared = judged.filter((a) => restedIds.has(a.id)).length;

  /*
   * THE SENTENCE IS COMPUTED, so it disappears on a run where the two rankings
   * agree. A hard-coded "none of them" would be a claim about one assessment
   * printed on every assessment.
   */
  const range = (values: number[], digits = 0) => {
    const lo = Math.min(...values).toFixed(digits);
    const hi = Math.max(...values).toFixed(digits);
    return lo === hi ? lo : `${lo} and ${hi}`;
  };
  const judgedLoad = range(judged.map((a) => dependants.get(a.id) ?? 0));
  const restedLoad = range(rested.map((lever) => lever.dependants));
  /*
   * THE PRIORITY RANGES ARE THE SHARPEST FORM OF THE DISAGREEMENT, and they are
   * also why the right-hand column's bars are all nearly full: importance runs
   * 0.60–0.95, uncertainty 0.30–1.00 and consequence 0.50–0.95 over all 444
   * rows, so the top of that ranking is a plateau rather than a peak. Saying
   * the numbers is better than drawing eight bars of the same length and
   * hoping the reader notices they are the same length.
   */
  const judgedPriority = range(judged.map(priorityOf), 2);
  const restedPriority = range(rested.map((lever) => lever.priority), 2);

  return (
    <>
      <p className="govuk-body">
        There are two ways to ask which assumption matters most, and this assessment answers them
        differently. One counts what is citing it. The other is the run's own judgement of
        importance, uncertainty and consequence. The stress test offers levers by the first.
      </p>

      <div className="prt-rests">
        <section className="prt-rests__col" aria-labelledby="rests-load">
          <h3 className="govuk-heading-s" id="rests-load">Most of the assessment rests on these</h3>
          <p className="govuk-body-s prt-meta">
            The bar is how many things cite it. The figure after it is the run's own priority.
          </p>
          <ul className="prt-rests__list">
            {rested.map((lever) => (
              <li key={lever.artefact.id} className="prt-rests__row">
                <span className="prt-rests__name">
                  {lever.artefact.label}
                  <Origin artefact={lever.artefact} />
                </span>
                <Bar value={lever.dependants} max={levers[0].dependants} digits={0}
                     scale={`things resting on it, 0 to ${levers[0].dependants} across this assessment`} />
                <span className="prt-rests__other">priority {lever.priority.toFixed(2)}</span>
              </li>
            ))}
          </ul>
          {onStress ? (
            <p className="govuk-body-s">
              {/* A button rather than an anchor: following it changes which move
                  is open rather than going to a new page, and a bare `href`
                  would be a full reload of a single-page app. */}
              <button type="button" className="prt-linkbutton" onClick={onStress}>
                Fail one of these in the stress test
              </button>
            </p>
          ) : null}
        </section>

        <section className="prt-rests__col" aria-labelledby="rests-judged">
          <h3 className="govuk-heading-s" id="rests-judged">The assessment judged these most consequential</h3>
          <p className="govuk-body-s prt-meta">
            The bar is the run's own priority — importance × uncertainty × consequence. The figure
            after it is how many things cite it.
          </p>
          <ul className="prt-rests__list">
            {judged.map((assumption) => (
              <li key={assumption.id} className="prt-rests__row">
                <span className="prt-rests__name">
                  {assumption.label}
                  <Origin artefact={assumption} />
                </span>
                <Bar value={priorityOf(assumption)} max={1}
                     scale="the run's own priority, 0 to 1" />
                <span className="prt-rests__other">
                  {dependants.get(assumption.id) ?? 0} resting on it
                </span>
              </li>
            ))}
          </ul>
        </section>
      </div>

      <p className="govuk-body">
        {shared
          ? `${shared} of the ${SHOWN} the assessment judged most consequential ${shared === 1 ? 'is' : 'are'} also among the ${SHOWN} its own citations rest on most.`
          : `None of the ${SHOWN} the assessment judged most consequential is among the ${SHOWN} its own citations rest on most.`}
        {' '}The right-hand column carries between {judgedLoad} dependants and priorities between{' '}
        {judgedPriority}; the left-hand column carries between {restedLoad} dependants and
        priorities between {restedPriority}. The stress test can only offer a lever that something
        rests on, so the right-hand column is mostly not on it.
      </p>
    </>
  );
}

/**
 * A behavioural hypothesis, named as one.
 *
 * The report's standing caveat is about exactly this distinction — a structural
 * inference is read off the paper's own wiring, a behavioural hypothesis is a
 * claim about what people would do — and 24 of the 444 assumptions are the
 * second kind, two of them among the levers. A word, not a colour: on this run
 * neither column contains one, and a treatment that only ever appears on other
 * assessments has to be legible the first time it does.
 */
function Origin({ artefact }: { artefact: Artefact }) {
  if (artefact.origin !== 'behavioural_hypothesis') return null;
  return <span className="prt-meta"> · behavioural hypothesis</span>;
}
