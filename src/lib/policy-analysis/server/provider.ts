import { createHash } from 'node:crypto';
import { and, desc, eq } from 'drizzle-orm';
import { db } from '$lib/db';
import { policyModelCalls, policyExecutions } from '$lib/db/schema';
import { getLLMClient } from '$lib/llm/client';
import { executionContext, type LLMCallRecord } from '$lib/context/execution';
import { resolveResearchDeepModel } from '$lib/server/models/workload-settings';
import { registeredCallTimeoutMs } from '$lib/server/models/call-deadline';
import { thinkingRequestParams, type ThinkingLevel } from '$lib/models/thinking';
import { coerceModelContext, DEFAULT_NODE_MAX_TOKENS } from '$lib/constants/default-models';
import { CONTEXT_LIMIT, FIT_LIMIT, PROMPT_VERSION, WORKFLOW_ID, type Artefact, type Extraction, type PassKind, type StageOutput } from '../contracts';
import { expandIndexed, type IndexedPassage } from '../sentences';
import { fitToBudget } from '../budget';
import { isLegitimateSilence, malformedRetryDelayMs, PolicyError, stampProfileForm, transportRetryDelayMs, triageOutput, type Rejection } from '../validation';
import { repairPrompt, systemPrompt } from '../prompts';

export type ModelCall = (stage: number, key: string, input: unknown) => Promise<StageOutput>;

/**
 * How many corrective round-trips a single unit of work gets before it is
 * abandoned. Zero was the shipped behaviour and it is why the first production
 * run failed: the validator knew precisely which artefact was wrong and why, and
 * told nobody, least of all the model. A retry re-sent a byte-identical prompt,
 * so a deterministic contract failure was a deterministic dead end.
 */
const REPAIR_ROUNDS = 2;



/**
 * How long ONE model call may take before it is abandoned.
 *
 * 180 seconds was never measured, and it is what killed the first real
 * assessment of a government white paper. Timed on 2026-09-10 against the real
 * stage-1 prompt and the actual pages of that paper:
 *
 *   page                     luna    terra     sol      astra
 *   near-blank imprint        30s       —     135s          —
 *   copyright notice          44s       —     170s          —
 *   ministerial foreword      85s     111s   >301s   502 @ 237s
 *
 * Two of the four models the picker offers cannot answer an ORDINARY page of a
 * dense paper inside 180 seconds, and one of them is the site default. The
 * Codex bridge itself allows 600 seconds (`REQUEST_TIMEOUT_MS`), so the tight
 * deadline was ours alone and bought nothing: a genuinely dead provider refuses
 * the connection in milliseconds, not in three minutes.
 *
 * The stage's own wall clock (`stageBudgetMs`) remains the bound on a run. This
 * is only the bound on a single call.
 */
const CALL_TIMEOUT_MS = 180_000;
const SLOW_PROVIDER_TIMEOUT_MS = 420_000;
function callTimeoutMs(provider: string): number {
  // FORK DIVERGENCE. `provider` is the pipeline's own union — 'openrouter' or
  // 'codex' — and this fork can be configured to call services it cannot name,
  // which then fall to the else branch and are judged against OpenRouter's 180
  // seconds. Measured on an Azure deployment: 237s at stage one, and over 301s.
  // The active provider registers its own deadline; absent, upstream's rule
  // stands exactly as written. See $lib/server/models/call-deadline.
  const registered = registeredCallTimeoutMs();
  if (registered !== null) return registered;
  return provider === 'codex' ? SLOW_PROVIDER_TIMEOUT_MS : CALL_TIMEOUT_MS;
}

/**
 * Repair is worth a call when the response was mostly, or entirely, unusable —
 * and ONE ask is worth it whenever anything was rejected at all.
 *
 * The floor of three was the whole of the rule for a fan-out, and it never fired
 * for the case that actually happens. Measured on the "best start in life" run,
 * 2026-09-20: decomposition rejected artefacts on 27 of its units, and 20 of
 * those were a single artefact or two against ~22 kept. `Math.max(3, …)` meant
 * none of them was re-asked, so 23 of the 49 refusals were dropped without the
 * model ever being told what was wrong with them.
 *
 * A rejection is lost work, and `repairPrompt` names exactly which ids broke
 * which rule — the cheapest correction available. The bound is the point: a
 * handful gets ONE round, where a mostly-unusable response still gets two.
 * Phase 16's rule — ask once for exactly what was missing, then degrade rather
 * than throw — is the shape being copied. See the divergence in sync-core.mjs.
 */
