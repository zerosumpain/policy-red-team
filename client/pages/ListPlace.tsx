import { Link } from 'react-router';
import type { RegisterEntryView } from '../api';
import { SummaryList, Tag } from '../govuk';
import { BandMark } from '../BandMark';
import { bodyPath, reviewPath } from '../places';
import { KIND_WORDS, NOT_ACTOR_WORDS, capacitySentence } from '../register-words';

/**
 * WHERE A BODY SITS ON THE READER'S MASTER LIST (phase 24b), for its own page.
 *
 * Its own small module rather than a piece of `Register.tsx`: a body's page is
 * a separate lazy chunk, and borrowing two components from the queue's page
 * would load the whole queue to draw a breadcrumb.
 */

const CHILDREN_SHOWN = 12;

/** "Part of Department for Education › Government · a kind of early years provider", under the title. */
export function ListBreadcrumb({ place }: { place: RegisterEntryView }) {
  const e = place.entry;
  if (!e.partOfPath.length && !e.kindOfPath.length) return null;
  return (
    <p className="govuk-body prt-place">
      {e.partOfPath.length ? (
        <>
          Part of{' '}
          {place.partOf ? <Link className="govuk-link" to={bodyPath(place.partOf.id)}>{place.partOf.name}</Link> : e.partOfPath[0]}
          {e.partOfPath.slice(1).map((name) => <span key={name}> › {name}</span>)}
        </>
      ) : null}
      {e.partOfPath.length && e.kindOfPath.length ? ' · ' : null}
      {e.kindOfPath.length ? (
        <>
          {e.partOfPath.length ? 'a' : 'A'} kind of{' '}
          {place.kindOf ? <Link className="govuk-link" to={bodyPath(place.kindOf.id)}>{place.kindOf.name}</Link> : e.kindOfPath[0]}
          {e.kindOfPath.slice(1).map((name) => <span key={name}> › {name}</span>)}
        </>
      ) : null}
    </p>
  );
}

/** The section: status, sort, place in both trees, what sits beneath, and the capacities across papers. */
export function ListPlace({ place }: { place: RegisterEntryView }) {
  const e = place.entry;
  const capacities = capacitySentence(e.capacityPapers);
  const kids = (list: RegisterEntryView['children']['partOf']) => (
    <ul className="govuk-list govuk-!-margin-bottom-0">
      {list.slice(0, CHILDREN_SHOWN).map((c) => (
        <li key={c.id}>
          <Link className="govuk-link" to={bodyPath(c.id)}>{c.name}</Link>
          {c.status === 'proposed' ? <span className="prt-meta"> (proposed)</span> : null}
        </li>
      ))}
      {list.length > CHILDREN_SHOWN ? <li className="prt-meta">and {list.length - CHILDREN_SHOWN} more</li> : null}
    </ul>
  );
  const sort = e.kind === 'not_an_actor'
    ? `Not an actor: ${NOT_ACTOR_WORDS[e.notActorReason ?? 'other'] ?? 'something else'}`
    : KIND_WORDS[e.kind] ?? e.kind;
  const roll = e.rollup.partOf.plays >= e.rollup.kindOf.plays ? { ...e.rollup.partOf, how: 'inside it' } : { ...e.rollup.kindOf, how: 'of its kind' };
  return (
    <section aria-labelledby="band-list" className="prt-kindband">
      <span className="govuk-caption-m">Your record</span>
      <h2 className="govuk-heading-l" id="band-list">Where it sits on your master list</h2>
      <p className="govuk-body">
        Your own list of every actor your papers named, each once. It is your record, built from what
        papers said and what you decided, not a public one.
      </p>
      <SummaryList rows={[
        {
          key: 'Status',
          value: e.status === 'proposed'
            ? <><Tag colour="yellow">Proposed</Tag> A paper suggested it and nobody has confirmed it yet.</>
            : 'Confirmed',
        },
        { key: 'Sort of actor', value: sort },
        { key: 'Sits inside', value: e.partOfPath.length ? e.partOfPath.join(' › ') : 'Nothing: it is at the top of the list' },
        { key: 'A kind of', value: e.kindOfPath.length ? e.kindOfPath.join(' › ') : 'No category' },
        ...(place.children.partOf.length ? [{ key: `Inside it — ${place.children.partOf.length}`, value: kids(place.children.partOf) }] : []),
        ...(place.children.kindOf.length ? [{ key: `Of its kind — ${place.children.kindOf.length}`, value: kids(place.children.kindOf) }] : []),
        { key: 'What papers give it to do', value: capacities ? capacities[0].toUpperCase() + capacities.slice(1) : 'No paper says' },
        ...(roll.plays > e.plays ? [{
          key: 'Inherited from below',
          value: <>{roll.plays - e.plays} ways to beat a policy were found for what sits {roll.how}{roll.worstBand ? <>; the worst across all of them is <BandMark band={roll.worstBand} /></> : null}.</>,
        }] : []),
      ]} />
      {!place.readOnly ? (
        <p className="govuk-body">
          <Link className="govuk-link" to={reviewPath(e.id)}>
            {e.status === 'proposed' ? 'Review it' : 'Change where it sits or what it is'}
            <span className="govuk-visually-hidden"> — {e.name}</span>
          </Link>
        </p>
      ) : null}
    </section>
  );
}
