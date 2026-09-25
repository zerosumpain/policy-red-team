import { useEffect, useState } from 'react';
import { Link } from 'react-router';
import { api, type BodiesGrid } from '../api';
import { Table, type Column } from '../govuk';
import { BandMark } from '../BandMark';
import { usePageTitle } from '../layout/Template';
import { CLASH_RULE, ClashList } from './ClashList';

/**
 * BODIES DOWN, PAPERS ACROSS — phase 19, workstream X.
 *
 * The question a department has and a single assessment cannot answer: which
 * public bodies do my papers keep asking things of, and do any two papers pull
 * the same body two ways?
 *
 * A TABLE, NOT A NETWORK. Both axes are categories — bodies and papers — and a
 * policy graph is a star (AGENTS.md): a node-link picture of bodies against
 * bodies would place a handful of them and hide the rest. So the picture IS
 * the table: one row per body, one column per paper, and in each cell what that
 * paper gives that body, counted from the paper's own map of who does what.
 *
 * The owner's own page. Nothing on it leaves: it is built from the persona
 * library and the papers' graphs, which no share or export reads.
 */
export function Bodies() {
  usePageTitle('Bodies across papers');
  const [data, setData] = useState<BodiesGrid | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api.bodies().then(setData).catch((err: Error) => setError(err.message));
  }, []);

  const several = data?.rows.filter((r) => r.papers > 1) ?? [];

  return (
    <>
      <div className="govuk-grid-row">
        <div className="govuk-grid-column-two-thirds">
          <h1 className="govuk-heading-xl">Bodies across papers</h1>
          <p className="govuk-body-l">Which public bodies your papers ask things of, and which ask the most.</p>
          <p className="govuk-body">
            Each row is a public body on the GOV.UK list. Each column is a paper you have assessed.
            A cell shows what that paper gives the body: how many things it asks the body to do, and
            how many ways the assessment found for the body to work against the paper. We call those
            plays. The worst play is shown too.
          </p>
          <p className="govuk-body">
            The counts come from each paper’s own map of who does what. Sealed papers are never
            included.
          </p>
          {error ? <p className="govuk-body govuk-error-message" role="alert">{error}</p> : null}
          {!data && !error ? <p className="govuk-body">Loading…</p> : null}
          {data && !data.rows.length ? (
            <p className="govuk-body">
              Nothing yet. A body appears here once a paper names it and the library matches it to
              the GOV.UK list. You can match one by hand from its page in the{' '}
              <Link className="govuk-link" to="/personas">persona library</Link>.
            </p>
          ) : null}
        </div>
      </div>

      {data?.rows.length ? <Grid data={data} /> : null}

      {data ? (
        <section aria-labelledby="bodies-clashes" className="govuk-grid-row">
          <div className="govuk-grid-column-full">
            <h2 className="govuk-heading-m" id="bodies-clashes">
              Where two papers pull the same bodies in opposite directions — {data.clashes.length}
            </h2>
            <p className="govuk-body">{CLASH_RULE}</p>
            {data.clashes.length ? <ClashList clashes={data.clashes} /> : (
              <p className="govuk-body">
                None found. Different tasks for the same body are not counted as a clash: most bodies
                do many things. To compare what each paper asks of one body, open it from the table.
              </p>
            )}
          </div>
        </section>
      ) : null}

      {several.length ? (
        <section aria-labelledby="bodies-several" className="govuk-grid-row">
          <div className="govuk-grid-column-two-thirds">
            <h2 className="govuk-heading-m" id="bodies-several">Same body, different asks — {several.length}</h2>
            <p className="govuk-body">
              These bodies are named in more than one paper. Open one to see what each paper asks of
              it, side by side, next to what the public record says it has to work with.
            </p>
            <ul className="govuk-list govuk-list--bullet">
              {several.map((row) => (
                <li key={row.bodyId}>
                  {data?.personaOf[row.bodyId]
                    ? <Link className="govuk-link" to={`/personas/${data.personaOf[row.bodyId]}`}>{row.name}</Link>
                    : row.name}{' '}
                  <span className="prt-meta">— {row.papers} papers</span>
                </li>
              ))}
            </ul>
          </div>
        </section>
      ) : null}
    </>
  );
}

const short = (title: string) => (title.length > 40 ? `${title.slice(0, 38).trimEnd()}…` : title);

/**
 * The grid. The body name is the row header and stays put while the papers
 * scroll past it (`.prt-bodies`), the reason `.prt-actors__bodies` gives.
 */
function Grid({ data }: { data: BodiesGrid }) {
  const columns: Column[] = [
    { header: 'Body' },
    { header: 'Papers', numeric: true },
    ...data.papers.map((paper) => ({
      header: (
        <Link className="govuk-link" to={`/assessments/${paper.id}`}>
          <span aria-hidden="true">{short(paper.title)}</span>
          <span className="govuk-visually-hidden">{paper.title}</span>
        </Link>
      ),
      name: paper.title,
    })),
  ];
  const rows = data.rows.map((row) => [
    data.personaOf[row.bodyId]
      ? <Link key="n" className="govuk-link" to={`/personas/${data.personaOf[row.bodyId]}`}>{row.name}</Link>
      : row.name,
    String(row.papers),
    ...data.papers.map((paper) => {
      const cell = row.cells[paper.id];
      if (!cell) return <span key={paper.id} className="prt-meta">—<span className="govuk-visually-hidden"> not named</span></span>;
      return (
        <span key={paper.id}>
          {cell.duties} {cell.duties === 1 ? 'ask' : 'asks'}
          {cell.powers ? <>, {cell.powers} {cell.powers === 1 ? 'power' : 'powers'}</> : null}
          <br />
          {cell.plays} {cell.plays === 1 ? 'play' : 'plays'}
          {cell.worstBand ? <> · <BandMark band={cell.worstBand.toLowerCase()} /></> : null}
        </span>
      );
    }),
  ]);
  return (
    <div className="govuk-grid-row">
      <div className="govuk-grid-column-full prt-bodies">
        <Table
          caption="Named in the most papers first, then by how much is asked of them"
          captionSize="s"
          scroll
          firstCellIsHeader
          columns={columns}
          rows={rows}
        />
        <p className="govuk-body-s prt-meta">
          An ask is a task, a cost or a duty to report that the paper gives the body. A power is
          something the paper lets it do to others. A dash means the paper does not name the body.
        </p>
      </div>
    </div>
  );
}
