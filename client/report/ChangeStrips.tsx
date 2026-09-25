import type { ReactNode } from 'react';
import type { Artefact } from '$lib/policy-analysis/contracts';
import type { ChangeStrip, ProgrammeStrip, StepState, StripStep } from '$lib/change-strip';
import { Table } from '../govuk';
import { Figure } from './Figure';

/** How a step's state reads, in a cell or under a box. */
const STATE_WORD: Record<StepState, string> = {
  stated: 'Stated',
  hedged: 'Mostly uncertain',
  gaps: 'Details not specified',
  missing: 'Not specified',
};

/** How many assumptions a strip names before it counts the rest. */
const BADGES = 6;

/**
 * HOW EACH PART OF THE POLICY IS MEANT TO WORK, AS SMALL MULTIPLES.
 *
 * One strip per busy part of the policy: what goes in, what is done, what it
 * produces, what changes and the end result, read left to right. The strips are
 * the same shape so the eye compares them down the page — which step is missing
 * or weakest, and how many assumptions each rests on.
 *
 * WHAT IS DRAWN, AND WHY IT IS SAFE TO DRAW. Each step is a box holding the
 * chain's first entry for it (the table carries every entry). Four states, each
 * said in words and never by colour alone:
 *
 *   - stated — a plain box;
 *   - mostly uncertain — a dotted border (the report's existing mark for
 *     "provisional", from the judgement chips), and the words;
 *   - details not specified — a HATCHED band inside the box, saying how many of
 *     its entries leave a detail open ("2 of 3"). On the real run this is the
 *     common case: the input is named, its amount or owner is not;
 *   - not specified at all — the whole box hatched, drawn as a gap and not an
 *     empty box, because the absence is the finding.
 *
 * The marked step carries a thick black border and its words — "Weakest link"
 * for the assessment's own judgement, "Least specified" for the page's reading
 * (see `marks`) — so it survives greyscale print and every form of colour
 * vision. No colour from
 * the exposure ramp is used: that ramp means "how bad a way to beat it is", and
 * a second meaning on the same pinks would make both unreadable.
 *
 * HTML, NOT SVG — the entries are sentences, and SVG cannot wrap text. The row
 * wraps into a column on a phone and in the offline pack with no media query
 * keeping step with the markup, so there are no arrows: an arrow drawn for a
 * row points the wrong way in a column. The step names carry the order.
 */
/** What one strip needs, whether it is a part of the policy or the programme. */
type StripView = {
  id: string;
  head: ReactNode;
  steps: StripStep[];
  weakest: number | null;
  stated: string | null;
  statedStep: number | null;
  assumptions: Artefact[];
};

/**
 * WHICH BOX IS MARKED, AND WHAT IT IS CALLED.
 *
 * Two different claims, made by different means, and the page used to call
 * the second by the first's name:
 *
 *   - "Weakest link" is the ASSESSMENT's judgement: `weakestLink`, which stage
 *     14 writes on every chain and on the logic model since prompt 3.2. Its
 *     sentence is printed under the strip, and the box it names is marked when
 *     it names exactly one step.
 *   - "Least specified" is the PAGE's reading of the words — the step with the
 *     largest share of "not specified" and "may". It was labelled "Weakest
 *     link", on every strip, while the model's own answer was stubbed out of
 *     the report view and drawn nowhere.
 */
function marks(view: StripView, i: number): { weakest: boolean; least: boolean } {
  return { weakest: view.statedStep === i, least: view.weakest === i && view.statedStep !== i };
}

function StripFigure({ view }: { view: StripView }) {
  return (
    <section className="prt-toc" aria-labelledby={`toc-${view.id}`}>
      <h3 className="govuk-heading-s prt-toc__head" id={`toc-${view.id}`}>{view.head}</h3>
      <ol className="prt-toc__steps">
        {view.steps.map((step, i) => {
          const mark = marks(view, i);
          return (
            <li
              key={step.key}
              className={`prt-toc__step prt-toc__step--${step.state}${mark.weakest || (mark.least && !view.stated) ? ' prt-toc__step--weakest' : ''}`}
            >
              <p className="prt-toc__label">{step.label}</p>
              {step.state === 'missing' ? (
                <p className="prt-toc__gap">Not specified</p>
              ) : (
                <>
                  <p className="prt-toc__text">{step.items[0]}</p>
                  {step.unspecified ? (
                    <p className="prt-toc__gapnote">
                      Detail not specified in {step.unspecified} of {step.items.length}
                    </p>
                  ) : null}
                </>
              )}
              <p className="prt-toc__state">
                {mark.weakest ? <strong>Weakest link. </strong> : null}
                {mark.least ? <strong>Least specified. </strong> : null}
                {step.state === 'missing' || step.state === 'gaps' ? '' : STATE_WORD[step.state]}
                {step.items.length > 1 && step.state !== 'gaps' ? ` · ${step.items.length} entries` : ''}
              </p>
            </li>
          );
        })}
      </ol>
      {view.stated ? (
        <p className="govuk-body-s prt-toc__stated">
          <strong>Weakest link, as the assessment judged it:</strong> {view.stated}
        </p>
      ) : null}
      {view.assumptions.length ? (
        <div className="prt-toc__rests">
          <p className="govuk-body-s prt-toc__restshead">
            Rests on {view.assumptions.length} {view.assumptions.length === 1 ? 'assumption' : 'assumptions'}:
          </p>
          <ul className="prt-toc__badges">
            {view.assumptions.slice(0, BADGES).map((assumption) => (
              <li key={assumption.id} className="prt-toc__badge">{assumption.label}</li>
            ))}
            {view.assumptions.length > BADGES ? (
              <li className="prt-toc__badge prt-toc__badge--more">and {view.assumptions.length - BADGES} more</li>
            ) : null}
          </ul>
        </div>
      ) : null}
    </section>
  );
}

