import { Route, Routes, useParams } from 'react-router';
import { Template } from './layout/Template';
import { Home } from './pages/Home';
import { New } from './pages/New';
import { Assessment } from './pages/Assessment';
import { Drill } from './pages/Drill';
import { Personas } from './pages/Personas';
import { Persona } from './pages/Persona';
import { Gallery } from './pages/Gallery';
import { Accessibility } from './pages/Accessibility';
import { About } from './pages/About';

export function App() {
  return (
    <Routes>
      <Route path="/" element={<Template wide><Home /></Template>} />
      <Route path="/new" element={<Template backLink={{ href: '/' }}><New /></Template>} />
      <Route path="/assessments/:id" element={<Template wide backLink={{ href: '/' }}><Assessment /></Template>} />
      {/* The drill is its own URL, not a layer over the one above. That is what
          makes it shareable, openable in a tab, and reversible with the browser's
          own back button — see client/pages/Drill.tsx for why a drawer was not
          the answer here. */}
      <Route path="/assessments/:id/artefacts/:artefactId" element={<DrillRoute />} />
      <Route path="/personas" element={<Template wide backLink={{ href: '/' }}><Personas /></Template>} />
      <Route path="/personas/:id" element={<Template wide backLink={{ href: '/personas', text: 'Back to the library' }}><Persona /></Template>} />
      {/* The design system, kept as a route: it is what `npm run a11y` scans and
          the cheapest place to argue about a component before it is spread over
          five pages. */}
      <Route path="/design" element={<Template wide><Gallery /></Template>} />
      <Route path="/accessibility" element={<Template backLink={{ href: '/' }}><Accessibility /></Template>} />
      <Route path="/about" element={<Template backLink={{ href: '/' }}><About /></Template>} />
    </Routes>
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
  return (
    <Template backLink={{ href: `/assessments/${id}`, text: 'Back to the assessment' }}>
      <Drill />
    </Template>
  );
}
