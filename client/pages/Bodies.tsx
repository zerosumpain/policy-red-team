import { useEffect, useState, type ReactNode } from 'react';
import { Link, useSearchParams } from 'react-router';
import { api, type AffectedGroup, type BodiesGrid, type DuplicateSuggestion, type PersonaSummary } from '../api';
import { InsetText, ServiceNavigation, Table, WarningText, type Column } from '../govuk';
import { BandMark } from '../BandMark';
import { Bar } from '../report/Metrics';
import { usePageTitle } from '../layout/Template';
import { viewPath } from '../moves';
import { bodyPath, HUB_VIEWS, hubPath, seenIn } from '../places';
import { CLASH_RULE, ClashList } from './ClashList';

/**
 * BODIES ACROSS POLICIES — ONE HUB, A PAGE PER QUESTION (phase 24).
 *
 * Until phase 24 this was two pages that answered overlapping questions under
 * two names: `/personas`, "Persona library", every profiled body; and
 * `/bodies`, "Bodies across papers", only the ones matched to the GOV.UK list,
 * reached by a link in the first page's body text. Both said which bodies had
 * turned up more than once, both drew the clashes, and "persona" and "body"
 * named one thing on one screen. Now:
 *
 *   /bodies           List            every body, the library's table
 *   /bodies/across    Across papers   the register bodies × papers grid
 *   /bodies/clashes   Clashes         two papers pulling one pair of bodies two ways
 *   /bodies/register  Master list     every actor once, as a part-of or kind-of tree (phase 24b)
 *   /bodies/review    Actors to review proposals, the model's joins, pairs that may be one body
 *   /bodies/groups    Groups of people
 *
 * Each thing is on exactly one of them. The views are `HUB_VIEWS` in
 * `places.ts`, which also keeps the register's place for phase 24b.
 *
 * The owner's own pages. Nothing here leaves: they are built from the persona
 * library and the papers' graphs, which no share or export reads.
 */
/**
 * THE QUEUE'S FIGURE IN THE VIEWS (phase 24b): "Actors to review (12)", asked
 * by every hub page. Held for the session and refreshed on each mount, so the
 * bar never flickers from a number to nothing while it asks again; a page that
 * changes the queue calls `refreshReviewCount` so the figure follows.
 */
let heldCount: number | null = null;
const countListeners = new Set<(n: number | null) => void>();
export function refreshReviewCount() {
  api.reviewCount()
    .then((c) => { heldCount = c.total; countListeners.forEach((f) => f(heldCount)); })
    .catch(() => undefined);
}
function useReviewCount(): number | null {
  const [count, setCount] = useState<number | null>(heldCount);
  useEffect(() => {
    countListeners.add(setCount);
    refreshReviewCount();
    return () => { countListeners.delete(setCount); };
  }, []);
  return count;
}

export function Hub({ slug, children, intro, heading }: { slug: string; children: ReactNode; intro?: ReactNode; heading?: string }) {
  const view = HUB_VIEWS.find((v) => v.slug === slug) ?? HUB_VIEWS[0];
  const count = useReviewCount();
  usePageTitle(view.slug ? `${view.label} — Bodies across policies` : 'Bodies across policies');
  return (
    <>
      <div className="govuk-grid-row">
        <div className="govuk-grid-column-full">
          <h1 className="govuk-heading-xl govuk-!-margin-bottom-4">Bodies across policies</h1>
        </div>
      </div>
      <ServiceNavigation
        sections
        label="Bodies across policies"
        toggle="Views of the bodies"
        items={HUB_VIEWS.map((v) => ({ href: hubPath(v.slug), text: v.slug === 'review' && count !== null ? `${v.label} (${count})` : v.label, current: v.slug === view.slug }))}
        render={({ href, className, current, children: text }) => (
          <Link to={href} className={className} aria-current={current}>{text}</Link>
        )}
      />
      <div className="govuk-grid-row">
        <div className="govuk-grid-column-full">
          <h2 className="govuk-heading-l">{heading ?? (view.label === 'List' ? 'Every body' : view.label)}</h2>
          <p className="govuk-body-l">{view.hint}.</p>
          {intro}
        </div>
      </div>
      {children}
    </>
  );
}

/** A failed or pending fetch, said in the same words on every view. */
export function Loading({ error, loading }: { error: string | null; loading: boolean }) {
  if (error) return <p className="govuk-body govuk-error-message" role="alert">{error}</p>;
  return loading ? <p className="govuk-body">Loading…</p> : null;
}

// ── List ────────────────────────────────────────────────────────────────────