function needsRepair(kept: number, rejected: Rejection[], round: number): boolean {
  if (!rejected.length) return false;
  if (kept === 0 || rejected.length >= Math.max(3, Math.ceil(kept / 2))) return true;
  return round === 0;
}

/**
 * What the reader commissioned: a Codex model id, a reasoning effort — either of
 * which may be absent — and whether the run is SEALED.
 *
 * Sealing belongs here rather than in a separate argument because it is exactly
 * that: something the reader asked for at submission, which changes what this
 * function is allowed to write down.
 */
/**
 * `passKind` is here and not on `StageInput` for the reason `concurrency` is:
 * `StageInput` is spread into the payload this module HASHES to key the response
 * cache, and a new field on it would miss the cache for every completed call in
 * an in-flight assessment. Which pass this is decides which prompt the stage is
 * given, so it belongs with the other execution facts.
 */
export type Commission = { model: string | null; thinkingLevel: ThinkingLevel | null; sealed?: boolean; passKind?: PassKind | null; extraction?: Extraction | null };

export function modelCaller(executionId: string, runId: string, signal: AbortSignal, prior: Artefact[], commission?: Commission): ModelCall {
  /**
   * A SEALED RUN STORES NO PROMPT AND NO REPLY. Not encrypted — absent.
   *
   * `policy_model_calls` keeps everything that is not the document: the call key,
   * the input HASH, the status, the provider, the model, the usage array and the
   * timings. So the run log still reads, the cost still sums, and the page still
   * shows which model answered each call. What is gone is the text.
   *
   * TWO CONSEQUENCES, BOTH STATED AT SUBMISSION RATHER THAN DISCOVERED:
   *
   * 1. The replay diagnostic — "read the stored call back through
   *    `triageArtefacts`", the thing that has found every stage defect in this
   *    feature — cannot be used on a sealed run.
   * 2. The model-call CACHE cannot hit, because it reuses a stored `output`. A
   *    sealed run that is interrupted and resumed re-issues that stage's calls
   *    rather than replaying them, which costs quota and time.
   *
   * Both are the price of the guarantee, and the form says so.
   */
  const sealed = commission?.sealed === true;
  return async (stage, key, input) => {
    // `indexed` rides alongside `protect`: both are execution concerns, both are
    // destructured out here, and so neither reaches the hashed payload or the
    // model. `sentences.ts` says why that matters for the response cache.
    const { protect: pinned, indexed, ...payload } = input as { artefacts?: Artefact[]; protect?: string[]; indexed?: IndexedPassage };
    const fitted = Array.isArray(payload.artefacts)
      ? fitToBudget(payload.artefacts, (artefacts) => ({ ...payload, artefacts }), FIT_LIMIT, new Set(pinned ?? []))
      : { artefacts: [], notes: [] };
    input = Array.isArray(payload.artefacts) ? { ...payload, artefacts: fitted.artefacts } : payload;
    /**
     * The raw reply as triage expects it.
     *
     * On the indexed path a sentence reference becomes an ordinary extracted
     * fact HERE, before anything is validated — triage drops what it does not
     * recognise, so there is no later seam. Applied to the CACHED reply too: a
     * stored indexed response is stored as the model sent it, and replaying one
     * without expanding it would quarantine every artefact in it.
     */
    // A stage-4 profile's FORM is the call's, stamped before triage for the same
    // reason: the form decides which fields triage demands. `profileForm` does
    // reach the model — it is how a short call is told it is one.
    const profileForm = stage === 4 ? ((payload as { profileForm?: unknown }).profileForm === 'short' ? 'short' : 'full') : null;
    const asEnvelope = (raw: unknown) => {
      const envelope = indexed ? expandIndexed(raw, indexed) : raw;
      return profileForm ? stampProfileForm(envelope, profileForm) : envelope;
    };
    const encoded = JSON.stringify(input);
    if (encoded.length > CONTEXT_LIMIT) throw new PolicyError('budget', 'This call exceeds the model’s context window even after trimming. Completed work is retained.');
    const inputHash = createHash('sha256').update(encoded).digest('hex');
    // The cache key carries the PROMPT, not just its version number. Without
    // this, editing an instruction changes nothing on a resumed run: every call
    // hits a cached response written under the old wording and the fix appears
    // not to work. Seen on 2026-09-10 — a corrected stage-7 instruction replayed
    // ten cached answers in under a minute and failed identically.
    // ONE CALL, USED TWICE. The hash below and the system message sent further
    // down must be the SAME string: the message used to be built by
    // `systemPrompt(stage)` with no pass kind, so a restatement was silently
    // given the addendum instruction while the cache key described the
    // restatement one. Building it once removes the chance of them disagreeing.
    const prompt = systemPrompt(stage, commission?.passKind, commission?.extraction);
    const promptKey = `${PROMPT_VERSION}#${createHash('sha256').update(prompt).digest('hex').slice(0, 12)}`;
    const prefix = (input as { idPrefix?: string }).idPrefix ?? '';
    const [execution] = await db.select().from(policyExecutions).where(eq(policyExecutions.id, executionId));
    // NOT PROBED ON A SEALED RUN, and this is a correctness point rather than an
    // optimisation: a sealed run's completed calls carry `output: null`, so the
    // row would be a truthy "hit" and `triageOutput` would be handed nothing.
    // Skipping it is also the honest behaviour — there is no stored reply to
    // reuse, so a resumed sealed stage re-issues its calls.
    const [cached] = sealed ? [] : await db.select({ output: policyModelCalls.output }).from(policyModelCalls)
      .innerJoin(policyExecutions, eq(policyExecutions.id, policyModelCalls.executionId))
      .where(and(eq(policyExecutions.stageId, execution.stageId), eq(policyModelCalls.inputHash, inputHash), eq(policyModelCalls.promptVersion, promptKey), eq(policyModelCalls.status, 'completed')))
      // Several attempts of the same stage can leave more than one match; take the
      // most recent rather than whatever the planner happens to hand back first.
      .orderBy(desc(policyModelCalls.completedAt)).limit(1);
    const cachedResult = cached?.output == null ? null : accept(triageOutput(asEnvelope(cached.output), stage, prior, commission?.passKind), prefix);
    if (cachedResult && !cachedResult.rejected.length) {
      return { artefacts: cachedResult.output.artefacts, warnings: [...fitted.notes, ...cachedResult.output.warnings] };
    }

    // The reader may commission a specific Codex model and reasoning effort; a
    // submission that names neither still resolves the research-deep workload,
    // which is what every assessment before 2026-09-10 ran on. `commission.model`
    // was validated against the catalogue at intake, so an id that no longer
    // exists degrades to the workload rather than failing the stage.
    const chosen = commission?.model ?? (await resolveResearchDeepModel()).modelId;
    const context = coerceModelContext({ modelId: chosen });
    const { client, model } = await getLLMClient(context);
    // `{}` when no level was chosen, so the provider keeps its own default; the
    // helper also clamps a level the chosen model would answer with a 400.
    const thinking = thinkingRequestParams(context.provider, commission?.thinkingLevel ?? null, context.modelId);
    const messages: { role: 'system' | 'user' | 'assistant'; content: string }[] = [
      { role: 'system', content: prompt },
      { role: 'user', content: encoded },
    ];

    // A cached response with rejected members is not a valid cache hit. This is
    // most visible when a stage-level coverage rule needs the rejected member:
    // returning only the accepted subset makes every resume fail immediately
    // without ever giving the model the validator's reason. Keep the accepted
    // work, reconstruct the corrective conversation, and retry only what was
    // discarded.
    const accepted: Artefact[] = [...(cachedResult?.output.artefacts ?? [])];
    const warnings: string[] = [...fitted.notes, ...(cachedResult?.output.warnings ?? [])];
    let lastError: PolicyError | null = cachedResult?.rejected[0]
      ? new PolicyError(cachedResult.rejected[0].code, cachedResult.rejected[0].reason)
      : null;
    let firstRound = 0;
    if (cachedResult?.rejected.length) {
      const cachedContent = JSON.stringify(cached.output);
      const instruction = repairPrompt(cachedResult.rejected, prefix, false, !!indexed);
      const sent = messages.reduce((n, m) => n + m.content.length, 0);
      const room = CONTEXT_LIMIT - sent - instruction.length - 2_000;
      if (room < 0) {
        if (!accepted.length) throw lastError;
        return { artefacts: accepted, warnings: [...warnings, 'There was no room left in the model’s context window for a corrective attempt.'] };
      }
      if (room >= 4_000) messages.push({ role: 'assistant', content: cachedContent.slice(0, room) });
      messages.push({ role: 'user', content: instruction });
      firstRound = 1;
    }

    // Counted separately from the repair rounds on purpose: a transport that went
    // away has said nothing about the response, so there is nothing to repair and
    // no round should be spent on it.
    let transportAttempts = 0;
    // Counted apart from both the repair rounds and the transport retries: an
    // unparseable reply is neither a broken wire nor a contract the model can be
    // told about, and it should not spend either budget.
    let malformedAttempts = 0;
    for (let round = firstRound; round <= REPAIR_ROUNDS; round++) {
      signal.throwIfAborted();
      const callKey = round ? `${key}#repair${round}` : key;
      // Its own signal, not an inline one, so the catch below can tell a call
      // that ran out of time from a provider that was never there.
      const deadline = AbortSignal.timeout(callTimeoutMs(context.provider));
      const startedAt = Date.now();
      // A repair round returns ONLY the corrected subset. Storing it under the
      // original input hash would let the unordered cache lookup replay that
      // fragment as if it were the whole response.
      const roundHash = round ? createHash('sha256').update(`${inputHash}#repair${round}`).digest('hex') : inputHash;
      const [call] = await db.insert(policyModelCalls).values({ executionId, callKey, promptVersion: promptKey, inputHash: roundHash, input: sealed ? null : (round ? { repairOf: key, round, instruction: messages.at(-1)?.content.slice(0, 20000) } : input), status: 'running', model }).returning();
      const llmCalls: LLMCallRecord[] = [];
      try {
        const result = await executionContext.run({ workflowId: WORKFLOW_ID, runId, nodeId: executionId, llmCalls }, () =>
          client.chat.completions.create({ model, messages, response_format: { type: 'json_object' }, max_tokens: DEFAULT_NODE_MAX_TOKENS, ...thinking }, { signal: AbortSignal.any([signal, deadline]), maxRetries: 0 }),
        );
        const content = result.choices[0]?.message?.content ?? '';
        // A reply cut off at max_tokens is not malformed JSON, and saying so sends
        // the repair round chasing a syntax error that is not there.
        const truncated = result.choices[0]?.finish_reason === 'length';
        let output: unknown;
        let parsed = true;
        try { output = JSON.parse(content); } catch { parsed = false; }
        if (!parsed) {
          // Even the malformed text is the model's reading of the paper. A sealed
          // run keeps the finish reason, which is the part that tells a reader
          // whether it was truncated or genuinely broken.
          await db.update(policyModelCalls).set({ status: 'failed', output: sealed ? { finishReason: result.choices[0]?.finish_reason ?? null } : { malformedText: content.slice(0, 64000), finishReason: result.choices[0]?.finish_reason ?? null } }).where(eq(policyModelCalls.id, call.id));
          // ASK AGAIN RATHER THAN LOSING THE UNIT. The repair round cannot reach
          // this — it works by naming rejected artefacts, and nothing parsed — so
          // before this the unit was simply gone. It cost the Post-16 assessment
          // its Skills England exploitation plays. Truncation is excluded: the
          // same request is cut off at the same place.
          const retryIn = malformedRetryDelayMs(truncated, malformedAttempts);
          if (retryIn !== null && !signal.aborted) {
            malformedAttempts++;
            warnings.push('The model’s reply could not be parsed and the call was made again.');
            await new Promise((resolve) => setTimeout(resolve, retryIn));
            signal.throwIfAborted();
            round--;
            continue;
          }
          throw new PolicyError('contract', truncated
            ? 'The model’s reply was cut off at its output limit before the structured result was complete. Fewer items per call are needed here.'
            : 'The model returned malformed JSON, and asking again did not produce a parseable one. Resume to retry this stage.');
        }
        if (truncated) warnings.push('The model reached its output limit on this call, so its list may be incomplete.');
        if (!sealed) await db.update(policyModelCalls).set({ output }).where(eq(policyModelCalls.id, call.id));

        const { output: round1, rejected } = accept(triageOutput(asEnvelope(output), stage, [...prior, ...accepted], commission?.passKind), prefix);
        accepted.push(...round1.artefacts);
        warnings.push(...round1.warnings);
        await db.update(policyModelCalls).set({ status: 'completed', output: sealed ? null : output, usage: llmCalls, provider: llmCalls.at(-1)?.provider ?? null, model: llmCalls.at(-1)?.model ?? result.model, completedAt: new Date() }).where(eq(policyModelCalls.id, call.id));

        if (!needsRepair(round1.artefacts.length, rejected, round) || round === REPAIR_ROUNDS) {
          // An empty reply is an ANSWER, not a fault, and not evidence of a dead
          // provider — see `isLegitimateSilence`, which is where the rule lives.
          if (isLegitimateSilence(accepted.length, rejected, !!lastError)) return { artefacts: [], warnings };
          if (!accepted.length) throw lastError ?? new PolicyError(rejected[0]?.code ?? 'contract', rejected[0]?.reason ?? 'The model returned nothing this stage could use.');
          return { artefacts: accepted, warnings };
        }
        lastError = new PolicyError(rejected[0]?.code ?? 'contract', rejected[0]?.reason ?? 'Output was discarded.');
        const instruction = repairPrompt(rejected, prefix, truncated, !!indexed);
        // The ceiling applies to what is SENT. Round two carries round one's echo
        // and instruction as well, so the whole conversation is measured — the
        // first request's size alone stops being the right number after round one.
        const sent = messages.reduce((n, m) => n + m.content.length, 0);
        const room = CONTEXT_LIMIT - sent - instruction.length - 2_000;
        // The ECHO is a convenience; the instruction — which ids, which rule — is
        // the whole value. A large stage leaves no room for the echo, and bailing
        // there meant the corrective round-trip never ran at exactly the stages
        // that needed it most. Drop the echo instead of the repair.
        if (room < 0) { if (!accepted.length) throw lastError; return { artefacts: accepted, warnings: [...warnings, 'There was no room left in the model’s context window for a corrective attempt.'] }; }
        if (room >= 4_000) messages.push({ role: 'assistant', content: content.slice(0, room) });
        messages.push({ role: 'user', content: instruction });
      } catch (err) {
        // WHICH failure it was, in the error the reader sees. The old text said
        // "the provider is unavailable or timed out — check site connections",
        // which named the wrong cause and the wrong remedy: on 2026-09-10 the
        // bridge was healthy throughout, the model was simply too slow for the
        // deadline, and the suggested resume failed identically because a
        // deadline is deterministic.
        const timedOut = deadline.aborted && !signal.aborted;
        const elapsed = Math.round((Date.now() - startedAt) / 1000);
        const fault = err instanceof PolicyError ? err : timedOut
          ? new PolicyError('timeout', `“${model}” did not answer within ${Math.round(callTimeoutMs(context.provider) / 1000)} seconds on this call (gave up after ${elapsed}s). This is a per-call deadline, not a provider outage — the run needs a model that answers inside it, and resuming on the same one will stop here again.`)
          : new PolicyError('provider', `The configured model provider could not be reached for “${model}” (after ${elapsed}s). Check site connections, then resume.`);
        await db.update(policyModelCalls).set({ status: 'failed', usage: llmCalls, completedAt: new Date(), error: fault.message }).where(eq(policyModelCalls.id, call.id));
        if (accepted.length) return { artefacts: accepted, warnings: [...warnings, `A corrective attempt failed (${fault.message}); the assessment keeps what was already accepted.`] };
        // THE WIRE GOING AWAY IS WORTH WAITING OUT. The bridge these calls run
        // through is restarted by other deploys on the box and comes back in
        // about ten seconds; failing a stage over that loses an attempt it may
        // not have. `transportRetryDelayMs` decides — it never retries a deadline
        // or a contract failure, and it is bounded so a provider that is really
        // gone still fails promptly.
        const wait = transportRetryDelayMs(fault.code, transportAttempts);
        if (wait !== null && !signal.aborted) {
          transportAttempts++;
          warnings.push('The model provider became unreachable mid-call and the call was retried after waiting.');
          await new Promise((resolve) => setTimeout(resolve, wait));
          signal.throwIfAborted();
          // Not a repair: re-send exactly what was sent, on a fresh round number
          // so the loop does not spend one of the two corrective attempts.
          round--;
          continue;
        }
        throw fault;
      }
    }
    throw lastError ?? new PolicyError('contract', 'The model could not satisfy this stage’s contract.');
  };
}

/**
 * Identifiers are the join key for every provenance link, so an artefact minted
 * outside its assigned prefix cannot be referenced later. Quarantine it like any
 * other faulty artefact rather than failing the whole response — the repair
 * round then gets told exactly what the prefix is.
 */
function accept(triaged: { artefacts: Artefact[]; warnings: string[]; rejected: Rejection[] }, prefix: string) {
  if (!prefix) return { output: { artefacts: triaged.artefacts, warnings: triaged.warnings }, rejected: triaged.rejected };
  const rejected = [...triaged.rejected];
  const kept = triaged.artefacts.filter((a) => {
    if (a.id.startsWith(prefix)) return true;
    rejected.push({ id: a.id, kind: a.kind, code: 'identifier', reason: `Identifiers for this call must begin with “${prefix}”.` });
    return false;
  });
  const warnings = [...triaged.warnings];
  const strays = rejected.length - triaged.rejected.length;
  if (strays) warnings.push(`${strays} model output${strays === 1 ? '' : 's'} used identifiers outside this call's namespace and could not be linked into the assessment.`);
  return { output: { artefacts: kept, warnings }, rejected };
}
