/**
 * THE VALUE LEDGER: WHAT EACH STEP SPENT, AGAINST WHAT CAME OF IT (phase 23, T6).
 *
 * Nobody could see value per token. The review of 5 October 2026 built this
 * table by hand from the database: 57.5M input tokens for a 28k-token paper,
 * stage 3 at 19.6M making 455 relationships, stage 4 writing 147 profiles of
 * which 12% were ever cited, the final review spending 3.8M for two key
 * judgements. Every future cut needs the same table, so the run computes it.
 *
 * COMPUTED FROM ROWS THE RUN ALREADY STORED, never from a model: the call log
 * (`policy_model_calls.usage`, an ARRAY — a corrective round appends), the
 * executions that tie a call to its step, the artefacts each step kept, and
 * their references (`policy_provenance`, here as `refs`).
 *
 * THREE WAYS AN ITEM CAN COUNT, and they are not nested by accident:
 *
 * - **made** — kept by this step (`policy_artefacts.stage`);
 * - **cited later** — named in the references of something a LATER step kept.
 *   A step's output that nothing downstream reads is the waste this column
 *   exists to find. The last step's figure is about the reader, not the run,
 *   so it is not computed for it;
 * - **on a page** — of a kind the report draws in a section of its own
 *   (`DRAWN`). Not "rendered within a cap": a list of 47 plays shows them all
 *   in a table; this says what a reader CAN reach without opening the record.
 *
 * TOKENS ARE THE PROVIDER'S OWN COUNT, AND A CALL THAT TIMED OUT HAS NONE. A
 * call abandoned at its deadline records no usage, so its cost is invisible
 * here and everywhere else; `unrecorded` counts those calls so the gap is
 * stated, not hidden.
 */

/**
 * KINDS A READER MEETS ON A PAGE OF THE REPORT, by the section that draws them.
 * Everything not listed is held for provenance and reached only through an
 * item's own page, or not at all.
 */
export const DRAWN: Record<string, string> = {
  passage: 'The paper itself',
  claim: 'What the paper is made of',
  mechanism: 'How each part is meant to work',
  assumption: 'What rests on what',
  actor: 'Who is involved',
  resolution_candidate: 'Bodies the paper does not pin down',
  profile: 'What moves each body',
  edge: 'How they connect',
  research_question: 'Checked outside the paper',
  research_source: 'Checked outside the paper',
  evidence: 'What is backed up by evidence',
  model: 'The games the policy sets up',
  test: 'Checks on how the policy is set up',
  scenario: 'Conditions the policy has to survive',
  exploit: 'Every way to beat it, scored',
  cross_policy: 'Across your other papers',
  finding: 'All findings',
  recommendation: 'What it recommends',
  logic_model: 'How each part is meant to work',
  causal_chain: 'How each part is meant to work',
  evaluation_plan: 'How you would know',
  assurance_challenge: 'How the findings were challenged',
  assurance_response: 'How the findings were challenged',
  review_summary: 'How the findings were challenged',
  key_judgement: 'The brief',
  reconciliation: 'What came after this was written',
  revision: 'What came after this was written',
  addendum_summary: 'What came after this was written',
};

/**
 * Whether a reader meets this item on a page. A stage-1 actor is a MENTION of
 * a body, which stage 2 resolves; only the resolved register is drawn.
 */
export function drawn(item: { id: string; kind: string }): boolean {
  if (!(item.kind in DRAWN)) return false;
  if (item.kind === 'actor') return item.id.startsWith('s2_');
  return true;
}

export type LedgerRow = {
  ordinal: number;
  name: string;
  /** Every call this step made, corrective rounds and top-ups included. */
  calls: number;
  /** Of those, corrective rounds (`#repair`). */
  repairs: number;
  /** Calls that ended with no usage recorded — a timeout leaves nothing to count. */
  unrecorded: number;
  input: number;
  cached: number;
  output: number;
  made: number;
  /** Null for the last step, whose items nothing later can cite. */
  cited: number | null;
  shown: number;
};

export type ValueLedger = {
  rows: LedgerRow[];
  total: Omit<LedgerRow, 'ordinal' | 'name' | 'cited'> & { cited: number };
};

