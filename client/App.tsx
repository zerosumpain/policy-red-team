import { Suspense, lazy } from 'react';
import { Navigate, Route, Routes, useLocation, useParams, useSearchParams } from 'react-router';
import { returnLabel, returnTo } from './moves';
import { HUB } from './places';
import { Template } from './layout/Template';
import { Home } from './pages/Home';
import { ReaderGate } from './pages/ReaderGate';

/**
 * EVERY PAGE BUT THE LANDING ONE IS SPLIT OFF.
 *
 * Importing them all eagerly put the whole app in the entry chunk, and the
 * expensive passenger was not a page: `contracts.ts` imports zod for its eighty
 * schemas, the client imports that same module for plain `as const` vocabularies
 * — STAGES, ORIGINS, RELATIONS — and rollup cannot drop the schemas because they
 * sit at module scope beside them. Attributed from the shipped source map, that
 * is 91,380 bytes of the 558,912-byte bundle, 18 KB of it a JSON-Schema
 * GENERATOR whose only caller runs in the pipeline and never reaches a browser.
 *
 * Nothing on the landing path touches it: `Home` does not, and `client/api.ts`
 * imports the types with `import type`, which is erased. So splitting the routes
 * takes zod, the drill, the gallery and the whole report tree — roughly 190 KB —
 * off the first paint of `/`, and they load when a reader opens an assessment.
 *
 * The alternative is splitting `contracts.ts` itself, which would be better and
 * costs more: it is a verbatim upstream copy, and so are the two lib modules in
 * the client graph that import its values, so it is three declared divergences
 * on the file the whole pipeline's contract lives in. Worth proposing upstream
 * rather than only here.
 */
const New = lazy(() => import('./pages/New').then((m) => ({ default: m.New })));
const Assessment = lazy(() => import('./pages/Assessment').then((m) => ({ default: m.Assessment })));
const Drill = lazy(() => import('./pages/Drill').then((m) => ({ default: m.Drill })));
const Admin = lazy(() => import('./pages/Admin').then((m) => ({ default: m.Admin })));
/*
 * The setup journey, lazy like every other route here. It is a first-visit
 * surface: most loads of this application never touch it, and it should not be
 * in the bundle every reader downloads to look at a report.
 */
const SetupIndex = lazy(() => import('./pages/Setup').then((m) => ({ default: m.SetupIndex })));
const SetupService = lazy(() => import('./pages/Setup').then((m) => ({ default: m.SetupService })));
const SetupConnect = lazy(() => import('./pages/Setup').then((m) => ({ default: m.SetupConnect })));
const SetupTest = lazy(() => import('./pages/Setup').then((m) => ({ default: m.SetupTest })));
const SetupAccess = lazy(() => import('./pages/Setup').then((m) => ({ default: m.SetupAccess })));
const SetupSpend = lazy(() => import('./pages/Setup').then((m) => ({ default: m.SetupSpend })));
const SetupSearch = lazy(() => import('./pages/Setup').then((m) => ({ default: m.SetupSearch })));
const SetupEgress = lazy(() => import('./pages/Setup').then((m) => ({ default: m.SetupEgress })));
const Persona = lazy(() => import('./pages/Persona').then((m) => ({ default: m.Persona })));
const BodiesList = lazy(() => import('./pages/Bodies').then((m) => ({ default: m.BodiesList })));
const BodiesAcross = lazy(() => import('./pages/Bodies').then((m) => ({ default: m.BodiesAcross })));
const BodiesClashes = lazy(() => import('./pages/Bodies').then((m) => ({ default: m.BodiesClashes })));
const BodiesGroups = lazy(() => import('./pages/Bodies').then((m) => ({ default: m.BodiesGroups })));
const Guide = lazy(() => import('./pages/Guide').then((m) => ({ default: m.Guide })));
const GroundingIndex = lazy(() => import('./pages/Grounding').then((m) => ({ default: m.GroundingIndex })));
const GroundingPolicy = lazy(() => import('./pages/Grounding').then((m) => ({ default: m.GroundingPolicy })));
const PersonaRegister = lazy(() => import('./pages/PersonaIdentity').then((m) => ({ default: m.PersonaRegister })));
const PersonaMerge = lazy(() => import('./pages/PersonaIdentity').then((m) => ({ default: m.PersonaMerge })));
const PersonaMergeConfirm = lazy(() => import('./pages/PersonaIdentity').then((m) => ({ default: m.PersonaMergeConfirm })));
const PersonaSplit = lazy(() => import('./pages/PersonaIdentity').then((m) => ({ default: m.PersonaSplit })));
const Gallery = lazy(() => import('./pages/Gallery').then((m) => ({ default: m.Gallery })));
const Accessibility = lazy(() => import('./pages/Accessibility').then((m) => ({ default: m.Accessibility })));
const About = lazy(() => import('./pages/About').then((m) => ({ default: m.About })));

