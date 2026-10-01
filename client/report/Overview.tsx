import type { ReactNode } from 'react';
import type { Artefact } from '$lib/policy-analysis/contracts';
import { BAND_LABEL, type Band } from '$lib/policy-analysis/view';
import type { Brief } from '$lib/brief';
import { BAND_ORDER, type BandTally, type Overview as OverviewView } from '$lib/overview';
import { LEGALITY_LABEL } from '$lib/verdict-view';
import type { MoveId } from '../moves';
import type { Place } from './Contents';
import { StackedBar } from './Metrics';
import { ScopeNote } from './moves/NoneUnder';
import type { Selection } from './selection';

/**
 * THE SUMMARY — the front door of every assessment (phase 20).
 *
 * The report behind it is thorough and measured in screens: 13,737px on the
 * Verdict alone, 88,000px across the five tabs of the real *Best Start* run, and
 * 162,585px on a phone. None of that is wrong, and none of it is where a reader
 * who has never seen this tool should start. This page answers the five
 * questions such a reader actually brings — how bad, where, who, what to do, and
 * how far to trust it — each in one box, and every box ends in ONE link to the
 * page that explains it.
 *
 * NOTHING HERE IS COUNTED A SECOND WAY. The figures come from `overviewOf()`,
 * which calls the same view functions the tabs render from, so a box saying "33
 * parts" opens a tab saying "33 parts". The key judgements are `briefOf()`'s,
 * the same list the Verdict leads with; the trust box reuses the brief's own
 * "what we could not check" lines rather than writing a third reading of the
 * stage warnings.
 *
 * IT RENDERS IN THE OFFLINE PACK TOO, at the head of the cascade, which is why
 * every way out of it is `Go` and never a router link: in the service `place`
 * turns a destination into the page that holds it (phase 21); in a pack there
 * is no `place` and the same element is a plain `#anchor` into the one long
 * document.
 *
 * "READ THE REPORT IN FULL" IS GONE, from both (phase 21). It was five links to
 * the five views, set at the foot of a page that now sits under a service
 * navigation naming the same five — and in the pack, directly under a contents
 * list that already names every section of them. A second index of the same
 * thing is the duplication John named.
 *
 * GOV.UK HAS NO CARD COMPONENT, so a box here is composed from framework parts:
 * the metric card's top rule, a `govuk-heading-m`, one sentence of
 * `govuk-body`, the figure, and a `govuk-link` as the last line. The whole box is
 * deliberately NOT one link — a screen reader should hear a heading, what it
 * means, and then where to go, not one forty-word link name.
 */
export type GoTo = (move: MoveId, anchor: string) => Place;