type Usage = { tokensInput?: unknown; tokensOutput?: unknown; cacheReadTokens?: unknown };
const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : 0);

export type LedgerInput = {
  stages: { id?: string; ordinal: number; name: string }[];
  executions?: { id: string; stageId: string }[];
  calls?: { executionId: string; callKey: string; status?: string | null; usage?: unknown }[];
  artefacts: { id: string; kind: string; refs: string[] }[];
  /** The stage each artefact was kept by. Read off the rows, never the id. */
  artefactMetadata?: { id: string; stage?: number }[];
};

/**
 * The ledger, or null where this reading cannot say — no stage ids to tie a
 * call to its step (an older pack), or no calls at all.
 */
export function valueLedger(input: LedgerInput): ValueLedger | null {
  const ordinalOfStage = new Map(input.stages.filter((s) => s.id).map((s) => [s.id as string, s.ordinal]));
  const ordinalOfExecution = new Map((input.executions ?? []).flatMap((e) => {
    const ordinal = ordinalOfStage.get(e.stageId);
    return ordinal === undefined ? [] : [[e.id, ordinal] as const];
  }));
  if (!input.calls?.length || !ordinalOfExecution.size) return null;

  const rows = new Map<number, LedgerRow>(input.stages.map((s) => [s.ordinal, {
    ordinal: s.ordinal, name: s.name, calls: 0, repairs: 0, unrecorded: 0, input: 0, cached: 0, output: 0, made: 0, cited: 0, shown: 0,
  }]));

  for (const call of input.calls) {
    const ordinal = ordinalOfExecution.get(call.executionId);
    const row = ordinal === undefined ? undefined : rows.get(ordinal);
    if (!row) continue;
    row.calls++;
    if (call.callKey.includes('#repair')) row.repairs++;
    const usage = (Array.isArray(call.usage) ? call.usage : []) as Usage[];
    // A call that is still running has no usage yet and is not a gap.
    if (!usage.length && call.status !== 'running') row.unrecorded++;
    for (const u of usage) {
      row.input += num(u.tokensInput);
      row.output += num(u.tokensOutput);
      row.cached += num(u.cacheReadTokens);
    }
  }

  // Which step kept each item, from the rows; and which items a LATER step names.
  const stageOf = new Map((input.artefactMetadata ?? []).filter((m) => typeof m.stage === 'number').map((m) => [m.id, m.stage as number]));
  const citedBy = new Map<string, number>();
  for (const item of input.artefacts) {
    const from = stageOf.get(item.id);
    if (from === undefined) continue;
    for (const ref of item.refs ?? []) citedBy.set(ref, Math.max(citedBy.get(ref) ?? -1, from));
  }
  for (const item of input.artefacts) {
    const ordinal = stageOf.get(item.id);
    const row = ordinal === undefined ? undefined : rows.get(ordinal);
    if (!row) continue;
    row.made++;
    if ((citedBy.get(item.id) ?? -1) > (ordinal as number)) row.cited = (row.cited ?? 0) + 1;
    if (drawn(item)) row.shown++;
  }

  const ordered = [...rows.values()].sort((a, b) => a.ordinal - b.ordinal);
  const last = ordered.filter((row) => row.made > 0).at(-1);
  if (last) last.cited = null;
  const total = ordered.reduce((sum, row) => ({
    calls: sum.calls + row.calls,
    repairs: sum.repairs + row.repairs,
    unrecorded: sum.unrecorded + row.unrecorded,
    input: sum.input + row.input,
    cached: sum.cached + row.cached,
    output: sum.output + row.output,
    made: sum.made + row.made,
    cited: sum.cited + (row.cited ?? 0),
    shown: sum.shown + row.shown,
  }), { calls: 0, repairs: 0, unrecorded: 0, input: 0, cached: 0, output: 0, made: 0, cited: 0, shown: 0 });
  return { rows: ordered, total };
}

/** "65%", or "—" where there is nothing to divide by. */
export function percent(part: number, whole: number): string {
  if (!whole) return '—';
  return `${Math.round((part / whole) * 100)}%`;
}
