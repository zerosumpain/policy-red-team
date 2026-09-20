import type { ReactNode } from 'react';
import type { Artefact } from '$lib/policy-analysis/contracts';
import type { MechanismChainView } from '$lib/mechanisms';
import { Details } from '../govuk';

/**
 * WHAT HAS TO HOLD FOR ONE PIECE OF MACHINERY TO WORK — the move called
 * Causality, finally containing a causal chain.
 *
 * The run wrote 150 `causal_chain` artefacts. `detail-views.ts` stubs the kind
 * out of the report projection with the comment "no code on the report path
 * reads the kind at all", which was true and is the finding: grepped across the
 * whole client tree, nothing read it. What the stub keeps is exactly what this
 * needs — `refs` and `data.assumptions` — so the skeleton of all 150 chains was
 * already in the 3MB the browser holds and costs nothing more to draw.
 *
 * IT IS NOT A FOUR-STAGE FLOW, because the data is not four stages. Only 120 of
 * the 150 chains name a passage and only 65 name a finding, so "passage →
 * mechanism → assumptions → conclusion" would have a hole in it on more than
 * half of them. Each end is drawn only where the chain actually has one, and the
 * coverage is stated rather than papered over.
 *
 * ONE CHAIN, NOT ALL OF THEM. Chains per mechanism run 1 to 6 with a median of
 * 1, so a rail per chain is usually a rail of one repeated. The chain citing the
 * most assumptions is drawn and the rest are listed BY CITATION COUNT — two of
 * "Provider specialisation and collaboration"'s six chains share a label, so a
 * disclosure that named them would offer the reader the same words twice.
 *
 * HTML AND CSS, NOT SVG, for the reason `EgoMap` sets out at length one file
 * over: an assumption's label is a sentence, SVG cannot wrap text, and every box
 * here wants to be a link into the artefact's own page.
 */

/**
 * How many assumptions are drawn before the rest go behind a disclosure.
 *
 * The busiest mechanism on the real run rests on 30 and the median across all
 * 151 is 6, so this is the median: the common case draws in full and the
 * outlier — which is the one worth reading about — says how far it overruns.
 */
const DRAWN = 6;

export function MechanismChain({ mechanism, chains, byId, linkTo }: {
  mechanism: Artefact;
  /** Already ordered by how much each chain assumes; see `chainsFor`. */
  chains: MechanismChainView[];
  byId: Map<string, Artefact>;
  /** Optional, exactly as on `Report`: a report rendered without links still renders. */
  linkTo?: (artefact: Artefact, label?: string) => ReactNode;
}) {
  if (!chains.length) return null;
  const [drawn, ...rest] = chains;

  const name = (id: string): ReactNode => {
    const artefact = byId.get(id);
    if (!artefact) return id;
    return linkTo ? linkTo(artefact) : artefact.label;
  };

  const shown = drawn.assumptions.slice(0, DRAWN);
  const hidden = drawn.assumptions.slice(DRAWN);
  const withPassage = chains.filter((chain) => chain.passages.length).length;
  const withProduct = chains.filter((chain) => chain.produces.length).length;

  return (
    <div className="prt-chain">
      <h4 className="govuk-heading-s govuk-!-margin-bottom-1">What the paper has to assume for it to work</h4>
      <p className="govuk-body-s prt-meta">
        {drawn.artefact.label}
        {chains.length > 1 ? ` — the one of its ${chains.length} chains that assumes the most` : ''}.
      </p>

      {/*
        A WRAPPING FLEX ROW RATHER THAN A GRID WITH A BREAKPOINT. The rail has
        two or three bands depending on what this chain actually names, so a
        fixed three-column template would leave a hole; and wrapping is what
        turns it into a stacked list on a phone, in the offline pack and in a
        print column, with no media query to keep in step with the markup.
      */}
      <div className="prt-chain__rail">
        <section className="prt-chain__band" aria-label="What has to hold">
          <h5 className="prt-chain__head">
            What has to hold — {drawn.assumptions.length}
          </h5>
          {drawn.assumptions.length ? (
            <>
              <ul className="prt-chain__list">
                {shown.map((id) => <li key={id} className="prt-chain__box">{name(id)}</li>)}
              </ul>
              {hidden.length ? (
                <Details summary={`${hidden.length} more this chain assumes`}>
                  <ul className="govuk-list govuk-list--bullet govuk-!-margin-bottom-0">
                    {hidden.map((id) => <li key={id}>{name(id)}</li>)}
                  </ul>
                </Details>
              ) : null}
            </>
          ) : (
            <p className="govuk-body-s prt-meta">This chain names no assumption.</p>
          )}
        </section>

        {/* The words carry the direction, not an arrow: the rail is a row on a
            page and a column on a phone, and an arrow drawn for one of those
            points the wrong way in the other. */}
        <p className="prt-chain__rel">has to hold for</p>

        <section className="prt-chain__band prt-chain__band--subject" aria-label="The mechanism">
          <h5 className="prt-chain__head">The mechanism</h5>
          <div className="prt-chain__box prt-chain__box--subject">
            {linkTo ? linkTo(mechanism) : mechanism.label}
          </div>
        </section>

        {drawn.produces.length ? (
          <>
            <p className="prt-chain__rel">which produces</p>
            <section className="prt-chain__band" aria-label="What it is claimed to produce">
              <h5 className="prt-chain__head">
                What it is claimed to produce — {drawn.produces.length}
              </h5>
              <ul className="prt-chain__list">
                {drawn.produces.map((id) => <li key={id} className="prt-chain__box">{name(id)}</li>)}
              </ul>
            </section>
          </>
        ) : null}
      </div>

      {/*
        THE COVERAGE, STATED. A rail drawn from one chain invites the reader to
        take it for the whole causal reading of this mechanism; on more than half
        the chains in the run one of the two ends is simply absent, and saying so
        is cheaper and more honest than drawing an empty box.
      */}
      <p className="govuk-body-s prt-meta">
        {chains.length === 1
          ? `One chain in the run names this mechanism: it ${drawn.passages.length ? 'names a passage' : 'names no passage'} and ${drawn.produces.length ? 'names a claim or conclusion' : 'names neither a claim nor a conclusion'}.`
          : `${chains.length} chains name this mechanism. ${withPassage} of them name a passage and ${withProduct} name a claim or conclusion.`}
      </p>

      {rest.length ? (
        <Details summary={`The other ${rest.length} ${rest.length === 1 ? 'chain' : 'chains'} through this mechanism`}>
          {/* BY CITATION COUNT, NOT BY NAME. Two of the six chains through
              "Provider specialisation and collaboration" carry the identical
              label "Theory of change for provider specialisation and
              collaboration", so a list of names offers the same row twice. */}
          <ul className="govuk-list govuk-list--spaced govuk-!-margin-bottom-0">
            {rest.map((chain) => (
              <li key={chain.artefact.id}>
                {chain.artefact.label}
                <span className="prt-meta">
                  {' — '}{chain.assumptions.length}{' '}
                  {chain.assumptions.length === 1 ? 'assumption' : 'assumptions'},{' '}
                  {chain.produces.length}{' '}
                  {chain.produces.length === 1 ? 'claim or conclusion' : 'claims or conclusions'}
                </span>
              </li>
            ))}
          </ul>
        </Details>
      ) : null}
    </div>
  );
}
