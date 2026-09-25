import { Suspense, lazy } from 'react';
import { Route, Routes, useParams, useSearchParams } from 'react-router';
import { MOVES } from './moves';
import { Template } from './layout/Template';
import { Home } from './pages/Home';

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
const Personas = lazy(() => import('./pages/Personas').then((m) => ({ default: m.Personas })));
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
    <Routes>
      <Route path="/" element={<Template wide><Home /></Template>} />
      <Route path="/new" element={<Template backLink={{ href: '/' }}><New /></Template>} />
      <Route path="/assessments/:id" element={<Template wide backLink={{ href: '/' }}><Assessment /></Template>} />
      {/* The drill is its own URL, not a layer over the one above. That is what
          makes it shareable, openable in a tab, and reversible with the browser's
          own back button — see client/pages/Drill.tsx for why a drawer was not
          the answer here. */}
      <Route path="/assessments/:id/artefacts/:artefactId" element={<DrillRoute />} />
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
      <Route path="/personas" element={<Template wide backLink={{ href: '/' }}><Personas /></Template>} />
      <Route path="/personas/:id" element={<Template wide backLink={{ href: '/personas', text: 'Back to the library' }}><Persona /></Template>} />
      {/* Phase 19: a reader's rulings on who a body is. Routes, never dialogs. */}
      <Route path="/personas/:id/register" element={<Template backLink={{ href: '/personas', text: 'Back to the library' }}><PersonaRegister /></Template>} />
      <Route path="/personas/:id/merge" element={<Template backLink={{ href: '/personas', text: 'Back to the library' }}><PersonaMerge /></Template>} />
      <Route path="/personas/:id/merge/:other" element={<Template backLink={{ href: '/personas', text: 'Back to the library' }}><PersonaMergeConfirm /></Template>} />
      <Route path="/personas/:id/sightings/:observationId" element={<Template backLink={{ href: '/personas', text: 'Back to the library' }}><PersonaSplit /></Template>} />
      {/* The design system, kept as a route: it is what `npm run a11y` scans and
          the cheapest place to argue about a component before it is spread over
          five pages. */}
      <Route path="/design" element={<Template wide><Gallery /></Template>} />
      <Route path="/accessibility" element={<Template backLink={{ href: '/' }}><Accessibility /></Template>} />
      <Route path="/about" element={<Template backLink={{ href: '/' }}><About /></Template>} />
    </Routes>
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
   * THE BACK LINK GOES BACK TO WHERE THE READER WAS, NOT TO MOVE 1.
   *
   * `Report` keeps the reading position in `?move=…&sel=…`, and the link INTO
   * the drill now carries it as an opaque `?from=`. Without this the browser's
   * own Back preserved the position — the `replaceState` entry is still in the
   * history — while the one visible affordance on the page silently reset the
   * move and cleared the selection banner.
   *
   * IT IS PUT BACK UNPARSED. Whatever `Report` wrote is what `Report` reads: it
   * validates the move against `MOVE_ORDER` and resolves the selection id
   * against the assessment's own artefacts, returning null rather than a label
   * that lies. So a stale or hand-edited `from` degrades to the plain report,
   * and this route needs to understand none of it.
   */
  const from = params.get('from') ?? '';
  const back = from ? `/assessments/${id}?${from}` : `/assessments/${id}`;
  /*
   * The link NAMES the move it returns to, which is the half a generic "Back
   * to the assessment" could not say. Only the move: naming the selection as
   * well would mean resolving an artefact id, and this wrapper holds no
   * artefacts — the drill does, and says the whole sentence at the foot of the
   * page where the reader actually finishes reading.
   */
  const move = MOVES.find((entry) => entry.id === new URLSearchParams(from).get('move'));
  const text = move ? `Back to ${move.step} · ${move.label}` : 'Back to the assessment';
  return (
    /* WIDE, like the report it is reached from. Following a play out of a
       1200px page into a 960px one is a 240px jolt on a route whose whole job
       is to be the same record at more depth. */
    <Template wide backLink={{ href: back, text }}>
      <Drill />
    </Template>
  );
}