export function Overview({
  view, brief, stages, selection, onGo, onSelectBand, linkTo, byId,
}: {
  view: OverviewView;
  brief: Brief;
  stages: { status: string }[];
  selection: Selection;
  /** Absent in the offline pack: every `Go` is then a plain anchor. */
  onGo?: GoTo;
  /** A band pressed on the exposure bar narrows the whole report, as it does in Threats. */
  onSelectBand?: (band: Band) => void;
  linkTo?: (artefact: Artefact, label?: string) => ReactNode;
  byId: Map<string, Artefact>;
}) {
  const { plays, parts, bodies, recs, findings } = view;
  const name = (id: string, label: string) => {
    const artefact = byId.get(id);
    return artefact && linkTo ? linkTo(artefact, label) : label;
  };
  const severe = plays.bands.severe;
  const finished = stages.filter((stage) => stage.status === 'completed').length;

  return (
    <section aria-labelledby="overview" className="prt-overview">
      <h2 className="govuk-heading-l" id="overview">The report at a glance</h2>
      <p className="govuk-body prt-overview__intro">
        Start here. Each box below sums up one part of the report in a sentence or two. Follow the
        link at the foot of a box to see everything behind it.
      </p>
      <ScopeNote selection={selection} subject="the whole assessment" />

      {/* ── The four figures ──────────────────────────────────────────── */}
      <ul className="prt-kpis" aria-label="The assessment in four figures">
        {plays.total ? (
          <Kpi tone={severe ? 'severe' : undefined} value={plays.total} label={plays.total === 1 ? 'way to beat it' : 'ways to beat it'}
               note={severe ? `${severe} of them severe` : 'none of them severe'} to="threats" anchor="weights" onGo={onGo} />
        ) : null}
        {parts.underPressure ? (
          <Kpi value={parts.underPressure} of={parts.total} label="parts of the policy exposed"
               note="a way to beat it rests on each" to="causality" anchor="mechanisms" onGo={onGo} />
        ) : null}
        {bodies.active ? (
          <Kpi value={bodies.active} label={bodies.active === 1 ? 'body could do it' : 'bodies could do it'}
               note={`of ${bodies.named.toLocaleString()} the paper names`} to="actors" anchor="interplay" onGo={onGo} />
        ) : null}
        {recs.items.length ? (
          <Kpi value={recs.items.length} label={recs.items.length === 1 ? 'recommendation' : 'recommendations'}
               note={plays.total ? `answering ${recs.answered} of the ${plays.total} ways to beat it` : undefined}
               to="verdict" anchor="suggests" onGo={onGo} />
        ) : null}
      </ul>

      {/* ── What matters most ─────────────────────────────────────────── */}
      {brief.items.length ? (
        <section aria-labelledby="overview-matters" className="prt-matters">
          <h3 className="govuk-heading-m" id="overview-matters">
            {brief.source === 'judgements' ? 'What matters most' : 'The main findings'}
          </h3>
          <ol className={`prt-matters__list prt-matters__list--${Math.min(brief.items.length, 3)}`}>
            {brief.items.map((item) => (
              <li key={item.id} className={`prt-matter${item.play ? ` prt-matter--${item.play.band}` : ''}`}>
                <p className="prt-matter__rank" aria-hidden="true">{item.rank}</p>
                <h4 className="govuk-heading-s prt-matter__title">
                  <span className="govuk-visually-hidden">{item.rank}. </span>
                  {linkTo ? linkTo(item.artefact, item.title) : item.title}
                </h4>
                <p className="govuk-body prt-matter__statement">{item.statement}</p>
                {item.play ? (
                  <p className="govuk-body-s prt-matter__play">
                    <span className={`prt-band prt-band--${item.play.band}`}>{BAND_LABEL[item.play.band]}</span>{' '}
                    {linkTo ? linkTo(item.play.artefact) : item.play.artefact.label}
                  </p>
                ) : null}
                {item.owner ? (
                  <p className="govuk-body-s prt-matter__owner"><strong>Who should act:</strong> {item.owner}</p>
                ) : null}
              </li>
            ))}
          </ol>
          <p className="govuk-body prt-matters__more">
            <Go to="verdict" anchor="main-findings" onGo={onGo}>
              Read {brief.items.length === 1 ? 'it' : `all ${brief.items.length}`} in full, with the paper&rsquo;s own words
            </Go>
          </p>
        </section>
      ) : null}

      {/* ── The six boxes ─────────────────────────────────────────────── */}
      <div className="prt-cards">
        {plays.total ? (
          <Card id="overview-exposure" title="How exposed the policy is"
                more={<Go to="threats" anchor="bands" onGo={onGo}>See how the exposure is spread</Go>}>
            <p className="govuk-body">
              {severe
                ? <><strong>{severe} of the {plays.total}</strong> ways to beat it are severe: strong incentive, low effort, real damage, and hard to see.</>
                : <>None of the {plays.total} ways to beat it is severe.</>}
              {plays.compliant ? (
                <> <strong>{plays.compliant}</strong> are inside the rules — nobody is forbidden to do them — so enforcement alone will not stop them.</>
              ) : null}
            </p>
            <StackedBar
              label="Ways to beat it, by how exposed the policy is. Press a band to see only those."
              total={plays.total}
              segments={BAND_ORDER.map((band) => ({
                id: band,
                label: BAND_LABEL[band],
                count: plays.bands[band],
                tone: band,
                selected: selection?.kind === 'band' && selection.id === band,
                onSelect: onSelectBand ? () => onSelectBand(band) : undefined,
              }))}
            />
            {plays.commonest ? (
              <p className="govuk-body-s prt-meta">
                The commonest kind: &ldquo;{plays.commonest.label.toLowerCase()}&rdquo;, {plays.commonest.count} of {plays.total}.
              </p>
            ) : null}
          </Card>
        ) : null}

        {plays.top.length ? (
          <Card id="overview-worst" title="The worst ways to beat it"
                more={<Go to="threats" anchor="weights" onGo={onGo}>See all {plays.total} ways to beat it</Go>}>
            <ol className="prt-glance">
              {plays.top.map((play) => (
                <li key={play.id} className="prt-glance__row">
                  <span className={`prt-band prt-band--${play.band} prt-glance__tag`}>{BAND_LABEL[play.band]}</span>
                  <span className="prt-glance__text">
                    <span className="prt-glance__name">{name(play.id, play.label)}</span>
                    <span className="prt-glance__meta">
                      {[play.who, play.pattern, LEGALITY_LABEL[play.legality]].filter(Boolean).join(' · ')}
                    </span>
                  </span>
                </li>
              ))}
            </ol>
          </Card>
        ) : null}

        {parts.top.length ? (
          <Card id="overview-parts" title="Where the pressure lands"
                more={<Go to="causality" anchor="mechanisms" onGo={onGo}>See all {parts.underPressure} parts under pressure</Go>}>
            <p className="govuk-body">
              Most ways to beat it rest on a few parts of the policy. Strengthening one of these does
              more than answering any single way to beat it.
            </p>
            <MiniBars rows={parts.top.map((part) => ({ key: part.id, label: name(part.id, part.label), count: part.plays, bands: part.bands }))}
                      unit="ways to beat it" />
          </Card>
        ) : null}

        {bodies.top.length ? (
          <Card id="overview-bodies" title="Who could do it"
                more={<Go to="actors" anchor="interplay" onGo={onGo}>See all {bodies.active} {bodies.active === 1 ? 'body' : 'bodies'} and what they could reach</Go>}>
            <p className="govuk-body">
              {bodies.active} of the {bodies.named.toLocaleString()} bodies the paper names could use at least one
              way to beat it. Each is a hypothesis about an organisation&rsquo;s incentives — never a finding
              about a named person.
            </p>
            <ol className="prt-glance">
              {bodies.top.map((body) => (
                <li key={body.label} className="prt-glance__row">
                  <span className={`prt-band prt-band--${body.worstBand} prt-glance__tag`}>
                    <span className="govuk-visually-hidden">Worst: </span>{BAND_LABEL[body.worstBand]}
                  </span>
                  <span className="prt-glance__text">
                    <span className="prt-glance__name">{body.label}</span>
                    <span className="prt-glance__meta">
                      {body.plays} {body.plays === 1 ? 'way' : 'ways'} to beat it
                    </span>
                  </span>
                </li>
              ))}
            </ol>
          </Card>
        ) : null}

        {recs.items.length ? (
          <Card id="overview-recs" title="What it recommends"
                more={<Go to="verdict" anchor="suggests" onGo={onGo}>Read the recommendations in full</Go>}>
            {plays.total ? (
              <p className="govuk-body">
                Together they answer <strong>{recs.answered} of the {plays.total}</strong> ways to beat it.
                {recs.unanswered ? (
                  <> {recs.unanswered} are answered by none{recs.severeUnanswered ? <>, <strong>{recs.severeUnanswered} of them severe</strong></> : null}.</>
                ) : null}
              </p>
            ) : null}
            <ol className="prt-glance prt-glance--numbered">
              {recs.items.map((rec, index) => (
                <li key={rec.id} className="prt-glance__row">
                  <span className="prt-glance__num" aria-hidden="true">{index + 1}</span>
                  <span className="prt-glance__text">
                    <span className="prt-glance__name">{name(rec.id, rec.label)}</span>
                    <span className="prt-glance__meta">
                      {plays.total ? `Answers ${rec.answers} ${rec.answers === 1 ? 'way' : 'ways'} to beat it · ` : ''}{rec.judgement}
                    </span>
                  </span>
                </li>
              ))}
            </ol>
          </Card>
        ) : null}

        <Card id="overview-trust" title="How far to trust this"
              more={<Go to="provenance" anchor="discarded" onGo={onGo}>See how it was made, and what it threw away</Go>}>
          <p className="govuk-body">
            A red-team read finds weak points. It does not predict that anyone will use them, and a
            clean report would not mean the policy is safe.
          </p>
          <ul className="govuk-list prt-trust">
            <li>
              <strong>{finished} of {stages.length}</strong> steps of the analysis finished.
            </li>
            {findings.total ? (
              <li>
                Of the <strong>{findings.total} findings</strong>, the final review judged{' '}
                {findings.confidence.map((row) => `${row.count} ${row.label.toLowerCase()}`).join(', ')}.
              </li>
            ) : null}
            {brief.limits.map((limit) => <li key={limit}>{limit}</li>)}
          </ul>
        </Card>
      </div>

    </section>
  );
}

