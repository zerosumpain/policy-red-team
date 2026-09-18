# Phase 6 — packaging

18 September 2026. The gate `docs/plan.md` set: *fresh clone, one key in `.env`,
an assessment completes.* Met, and verified by actually doing it twice.

## Result

Cloned into a temp directory, installed, built, ran an assessment:

```
clone: 16M, 195 files
install: ok          190 packages in 4s
build: ok            client, offline shell, cli, server
Done, with gaps.     18 of 18 stages, no key, no bill
```

The server starts from the same clone and serves on 127.0.0.1:5290. Every gate
still passes: 421 unit, 19 integration, axe on six routes, the browser walk, and
the offline pack from `file://`.

`npm install && npm start` is the whole instruction. No database to run, no
container, nothing to install but Node 22.23.2 or newer.

## 156 MB of accident, removed

Four directories — `assess/`, `help/`, `list/`, `report/` — were **PGlite
databases committed to git**, 4,176 files between them. They came from the
`migrate.mjs` script guard bug found in phase 2: a bundled
`import.meta.url === argv[1]` check is always true, so the migration runner fired
inside the CLI and read `argv[2]` — a command name — as a data directory.
`cli list` created a database called `list`, and phase 2's `git add -A` committed
all four.

The bug was fixed the day it was found; this was the mess it left, and nobody
looked at the repository root until packaging made it the job. A clean clone is
16 MB, which is the 14 MB of history those files still occupy plus the source.
The repository has never been pushed, so the history could be rewritten to drop
them entirely — **not done**, because 14 MB is not worth rewriting history over
and rewriting history is not a decision to take on someone's behalf.

## The first thing a new reader does

Without a key, the first run used to end like this:

```
failed. Report: X.report.json
```

The actual cause — `OPENROUTER_API_KEY is not set` — was in a stage's error
column, in a report file, which is the one place it is least likely to be read.
An assessment created without a key is a row, a queue envelope and eighteen
pending stages that exist only to fail.

Now the CLI checks before it creates anything and exits 2 with the message, and
the server says the same at startup — as a warning, not a refusal, because
browsing, reading old reports and downloading exports all work perfectly well
without a key. Only a new run needs one.

When a run does fail for some other reason, the CLI now prints the reason and the
command to resume it, rather than the bare status.

## What is in the box

| File | |
|---|---|
| `README.md` | what it is, how to run it, and what it is not — including that it is not a government service |
| `LICENCE` | MIT, with the GOV.UK Frontend attribution and the statement that the crown, arms and typeface are not used |
| `AGENTS.md` | the fork rules, the gates, and the seven things that have already cost a day |
| `.env.example` | every variable, with the two that are dangerous called out |

`AGENTS.md` was not on the plan's list for this phase. It is here because this
repository's fork model has traps that are invisible from the code — edit a copied
file by hand and the next `npm run sync` silently reverts it — and a session that
rediscovers them pays for it twice.

## Decision log

| Fork | Options | Chosen | Why | Reversible? |
|---|---|---|---|---|
| The committed databases | leave them; `git rm --cached`; rewrite history | **`git rm --cached`** | 156 MB out of the working tree; 14 MB of history is not worth rewriting, and rewriting is not mine to decide | the history option stays open |
| Missing key | let the run fail and explain in the report; check first | **check first** | eighteen stages that exist only to fail is not a useful diagnostic | yes |
| The server without a key | refuse to start; warn | **warn** | reading and exporting work fine; only a new run needs a key | yes |
| `AGENTS.md` | out of scope for this phase; write it | **write it** | the fork's traps are invisible from the code and cost an hour each | yes |
| Clean-machine proof | assert it in a script; do it by hand twice | **by hand** | a scripted clone-and-install is a slow gate that mostly tests npm; the value was in doing it once and fixing what it found | it can be scripted later if it regresses |

## Where this leaves the build

Six phases, and the plan's estimate was eighteen to twenty-five working days.
What is standing:

- 14,000 lines of pipeline copied and running on an embedded PostgreSQL, with
  drift from upstream mechanically reported.
- Eighteen stages driven from a command line, a browser, or both.
- A GOV.UK interface that passes axe on every route and ships none of the assets
  it is not licensed to use.
- Three export formats, one of which needs no network at all.
- Six gates, all green, run by one command.

**Outstanding, unchanged since phase 4** — none blocked, all additive: the drill,
the 3D relationship graph and the table beside it, the stress lab, share links in
the interface (the API is built and tested), persona detail, and material and
restate. `docs/plan.md` chose full parity, so these are the remainder of it.

**Worth doing before anything else:** run one real assessment, on a real paper,
with a real key. Everything in this repository has been verified against a
deterministic fixture. That proves the machinery and proves nothing whatever
about the quality of the analysis.
