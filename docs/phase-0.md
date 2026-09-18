# Phase 0 — spike results

Run 18 September 2026 on homeserv. Three spikes, all passing. Reproduce with
`npm run spike`. What follows is what they taught, including four things the plan
did not anticipate.

## Result

| Spike | Question | Result |
|---|---|---|
| A | Does PGlite carry the policy schema as written? | **pass** — all eleven migrations apply, eleven policy tables, every Postgres feature the store layer uses |
| B | Does GOV.UK Frontend 6 build under Vite without the licensed assets? | **pass** — 132 kB of CSS, no GDS Transport, no royal arms, no font files |
| C | Does drizzle drive PGlite, not just psql? | **pass** — every risky call-site pattern in `store.ts` and `worker.ts` replayed |

The database assumption the whole plan rests on is now verified rather than
assumed. Nothing found here changes the plan's shape.

## A — PGlite

`@electric-sql/pglite` 0.5.8, **PostgreSQL 18.3** compiled to wasm32. Worth noting
that production Strange Ramblings runs PostgreSQL 16, so the standalone build runs
two major versions ahead of the fork it came from. Nothing in this schema is
affected, but a future migration copied across the fork could be.

Verified working: `gen_random_uuid()` and `gen_random_uuid()::text`, `::uuid`
casts in a `where`, the `jsonb ->>` operator, `DESC NULLS LAST`, `hashtext()`,
`pg_advisory_xact_lock` acquiring and releasing at commit, and `SELECT … FOR UPDATE`.

**On the advisory locks.** They work, but understand what that means here. PGlite
is a single connection, so two transactions cannot contend and the locks in
`store.ts` and `personas.ts` are satisfied vacuously. They were protecting against
a second web process; this build has one. Keeping them costs nothing, keeps the
copied code verbatim, and leaves the door open if the tool ever grows a second
writer. The spike asserts the lock is *released* at commit, because a lock that
silently stayed held would deadlock the next stage in a single-connection database
rather than merely serialise it.

### Four things the plan did not anticipate

**1. Migration order is not filename order.** The two 2026-09-09 files sort the
wrong way round: "depth" precedes "policy" alphabetically, but
`2026-09-09-policy-analysis-depth.sql` alters tables that
`2026-09-09-policy-analysis.sql` creates. A sorted `readdir` fails on the first
file. Order now lives in `migrations/order.txt` and the runner refuses to start if
that file and the directory disagree.

**2. There is no migration runner in the source repository.** Its migrations are
applied by hand — `AGENTS.md` says "Policy migrations are explicit SQL". So
`scripts/migrate.mjs` is new code, with a `_migrations` ledger so "already applied"
is distinguishable from "silently did nothing".

**3. Transaction handling is mixed.** Two of the eleven files open with `BEGIN;`
and close with `COMMIT;`; the other nine are bare statements. Wrapping a file that
already wraps itself commits early and warns. The runner inspects each file and
wraps only the bare ones.

**4. The migrations depend on the site's queue table.** Two foreign keys point at
`public.workflow_runs`, and `store.ts:28` inserts a row into `workflows`. Both are
owned by the workflow engine on the site and neither exists here. Rather than
patch the copied SQL, `migrations/0000-local-queue.sql` creates local versions
carrying only what the policy pipeline touches — which keeps `store.ts`,
`worker.ts` and `census.ts` verbatim copies, the entire reason PGlite was chosen.

The claim and lease columns are kept even though one worker runs in one process:
the copied cancel, purge and progress paths read `claimed_by`, `claimed_at`,
`lease_expires_at` and `heartbeat_at`, and four nullable columns are cheaper than
editing a verbatim copy. `healing_history` and `paused_at_node_id` are dropped —
they belong to the engine's self-repair and pause features, and nothing in the
pipeline reads them.

## B — GOV.UK Frontend

`govuk-frontend` 6.5.1 under Vite 8.3.0. Compiles to 132 kB of CSS with the
settings Local Plan Navigator already uses in production.