/**
 * Every body this install has profiled, and how often each has turned up.
 *
 * Its value is cumulative and only shows up on the second assessment: a body
 * profiled in one paper is recognised in the next, and the papers count is how
 * a reader knows whether a profile is a first impression or a pattern.
 */
export function BodiesList() {
  const [rows, setRows] = useState<PersonaSummary[] | null>(null);
  const [duplicates, setDuplicates] = useState<DuplicateSuggestion[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api.personas()
      .then((data) => {
        setRows(data.personas ?? []);
        setDuplicates(data.duplicates ?? []);
      })
      .catch((err: Error) => setError(err.message));
  }, []);

  const seenTwice = rows?.filter((r) => r.sightings > 1).length ?? 0;

  return (
    <Hub slug="" intro={(
      /* SAID ONCE, ON THE HUB'S FRONT PAGE, and again on every body's page
         beside the part it governs. */
      <WarningText>
        What the papers said about a body is context, not evidence. It records how other papers
        described it — not what is true of it, and not a finding about the assessment in front of you.
      </WarningText>
    )}>
      <div className="govuk-grid-row">
        <div className="govuk-grid-column-full">
          <Loading error={error} loading={rows === null} />
          {rows?.length === 0 ? (
            <p className="govuk-body">
              Nothing yet. This fills as assessments run, and only starts being useful on the
              second paper that names the same body.
            </p>
          ) : null}
        </div>
      </div>

      {rows?.length ? (
        <div className="govuk-grid-row">
          <div className="govuk-grid-column-full">
            {/* THE LIST IN FOUR FIGURES (phase 20), before the table of all
                of it. Every figure is a count of the rows below. */}
            <ul className="prt-kpis" aria-label="The bodies in four figures">
              {([
                [rows.length, rows.length === 1 ? 'body profiled' : 'bodies profiled', 'across every assessment here'],
                [seenTwice, 'seen in more than one policy', seenTwice ? 'the ones worth opening first' : 'none yet: each says what one paper said'],
                [rows.filter((r) => r.body).length, 'matched to GOV.UK', 'a body on the public register'],
                [rows.filter((r) => r.worstBand === 'severe').length, 'with a severe way to beat a policy', 'in at least one paper'],
              ] as const).map(([n, label, note]) => (
                <li key={label} className={`prt-kpi prt-kpi--static${label.startsWith('with a severe') && n ? ' prt-kpi--severe' : ''}`}>
                  <span className="prt-kpi__value">{n.toLocaleString()}</span>
                  <span className="prt-kpi__label">{label}</span>
                  <span className="prt-kpi__note">{note}</span>
                </li>
              ))}
            </ul>
            <Library rows={rows} />
            <p className="govuk-body">
              Only the bodies matched to the GOV.UK list can be compared paper by paper:{' '}
              <Link className="govuk-link" to={hubPath('across')}>see them across papers</Link>.
            </p>
          </div>
        </div>
      ) : null}

      {/* ONE BODY RECORDED TWICE: the pairs are offered in the review queue
          since phase 24b, with the proposals and the model's joins, so there
          is one place to review who is who. Here, a pointer and a count. */}
      {duplicates.length ? (
        <div className="govuk-grid-row">
          <div className="govuk-grid-column-full">
            <InsetText>
              {duplicates.length} {duplicates.length === 1 ? 'pair of bodies may be' : 'pairs of bodies may be'} one
              body recorded twice.{' '}
              <Link className="govuk-link" to={`${hubPath('review')}#review-pairs`}>
                Check {duplicates.length === 1 ? 'it' : 'them'} with the other actors to review
              </Link>.
            </InsetText>
          </div>
        </div>
      ) : null}
    </Hub>
  );
}

/** The date a row was last recorded, as the column printed it. */
const recorded = (iso: string | null) => (iso
  ? new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
  : null);

/**
 * THREE OF SEVEN COLUMNS WERE THE SAME VALUE TWELVE TIMES.
 *
 * Measured on the live library: `Papers` was 1 on every row, `Enquiries` 0 and
 * `Last recorded` "19 Sept 2026" — 43% of the table carrying no information. A
 * column is rendered where it VARIES and folded into one sentence where it
 * does not, so the moment a second assessment runs, or one enquiry is
 * commissioned, the column comes back on its own.
 *
 * `Ways to beat it` GETS A LENGTH, normalised to the row maximum, which is what
 * `scale` tells a screen-reader user.
 */