export function App() {
  return (
    /*
     * THE FALLBACK IS A HEADING, NOT A SPINNER — the same argument the drill's own
     * loading state makes: a page with no `h1` while it loads is a page a screen
     * reader cannot place, and "next heading" finds nothing.
     */
    <Suspense fallback={(
      <Template transient>
        <h1 className="govuk-heading-l">Loading</h1>
        <p className="govuk-body">Fetching this page.</p>
      </Template>
    )}>
    {/* The reader password's own door — see client/pages/ReaderGate.tsx. */}
    <ReaderGate>
    <Routes>
      <Route path="/" element={<Template wide><Home /></Template>} />
      <Route path="/new" element={<Template backLink={{ href: '/' }}><New /></Template>} />
      {/*
        ONE QUESTION PER PAGE (phase 21). The six views and every section of
        them are routes under one splat, and that is a decision about MOUNTING
        rather than about URLs: a route element per view would unmount the
        assessment on every page change and refetch a payload measured in
        megabytes to draw the next page of it. Under one element, moving from
        Threats to Causes is a re-render of a component that already holds the
        assessment. `Assessment` reads the splat — see `client/moves.ts` for
        the table and why the slugs are not the move ids.

        THE ITEM ROUTES RANK ABOVE IT because a static segment outranks a
        splat, so `/items/…` never reaches the view parser.
      */}
      <Route path="/assessments/:id/*" element={<Template wide backLink={{ href: '/' }}><Assessment /></Template>} />
      {/* The drill is its own URL, not a layer over the one above. That is what
          makes it shareable, openable in a tab, and reversible with the browser's
          own back button — see client/pages/Drill.tsx for why a drawer was not
          the answer here. An item, in the reader's word, since phase 21; the
          optional part is one of its pages. */}
      <Route path="/assessments/:id/items/:artefactId" element={<DrillRoute />} />
      <Route path="/assessments/:id/items/:artefactId/:part" element={<DrillRoute />} />
      {/* The pre-phase-21 address of an item. It is in bookmarks, browser
          history and anything pasted elsewhere, so it answers rather than 404s. */}
      <Route path="/assessments/:id/artefacts/:artefactId" element={<ItemRedirect />} />
      {/* The only page behind a password. It gates itself: the route is always
          here, and what it shows depends on the cookie. */}
      <Route path="/admin" element={<Template backLink={{ href: '/' }}><Admin /></Template>} />
      {/* The guided route through the same endpoints the panel uses. One thing
          per page, a task list with statuses, and a real call at the end —
          because "configured" and "reachable" are different claims. */}
      <Route path="/setup" element={<Template backLink={{ href: '/' }}><SetupIndex /></Template>} />
      <Route path="/setup/service" element={<Template backLink={{ href: '/setup' }}><SetupService /></Template>} />
      <Route path="/setup/service/:id" element={<Template backLink={{ href: '/setup' }}><SetupConnect /></Template>} />
      <Route path="/setup/test" element={<Template backLink={{ href: '/setup' }}><SetupTest /></Template>} />
      <Route path="/setup/access" element={<Template backLink={{ href: '/setup' }}><SetupAccess /></Template>} />
      <Route path="/setup/spend" element={<Template backLink={{ href: '/setup' }}><SetupSpend /></Template>} />
      <Route path="/setup/search" element={<Template backLink={{ href: '/setup' }}><SetupSearch /></Template>} />
      <Route path="/setup/egress" element={<Template backLink={{ href: '/setup' }}><SetupEgress /></Template>} />
      {/*
        BODIES ACROSS POLICIES (phase 24): one hub, a page per question, and a
        page per body. See `client/places.ts` for why the address is `/bodies`
        and `client/pages/Bodies.tsx` for what each view answers. The static
        segments outrank `:id`, and a body's id is a uuid, so they cannot meet.
      */}
      <Route path="/bodies" element={<Template wide><BodiesList /></Template>} />
      <Route path="/bodies/across" element={<Template wide><BodiesAcross /></Template>} />
      <Route path="/bodies/clashes" element={<Template wide><BodiesClashes /></Template>} />
      <Route path="/bodies/groups" element={<Template wide><BodiesGroups /></Template>} />
      <Route path="/bodies/:id" element={<Template wide backLink={{ href: HUB, text: 'Back to bodies across policies' }}><Persona /></Template>} />
      {/* Phase 19: a reader's rulings on who a body is. Routes, never dialogs. */}
      <Route path="/bodies/:id/register" element={<Template backLink={{ href: HUB, text: 'Back to bodies across policies' }}><PersonaRegister /></Template>} />
      <Route path="/bodies/:id/merge" element={<Template backLink={{ href: HUB, text: 'Back to bodies across policies' }}><PersonaMerge /></Template>} />
      <Route path="/bodies/:id/merge/:other" element={<Template backLink={{ href: HUB, text: 'Back to bodies across policies' }}><PersonaMergeConfirm /></Template>} />
      <Route path="/bodies/:id/sightings/:observationId" element={<Template backLink={{ href: HUB, text: 'Back to bodies across policies' }}><PersonaSplit /></Template>} />
      {/* THE OLD ADDRESSES ANSWER. `/personas` was the library and every page
          under it a body or a ruling on one; each has exactly one new home
          with the same id, so the redirect is a prefix swap. */}
      <Route path="/personas" element={<Navigate replace to={HUB} />} />
      <Route path="/personas/*" element={<PersonasRedirect />} />
      <Route path="/guide" element={<Template backLink={{ href: '/' }}><Guide /></Template>} />
      {/* Phase 25: what each policy is judged against, reused by every run of it. */}
      <Route path="/grounding" element={<Template><GroundingIndex /></Template>} />
      <Route path="/grounding/:id" element={<Template backLink={{ href: '/grounding', text: 'Back to the grounding library' }}><GroundingPolicy /></Template>} />
      {/* The design system, kept as a route: it is what `npm run a11y` scans and
          the cheapest place to argue about a component before it is spread over
          five pages. */}
      <Route path="/design" element={<Template wide><Gallery /></Template>} />
      <Route path="/accessibility" element={<Template backLink={{ href: '/' }}><Accessibility /></Template>} />
      <Route path="/about" element={<Template backLink={{ href: '/' }}><About /></Template>} />
    </Routes>
    </ReaderGate>
    </Suspense>
  );
}

