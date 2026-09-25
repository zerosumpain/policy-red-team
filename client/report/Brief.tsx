import type { ReactNode } from 'react';
import type { Artefact } from '$lib/policy-analysis/contracts';
import { BAND_LABEL } from '$lib/policy-analysis/view';
import type { Brief as BriefView, BriefItem } from '$lib/brief';
import { Button } from '../govuk';

/**
 * THE ONE-PAGE BRIEF — the first thing on the report.
 *
 * What a busy official reads in two minutes: the headline, at most five key
 * judgements, and what we could not check. `briefOf` in `$lib/brief` decides
 * what is in it; this draws it, and `briefMarkdown` writes the same thing to
 * Word, so the page, the pack and the document cannot say different things.
 *
 * IT RENDERS IN THE OFFLINE PACK TOO, which has no router and no server. So a
 * name is a link only through the `linkTo` render function the caller passes,
 * and the Word download is left out offline — it points at a server a
 * `file://` page does not have. Printing works in both, because it is the
 * browser's.
 *
 * PRINTING THE BRIEF PRINTS THE BRIEF. Ctrl-P still prints the whole report,
 * every move, as it always has. "Print the brief" marks the document with
 * `prt-print-brief` for the length of one print, and `parts/_brief.scss` hides
 * everything else under that class: the tabs, the other four moves, the rest
 * of this one, the page's chrome. 1–2 sides of A4.
 */
export function Brief({ brief, linkTo, downloadHref }: {
  brief: BriefView;
  linkTo?: (artefact: Artefact, label?: string) => ReactNode;
  /** The brief-only Word export. Absent offline, where there is no server to ask. */
  downloadHref?: string;
}) {
  const name = (artefact: Artefact | null, label: string) => (artefact && linkTo ? linkTo(artefact, label) : label);

  const print = () => {
    const root = document.documentElement;
    root.classList.add('prt-print-brief');
    const done = () => {
      root.classList.remove('prt-print-brief');
      window.removeEventListener('afterprint', done);
    };
    window.addEventListener('afterprint', done);
    window.print();
  };

  const judgements = brief.source === 'judgements';

  return (
    <div className="prt-brief" id="brief">
      {brief.standfirst ? <p className="govuk-body-l prt-brief__standfirst">{brief.standfirst}</p> : null}

      <div className="govuk-button-group prt-brief__tools">
        <Button variant="secondary" onClick={print}>Print the brief</Button>
        {downloadHref ? (
          <a className="govuk-link" href={downloadHref} download>Download the brief (Word)</a>
        ) : null}
      </div>

      {brief.items.length ? (
        <>
          <h3 className="govuk-heading-m" id="brief-judgements">
            {judgements ? 'Key judgements' : 'The findings that matter most'}
          </h3>
          <p className="govuk-body prt-brief__intro">
            {judgements
              ? `The ${brief.items.length === 1 ? 'one thing' : `${brief.items.length} things`} that matter most, most important first. Each says what in the paper it is about, how it could be beaten, and who should act.`
              : `This assessment was written before key judgements, so these are its ${brief.items.length === 1 ? 'highest-ranked finding' : `${brief.items.length} highest-ranked findings`}, with the worst way to beat the policy each one touches.`}
          </p>
          <ol className="prt-brief__list" aria-labelledby="brief-judgements">
            {brief.items.map((item) => <Item key={item.id} item={item} name={name} />)}
          </ol>
        </>
      ) : null}

      {brief.limits.length ? (
        <>
          <h3 className="govuk-heading-m" id="brief-limits">What we could not check</h3>
          <ul className="govuk-list govuk-list--bullet prt-brief__limits" aria-labelledby="brief-limits">
            {brief.limits.map((line) => <li key={line}>{line}</li>)}
          </ul>
        </>
      ) : null}

      <p className="govuk-body-s prt-meta prt-brief__foot">
        Everything behind the brief is further down this tab and in the other four. A red-team
        read finds weak points; it does not predict that anyone will use them.
      </p>
    </div>
  );
}

/**
 * One judgement. A left rule in the band ramp says how exposed its way to beat
 * the policy is, and the band's word says it too — the ramp's two light steps
 * sit below 3:1 against the page and never carry meaning alone.
 *
 * A DESCRIPTION LIST, NOT PROSE. The five things each judgement carries are
 * the same five every time, so they are labelled once each and a reader
 * scanning for "who should act" finds it in the same place on every card.
 */
function Item({ item, name }: { item: BriefItem; name: (artefact: Artefact | null, label: string) => ReactNode }) {
  const play = item.play;
  const act = [item.owner, item.action].filter(Boolean).join(': ');
  const rows: { label: string; value: ReactNode }[] = [];
  if (item.about) rows.push({ label: 'Part of the policy', value: name(item.about, item.about.label) });
  if (play) {
    rows.push({
      label: 'The way to beat it',
      value: (
        <>
          <span className={`prt-band prt-band--${play.band}`}>{BAND_LABEL[play.band]}</span>{' '}
          {name(play.artefact, play.artefact.label)}
          <span className="prt-meta"> — {play.pattern.toLowerCase()}{item.morePlays ? `, and ${item.morePlays} more` : ''}</span>
        </>
      ),
    });
    if (play.earlyWarning) rows.push({ label: 'Early warning', value: play.earlyWarning });
    if (play.fix) rows.push({ label: 'The fix', value: play.fix });
  }
  if (item.wouldChangeIf) rows.push({ label: 'What would change our mind', value: item.wouldChangeIf });
  if (act) {
    rows.push(item.owner
      ? { label: 'Who should act', value: act }
      : { label: 'What to do', value: item.answer ? name(item.answer, item.action) : item.action });
  }

  return (
    <li className={`prt-brief__item${play ? ` prt-brief__item--${play.band}` : ''}`}>
      <h4 className="govuk-heading-s prt-brief__title">
        <span className="prt-brief__rank" aria-hidden="true">{item.rank}</span>
        <span>{name(item.artefact, item.title)}</span>
      </h4>
      <p className="govuk-body prt-brief__judgement">{item.statement}</p>
      {item.quote ? (
        <figure className="prt-brief__quote">
          <blockquote>
            <p>&ldquo;{item.quote.text}&rdquo;</p>
          </blockquote>
          <figcaption className="prt-meta">
            The paper&rsquo;s own words{item.quote.page ? `, page ${item.quote.page}` : ''}
          </figcaption>
        </figure>
      ) : null}
      {rows.length ? (
        <dl className="prt-brief__facts">
          {rows.map((row) => (
            <div key={row.label} className="prt-brief__fact">
              <dt>{row.label}</dt>
              <dd>{row.value}</dd>
            </div>
          ))}
        </dl>
      ) : null}
      {item.severity ? (
        <p className="govuk-body-s prt-meta prt-brief__why">
          How serious: {item.severity.label.toLowerCase()}. {item.severity.reason}
        </p>
      ) : null}
    </li>
  );
}
