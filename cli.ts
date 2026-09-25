/**
 * The headless assessment runner.
 *
 * Phase 2's whole point: drive all eighteen stages from a file to a report with
 * no interface in the way. It is also the thing that proves the copied pipeline
 * works before a line of React is written, and it stays useful afterwards — a
 * batch of papers is a shell loop, not an afternoon of clicking.
 *
 *   policy migrate                       apply the migrations
 *   policy assess <file> [options]       run an assessment to completion
 *   policy list                          every assessment and its status
 *   policy report <id> [--out file]      re-emit a finished report
 *
 * `npm run assess:fixture` runs the same code against a deterministic fixture
 * model — no key, no spend — which is how the eighteen stages are verified.
 */
// A standalone tool keeps its key in a .env next to itself, and Node can read one
// without a dependency. Silent when there is no file: `migrate`, `list` and
// `report` need no credentials at all, and only a real assessment will complain —
// with a message naming the variable, from `llm/keys.ts`.
//
// IT HAS TO BE AN IMPORT, NOT A STATEMENT, AND IT HAS TO BE FIRST. This was a
// bare `try { process.loadEnvFile() }` sitting among the imports, and imports
// are hoisted — so it ran after `$lib/db` had already frozen `DATA_DIR` from an
// environment the file had not reached. `POLICY_DATA_DIR` in a `.env` was
// silently ignored for eighteen phases. Import order is evaluation order.
import '$lib/load-env';
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import './src/lib/polyfills';
import { client, db } from '$lib/db';
import { migrate } from './scripts/migrate.mjs';
import { createAnalysis, detail, listAnalyses, loadArtefacts } from '$lib/policy-analysis/server/store';
import { CONCURRENCY_OPTIONS, STAGES } from '$lib/policy-analysis/contracts';
import { drain, isFinished } from '$lib/worker';
import { modelAccessProblem } from '$lib/llm/client';
import { getOwnerEmails } from '$lib/server/access';
import type { Concurrency, Depth } from '$lib/policy-analysis/contracts';

const MIME: Record<string, string> = {
  '.txt': 'text/plain',
  '.pdf': 'application/pdf',
  '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
};

interface Flags {
  [key: string]: string | boolean | undefined;
}

function parse(argv: string[]): { command: string; args: string[]; flags: Flags } {
  const [command = 'help', ...rest] = argv;
  const args: string[] = [];
  const flags: Flags = {};
  for (let i = 0; i < rest.length; i++) {
    const token = rest[i];
    if (!token.startsWith('--')) { args.push(token); continue; }
    const key = token.slice(2);
    const next = rest[i + 1];
    if (next === undefined || next.startsWith('--')) flags[key] = true;
    else { flags[key] = next; i++; }
  }
  return { command, args, flags };
}

