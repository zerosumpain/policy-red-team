import { useMemo, type ReactNode } from 'react';
import type { Artefact } from '$lib/policy-analysis/contracts';
import { Details } from '../govuk';
import { fieldLabel } from './ArtefactValue';
import { Matrix } from './Matrix';
import { DECISION_NOTE, modelIncidence, weaklyApplicable } from './games';

/**
 * THE GAMES THE POLICY SETS UP.
 *
 * Ten `model` artefacts — principal agent, collective action, coordination,
 * metric gaming, information asymmetry, enforcement credibility, bargaining
 * veto, repeated interaction, regulatory capture, coalition formation — have
 * been in the payload since the pipeline was written, each carrying players,
 * strategies, equilibria, rewards, sanctions, information, a decision order and
 * a judgement of how well the pattern fits. Two of the four assured
 * recommendations cite one in their refs. Nothing in `client/` rendered any of
 * it, so the report reasoned from ten objects it never showed, and the write-up
 * named one — "the principal–agent model and authority test show that delivery
 * depends on multiple actors" — with nothing to open.
 *
 * THE FIGURE IS THE PLAYERS, because that is the only part of a model that is a
 * shape. `equilibria` is three or four prose paragraphs of forty to fifty words
 * each with no label and no link to a strategy; ten cards of that is about 1,700
 * words added to the move with the least prose. `players` is an array of actor
 * ids, all fifty of which resolve on this run to thirteen distinct bodies, and
 * an incidence grid says in one glance what none of the prose does.
 *
 * THIRTEEN BODIES, AND ONLY SEVEN OF THEM RUN A PLAY. The models name
 * Employers, Strategic Authorities, Further education providers and three more
 * that no play in the assessment is aimed through — so this grid is also the
 * one place those six appear as adversaries rather than as names in a list.
 */
export function Models({ artefacts, linkTo }: {
  artefacts: Artefact[];
  linkTo?: (artefact: Artefact, label?: string) => ReactNode;
}) {
  const models = useMemo(() => artefacts.filter((a) => a.kind === 'model'), [artefacts]);
  const byId = useMemo(() => new Map(artefacts.map((a) => [a.id, a])), [artefacts]);
  const incidence = useMemo(
    () => modelIncidence(models, (id) => byId.get(id)?.label ?? null),
    [models, byId],
  );

  if (!models.length || !incidence.bodies.length) return null;

  const weak = weaklyApplicable(models);
  const top = incidence.bodies[0];
  const tail = incidence.tail(3);

  return (
    <>
      <p className="govuk-body">
        The assessment fits {models.length} game-theoretic patterns to the policy and names the
        bodies playing in each. A pattern is not a prediction — it is a claim that the incentives
        the paper creates have a shape somebody has seen before — and the assessment judges how
        well each one fits. {weak} of the {models.length} it judges weak or indeterminate, in its
        own words, printed under each pattern below.
      </p>

      <Matrix
        caption="Who plays in which game"
        corner="Body / pattern"
        rows={incidence.bodies.map((body) => ({
          id: body.key,
          label: body.label,
          node: (
            <>
              {/* The count lives on the row rather than in an eleventh column:
                  a numbered grid with a trailing total gives the total a number
                  in the key, where it is not a pattern and does not belong. */}
              {byId.get(body.ids[0]) && linkTo ? linkTo(byId.get(body.ids[0]) as Artefact, body.label) : body.label}
              <span className="prt-models__count">{body.count} of {models.length}</span>
            </>
          ),
        }))}
        cols={incidence.patterns.map((pattern) => ({
          id: pattern.id,
          label: fieldLabel(pattern.pattern),
        }))}
        numbered
        emptyText="Not a player"
        cell={(row, col) => (incidence.plays(row.id, col.id)
          ? { text: 'Yes', sentence: `${row.label} is a player in the ${col.label.toLowerCase()} model` }
          : null)}
        note={
          <>
            {top.label} is a player in{' '}
            {top.count === models.length ? `every one of the ${models.length}` : `${top.count} of the ${models.length}`}{' '}
            patterns; {tail} of the {incidence.bodies.length} bodies appear in three or fewer. Every cell is a body the model names as a player, not a body the
            assessment found a way to beat the policy for — {incidence.bodies.length} bodies appear
            here, and the ways to beat it run through twelve.
          </>
        }
      />

      {/* ONE DISCLOSURE PER PATTERN, and the applicability printed VERBATIM
          inside it. `applicability` is free prose, not an enum — the ten open
          "Moderate but indeterminate…", "Weak or indeterminate…", "The pattern
          is applicable because…" — so rendering it as a chip would mean
          classifying a sentence, which is the one thing this report does not
          do. The only count taken off it is the leading-word test above, which
          a reader can apply to the same text. */}
      <ul className="govuk-list prt-models__list">
        {models.map((model) => (
          <li key={model.id}>
            <Details summary={`${fieldLabel(String(model.data.pattern ?? ''))} — how it plays out`}>
              <p className="govuk-body-s">
                <strong>{linkTo ? linkTo(model) : model.label}</strong>
              </p>
              <Field model={model} field="decisionOrder" head="Who moves first" note={DECISION_NOTE} />
              <Field model={model} field="equilibria" head="Where it settles" />
              <Field model={model} field="sanctions" head="What can be done about it" />
              <Field model={model} field="applicability" head="How well the pattern fits" />
            </Details>
          </li>
        ))}
      </ul>
    </>
  );
}

/**
 * One of a model's fields, as a paragraph or a list depending on what it is.
 *
 * The contract writes `equilibria` as an array and the other three as strings,
 * and a component that assumed either would print `[object Object]` on a run
 * where the pipeline wrote the other. Anything that is neither is skipped
 * rather than stringified.
 */
function Field({ model, field, head, note }: { model: Artefact; field: string; head: string; note?: string }) {
  const value = model.data[field];
  if (Array.isArray(value)) {
    const items = value.filter((v): v is string => typeof v === 'string' && v.trim().length > 0);
    if (!items.length) return null;
    return (
      <>
        <h4 className="govuk-heading-s govuk-!-margin-bottom-1">{head}</h4>
        <ul className="govuk-list govuk-list--bullet govuk-body-s">
          {items.map((item) => <li key={item.slice(0, 40)}>{item}</li>)}
        </ul>
      </>
    );
  }
  if (typeof value !== 'string' || !value.trim()) return null;
  return (
    <>
      <h4 className="govuk-heading-s govuk-!-margin-bottom-1">{head}</h4>
      <p className="govuk-body-s">{value}</p>
      {note ? <p className="govuk-body-s prt-meta">{note}</p> : null}
    </>
  );
}