/** A strip's steps as table cells. */
function stepCells(view: StripView) {
  return view.steps.map((step, i) => {
    const mark = marks(view, i);
    return (
      <>
        <strong>
          {mark.weakest ? 'Weakest link. ' : ''}{mark.least ? 'Least specified. ' : ''}{STATE_WORD[step.state]}
          {step.state === 'gaps' ? ` in ${step.unspecified} of ${step.items.length}` : ''}.
        </strong>
        {step.items.length && step.state !== 'missing' ? (
          <ul className="govuk-list govuk-body-s govuk-!-margin-bottom-0">
            {step.items.map((item, n) => <li key={n}>{item}</li>)}
          </ul>
        ) : null}
      </>
    );
  });
}

const assumptionCell = (assumptions: Artefact[]) => (assumptions.length
  ? <ul className="govuk-list govuk-body-s govuk-!-margin-bottom-0">{assumptions.map((a) => <li key={a.id}>{a.label}</li>)}</ul>
  : 'None named');

export function ChangeStrips({ strips, programme, linkTo }: {
  strips: ChangeStrip[];
  /** The programme's one logic model, drawn first. Null on an older assessment. */
  programme?: ProgrammeStrip | null;
  linkTo?: (artefact: Artefact, label?: string) => ReactNode;
}) {
  if (!strips.length && !programme) return null;
  const name = (artefact: Artefact) => (linkTo ? linkTo(artefact) : artefact.label);
  const withGap = strips.filter((strip) => strip.steps.some((step) => step.state === 'missing' || step.state === 'gaps')).length;

  const views: StripView[] = strips.map((strip) => ({
    id: strip.mechanism.id,
    head: (
      <>
        {name(strip.mechanism)}
        <span className="prt-meta prt-toc__plays">
          {' '}— {strip.plays} {strip.plays === 1 ? 'way' : 'ways'} to beat it
        </span>
      </>
    ),
    steps: strip.steps,
    weakest: strip.weakest,
    stated: strip.stated,
    statedStep: strip.statedStep,
    assumptions: strip.assumptions,
  }));
  /*
   * THE PROGRAMME FIRST. Stage 14 writes one logic model for the policy as a
   * whole (prompt 3.2 on) and no renderer drew it; it is the one picture of how
   * the whole policy is meant to work, so it leads, in the same shape as the
   * parts below it so the eye can compare.
   */
  const lead: StripView | null = programme ? {
    id: programme.model.id,
    head: <>The policy as a whole{linkTo ? <span className="prt-meta prt-toc__plays"> — {linkTo(programme.model, 'the full logic model')}</span> : null}</>,
    steps: programme.steps,
    weakest: programme.weakest,
    stated: programme.stated,
    statedStep: programme.statedStep,
    assumptions: programme.assumptions,
  } : null;
  const all = lead ? [lead, ...views] : views;
  const columns = (all[0]?.steps ?? []).map((step) => ({ header: step.label }));

  return (
    <>
      <p className="govuk-body">
        {lead ? 'How the paper says the policy as a whole is meant to work' : ''}
        {lead && strips.length ? ', then the ' : ''}
        {!lead && strips.length ? 'For the ' : ''}
        {strips.length ? (
          <>
            {strips.length} parts of the policy that most ways to beat it rest on: how the paper
            says each is meant to work, step by step. {withGap
              ? `In ${withGap} of the ${strips.length}, at least one step names what is involved but leaves most of the detail — how much, who, by when — not specified.`
              : 'Every step is specified.'}
          </>
        ) : ', step by step.'}
      </p>
      <p className="govuk-body-s prt-meta">
        A hatched band marks detail the paper does not specify. A dotted box is a step where at least
        half of what it says only might happen (&ldquo;if&rdquo;, &ldquo;may&rdquo;, &ldquo;potentially&rdquo;).
        &ldquo;Weakest link&rdquo; is the assessment&rsquo;s own judgement of where the chain breaks, quoted
        under the strip; &ldquo;least specified&rdquo; is the step with the largest share of both marks.
      </p>
      <Figure
        label="how each part is meant to work"
        flipAtNarrow={false}
        diagram={(
          <div className="prt-tocs">
            {all.map((view) => <StripFigure key={view.id} view={view} />)}
          </div>
        )}
        table={(
          <Table
            caption="How each part of the policy is meant to work, step by step"
            captionSize="s"
            scroll
            columns={[
              { header: 'Part of the policy', width: '16%' },
              ...columns,
              { header: 'Weakest link, as judged' },
              { header: 'Assumptions' },
            ]}
            rows={[
              ...(lead ? [[
                'The policy as a whole',
                ...stepCells(lead),
                lead.stated ?? 'Not stated',
                assumptionCell(lead.assumptions),
              ]] : []),
              ...strips.map((strip, n) => [
                <>{name(strip.mechanism)}<br /><span className="prt-meta">{strip.plays} ways to beat it</span></>,
                ...stepCells(views[n]),
                strip.stated ?? 'Not stated',
                assumptionCell(strip.assumptions),
              ]),
            ]}
          />
        )}
      />
    </>
  );
}
