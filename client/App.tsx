import { Route, Routes } from 'react-router';
import { Template } from './layout/Template';
import { Home } from './pages/Home';
import { New } from './pages/New';
import { Assessment } from './pages/Assessment';
import { Personas } from './pages/Personas';
import { Gallery } from './pages/Gallery';
import { Accessibility } from './pages/Accessibility';
import { About } from './pages/About';

export function App() {
  return (
    <Routes>
      <Route path="/" element={<Template wide><Home /></Template>} />
      <Route path="/new" element={<Template backLink={{ href: '/' }}><New /></Template>} />
      <Route path="/assessments/:id" element={<Template wide backLink={{ href: '/' }}><Assessment /></Template>} />
      <Route path="/personas" element={<Template backLink={{ href: '/' }}><Personas /></Template>} />
      {/* The design system, kept as a route: it is what `npm run a11y` scans and
          the cheapest place to argue about a component before it is spread over
          five pages. */}
      <Route path="/design" element={<Template wide><Gallery /></Template>} />
      <Route path="/accessibility" element={<Template backLink={{ href: '/' }}><Accessibility /></Template>} />
      <Route path="/about" element={<Template backLink={{ href: '/' }}><About /></Template>} />
    </Routes>
  );
}
