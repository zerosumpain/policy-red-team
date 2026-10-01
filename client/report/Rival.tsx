import type { ReactNode } from 'react';
import type { Artefact } from '$lib/policy-analysis/contracts';
import type { RivalView } from '$lib/assurance-view';
import { InsetText, Tag, type TagColour } from '../govuk';

/**
 * ANOTHER EXPLANATION — the strongest competing account of what the report
 * concluded, and what the report did with it (phase 22).
 *
 * The independent challenge (step 17) only ever criticised; nothing built the
 * other story. `rival_explanation` does: a different mechanism or behaviour
 * that would produce the same observations, and the evidence that would tell
 * the two apart. The assured synthesis must weigh it, and "unresolved" is an
 * answer it is allowed to give — which is why the disposition here is said in
 * words about the EVIDENCE rather than the challenge: "the evidence cannot yet
 * tell them apart" is a finding a reader can act on, "Unresolved" is a status.
 *
 * Rendered on Findings and on the method page's challenge round, from the same
 * `rivalExplanations()` join, in both renderers: no router, `linkTo` optional.
 * The caller gates on the list, so a run before phase 22 draws nothing.
 */
const OUTCOME: Record<string, { words: string; colour: TagColour }> = {
  accepted: { words: 'The report took the other explanation on board', colour: 'grey' },
  partly_accepted: { words: 'The report accepted part of it', colour: 'yellow' },
  rejected: { words: 'The evidence favours the report’s account', colour: 'grey' },
  unresolved: { words: 'The evidence cannot yet tell them apart', colour: 'yellow' },
  open: { words: 'The report did not answer it', colour: 'red' },
};

export function Rival({ rivals, linkTo, headingLevel = 3 }: {
  rivals: RivalView[];
  linkTo?: (artefact: Artefact, label?: string) => ReactNode;
  /** 3 under a section heading; 4 inside a challenge row that is itself an h3. */
  headingLevel?: 3 | 4;
}) {
  if (!rivals.length) return null;
  const H = `h${headingLevel}` as 'h3' | 'h4';
  const name = (a: Artefact) => (linkTo ? linkTo(a) : a.label);

  return (
    <div className="prt-rival">
      {rivals.map((view) => {
        const outcome = OUTCOME[view.response?.disposition ?? 'open'] ?? { words: view.response?.dispositionLabel ?? '', colour: 'grey' as TagColour };
        return (
          <div key={view.id} className="prt-rival__item">
            {view.about.length ? (
              <p className="govuk-body-s prt-meta">
                Competes with {view.about.map((a, i) => (
                  <span key={a.id}>{i ? (i === view.about.length - 1 ? ' and ' : ', ') : ''}{name(a)}</span>
                ))}
              </p>
            ) : null}
            <p className="govuk-body prt-rival__text">{view.rival}</p>

            {view.discriminators.length ? (
              <>
                <H className="govuk-heading-s">What would tell them apart</H>
                <ul className="govuk-list govuk-list--bullet">
                  {view.discriminators.map((d) => <li key={d}>{d}</li>)}
                </ul>
              </>
            ) : null}

            <H className="govuk-heading-s">What the report concluded</H>
            <p className="prt-rival__outcome"><Tag colour={outcome.colour}>{outcome.words}</Tag></p>
            {view.response?.response ? <p className="govuk-body">{view.response.response}</p> : null}
            {view.response?.changes ? <p className="govuk-body-s">{view.response.changes}</p> : null}
            {view.response?.remainingLimit ? (
              <InsetText>
                <p className="prt-assurance__label">{view.response.disposition === 'unresolved' ? 'What would settle it' : 'Still not covered'}</p>
                <p className="govuk-body-s">{view.response.remainingLimit}</p>
              </InsetText>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}
