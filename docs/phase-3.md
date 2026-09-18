# Phase 3 — the design system

Completed 18 September 2026. The gate `docs/plan.md` set: a page template, a
header and footer without the crown, the component set, and the accessibility
statement, with axe-core clean across a static page set. All met.

## Result

| Check | Command | Result |
|---|---|---|
| Accessibility | `npm run a11y` | **3 routes, 0 serious or critical violations** — and none at any level |
| Licensing | same command | no font file, no crown, no royal arms, no "GDS Transport" in the CSS |
| Typecheck | `npm run typecheck` | 0 errors, now covering `client/**` and `.tsx` |
| Everything else | unit, integration, headless run | unchanged and green |

`npm run a11y` builds the client, serves it, and drives every route in Chromium.
It is two gates in one, and the second is the one that would otherwise rot: the
promise that this service ships none of the assets it is not licensed to use is
checked **against the built files**, not against a Sass setting nobody re-reads.

## What is here

```
client/
  index.html            .govuk-template on <html>, .govuk-template__body on <body>
  main.tsx              adds js-enabled and govuk-frontend-supported, as GOV.UK's own template does
  styles/app.scss       GOV.UK Frontend configured for a service that is not on GOV.UK
  layout/Template.tsx   skip link, generic header, phase banner, main, footer
  govuk/                the component set
  pages/                the gallery, the accessibility statement, about
scripts/a11y.mjs        the gate
scripts/shot.mjs        screenshots at desktop and mobile widths
```

The component set is Tag, Button, ButtonGroup, TaskList, SummaryList, Table,
ErrorSummary, NotificationBanner, Panel, PhaseBanner, InsetText, WarningText,
Details, Accordion, and the form controls — Input, Textarea, Select, FileUpload,
Radios. Each is a thin wrapper over GOV.UK's own markup, read from the framework's
nunjucks templates rather than approximated from the documentation.

Three of them carry behaviour that is the whole reason they are components:

- **TaskList** generates the `aria-describedby` that ties a task's name to its
  hint and status. Without it a screen reader announces a list of links and reads
  the states as loose text nearby — which is the exact failure the pattern exists
  to prevent.
- **ErrorSummary** takes focus when it appears. A summary that does not is a
  message a screen-reader user never hears.
- **The form controls** wire label, hint and error into one description from an
  `id`. A field that looks right and reads as an unlabelled box is the most common
  accessibility failure in a form, and making it impossible is worth a component.

## The gallery is the deliverable

`client/pages/Gallery.tsx` shows every component carrying the content it will
actually carry: the eighteen stages as a task list, the report as a summary list,
the exploitation playbook as a table wider than the page. That is deliberate. An
accessibility check over lorem ipsum passes happily and tells you nothing about a
status column with a long label in it, and a design argument is cheaper to have on
one page than across ten.

It also settled one: **"With gaps", not "Completed with gaps"**. The longer phrase
wrapped onto two lines at every width, which reads as something wrong with the row
rather than a description of it. GOV.UK's own statuses are two words. The full
meaning moved to the hint, where there is room for it.

## The three things the design brief actually required

**No crown, no royal arms, no GDS Transport.** GOV.UK Frontend 6 has a *generic
header* added for precisely this case — a service in the style of GOV.UK that is
not on GOV.UK — so the header is that, not a hand-rolled one. The footer keeps
GOV.UK's layout and drops the emblems. The typeface falls back to the stack GOV.UK
itself specifies off GOV.UK. All three are asserted by `a11y.mjs`.

**Hover became click.** The site version reveals detail on pointer hover
(`PeekCard`, 400 lines of it). Content that appears on hover and cannot be reached
from a keyboard is not available to everyone, so every one of those becomes a
native `<details>` that opens and stays open. This is written down in the
accessibility statement rather than left as an implementation detail, because it
is a difference a reader of both versions would otherwise think was a bug.

**Diagrams will ship with a table.** Stated in the accessibility statement now so
phase 4 is committed to it: the relationship map and the exposure plot each get
the same data as a table, and neither is the "accessible alternative" to the other.

## Three faults found by running the gate

**Content outside landmarks.** axe reported `region` on all three routes — the
phase banner and the back link sat loose between `<header>` and `<main>`, owned by
nothing. The banner moved inside the header; the back link is wrapped in a `<nav>`,
which is what it is. Both were "moderate", which the gate only prints — and a
printed warning is one nobody fixes, so they were fixed.

**The typecheck was not checking the client.** `tsconfig.json` included
`src/**/*.ts` and nothing else, so every `.tsx` file written this phase reported
clean because none of them were being read. Widening it surfaced three genuine
errors immediately, including `scripts/migrate.mjs` having no types for the two
TypeScript files that import it.

**`govuk-frontend` ships no types at all** — no `.d.ts` anywhere in `dist`, and its
package exports name only `.scss` and `.mjs`. Only the components with real
behaviour are declared, and only the shape this app uses.

## Decision log

| Fork | Options | Chosen | Why | Reversible? |
|---|---|---|---|---|
| React GOV.UK components | `govuk-react-jsx`; hand-write over the CSS classes | **hand-write** | the community package lags v6, and these wrappers are thin; local-plan-navigator writes the markup by hand for the same reason | yes |
| Where the markup comes from | the published documentation; the framework's own nunjucks templates | **the templates** | the documentation omits the `aria-describedby` wiring that makes the task list work | n/a |
| The header | hand-roll one without the crown; GOV.UK Frontend 6's generic header | **generic header** | it exists for exactly this case; a hand-rolled one is a thing to keep in step | yes |
| The axe target | a set of static fixture pages; a gallery with real content | **gallery** | a check over placeholder text passes and proves nothing | yes |
| axe severity gate | fail on everything; fail on serious/critical and print the rest | **fail on serious/critical, print the rest** — then fix the rest anyway | keeps the gate meaningful while nothing is quietly tolerated | yes |
| Licensing check | trust the Sass settings; assert against built output | **assert** | it is a promise about what ships, and a setting can be changed without anyone noticing | no |
| Long status labels | widen the column; shorten the label | **shorten** | a status column is narrow by design and GOV.UK's own statuses are two words | yes |

## What phase 4 inherits

- A shell, a component set and a gate, so every product page is content and
  routing rather than markup and CSS.
- Two commitments already written into the accessibility statement: click rather
  than hover, and a table beside every diagram.
- `scripts/shot.mjs`, so a design change can be looked at without a dev server.
- Still open from phase 1: the model picker is inert until its catalogue is
  re-pointed at OpenRouter.
