import { useMemo } from 'react';
import type { Artefact } from '$lib/policy-analysis/contracts';
import { evaluationPlan } from '$lib/assurance-view';
import { Details } from '../govuk';

/**
 * HOW YOU WOULD KNOW — the evaluation plan, drawn as the plan it is.
 *
 * One `evaluation_plan` artefact carries nine indicators, nine decision rules,
 * ten data gaps, fifteen questions and a counterfactual: forty-three
 * structured items, of which the report printed one paragraph. None of the
 * keys — `indicators`, `decisionRules`, `dataGaps`, `impactQuestions`,
 * `processQuestions`, `valueForMoneyQuestions`, `counterfactual` — was matched
 * by any grep in the client.
 *
 * THE THREE LISTS ARE STACKED, NOT IN THREE COLUMNS, and that is a correction
 * to the plan this was built from rather than a preference. Measured on the
 * real items: the decision rules run 145 to 275 characters and the data gaps
 * 105 to 183. Three columns of a 920px panel are about 290px each, which puts
 * a 275-character rule into eight lines of four words; nine of them in one
 * column is a 72-line stack with two more beside it. Columns are for short
 * items and these are not short. Stacked under their own headings they read as
 * what they are — three answers to three questions.
 *
 * THE FIVE OPTION APPRAISALS ARE NOT HERE. Their statements are stripped by
 * `stubForReport` (length 0 on all five), their only data key is
 * `assumptions`, and four of the five reference assumptions exclusively — so
 * "rests on N findings" is buildable for one option out of five. Two of the
 * five labels also name the same alternative in different words, which a
 * comparison table would present as two distinct options. A table that is
 * meaningful for one row of five is worse than no table.
 */
export function Options({ artefacts, onGaps }: {
  artefacts: Artefact[];
  /**
   * Opens the Provenance move's record of what the run could not do.
   *
   * Optional for the same reason `linkTo` is: the offline pack is one document
   * with no moves to switch between, so it renders the sentence and no
   * control.
   */
  onGaps?: () => void;
}) {
  const plan = useMemo(() => evaluationPlan(artefacts), [artefacts]);
  if (!plan) return null;

  return (
    <>
      {plan.statement ? <p className="govuk-body">{plan.statement}</p> : null}

      {plan.indicators.length ? (
        <>
          <h3 className="govuk-heading-s">What would be measured</h3>
          <ol className="govuk-list govuk-list--number prt-plan__list">
            {plan.indicators.map((indicator) => <li key={indicator}>{indicator}</li>)}
          </ol>
          {/*
            THE INDICATORS' OWN BASELINES AND TARGETS, COUNTED. Each indicator
            object carries `baseline` and `target` alongside its name, and on
            this run every one of the nine records "Not specified" for both.
            Nine named indicators none of which can be measured against
            anything is a stronger statement than the nine names, and it is the
            one a reader deciding whether this plan could actually be run
            needs.
          */}
          {plan.unquantified ? (
            <p className="govuk-body-s prt-meta">
              {plan.unquantified === plan.indicators.length
                ? `Not one of the ${plan.indicators.length} carries a baseline or a target: every one records “Not specified”.`
                : `${plan.unquantified} of the ${plan.indicators.length} carry neither a baseline nor a target.`}
            </p>
          ) : null}
        </>
      ) : null}

      {plan.decisionRules.length ? (
        <>
          <h3 className="govuk-heading-s">What would decide it</h3>
          <ul className="govuk-list govuk-list--bullet prt-plan__list">
            {plan.decisionRules.map((rule) => <li key={rule}>{rule}</li>)}
          </ul>
        </>
      ) : null}

      {plan.dataGaps.length ? (
        <>
          <h3 className="govuk-heading-s">What cannot be measured yet</h3>
          <ul className="govuk-list govuk-list--bullet prt-plan__list">
            {plan.dataGaps.map((gap) => <li key={gap}>{gap}</li>)}
          </ul>
          {/*
            TWO LISTS OF GAPS, AND THEY ARE NOT THE SAME LIST. These are what
            the POLICY would need before it could be evaluated; the Provenance
            move's "What it could not establish" is what the RUN could not do.
            A reader who meets one and not the other draws the wrong
            conclusion about which, so the two are named against each other
            once. A button rather than an anchor, because following it changes
            what is on the page rather than going to a new one.

            THE SENTENCE IS COMPLETE WITHOUT THE BUTTON, and that is not
            tidiness: the report's print block hides `.prt-linkbutton`
            outright, and the pack renders no control at all, so a sentence
            with the control inside its grammar loses its ending on paper.
          */}
          <p className="govuk-body-s prt-meta">
            These are gaps in what the policy would need in order to be evaluated, not gaps in
            this assessment — those are recorded under &ldquo;What it could not
            establish&rdquo;.{' '}
            {onGaps ? (
              <button type="button" className="prt-linkbutton" onClick={onGaps}>
                Open it
              </button>
            ) : null}
          </p>
        </>
      ) : null}

      {plan.questions.length ? (
        <Details summary={`The ${plan.questions.reduce((n, group) => n + group.items.length, 0)} questions it would ask`}>
          {plan.questions.map((group) => (
            <div key={group.label}>
              <p className="prt-plan__label">{group.label}</p>
              <ul className="govuk-list govuk-list--bullet">
                {group.items.map((item) => <li key={item}>{item}</li>)}
              </ul>
            </div>
          ))}
        </Details>
      ) : null}

      {plan.counterfactual ? (
        <Details summary="What it would compare against">
          <p className="govuk-body-s">{plan.counterfactual}</p>
        </Details>
      ) : null}
    </>
  );
}
