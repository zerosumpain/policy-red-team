import type { ReactNode } from 'react';
import type { Artefact } from '$lib/policy-analysis/contracts';
import type { ChangeStrip, StepState } from '$lib/change-strip';
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
 * The weakest link carries a thick black border and the words "Weakest link",
 * so it survives greyscale print and every form of colour vision. No colour from
 * the exposure ramp is used: that ramp means "how bad a way to beat it is", and
 * a second meaning on the same pinks would make both unreadable.
 *
 * HTML, NOT SVG — the entries are sentences, and SVG cannot wrap text. The row
 * wraps into a column on a phone and in the offline pack with no media query
 * keeping step with the markup, so there are no arrows: an arrow drawn for a
 * row points the wrong way in a column. The step names carry the order.
 */
export function ChangeStrips({ strips, linkTo }: {
  strips: ChangeStrip[];
  linkTo?: (artefact: Artefact, label?: string) => ReactNode;
}) {
  if (!strips.length) return null;
  const name = (artefact: Artefact) => (linkTo ? linkTo(artefact) : artefact.label);
  const withGap = strips.filter((strip) => strip.steps.some((step) => step.state === 'missing' || step.state === 'gaps')).length;

  return (
    <>
      <p className="govuk-body">
        For the {strips.length} parts of the policy that most ways to beat it rest on: how the paper
        says each is meant to work, step by step. {withGap
          ? `In ${withGap} of the ${strips.length}, at least one step names what is involved but leaves most of the detail — how much, who, by when — not specified.`
          : 'Every step is specified.'}
      </p>
      <p className="govuk-body-s prt-meta">
        A hatched band marks detail the paper does not specify. A dotted box is a step where at least
        half of what it says only might happen (&ldquo;if&rdquo;, &ldquo;may&rdquo;, &ldquo;potentially&rdquo;). The weakest
        link is the step with the largest share of both.
      </p>
      <Figure
        label="how each part is meant to work"
        flipAtNarrow={false}
        diagram={(
          <div className="prt-tocs">
            {strips.map((strip) => (
              <section key={strip.mechanism.id} className="prt-toc" aria-labelledby={`toc-${strip.mechanism.id}`}>
                <h3 className="govuk-heading-s prt-toc__head" id={`toc-${strip.mechanism.id}`}>
                  {name(strip.mechanism)}
                  <span className="prt-meta prt-toc__plays">
                    {' '}— {strip.plays} {strip.plays === 1 ? 'way' : 'ways'} to beat it
                  </span>
                </h3>
                <ol className="prt-toc__steps">
                  {strip.steps.map((step, i) => (
                    <li
                      key={step.key}
                      className={`prt-toc__step prt-toc__step--${step.state}${strip.weakest === i ? ' prt-toc__step--weakest' : ''}`}
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
                        {strip.weakest === i ? <strong>Weakest link. </strong> : null}
                        {step.state === 'missing' || step.state === 'gaps' ? '' : STATE_WORD[step.state]}
                        {step.items.length > 1 && step.state !== 'gaps' ? ` · ${step.items.length} entries` : ''}
                      </p>
                    </li>
                  ))}
                </ol>
                {strip.assumptions.length ? (
                  <div className="prt-toc__rests">
                    <p className="govuk-body-s prt-toc__restshead">
                      Rests on {strip.assumptions.length} {strip.assumptions.length === 1 ? 'assumption' : 'assumptions'}:
                    </p>
                    <ul className="prt-toc__badges">
                      {strip.assumptions.slice(0, BADGES).map((assumption) => (
                        <li key={assumption.id} className="prt-toc__badge">{assumption.label}</li>
                      ))}
                      {strip.assumptions.length > BADGES ? (
                        <li className="prt-toc__badge prt-toc__badge--more">and {strip.assumptions.length - BADGES} more</li>
                      ) : null}
                    </ul>
                  </div>
                ) : null}
              </section>
            ))}
          </div>
        )}
        table={(
          <Table
            caption="How each part of the policy is meant to work, step by step"
            captionSize="s"
            scroll
            columns={[
              { header: 'Part of the policy', width: '16%' },
              ...strips[0].steps.map((step) => ({ header: step.label })),
              { header: 'Assumptions' },
            ]}
            rows={strips.map((strip) => [
              <>{name(strip.mechanism)}<br /><span className="prt-meta">{strip.plays} ways to beat it</span></>,
              ...strip.steps.map((step, i) => (
                <>
                  <strong>
                    {strip.weakest === i ? 'Weakest link. ' : ''}{STATE_WORD[step.state]}
                    {step.state === 'gaps' ? ` in ${step.unspecified} of ${step.items.length}` : ''}.
                  </strong>
                  {step.items.length && step.state !== 'missing' ? (
                    <ul className="govuk-list govuk-body-s govuk-!-margin-bottom-0">
                      {step.items.map((item, n) => <li key={n}>{item}</li>)}
                    </ul>
                  ) : null}
                </>
              )),
              strip.assumptions.length
                ? <ul className="govuk-list govuk-body-s govuk-!-margin-bottom-0">{strip.assumptions.map((a) => <li key={a.id}>{a.label}</li>)}</ul>
                : 'None named',
            ])}
          />
        )}
      />
    </>
  );
}