**Licensing is clean and asserted, not eyeballed.** `$govuk-include-default-font-face: false`
means no GDS Transport `@font-face` is emitted and the family falls back to
`"Helvetica Neue", arial, sans-serif` — the stack GOV.UK itself uses off GOV.UK.
The build ships two files, a stylesheet and a script: no font files, no images, no
royal arms. The spike asserts each of those, because a build that quietly shipped
GDS Transport would be a licensing problem rather than a styling one.

The stylesheet still contains three `url()` references to `govuk-crest.svg`, on
the GOV.UK header and footer rules. Those classes are not used by a service off
GOV.UK, the image is never shipped, and Vite prints a warning saying exactly that.
The warning is correct and expected.

### Two things the plan did not anticipate

**1. Vite 8 refuses to build GOV.UK Frontend out of the box.** Vite 8 minifies CSS
with LightningCSS by default, and LightningCSS rejects
`@media (min-width: 0\0)` — an Internet Explorer hack the framework still carries —
as invalid CSS. The build dies. `css: { lightningcss: { errorRecovery: true } }`
strips those rules instead, which is what we want: they are dead code for every
browser this service supports. Local Plan Navigator never hits this because it
compiles with the `sass` CLI and no minifier.

**2. The page shell is class-scoped, and this constrains the React app.** Version 6
emits no bare `body` rule at all. The shell is `.govuk-template` on `<html>` and
`.govuk-template__body` on `<body>`. The React document must carry both classes or
the page renders on the wrong background with the wrong scroll behaviour — so the
app cannot simply mount into a `<div id="root">` on an unstyled document. This is a
phase 3 requirement, found in phase 0.

Related, and a trap for anyone verifying by grep: `$govuk-global-styles: true` does
*not* emit bare `a { }` and `p { }` rules. The mixin uses `@extend`, so the
elements join the class selector lists — `a,.govuk-link{…}` and
`p,.govuk-body,.govuk-body-m{…}`. Grepping for a bare selector finds nothing and
means nothing. Two assertions in the first version of this spike failed for exactly
that reason; the build was right and the spike was wrong.

Confirmed present for the surfaces the plan names: `govuk-task-list` for the
eighteen-stage progress view, `govuk-summary-list` and `govuk-table` for the
report, `govuk-error-summary` for submission, `govuk-accordion` for the stage
guide, `govuk-tag` for stage status. The Sass API — `govuk-font`, `govuk-colour`,
`govuk-spacing` — is reachable from our own rules, which the React components will
need for anything GOV.UK has no class for.

## C — drizzle over PGlite

PGlite answering psql is not the same as drizzle driving PGlite, and `store.ts` is
drizzle code. Every risky call-site pattern was replayed against the real migrated
schema: `onConflictDoNothing`, a transaction wrapping `tx.execute(sql…)` for the
advisory lock, `.for('update')`, a raw `sql` fragment on a column, an
`orderBy(sql\`… DESC NULLS LAST\`)`, an `inArray` update, and a deliberately failed
transaction rolling back and leaving the session usable.

Two behaviours the copied code assumes and that hold: `jsonb` round-trips as an
object rather than a JSON string, and `timestamptz` round-trips as a `Date`.

## Environment note

Node 22.22.0 here; the source repository's `engines` asks for `>=22.23.2`. Nothing
in these spikes needs it, and this repository asks for `>=22.22.0`. Worth revisiting
if a copied dependency disagrees.

## What phase 1 inherits

- A working `npm run migrate` and an eleven-migration schema on disk.
- `migrations/0000-local-queue.sql` as the seam where the site's workflow engine
  used to be — the first shim, written before any other.
- Three settled build settings: `errorRecovery` for LightningCSS, the GOV.UK Sass
  configuration, and root-relative asset paths.
- One constraint carried forward to phase 3: the document shell needs
  `.govuk-template` and `.govuk-template__body`.