function Library({ rows }: { rows: PersonaSummary[] }) {
  const varies = <T,>(pick: (row: PersonaSummary) => T) => new Set(rows.map(pick)).size > 1;
  const showPapers = varies((row) => row.sightings);
  const showEnquiries = varies((row) => row.researchNotes);
  const showLastSeen = varies((row) => recorded(row.lastSeen));
  const mostPlays = Math.max(1, ...rows.map((row) => row.plays));

  const showBody = rows.some((row) => row.body);
  const columns: Column[] = [
    { header: 'Body' }, { header: 'Kind' },
    ...(showBody ? [{ header: 'On GOV.UK as' }] : []),
    ...(showPapers ? [{ header: 'Policies', numeric: true }] : []),
    { header: 'Ways to beat it', numeric: true, className: 'prt-table__num' },
    { header: 'Worst' },
    ...(showEnquiries ? [{ header: 'Enquiries', numeric: true }] : []),
    ...(showLastSeen ? [{ header: 'Last recorded' }] : []),
  ];

  const held: string[] = [];
  if (!showPapers) held.push(seenIn(rows[0].sightings).replace(/^seen/, 'been seen'));
  if (!showEnquiries) {
    held.push(rows[0].researchNotes === 0
      ? 'had no commissioned enquiries'
      : `had ${rows[0].researchNotes} commissioned ${rows[0].researchNotes === 1 ? 'enquiry' : 'enquiries'}`);
  }
  const sameDate = !showLastSeen ? recorded(rows[0].lastSeen) : null;

  return (
    <>
      <Table className="prt-table prt-table--zebra" firstCellIsHeader
        caption="Most-seen first"
        captionSize="s"
        scroll
        columns={columns}
        rows={rows.map((row) => [
          <Link key="n" className="govuk-link" to={bodyPath(row.id)}>{row.name}</Link>,
          row.entityType.replaceAll('_', ' ') || '—',
          ...(showBody ? [row.body?.name ?? <span key="g" className="prt-meta">Not matched</span>] : []),
          ...(showPapers ? [String(row.sightings)] : []),
          <Bar key="p" value={row.plays} max={mostPlays} digits={0} scale={`ways to beat it, 0 to ${mostPlays} on this table`} />,
          <BandMark key="b" band={row.worstBand} />,
          ...(showEnquiries ? [String(row.researchNotes)] : []),
          /* "LAST RECORDED", not "last seen in a paper": `listPersonas`
             computes it over every observation including commissioned
             enquiries, which the enquiries column makes legible. */
          ...(showLastSeen
            ? [recorded(row.lastSeen) ?? <span key="l" className="prt-meta">Not recorded</span>]
            : []),
        ])}
      />
      {held.length || sameDate ? (
        <p className="govuk-body-s prt-meta">
          {held.length ? `Every body here has ${held.join(' and ')}.` : ''}
          {held.length && sameDate ? ' ' : ''}
          {sameDate ? `All ${rows.length} were last recorded on ${sameDate}.` : ''}
        </p>
      ) : null}
    </>
  );
}

// ── Across papers ───────────────────────────────────────────────────────────

/**
 * BODIES DOWN, PAPERS ACROSS — phase 19, workstream X.
 *
 * A TABLE, NOT A NETWORK. Both axes are categories and a policy graph is a
 * star (AGENTS.md): a node-link picture of bodies against bodies would place a
 * handful and hide the rest. The picture IS the table.
 *
 * "SAME BODY, DIFFERENT ASKS" IS GONE: it was a bullet list of the rows whose
 * Papers column is above one — the column beside it said the same — and the
 * list view counts them too. The clashes are their own view.
 */
export function BodiesAcross() {
  const [data, setData] = useState<BodiesGrid | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api.bodies().then(setData).catch((err: Error) => setError(err.message));
  }, []);

  return (
    <Hub slug="across" intro={(
      <>
        <p className="govuk-body">
          Each row is a public body on the GOV.UK list. Each column is a paper you have assessed. A
          cell shows what that paper gives the body: how many things it asks the body to do, how many
          ways the assessment found for the body to beat it, and how bad the worst of those is.
        </p>
        <p className="govuk-body">
          The counts come from each paper’s own map of who does what. Sealed papers are never
          included. A body not matched to the GOV.UK list is in the{' '}
          <Link className="govuk-link" to={hubPath('')}>list</Link> but not here, because two papers
          can only be compared on who a body really is, not on what each called it.
        </p>
      </>
    )}>
      <div className="govuk-grid-row">
        <div className="govuk-grid-column-full">
          <Loading error={error} loading={!data} />
          {data && !data.rows.length ? (
            <p className="govuk-body">
              Nothing yet. A body appears here once a paper names it and it is matched to the GOV.UK
              list. You can match one by hand from its page in the{' '}
              <Link className="govuk-link" to={hubPath('')}>list</Link>.
            </p>
          ) : null}
        </div>
      </div>
      {data?.rows.length ? <Grid data={data} /> : null}
    </Hub>
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
      ? <Link key="n" className="govuk-link" to={bodyPath(data.personaOf[row.bodyId])}>{row.name}</Link>
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
          {cell.plays} {cell.plays === 1 ? 'way to beat it' : 'ways to beat it'}
          {cell.worstBand ? <> · <BandMark band={cell.worstBand.toLowerCase()} /></> : null}
        </span>
      );
    }),
  ]);
  return (
    <div className="govuk-grid-row">
      <div className="govuk-grid-column-full prt-bodies">
        <Table className="prt-table prt-table--zebra"
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
          Open a body to read what each paper asks of it, side by side.
        </p>
      </div>
    </div>
  );
}

