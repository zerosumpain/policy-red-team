import { useMemo } from 'react';
import type { Artefact } from '$lib/policy-analysis/contracts';
import { assuranceReview } from '$lib/assurance-view';
import { Details, InsetText, Tag, type TagColour } from '../govuk';
import { Metrics } from './Metrics';

/**
 * WHAT SURVIVED CHALLENGE.
 *
 * Stages 16 and 17 attack the assessment's own conclusions, and on this run
 * they rewrote thirteen initial findings into nineteen assured ones. The page
 * recorded the whole of that as four sentences in a single write-up card
 * headed "Assurance"; the seven challenges, the seven responses and the review
 * summary were in the payload and on no page at all.
 *
 * `src/lib/assurance-view.ts` carries the join and the arithmetic, including
 * the one thing this section absolutely has to get right: the review summary's
 * own `acceptedChallenges` reads 5 while six of the seven responses say
 * `accepted`. Both figures are printed, verbatim, rather than one being
 * chosen — a disagreement inside the run's own reliability record is itself a
 * finding about the run, and quietly picking a winner would be the report
 * doing to itself exactly what it is here to catch other documents doing.
 *
 * THE CHALLENGE'S LABEL IS THE HEADING BECAUSE IT IS ALL THERE IS. All seven
 * `assurance_challenge` rows are stubbed — `statement` empty, `data` `{}` — so
 * nothing here may be built on a body that does not exist. The labels are full
 * sentences and they read as headings.
 */

/** The five judgements the contract allows, in words a policy reader uses. */
const JUDGEMENT_LABEL: Record<string, string> = {
  well_supported: 'Well supported',
  supported_with_limits: 'Supported, with limits',
  contested: 'Contested',
  provisional: 'Provisional',
  unknown: 'Not judged',
};

/** What the review says this assessment may be used for. */
const DECISION_USE_LABEL: Record<string, string> = {
  exploratory: 'Exploratory use only',
  decision_support: 'For decision support',
  independently_challenged: 'Independently challenged',
};

/**
 * COLOUR SAYS WHETHER ANYTHING IS STILL OUTSTANDING, AND NOTHING ELSE.
 *
 * The obvious mapping — accepted green, rejected red — is wrong twice over.
 * Accepting a challenge means the report was defective and was corrected, so
 * green would read as "all is well" on the row where the assessment was found
 * wanting; and rejecting one is not a failure. The only ordering in this
 * vocabulary is how much is left to do, so that is the only thing the colour
 * carries. Every chip prints its word regardless.
 */
const DISPOSITION_COLOUR: Record<string, TagColour> = {
  accepted: 'grey',
  rejected: 'grey',
  partly_accepted: 'yellow',
  unresolved: 'red',
  open: 'red',
};

export function Assurance({ artefacts }: { artefacts: Artefact[] }) {
  const review = useMemo(() => assuranceReview(artefacts), [artefacts]);
  if (!review || (!review.rows.length && !review.statement)) return null;

  return (
    <>
      <p className="prt-assurance__strap">
        {[
          review.decisionUse ? DECISION_USE_LABEL[review.decisionUse] ?? review.decisionUse : null,
          review.judgement ? JUDGEMENT_LABEL[review.judgement] ?? review.judgement : null,
        ].filter(Boolean).map((word) => (
          <Tag key={String(word)} colour="grey">{word}</Tag>
        ))}
      </p>

      {review.statement ? <p className="govuk-body">{review.statement}</p> : null}

      {/*
        COUNTED FROM THE RESPONSE ROWS. `contracts.ts` states the rule where it
        enforces it for addendum summaries: "a tally the model writes drifts
        from the rows it is a tally of, and the reader reads the tally".
      */}
      <Metrics
        metrics={[
          ...review.counts.map((entry) => ({ label: entry.label, value: String(entry.count) })),
          { label: 'Still open', value: String(review.open) },
          ...(review.limitations.length
            ? [{ label: 'Limitations recorded', value: String(review.limitations.length) }]
            : []),
        ]}
      />

      {review.disagreement ? <p className="govuk-body-s prt-meta">{review.disagreement}</p> : null}

      <ol className="prt-assurance">
        {review.rows.map((row) => (
          <li key={row.id} className="prt-assurance__item">
            <h3 className="govuk-heading-s prt-assurance__head">{row.label}</h3>
            <p className="prt-assurance__disposition">
              <Tag colour={DISPOSITION_COLOUR[row.disposition] ?? 'grey'}>{row.dispositionLabel}</Tag>
            </p>
            {row.changes ? <p className="govuk-body-s">{row.changes}</p> : null}
            {/*
              WHAT IS STILL NOT COVERED AFTER ACCEPTING IT. This is the sentence
              a reader making a decision needs and the one an "Accepted" chip
              on its own would hide: six of the seven were accepted, and every
              one of them still names something the assessment cannot do.
            */}
            {row.remainingLimit ? (
              <InsetText>
                <p className="prt-assurance__label">Still not covered</p>
                {/*
                  `govuk-body-s`, because the base measures `p.govuk-body-s`
                  and measures nothing inside an inset: unwrapped, this ran the
                  full 936px of the panel directly under a 605px paragraph
                  saying what changed, so the caveat was set wider than the
                  finding it qualifies.
                */}
                <p className="govuk-body-s">{row.remainingLimit}</p>
              </InsetText>
            ) : null}
            {!row.response ? (
              <p className="govuk-body-s prt-meta">No response was written to this challenge.</p>
            ) : null}
          </li>
        ))}
      </ol>

      {review.limitations.length ? (
        <Details summary="What this review could not cover">
          <ul className="govuk-list govuk-list--bullet">
            {review.limitations.map((limit) => <li key={limit}>{limit}</li>)}
          </ul>
        </Details>
      ) : null}
    </>
  );
}
