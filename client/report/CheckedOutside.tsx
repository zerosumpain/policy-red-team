import { useMemo, type ReactNode } from 'react';
import type { Artefact } from '$lib/policy-analysis/contracts';
import { OUTCOME_WORDS, researchChecks, type QuestionView, type SourceView } from '$lib/research-view';
import { Details, Table, Tag, type TagColour } from '../govuk';

/**
 * CHECKED OUTSIDE THE PAPER (phase 22 part 2).
 *
 * Every question the research step asked, and what came of it: who asked it
 * (the model, or you), why — the assumption or claim it tests and how it
 * ranked — what came back (each source with its grade, whether it was read in
 * full or only as a snippet, its publisher and date when known, and "Supplied
 * by you" where you named it), what the evidence matrix did with it, and what
 * is still open. A question nothing answered says so plainly and carries the
 * two actions, which is where a reader who knows a better source can say so.
 *
 * Your questions first, then the model's by priority — the order they were
 * asked in. The first `SHOWN` are open; the rest are behind one disclosure,
 * because AGENTS.md is right that every model-produced list needs a cap: the
 * real run asked 43. Inside each question the sources are capped too, and the
 * rest are one click away on the question's own page.
 *
 * Both renderers. The pack passes no `actions`, so it draws none — it has no
 * server to send anything to.
 */
export const SHOWN = 10;
const SOURCES_SHOWN = 5;

const OUTCOME_COLOUR: Record<string, TagColour> = {
  supports: 'green', contradicts: 'red', mixed: 'yellow', insufficient: 'grey', unused: 'grey', nothing: 'grey', unasked: 'grey',
};

export function CheckedOutside({ artefacts, stages, linkTo, actions }: {
  artefacts: Artefact[];
  /** The run's stages, whose warnings say why a question has nothing behind it. */
  stages?: { warnings?: string[] | null }[];
  linkTo?: (artefact: Artefact, label?: string) => ReactNode;
  /** The two actions for one open question; absent in the pack and a read-only copy. */
  actions?: (question: Artefact) => ReactNode;
}) {
  const checks = useMemo(() => researchChecks(artefacts, (stages ?? []).flatMap((s) => s.warnings ?? [])), [artefacts, stages]);
  const { counts } = checks;
  const name = (a: Artefact) => (linkTo ? linkTo(a) : a.label);
  const shown = checks.questions.slice(0, SHOWN);
  const rest = checks.questions.slice(SHOWN);

  return (
    <div className="prt-checked">
      <p className="govuk-body">
        The research step asked {counts.questions} {counts.questions === 1 ? 'question' : 'questions'}
        {counts.asked ? `, ${counts.asked} of them yours` : ''}.{' '}
        {counts.answered} came back with something: {counts.sources}{' '}
        {counts.sources === 1 ? 'source' : 'sources'}, {counts.fullText} read in full and{' '}
        {counts.sources - counts.fullText} only as a search snippet.{' '}
        {counts.open} {counts.open === 1 ? 'is' : 'are'} still open{counts.unasked ? `, ${counts.unasked} of them never searched` : ''}.
      </p>
      {counts.supplied ? (
        <p className="govuk-body-s prt-meta">
          {counts.supplied} {counts.supplied === 1 ? 'source was' : 'sources were'} supplied by you.
          They are graded like any other: who chose a source says nothing about how strong it is.
        </p>
      ) : null}

      <ol className="prt-checked__list">
        {shown.map((view) => <Question key={view.question.id} view={view} ranked={checks.ranked} name={name} actions={actions} />)}
      </ol>
      {rest.length ? (
        <Details summary={`Show the other ${rest.length} ${rest.length === 1 ? 'question' : 'questions'}`}>
          <ol className="prt-checked__list" start={SHOWN + 1}>
            {rest.map((view) => <Question key={view.question.id} view={view} ranked={checks.ranked} name={name} actions={actions} />)}
          </ol>
        </Details>
      ) : null}
    </div>
  );
}

function Question({ view, ranked, name, actions }: {
  view: QuestionView;
  ranked: number;
  name: (a: Artefact) => ReactNode;
  actions?: (question: Artefact) => ReactNode;
}) {
  const sources = view.sources.slice(0, SOURCES_SHOWN);
  return (
    <li className="prt-checked__item">
      <h3 className="govuk-heading-s prt-checked__head">
        {name(view.question)}
        {view.askedBy === 'you' ? <> <Tag colour="blue">Asked by you</Tag></> : null}
      </h3>
      <p className="govuk-body-s prt-meta">
        {view.askedBy === 'you'
          ? 'You asked for this.'
          : `Asked by the model${view.rank ? `, ranked ${view.rank} of ${ranked} by how much the answer could change the assessment` : ''}.`}
      </p>
      {view.why || view.targets.length ? (
        <p className="govuk-body-s">
          <strong>Why:</strong> {view.why}
          {view.targets.length ? (
            <>
              {' '}It tests{' '}
              {view.targets.map((t, i) => (
                <span key={t.id}>{i ? (i === view.targets.length - 1 ? ' and ' : ', ') : ''}{name(t)}</span>
              ))}.
            </>
          ) : null}
        </p>
      ) : null}

      {sources.length ? (
        <Table
          className="prt-table"
          caption={`What came back — ${view.sources.length} ${view.sources.length === 1 ? 'source' : 'sources'}`}
          captionSize="s"
          scroll
          columns={[
            { header: 'Source' },
            { header: 'Read', width: '7rem' },
            { header: 'Grade', width: '7rem' },
            { header: 'What it said' },
          ]}
          rows={sources.map((s) => sourceRow(s, name))}
        />
      ) : (
        <p className="govuk-body-s">{view.nothingBecause ?? 'Nothing came back for this question.'}</p>
      )}
      {view.sources.length > sources.length ? (
        <p className="govuk-body-s prt-meta">
          And {view.sources.length - sources.length} more, listed on the question’s own page.
        </p>
      ) : null}

      {/* A question never searched did nothing; the sentence above says why, and a tag repeating it is noise. */}
      {view.outcome === 'unasked' ? null : <p className="govuk-body-s">
        <strong>What it did:</strong>{' '}
        <Tag colour={OUTCOME_COLOUR[view.outcome] ?? 'grey'} className="prt-checked__outcome">{OUTCOME_WORDS[view.outcome]}</Tag>
      </p>}
      {view.open && view.gap ? <p className="govuk-body-s"><strong>Still open:</strong> {view.gap}</p> : null}
      {view.open && actions ? actions(view.question) : null}
    </li>
  );
}

function sourceRow(s: SourceView, name: (a: Artefact) => ReactNode): ReactNode[] {
  const when = [s.publisher, s.publishedAt ? s.publishedAt.slice(0, 10) : null].filter(Boolean).join(', ');
  return [
    <span className="prt-checked__source">
      {name(s.source)}
      {s.supplied ? <> <Tag colour="purple">Supplied by you</Tag></> : null}
      {when ? <span className="prt-meta prt-checked__when">{when}</span> : null}
    </span>,
    s.fullText ? 'In full' : 'Snippet only',
    s.gradeLabel,
    s.results.length ? s.results.join('; ') : <span className="prt-meta">Not used as evidence</span>,
  ];
}