// ── Clashes ─────────────────────────────────────────────────────────────────

/**
 * Every clash, in one place. A body's own page counts the clashes it is in and
 * links here with `?body=` rather than drawing them a second time.
 */
export function BodiesClashes() {
  const [data, setData] = useState<BodiesGrid | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [params] = useSearchParams();
  const only = params.get('body');

  useEffect(() => {
    api.bodies().then(setData).catch((err: Error) => setError(err.message));
  }, []);

  const clashes = data ? data.clashes.filter((c) => !only || c.bodyId === only || c.otherId === only) : [];
  const onlyName = only && data ? data.clashes.find((c) => c.bodyId === only)?.bodyName ?? data.clashes.find((c) => c.otherId === only)?.otherName ?? null : null;

  return (
    <Hub slug="clashes" intro={<p className="govuk-body">{CLASH_RULE}</p>}>
      <div className="govuk-grid-row">
        <div className="govuk-grid-column-full">
          <Loading error={error} loading={!data} />
          {only && data ? (
            <p className="govuk-body">
              {onlyName ? `Showing the clashes ${onlyName} is in.` : 'Showing the clashes one body is in.'}{' '}
              <Link className="govuk-link" to={hubPath('clashes')}>Show every clash</Link>
            </p>
          ) : null}
          {data ? (
            <>
              <h3 className="govuk-heading-m">
                {clashes.length} {clashes.length === 1 ? 'clash' : 'clashes'}
              </h3>
              {clashes.length ? <ClashList clashes={clashes} headingLevel={4} /> : (
                <p className="govuk-body">
                  None found. Different tasks for the same body are not counted as a clash: most bodies
                  do many things. To compare what each paper asks of one body, open it from the{' '}
                  <Link className="govuk-link" to={hubPath('across')}>grid</Link>.
                </p>
              )}
            </>
          ) : null}
        </div>
      </div>
    </Hub>
  );
}

// ── Groups of people ────────────────────────────────────────────────────────

/**
 * GROUPS OF PEOPLE ARE NOT BODIES. 18 of the 35 personas on the live box were
 * groups like "children", and a generic name like that is what split the
 * library. They were a two-column table at the foot of the old library that
 * went nowhere; each row now links to the assessments that named the group,
 * on the page of each that says who is involved.
 */
export function BodiesGroups() {
  const [groups, setGroups] = useState<AffectedGroup[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api.personas().then((data) => setGroups(data.groups ?? [])).catch((err: Error) => setError(err.message));
  }, []);

  /** A group named by many papers lists the first few and counts the rest: a model-produced list gets a cap. */
  const SHOWN = 5;
  return (
    <Hub slug="groups" intro={(
      <p className="govuk-body">
        The people a policy affects, such as children or parents. They are kept apart from bodies: a
        group has no plan of its own to profile, so there is nothing to compare across papers but
        who named it.
      </p>
    )}>
      <div className="govuk-grid-row">
        <div className="govuk-grid-column-full">
          <Loading error={error} loading={groups === null} />
          {groups && !groups.length ? <p className="govuk-body">No paper has named a group of people yet.</p> : null}
          {groups?.length ? (
            <Table className="prt-table prt-table--zebra" firstCellIsHeader
              caption={`${groups.length} ${groups.length === 1 ? 'group' : 'groups'}, named in the most papers first`}
              captionSize="s"
              scroll
              columns={[{ header: 'Group' }, { header: 'Papers', numeric: true }, { header: 'Named in' }]}
              rows={groups.map((g) => [
                g.name,
                String(g.papers),
                <span key="a">
                  {g.analyses.slice(0, SHOWN).map((a, i) => (
                    <span key={a.id}>
                      {i ? ', ' : ''}
                      <Link className="govuk-link" to={viewPath(a.id, 'actors')}>{a.title}</Link>
                    </span>
                  ))}
                  {g.analyses.length > SHOWN ? <span className="prt-meta"> and {g.analyses.length - SHOWN} more</span> : null}
                </span>,
              ])}
            />
          ) : null}
        </div>
      </div>
    </Hub>
  );
}
