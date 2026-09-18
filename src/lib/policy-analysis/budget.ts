import type { Artefact } from './contracts';

// Fitting a stage's context into the model's window without losing the evidence.
//
// The ceiling was 180,000 serialised characters when this was written. Targeted
// research alone could exceed it: the eight questions and three results a side
// that `standard` allowed then, at ten thousand characters of retrieved text
// each, is 240,000 characters before a single claim, actor or profile is added.
// The evidence matrix is the first stage that carries all of it, and the shipped
// code threw `budget` there — a code `worker.ts` excludes from retry, so the run
// ended. The ceiling is larger now and the enquiry is wider (`DEPTH_LIMITS`), so
// the arithmetic has moved but not the shape of the problem.
//
// Refusing to run is the worst of the options. Trimming the longest retrieved
// bodies first costs the tail of a source's text; dropping whole artefacts costs
// a line of the assessment. So: clip, in descending order of length, through a
// ladder of caps, and only start dropping artefacts if clipping cannot fit it.
// Either way the caller gets told, in words, what the model did not see.

const CAPS = [8000, 4000, 2000, 1000, 500, 250];

/**
 * How much of a call may be spent telling the model what earlier stages lost.
 *
 * `priorWarnings` carries every warning from every completed stage, and
 * `fitToBudget` sheds ARTEFACTS only — so an unbounded warning list is spent
 * first and the artefacts are squeezed out to pay for it. It also grows
 * monotonically, which means it is largest at synthesis, the stage that can
 * least afford it. Measured on 2026-09-10: the synthesis call was 182,386
 * characters, of which 69,629 — 38% — were 272 warnings, leaving room for 28
 * artefacts out of 482 and no assumptions at all for the findings to cite.
 *
 * The stage still needs to know the assessment is partial, so keep the notes
 * that say so and count the rest.
 */
const WARNING_BUDGET = 12_000;

/**
 * Bound the warnings a stage carries into its model call.
 *
 * Duplicates go first — a fan-out over twenty passages repeats the same note
 * twenty times — then the longest are dropped, because the aggregate ones
 * ("N groups of model output were discarded") are short and are exactly what a
 * reader of the final report needs to see reported as a limit.
 */
export function boundWarnings(warnings: string[], budget = WARNING_BUDGET): string[] {
  const unique = [...new Set(warnings.map((w) => w.trim()).filter(Boolean))];
  const kept: string[] = [];
  let used = 0;
  for (const w of [...unique].sort((a, b) => a.length - b.length)) {
    if (used + w.length > budget) break;
    kept.push(w);
    used += w.length;
  }
  const dropped = unique.length - kept.length;
  // Order by the original sequence so the reader still sees them stage by stage.
  const ordered = unique.filter((w) => kept.includes(w));
  if (dropped) ordered.push(`And ${dropped} further note${dropped === 1 ? '' : 's'} from earlier stages, not carried into this call. The assessment is partial on those grounds too.`);
  return ordered;
}

export type Fitted = { artefacts: Artefact[]; notes: string[] };

/** Serialised size of the payload this stage would send. */
export function encodedSize(input: unknown): number {
  return JSON.stringify(input).length;
}

/**
 * Shrink `artefacts` until `build(artefacts)` serialises under `limit`.
 *
 * Clipping is applied to `statement`, which is where retrieved source text and
 * long extracts live; every structured field the contracts depend on is left
 * alone, so nothing a later stage references can disappear through a clip.
 */
