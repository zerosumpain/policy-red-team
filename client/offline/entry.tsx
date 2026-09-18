/**
 * The pack's only script.
 *
 * It reads the assessment out of the JSON island the HTML carries rather than
 * fetching it, because a `file://` page has an opaque origin and cannot fetch its
 * own siblings — not even one in the same folder. That is the constraint the
 * whole pack is shaped around, and it is why the build below is an IIFE rather
 * than a module: a `<script type="module">` is subject to CORS even from a file,
 * so a double-clicked pack would execute nothing at all.
 */
import { createRoot } from 'react-dom/client';
import { OfflineApp } from './OfflineApp';
import { PAYLOAD_ELEMENT_ID, ROOT_ELEMENT_ID } from '$lib/policy-analysis/offline/html';
import type { OfflinePayload } from '$lib/policy-analysis/offline/payload';
import '../styles/app.scss';

function fail(message: string): void {
  const root = document.getElementById(ROOT_ELEMENT_ID) ?? document.body;
  root.textContent = message;
  root.setAttribute('style', 'font-family:system-ui,sans-serif;padding:2rem;max-width:60ch;line-height:1.6');
}

function start(): void {
  document.body.classList.add('js-enabled', 'govuk-frontend-supported');
  const target = document.getElementById(ROOT_ELEMENT_ID);
  const island = document.getElementById(PAYLOAD_ELEMENT_ID);
  if (!target || !island?.textContent) {
    fail('This pack is missing its assessment data and cannot be displayed. The Word and markdown copies in the same folder are unaffected.');
    return;
  }
  let payload: OfflinePayload;
  try {
    payload = JSON.parse(island.textContent) as OfflinePayload;
  } catch {
    fail('This pack’s assessment data could not be read — the file may have been truncated in transit. The Word and markdown copies in the same folder are unaffected.');
    return;
  }
  createRoot(target).render(<OfflineApp payload={payload} />);
}

// The script tag sits after the root element and after the island, so the DOM it
// needs already exists. `DOMContentLoaded` is still checked because a reader who
// saves the page from their browser can end up with the script moved into <head>.
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
else start();