/**
 * A way out of the summary. A link in both renderers, so it is always keyboard
 * reachable and always announced as one; in the service `onGo` says which page
 * it opens and routes a plain click there rather than reloading the app.
 */
function Go({ to, anchor, onGo, className, children }: {
  to: MoveId;
  anchor: string;
  onGo?: GoTo;
  className?: string;
  children: ReactNode;
}) {
  const place = onGo ? onGo(to, anchor) : { href: `#${anchor}` };
  return (
    <a className={`govuk-link${className ? ` ${className}` : ''}`} {...place}>
      {children}
    </a>
  );
}

function Kpi({ value, of, label, note, tone, to, anchor, onGo }: {
  value: number;
  of?: number;
  label: string;
  note?: string;
  tone?: Band;
  to: MoveId;
  anchor: string;
  onGo?: GoTo;
}) {
  return (
    <li className={`prt-kpi${tone ? ` prt-kpi--${tone}` : ''}`}>
      <Go to={to} anchor={anchor} onGo={onGo} className="prt-kpi__link">
        <span className="prt-kpi__value">
          {value.toLocaleString()}
          {of ? <span className="prt-kpi__of"> of {of.toLocaleString()}</span> : null}
        </span>
        <span className="prt-kpi__label">{label}</span>
      </Go>
      {note ? <span className="prt-kpi__note">{note}</span> : null}
    </li>
  );
}

