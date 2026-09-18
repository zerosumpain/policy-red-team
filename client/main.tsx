import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router';
import { App } from './App';
import './styles/app.scss';

/**
 * GOV.UK's own template puts these two classes on the body as soon as script
 * runs, and several components are styled against them — a details element
 * without `js-enabled` keeps its native marker, and the accordion's show/hide-all
 * control is hidden without it. Setting them here is what makes the CSS we
 * compiled behave the way GOV.UK's examples do.
 */
document.body.classList.add('js-enabled', 'govuk-frontend-supported');

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </StrictMode>
);
