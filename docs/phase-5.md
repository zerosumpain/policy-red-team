# Phase 5 — exports

18 September 2026. The gate `docs/plan.md` set: *the offline pack opens from
`file://` with networking disabled.* Met, and checked the way a reader opens it
rather than by proxy.

## Result

| Check | Command | Result |
|---|---|---|
| The pack, offline | `npm run offline` | **opens from `file://` with every request aborted**, renders the report, nothing leaves the page |
| Word and markdown | same command | real Word heading styles, no literal `**`, 39,849 characters of markdown |
| Unit | `npm test` | **421 passed, 0 skipped** — the pack test's precondition is now met, so the whole suite runs |
| Everything else | integration, a11y, walk | unchanged and green |

Three formats, and they are not the same thing: the Word file is what somebody
marks up, the markdown is the same text for pasting into their own template, and
the pack is the report itself in a folder that needs no network.

## The pack

`npm run build:offline` compiles the report into one IIFE and one stylesheet;
the export endpoint reads those two files and interpolates them into an HTML
skeleton. Producing a pack at request time is string concatenation — no headless
browser, no bundler in the request path, the same bytes every time.

**IIFE, not ESM.** A `<script type="module">` is subject to CORS even from a
`file://` page, so a double-clicked pack would execute nothing at all. That one
line is the reason the second build exists.

`scripts/offline-check.mjs` is the gate, and it is deliberately not a unit test.
`pack.test.ts` asserts rules about the bytes — no `<link>`, no `url(/…)`,
everything inline — which are proxies. This runs a real assessment through the
API, downloads the zip, unpacks it, and opens `index.html` in Chromium **with
every non-`file://` request aborted**. A pack that quietly depended on a CDN
would render in a test that merely opened it, and fail in the one room it exists
for.

## Four faults, three found by tests written before the code worked

**React's development build was going into the pack.** Vite's `lib` mode does not
substitute `NODE_ENV` the way an app build does, so the pack carried half a
megabyte of warning strings — several containing the literal text
`<link rel="stylesheet"`, which is what tripped the "asks nothing of the network"
assertion. The bundle went from 716 kB to 328 kB once it was fixed, and the real
fault was shipping a development build to a reader at all.

**A dynamic import pulled in a network fetcher.** `Accordion` used
`void import('govuk-frontend')`, which made Vite emit its `__vitePreload` helper —
whose entire job is to build a `<link rel="stylesheet">` and fetch it. Fine on the
web, fatal in a pack. A static import removes the helper and costs a few kilobytes.

**The stylesheet pointed outside the pack.** Three `url(/assets/govuk/images/govuk-crest.svg)`
references, on the GOV.UK header and footer crest rules this service never
renders. On the web they are inert; from `file://` a root-relative URL resolves
against the filesystem root, so a reader with no network gets three failed
requests for a file that was never theirs to have. The offline build now rewrites
any `url(/…)` to an empty data URI — rewritten rather than deleted, because the
declarations sit inside shorthand properties where removing the value breaks the
rule.

**The pack offered to download itself.** "Take it away" rendered inside the
offline copy, with three links pointing at a server that is not there. Found by
*looking at a real pack*, not by any test — which is the argument for looking at
real output even when everything is green.

## Three divergences the pack needed

| File | Change | Why |
|---|---|---|
| `server/bundle.ts` | `FACES` is empty | Upstream embeds Archivo Black, DM Sans and JetBrains Mono because its headlines fall back to Impact without them. This build sets text in Helvetica Neue and Arial, which every reader has, and may not ship GDS Transport. **The pack carries no font bytes.** |
| `offline/html.ts` | GOV.UK shell classes on `<html>` and `<body>`; generator names this build | Version 6 emits no bare `body` rule (phase 0), so without the classes the pack renders unstyled |
| `offline/pack.test.ts` | asserts **no** font travels, not that three do | the opposite assertion, and a licensing guarantee as much as a rendering one |

## Decision log

| Fork | Options | Chosen | Why | Reversible? |
|---|---|---|---|---|
| The offline renderer | a second, simpler renderer; reuse `<Report>` | **reuse** | the report already takes data and nothing else; two renderers is two things to keep in step, and the only thing worse than a hard-to-read report is two that disagree | yes |
| The pack's fonts | embed the design's faces; embed none | **none** | system fonts need no bytes, and GDS Transport may not be shipped at all | no |
| The crest URLs | delete the declarations; rewrite them | **rewrite to an empty data URI** | they sit inside shorthand properties where deleting the value breaks the rule | yes |
| The gate | trust `pack.test.ts`; open it in a browser with the network cut | **both** | the unit test asserts proxies; only a blocked-network browser proves the claim | no |
| Download links offline | leave them; suppress them | **suppress** | three dead links offering the reader the file they are already reading | yes |
| `assessmentDocument`'s `Response` | rewrite it for `node:http`; bridge once | **bridge** | both exports are verbatim copies carrying content-disposition headers that took care to get right | yes |

## What is left

Phase 6 is packaging — `npm install && npm start` on a clean machine, a README, a
licence. Still outstanding from phase 4, and unchanged: the drill, the 3D graph
and its table, the stress lab, share UI, persona detail, and material/restate.