export function fitToBudget(artefacts: Artefact[], build: (a: Artefact[]) => unknown, limit: number, protect: Set<string> = new Set()): Fitted {
  const notes: string[] = [];
  if (encodedSize(build(artefacts)) <= limit) return { artefacts, notes };

  let working = artefacts.map((a) => ({ ...a }));
  for (const cap of CAPS) {
    let clipped = 0;
    for (const a of working) {
      if (a.statement.length <= cap) continue;
      a.statement = `${a.statement.slice(0, cap)}\n[…truncated for the model's context window; the full text is retained in this assessment]`;
      clipped++;
    }
    if (clipped) notes.push(`${clipped} long item${clipped === 1 ? '' : 's'} clipped to ${cap.toLocaleString()} characters for this call.`);
    if (encodedSize(build(working)) <= limit) return { artefacts: working, notes: [summarise(notes)] };
  }

  // Still over: shed whole artefacts, consumed sources first and lowest
  // confidence within that, since those are the ones the stage can most afford.
  // `protect` holds what the call is FOR — the research question's own sources,
  // the actor being profiled. Shedding those would leave a call that reports
  // success having read nothing.
  const consumed = consumedSources(working);
  const order = [...working].sort((a, b) => rank(a, protect, consumed) - rank(b, protect, consumed));
  /**
   * Bisection, not one full serialisation per item shed.
   *
   * This loop used to rebuild and re-encode the ENTIRE payload once for every
   * artefact it removed. On a call carrying 2,079 artefacts that is ~1,500
   * serialisations of a 360,000-character object, and it measured **6,407ms** —
   * over the liveness probe's five second threshold on its own, on a machine
   * faster than the VPS. It is the synchronous block that had the watchdog
   * restarting the web service mid-stage on 2026-09-10, eleven times in twenty
   * minutes, one interruption short of destroying a five-and-a-half-hour run.
   *
   * The payload only ever shrinks as items come off the front of `order`, so the
   * smallest number that fits is monotone and can be found by halving: ~11 probes
   * instead of ~1,500. Same cut point, same items, same output — `budget.test.ts`
   * asserts it against a linear scan.
   */
  let lo = 0;
  let hi = Math.max(0, order.length - 1);
  while (lo < hi) {
    const mid = Math.floor((lo + hi) / 2);
    if (encodedSize(build(order.slice(mid))) <= limit) hi = mid;
    else lo = mid + 1;
  }
  // `splice` returns what it removed and leaves `order` as the kept remainder,
  // which is exactly the state the original loop left behind.
  const dropped: Artefact[] = order.splice(0, lo);
  // Protected items sort last, so reaching one means everything else has already
  // gone. Refusing to shed it here used to leave the payload over the ceiling,
  // and `provider.ts` throws `budget` — a code the worker excludes from retry, so
  // the stage died. A call that ran on nine tenths of what it needed, and says
  // so, is worth more than an assessment that stops. The pinned set is bounded by
  // what the stage is FOR, so this is the tail of a very large policy, not the
  // ordinary case.
  const pinnedLost = dropped.filter((a) => protect.has(a.id));
  if (pinnedLost.length) notes.push(`${pinnedLost.length} item${pinnedLost.length === 1 ? '' : 's'} this call was built around did not fit and were withheld too: ${pinnedLost.slice(0, 6).map((a) => a.label).join(', ')}${pinnedLost.length > 6 ? `, and ${pinnedLost.length - 6} more` : ''}. Read this stage as partial.`);
  if (dropped.length) notes.push(`${dropped.length} item${dropped.length === 1 ? '' : 's'} were withheld from this call entirely: ${dropped.slice(0, 8).map((a) => a.label).join(', ')}${dropped.length > 8 ? `, and ${dropped.length - 8} more` : ''}.`);
  // Losing SOME of a kind costs detail; losing ALL of one costs the reasoning.
  // A list of eight labels never conveyed that — the run where every model, test,
  // scenario and profile was shed reported only the first eight claim labels.
  const gone = [...new Set(dropped.map((a) => a.kind))].filter((kind) => !order.some((a) => a.kind === kind)).sort();
  if (gone.length) notes.push(`No ${gone.join(', ')} was left in this call's context at all; reasoning that depends on ${gone.length === 1 ? 'it' : 'them'} could not be done here.`);
  // A Set, not `dropped.includes` — that was a second quadratic, scanning up to
  // 1,500 dropped artefacts once for each of 2,079 kept ones.
  const droppedSet = new Set(dropped);
  const kept = working.filter((a) => !droppedSet.has(a));
  return { artefacts: kept, notes: [summarise(notes)] };
}

/**
 * Shedding order: the further an artefact sits from the reasoning a stage is
 * doing, the sooner it goes.
 *
 * The shipped ranking put everything except retrieved sources and passages into
 * ONE tier and broke ties on confidence. That is backwards, because a literal
 * extraction from the document is near-certain by construction and a judgement
 * about an actor's incentives is not — so the derived layer always went first.
 *
 * Measured on the first assessment to reach the end (2026-09-10, a 20-page paper
 * yielding 635 artefacts): stages 7, 9, 10 and 12 each ran on claims and evidence
 * with ZERO models, tests, scenarios or assumptions in context. The exploitation
 * playbook — the point of the whole assessment — was written with one of
 * eighteen actor profiles, and that one only because the call pinned it. Asked
 * for conclusions citing results it had never been shown, the model minted
 * plausible identifiers for them, every finding was then quarantined for citing
 * an unavailable source, and synthesis failed reporting the missing chapters
 * rather than the cause.
 *
 * So shed the material a later stage has already consumed and superseded — the
 * retrieved text behind an `evidence` row, the passage behind a `claim` — and
 * keep the conclusions. Confidence remains the tiebreak WITHIN a tier, where it
 * compares like with like.
 */
