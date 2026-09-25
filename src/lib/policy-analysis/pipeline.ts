import { APPRAISAL_STAGE, ASSURANCE_CATEGORIES, ASSURANCE_STAGE, ASSURED_SYNTHESIS_STAGE, CONCURRENCY_OPTIONS, DEFAULT_CONCURRENCY, DEFAULT_EXTRACTION, DEPTH_LIMITS, FIT_LIMIT, FOLLOW_UP_STAGES, FULL_PROFILES, isPassStage, passOf, passOrdinal, passStep, PATTERNS, PERSONA_STAGE, REPORT_SECTIONS, RESULT_KINDS, REVISION_STATUSES, SCENARIOS, SHORT_PROFILE_BATCH, STAGE_CONTEXT, SYNTHESIS_STAGE, THEORY_STAGE, type Artefact, type Concurrency, type Extraction, type PassKind, type StageInput, type StageOutput } from './contracts';
import { consumedSources, encodedSize, fitToBudget } from './budget';
import { scoreExploits } from './exposure';
import { clampWarnings, PolicyError, stampProfileForm, triageArtefacts, triageOutput } from './validation';
import { modelApplicability } from './models';
import { crossIdentityHints, preserveAmbiguity } from './entities';
import { runPolicyTests } from './tests';
import { documentShingles, quotesDocument } from './query-guard';
import { partitionFrontMatter, skippedNote } from './front-matter';
import { numbered, sentences } from './sentences';
import type { ModelCall } from './server/provider';
import type { Research } from './server/research';
import type { PersonaPrior } from './personas';

/** Compact summaries of this reader's OTHER completed assessments, for stage 11. */
export type Neighbour = { id: string; title: string; policyArea: string | null; jurisdiction: string | null; completedAt: string | null; artefacts: { id: string; kind: string; label: string; statement: string; entityType?: string; aliases?: string[] }[] };
export type Neighbours = () => Promise<Neighbour[]>;
/** What this reader's persona library already holds about the actors in this run. */
export type Personas = (actors: Artefact[]) => Promise<PersonaPrior[]>;
/**
 * `concurrency` lives HERE and not on `StageInput`, and that is load-bearing.
 *
 * `StageInput` is spread into the model-call payload, and `provider.ts` hashes
 * that payload verbatim to key the response cache. A new field on it changes
 * every hash, so every completed call in an in-flight assessment would miss its
 * cache and be paid for again — which is exactly what a resumed run must not do.
 * How many agents a stage uses is how it is EXECUTED, never what the model is
 * asked, so it belongs beside `signal` with the other execution concerns.
 */
export type PipelineDeps = { model: ModelCall; research: Research; signal: AbortSignal; neighbours?: Neighbours; personas?: Personas; concurrency?: Concurrency | null; passKind?: PassKind | null; material?: MaterialBrief | null; extraction?: Extraction | null; sharedContextFirst?: boolean | null; onProgress?: (phase: string) => void };

/**
 * What the reader said the attached material IS, as the pass stages are told it.
 *
 * On `PipelineDeps` rather than `StageInput` for the cache reason above — but it
 * DOES reach the model, through `extra` on the call, so two passes over the same
 * assessment with different roles are different calls with different hashes and
 * cannot replay each other's answers.
 */
export type MaterialBrief = { pass: number; role: string; label: string; guidance: string; filename: string | null; note: string | null };

/**
 * Stages that fan out over a list — one call per passage, actor, pattern or
 * scenario — no longer let a single bad call end the stage.
 *
 * The first production run died this way: passage 1 of 20 succeeded, passage 10
 * failed, and the other eighteen were never attempted. A unit of fan-out that
 * fails is now recorded as a gap and the sweep continues; the coverage rules at
 * the bottom of `executeStage` decide whether what came back is an assessment or
 * a failure. `CONSECUTIVE_LIMIT` stops a dead provider burning through the whole
 * list to reach the same conclusion twenty calls later.
 */
const CONSECUTIVE_LIMIT = 3;

/**
 * A slow provider is not a dead one, and must not be reported as one.
 *
 * A provider that is down refuses the connection in milliseconds; three of those
 * in a row genuinely means stop. A model that is merely too slow fails at the
 * per-call deadline, minutes apart, and each failure is about ONE unit of work —
 * so three of them said "the provider is unavailable" about a bridge that was
 * healthy, and ended a 72-page assessment at page 5. Timeouts get their own,
 * longer count and their own message.
 */
const CONSECUTIVE_TIMEOUT_LIMIT = 6;

/**
 * Failure codes that are ONE EVENT when several lanes hit them at once.
 *
 * `CONSECUTIVE_LIMIT` counts per unit, but a fan-out dispatches `lanes` units
 * simultaneously — so at three lanes one transport event kills three in-flight
 * calls in the same second and reads as three consecutive failures. It is one.
 *
 * Measured on the first deep run of the Post-16 white paper, 2026-09-17: an
 * SR-Main deploy restarts `jkai-codex-bridge`, which every app on the box shares,
 * and three times in 77 minutes that ended a stage attempt outright — three
 * identical `provider` errors stamped the same second, one bridge restart.
 *
 * ONLY `provider` BELONGS HERE. A `timeout` is a fact about ONE unit — that page
 * was too slow on this model — so three of them really are three facts, and
 * collapsing them would hide exactly what `CONSECUTIVE_TIMEOUT_LIMIT` exists to
 * report. Same for a contract failure: it describes the response, not the wire.
 *
 * A provider that is genuinely down still stops the stage promptly, because an
 * event only ever absorbs the units that were IN FLIGHT when it happened — at
 * most `lanes` of them. A unit dispatched afterwards that fails the same way is
 * a new event, so the count still climbs at least once per `lanes` failures and
 * trips after `CONSECUTIVE_LIMIT` of them. See `fanOut`.
 */
const CONCURRENT_EVENT_CODES = new Set(['provider']);

/** Ceilings on a stage's assembled output, which no envelope bounds. */
const MAX_STAGE_ARTEFACTS = 4000;
const MAX_REFS = 200;

