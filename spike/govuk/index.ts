// The stylesheet is imported from a script entry, which is how the React app
// will do it. Compiling a bare .scss as a rollup input produces no JS chunk and
// trips a Vite internal; that was a fault in the first version of this spike,
// not in govuk-frontend.
import './app.scss';

// GOV.UK Frontend's interactive components (accordion, tabs, error summary
// focus) are progressive enhancement over server-rendered markup. In React they
// are initialised per component rather than by a global initAll, so this only
// proves the JS entry is reachable and tree-shakeable.
import { Accordion } from 'govuk-frontend';
export { Accordion };