const SHED_ORDER: Record<string, number> = {
  research_source: 0,
  passage: 1,
  alias: 2,
  resolution_candidate: 2,
  claim: 3,
  evidence: 3,
  node: 3,
  edge: 3,
  actor: 4,
  mechanism: 4,
  profile: 5,
  assumption: 5,
  model: 6,
  test: 6,
  scenario: 6,
  exploit: 6,
  cross_policy: 6,
  finding: 6,
  recommendation: 6,
  // A pass's own conclusions, at the same tier as the report's. A restatement is
  // handed the whole inventory and must cite the revisions it is answering, so
  // shedding them would reproduce the 2026-09-10 failure exactly: a stage asked
  // to cite what it was never shown mints an identifier and is quarantined.
  reconciliation: 6,
  revision: 6,
  addendum_summary: 6,
};

/**
 * Where a retrieved source sits when NOTHING has read it yet.
 *
 * `research_source: 0` above is right for a source the evidence matrix has
 * already distilled into an `evidence` row: the stage keeps the finding and
 * sheds the paragraph it came from, which is the whole principle of the table.
 * It is wrong for a source no evidence row cites, because then shedding it first
 * means the assessment paid a search provider, stored the text, and showed it to
 * nobody.
 *
 * Two kinds of source are in that position. Measured on production 2026-09-17:
 * 38 of 179 retrieved sources were cited by no artefact at all. And every
 * follow-up source is there BY CONSTRUCTION — stage 6 has already run by the
 * time stages 7, 9, 10, 14, 15 and 16 raise a question, so nothing downstream
 * will ever turn one into evidence. Without this, letting a later stage ask
 * would retrieve an answer and then shed it before any stage could read it.
 *
 * Tier 3 puts it with the claims and the evidence: raw material that has not
 * been superseded, still below the conclusions.
 */
const UNREAD_SOURCE_TIER = 3;

/** Sources an `evidence` row has read. The one rule; `pipeline.ts` uses it too. */
export function consumedSources(artefacts: Artefact[]): Set<string> {
  const consumed = new Set<string>();
  for (const a of artefacts) if (a.kind === 'evidence') for (const ref of a.refs) consumed.add(ref);
  return consumed;
}

/**
 * A pin is a BONUS, not a flat score.
 *
 * Pinning used to return 1000 for everything protected, so a call that pins a
 * hundred artefacts ordered them arbitrarily among themselves — and the shed
 * loop, which now degrades rather than dying, would drop whichever happened to
 * be first in the array. Adding to the tier instead keeps every pinned item
 * above every unpinned one while still shedding the most expendable pinned item
 * first.
 */
function rank(a: Artefact, protect: Set<string>, consumed: Set<string>): number {
  // A PINNED SOURCE KEEPS TIER 0, and that exception is load-bearing.
  //
  // `consumed` is derived from the `evidence` rows in the call, and the evidence
  // matrix is the stage that WRITES them — so its input contains none, and
  // without this every source in a stage-6 call would be promoted to tier 3 at
  // exactly the stage this module was written for. A claim at confidence 0.1
  // would then shed before a ten-thousand-character web excerpt, and stage 6's
  // whole job is linking claims to sources. That is the documented dead stage of
  // 2026-09-10: shown evidence and no claims, the model emitted the claims, three
  // responses running.
  //
  // A pin says the call is ABOUT this source, which is true at stage 6 and at
  // every follow-up round of stage 5. What is left in tier 3 is the case the
  // exception is for: a source no evidence row has read AND no call has pinned —
  // a follow-up source at stages 7 onward, which nothing will ever supersede
  // because stage 6 has already run.
  const pinned = protect.has(a.id);
  const unread = a.kind === 'research_source' && !pinned && !consumed.has(a.id);
  return (pinned ? 100 : 0) + (unread ? UNREAD_SOURCE_TIER : (SHED_ORDER[a.kind] ?? 3)) * 10 + (a.confidence ?? 0.5) * 9;
}

function summarise(notes: string[]): string {
  return `This call exceeded the model's context window, so its input was reduced. ${notes.join(' ')} Conclusions drawn here rest on less than the full inventory.`;
}