export async function executeStage(input: StageInput, deps: PipelineDeps): Promise<StageOutput & { rejected: number }> {
  const { stage } = input;
  const limits = DEPTH_LIMITS[input.depth ?? 'standard'];
  /**
   * A retrieved source the evidence matrix has already read.
   *
   * Stages 7, 9, 10 and 11 used to drop `research_source` from their context
   * outright, which is right for a source stage 6 distilled into an `evidence`
   * row — the stage gets the finding instead of the paragraph — and wrong for one
   * it did not. Every follow-up source is in the second group by construction:
   * stage 6 has already run by the time a later stage asks, so nothing will ever
   * turn one into evidence, and dropping it would retrieve an answer and hide it
   * from the only stages that could use it. Same rule as `budget.ts` sheds by.
   */
  const consumed = consumedSources(input.artefacts);
  const supersededSource = (a: Artefact) => a.kind === 'research_source' && consumed.has(a.id);
  // A concurrency nobody offers is a request the run cannot honour; take the
  // default rather than failing a stage over it, exactly as model and effort do.
  const lanes: number = (CONCURRENCY_OPTIONS as readonly number[]).includes(deps.concurrency as Concurrency) ? (deps.concurrency as Concurrency) : DEFAULT_CONCURRENCY;
  const output: StageOutput = { artefacts: [], warnings: [] };
  let consecutive = 0;
  // The failure immediately before this one, so a fan-out can tell "three lanes
  // died together" from "three units failed one after another". Cleared by any
  // success, exactly as `consecutive` is.
  let priorFailure: { signature: string; event: number } | null = null;
  let rejected = 0;
  // A holder, not a bare `let`: control-flow narrowing pins a `let` initialised
  // to null at `null` for the outer scope, so every read after the closure that
  // assigns it types as `never`.
  const fault: { last: PolicyError | null } = { last: null };

  // Identifiers are capped at 100 characters, and a fan-out key can be a resolved
  // actor id that is nearly that long on its own. The prefix is therefore a short
  // sequence number, stable because every fan-out below iterates in sorted order
  // — and, when those units overlap, because `fanOut` reserves every slot in that
  // order BEFORE it dispatches anything.
  let seq = 0;
  const reserve = (key: string) => (key === 'main' ? 'main' : String(seq++).padStart(3, '0'));

  /**
   * The model call on its own.
   *
   * Nothing here reads `output`. That is the property the whole fan-out rests on:
   * a unit's request is built from `input.artefacts` and its own context, never
   * from what another unit produced, so overlapping them cannot change what any
   * one of them is asked.
   */
  const send = async (key: string, context: Artefact[], slot: string, extra: Record<string, unknown> = {}) => {
    deps.signal.throwIfAborted();
    return deps.model(stage, key, { ...input, artefacts: context, idPrefix: `s${stage}_${slot}_`, targetActorId: stage === 3 || stage === 4 || stage === 10 || stage === PERSONA_STAGE ? key : null, targetPattern: stage === 7 ? key : null, targetScenario: stage === 9 ? key : null, targetMechanismId: stage === THEORY_STAGE ? key : null, targetCategory: stage === ASSURANCE_STAGE ? key : null, modelLibrary: stage === 7 ? modelApplicability(input.artefacts) : undefined, ...extra });
  };

  /**
   * Triage one response and fold it into the stage.
   *
   * ORDER-DEPENDENT, deliberately: triage validates a unit against everything
   * accumulated so far, so a reference to an earlier unit's artefact resolves and
   * the same reference from an earlier unit does not. Callers must absorb in unit
   * order or they change which artefacts are quarantined.
   */
  const absorb = (raw: unknown) => {
    const result = triageOutput(raw, stage, [...input.artefacts, ...output.artefacts], deps.passKind);
    // Retrieved sources are minted by the retrieval adapter and nowhere else. The
    // kind is permitted at this stage so the server's own rows validate, which
    // would otherwise let a model hand back a source — and a URL — of its own.
    rejected += result.rejected.length;
    const authored = result.artefacts.filter((a) => a.kind === 'research_source');
    if (authored.length) {
      result.artefacts = result.artefacts.filter((a) => a.kind !== 'research_source');
      result.warnings.push(`${authored.length} model-authored source${authored.length === 1 ? '' : 's'} were discarded: evidence comes from retrieval, never from the model.`);
    }
    output.artefacts.push(...result.artefacts); output.warnings.push(...result.warnings);
    return result;
  };

  const request = async (key: string, context: Artefact[], extra: Record<string, unknown> = {}) =>
    absorb(await send(key, context, reserve(key), extra));

  /**
   * A failed unit becomes a recorded gap — until too many in a row fail.
   *
   * `event` is the transport event a fan-out unit's failure belongs to, or -1
   * where there is no fan-out and so nothing to share an event with.
   */
  const gap = (describe: string, err: unknown, event = -1) => {
    deps.signal.throwIfAborted();
    if (!(err instanceof PolicyError)) throw err;
    fault.last = err;
    // One transport event that took down every lane in flight counts ONCE. The
    // unit is still recorded as missing below — what changes is only whether the
    // assessment concludes the provider has stopped answering.
    const signature = `${err.code}|${err.message}`;
    const sameEvent = event >= 0 && CONCURRENT_EVENT_CODES.has(err.code) &&
      priorFailure?.event === event && priorFailure.signature === signature;
    priorFailure = { signature, event };
    if (!sameEvent) consecutive++;
    output.warnings.push(`${describe} could not be assessed: ${err.message} It is missing from this stage.`);
    const limit = err.code === 'timeout' ? CONSECUTIVE_TIMEOUT_LIMIT : CONSECUTIVE_LIMIT;
    if (consecutive >= limit) {
      throw new PolicyError(err.code, err.code === 'timeout'
        ? `${limit} parts of this stage in a row ran out of time. The model chosen for this assessment is too slow for this document, not unavailable — re-run it on a faster one. ${err.message}`
        : `${limit} consecutive parts of this stage failed for the same reason. ${err.message}`);
    }
    return null;
  };

  /** `request`, but a failure becomes a recorded gap instead of a dead stage. */
  const attempt = async (key: string, context: Artefact[], describe: string, extra: Record<string, unknown> = {}) => {
    try {
      const result = await request(key, context, extra);
      consecutive = 0; priorFailure = null;
      return result;
    } catch (err) {
      return gap(describe, err);
    }
  };

  /**
   * One unit of a fan-out: the arguments `attempt` would have been given, and
   * optionally what the server does to a response before triage reads it.
   */
  type Unit = { key: string; context: Artefact[]; describe: string; extra?: Record<string, unknown>; prepare?: (raw: unknown) => unknown };
  type Landed = { raw: unknown; err: unknown; event: number };

  /**
   * Run a fan-out with `lanes` units in flight, and fold the results in order.
   *
   * The calls may overlap because they are independent (see `send`). Everything
   * after the response is not: slots number the artefact ids and triage sees the
   * running total, so slots are reserved in unit order before dispatch and the
   * responses are absorbed in unit order afterwards. A stage run at any number of
   * agents therefore yields the same artefacts, the same ids and the same
   * warnings as a serial one — `pipeline.test.ts` asserts that directly.
   *
   * A ROLLING POOL, NOT BATCHES. This was `Promise.all` over slices of `lanes`,
   * so every batch waited for its slowest call before the next one started, and
   * a model's per-call time is anything but even — a dense page takes four times
   * a thin one. Measured on the review of 25 September 2026: 3.2 to 3.9 of six
   * lanes busy, on average, across the fan-out stages. Now a lane that frees
   * takes the next unit at once, and only the FOLD waits on order: unit 7 may
   * land before unit 2, and sits until unit 2 has been absorbed.
   *
   * The dead-provider rule is kept by giving each failure an EVENT rather than a
   * batch. A `provider` failure opens an event whose members are the units in
   * flight at that moment; a later failure with the same signature belongs to it
   * only if it was one of those members. So one bridge restart that kills every
   * lane still counts once, but a unit dispatched AFTER it that fails the same
   * way is a new event — without that, a dead provider would chain one event
   * into the next forever and never be reported. An event holds at most `lanes`
   * units, so a dead provider still trips `CONSECUTIVE_LIMIT` within
   * `CONSECUTIVE_LIMIT * lanes` refused calls, the bound batches gave. The
   * counting itself still happens in the fold, in unit order.
   *
   * `onFailure`, where given, replaces the gap-and-count rule for a stage whose
   * failures must never end it — the persona library.
   */
  const fanOut = async (units: Unit[], onResult?: (unit: Unit, result: ReturnType<typeof absorb> | null) => void, onFailure?: (unit: Unit, err: unknown) => void) => {
    // Units that answered with nothing. Silence is a legitimate finding — a body
    // the paper names once has no relationships to assert — but it is still
    // something the reader should be able to see, so it is counted and named once
    // rather than either failing the stage or vanishing.
    const silent: string[] = [];
    // Every slot, in unit order, before anything is sent: the identifiers a
    // response mints must not depend on which call happened to come back first.
    const slots = units.map((u) => reserve(u.key));
    const resolvers: ((landed: Landed) => void)[] = [];
    const landed = units.map((_, k) => new Promise<Landed>((resolve) => { resolvers[k] = resolve; }));
    const inFlight = new Set<number>();
    const events = new Map<string, { id: number; members: Set<number> }>();
    let nextEvent = 0;
    let next = 0;
    let count = 0;
    let stopped = false;
    const eventOf = (k: number, err: unknown): number => {
      if (!(err instanceof PolicyError) || !CONCURRENT_EVENT_CODES.has(err.code)) return -1;
      const signature = `${err.code}|${err.message}`;
      const open = events.get(signature);
      if (open?.members.has(k)) return open.id;
      const opened = { id: nextEvent++, members: new Set(inFlight) };
      events.set(signature, opened);
      return opened.id;
    };
    const lane = async () => {
      while (!stopped && next < units.length) {
        const k = next++;
        const unit = units[k];
        inFlight.add(k);
        const outcome = await send(unit.key, unit.context, slots[k], unit.extra ?? {}).then(
          (raw): Landed => ({ raw, err: null, event: -1 }),
          (err: unknown): Landed => ({ raw: null, err, event: eventOf(k, err) }),
        );
        inFlight.delete(k);
        // Real progress, reported as each call lands. The worker turns this into
        // a liveness beat, so a stage that is working says so — and one that has
        // stopped working stops saying so, which is the case the probe exists for.
        deps.onProgress?.(`${++count} of ${units.length}`);
        resolvers[k](outcome);
        // One tick before taking the next unit, so a fold that was waiting on
        // THIS result runs first. If it decided the provider is dead, `stopped`
        // is already set and nothing more goes out — which keeps a serial run to
        // exactly the calls it always made, rather than one past the failure.
        await Promise.resolve();
      }
    };
    const running = Array.from({ length: Math.min(lanes, units.length) }, lane);
    try {
      for (let k = 0; k < units.length; k++) {
        const { raw, err, event } = await landed[k];
        let result: ReturnType<typeof absorb> | null;
        try {
          if (err) throw err;
          const prepare = units[k].prepare;
          result = absorb(prepare ? prepare(raw) : raw);
          consecutive = 0; priorFailure = null;
        } catch (e) {
          if (onFailure) { onFailure(units[k], e); result = null; }
          else result = gap(units[k].describe, e, event);
        }
        if (result && !result.artefacts.length) silent.push(units[k].describe);
        onResult?.(units[k], result);
      }
    } catch (err) {
      // The stage is ending. Nothing more is dispatched, and the calls already
      // out are waited for rather than abandoned: a call that lands after its
      // stage has failed would otherwise write its record beside the retry's.
      stopped = true;
      await Promise.allSettled(running);
      throw err;
    }
    await Promise.all(running);
    if (silent.length) output.warnings.push(`${silent.length} of ${units.length} parts of this stage had nothing to report: ${silent.slice(0, 8).join(', ')}${silent.length > 8 ? `, and ${silent.length - 8} more` : ''}. The model answered for ${silent.length === 1 ? 'it' : 'each'} and recorded nothing, which is an answer rather than a failure.`);
  };

  /**
   * The assumptions a stage's own output is obliged to cite.
   *
   * A model's `assumptions`, a scenario's `assumptions`, an exploitation play's
   * `preconditions` and a finding's `hypothesisIds` all name assumption records,
   * and every one of them must also appear in `refs`. The model can only name an
   * identifier it was shown, so an assumption shed from the context is an
   * assumption the stage cannot cite — it invents one and the artefact is
   * quarantined, or it reaches for whatever it did see. Assumptions are the
   * connective tissue of the whole red-team argument and they are produced early,
   * which puts them below the conclusions in the shed order; pinning is what
   * keeps them. Seen live on 2026-09-10: the exploitation playbook ran with 24
   * results and ZERO assumptions in context.
   */
  /**
   * HOW MUCH ROOM THE SHARED BLOCK MUST LEAVE FOR THE REST OF A CALL.
   *
   * It used to be a flat 120,000 characters, and that constant is why stage 6
   * got NO benefit from any of this. MEASURED on the run of 2026-09-18: stage 3
   * fitted into a 10,000-character band (909,338–919,703) and cached 66.1% of
   * its input, while stage 6's payloads ran 967,125–**1,076,893** — over
   * `FIT_LIMIT` — so `provider.ts` re-fitted them PER CALL, rewrote each payload
   * from the front, and cached 0.0%. Exactly the failure this whole change
   * exists to remove, reintroduced by guessing the number.
   *
   * The guess was wrong because a fan-out's per-call block is not one shape:
   * stage 3's is a few actor rows, stage 14's is one mechanism, and stage 6's is
   * a research question PLUS every source retrieved for it. So it is no longer
   * guessed — the caller hands over every unit's own block and the largest one
   * decides, with a margin for the envelope's scalars and the repair reserve.
   */
  const SHARED_CALL_MARGIN = 40_000;

  /**
   * The context of a fan-out call, ordered so its shared part can be CACHED.
   *
   * Measured on the deep Post-16 run (2026-09-17): stage 3 sent 211,029 input
   * tokens per call across 171 calls — 36.1 million — and the provider read 2.3%
   * of them from its prompt cache. Stage 14 sent 33.6 million and cached 0.5%.
   * A prompt cache matches an exact leading PREFIX, and the two stages defeated
   * it differently.
   *
   * Stage 3 put the per-group artefacts FIRST and the ~890,000 shared characters
   * after them, so the common prefix ended a few hundred bytes in. Order fixes
   * that one.
   *
   * Stage 14 did not: its context is already identical on every call. What broke
   * it there was `fitToBudget` running per call with a `protect` set naming the
   * mechanism being written about, so a different artefact sat at the shedding
   * boundary each time — 122 distinct payload sizes across 144 calls. Ordering
   * cannot fix that; fitting the shared block ONCE can, which is what happens
   * below, before any call is built.
   *
   * The ORDER is behind the run's own toggle, so a reader can put a paper
   * through each way and compare rather than trust this comment. On 2026-09-18
   * that comparison gave stage 3 66.1% against 2.3%, and 65% less uncached input.
   *
   * THE FIT IS NOT, since phase 19. Both orders fit the shared block once, in
   * the stage's declared order (`STAGE_CONTEXT`), so the two arms send the same
   * artefacts and the comparison measures ordering alone. The old arm fitted
   * per call in `provider.ts`, by `SHED_ORDER`, which is the ranking that let
   * the late verbose kinds starve the stages that needed the early ones.
   */
  const sharedFit = new Map<string, Artefact[]>();
  const orderedContext = (shared: Artefact[], own: Artefact[], key: string, owns: Artefact[][], protect: Set<string> = new Set()): Artefact[] => {
    let fitted = sharedFit.get(key);
    if (!fitted) {
      // The BIGGEST per-call block in this fan-out decides, because the shared
      // block has to leave room for the worst case rather than the first one.
      // A call that overruns is re-fitted by `provider.ts` and loses the prefix
      // for itself AND for every call that would have matched it.
      const largest = owns.reduce((most, o) => Math.max(most, encodedSize(o)), 0);
      // Never give away more than half the budget: a per-call block that large
      // means the shared block was never going to be the cacheable part.
      const allowance = Math.min(Math.floor(FIT_LIMIT / 2), largest + SHARED_CALL_MARGIN);
      // `protect` DEFAULTS TO EMPTY: what a call is for lives in `own`, which is
      // appended after this block and never shed by it. A fan-out whose context
      // is ENTIRELY shared has nowhere else to put its essentials, so it may pass
      // a set — one that is identical on every call, which is a single decision
      // and cannot move the shedding boundary between calls the way a per-call
      // set does. See the divergence note in scripts/sync-core.mjs.
      const result = fitToBudget(scoped(shared), (artefacts) => ({ artefacts }), FIT_LIMIT - allowance, protect, declared);
      fitted = result.artefacts;
      // Said once for the stage rather than once per call: it is one decision.
      for (const note of result.notes) output.warnings.push(`The shared context for this stage was reduced so every call could send the same one: ${note}`);
      sharedFit.set(key, fitted);
    }
    // Shared FIRST so the bytes before a call's own artefacts are identical on
    // every call of the stage, and `own` last so it is never what gets shed.
    // The old order, where a run asked for it, puts `own` first. Merged BY ID:
    // a call's own artefact may also sit in the shared block, clipped or not,
    // and must not reach the model twice.
    const first = deps.sharedContextFirst ? fitted : own;
    const held = new Set(first.map((a) => a.id));
    return [...first, ...(deps.sharedContextFirst ? own : fitted).filter((a) => !held.has(a.id))];
  };

  /**
   * ONLY WHAT THE STAGE DECLARES, AND IN THE ORDER IT DECLARES IT.
   *
   * `STAGE_CONTEXT` names the kinds a stage is given, first-needed first. Every
   * context below goes through `scoped` — the fan-outs inside `orderedContext`,
   * the single calls through `fitOnce` — so an undeclared kind is never sent,
   * and when the declared ones still do not fit, the first named is the last to
   * go. On the review of 25 September 2026 stage 14 saw 1 mechanism, 1
   * assumption and no evidence, because 500 profiles and the report's findings
   * outranked them; profiles are not what a theory of change is built from, and
   * are not sent to one now.
   *
   * A stage that declares nothing — 1 to 4 and 13 build their own per-unit
   * context, and every pass — is left exactly as it was.
   */
  const declared = STAGE_CONTEXT[stage];
  const scoped = (artefacts: Artefact[]) => (declared ? artefacts.filter((a) => (declared as readonly string[]).includes(a.kind)) : artefacts);
  /**
   * A single call's context, scoped and fitted ONCE, here, in declared order.
   *
   * Left to `provider.ts` it would be fitted by `SHED_ORDER` — the ranking this
   * replaces. The margin is the same one a fan-out leaves for the envelope's
   * scalars, so the provider's own fit is the backstop it was always meant to
   * be rather than the thing that decides.
   */
  const fitOnce = (context: Artefact[], protect: string[] = []): Artefact[] => {
    if (!declared) return context;
    const result = fitToBudget(scoped(context), (artefacts) => ({ artefacts }), FIT_LIMIT - SHARED_CALL_MARGIN, new Set(protect), declared);
    for (const note of result.notes) output.warnings.push(`The context for this stage was reduced to fit the model: ${note}`);
    return result.artefacts;
  };

  const hypotheses = input.artefacts.filter((a) => a.kind === 'assumption').map((a) => a.id);

  /**
   * What the reader's persona library already holds about the bodies in this run.
   *
   * A prior is CONTEXT, never evidence. It was drawn from other papers about
   * other policies, and a red team that imports last month's conclusion about a
   * department has stopped reading this one. The provenance rules do the
   * enforcing — a persona is neither a passage nor a retrieved source, so
   * nothing resting on it alone can reach `hasSource` — and the prompt says so
   * in words as well.
   *
   * Failing to READ the library must not cost a stage. The assessment is
   * complete without it; it is merely less informed.
   */
  const priors = new Map<string, PersonaPrior>();
  if (deps.personas && [4, 10, PERSONA_STAGE].includes(stage)) {
    try {
      const resolved = input.artefacts.filter((a) => a.kind === 'actor' && a.id.startsWith('s2_'));
      for (const prior of await deps.personas(resolved)) priors.set(prior.actorId, prior);
    } catch {
      output.warnings.push('The persona library could not be read, so this stage ran without what earlier assessments established about these bodies.');
    }
  }

  /**
   * WORK COMMISSIONED AFTER THE REPORT, in its own block of ordinals.
   *
   * These branches sit at the top of the chain rather than in a module of their
   * own, and that is the design decision worth defending: everything a pass
   * needs — the fan-out, the slot reservation, the triage-in-unit-order fold,
   * the consecutive-failure rule, the context budget — is the machinery above,
   * already measured and already carrying five separate hard-won fixes. A pass
   * built beside it would have re-learned all five.
   *
   * Step 0 never arrives here: it is `ingest()` pointed at the attached
   * material, run by the worker exactly as stage 0 is.
   */
  if (isPassStage(stage)) {
    const pass = passOf(stage);
    const step = passStep(stage);
    // The material's own passages, by the namespace `ingest` minted them under.
    const materialPassages = input.artefacts.filter((a) => a.kind === 'passage' && a.id.startsWith(`m${pass}_`));
    // Which pass each earlier artefact belongs to, so a later pass can tell the
    // assessment's own conclusions from an earlier addendum's.
    const brief = deps.material ? { material: deps.material } : {};
    if (deps.passKind === 'restatement') {
      // The assured-synthesis context, plus everything the addenda added. Pinned
      // the same way stage 17 pins, with the revisions added: a restatement that
      // could not see what an addendum overturned would restate the overturned
      // conclusion, which is the one thing it exists not to do.
      const context = input.artefacts.filter((a) => a.kind !== 'passage' && (a.kind !== 'actor' || a.id.startsWith('s2_')) && !supersededSource(a));
      const protect = [
        ...context.filter((a) => ['finding', 'recommendation', 'causal_chain', 'option_appraisal', 'evaluation_plan', 'assurance_challenge', 'revision', 'reconciliation', 'addendum_summary'].includes(a.kind) || (RESULT_KINDS as readonly string[]).includes(a.kind)).map((a) => a.id),
        ...hypotheses,
      ];
      await request('main', context, { protect });
    } else if (step === 1) {
      if (!materialPassages.length) throw new PolicyError('extraction', 'The attached material yielded no readable passages, so there is nothing to read into the assessment.');
      // THE CAST IS PINNED, and this is the rule that makes an addendum worth
      // having. The stage's contract asks it to re-use an existing body's id
      // rather than mint a second row for a body already profiled — and the model
      // can only name an identifier it was shown. Shed the resolved actors and it
      // mints a duplicate Department for Education with none of the first one's
      // incentives, silently, on every passage.
      const cast = input.artefacts.filter((a) => a.kind === 'actor' && a.id.startsWith('s2_'));
      const castIds = cast.map((a) => a.id);
      await fanOut(materialPassages.map((passage) => ({
        key: passage.id,
        context: [passage, ...cast],
        describe: `Material passage “${passage.label}”`,
        extra: { ...brief, protect: [passage.id, ...castIds] },
      })));
    } else if (step === 2) {
      // Everything the assessment holds that the material could bear on, plus
      // what the material itself yielded. Passages stay OUT except the material's
      // own: an extracted fact must be locatable in its passage, and the
      // reconciliation's evidence rows cite material passages as their source.
      const context = input.artefacts.filter((a) => (a.kind !== 'passage' || a.id.startsWith(`m${pass}_`)) && !['alias', 'node'].includes(a.kind) && (a.kind !== 'actor' || a.id.startsWith('s2_') || a.id.startsWith(`s${passOrdinal(pass, 1)}_`)));
      // Pinned: what the stage's own output is obliged to name. A reconciliation
      // names an existing claim, mechanism, assumption or actor in `targetId`,
      // and an evidence row names a material passage in `sourceId`. Both are
      // rejected outright if the id does not resolve, so both must be in the
      // call — the 2026-09-10 dead stage, one pass later.
      const protect = [
        ...materialPassages.map((a) => a.id),
        ...context.filter((a) => ['claim', 'mechanism', 'assumption', 'actor'].includes(a.kind)).map((a) => a.id),
      ];
      await request('main', context, { ...brief, protect });
    } else if (step === 3) {
      const context = input.artefacts.filter((a) => (a.kind !== 'passage' || a.id.startsWith(`m${pass}_`)) && !['alias', 'node'].includes(a.kind) && (a.kind !== 'actor' || a.id.startsWith('s2_')));
      // A revision judges a finding, a recommendation or a play, and must rest on
      // a reconciliation or an evidence row from THIS pass. All four are pinned,
      // for the reason the previous two branches give.
      const protect = context.filter((a) =>
        ['finding', 'recommendation', 'exploit', 'reconciliation'].includes(a.kind) ||
        (a.kind === 'evidence' && a.id.startsWith(`s${passOrdinal(pass, 2)}_`)),
      ).map((a) => a.id);
      await request('main', context, { ...brief, protect });
    }
  } else if (stage === 1) {
    const passages = input.artefacts.filter((a) => a.kind === 'passage');
    // A cover, a copyright notice and a contents list are not policy, and asking
    // this stage's contract of them is what ended the first real white-paper
    // assessment. They stay in the document record; they are simply not sent,
    // and every one of them is named below.
    const { analyse, skipped, distrusted } = partitionFrontMatter(passages);
    if (skipped.length) output.warnings.push(skippedNote(skipped, passages.length));
    if (distrusted) output.warnings.push('Almost every page looked like front matter, which is far more likely to be a fault in the extraction than a document with no policy in it, so every page was analysed.');
    /**
     * The indexed path shows the model a NUMBERED copy of the passage and takes
     * a sentence number back. The numbered copy exists only inside the call:
     * every artefact is still validated against the passage as ingested, so the
     * offsets, the quotes and the document record are the original's.
     *
     * A passage the segmenter finds nothing in falls back to the prose contract
     * for that call alone rather than being skipped. It should not happen —
     * `front-matter.ts` has already dropped anything under 120 characters — but
     * a page that reached here with no sentence in it is a page to analyse the
     * old way, not a page to lose.
     */
    const indexedRun = (deps.extraction ?? DEFAULT_EXTRACTION) === 'indexed';
    await fanOut(analyse.map((passage) => {
      const list = indexedRun ? sentences(passage.statement) : [];
      if (!list.length) return { key: passage.id, context: [passage], describe: `Passage “${passage.label}”`, extra: { protect: [passage.id] } };
      return {
        key: passage.id,
        context: [{ ...passage, statement: numbered(list) }],
        describe: `Passage “${passage.label}”`,
        extra: { protect: [passage.id], indexed: { id: passage.id, text: passage.statement, list } },
      };
    }));
  } else if (stage === 3) {
    /**
     * ONE CALL PER BODY, not one call for the entire policy.
     *
     * This stage used to make a SINGLE call carrying the whole assessment and
     * asked it to return the complete relationship graph in one response. On the
     * 72-page white paper of 2026-09-10 that call carried 1,120,463 characters and
     * came back with 4,004 output tokens: **10 nodes and 8 edges for 347 resolved
     * actors**. Every other heavy stage already fans out — 72 calls for 72 pages,
     * one per body for the profiles — and this one did not.
     *
     * The input was never the constraint. Raising the context ceiling let the
     * stage see everything and shed nothing, and it produced 18 artefacts anyway,
     * because one response cannot carry a policy's structure however much it is
     * shown. The output is the constraint, and a fan-out is the only thing that
     * moves it.
     *
     * Grouped by canonical label for the same reason stage 4 is: the resolution
     * stage deliberately refuses to merge rows sharing a name, and asking the same
     * question of 42 Skills England rows separately is 42 times the cost for a
     * worse answer than asking once with all 42 rows' evidence.
     */
    const resolved = input.artefacts.filter((a) => a.kind === 'actor' && a.id.startsWith('s2_'));
    const groups = new Map<string, Artefact[]>();
    for (const a of resolved) {
      const key = a.label.trim().toLowerCase();
      const bucket = groups.get(key);
      if (bucket) bucket.push(a); else groups.set(key, [a]);
    }
    // Everything an edge is allowed to point AT. Shared by every call because a
    // relationship needs both of its endpoints present to be assertable at all.
    const endpoints = input.artefacts.filter((a) => ['mechanism', 'claim'].includes(a.kind) || (a.kind === 'actor' && a.id.startsWith('s2_')));
    const mentionsOf = (a: Artefact) => (Array.isArray(a.data.mentions) ? a.data.mentions.length : 0);
    // Every group's own block, before any call is built: the shared fit has to
    // leave room for the LARGEST of them, not the first one it happens to see.
    const graphUnits = [...groups.values()].map((members) => ({
      members,
      own: input.artefacts.filter((a) => members.some((m) => a.id === m.id || a.refs.includes(m.id))),
    }));
    const graphOwns = graphUnits.map((u) => u.own);
    await fanOut(graphUnits.map(({ members, own }) => {
      const primary = [...members].sort((x, y) => mentionsOf(y) - mentionsOf(x) || x.id.localeCompare(y.id))[0];
      return {
        key: primary.id,
        context: orderedContext(endpoints, own, 'graph', graphOwns),
        describe: `Relationships for ${primary.label}`,
        extra: { protect: members.map((m) => m.id) },
      };
    }));
  } else if (stage === 4) {
    const toProfile = input.artefacts.filter((a) => a.kind === 'actor' && a.id.startsWith('s2_'));
    /**
     * ONE CALL PER BODY, not per row.
     *
     * Entity resolution refuses to merge rows that merely share a label, and it
     * is right to — a shared name is not a shared body. But it left 352 rows for
     * 135 labels on the 72-page white paper (Skills England 42 times, Employers
     * 26, Government 21), and this stage asked the same question of each one,
     * separately, each seeing only its own row's evidence. That is 2.6x the calls
     * for WORSE profiles: a profile of Employers drawn from 26 mentions beats 26
     * profiles drawn from one each.
     *
     * So the CALL is shared and the IDENTITY is not. The rows stay distinct
     * artefacts with their own ids and provenance; the profile records which of
     * them it was drawn for in `coversActorIds`, and nothing anywhere claims they
     * are one entity.
     */
    const mentionsOf = (a: Artefact) => (Array.isArray(a.data.mentions) ? a.data.mentions.length : 0);
    const groups = new Map<string, Artefact[]>();
    // Insertion order follows `input.artefacts`, which loads ordered by id, so
    // the group sequence — and therefore every `idPrefix` — stays deterministic.
    for (const a of toProfile) {
      const key = a.label.trim().toLowerCase();
      const bucket = groups.get(key);
      if (bucket) bucket.push(a); else groups.set(key, [a]);
    }
    const bodies = [...groups.values()].map((members) => {
      // The best-evidenced row speaks for the group, so the call is pinned to an
      // id that genuinely exists and carries the most to reason from.
      const primary = [...members].sort((x, y) => mentionsOf(y) - mentionsOf(x) || x.id.localeCompare(y.id))[0];
      const related = new Set(members.flatMap((m) => [m.id, ...m.refs, ...input.artefacts.filter((a) => a.fromId === m.id || a.toId === m.id || a.refs.includes(m.id)).flatMap((a) => [a.id, ...a.refs, a.fromId ?? '', a.toId ?? ''])]));
      const context = input.artefacts.filter((a) => related.has(a.id));
      const missing = members.filter((m) => !context.includes(m));
      return { primary, members, context: [...context, ...missing] };
    });
    /**
     * FULL PROFILES FOR THE BODIES THE POLICY RUNS THROUGH, SHORT ONES FOR THE REST.
     *
     * Every body got the full twenty-one fields, one call each. On the review of
     * 25 September 2026 that was 168 calls on one run, and 230 of its 239 actors
     * were mentioned ONCE — twenty-one evidenced fields about a body the paper
     * names in passing is sixteen fields of "unknown" at full price, and the
     * model writes about 50 tokens a second whatever it is writing.
     *
     * The graph is built by now, so connectivity is known: `orderActors` ranks
     * the bodies exactly as the red team and the persona library will rank them,
     * and the top `FULL_PROFILES` get the full profile. That is more than either
     * of those stages takes (`DEPTH_LIMITS.deep.actors`), so every body they
     * reason about has one. The rest get a SHORT profile — role, what it wants,
     * what it controls — `SHORT_PROFILE_BATCH` to a call. Every body still has a
     * profile, so nothing downstream that asks "is this body profiled" changes
     * its answer; what changes is how much was paid to say "unknown".
     *
     * The full units keep their order and their slots, so a paper with no more
     * than `FULL_PROFILES` bodies makes exactly the calls it always made.
     */
    const ranking = orderActors(input.artefacts, bodies.map((b) => b.primary)).actors;
    const fullIds = new Set(ranking.slice(0, FULL_PROFILES).map((a) => a.id));
    const tail = bodies.filter((b) => !fullIds.has(b.primary.id));
    const fullUnits = bodies.filter((b) => fullIds.has(b.primary.id)).map((b) => ({
      key: b.primary.id,
      context: b.context,
      describe: b.members.length === 1
        ? `The incentive profile for ${b.primary.label}`
        : `The incentive profile for ${b.primary.label} (${b.members.length} source rows)`,
      extra: { protect: [b.primary.id], priorPersona: priors.get(b.primary.id) ?? null },
      prepare: (raw: unknown) => stampProfileForm(raw, 'full'),
    }));
    const batches: (typeof bodies)[] = [];
    for (let i = 0; i < tail.length; i += SHORT_PROFILE_BATCH) batches.push(tail.slice(i, i + SHORT_PROFILE_BATCH));
    const shortUnits = batches.map((batch) => {
      const wanted = new Set(batch.flatMap((b) => b.context.map((a) => a.id)));
      const labels = batch.map((b) => b.primary.label);
      return {
        key: `brief_${batch[0].primary.id}`,
        context: input.artefacts.filter((a) => wanted.has(a.id)),
        describe: `Short profiles for ${labels.length} bod${labels.length === 1 ? 'y' : 'ies'} (${labels.slice(0, 3).join(', ')}${labels.length > 3 ? ', …' : ''})`,
        // `targetActorId` cleared, `targetActorIds` set: the one field a short
        // call is told by. `profileForm` reaches the model too, and `provider.ts`
        // reads it to stamp the form before triage.
        extra: { targetActorId: null, targetActorIds: batch.map((b) => b.primary.id), profileForm: 'short', protect: batch.map((b) => b.primary.id) },
        prepare: (raw: unknown) => stampProfileForm(raw, 'short'),
      };
    });
    const bodyOf = new Map(bodies.map((b) => [b.primary.id, b]));
    const batchOf = new Map(shortUnits.map((u, i) => [u.key, batches[i]]));
    // Bodies whose call answered and wrote no profile for them. One sentence for
    // the lot at the end: a warning per body was ~130 lines on a real paper.
    const unprofiled: string[] = [];
    let strays = 0;
    await fanOut([...fullUnits, ...shortUnits], (unit, result) => {
      const produced = result?.artefacts.filter((a) => a.kind === 'profile') ?? [];
      const batch = batchOf.get(unit.key);
      if (!batch) {
        const members = bodyOf.get(unit.key)?.members ?? [];
        // Stamped here, by the server, from what it already knows — never asked of
        // the model, which cannot be trusted to enumerate a grouping it did not do.
        for (const profile of produced) profile.data.coversActorIds = members.map((m) => m.id);
        if (result && !produced.length) unprofiled.push(members[0]?.label ?? unit.key);
        return;
      }
      // A short call answers for several bodies, so each profile is matched to
      // the body it names. One naming a body this call was not about, or a body
      // it has already profiled, is dropped: two profiles for one body would give
      // it two sets of motives.
      const named = new Map(batch.map((b) => [b.primary.id, b]));
      const done = new Set<string>();
      const dropped = new Set<Artefact>();
      for (const profile of produced) {
        const body = named.get(String(profile.data.actorId));
        if (!body || done.has(body.primary.id)) { dropped.add(profile); continue; }
        done.add(body.primary.id);
        profile.data.coversActorIds = body.members.map((m) => m.id);
      }
      if (dropped.size) {
        output.artefacts = output.artefacts.filter((a) => !dropped.has(a));
        strays += dropped.size;
      }
      if (result) for (const body of batch) if (!done.has(body.primary.id)) unprofiled.push(body.primary.label);
    });
    if (tail.length) output.warnings.push(`${tail.length} of ${bodies.length} bodies were not assessed in full: each has a short profile — its role, what it wants and what it controls — because the policy graph runs less of the policy through them than through the ${fullUnits.length} profiled in full.`);
    if (strays) output.warnings.push(`${strays} short profile${strays === 1 ? '' : 's'} named a body the call was not about, or one it had already profiled, and ${strays === 1 ? 'was' : 'were'} discarded.`);
    if (unprofiled.length) output.warnings.push(`${unprofiled.length} of ${bodies.length} bodies have no incentive profile in this assessment: ${unprofiled.slice(0, 8).join(', ')}${unprofiled.length > 8 ? `, and ${unprofiled.length - 8} more` : ''}. The model answered and wrote none, so their motivations were not modelled.`);
  } else if (stage === 7 || stage === 9) {
    const context = input.artefacts.filter((a) => !['passage', 'alias', 'node'].includes(a.kind) && !supersededSource(a) && (a.kind !== 'actor' || a.id.startsWith('s2_')));
    // `modelApplicability` counts the graph assertions that trigger each pattern
    // and the result was read only as prose. A pattern with no trigger at all is
    // a fact about the policy, worth saying in the assessment.
    if (stage === 7) {
      const unsupported = modelApplicability(input.artefacts).filter((p) => !p.triggerEvidence.length).map((p) => p.pattern.replaceAll('_', ' '));
      if (unsupported.length) output.warnings.push(`${unsupported.length} of ${PATTERNS.length} interaction patterns have no supporting relationship in the policy graph and were assessed on inference alone: ${unsupported.join(', ')}.`);
    }
    // ONE FIT FOR THE WHOLE FAN-OUT: every call here is handed the identical
    // context, and both stages cached 0.2% without it. See sync-core.mjs.
    await fanOut((stage === 7 ? PATTERNS : SCENARIOS).map((key) => ({ key, context: orderedContext(context, [], stage === 7 ? 'patterns' : 'scenarios', [[]], new Set(hypotheses)), describe: `The ${key.replaceAll('_', ' ')} ${stage === 7 ? 'interaction model' : 'scenario'}`, extra: { protect: hypotheses } })));
  } else if (stage === 6) {
    // One evidence pass per research question, so retrieved sources are read
    // against the question they answer rather than all at once. Both the depth
    // and the size of a single call improve; the shipped code sent everything in
    // one request and hit the context ceiling as soon as research succeeded.
    const inventory = input.artefacts.filter((a) => !['passage', 'research_source', 'alias', 'node'].includes(a.kind) && (a.kind !== 'actor' || a.id.startsWith('s2_')));
    // Evidence is evidence FOR OR AGAINST a claim, so this is the one stage whose
    // output is about the material the shed order calls superseded. Shed the
    // claims and the model, asked for evidence and shown none of them, emits the
    // claims instead: three consecutive responses with nothing usable in them,
    // and a dead stage. Measured live on 2026-09-10, questions 6, 7 and 8.
    const claims = inventory.filter((a) => a.kind === 'claim').map((a) => a.id);
    const answerable = input.artefacts.filter((a) => a.kind === 'research_question')
      .map((question) => ({ question, sources: input.artefacts.filter((a) => a.kind === 'research_source' && a.data.questionId === question.id) }))
      .filter(({ sources }) => sources.length);
    // A research question carries every source retrieved for it, so THIS is the
    // fan-out whose per-call block is big and uneven. Measured 2026-09-18: a flat
    // allowance put these payloads over `FIT_LIMIT` and the stage cached 0.0%.
    const evidenceOwns = answerable.map(({ question, sources }) => [question, ...sources]);
    await fanOut(answerable.map(({ question, sources }) => ({ key: question.id, context: orderedContext(inventory, [question, ...sources], 'evidence', evidenceOwns), describe: `Evidence for “${question.label}”`, extra: { protect: [question.id, ...sources.map((a) => a.id), ...claims] } })));
    // The document's own evidence pass runs last and alone: its key is `main`, so
    // it takes no sequence number and cannot be reordered by the fan-out above.
    await attempt('main', fitOnce(inventory, claims), 'Evidence drawn from the policy document itself', { protect: claims });
  } else if (stage === 8) {
    output.artefacts = runPolicyTests(input.artefacts, { discarded: input.graphLoss ?? 0, uncovered: graphUncovered(input.artefacts) });
  } else if (stage === 10) {
    // Every resolved actor with a profile is a candidate for the red team, and
    // `limits.actors` bounds how many get one. The most connected go first —
    // an actor nothing depends on has little to exploit — and the rest are named
    // in a warning rather than dropped silently.
    const profiles = input.artefacts.filter((a) => a.kind === 'profile');
    // Full profiles only, where there are any: a short one is three lines of
    // motive, and the red team needs the whole profile to reason from. Stage 4
    // wrote full ones for more bodies than this stage takes, ranked the same way.
    const { actors: ranked, basis } = rankActors(input.artefacts, fullOnly(profiles));
    // Which signal chose them is part of the finding, not a footnote: on a thin
    // graph this is "who the paper talks about most", not "who the policy runs
    // through", and those are different claims.
    const order = basis === 'connectivity'
      ? 'They are the least connected in the policy graph, not the least important.'
      : 'The policy graph recorded too few relationships to rank on, so these were ordered by how often the document names them rather than by how much of the policy runs through them.';
    if (basis === 'prominence') output.warnings.push('The policy graph held no relationships for the profiled actors, so the red team selected its actors by how prominently the document names them rather than by connectivity. Treat the choice of who was red-teamed as a reflection of the document, not of the policy structure.');
    if (ranked.length > limits.actors) output.warnings.push(`${ranked.length - limits.actors} of ${ranked.length} profiled actors were not red-teamed in this pass: ${ranked.slice(limits.actors).map((a) => a.label).join(', ')}. ${order} A deep run covers more of them.`);
    const base = input.artefacts.filter((a) => !['passage', 'alias', 'node', 'profile'].includes(a.kind) && !supersededSource(a) && (a.kind !== 'actor' || a.id.startsWith('s2_')));
    // STAGE 14'S SHAPE: the actor and its profiles go in as this call's own, so a
    // per-call `protect` can no longer move the shedding boundary. The actor
    // STAYS in the shared block too: that block is fitted once and reused by
    // every call, so taking the first call's actor out of it took that body out
    // of every other call's context as well.
    const chosen = ranked.slice(0, limits.actors);
    const playOwns = chosen.map((actor) => [
      ...base.filter((a) => a.id === actor.id),
      ...profiles.filter((p) => p.data.actorId === actor.id),
    ]);
    await fanOut(chosen.map((actor, i) => ({
      key: actor.id,
      context: orderedContext(base, playOwns[i], 'plays', playOwns, new Set(hypotheses)),
      describe: `Exploitation plays for ${actor.label}`,
      extra: { protect: [actor.id, ...profiles.filter((p) => p.data.actorId === actor.id).map((p) => p.id), ...hypotheses], priorPersona: priors.get(actor.id) ?? null },
    })));
    scoreExploits(output.artefacts);
  } else if (stage === PERSONA_STAGE) {
    // The library is a bonus, and it must never cost a completed assessment. The
    // report was written at the previous stage; a dead provider here is a warning
    // about the library, not a failed run — so every failure is caught, and the
    // stage is exempt from the "produced nothing" rule at the bottom.
    // A SEALED RUN SKIPS THE CALLS ENTIRELY, and that is a cost fix as much as a
    // correctness one. The worker already declines to apply this stage's
    // `persona_link` artefacts, because the library outlives the runs that feed
    // it — so running the fan-out anyway spends one model call per profiled body
    // to produce artefacts whose only consumer will throw them away.
    const profiles = input.sealed ? [] : input.artefacts.filter((a) => a.kind === 'profile');
    const ranked = input.sealed ? [] : rankActors(input.artefacts, fullOnly(profiles)).actors.slice(0, limits.actors);
    if (input.sealed) {
      output.warnings.push('This is a sealed assessment, so nothing was written to the persona library and no model call was made for it. A dossier drawn from this paper would outlive the run and survive its purge, which is the residue sealing exists to remove.');
    }
    /**
     * THROUGH `fanOut`, NOT A LOOP OF ITS OWN.
     *
     * This was a serial `for` over the ranked actors — twelve calls one after
     * another, 7.7 to 10 minutes on every real run, for work whose units share
     * nothing. The pool runs them `lanes` at a time and folds them in rank order,
     * so the write-back the worker applies afterwards meets the same links in
     * the same order at any number of lanes.
     *
     * The failure rule is the one thing that differs from every other fan-out.
     * The library is a bonus, so a failed unit is a warning about the library
     * and nothing more: no gap, no consecutive count, and so no way for a dead
     * provider here to fail a run whose report is already written.
     */
    await fanOut(ranked.map((actor) => {
      const own = profiles.filter((p) => p.data.actorId === actor.id);
      const plays = input.artefacts.filter((a) => a.kind === 'exploit' && a.data.actorId === actor.id);
      const context = [actor, ...own, ...plays];
      return { key: actor.id, context, describe: actor.label, extra: { protect: context.map((a) => a.id), priorPersona: priors.get(actor.id) ?? null } };
    }), undefined, (unit, err) => {
      deps.signal.throwIfAborted();
      if (!(err instanceof PolicyError)) throw err;
      output.warnings.push(`${unit.describe} was not written to the persona library: ${err.message} The assessment itself is unaffected.`);
    });
    if (!output.artefacts.length && ranked.length) output.warnings.push('No actor could be written to the persona library on this run. Nothing in the assessment above depends on it.');
  } else if (stage === THEORY_STAGE) {
    // A causal theory is inspectable per intervention. One enormous narrative
    // would conceal which link belongs to which mechanism and hit the same
    // output ceiling the graph once hit.
    const mechanisms = input.artefacts.filter((a) => a.kind === 'mechanism');
    const context = input.artefacts.filter((a) => !['passage', 'alias', 'node', 'persona_link'].includes(a.kind) && (a.kind !== 'actor' || a.id.startsWith('s2_')));
    // One mechanism per call, so these are small and even — but measured the
    // same way rather than assumed.
    const theoryOwns = mechanisms.map((mechanism) => context.filter((a) => a.id === mechanism.id));
    await fanOut(mechanisms.map((mechanism) => ({
      key: mechanism.id,
      // The mechanism being written about is appended as this call's own, so the
      // one artefact the call exists for is never shed. It stays in the shared
      // block as well: that block is fitted ONCE and reused, and pulling the
      // first call's mechanism out of it pulled that mechanism out of every
      // other call — found by the phase 19 test that counts them.
      context: orderedContext(context, context.filter((a) => a.id === mechanism.id), 'theory', theoryOwns),
      describe: `Theory of change for ${mechanism.label}`,
      extra: { protect: [mechanism.id, ...hypotheses] },
    })));
  } else if (stage === ASSURANCE_STAGE) {
    // Separate calls stop one reassuring overall impression from washing over
    // seven distinct checks. Each reviewer sees the same saved assessment but
    // receives only one challenge remit and cannot rewrite the report.
    const context = input.artefacts.filter((a) => !['passage', 'alias', 'node', 'persona_link'].includes(a.kind) && (a.kind !== 'actor' || a.id.startsWith('s2_')));
    // The report itself, which every challenge must see whatever its remit, and
    // which is the same list for all seven — so it is protected once in the
    // shared fit rather than seven times at the boundary. See sync-core.mjs.
    const assured = [...context.filter((a) => ['finding', 'recommendation', 'causal_chain', 'option_appraisal', 'evaluation_plan', 'evidence'].includes(a.kind)).map((a) => a.id), ...hypotheses];
    const remit = (category: string) => ({
      key: category,
      context: orderedContext(context, [], 'assurance', [[]], new Set(assured)),
      describe: `${category.replaceAll('_', ' ')} challenge`,
      extra: { targetCategory: category, protect: assured },
    });
    await fanOut(ASSURANCE_CATEGORIES.map(remit));
    /**
     * DIVERGENCE: THE FAN-OUT SHAPE OF THE SAME TOP-UP.
     *
     * A fan-out gap needs no new instruction: a unit that answered emptily, or
     * whose one artefact was quarantined, is re-run as itself. `reserve` hands it
     * a fresh slot, so the second attempt's identifiers cannot collide with the
     * first's, and `attempt` records a failure as a gap exactly as the sweep did.
     *
     * Stage 16 is the fan-out whose coverage rule throws on a SINGLE absent
     * category, which makes it the one where a silent unit ends the run. Stages 7,
     * 9 and 14 already tolerate a shortfall through `requireMajority` or a half
     * coverage floor, so they are left alone.
     */
    const absent = () => ASSURANCE_CATEGORIES.filter((category) =>
      !output.artefacts.some((a) => a.kind === 'assurance_challenge' && a.data.category === category));
    // No warning for the ask itself: a gap the second sweep closes is not a limit,
    // and `requireMajority` reports one that survives. See the note in the
    // single-call branch below.
    const missing = absent();
    if (missing.length) await fanOut(missing.map(remit));
  } else if (stage === 11) {
    // Failing to LOAD the comparison must not cost the assessment its stage; the
    // rest of this run is unaffected by whether the other papers could be read.
    let neighbours: Neighbour[] = [];
    try { neighbours = (await deps.neighbours?.()) ?? []; }
    catch { output.warnings.push('The other assessments on this account could not be read, so cross-policy exposure was not examined.'); }
    if (input.sealed) {
      output.warnings.push('This is a sealed assessment, so it was not compared against any other paper on this account. Comparing would put this document’s wording into another assessment’s stored prompt, which destroying this run’s key could never reach. Weaknesses that only appear when policies coexist are outside this assessment.');
    } else if (!neighbours.length) {
      output.warnings.push('No other completed policy assessment was available to compare, so cross-policy exposure could not be examined. Weaknesses that only appear when policies coexist are outside this assessment.');
    } else {
      const context = input.artefacts.filter((a) => !['passage', 'alias', 'node'].includes(a.kind) && !supersededSource(a) && (a.kind !== 'actor' || a.id.startsWith('s2_')));
      const identity = crossIdentityHints(input.artefacts, neighbours);
      await attempt('main', fitOnce(context), `Cross-policy exposure against ${neighbours.length} other assessment${neighbours.length === 1 ? '' : 's'}`, { neighbours, identity });
      const known = new Set(neighbours.map((n) => n.id));
      const invented = output.artefacts.filter((a) => a.kind === 'cross_policy' && !known.has(String(a.data.otherAnalysisId)));
      if (invented.length) {
        output.artefacts = output.artefacts.filter((a) => !invented.includes(a));
        output.warnings.push(`${invented.length} cross-policy claim${invented.length === 1 ? '' : 's'} named an assessment that was not supplied and ${invented.length === 1 ? 'was' : 'were'} discarded.`);
      }
    }
  } else {
    // Full source text was inspected passage by passage. Later stages receive the
    // structured inventory plus source quotes, not a silently truncated paper.
    const everything = input.artefacts.filter((a) => a.kind !== 'passage' && (stage !== 2 || a.kind === 'actor') && (stage < 3 || a.kind !== 'actor' || a.id.startsWith('s2_')));
    // A finding must cite a test, model, scenario, exploitation play or
    // cross-policy exposure, so synthesis pins every one of them into the call.
    // Without that the context budget shed the lot — they are the last things
    // produced and carry the lowest confidence — and the model, still required
    // to cite a result, invented identifiers for results it had never seen.
    const protect = stage === SYNTHESIS_STAGE
      ? [...everything.filter((a) => (RESULT_KINDS as readonly string[]).includes(a.kind)).map((a) => a.id), ...hypotheses]
      : stage === APPRAISAL_STAGE
        ? [...everything.filter((a) => ['causal_chain', 'finding', 'evidence'].includes(a.kind)).map((a) => a.id), ...hypotheses]
        : stage === ASSURED_SYNTHESIS_STAGE
          ? [...everything.filter((a) => ['finding', 'recommendation', 'causal_chain', 'option_appraisal', 'evaluation_plan', 'assurance_challenge'].includes(a.kind) || (RESULT_KINDS as readonly string[]).includes(a.kind)).map((a) => a.id), ...hypotheses]
          : [];
    // Scoped and fitted once, so the top-up below asks from the same context.
    const context = fitOnce(everything, protect);
    // Round ONE of the enquiry has to be told its own ceiling. `remainingQuestions`
    // was passed only to the follow-up rounds, so the first round was bounded by a
    // number written into the prompt — and raising `questions` in the contract then
    // changed nothing at all, which is the whole of what stage 5 does.
    const extra = { ...(protect.length ? { protect } : {}), ...(stage === 5 ? { remainingQuestions: limits.questions } : {}) };
    await request('main', context, extra);
    /**
     * DIVERGENCE: ONE MORE ASK FOR EXACTLY WHAT IS MISSING.
     *
     * The coverage rules at the bottom of this function decide whether a stage
     * did its job. When one of them finds a gap it throws, the worker records an
     * attempt, and the stage is claimed again — where `provider.ts` replays the
     * CACHED `main` response, because the payload hash has not changed. The
     * omission is therefore reproduced exactly, and the two repair rounds that
     * follow are aimed at artefacts triage REJECTED rather than at what was never
     * returned. Retrying cannot reach a different answer.
     *
     * Measured on assessment 36ebca37, the Post-16 run of 2026-09-19: stage 17
     * failed NINE consecutive times on "N independent challenges have no response
     * in the revised assessment", answering five or six of seven each time and
     * discarding a complete nineteen-finding assured report on every attempt.
     * 498 of that run's 623 minutes went on it, and what finally unblocked it was
     * a change of model — which is luck, not a mechanism.
     *
     * So the gap is named and asked about ONCE, before any rule decides. What
     * makes it a different question is the PAYLOAD: `provider.ts` keys its cache
     * on `(stageId, inputHash, promptKey)` and not on the call key, so it is
     * `coverageGap` and the call's own `idPrefix` that miss the cache where a bare
     * retry hits it. A later execution of the same stage replays both calls from
     * the cache, which is correct — it is the degraded gate below, not this, that
     * stops a stage retrying its way to the same place.
     *
     * ONE round, deliberately. A deterministic gap asked about differently is a
     * different question; asking it five times is the loop this replaces.
     *
     * This is stage 2's `unclaimedMentions` loop, which has done exactly this for
     * source mentions since before the fork, applied to the two stages whose
     * coverage rule can end a run over a single absence.
     */
    const gap = stage === ASSURED_SYNTHESIS_STAGE
      ? input.artefacts.filter((a) => a.kind === 'assurance_challenge')
        .filter((c) => !output.artefacts.some((a) => a.kind === 'assurance_response' && a.data.challengeId === c.id))
        .map((a) => a.id)
      : stage === APPRAISAL_STAGE
        // Mirrors the appraisal rule below. Written out rather than shared with it
        // because the two sit 120 lines apart and this is a recorded divergence:
        // a constant hoisted between them is a much larger patch to re-apply.
        ? [...['business_as_usual', 'minimum_intervention', 'proposed_policy', 'alternative']
          .filter((type) => !output.artefacts.some((a) => a.kind === 'option_appraisal' && a.data.optionType === type)),
        ...(output.artefacts.some((a) => a.kind === 'evaluation_plan') ? [] : ['evaluation_plan'])]
        : [];
    if (gap.length) {
      /**
       * A RECOVERY IS NOT A LIMIT, so it writes no warning of its own.
       *
       * Every warning is carried into the later stages' context and counted on
       * the report's own account of what the run discarded. A gap that the second
       * ask CLOSED is neither: the stage is complete, and saying so would spend
       * the warning budget claiming a deficiency that no longer exists. That the
       * second call happened is on the durable record either way — `policy_model_calls`
       * holds it under the key `topup`. A gap that survives is reported by the
       * coverage rule below, which is the thing that knows it survived.
       */
      const before = output.artefacts.length;
      /**
       * A TOP-UP THAT FAILS MUST NOT CHANGE THE STAGE'S OWN VERDICT.
       *
       * `attempt` routes a failure through `gap`, which sets `fault.last` — and
       * the appraisal rule below throws `fault.last?.code ?? 'coverage'`, while
       * `worker.ts` treats `budget`, `extraction` and `timeout` as codes NOT worth
       * retrying. So a top-up that merely ran out of time would relabel the
       * stage's coverage failure as a timeout and spend two of its three attempts
       * at a stroke: an extra chance, taken, turning into a penalty. It also
       * feeds `consecutive`, which exists to detect a dead provider from the
       * stage's own sweep and not from a bonus call appended to it.
       *
       * So this catch is the whole of the handling. It writes no warning either:
       * the rule below reports the gap that survived, in the sentence
       * `stage-facts.ts` counts, and reporting it twice would put a phantom
       * "could not be assessed" beside it. The failed call itself is on the
       * durable record in `policy_model_calls`, with its error.
       */
      try {
        await request('topup', context, { ...extra, coverageGap: gap });
      } catch (err) {
        deps.signal.throwIfAborted();
        if (!(err instanceof PolicyError)) throw err;
      }
      /**
       * A TOP-UP CONTRIBUTES WHAT IT WAS ASKED FOR, AND WHAT THAT RESTS ON.
       *
       * The instruction says "return only the missing artefacts", and a model that
       * ignores it hands back the whole report a second time. Nothing else would
       * catch that: the identifiers carry this call's own slot so they collide
       * with nothing, and the result is a duplicate set of findings under a second
       * review summary — which the rule below then fails on, turning a stage that
       * was one response short into one that cannot finish at all.
       *
       * But the answer is not simply "the kind that answers the gap". Both these
       * stages may write an `assumption` (`STAGE_KINDS`), and both
       * `option_appraisal.assumptions` and an `exploit`'s preconditions are
       * `min(1)` — so a call that obeys the instruction perfectly may still have
       * to mint the hypothesis its one new row rests on. Admitting only the row
       * would strand it, and `semanticFault` folds a cited assumption into `refs`,
       * so the row would then be dropped for leaning on something absent: the one
       * thing that was missing, deleted, under a warning saying the stage already
       * held it.
       *
       * So keep what answers the gap, then close over what those rows cite from
       * this same call. A closure rather than one pass, because an
       * `evaluation_plan` citing an option appraisal citing a new assumption is
       * two hops, and one pass would resolve it or not depending on array order.
       */
      const wanted = new Set(gap);
      const answers = (a: Artefact) => stage === ASSURED_SYNTHESIS_STAGE
        ? a.kind === 'assurance_response' && wanted.has(String(a.data.challengeId))
        : (a.kind === 'option_appraisal' && wanted.has(String(a.data.optionType))) || (a.kind === 'evaluation_plan' && wanted.has('evaluation_plan'));
      const added = output.artefacts.slice(before);
      const byId = new Map(added.map((a) => [a.id, a]));
      const keep = new Set(added.filter(answers).map((a) => a.id));
      for (let settled = false; !settled;) {
        settled = true;
        for (const id of [...keep]) {
          for (const ref of byId.get(id)?.refs ?? []) {
            if (byId.has(ref) && !keep.has(ref)) { keep.add(ref); settled = false; }
          }
        }
      }
      const unwanted = added.filter((a) => !keep.has(a.id));
      if (unwanted.length) {
        output.artefacts = output.artefacts.filter((a) => keep.has(a.id) || !byId.has(a.id));
        output.warnings.push(`The second call restated ${unwanted.length} item${unwanted.length === 1 ? '' : 's'} this stage already holds; ${unwanted.length === 1 ? 'it was' : 'they were'} discarded rather than recorded twice. Only what was actually missing, and what that rests on, was taken from it.`);
      }
    }
  }

  const pursue = async (questions: Artefact[], round: number) => {
    for (const question of questions) question.data.priority = Number(priority(question).toFixed(4));
    questions.sort((a, b) => priority(b) - priority(a));
    // A query that reproduces the paper verbatim would put an unpublished policy
    // into a third party's query logs. The prompt asks for a bounded public
    // query; this is what enforces it.
    const corpus = documentShingles(input.artefacts);
    let safe = questions.filter((q) => !quotesDocument(String(q.data.searchStrategy ?? ''), corpus));
    if (safe.length < questions.length) output.warnings.push(`${questions.length - safe.length} research question${questions.length - safe.length === 1 ? ' was' : 's were'} not searched because the query quoted the policy document; the document is not sent to a search provider.`);
    if (!safe.length) return;
    /**
     * A run-wide ceiling on retrieval, in the spirit of the 1,500-call limit: a
     * runaway guard, not a budget anybody should be spending up to.
     *
     * It exists because the enquiry is no longer one planned pass. Stage 5 runs
     * up to `rounds` of `questions`, and six later stages may each follow up
     * `followUps` more — so the number of retrievals is now a product of things
     * the model decides rather than a single cap on a single stage.
     */
    const held = [...input.artefacts, ...output.artefacts].filter((a) => a.kind === 'research_source').length;
    const room = limits.sources - held;
    // While there is ANY room left, the top question is still asked. Budgeting in
    // whole `results` allotments would cut the enquiry off with room to spare —
    // a run holding 157 of 159 would drop every remaining question — and a
    // question rarely returns its full allowance anyway. Overshooting a runaway
    // guard by a handful of sources is the cheaper mistake, and the guard carries
    // a tenth of headroom for exactly this.
    const affordable = room > 0 ? Math.max(1, Math.floor(room / limits.results)) : 0;
    if (affordable < safe.length) {
      const dropped = safe.slice(affordable);
      output.warnings.push(`${dropped.length} question${dropped.length === 1 ? '' : 's'} could not be researched: this assessment holds ${held} sources against a ceiling of ${limits.sources}, and what is left will not cover ${dropped.length === 1 ? 'it' : 'them'}. Not researched: ${dropped.map((q) => q.label).join(', ')}. ${dropped.length === 1 ? 'It remains' : 'They remain'} recorded as ${dropped.length === 1 ? 'a question' : 'questions'} with no evidence behind ${dropped.length === 1 ? 'it' : 'them'}.`);
      safe = safe.slice(0, affordable);
    }
    if (!safe.length) return;
    // The run's own lanes: a question's search and its full reads are I/O, and
    // were the one part of a research stage still going one request at a time.
    const researched = await deps.research(safe, deps.signal, limits.results, lanes);
    output.artefacts.push(...researched.artefacts);
    output.warnings.push(...researched.warnings.map((w) => round > 1 ? `Enquiry round ${round}: ${w}` : w));
  };

  const kinds = (...wanted: string[]) => wanted.filter((k) => !output.artefacts.some((a) => a.kind === k));
  if (stage === 1) {
    // The model scores every assumption on importance, uncertainty and consequence.
    // Stamp the product so the research planner, the report's high-risk chapter and
    // the dashboard all rank by the same reproducible figure.
    for (const a of output.artefacts) if (a.kind === 'assumption') a.data.priority = Number(priority(a).toFixed(4));
    const missing = kinds('claim', 'mechanism', 'assumption', 'actor');
    if (missing.length) throw new PolicyError(fault.last?.code ?? 'coverage', `The document did not yield the required claim, mechanism, assumption and actor inventory.${fault.last ? ` Last reason: ${fault.last.message}` : ''}`);
  }
  if (stage === 2) {
    // A real 20-page policy yields ~50 source mentions, and asking one call to
    // claim every last one of them is the all-or-nothing rule again: on
    // 2026-09-09 a live run reached this stage with 224 artefacts and died here.
    // So: name what was missed and ask for JUST those, twice, then require a
    // strict majority and record the rest as a gap the reader can see.
    const mentions = input.artefacts.filter((a) => a.kind === 'actor');
    const unclaimed = () => mentions.filter((m) => !output.artefacts.some((a) => a.kind === 'actor' && ((a.data.mentions as string[]) ?? []).includes(m.id)));
    for (let round = 1; round <= 2; round++) {
      const missed = unclaimed();
      if (!missed.length) break;
      await attempt(`unclaimed${round}`, [...input.artefacts.filter((a) => a.kind === 'actor'), ...output.artefacts.filter((a) => a.kind === 'actor')], `${missed.length} unresolved source mention${missed.length === 1 ? '' : 's'}`, { unclaimedMentions: missed.map((m) => ({ id: m.id, label: m.label })) });
    }
    output.artefacts = preserveAmbiguity(output.artefacts, input.artefacts);
    const missed = unclaimed();
    if (missed.length * 2 >= mentions.length) throw new PolicyError('coverage', `Entity resolution claimed only ${mentions.length - missed.length} of ${mentions.length} source mentions.${fault.last ? ` Last reason: ${fault.last.message}` : ''}`);
    if (missed.length) output.warnings.push(`${missed.length} of ${mentions.length} source mentions were never resolved into a named body: ${missed.slice(0, 8).map((m) => m.label).join(', ')}${missed.length > 8 ? `, and ${missed.length - 8} more` : ''}. Those actors are absent from the graph, the profiles and the red team.`);
  }
  if (stage === 3) {
    if (kinds('edge').length) throw new PolicyError('coverage', 'The graph stage did not produce any inspectable relationships.');
    // "One node and one edge survived" is not a graph. Every later structural
    // check reads this stage's output, so losing the majority of it here would be
    // laundered into confident-looking verdicts drawn from almost nothing.
    if (rejected > output.artefacts.length) throw new PolicyError('coverage', `More of the policy graph was discarded than kept (${rejected} discarded, ${output.artefacts.length} retained). The structural checks would have been drawn from a fragment.`);
  }
  if (stage === 4 && !output.artefacts.some((a) => a.kind === 'profile')) throw new PolicyError(fault.last?.code ?? 'coverage', `No actor could be profiled, so there are no incentives to reason about.${fault.last ? ` Last reason: ${fault.last.message}` : ''}`);
  if (stage === 5) {
    const questions = output.artefacts.filter((a) => a.kind === 'research_question');
    if (!questions.length || questions.length > limits.questions || questions.length !== output.artefacts.length) throw new PolicyError('coverage', `Research planning must produce between one and ${limits.questions} targeted questions.`);
    await pursue(questions, 1);
    // Rounds beyond the first are the line of enquiry: each one is planned from
    // what the last one actually found, not from the policy document again. A
    // round that raises no new question ends the enquiry rather than padding it.
    for (let round = 2; round <= limits.rounds; round++) {
      const asked = output.artefacts.filter((a) => a.kind === 'research_question');
      const sources = output.artefacts.filter((a) => a.kind === 'research_source');
      const before = output.artefacts.length;
      const context = input.artefacts.filter((a) => a.kind !== 'passage' && (a.kind !== 'actor' || a.id.startsWith('s2_')));
      await attempt(`round${round}`, fitOnce([...context, ...asked, ...sources], sources.map((a) => a.id)), `Follow-up enquiry round ${round}`, { enquiryRound: round, remainingQuestions: limits.questions, protect: sources.map((a) => a.id) });
      const followUps = output.artefacts.slice(before).filter((a) => a.kind === 'research_question');
      if (!followUps.length) { output.warnings.push(`Enquiry round ${round} raised no further question, so the enquiry stopped there.`); break; }
      await pursue(followUps, round);
    }
  }
  if (stage === 7) requireMajority(output, PATTERNS, (a) => String(a.data.pattern), 'interaction model', fault.last);
  if (stage === 9) requireMajority(output, SCENARIOS, (a) => String(a.data.scenario), 'scenario', fault.last);
  if (stage === 10 && !output.artefacts.some((a) => a.kind === 'exploit')) throw new PolicyError(fault.last?.code ?? 'coverage', `No actor could be red-teamed, so the assessment has no exploitation playbook.${fault.last ? ` Last reason: ${fault.last.message}` : ''}`);
  if (stage === THEORY_STAGE) {
    const mechanisms = input.artefacts.filter((a) => a.kind === 'mechanism');
    const covered = new Set(output.artefacts.filter((a) => a.kind === 'causal_chain').map((a) => String(a.data.mechanismId)));
    if (!mechanisms.length || covered.size * 2 <= mechanisms.length) throw new PolicyError(fault.last?.code ?? 'coverage', `Only ${covered.size} of ${mechanisms.length} mechanisms received a theory of change.${fault.last ? ` Last reason: ${fault.last.message}` : ''}`);
    if (covered.size < mechanisms.length) output.warnings.push(`${mechanisms.length - covered.size} of ${mechanisms.length} mechanisms have no theory of change. The causal review is incomplete on those grounds.`);
  }
  if (stage === APPRAISAL_STAGE) {
    const types = new Set(output.artefacts.filter((a) => a.kind === 'option_appraisal').map((a) => String(a.data.optionType)));
    const missing = ['business_as_usual', 'minimum_intervention', 'proposed_policy', 'alternative'].filter((type) => !types.has(type));
    /**
     * DIVERGENCE: A LOAD-BEARING CORE THAT THROWS, AND A TAIL THAT WARNS.
     *
     * The synthesis rule below already draws this distinction — `coreSections`
     * against the rest — and says why in its own comment: a missing chapter is a
     * gap the reader should see named, not a reason to throw away an assessment.
     * Every other gate in this function threw on a single absence, and the one at
     * stage 17 is what cost the live run its day.
     *
     * The proposal itself and the evaluation plan are the two an appraisal cannot
     * be read without: without the first there is nothing to appraise, and without
     * the second no way to tell whether it worked. A missing counterfactual makes
     * the comparison narrower, which is a limit to report rather than a failure.
     */
    const core = missing.filter((type) => type === 'proposed_policy');
    if (core.length || !output.artefacts.some((a) => a.kind === 'evaluation_plan')) throw new PolicyError(fault.last?.code ?? 'coverage', `The appraisal omitted ${core.length ? core.join(', ').replaceAll('_', ' ') : 'the evaluation plan'}.${fault.last ? ` Last reason: ${fault.last.message}` : ''}`);
    // Phrased "N of M ... were not assessed" because that is the sentence
    // `stage-facts.ts` parses into a counted limit; anything else it does not
    // recognise is filed as an open QUESTION, which is a different claim. Same
    // wording `requireMajority` uses, including its plural for a count of one.
    if (missing.length) output.warnings.push(`${missing.length} of 4 policy options were not assessed: ${missing.join(', ').replaceAll('_', ' ')}. The comparison is narrower than the appraisal method asks for; read it as incomplete on those grounds.`);
  }
  if (stage === ASSURANCE_STAGE) {
    // DIVERGENCE: the top-up above has already asked again for anything absent, so
    // what reaches here is a remit that failed twice. `requireMajority` is this
    // codebase's existing statement of the judgement — a fixed library is only a
    // guarantee if most of it ran, and the absences are named either way — and it
    // is what stages 7 and 9 have always used for the same shape of rule.
    requireMajority(output, ASSURANCE_CATEGORIES, (a) => String(a.data.category), 'challenge remit', fault.last);
  }
  if (stage === SYNTHESIS_STAGE || stage === ASSURED_SYNTHESIS_STAGE) {
    // A missing chapter is a gap the reader should see named, not a reason to
    // throw away a whole assessment. Only the headline, the exploitation
    // chapter and the redesign options are load-bearing.
    const expected = stage === SYNTHESIS_STAGE
      ? REPORT_SECTIONS.filter((section) => !['theory_of_change', 'options_appraisal', 'evaluation_plan', 'assurance'].includes(section))
      : REPORT_SECTIONS;
    const missing = expected.filter((section) => !output.artefacts.some((a) => a.data.section === section));
    const coreSections = stage === ASSURED_SYNTHESIS_STAGE
      ? ['executive_assessment', 'high_risk_assumptions', 'exploitation', 'theory_of_change', 'options_appraisal', 'evaluation_plan', 'assurance']
      : ['executive_assessment', 'high_risk_assumptions', 'exploitation'];
    const core = missing.filter((m) => coreSections.includes(m));
    if (core.length || !output.artefacts.some((a) => a.kind === 'recommendation')) {
      // Naming the missing chapters describes the symptom. What a reader needs is
      // why they are missing, which is always the reason the findings themselves
      // were quarantined — and that reason is already recorded.
      throw new PolicyError('coverage', `The final assessment omitted ${core.length ? core.join(', ').replaceAll('_', ' ') : 'its redesign options'}.${fault.last ? ` Last reason: ${fault.last.message}` : ''}`);
    }
    if (missing.length) output.warnings.push(`The final assessment has no ${missing.map((m) => m.replaceAll('_', ' ')).join(', ')} section. Read it as incomplete on those grounds.`);
  }
  if (stage === ASSURED_SYNTHESIS_STAGE) {
    const challenges = input.artefacts.filter((a) => a.kind === 'assurance_challenge');
    const responses = output.artefacts.filter((a) => a.kind === 'assurance_response');
    const responded = new Set(responses.map((a) => String(a.data.challengeId)));
    const missing = challenges.filter((a) => !responded.has(a.id));
    /**
     * DIVERGENCE: THE RULE THAT COST THE LIVE RUN ITS DAY.
     *
     * Nine attempts, five or six of seven challenges answered every time, and a
     * complete nineteen-finding assured report discarded on each — see the top-up
     * comment in the single-call branch above, which now asks once for exactly
     * what is absent before this decides anything.
     *
     * What remains is the judgement itself, and it takes the shape every other
     * fixed library in this file uses: a majority is the guarantee, a shortfall is
     * a named limit. A report answering six of seven challenges is a report with
     * one open objection, which is what `unresolvedMaterialChallenges` below is
     * for; one answering two is a report that did not do the job.
     */
    // `challenges.length &&` because `0 * 2 >= 0` is true: a stage 17 handed no
    // challenges at all would otherwise throw "0 of 0 have no response". The rule
    // it replaces was vacuously safe there, and stage 16's own floor makes this
    // unreachable in an ordinary run — but a re-seeded or hand-built one is not
    // an ordinary run, and this is the gate that must not fail for nothing.
    if (challenges.length && missing.length * 2 >= challenges.length) throw new PolicyError('coverage', `${missing.length} of ${challenges.length} independent challenge${challenges.length === 1 ? '' : 's'} ${missing.length === 1 ? 'has' : 'have'} no response in the revised assessment.`);
    if (missing.length) output.warnings.push(`${missing.length} of ${challenges.length} independent challenges were not assessed: ${missing.slice(0, 6).map((a) => String(a.data.category).replaceAll('_', ' ')).join(', ')}${missing.length > 6 ? `, and ${missing.length - 6} more` : ''}. They have no response in the revised assessment, after the model was asked a second time for them, so those objections stand unanswered rather than resolved.`);
    const summaries = output.artefacts.filter((a) => a.kind === 'review_summary');
    if (!summaries.length) throw new PolicyError('coverage', 'The revised assessment must contain a review summary, and this one has none.');
    /*
     * MORE THAN ONE IS NOT A SHORTFALL. IT IS THE CORRECTION ARRIVING TWICE.
     *
     * A corrective round answers with a whole revised assessment, its summing-up
     * included, and `provider.ts` accumulates the rounds — so a stage 17 that
     * needed any repair at all arrived here with two, and this rule threw. Asking
     * again could only add a third, which makes it a gate no retry can pass: the
     * corrective action is what breaks it.
     *
     * Measured on the "best start in life" run, 2026-09-20: `main`, `main#repair1`
     * and `main#repair2` wrote one each, three attempts failed identically, and a
     * run that had finished seventeen of eighteen stages was recorded as failed
     * for it.
     *
     * The last is the revised one; the earlier rounds are what it revises. So
     * keep it, drop what it supersedes, and say so — the same shape as the
     * challenge rule above, which phase 16 converted and left this line behind.
     */
    if (summaries.length > 1) {
      const superseded = new Set(summaries.slice(0, -1).map((a) => a.id));
      output.artefacts = output.artefacts.filter((a) => !superseded.has(a.id));
      output.warnings.push(`The revised assessment came back with ${summaries.length} review summaries, one per corrective round. The last is kept; the earlier ${superseded.size} ${superseded.size === 1 ? 'is' : 'are'} discarded as superseded.`);
    }
    const issueIds = new Set(challenges.filter((a) => a.data.finding === 'issue').map((a) => a.id));
    const accepted = responses.filter((a) => issueIds.has(String(a.data.challengeId)) && ['accepted', 'partly_accepted'].includes(String(a.data.disposition))).length;
    const unresolved = responses.filter((a) => issueIds.has(String(a.data.challengeId)) && a.data.disposition === 'unresolved');
    const material = unresolved.filter((response) => input.artefacts.find((a) => a.id === response.data.challengeId)?.data.materiality === 'high').length;
    const summary = summaries[0];
    summary.data.openChallenges = unresolved.length;
    summary.data.acceptedChallenges = accepted;
    summary.data.unresolvedMaterialChallenges = material;
    summary.data.decisionUse = material ? 'exploratory' : unresolved.length ? 'decision_support' : 'independently_challenged';
  }
  if (isPassStage(stage) && deps.passKind === 'addendum') {
    const step = passStep(stage);
    if (step === 2 && !output.artefacts.length) {
      // MATERIAL THAT CHANGES NOTHING IS A RESULT, and this is the one place the
      // pass must not behave like the main pipeline. A stage of the assessment
      // producing nothing means the assessment failed; a reconciliation
      // producing nothing means the reader attached something that does not bear
      // on the report, which they are entitled to be told plainly.
      output.warnings.push('Nothing in this material bears on what the assessment already holds. It was read in full and produced no evidence for or against any claim, and no conflict with anything the report concludes. That is a result: the assessment stands as it did.');
    }
    if (step === 3) {
      const summaries = output.artefacts.filter((a) => a.kind === 'addendum_summary');
      if (summaries.length !== 1) throw new PolicyError(fault.last?.code ?? 'coverage', `The addendum must record exactly one summary of what the material changed; it recorded ${summaries.length}.${fault.last ? ` Last reason: ${fault.last.message}` : ''}`);
      /**
       * THE COUNTS ARE COMPUTED HERE, NOT TAKEN FROM THE MODEL.
       *
       * Same rule as `review_summary`'s three counts above, and for the same
       * reason: the banner on the verdict step reads this tally, the reader
       * reads the banner, and a tally the model wrote drifts from the rows it is
       * a tally of the moment triage quarantines one of them. The revisions are
       * the fact; this is arithmetic over them.
       */
      const revisions = output.artefacts.filter((a) => a.kind === 'revision');
      const summary = summaries[0];
      summary.data.pass = passOf(stage);
      for (const status of REVISION_STATUSES) summary.data[status] = revisions.filter((a) => a.data.status === status).length;
      const moved = revisions.filter((a) => a.data.status !== 'upheld').length;
      output.warnings.push(revisions.length
        ? `This addendum judged ${revisions.length} of the assessment's conclusions, and ${moved === 0 ? 'left every one of them standing' : `moved ${moved}`}. A conclusion this material does not touch has no judgement here and is unchanged.`
        : 'This addendum judged none of the assessment\u2019s conclusions: nothing the material established bears on a finding, a recommendation or an exploitation play. The report stands as it was.');
    }
  }
  // Two stages may legitimately produce nothing. A reader with a single policy
  // has no cross-policy exposure, and saying so is the answer; and the persona
  // library is written after the report, so an empty one costs the assessment
  // nothing that was not already delivered.
  //
  // The reconciliation step joins them: see the addendum block above for why
  // material that bears on nothing is an answer rather than a failure. Its
  // verdict step still must produce a summary, and does so through its own rule.
  const mayBeEmpty = stage === 11 || stage === PERSONA_STAGE || (isPassStage(stage) && deps.passKind === 'addendum' && passStep(stage) === 2);
  if (!output.artefacts.length && !mayBeEmpty) throw new PolicyError(fault.last?.code ?? 'coverage', `This stage produced no artefacts.${fault.last ? ` Last reason: ${fault.last.message}` : ''}`);

  /**
   * A LATER STAGE MAY NOW ASK.
   *
   * Stage 5 was the only stage that could raise a question, and it runs before
   * the tests, interaction models, scenarios, exploitation playbook, appraisal
   * and challenge exist — before anything that would raise a question worth
   * asking. Measured across every completed assessment: eight questions and
   * twenty-four sources, at stage 5 of eighteen, and nothing downstream could say
   * "I need to check that".
   *
   * This runs AFTER the stage's own work and after its coverage rules, which is
   * deliberate on both counts. It cannot rescue a stage that failed, and it
   * cannot change what this stage concluded — what it retrieves is for every
   * stage that follows, which is the only honest place to put an answer that
   * arrives after the question.
   *
   * A sealed run reaches here with `noResearch` as its adapter, so the questions
   * are raised, recorded and left unanswered rather than silently dropped.
   */
  if ((FOLLOW_UP_STAGES as readonly number[]).includes(stage)) {
    // Ranked before it is cut, so `followUps` spends itself on the question the
    // stage thought mattered most rather than the one it happened to write first.
    const raised = output.artefacts.filter((a) => a.kind === 'research_question').sort((a, b) => priority(b) - priority(a));
    // ASKS `searches`, NOT `sealed`. A sealed run the reader allowed to search has
    // a retrieval adapter that really retrieves, and sending it down this branch
    // would record every question unanswered while the thing that could answer
    // them sat there unused.
    //
    // Unset falls back to what sealing implies, which is what every caller from
    // before the toggle meant — and it is also the safer way round: a sealed run
    // whose flag went missing says it did not search, rather than claiming an
    // enquiry it may not have made.
    const searches = input.searches ?? !input.sealed;
    if (raised.length && !searches) {
      // Without one, there is no adapter worth calling — it would answer with the
      // same sealed notice at all six stages. The questions are kept rather than
      // dropped, because "here is what this assessment wanted to check and could
      // not" is a real limit a reader should see, said once.
      output.warnings.push(`This stage raised ${raised.length} question${raised.length === 1 ? '' : 's'} for outside evidence, and this sealed assessment was not allowed to search: ${raised.map((a) => a.label).join(', ')}. ${raised.length === 1 ? 'It is' : 'They are'} recorded unanswered.`);
    } else if (raised.length) {
      const pursued = raised.slice(0, limits.followUps);
      if (raised.length > pursued.length) output.warnings.push(`This stage raised ${raised.length} further questions and followed up ${pursued.length}: a stage may pursue ${limits.followUps} at a time, so the enquiry develops rather than restarting here. Not pursued: ${raised.slice(pursued.length).map((a) => a.label).join(', ')}.`);
      // THE STAGE IS ALREADY DONE AT THIS POINT, so a retrieval failure must not
      // take it down. Every other post-work step here turns a failure into a
      // warning; an unguarded throw out of the adapter would discard an
      // exploitation playbook that cost ninety-nine model calls over a search
      // provider being unreachable. A cancellation still propagates — that is the
      // run being stopped, not the enquiry failing.
      try {
        await pursue(pursued, 1);
      } catch (err) {
        deps.signal.throwIfAborted();
        if (!(err instanceof PolicyError)) throw err;
        output.warnings.push(`The follow-up enquiry this stage raised could not be carried out: ${err.message} The questions are recorded; nothing was retrieved for them.`);
      }
    }
  }

  // Quarantining is what keeps a run alive, and it is also how a thin assessment
  // could pass as a complete one: a stage whose graph was half discarded still
  // satisfies its coverage rule, and the deterministic checks then read the
  // gutted graph. So say what was lost, in the assessment, in figures.
  const discarded = output.warnings.filter((w) => w.includes('discarded and are not part of this assessment')).length;
  if (discarded) output.warnings.unshift(`${discarded} group${discarded === 1 ? '' : 's'} of model output were discarded in this stage. What follows is drawn from what survived; treat structural checks over this stage's relationships as a floor, not a verdict.`);
  // `deps.passKind`, exactly as `absorb` passes it. Without it this pass —
  // which re-checks the WHOLE assembled stage, not one response — falls back to
  // the addendum contract, and a restatement's every finding is quarantined as
  // a kind that does not belong to stage `100n + 0`. The per-response triage
  // above was already correct, which is what made it invisible: the stage
  // reported 28 discarded outputs and no reason a reader could act on.
  const final = triageArtefacts(output, stage, input.artefacts, deps.passKind);
  rejected += final.rejected.length;
  // A single response is bounded by its envelope; the assembled stage was not,
  // and `policy_provenance` grows with the square of a runaway fan-out.
  const kept = final.artefacts.slice(0, MAX_STAGE_ARTEFACTS);
  const warnings = [...final.warnings];
  if (final.artefacts.length > kept.length) warnings.push(`This stage produced ${final.artefacts.length} items and only the first ${MAX_STAGE_ARTEFACTS} were kept. The assessment is incomplete for this stage.`);
  for (const a of kept) {
    if (a.refs.length <= MAX_REFS) continue;
    warnings.push(`“${a.label}” cited ${a.refs.length} sources; only the first ${MAX_REFS} are recorded.`);
    a.refs = a.refs.slice(0, MAX_REFS);
  }
  return { artefacts: kept, warnings: clampWarnings(warnings), rejected };
}

