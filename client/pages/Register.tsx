import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { Link, useLocation, useNavigate, useParams, useSearchParams } from 'react-router';
import {
  api, type ModelJoin, type Proposal, type RegisterEntryView, type RegisterKind, type RegisterNode, type RegisterTree, type ReviewQueue,
} from '../api';
import { Button, ButtonGroup, ErrorSummary, InsetText, Input, NotificationBanner, Pagination, Radios, SummaryList, Tag, WarningText, type SummaryRow } from '../govuk';
import { BandMark } from '../BandMark';
import { usePageTitle } from '../layout/Template';
import { bodyPath, hubPath, reviewPath } from '../places';
import { KIND_CHOICES, KIND_WORDS, NOT_ACTOR_WORDS, capacitySentence, pathSentence } from '../register-words';
import { arrangeRoots, pageOf, searchTree, type TreeField } from '../register-tree';
import { Hub, Loading, refreshReviewCount } from './Bodies';

/**
 * THE MASTER LIST OF ACTORS, AND THE QUEUE OF WHAT TO REVIEW ON IT (phase 24b).
 *
 * John's requirement (plan §4b): "a master list of actors with matching back
 * in; if there's a hierarchy around an actor's role, bake it into the design
 * instead of recording duplicate actors." Phase 23 built the list and its API;
 * nothing drew it, so proposals piled up unseen. These pages are that drawing:
 *
 *   /bodies/register                 the list as a tree, part of / a kind of
 *   /bodies/review                   proposals, the model's joins, pairs that may be one
 *   /bodies/review/:id               one actor: its evidence and every decision
 *   /bodies/review/:id/:decision     one decision, one form
 *
 * A NESTED LIST, NOT A CANVAS. The tree is `<ul>` inside `<li>` with a
 * disclosure button per actor that has anything beneath it: a screen reader
 * hears list depth and "expanded"/"collapsed", the keyboard tabs name → button
 * → name, and nothing scrolls sideways at 320px because each level is a small
 * indent of wrapping text. A drawn tree was considered for wide screens and
 * left out: on the live copy 6 of 180 entries have a parent at all, so a
 * picture would be a row of dots; the list says the same and is the one a
 * keyboard can use (docs/phase-24b-register.md).
 *
 * EVERY DECISION IS A ROUTE AND A FORM, not a dialog (GDS has no modal on
 * purpose — see `Drill.tsx`), and every one confirms the way a POST-redirect-GET
 * would: the browser moves to the page that now shows the result, a success
 * banner there takes focus and is announced, and it carries an Undo where the
 * API can reverse the decision. Read-only installs see everything and decide
 * nothing; the server refuses the writes anyway.
 */

// ---------------------------------------------------------------------------
// Confirmation, with undo
// ---------------------------------------------------------------------------

/** How a decision is reversed. Serialisable: it rides in the router's state to the next page. */
type Undo =
  | { kind: 'reopen'; id: string }
  | { kind: 'reparent'; id: string; change: { partOf?: string | null; kindOf?: string | null } }
  | { kind: 'merge'; keep: string; other: string }
  | { kind: 'split'; id: string; wording: string }
  | { kind: 'kind'; id: string; to: RegisterKind; reopen: boolean }
  | { kind: 'actor-again'; id: string; to: RegisterKind; partOf: string | null; kindOf: string | null; reopen: boolean }
  | { kind: 'not-actor'; id: string; reason: string; runBy: string | null };

type Flash = { text: string; undo?: Undo; note?: string };

async function runUndo(undo: Undo): Promise<string> {
  switch (undo.kind) {
    case 'reopen':
      await api.reopen(undo.id);
      return 'It is back in the queue to review.';
    case 'reparent':
      await api.reparent(undo.id, undo.change);
      return 'It is back where it was.';
    case 'merge':
      await api.mergePersonas(undo.keep, undo.other);
      return 'The two are one actor again.';
    case 'split':
      await api.splitWording(undo.id, undo.wording);
      return 'They are two actors again.';
    case 'kind':
      if (undo.to !== 'not_an_actor') await api.setKind(undo.id, undo.to);
      if (undo.reopen) await api.reopen(undo.id);
      return 'It is the sort of actor it was.';
    case 'actor-again':
      await api.setKind(undo.id, undo.to);
      if (undo.partOf || undo.kindOf) await api.reparent(undo.id, { partOf: undo.partOf, kindOf: undo.kindOf });
      if (undo.reopen) await api.reopen(undo.id);
      return 'It is an actor again, where it was. Anything that sat under it was let go and is not put back.';
    case 'not-actor':
      await api.notActor(undo.id, undo.reason, undo.runBy);
      return 'It is kept as context again, not as an actor.';
  }
}

/**
 * The flash a decision left for this page, read ONCE and then cleared from the
 * history entry, so a reload or a Back to here does not announce it again.
 */
function useFlash(): [Flash | null, (f: Flash | null) => void] {
  const location = useLocation();
  const navigate = useNavigate();
  const [flash, setFlash] = useState<Flash | null>((location.state as { flash?: Flash } | null)?.flash ?? null);
  useEffect(() => {
    const incoming = (location.state as { flash?: Flash } | null)?.flash;
    if (!incoming) return;
    setFlash(incoming);
    void navigate(`${location.pathname}${location.search}`, { replace: true, state: null });
  }, [location.state, location.pathname, location.search, navigate]);
  return [flash, setFlash];
}

/**
 * A GOV.UK success banner that TAKES FOCUS, as the pattern says a banner after
 * a submitted form should — after `Template` has moved focus to the main
 * element on the navigation, hence the tick. Its Undo replaces it with the
 * result of undoing, announced the same way.
 */