/**
 * The drill, wrapped so its back link can name the assessment it belongs to.
 *
 * `Template` takes a plain href and the route parameters are only readable
 * inside the router, so the alternative is a relative `../..` that silently
 * means the wrong thing the day the route gains a segment.
 */
function DrillRoute() {
  const { id = '' } = useParams();
  const [params] = useSearchParams();
  /*
   * THE BACK LINK GOES BACK TO WHERE THE READER WAS, NOT TO THE SUMMARY.
   *
   * The link INTO the item carries the reader's position as an opaque
   * `?from=`. Without it the browser's own Back preserved the position while
   * the one visible affordance on the page silently reset it and cleared the
   * selection banner.
   *
   * SINCE PHASE 21 THE POSITION IS A PAGE: `from` is the path and query the
   * reader left — `/assessments/:id/threats/weights?sel=band:severe` — rather
   * than the `move=…&sel=…` query of a tabbed report. `returnTo` reads both
   * shapes and follows nothing outside this assessment; the view it lands on
   * resolves the selection against its own artefacts, so a stale `sel`
   * degrades to the plain page rather than a label that lies.
   *
   * The link NAMES the view it returns to, which is the half a generic "Back
   * to the assessment" could not say. Only the view: naming the selection as
   * well would mean resolving an artefact id, and this wrapper holds no
   * artefacts — the drill does, and says the whole sentence at the foot of the
   * page where the reader actually finishes reading.
   */
  const from = params.get('from') ?? '';
  return (
    /* WIDE, like the report it is reached from. Following a play out of a
       1200px page into a 960px one is a 240px jolt on a route whose whole job
       is to be the same record at more depth. */
    <Template wide backLink={{ href: returnTo(id, from), text: returnLabel(id, from) }}>
      <Drill />
    </Template>
  );
}

/** `/artefacts/:id` → `/items/:id`, keeping `?from=` and anything else it carried. */
function ItemRedirect() {
  const { id = '', artefactId = '' } = useParams();
  const { search, hash } = useLocation();
  return <Navigate replace to={`/assessments/${id}/items/${encodeURIComponent(artefactId)}${search}${hash}`} />;
}

/** `/personas/:id/…` → `/bodies/:id/…`, keeping the query and the hash. */
function PersonasRedirect() {
  const { '*': rest = '' } = useParams();
  const { search, hash } = useLocation();
  return <Navigate replace to={`${HUB}/${rest}${search}${hash}`} />;
}