/**
 * A fixed library is only a guarantee if most of it actually ran. Without a strict
 * majority the stage has not done its job; with one, the absences are named in the
 * assessment and the run continues as `completed_with_gaps`.
 */
function requireMajority(output: StageOutput, library: readonly string[], of: (a: Artefact) => string, noun: string, last: PolicyError | null) {
  const covered = new Set(output.artefacts.map(of));
  const assessed = library.length - library.filter((key) => !covered.has(key)).length;
  const missing = library.filter((key) => !covered.has(key));
  if (assessed * 2 <= library.length) throw new PolicyError(last?.code ?? 'coverage', `Only ${assessed} of ${library.length} ${noun}s could be assessed.${last ? ` Last reason: ${last.message}` : ''}`);
  if (missing.length) output.warnings.push(`${missing.length} of ${library.length} ${noun}s were not assessed: ${missing.map((m) => m.replaceAll('_', ' ')).join(', ')}. Treat the assessment as incomplete on those grounds.`);
}

/**
 * Profiled actors, most prominent first — and HONEST about which signal ordered
 * them.
 *
 * Degree in the policy graph is the signal we want: it is a crude proxy for how
 * much of the policy runs through an actor. The problem is what happened when it
 * was absent. On the 72-page white paper of 2026-09-10 the knowledge graph
 * produced FOUR edges, so degree was zero for every actor and the sort fell
 * through to its tie-break — `id.localeCompare` — which is alphabetical order.
 * The red team's twelve slots were filled alphabetically and the report presented
 * them as the most connected actors in the policy.
 *
 * A tie-break silently becoming the entire ranking is the failure. So there is
 * now a real second signal between them: how many source mentions the resolution
 * stage attributed to an actor, and how many rows share its label. Both say
 * "this body is all over the document", which is what degree was standing in for,
 * and neither needs a graph. `basis` tells the caller which one actually did the
 * ordering so the assessment can say so.
 */
