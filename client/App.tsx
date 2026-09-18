import { Route, Routes } from 'react-router';
import { Template } from './layout/Template';
import { Gallery } from './pages/Gallery';
import { Accessibility } from './pages/Accessibility';
import { About } from './pages/About';

/**
 * Phase 3 routes only: the design system, and the two pages a GOV.UK-styled
 * service owes its reader. The product surfaces — submit, history, run, report —
 * arrive in phase 4 and hang off this same shell.
 */
export function App() {
  return (
    <Routes>
      <Route path="/" element={<Template wide><Gallery /></Template>} />
      <Route path="/accessibility" element={<Template backLink={{ href: '/' }}><Accessibility /></Template>} />
      <Route path="/about" element={<Template backLink={{ href: '/' }}><About /></Template>} />
    </Routes>
  );
}