function str(flags: Flags, key: string): string | null {
  const value = flags[key];
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

const USAGE = `policy — standalone adversarial policy analysis

  policy migrate                      apply the migrations to the local database
  policy assess <file>                run an assessment to completion
  policy list                         every assessment and its status
  policy report <id>                  re-emit a finished report

assess options
  --title <t>        defaults to the file name
  --jurisdiction <j> --area <a> --context <c>
  --depth <standard|deep>             default standard
  --agents <1-6>                      calls in flight at once, default 6
  --shared-context-first <true|false> order the shared block first, default true
  --owner <email>                     default POLICY_OWNER_EMAIL
  --out <file>                        default <title>.report.json
  --quiet                             no per-stage progress
`;

async function assess(file: string, flags: Flags): Promise<number> {
  const extension = path.extname(file).toLowerCase();
  const mimeType = MIME[extension];
  if (!mimeType) {
    console.error(`Unsupported file type "${extension || file}". Use a PDF, DOCX or UTF-8 TXT.`);
    return 2;
  }
  const bytes = await readFile(file);
  const title = str(flags, 'title') ?? path.basename(file, extension);
  const owner = str(flags, 'owner') ?? getOwnerEmails()[0];
  const depth = (str(flags, 'depth') ?? 'standard') as Depth;
  const quiet = flags.quiet === true;

  /*
   * THE SAME DEFAULTS THE HTTP ROUTE TAKES, because the reason that route sets
   * them applies here more, not less.
   *
   * `server/api.ts` defaults `sharedContextFirst` to true and says why: "It cost
   * a subscription on 2026-09-19. A run of 385 calls went out with the flag
   * unset because the caller had copied an older submission's fields, and
   * nothing on the way in asked whether that was deliberate." That fix was
   * applied to the route. This entry point passed `false` written into the
   * source, where nobody would ever be asked whether it was deliberate at all.
   *
   * `concurrency: null` resolved to DEFAULT_CONCURRENCY, which was 1 — so every
   * fan-out ran serially, and a headless run took six times longer than it had
   * to. Phase 19 made the default six and gave the form the field it lacked;
   * the explicit six here is kept so the CLI says what it does.
   */
  const agents = Number(str(flags, 'agents') ?? 6);
  if (!CONCURRENCY_OPTIONS.includes(agents as Concurrency)) {
    console.error(`--agents must be one of ${CONCURRENCY_OPTIONS.join(', ')}.`);
    return 2;
  }
  const sharedContextFirst = str(flags, 'shared-context-first') !== 'false';

  // Before anything is written down. An assessment created without a key is a
  // row, a queue envelope and eighteen pending stages that exist only to fail.
  //
  // AWAITED, WHICH IT WAS NOT. `modelAccessProblem` became async in phase 13,
  // when which service answers stopped being compiled and started being read
  // out of the encrypted store. The call site kept its old shape, and a Promise
  // is always truthy — so this guard fired on EVERY run, printed
  // `Promise { <pending> }` and exited 2. Every headless path went with it:
  // `npm run assess`, `npm run assess:fixture`, and the README's own quickstart.
  const problem = await modelAccessProblem();
  if (problem) {
    console.error(problem);
    return 2;
  }

  await migrate(client, { log: () => {} });

  const analysis = await createAnalysis(owner, {
    title,
    jurisdiction: str(flags, 'jurisdiction'),
    policyArea: str(flags, 'area'),
    context: str(flags, 'context'),
    depth,
    model: null,
    thinkingLevel: null,
    concurrency: agents as Concurrency,
    extraction: null,
    sharedContextFirst,
    sealed: false,
    sealedResearch: false,
    filename: path.basename(file),
    mimeType,
    bytes,
  });

  if (!quiet) {
    console.log(`${title}`);
    console.log(`  ${analysis.id}`);
    console.log(`  ${STAGES.length} stages, owner ${owner}\n`);
  }

  const started = Date.now();
  const status = await drain(analysis.id, {
    onStage: quiet
      ? undefined
      : ({ completed }) => {
          const name = STAGES[completed - 1] ?? '';
          const seconds = ((Date.now() - started) / 1000).toFixed(0);
          console.log(`  ${String(completed).padStart(2)}/${STAGES.length}  ${name}  (${seconds}s)`);
        },
  });

  const out = str(flags, 'out') ?? `${title.replace(/[^\w.-]+/g, '-')}.report.json`;
  await writeReport(analysis.id, owner, out);

  // A run with gaps is a finished run, not a failed one — it is what you get
  // whenever a stage recorded a warning, and with no Tavily key the research
  // stage always does.
  const note = status === 'completed' ? 'Done' : status === 'completed_with_gaps' ? 'Done, with gaps' : status;
  console.log(`\n${note}. Report: ${out}`);
  if (!isFinished(status)) {
    // Say WHY. A bare "failed" sends the reader to the report file to find out,
    // and the report file is the one place the reason is least readable.
    const full = await detail(owner, analysis.id);
    const reason = full?.analysis.error ?? full?.stages.find((s) => s.error)?.error;
    if (reason) console.error(`\n  ${reason}`);
    console.error(`  Resume it with: policy cli resume ${analysis.id}`);
  }
  return isFinished(status) ? 0 : 1;
}

async function writeReport(id: string, owner: string, out: string): Promise<void> {
  const full = await detail(owner, id);
  if (!full) throw new Error(`No assessment ${id} for ${owner}`);
  const artefacts = await loadArtefacts(id);
  const report = {
    generatedAt: new Date().toISOString(),
    analysis: full.analysis,
    stages: full.stages.map((s) => ({ ordinal: s.ordinal, name: s.name, status: s.status, warnings: s.warnings })),
    artefactCounts: artefacts.reduce<Record<string, number>>((acc, a) => {
      acc[a.kind] = (acc[a.kind] ?? 0) + 1;
      return acc;
    }, {}),
    artefacts,
  };
  await writeFile(out, JSON.stringify(report, null, 2) + '\n');
}

async function main(): Promise<number> {
  const { command, args, flags } = parse(process.argv.slice(2));

  switch (command) {
    case 'migrate': {
      const applied = await migrate(client, { log: (m: string) => console.log(m) });
      console.log(applied.length ? `applied ${applied.length}` : 'up to date');
      return 0;
    }
    case 'assess': {
      if (!args[0]) { console.error(USAGE); return 2; }
      return assess(args[0], flags);
    }
    case 'list': {
      await migrate(client, { log: () => {} });
      const owner = str(flags, 'owner') ?? getOwnerEmails()[0];
      const rows = await listAnalyses(owner);
      if (!rows.length) { console.log('No assessments yet.'); return 0; }
      for (const row of rows) {
        console.log(`${row.id}  ${String(row.status).padEnd(10)}  ${row.title}`);
      }
      return 0;
    }
    case 'report': {
      if (!args[0]) { console.error(USAGE); return 2; }
      await migrate(client, { log: () => {} });
      const owner = str(flags, 'owner') ?? getOwnerEmails()[0];
      const out = str(flags, 'out') ?? `${args[0]}.report.json`;
      await writeReport(args[0], owner, out);
      console.log(out);
      return 0;
    }
    default:
      console.log(USAGE);
      return command === 'help' ? 0 : 2;
  }
}

// `policy list | head -1` closes the pipe while we are still writing to it, and
// an unhandled EPIPE on stdout is an ugly stack trace for what is a completely
// normal way to use a command-line tool.
for (const stream of [process.stdout, process.stderr]) {
  stream.on('error', (err: NodeJS.ErrnoException) => {
    if (err.code === 'EPIPE') process.exit(0);
    throw err;
  });
}

try {
  process.exitCode = await main();
} catch (err) {
  console.error(`\n${err instanceof Error ? err.message : String(err)}`);
  process.exitCode = 1;
} finally {
  await client.close().catch(() => {});
  void db;
}