export function rankActors(all: Artefact[], profiles: Artefact[]): { actors: Artefact[]; basis: 'connectivity' | 'prominence' } {
  return orderActors(all, profiles
    .map((p) => all.find((a) => a.kind === 'actor' && a.id === p.data.actorId))
    .filter((a): a is Artefact => !!a));
}

/**
 * `rankActors` over actors rather than their profiles. Stage 4 needs the same
 * order BEFORE any profile exists, to decide which bodies get a full one, and a
 * second copy of the arithmetic would drift from the one stages 10 and 13 use.
 */
export function orderActors(all: Artefact[], actors: Artefact[]): { actors: Artefact[]; basis: 'connectivity' | 'prominence' } {
  const degree = new Map<string, number>();
  for (const edge of all) {
    if (edge.kind !== 'edge') continue;
    for (const end of [edge.fromId, edge.toId]) if (end) degree.set(end, (degree.get(end) ?? 0) + 1);
  }
  // How many actor rows carry each label: a body the document names forty times
  // is prominent in it, whatever the graph managed to record.
  const byLabel = new Map<string, number>();
  for (const a of all) {
    if (a.kind !== 'actor') continue;
    const key = a.label.trim().toLowerCase();
    byLabel.set(key, (byLabel.get(key) ?? 0) + 1);
  }
  const mentions = (a: Artefact) => (Array.isArray(a.data.mentions) ? a.data.mentions.length : 0);
  const rows = (a: Artefact) => byLabel.get(a.label.trim().toLowerCase()) ?? 1;

  const ordered = [...actors].sort((a, b) =>
    (degree.get(b.id) ?? 0) - (degree.get(a.id) ?? 0) ||
    mentions(b) - mentions(a) ||
    rows(b) - rows(a) ||
    a.id.localeCompare(b.id));

  return { actors: ordered, basis: ordered.some((a) => (degree.get(a.id) ?? 0) > 0) ? 'connectivity' : 'prominence' };
}