function Card({ id, title, more, children }: { id: string; title: string; more: ReactNode; children: ReactNode }) {
  return (
    <section className="prt-card" aria-labelledby={id}>
      <h3 className="govuk-heading-m prt-card__title" id={id}>{title}</h3>
      <div className="prt-card__body">{children}</div>
      <p className="govuk-body prt-card__more">{more}</p>
    </section>
  );
}

/**
 * A handful of bars on one scale, each split by band. The count is printed
 * beside every bar, and the band split is spelled out for a screen reader, so
 * the colour is never the only way to read it.
 */
function MiniBars({ rows, unit }: { rows: { key: string; label: ReactNode; count: number; bands: BandTally }[]; unit: string }) {
  const max = Math.max(1, ...rows.map((row) => row.count));
  return (
    <ol className="prt-minibars">
      {rows.map((row) => (
        <li key={row.key} className="prt-minibars__row">
          <span className="prt-minibars__label">{row.label}</span>
          <span className="prt-minibars__track" aria-hidden="true">
            <span className="prt-minibars__fill" style={{ width: `${(row.count / max) * 100}%` }}>
              {BAND_ORDER.filter((band) => row.bands[band]).map((band) => (
                <span key={band} className={`prt-minibars__seg prt-band--${band}`} style={{ flexGrow: row.bands[band] }} />
              ))}
            </span>
          </span>
          <span className="prt-minibars__n">
            {row.count}
            <span className="govuk-visually-hidden">
              {' '}{unit}: {BAND_ORDER.filter((band) => row.bands[band]).map((band) => `${row.bands[band]} ${BAND_LABEL[band].toLowerCase()}`).join(', ')}
            </span>
          </span>
        </li>
      ))}
    </ol>
  );
}