function Confirmation({ flash, onChanged, readOnly }: { flash: Flash | null; onChanged: (f: Flash | null) => void; readOnly?: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (!flash) return;
    const t = window.setTimeout(() => ref.current?.focus(), 0);
    return () => window.clearTimeout(t);
  }, [flash]);
  if (!flash) return null;
  async function undo() {
    if (!flash?.undo) return;
    setBusy(true);
    setError(null);
    try {
      const said = await runUndo(flash.undo);
      refreshReviewCount();
      onChanged({ text: `Undone. ${said}` });
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div ref={ref} tabIndex={-1} className="prt-flash">
      <NotificationBanner type="success">
        <p className="govuk-notification-banner__heading">{flash.text}</p>
        {flash.note ? <p className="govuk-body">{flash.note}</p> : null}
        {error ? <p className="govuk-error-message"><span className="govuk-visually-hidden">Error:</span> {error}</p> : null}
        {flash.undo && !readOnly ? (
          <ButtonGroup>
            <Button variant="secondary" disabled={busy} onClick={() => void undo()}>{busy ? 'Undoing…' : 'Undo'}</Button>
          </ButtonGroup>
        ) : null}
      </NotificationBanner>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Small shared parts
// ---------------------------------------------------------------------------

const plural = (n: number, one: string, many: string) => `${n.toLocaleString()} ${n === 1 ? one : many}`;
const papersPhrase = (n: number) => (n ? `named in ${plural(n, 'paper', 'papers')}` : 'named in no paper you can see');

/** "Organisation", or "Not an actor: a programme or scheme". */
function kindText(e: { kind: RegisterKind; notActorReason?: string | null }): string {
  if (e.kind !== 'not_an_actor') return KIND_WORDS[e.kind] ?? e.kind;
  return `Not an actor: ${NOT_ACTOR_WORDS[e.notActorReason ?? 'other'] ?? 'something else'}`;
}

function StatusTag({ status }: { status: string }) {
  return status === 'proposed' ? <Tag colour="yellow" className="prt-register__tag">Proposed</Tag> : null;
}

/** The papers a thing was named in, linked, the first few and a count of the rest. */
function PaperLinks({ analyses, shown = 3 }: { analyses: { id: string; title: string }[]; shown?: number }) {
  if (!analyses.length) return <span className="prt-meta">No paper you can see. It may have been deleted.</span>;
  return (
    <>
      {analyses.slice(0, shown).map((a, i) => (
        <span key={a.id}>{i ? '; ' : ''}<Link className="govuk-link" to={`/assessments/${a.id}/who`}>{a.title}</Link></span>
      ))}
      {analyses.length > shown ? <span className="prt-meta"> and {analyses.length - shown} more</span> : null}
    </>
  );
}

function ReadOnlyNote({ children }: { children?: ReactNode }) {
  return <InsetText>This copy is read-only. You can see what needs reviewing here but not decide it.{children}</InsetText>;
}

function PageProblem({ message }: { message: string }) {
  return (
    <div className="govuk-grid-row">
      <div className="govuk-grid-column-full" role="alert">
        <h1 className="govuk-heading-l">There is a problem</h1>
        <p className="govuk-body">{message}</p>
        <p className="govuk-body"><Link className="govuk-link" to={hubPath('review')}>Go back to the actors to review</Link></p>
      </div>
    </div>
  );
}

function PageLoading() {
  return (
    <div className="govuk-grid-row">
      <div className="govuk-grid-column-full">
        <h1 className="govuk-heading-l">Loading</h1>
        <p className="govuk-body" aria-live="polite">Getting this actor.</p>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// The master list, as a tree
// ---------------------------------------------------------------------------

/** Roots per page, and children shown under one actor before "Show N more". */
const ROOTS_PER_PAGE = 25;
const CHILDREN_SHOWN = 20;
const CONTEXT_SHOWN = 30;

type TreeContext = {
  tree: RegisterTree;
  field: TreeField;
  byId: Map<string, RegisterNode>;
  visible: Set<string> | null;
  matches: Set<string>;
  isOpen: (id: string) => boolean;
  toggle: (id: string) => void;
  showsAll: (id: string) => boolean;
  showAll: (id: string) => void;
};

export function BodiesRegister() {
  const [params, setParams] = useSearchParams();
  const field: TreeField = params.get('tree') === 'kind' ? 'kindOf' : 'partOf';
  const query = params.get('q') ?? '';
  const [tree, setTree] = useState<RegisterTree | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState<Set<string>>(new Set());
  const [all, setAll] = useState<Set<string>>(new Set());
  const [contextAll, setContextAll] = useState(false);

  useEffect(() => {
    api.register().then(setTree).catch((err: Error) => setError(err.message));
  }, []);
  // A different arrangement is a different tree: what was open in one means nothing in the other.
  useEffect(() => { setOpen(new Set()); setAll(new Set()); }, [field]);

  const arranged = useMemo(() => (tree ? arrangeRoots(tree, field) : { roots: [], context: [] }), [tree, field]);
  const found = useMemo(() => (tree ? searchTree(tree, field, query) : { visible: null, open: new Set<string>(), matches: new Set<string>() }), [tree, field, query]);
  const roots = found.visible ? arranged.roots.filter((id) => found.visible!.has(id)) : arranged.roots;
  const context = found.visible ? arranged.context.filter((id) => found.visible!.has(id)) : arranged.context;
  const paged = pageOf(roots, Number(params.get('page') ?? 1), ROOTS_PER_PAGE);

  const set = (next: Record<string, string | null>) => {
    const p = new URLSearchParams(params);
    for (const [k, v] of Object.entries(next)) { if (v === null || v === '') p.delete(k); else p.set(k, v); }
    setParams(p);
  };
  const ctx: TreeContext | null = tree ? {
    tree, field, byId: new Map(tree.entries.map((e) => [e.id, e])), visible: found.visible, matches: found.matches,
    isOpen: (id) => open.has(id) || found.open.has(id),
    toggle: (id) => setOpen((o) => { const n = new Set(o); if (n.has(id) || found.open.has(id)) n.delete(id); else n.add(id); return n; }),
    showsAll: (id) => all.has(id),
    showAll: (id) => setAll((a) => new Set(a).add(id)),
  } : null;
  const withChildren = paged.items.filter((id) => (tree?.[field].children[id] ?? []).length);
  const allOpen = withChildren.length > 0 && withChildren.every((id) => open.has(id));
  const href = (next: Record<string, string | null>) => {
    const p = new URLSearchParams(params);
    for (const [k, v] of Object.entries(next)) { if (v === null) p.delete(k); else p.set(k, v); }
    const qs = p.toString();
    return `${hubPath('register')}${qs ? `?${qs}` : ''}`;
  };

  return (
    <Hub slug="register" heading="Master list of actors" intro={(
      <>
        <p className="govuk-body">
          Every body, office and group of people your papers named, each listed once. When a new paper
          names one of them — in whatever words — it is matched back to the same actor here.
        </p>
        <p className="govuk-body">
          An actor can sit <strong>inside</strong> another (the Secretary of State is part of the
          department) and belong to a <strong>category</strong> (childminders are a kind of early years
          provider). The ways to beat a policy found for what sits beneath an actor are shown beside it
          as well, marked as inherited.
        </p>
      </>
    )}>
      <div className="govuk-grid-row">
        <div className="govuk-grid-column-full">
          <Loading error={error} loading={!tree && !error} />
          {tree ? (
            <>
              <ul className="prt-kpis" aria-label="The list in four figures">
                {([
                  [tree.counts.actors, tree.counts.actors === 1 ? 'actor' : 'actors', 'bodies, offices and groups'],
                  [tree.counts.proposed, 'proposed', tree.counts.proposed ? 'suggested by a paper, not yet confirmed' : 'nothing waiting'],
                  [tree.counts.groups, tree.counts.groups === 1 ? 'group of people' : 'groups of people', 'kept on the list, never profiled'],
                  [tree.counts.notActors, 'not actors', 'programmes, places and measures kept as context'],
                ] as const).map(([n, label, note]) => (
                  <li key={label} className="prt-kpi prt-kpi--static">
                    <span className="prt-kpi__value">{n.toLocaleString()}</span>
                    <span className="prt-kpi__label">{label}</span>
                    <span className="prt-kpi__note">{note}</span>
                  </li>
                ))}
              </ul>
              {tree.counts.proposed ? (
                <p className="govuk-body">
                  <Link className="govuk-link" to={hubPath('review')}>Review the {plural(tree.counts.proposed, 'proposed actor', 'proposed actors')}</Link>
                </p>
              ) : null}

              <nav aria-label="Arrange the list" className="prt-switch">
                <span className="prt-switch__label" id="register-arrange">Arrange by</span>
                <ul className="prt-switch__list" aria-labelledby="register-arrange">
                  {([['partOf', 'part', 'What each sits inside'], ['kindOf', 'kind', 'What kind of thing each is']] as const).map(([f, slug, text]) => (
                    <li key={f} className="prt-switch__item">
                      <Link className="govuk-link prt-switch__link" to={href({ tree: slug === 'part' ? null : slug, page: null })} aria-current={field === f ? 'true' : undefined}>
                        {text}
                      </Link>
                    </li>
                  ))}
                </ul>
              </nav>

              <form role="search" className="prt-register__find" onSubmit={(e) => {
                e.preventDefault();
                set({ q: String(new FormData(e.currentTarget).get('q') ?? '').trim(), page: null });
              }}>
                <Input id="register-q" name="q" label="Find an actor" hint="By any name a paper used for it" defaultValue={query} key={query} spellCheck={false} />
                <ButtonGroup>
                  <Button variant="secondary" type="submit">Find</Button>
                  {query ? <Link className="govuk-link" to={href({ q: null, page: null })}>Show the whole list</Link> : null}
                </ButtonGroup>
              </form>

              <h3 className="govuk-heading-m" id="register-tree-heading">
                {field === 'partOf' ? 'What each actor sits inside' : 'What kind of thing each actor is'}
              </h3>
              <p className="govuk-body" aria-live="polite">
                {query
                  ? `${plural(found.matches.size, 'actor matches', 'actors match')} “${query}”, shown where ${found.matches.size === 1 ? 'it sits' : 'each sits'}.`
                  : `${plural(roots.length, 'actor', 'actors')} at the top of the list, the ones with the most beneath them first.`}
                {paged.pages > 1 ? ` Page ${paged.page} of ${paged.pages}.` : ''}
              </p>
              {withChildren.length ? (
                <ButtonGroup>
                  <Button variant="secondary" onClick={() => setOpen(allOpen ? new Set() : new Set([...open, ...withChildren]))}>
                    {allOpen ? 'Hide what sits beneath each' : 'Show what sits beneath each'}
                    <span className="govuk-visually-hidden"> actor on this page</span>
                  </Button>
                </ButtonGroup>
              ) : null}
              {ctx && paged.items.length ? (
                <ul className="prt-tree" aria-labelledby="register-tree-heading">
                  {paged.items.map((id) => <TreeNode key={id} id={id} ctx={ctx} depth={0} />)}
                </ul>
              ) : tree.entries.length ? (
                <p className="govuk-body">Nothing on the list matches that.</p>
              ) : (
                <p className="govuk-body">
                  Nothing yet. The list fills as papers are assessed: each actor a paper names is matched
                  to it or proposed for it.
                </p>
              )}
              <Pagination
                label="Pages of the list"
                previous={paged.page > 1 ? { href: href({ page: String(paged.page - 1) }), title: 'Previous page', label: `${paged.page - 1} of ${paged.pages}` } : null}
                next={paged.page < paged.pages ? { href: href({ page: String(paged.page + 1) }), title: 'Next page', label: `${paged.page + 1} of ${paged.pages}` } : null}
                render={({ href: to, className, rel, children }) => <Link to={to} className={className} rel={rel}>{children}</Link>}
              />

              {context.length ? (
                <section aria-labelledby="register-context" className="prt-register__context">
                  <h3 className="govuk-heading-m" id="register-context">Kept as context, not actors — {context.length}</h3>
                  <p className="govuk-body">
                    Programmes, places and measures a paper named as if they acted. They stay on the list so
                    the next paper that names one is not profiled as a body; nothing runs them yet.
                  </p>
                  <ul className="govuk-list">
                    {(contextAll ? context : context.slice(0, CONTEXT_SHOWN)).map((id) => {
                      const e = ctx!.byId.get(id)!;
                      return (
                        <li key={id}>
                          <Link className="govuk-link" to={bodyPath(id)}>{e.name}</Link>{' '}
                          <span className="prt-meta">— {NOT_ACTOR_WORDS[e.notActorReason ?? 'other'] ?? 'not an actor'}</span>
                        </li>
                      );
                    })}
                  </ul>
                  {!contextAll && context.length > CONTEXT_SHOWN ? (
                    <Button variant="secondary" onClick={() => setContextAll(true)}>Show {context.length - CONTEXT_SHOWN} more kept as context</Button>
                  ) : null}
                </section>
              ) : null}
            </>
          ) : null}
        </div>
      </div>
    </Hub>
  );
}

/**
 * ONE ACTOR IN THE TREE: its name (a link to its page), whether a reader has
 * confirmed it, what sort it is, how many papers named it, its worst way to
 * beat a policy, and the ROLL-UP — what was found for everything beneath it,
 * said as inherited. Its children are drawn only while it is open, and only
 * the first twenty until asked: a category can hold hundreds.
 */
function TreeNode({ id, ctx, depth }: { id: string; ctx: TreeContext; depth: number }) {
  const e = ctx.byId.get(id);
  if (!e) return null;
  const kids = (ctx.tree[ctx.field].children[id] ?? []).filter((c) => !ctx.visible || ctx.visible.has(c));
  const open = kids.length > 0 && ctx.isOpen(id);
  const shown = ctx.showsAll(id) ? kids : kids.slice(0, CHILDREN_SHOWN);
  const listId = `register-${ctx.field}-${id}`;
  const roll = e.rollup[ctx.field];
  const inherited = roll.plays - e.plays;
  const where = ctx.field === 'partOf' ? 'inside it' : 'of this kind';
  return (
    <li className={`prt-tree__item${ctx.matches.has(id) ? ' prt-tree__item--match' : ''}`}>
      <div className="prt-tree__row">
        <Link className="govuk-link prt-tree__name" to={bodyPath(id)}>{e.name}</Link>
        <StatusTag status={e.status} />
        <p className="prt-tree__meta">
          {kindText(e)} · {papersPhrase(e.papers)}
          {e.plays ? <> · {plural(e.plays, 'way', 'ways')} to beat a policy, worst <BandMark band={e.worstBand} /></> : null}
        </p>
        {inherited > 0 ? (
          <p className="prt-tree__meta prt-tree__inherited">
            Inherited from what sits {where}: {plural(inherited, 'way', 'ways')} to beat a policy
            {roll.worstBand && roll.worstBand !== e.worstBand ? <>, worst <BandMark band={roll.worstBand} /></> : null}
          </p>
        ) : null}
        {kids.length ? (
          <button type="button" className="prt-tree__toggle govuk-link" aria-expanded={open} aria-controls={listId}
                  onClick={() => ctx.toggle(id)}>
            <span className="prt-tree__chevron" aria-hidden="true" />
            {open ? 'Hide' : 'Show'} {kids.length} {where}
            <span className="govuk-visually-hidden"> — {e.name}</span>
          </button>
        ) : null}
      </div>
      {/* The controlled list is always in the DOM, so `aria-controls` names
          something; its contents are drawn only while open. */}
      <ul id={listId} className="prt-tree__children" hidden={!open}>
        {open ? shown.map((c) => <TreeNode key={c} id={c} ctx={ctx} depth={depth + 1} />) : null}
        {open && shown.length < kids.length ? (
          <li className="prt-tree__item">
            <Button variant="secondary" className="prt-tree__more" onClick={() => ctx.showAll(id)}>
              Show {kids.length - shown.length} more<span className="govuk-visually-hidden"> {where} — {e.name}</span>
            </Button>
          </li>
        ) : null}
      </ul>
    </li>
  );
}

// ---------------------------------------------------------------------------
// The review queue
// ---------------------------------------------------------------------------

const PROPOSALS_PER_PAGE = 15;

export function BodiesReview() {
  const [params] = useSearchParams();
  const [queue, setQueue] = useState<ReviewQueue | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [flash, setFlash] = useFlash();
  const [busy, setBusy] = useState<string | null>(null);
  const [actionError, setActionError] = useState<{ text: string; href: string } | null>(null);

  const load = useCallback(() => api.reviewQueue().then(setQueue).catch((err: Error) => setError(err.message)), []);
  useEffect(() => { void load(); }, [load]);

  async function act(key: string, run: () => Promise<Flash>, href: string) {
    setBusy(key);
    setActionError(null);
    try {
      const next = await run();
      await load();
      refreshReviewCount();
      setFlash(next);
    } catch (err) {
      setActionError({ text: (err as Error).message, href });
    } finally {
      setBusy(null);
    }
  }

  const readOnly = queue?.readOnly ?? false;
  const paged = pageOf(queue?.proposals ?? [], Number(params.get('page') ?? 1), PROPOSALS_PER_PAGE);
  const pageHref = (page: number) => `${hubPath('review', page > 1 ? `page=${page}` : undefined)}#review-proposals`;
  const nothing = queue && !queue.proposals.length && !queue.joined.length && !queue.duplicates.length;

  return (
    <Hub slug="review" intro={(
      <p className="govuk-body">
        Each paper is matched back to the master list. What it could not match is proposed as a new
        actor, and what the matching model joined on its own judgement is worth a second look. Your
        decisions here are used by every later paper.
      </p>
    )}>
      <div className="govuk-grid-row">
        <div className="govuk-grid-column-full">
          {actionError ? <ErrorSummary errors={[actionError]} /> : null}
          <Confirmation flash={flash} onChanged={(f) => { setFlash(f); void load(); }} readOnly={readOnly} />
          <Loading error={error} loading={!queue && !error} />
          {readOnly ? <ReadOnlyNote /> : null}
          {nothing ? <p className="govuk-body">Nothing to review. Every actor on the list has been confirmed.</p> : null}
          {queue && !nothing ? (
            <nav aria-label="What there is to review" className="prt-onpage">
              <ol className="govuk-list prt-onpage__list">
                <li>{queue.joinedTotal ? <a className="govuk-link" href="#review-joins">Joined by the model — check</a> : 'Joined by the model — check'} <span className="prt-meta">— {queue.joinedTotal || 'none'}</span></li>
                <li>{queue.duplicates.length ? <a className="govuk-link" href="#review-pairs">These may be the same body</a> : 'These may be the same body'} <span className="prt-meta">— {queue.duplicates.length || 'none'}</span></li>
                <li>{queue.proposals.length ? <a className="govuk-link" href="#review-proposals">Proposed for the list</a> : 'Proposed for the list'} <span className="prt-meta">— {queue.proposals.length || 'none'}</span></li>
              </ol>
            </nav>
          ) : null}
        </div>
      </div>

      {queue && !nothing ? (
        <>
          {/* An empty kind of review is said once in the list above, not as an empty section. */}
          {queue.joinedTotal ? <section aria-labelledby="review-joins" className="prt-kindband">
            <h3 className="govuk-heading-l" id="review-joins">Joined by the model — check — {queue.joinedTotal}</h3>
            <p className="govuk-body">
              The matching model decided each of these wordings meant an actor already on the list. From now
              on every paper that uses the wording is matched to that actor without asking, so a wrong one
              repeats until it is split off.
            </p>
            {queue.joined.length ? (
              <ul className="govuk-list prt-review__list">
                {queue.joined.map((j) => <JoinRow key={`${j.id}|${j.wording}`} join={j} busy={busy} readOnly={readOnly} act={act} />)}
              </ul>
            ) : <p className="govuk-body">None to check.</p>}
            {queue.joinedTotal > queue.joined.length ? (
              <p className="govuk-body-s prt-meta">The {queue.joined.length} most recent of {queue.joinedTotal}. Deciding these brings the next ones here.</p>
            ) : null}
          </section> : null}

          {queue.duplicates.length ? <section aria-labelledby="review-pairs" className="prt-kindband">
            <h3 className="govuk-heading-l" id="review-pairs">These may be the same body — {queue.duplicates.length}</h3>
            <p className="govuk-body">Each pair may be one body recorded twice. Check them side by side and say whether they are the same.</p>
            {queue.duplicates.length ? (
              <ul className="govuk-list govuk-list--bullet">
                {queue.duplicates.map((pair) => (
                  <li key={`${pair.a.id}-${pair.b.id}`}>
                    {readOnly ? `${pair.a.name} and ${pair.b.name}` : (
                      <Link className="govuk-link" to={bodyPath(pair.a.id, `merge/${pair.b.id}`)}>Compare {pair.a.name} and {pair.b.name}</Link>
                    )}{' '}
                    <span className="prt-meta">— {pair.reason}</span>
                  </li>
                ))}
              </ul>
            ) : null}
          </section> : null}

          <section aria-labelledby="review-proposals" className="prt-kindband">
            <h3 className="govuk-heading-l" id="review-proposals">Proposed for the list — {queue.proposals.length}</h3>
            <p className="govuk-body">
              A paper named each of these and nothing on the list matched. They are used already, as
              proposals; accepting one says it is a real actor and belongs on the list as it stands.
              Most-seen first.
            </p>
            {paged.items.length ? (
              <ul className="govuk-list prt-review__list">
                {paged.items.map((p) => <ProposalCard key={p.id} proposal={p} busy={busy} readOnly={readOnly} act={act} />)}
              </ul>
            ) : <p className="govuk-body">None.</p>}
            <Pagination
              label="Pages of proposals"
              previous={paged.page > 1 ? { href: pageHref(paged.page - 1), title: 'Previous page', label: `${paged.page - 1} of ${paged.pages}` } : null}
              next={paged.page < paged.pages ? { href: pageHref(paged.page + 1), title: 'Next page', label: `${paged.page + 1} of ${paged.pages}` } : null}
              render={({ href, className, rel, children }) => <Link to={href} className={className} rel={rel}>{children}</Link>}
            />
          </section>
        </>
      ) : null}
    </Hub>
  );
}

type Act = (key: string, run: () => Promise<Flash>, href: string) => Promise<void>;

/** One join the model made: the wording, the actor it went to, the papers, and the two answers. */
function JoinRow({ join, busy, readOnly, act }: { join: ModelJoin; busy: string | null; readOnly: boolean; act: Act }) {
  const key = `join:${join.id}:${join.wording}`;
  const anchor = `join-${join.id}-${join.wording.replace(/[^a-z0-9]+/gi, '-').toLowerCase()}`;
  return (
    <li className="prt-review__item" id={anchor}>
      <p className="govuk-body govuk-!-margin-bottom-1">
        <strong>“{join.wording}”</strong> is filed under <Link className="govuk-link" to={bodyPath(join.id)}>{join.name}</Link>
        <StatusTag status={join.status} />
      </p>
      <p className="govuk-body-s prt-meta govuk-!-margin-bottom-2">
        {join.alias ? 'Matched by rule in every later paper. ' : ''}Worded that way in: <PaperLinks analyses={join.analyses} />
      </p>
      {readOnly ? null : (
        <ButtonGroup>
          <Button variant="secondary" disabled={busy !== null}
                  onClick={() => void act(key, async () => {
                    const made = await api.splitWording(join.id, join.wording);
                    return { text: `“${join.wording}” is now an actor of its own, apart from ${join.name}.`, note: 'The next paper that uses those words will not be matched to it.', undo: { kind: 'merge', keep: join.id, other: made.id } };
                  }, `#${anchor}`)}>
            Split it off<span className="govuk-visually-hidden">: “{join.wording}” is not {join.name}</span>
          </Button>
          <Button variant="secondary" disabled={busy !== null}
                  onClick={() => void act(key, async () => {
                    await api.keepWording(join.id, join.wording);
                    return { text: `“${join.wording}” stays with ${join.name}, on your word now rather than the model’s.`, undo: { kind: 'split', id: join.id, wording: join.wording } };
                  }, `#${anchor}`)}>
            Keep it<span className="govuk-visually-hidden">: “{join.wording}” is {join.name}</span>
          </Button>
        </ButtonGroup>
      )}
    </li>
  );
}

/** The evidence for one actor, as a summary list: what papers said, and where it was suggested to sit. */
function evidenceRows(e: RegisterNode, wordings: { wording: string; papers: number }[] | undefined, extra: SummaryRow[] = []): SummaryRow[] {
  const capacities = capacitySentence(e.capacityPapers);
  const others = (wordings ?? []).filter((w) => w.wording.toLowerCase() !== e.name.toLowerCase());
  return [
    { key: 'Sort of actor', value: kindText(e) },
    ...(e.whatItIs ? [{ key: 'What it is', value: e.whatItIs }] : []),
    { key: 'Papers', value: <PaperLinks analyses={e.analyses} /> },
    ...(others.length ? [{
      key: 'Also worded as',
      value: (
        <ul className="govuk-list govuk-!-margin-bottom-0">
          {others.slice(0, 6).map((w) => <li key={w.wording}>“{w.wording}” <span className="prt-meta">in {plural(w.papers, 'paper', 'papers')}</span></li>)}
          {others.length > 6 ? <li className="prt-meta">and {others.length - 6} more</li> : null}
        </ul>
      ),
    }] : []),
    ...(capacities ? [{ key: 'What papers give it to do', value: capacities }] : []),
    ...(e.partOfPath.length ? [{ key: 'Sits inside', value: e.partOfPath.join(' › ') }] : []),
    ...(e.kindOfPath.length ? [{ key: 'A kind of', value: e.kindOfPath.join(' › ') }] : []),
    ...(e.body ? [{ key: 'On GOV.UK as', value: e.body.name }] : []),
    ...(e.plays ? [{ key: 'Ways to beat a policy', value: <>{e.plays}, worst <BandMark band={e.worstBand} /></> }] : []),
    ...extra,
  ];
}

/** One proposal in the queue: its evidence, Accept, and the way to every other decision. */
function ProposalCard({ proposal: p, busy, readOnly, act }: { proposal: Proposal; busy: string | null; readOnly: boolean; act: Act }) {
  const anchor = `proposal-${p.id}`;
  return (
    <li className="prt-review__item prt-review__card" id={anchor}>
      <h4 className="govuk-heading-m govuk-!-margin-bottom-2">
        <Link className="govuk-link" to={reviewPath(p.id)}>{p.name}</Link>
      </h4>
      <SummaryList className="govuk-summary-list--no-border prt-review__facts" rows={evidenceRows(p, p.wordings, [
        ...(p.proposedIn ? [{ key: 'First proposed by', value: <Link className="govuk-link" to={`/assessments/${p.proposedIn.id}/who`}>{p.proposedIn.title}</Link> }] : []),
        ...(p.similar.length ? [{ key: 'May be the same as', value: p.similar.map((s) => s.name).join(', ') }] : []),
      ])} />
      {readOnly ? null : (
        <ButtonGroup>
          <Button disabled={busy !== null}
                  onClick={() => void act(`accept:${p.id}`, async () => {
                    await api.accept(p.id);
                    return { text: `${p.name} is confirmed on the list.`, undo: { kind: 'reopen', id: p.id } };
                  }, `#${anchor}`)}>
            Accept<span className="govuk-visually-hidden"> {p.name}</span>
          </Button>
          <Link className="govuk-link" to={reviewPath(p.id)}>
            Decide something else<span className="govuk-visually-hidden"> about {p.name}</span>
          </Link>
        </ButtonGroup>
      )}
    </li>
  );
}

// ---------------------------------------------------------------------------
// One actor, and each decision about it
// ---------------------------------------------------------------------------

function useEntry(id: string) {
  const [entry, setEntry] = useState<RegisterEntryView | null>(null);
  const [error, setError] = useState<string | null>(null);
  const load = useCallback(() => api.registerEntry(id).then((e) => { setEntry(e); setError(null); }).catch((err: Error) => setError(err.message)), [id]);
  useEffect(() => { setEntry(null); void load(); }, [load]);
  return { entry, error, reload: load };
}

/** The decisions a reader can make about one actor, each its own page. */
const DECISIONS: { slug: string; text: (name: string) => string; when: (v: RegisterEntryView) => boolean }[] = [
  { slug: 'merge', text: (n) => `${n} is the same as an actor already on the list`, when: () => true },
  { slug: 'part-of', text: (n) => `Move ${n} inside a different actor`, when: (v) => v.entry.kind !== 'not_an_actor' },
  { slug: 'kind-of', text: (n) => `Put ${n} in a different category`, when: (v) => v.entry.kind !== 'not_an_actor' },
  { slug: 'kind', text: (n) => `Change what sort of actor ${n} is`, when: (v) => v.entry.kind !== 'not_an_actor' },
  { slug: 'kind', text: (n) => `${n} is an actor after all`, when: (v) => v.entry.kind === 'not_an_actor' },
  { slug: 'not-actor', text: (n) => `${n} is not an actor`, when: (v) => v.entry.kind !== 'not_an_actor' },
  { slug: 'split', text: (n) => `One of the names filed under ${n} is a different actor`, when: (v) => splitChoices(v).length > 0 },
];

/** The wordings that could be split off: everything filed under it but its own name. */
function splitChoices(v: RegisterEntryView): string[] {
  const own = v.entry.name.toLowerCase();
  const all = [...v.wordings.map((w) => w.wording), ...v.entry.aliases];
  return [...new Map(all.filter((w) => w.toLowerCase() !== own).map((w) => [w.toLowerCase(), w])).values()];
}

export function ReviewActor() {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const { entry, error, reload } = useEntry(id);
  const [flash, setFlash] = useFlash();
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  usePageTitle(entry ? `${entry.entry.name} — actors to review` : undefined);

  if (error) return <PageProblem message={error} />;
  if (!entry) return <PageLoading />;
  const e = entry.entry;
  const readOnly = entry.readOnly;

  async function decide(run: () => Promise<Flash>, to?: string) {
    setBusy(true);
    setActionError(null);
    try {
      const next = await run();
      refreshReviewCount();
      if (to) void navigate(to, { state: { flash: next } });
      else { await reload(); setFlash(next); }
    } catch (err) {
      setActionError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const children = [...entry.children.partOf.map((c) => ({ ...c, how: 'inside it' })), ...entry.children.kindOf.map((c) => ({ ...c, how: 'a kind of it' }))];
  return (
    <div className="govuk-grid-row">
      <div className="govuk-grid-column-full">
        {actionError ? <ErrorSummary errors={[{ text: actionError, href: '#review-accept' }]} /> : null}
        <Confirmation flash={flash} onChanged={(f) => { setFlash(f); void reload(); }} readOnly={readOnly} />
        <span className="govuk-caption-l">{e.status === 'proposed' ? 'Actor to review' : 'On the master list'}</span>
        <h1 className="govuk-heading-l">{e.name} <StatusTag status={e.status} /></h1>
        <SummaryList rows={evidenceRows(e, entry.wordings, [
          ...(children.length ? [{
            key: 'Beneath it',
            value: (
              <ul className="govuk-list govuk-!-margin-bottom-0">
                {children.slice(0, 10).map((c) => <li key={`${c.how}${c.id}`}><Link className="govuk-link" to={reviewPath(c.id)}>{c.name}</Link> <span className="prt-meta">— {c.how}</span></li>)}
                {children.length > 10 ? <li className="prt-meta">and {children.length - 10} more</li> : null}
              </ul>
            ),
          }] : []),
          ...(e.aliases.length ? [{ key: 'Other names', value: e.aliases.slice(0, 12).join(', ') + (e.aliases.length > 12 ? `, and ${e.aliases.length - 12} more` : '') }] : []),
        ])} />
        <p className="govuk-body"><Link className="govuk-link" to={bodyPath(e.id)}>Everything recorded about {e.name}</Link></p>

        {readOnly ? <ReadOnlyNote /> : (
          <>
            <h2 className="govuk-heading-m">Decide</h2>
            {e.status === 'proposed' ? (
              <ButtonGroup>
                <Button id="review-accept" disabled={busy}
                        onClick={() => void decide(async () => {
                          await api.accept(e.id);
                          return { text: `${e.name} is confirmed on the list.`, undo: { kind: 'reopen', id: e.id } };
                        }, hubPath('review'))}>
                  Accept it as it stands
                </Button>
              </ButtonGroup>
            ) : (
              <ButtonGroup>
                <Button id="review-accept" variant="secondary" disabled={busy}
                        onClick={() => void decide(async () => {
                          await api.reopen(e.id);
                          return { text: `${e.name} is back in the queue to review.` };
                        })}>
                  Put it back in the queue
                </Button>
              </ButtonGroup>
            )}
            <p className="govuk-body">Or:</p>
            <ul className="govuk-list govuk-list--bullet">
              {DECISIONS.filter((d) => d.when(entry)).map((d) => (
                <li key={`${d.slug}${d.text('')}`}><Link className="govuk-link" to={reviewPath(e.id, d.slug)}>{d.text(e.name)}</Link></li>
              ))}
            </ul>
          </>
        )}
        <p className="govuk-body"><Link className="govuk-link" to={hubPath('review')}>Back to the actors to review</Link></p>
      </div>
    </div>
  );
}

/** Search the master list in the browser: it is one request and a few hundred rows at most. */
function useRegister() {
  const [tree, setTree] = useState<RegisterTree | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => { api.register().then(setTree).catch((err: Error) => setError(err.message)); }, []);
  return { tree, error };
}

const PICK_SHOWN = 20;

function searchEntries(tree: RegisterTree, q: string, skip: (e: RegisterNode) => boolean): RegisterNode[] {
  const query = q.trim().toLowerCase();
  if (!query) return [];
  return tree.entries
    .filter((e) => !skip(e) && [e.name, ...e.aliases].some((n) => n.toLowerCase().includes(query)))
    .sort((a, b) => Number(b.name.toLowerCase().startsWith(query)) - Number(a.name.toLowerCase().startsWith(query)) || b.papers - a.papers || a.name.localeCompare(b.name))
    .slice(0, PICK_SHOWN);
}

/** "Department for Education — organisation, part of Government". The figure in the label, never a radio hint. */
const pickLabel = (e: RegisterNode) => `${e.name} — ${kindText(e).toLowerCase()}${e.partOfPath[0] ? `, part of ${e.partOfPath[0]}` : ''}${e.status === 'proposed' ? ' (proposed)' : ''}`;

/** A search box that writes `?q=` and the list of what it found, as GOV.UK radios. */
function Picker({ id, legend, hint, query, results, extra, error }: {
  id: string; legend: string; hint?: string; query: string;
  results: RegisterNode[] | null; extra?: { value: string; text: string }[]; error?: string;
}) {
  return (
    <>
      {results === null ? null : results.length || extra?.length ? (
        <Radios id={id} name="choice" legend={legend} legendSize="m" hint={hint} error={error}
                items={[...results.map((r) => ({ value: r.id, text: pickLabel(r) })), ...(extra ?? [])]} />
      ) : query ? <p className="govuk-body">Nothing on the list matches “{query}”. Try fewer words.</p> : null}
    </>
  );
}

function SearchBox({ query, label }: { query: string; label: string }) {
  const [, setParams] = useSearchParams();
  return (
    <form role="search" onSubmit={(e) => { e.preventDefault(); setParams({ q: String(new FormData(e.currentTarget).get('q') ?? '') }); }}>
      <Input id="review-q" name="q" label={label} hint="Any name a paper used for it" defaultValue={query} key={query} spellCheck={false} />
      <ButtonGroup><Button variant="secondary" type="submit">Search</Button></ButtonGroup>
    </form>
  );
}

/** One decision about one actor, at `/bodies/review/:id/:decision`. */
export function ReviewDecision() {
  const { id = '', decision = '' } = useParams();
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const { entry, error } = useEntry(id);
  const { tree, error: treeError } = useRegister();
  const [errors, setErrors] = useState<{ text: string; href: string }[]>([]);
  const [busy, setBusy] = useState(false);
  const [askRemove, setAskRemove] = useState(false);
  const query = params.get('q') ?? '';

  const titles: Record<string, string> = {
    merge: 'Which actor is it the same as?',
    'part-of': 'What does it sit inside?',
    'kind-of': 'What category does it belong to?',
    kind: 'What sort of actor is it?',
    'not-actor': 'What is it, if not an actor?',
    split: 'Which name is a different actor?',
    remove: 'Remove a named person',
  };
  const title = titles[decision];
  usePageTitle(entry && title ? `${title} — ${entry.entry.name}` : undefined);

  if (!title) return <PageProblem message="There is no such decision." />;
  if (error || treeError) return <PageProblem message={(error ?? treeError)!} />;
  if (!entry || !tree) return <PageLoading />;
  const e = entry.entry;
  const back = reviewPath(e.id);

  async function submit(run: () => Promise<{ flash: Flash; to: string }>, href: string) {
    setBusy(true);
    setErrors([]);
    try {
      const { flash, to } = await run();
      refreshReviewCount();
      void navigate(to, { state: { flash } });
    } catch (err) {
      setErrors([{ text: (err as Error).message, href }]);
      setBusy(false);
    }
  }
  const chosen = (form: HTMLFormElement, name = 'choice') => String(new FormData(form).get(name) ?? '');
  const need = (text: string, href: string) => { setErrors([{ text, href }]); };

  let body: ReactNode = null;
  if (entry.readOnly) {
    body = <ReadOnlyNote> <Link className="govuk-link" to={back}>Go back to {e.name}</Link>.</ReadOnlyNote>;
  } else if (decision === 'merge') {
    // Opens on a search for the last word of its name — "providers", "council" —
    // which is where a duplicate is likeliest to be found.
    const q = query || (e.name.split(/\s+/).filter((w) => w.length > 2).slice(-1)[0] ?? e.name);
    const results = searchEntries(tree, q, (o) => o.id === e.id || o.kind === 'not_an_actor');
    body = (
      <>
        <p className="govuk-body">
          Everything recorded about {e.name} moves to the actor you choose, and “{e.name}” becomes another
          name for it, so later papers that say it are matched there. You can split it off again afterwards.
        </p>
        <SearchBox query={q} label="Search the list" />
        <form noValidate onSubmit={(ev: FormEvent<HTMLFormElement>) => {
          ev.preventDefault();
          const other = chosen(ev.currentTarget);
          if (!other) { need('Choose the actor it is the same as', '#review-choice'); return; }
          const target = tree.entries.find((x) => x.id === other)!;
          void submit(async () => {
            await api.mergePersonas(other, e.id);
            return { to: hubPath('review'), flash: { text: `${e.name} is now part of ${target.name}’s record, as another name for it.`, undo: { kind: 'split', id: other, wording: e.name } } };
          }, '#review-choice');
        }}>
          <Picker id="review-choice" legend={`Which actor is ${e.name} the same as?`} query={q}
                  results={results}
                  error={errors.find((x) => x.href === '#review-choice')?.text} />
          <ButtonGroup>
            <Button type="submit" disabled={busy}>Combine them</Button>
            <Link className="govuk-link" to={back}>Cancel</Link>
          </ButtonGroup>
        </form>
      </>
    );
  } else if (decision === 'part-of' || decision === 'kind-of') {
    const field: TreeField = decision === 'part-of' ? 'partOf' : 'kindOf';
    const current = field === 'partOf' ? entry.partOf : entry.kindOf;
    const skip = (o: RegisterNode) => o.id === e.id || o.kind === 'not_an_actor' || (field === 'kindOf' && o.kind !== 'sector_or_category' && o.kind !== 'group_of_people');
    const results = searchEntries(tree, query, skip);
    body = (
      <>
        <p className="govuk-body">
          {field === 'partOf'
            ? <>Structure: who {e.name} sits inside. A Secretary of State sits inside their department; a family hub inside the council that runs it.</>
            : <>Category: what sort of thing {e.name} is a member of. Childminders are a kind of early years provider. Only sectors, categories and groups of people can be a category.</>}
        </p>
        <p className="govuk-body">{current ? <>It is now {field === 'partOf' ? 'inside' : 'a kind of'} <strong>{current.name}</strong>.</> : <>It is now {field === 'partOf' ? 'inside nothing' : 'in no category'}.</>}</p>
        <SearchBox query={query} label={field === 'partOf' ? 'Search for what it sits inside' : 'Search for its category'} />
        <form noValidate onSubmit={(ev: FormEvent<HTMLFormElement>) => {
          ev.preventDefault();
          const pick = chosen(ev.currentTarget);
          if (!pick) { need(field === 'partOf' ? 'Choose what it sits inside' : 'Choose its category', '#review-choice'); return; }
          const parent = pick === '__top' ? null : pick;
          const name = parent ? tree.entries.find((x) => x.id === parent)?.name ?? 'that actor' : null;
          void submit(async () => {
            await api.reparent(e.id, { [field]: parent });
            return {
              to: back,
              flash: {
                text: name ? `${e.name} now sits ${field === 'partOf' ? 'inside' : 'in the category'} ${name}.` : `${e.name} now sits ${field === 'partOf' ? 'inside nothing' : 'in no category'}.`,
                undo: { kind: 'reparent', id: e.id, change: { [field]: current?.id ?? null } },
              },
            };
          }, '#review-choice');
        }}>
          <Picker id="review-choice" query={query}
                  legend={field === 'partOf' ? `What does ${e.name} sit inside?` : `What category does ${e.name} belong to?`}
                  results={query ? results : []}
                  extra={current ? [{ value: '__top', text: field === 'partOf' ? 'Nothing: it sits at the top of the list' : 'No category' }] : []}
                  error={errors.find((x) => x.href === '#review-choice')?.text} />
          {query || current ? (
            <ButtonGroup>
              <Button type="submit" disabled={busy}>Save</Button>
              <Link className="govuk-link" to={back}>Cancel</Link>
            </ButtonGroup>
          ) : null}
        </form>
      </>
    );
  } else if (decision === 'kind') {
    const was = e.kind;
    body = (
      <form noValidate onSubmit={(ev: FormEvent<HTMLFormElement>) => {
        ev.preventDefault();
        const kind = chosen(ev.currentTarget) as RegisterKind;
        if (!kind) { need('Choose what sort of actor it is', '#review-choice'); return; }
        void submit(async () => {
          await api.setKind(e.id, kind);
          const undo: Undo = was === 'not_an_actor'
            ? { kind: 'not-actor', id: e.id, reason: e.notActorReason && e.notActorReason !== 'named_person' ? e.notActorReason : 'other', runBy: e.partOf }
            : { kind: 'kind', id: e.id, to: was, reopen: e.status === 'proposed' };
          return { to: back, flash: { text: `${e.name} is ${KIND_CHOICES.find((k) => k.value === kind)?.text.toLowerCase() ?? kind}, and confirmed on the list.`, undo } };
        }, '#review-choice');
      }}>
        <Radios id="review-choice" name="choice" legend={`What sort of actor is ${e.name}?`} legendSize="m"
                hint={was === 'not_an_actor' ? 'It is marked as not an actor. Choosing a sort makes it an actor again.' : `It is marked as: ${kindText(e).toLowerCase()}.`}
                error={errors[0]?.text}
                items={KIND_CHOICES.map((k) => ({ value: k.value, text: k.text, hint: k.hint }))} />
        <ButtonGroup>
          <Button type="submit" disabled={busy}>Save</Button>
          <Link className="govuk-link" to={back}>Cancel</Link>
        </ButtonGroup>
      </form>
    );
  } else if (decision === 'not-actor') {
    // WHO RUNS A PROGRAMME is offered from what this paper's own papers named,
    // not the whole list: a bounded choice a reader can scan.
    const mine = new Set(e.analyses.map((a) => a.id));
    const runners = tree.entries
      .filter((o) => o.id !== e.id && o.kind !== 'not_an_actor' && o.kind !== 'group_of_people' && (o.id === e.partOf || o.analyses.some((a) => mine.has(a.id))))
      .sort((a, b) => Number(b.id === e.partOf) - Number(a.id === e.partOf) || b.papers - a.papers || a.name.localeCompare(b.name))
      .slice(0, 10);
    body = askRemove ? (
      <RemovePerson name={e.name} busy={busy} onCancel={() => setAskRemove(false)}
                    onRemove={() => void submit(async () => {
                      await api.forgetPersona(e.id);
                      return { to: hubPath('review'), flash: { text: `${e.name} is removed from the list.`, note: 'This cannot be undone. If a paper names them again, the same rule leaves them out.' } };
                    }, '#review-remove')} />
    ) : (
      <form noValidate onSubmit={(ev: FormEvent<HTMLFormElement>) => {
        ev.preventDefault();
        const reason = chosen(ev.currentTarget);
        const runBy = chosen(ev.currentTarget, 'runBy');
        if (!reason) { need('Say what it is', '#review-choice'); return; }
        if (reason === 'named_person') { setAskRemove(true); return; }
        void submit(async () => {
          await api.notActor(e.id, reason, reason === 'programme' && runBy && runBy !== '__none' ? runBy : null);
          return {
            to: back,
            flash: {
              text: `${e.name} is kept as ${NOT_ACTOR_WORDS[reason]}, not as an actor.`,
              note: 'Later papers that name it will not profile it.',
              undo: { kind: 'actor-again', id: e.id, to: e.kind, partOf: e.partOf, kindOf: e.kindOf, reopen: e.status === 'proposed' },
            },
          };
        }, '#review-choice');
      }}>
        <Radios id="review-choice" name="choice" legend={`What is ${e.name}, if not an actor?`} legendSize="m"
                hint="It stays on the list so the next paper that names it is recognised, but it is never profiled. Anything that sits under it is let go."
                error={errors.find((x) => x.href === '#review-choice')?.text}
                items={(['programme', 'place', 'assessment', 'other', 'named_person'] as const).map((r) => ({ value: r, text: NOT_ACTOR_WORDS[r].replace(/^./, (c) => c.toUpperCase()) }))} />
        {runners.length ? (
          <Radios id="review-runby" name="runBy" legend="If it is a programme or scheme, who runs it?" legendSize="s"
                  hint="Leave this if it is not a programme, or if you do not know."
                  items={[...runners.map((r) => ({ value: r.id, text: pickLabel(r) })), { value: '__none', text: 'Not known' }]} />
        ) : null}
        <ButtonGroup>
          <Button type="submit" disabled={busy}>Save</Button>
          <Link className="govuk-link" to={back}>Cancel</Link>
        </ButtonGroup>
      </form>
    );
  } else if (decision === 'split') {
    const choices = splitChoices(entry);
    body = choices.length ? (
      <form noValidate onSubmit={(ev: FormEvent<HTMLFormElement>) => {
        ev.preventDefault();
        const wording = chosen(ev.currentTarget);
        if (!wording) { need('Choose the name that is a different actor', '#review-choice'); return; }
        void submit(async () => {
          const made = await api.splitWording(e.id, wording);
          return {
            to: back,
            flash: { text: `“${wording}” is now ${made.created ? 'an actor of its own' : `filed under ${made.name}`}, apart from ${e.name}.`, note: 'The next paper that uses those words will not be matched here.', undo: { kind: 'merge', keep: e.id, other: made.id } },
          };
        }, '#review-choice');
      }}>
        <Radios id="review-choice" name="choice" legend={`Which name filed under ${e.name} is a different actor?`} legendSize="m"
                hint="Every mention worded that way moves to an actor of that name, and later papers that use it are not matched here."
                error={errors[0]?.text}
                items={choices.map((w) => ({ value: w, text: w }))} />
        <ButtonGroup>
          <Button type="submit" disabled={busy}>Split it off</Button>
          <Link className="govuk-link" to={back}>Cancel</Link>
        </ButtonGroup>
      </form>
    ) : <p className="govuk-body">Nothing else is filed under {e.name}.</p>;
  } else if (decision === 'remove') {
    body = (
      <RemovePerson name={e.name} busy={busy} onCancel={() => navigate(back)}
                    onRemove={() => void submit(async () => {
                      await api.forgetPersona(e.id);
                      return { to: hubPath('review'), flash: { text: `${e.name} is removed from the list.`, note: 'This cannot be undone.' } };
                    }, '#review-remove')} />
    );
  }

  return (
    <div className="govuk-grid-row">
      <div className="govuk-grid-column-full">
        {errors.length ? <ErrorSummary errors={errors} /> : null}
        <span className="govuk-caption-l">{e.name}</span>
        <h1 className="govuk-heading-l">{askRemove ? titles.remove : title}</h1>
        {body}
      </div>
    </div>
  );
}

/**
 * A NAMED PRIVATE PERSON IS NOT KEPT, EVEN AS "NOT AN ACTOR". The About page
 * promises no profile of a named person and the server refuses `named_person`
 * as a reason; the row is removed instead. Said before it is done.
 */
function RemovePerson({ name, busy, onRemove, onCancel }: { name: string; busy: boolean; onRemove: () => void; onCancel: () => void }) {
  return (
    <>
      <p className="govuk-body">
        This service does not keep a record of a named private person, not even to say they are not an
        actor. If {name} is a person named in a paper — someone from a case study, say — the record is
        removed from the list instead.
      </p>
      <WarningText>This cannot be undone. Everything recorded about {name} here goes.</WarningText>
      <ButtonGroup>
        <Button id="review-remove" variant="warning" disabled={busy} onClick={onRemove}>Remove {name}</Button>
        <Button variant="secondary" disabled={busy} onClick={onCancel}>Go back</Button>
      </ButtonGroup>
    </>
  );
}