/** Full profiles where there are any; every profile otherwise, as before short ones existed. */
function fullOnly(profiles: Artefact[]): Artefact[] {
  const full = profiles.filter((p) => p.data.form !== 'short');
  return full.length ? full : profiles;
}

/**
 * The share of resolved actors the graph never said anything ABOUT.
 *
 * MEASURED FROM EDGES, and it used to be measured from `node` artefacts —
 * records the graph stage was asked to emit alongside its edges, one per entity
 * it touched, which nothing in the application ever rendered. Two things were
 * wrong with counting them:
 *
 *   THEY COUNTED THE WRONG POPULATION. A node was emitted for a mechanism and a
 *   claim as readily as for an actor, and the ratio was taken against the actor
 *   count alone, then clamped at 1. Best Start in Life held 712 nodes for 511
 *   resolved actors, so the ratio was 1.39, the clamp made it 1, and this
 *   returned ZERO uncovered — perfect coverage — for a graph whose edges reached
 *   267 of those 511 bodies. The synthetic library assessment reported zero the
 *   same way on 4 of 11.
 *
 *   A NODE WAS NEVER COVERAGE. The checks read EDGES. A record saying "this
 *   entity is in the graph", with no relationship attached, tells a structural
 *   check about authority, funding or accountability precisely nothing.
 *
 * So the guard written to stop a verdict being drawn from a fragment was being
 * fed the one number that could not see the fragment, and on two of five live
 * assessments it reported full coverage while half the policy's bodies had no
 * stated relationship at all. Best Start's twelve checks returned four
 * `high_risk` and six `moderate_risk` verdicts from that graph.
 *
 * COUNTED PER CANONICAL LABEL GROUP, not per row, because that is the unit this
 * stage works in: it makes one call per group and hands that call every member's
 * evidence. Entity resolution deliberately refuses to merge rows that merely
 * share a name, so one body arrives here as several candidate rows — 479 of Best
 * Start in Life's 511 were `_candidate_` splits — and a graph that wires the body
 * once has covered it. Per row that same graph reads as 47.7% uncovered and
 * would gut its own checks; per group it is 14.2%, which is what actually
 * happened: 248 of 289 groups carry a relationship.
 *
 * The population that matters is unchanged for the case this guard exists for.
 * The Post-16 white paper's graph reached three bodies out of 352 rows, and it is
 * still far past the ceiling however they are grouped.
 *
 * Exported because the worker needs the same number before the stage runs, and
 * it used to carry its own copy of the arithmetic.
 */
export function graphUncovered(all: Artefact[]): number {
  const actors = all.filter((a) => a.kind === 'actor' && a.id.startsWith('s2_'));
  if (!actors.length) return 0;
  const reached = new Set<string>();
  for (const edge of all) {
    if (edge.kind !== 'edge') continue;
    for (const end of [edge.fromId, edge.toId]) if (end) reached.add(end);
  }
  // The same key the stage groups its fan-out by, so the two cannot drift.
  const groups = new Map<string, boolean>();
  for (const actor of actors) {
    const key = actor.label.trim().toLowerCase();
    groups.set(key, (groups.get(key) ?? false) || reached.has(actor.id));
  }
  const covered = [...groups.values()].filter(Boolean).length;
  return 1 - covered / groups.size;
}

export function priority(a: Artefact): number {
  return Number(a.data.importance) * Number(a.data.uncertainty) * Number(a.data.consequence);
}
