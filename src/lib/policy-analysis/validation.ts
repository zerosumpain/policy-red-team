import { artefactSchema, dataSchemas, looseOutputSchema, RESULT_KINDS, stageKinds, stageOutputSchema, type Artefact, type PassKind, type StageOutput } from './contracts';
import { locateQuote } from './quotes';

export class PolicyError extends Error {
  constructor(public code: string, message: string) { super(message); }
}

type Fault = { code: string; message: string };
const fault = (code: string, message: string): Fault => ({ code, message });

/** Identity and shape: is this artefact even addressable at this stage? */
function structuralFault(a: Artefact, all: Map<string, Artefact>, stage: number, passKind?: PassKind | null): Fault | null {
  if (all.has(a.id)) return fault('duplicate', 'The model returned duplicate artefact identifiers.');
  if (!stageKinds(stage, passKind).includes(a.kind)) return fault('contract', `An artefact of kind “${a.kind}” does not belong to this stage.`);
  // Name the field. "An artefact did not match its stage contract" told the owner
  // nothing and, worse, told the corrective round-trip nothing: on 2026-09-09 a
  // live graph stage failed three times because every node carried
  // `data.node` where the contract wants `data.entityId`, and the repair had no
  // way to know that.
  const shape = dataSchemas[a.kind].safeParse(a.data);
  if (!shape.success) return fault('contract', `An artefact did not match its stage contract (${a.kind} ${shape.error.issues.slice(0, 3).map((i) => `data.${i.path.join('.') || '?'}: ${i.message}`).join('; ')}).`);
  // Keep defaults applied by kind-specific schemas. The outer artefact schema
  // deliberately treats data as an open record so one malformed member can be
  // triaged; without this assignment defaults such as revision never survive.
  a.data = shape.data as Record<string, unknown>;
  return null;
}

/**
 * Provenance and contract checks for one artefact against everything available.
 *
 * Mutates `a` on success for extracted facts: the page, section and text offsets
 * are taken from the passage rather than from the model, and `sourceQuote` is
 * rewritten to the document's own wording for the span it located.
 */
function semanticFault(a: Artefact, all: Map<string, Artefact>, stage: number, note?: (what: string) => void): Fault | null {
  // An artefact that names its source and leaves `refs` empty is stating the same
  // link twice and recording it once. Fold it in rather than rejecting: measured
  // on a live run, THIRTEEN OF EIGHTEEN artefacts in one response were lost to
  // exactly this, which is also what was driving the corrective round-trips.
  if (a.sourceId && all.has(a.sourceId) && !a.refs.includes(a.sourceId)) a.refs = [a.sourceId, ...a.refs];
  if (a.kind !== 'passage' && !a.refs.length) return fault('provenance', 'An artefact has no supporting evidence links.');
  if (a.refs.some((id) => id === a.id || !all.has(id))) return fault('provenance', 'An artefact cites an unavailable source.');
  if (stage === 1 && ['claim', 'mechanism', 'actor'].includes(a.kind) && a.origin !== 'extracted_fact') return fault('extraction', 'The document inventory must distinguish literal extraction from assumptions.');
  if (a.kind === 'edge' && (!a.fromId || !a.toId || !all.has(a.fromId) || !all.has(a.toId) || !a.relation || !a.temporal)) return fault('graph', 'A graph assertion has invalid endpoints or provenance.');
  if (a.origin === 'extracted_fact' && a.kind !== 'passage') {
    const source = a.sourceId ? all.get(a.sourceId) : null;
    if (source?.kind !== 'passage' || !a.sourceQuote || !a.refs.includes(source.id)) return fault('span', 'An extracted assertion could not be located in the policy text.');
    // Line wrapping, hyphenation and smart punctuation are extraction artefacts,
    // not misquotation. A quote absent even after folding them is fabricated.
    const found = locateQuote(source.statement, a.sourceQuote);
    if (!found) return fault('span', 'An extracted assertion could not be located in the policy text.');
    a.sourceQuote = found.quote;
    a.page = source.page; a.section = source.section;
    a.startOffset = (source.startOffset ?? 0) + found.start;
    a.endOffset = (source.startOffset ?? 0) + found.end;
  }
  // URLs originate exclusively in trusted research adapter results, never model output.
  if (a.url && a.kind !== 'research_source') return fault('citation', 'Model-authored URLs are not accepted as evidence.');
  if (a.sourceId && !all.has(a.sourceId)) return fault('source', 'The source reference is unavailable.');
  const actorTargets = a.kind === 'model' ? a.data.players as string[] : a.kind === 'edge' ? [a.fromId, a.toId] : a.kind === 'profile' || a.kind === 'exploit' || a.kind === 'persona_link' ? [a.data.actorId] : [];
  if (actorTargets.some((id) => typeof id === 'string' && all.get(id)?.kind === 'actor' && !id.startsWith('s2_'))) return fault('canonical', 'Graph assertions, profiles and models must use resolved actor identifiers.');
  if (a.kind === 'assumption' && !a.refs.some((id) => ['actor', 'mechanism'].includes(all.get(id)?.kind ?? ''))) return fault('hypothesis', 'An assumption must link to an affected actor or mechanism.');
  /**
   * A cited assumption absent from `refs` is a bookkeeping slip, not a fabrication.
   *
   * `prune` has already run, so every identifier still in these arrays RESOLVES.
   * The artefact named the assumption, the assumption exists, and provenance is
   * exactly what a citation means — so fold it in, precisely as a finding's
   * `hypothesisIds` already are. What still fails is naming something that is not
   * an assumption at all, which is a contract violation rather than a slip.
   *
   * These were fatal. On the verification run of 2026-09-10 they discarded
   * **21 exploitation plays and 3 scenarios**, the single largest source of lost
   * work in that run: the playbook produced about 33 plays and kept 12. Every one
   * of the discarded plays named assumptions that resolved. It is the same
   * all-or-nothing failure the finding rule was fixed for in the first place,
   * wearing the same hat one stage earlier.
   */
  const citedAssumptions = a.kind === 'exploit' ? a.data.preconditions as string[]
    : ['model', 'scenario', 'causal_chain', 'option_appraisal', 'evaluation_plan'].includes(a.kind) ? a.data.assumptions as string[]
    : null;
  if (citedAssumptions) {
    /**
     * DIVERGENCE: NARROW THE LIST, KEEP THE ARTEFACT — the `finding` rule below,
     * applied one stage earlier.
     *
     * The paragraph above is right that a cited assumption missing from `refs` is
     * bookkeeping rather than fabrication. It then treats naming the WRONG KIND as
     * fatal, and that is the same all-or-nothing failure in the same costume: by
     * the time this runs `prune` has already removed every identifier that does
     * not resolve, so what is left is a real artefact of this assessment that the
     * model filed under the wrong heading. Discarding the whole play for it throws
     * away the reasoning to punish the filing.
     *
     * Measured on assessment 36ebca37, the Post-16 run of 2026-09-19: of 41
     * refusal warnings the largest single class is ten of these, every one at
     * stage 10 — the red team, the point of the assessment — and 47 plays
     * survived of 73 written.
     *
     * `relationalFault` already does exactly this for a finding's
     * `hypothesisIds`: keep the supported ones, drop the rest, refuse only when
     * nothing is left. Nothing is left is still a refusal here, because
     * `preconditions` and `assumptions` are both `min(1)` and a play resting on no
     * hypothesis is not a play.
     */
    const real = citedAssumptions.filter((id) => all.get(id)?.kind === 'assumption');
    if (!real.length) return fault('hypothesis', a.kind === 'exploit'
      ? 'An exploitation play must depend on assumptions, not on other kinds of artefact.'
      : 'Interaction models and scenarios must depend on assumptions, not on other kinds of artefact.');
    if (real.length !== citedAssumptions.length) {
      const field = a.kind === 'exploit' ? 'preconditions' : 'assumptions';
      const lost = citedAssumptions.length - real.length;
      a.data[field] = real;
      // The dropped identifiers stay in `refs`. They resolve, the model named
      // them, and provenance is what a reference means — what they are not is a
      // hypothesis this artefact rests on.
      note?.(`“${a.label}” dropped ${lost} ${field === 'preconditions' ? 'precondition' : 'assumption'}${lost === 1 ? '' : 's'} that named something other than an assumption.`);
    }
    for (const id of real) if (!a.refs.includes(id)) a.refs = [...a.refs, id];
  }
  if (a.origin === 'normative_judgement' && a.kind === 'research_source') return fault('source', 'A recommendation is not an external source.');
  if (a.kind === 'recommendation' && a.origin !== 'normative_judgement') return fault('recommendation', 'Redesign options must be labelled as normative recommendations.');
  if (a.kind === 'profile') {
    for (const value of Object.values(a.data)) {
      if (typeof value !== 'object' || !value || !('refs' in value)) continue;
      const f = value as { refs: string[]; confidence: number | null };
      if (f.refs.some((r) => !all.has(r)) || (!f.refs.length && f.confidence !== null)) return fault('profile', 'An incentive profile field lacks evidence or explicit uncertainty.');
    }
  }
  const referencedFields = ['actorId', 'entityId', 'questionId', 'sourceId', 'claimId', 'mechanismId', 'assumptionId', 'firstActor', 'challengeId', 'targetId'];
  for (const field of referencedFields) {
    const value = a.data[field];
    if (typeof value === 'string' && !all.has(value)) return fault('reference', 'An artefact contains an invalid entity reference.');
  }
  for (const field of ['players', 'assumptions', 'resultIds', 'hypothesisIds', 'findingIds', 'reviewedFindingIds', 'challengeIds', 'targetIds', 'candidates', 'mentions', 'dependencies', 'affectedOutcomes', 'targets', 'preconditions', 'reconciliationIds']) {
    const values = a.data[field];
    if (Array.isArray(values) && values.some((v) => typeof v !== 'string' || !all.has(v))) return fault('reference', 'An artefact contains an invalid relationship.');
  }
  return null;
}

/**
 * What an addendum verdict may pass judgement on.
 *
 * The conclusions, and only the conclusions. A reader acts on a finding, a
 * recommendation or an exploitation play; they do not act on a passage, and
 * "this passage is overturned" is a category error that would read on the page
 * as though the assessment had retracted a quotation.
 */
const REVISABLE_KINDS: string[] = ['finding', 'recommendation', 'exploit'];

/**
 * Checks that depend on the whole graph rather than one artefact's own fields.
 *
 * Mutates a finding on the way through: a cited identifier missing from `refs`
 * is folded in, and a hypothesis no cited result can reach is dropped. Both used
 * to be fatal, and between them they deleted the entire report in three
 * consecutive production runs — 14 of 15 findings and every recommendation
 * behind them, while the findings themselves were well formed and every
 * identifier resolved. That is the all-or-nothing failure this feature was
 * supposed to have stopped making, wearing a different hat.
 */
function relationalFault(a: Artefact, all: Map<string, Artefact>): Fault | null {
  if (!hasSource(a.id, all)) return fault('traceability', 'An artefact has no traceable path to policy text or external evidence.');
  if (a.kind === 'finding') {
    let results = a.data.resultIds as string[];
    let hypotheses = a.data.hypothesisIds as string[];
    if (!results.every((id) => (RESULT_KINDS as readonly string[]).includes(all.get(id)?.kind ?? '')) || !hypotheses.every((id) => all.get(id)?.kind === 'assumption')) return fault('traceability', 'A conclusion must cite a test or model and its hypotheses.');
    // A hypothesis none of the cited results reaches is an unsupported mention,
    // not a false conclusion. A `test` records its inputs as claims and evidence
    // rather than as assumptions, so ANY conclusion citing a test alongside an
    // assumption failed this outright — which is why the executive assessment and
    // the exploitation chapter, the two that span the most, died every time.
    // `refs` is the canonical provenance graph. If a finding explicitly cites a
    // result there but omits the same id from `resultIds`, restore the duplicate
    // index field when that result actually reaches one of its hypotheses. This
    // is a bookkeeping repair, not inferred support: the model named the result,
    // it is an allowed result kind, and its stored provenance supplies the path.
    // A live assured synthesis repeatedly put its causal chains in `refs` while
    // leaving only structural tests in `resultIds`; rejecting that report lost a
    // supported high-risk-assumptions chapter after two corrective round-trips.
    const citedResults = a.refs.filter((id) =>
      !results.includes(id) &&
      (RESULT_KINDS as readonly string[]).includes(all.get(id)?.kind ?? '') &&
      hypotheses.some((h) => reaches(id, h, all)),
    );
    if (citedResults.length) {
      results = [...results, ...citedResults];
      a.data.resultIds = results;
    }
    const supported = hypotheses.filter((h) => results.some((r) => reaches(r, h, all)));
    if (!supported.length) return fault('traceability', 'No hypothesis this conclusion rests on is supported by the results it cites.');
    if (supported.length !== hypotheses.length) {
      a.data.hypothesisIds = supported;
      hypotheses = supported;
    }
    // A cited identifier absent from `refs` is a bookkeeping slip: the artefact
    // named it, it resolves, and provenance is exactly what the citation means.
    // Fold it in rather than discarding the conclusion.
    const reviewed = (a.data.reviewedFindingIds as string[] | undefined) ?? [];
    const challenges = (a.data.challengeIds as string[] | undefined) ?? [];
    if (reviewed.some((id) => all.get(id)?.kind !== 'finding') || challenges.some((id) => all.get(id)?.kind !== 'assurance_challenge')) return fault('traceability', 'A revised conclusion must identify real earlier findings and challenge records.');
    for (const id of [...results, ...hypotheses, ...reviewed, ...challenges]) if (!a.refs.includes(id)) a.refs = [...a.refs, id];
  }
  /**
   * A RECONCILIATION MUST BE ABOUT SOMETHING THAT EXISTS, AND SAY WHAT IT IS.
   *
   * `targetId` is already checked for resolution with the other scalar
   * references above; what is checked here is that `targetKind` MATCHES. The
   * field exists so a reader scanning a list of reconciliations can see what
   * each is about without resolving every id, and a stated kind that disagrees
   * with the artefact it names is worse than no kind at all — it is the sort of
   * mislabelling nothing downstream would ever catch. Corrected rather than
   * rejected, because the id is the claim and the label is bookkeeping.
   */
  if (a.kind === 'reconciliation' || a.kind === 'revision') {
    const target = all.get(String(a.data.targetId));
    if (!target) return fault('reference', 'A judgement about the assessment names an artefact that does not exist.');
    a.data.targetKind = target.kind;
    if (!a.refs.includes(target.id)) a.refs = [...a.refs, target.id];
  }
  /**
   * A REVISION JUDGES A CONCLUSION, AND RESTS ON A RECONCILIATION.
   *
   * Both halves matter. Judging a passage or an actor "overturned" is a category
   * error — a revision is about something the reader may have ACTED on — and a
   * revision resting on nothing is an opinion about the report rather than a
   * reading of the material, which is exactly what this pass exists not to
   * produce. `reconciliationIds` may also name `evidence`, because where the
   * material is straightforwardly evidence for or against a claim that is the
   * row the reconciliation stage was told to write.
   */
  if (a.kind === 'revision') {
    if (!REVISABLE_KINDS.includes(all.get(String(a.data.targetId))?.kind ?? '')) return fault('traceability', 'An addendum verdict must judge a finding, a recommendation or an exploitation play.');
    const basis = (a.data.reconciliationIds as string[] | undefined) ?? [];
    const supporting = basis.filter((id) => ['reconciliation', 'evidence'].includes(all.get(id)?.kind ?? ''));
    if (!supporting.length) return fault('traceability', 'An addendum verdict must rest on what the new material established.');
    if (supporting.length !== basis.length) a.data.reconciliationIds = supporting;
    for (const id of supporting) if (!a.refs.includes(id)) a.refs = [...a.refs, id];
  }
  if (a.kind === 'assurance_response' && all.get(String(a.data.challengeId))?.kind !== 'assurance_challenge') return fault('traceability', 'An assurance response must answer an independent challenge.');
  if (a.kind === 'recommendation') {
    const findings = a.data.findingIds as string[];
    const challenges = (a.data.challengeIds as string[] | undefined) ?? [];
    if (findings.some((id) => all.get(id)?.kind !== 'finding') || challenges.some((id) => all.get(id)?.kind !== 'assurance_challenge')) return fault('traceability', 'A recommendation must cite findings and any challenge that changed it.');
    for (const id of [...findings, ...challenges]) if (!a.refs.includes(id)) a.refs = [...a.refs, id];
  }
  return null;
}

/**
 * The strict gate. Every artefact must pass or the whole response is refused.
 *
 * Used as the final check on a stage's assembled output, and by the tests that
 * pin each individual rule. The RUNTIME path through a model response is
 * `triageOutput`, which applies exactly these rules per artefact instead.
 */
export function validateOutput(raw: unknown, stage: number, prior: Artefact[], passKind?: PassKind | null): StageOutput {
  const parsed = stageOutputSchema.safeParse(raw);
  if (!parsed.success) throw new PolicyError('contract', 'The model returned an invalid structured result. Resume to retry.');
  const output = parsed.data;
  const all = new Map(prior.map((a) => [a.id, a]));
  for (const a of output.artefacts) {
    const f = structuralFault(a, all, stage, passKind);
    if (f) throw new PolicyError(f.code, f.message);
    all.set(a.id, a);
  }
  for (const a of output.artefacts) {
    const f = semanticFault(a, all, stage);
    if (f) throw new PolicyError(f.code, f.message);
  }
  for (const a of output.artefacts) {
    const f = relationalFault(a, all);
    if (f) throw new PolicyError(f.code, f.message);
  }
  return output;
}

export type Rejection = { id: string; kind: string; code: string; reason: string };
export type TriagedOutput = StageOutput & { rejected: Rejection[] };

/**
 * Whether a reply that yielded NOTHING is a fault, or a legitimate silence.
 *
 * These are two different events and they used to share one throw:
 *
 *   items returned, all rejected  → a real contract failure, worth a retry
 *   nothing returned at all       → the model saying there is nothing here
 *
 * The second is the correct answer for a body the paper mentions once in
 * passing, and the graph stage asks about every one of them. Treating it as a
 * fault fed `CONSECUTIVE_LIMIT`, which exists to catch a DEAD PROVIDER — and a
 * dead provider cannot return a well-formed empty envelope. The empty reply is
 * itself evidence the provider is alive.
 *
 * Measured on the first deep run of the Post-16 white paper, 2026-09-17, and the
 * first run ever to exercise the graph stage's fan-out: 152 bodies, 22–28% of
 * them answering emptily, three in a row ending the attempt, three attempts, no
 * way to finish.
 *
 * `hadEarlierFault` keeps a repair round honest: if round one was rejected and
 * round two came back empty, the rejection is still the story and still throws.
 *
 * A stage that genuinely produced nothing is caught by its own coverage rule in
 * `executeStage`, which is where "no relationships at all" belongs. This is only
 * about ONE unit of a fan-out, where silence is a finding.
 */
export function isLegitimateSilence(accepted: number, rejected: Rejection[], hadEarlierFault: boolean): boolean {
  return accepted === 0 && rejected.length === 0 && !hadEarlierFault;
}

/**
 * How long to wait before trying a call again when the transport went away.
 *
 * A `provider` failure means the wire vanished mid-call — it says nothing about
 * the response, because there was not one. The bridge that serves these calls
 * comes back in about ten seconds (measured: SIGTERM 22:20:34, listening again
 * 22:20:44), so the right answer is to wait rather than to fail a stage.
 *
 * THIS IS THE HALF `CONCURRENT_EVENT_CODES` CANNOT REACH. That rule stops one
 * restart reading as three dead lanes, but it only applies to a fan-out. The
 * stages that make a SINGLE call — entity resolution, research planning,
 * synthesis, appraisal, assured synthesis — go through `request()`, which never
 * touches the consecutive counter, so one blip has always failed those outright.
 * They are also the stages a run can least afford to lose.
 *
 * Deliberately NOT retried:
 *   `timeout`  — a per-call deadline is deterministic. Retrying it cost one run
 *                two hours on 2026-09-10 and the worker stopped doing it.
 *   `contract` — the response arrived and was wrong; the repair round is the
 *                mechanism for that, and it carries the reason back to the model.
 *
 * The backoff is bounded so a genuinely dead provider still fails promptly: 50
 * seconds total, against a bridge restart that takes ten.
 */
const TRANSPORT_RETRY_BACKOFF_MS = [5_000, 15_000, 30_000];

export function transportRetryDelayMs(code: string, attemptsSoFar: number): number | null {
  if (code !== 'provider') return null;
  return TRANSPORT_RETRY_BACKOFF_MS[attemptsSoFar] ?? null;
}

/**
 * How long to wait before asking again when the reply did not PARSE.
 *
 * A malformed reply is not a contract failure and the repair round cannot touch
 * it: repair works by naming the artefacts that were rejected, and a response
 * that never parsed has none. So it went straight to a thrown fault, and in a
 * fan-out that is the unit lost for good.
 *
 * What that costs, measured on the deep Post-16 run of 2026-09-17: the
 * exploitation playbook's call for **Skills England** came back unparseable and
 * was recorded as a gap. In a post-16 SKILLS white paper that is the single most
 * consequential body, and the finished assessment has no plays for it at all.
 * Nothing was wrong with the request — the same call answers fine on a retry.
 *
 * TRUNCATION IS THE EXCEPTION. `finish_reason: 'length'` means the reply was cut
 * off at the output limit, which is a fact about how much was ASKED FOR, and the
 * identical request will be cut off again. That is the timeout lesson in another
 * costume ([[transportRetryDelayMs]]): a deterministic failure retried is time
 * spent to reach the same place. The caller says "fewer items per call" instead.
 *
 * Short waits, because this is model noise rather than something healing.
 */
const MALFORMED_RETRY_BACKOFF_MS = [2_000, 6_000];

export function malformedRetryDelayMs(truncated: boolean, attemptsSoFar: number): number | null {
  if (truncated) return null;
  return MALFORMED_RETRY_BACKOFF_MS[attemptsSoFar] ?? null;
}

/**
 * The lenient gate, and the one every live model response goes through.
 *
 * WHY. The strict gate is all-or-nothing: one bad artefact out of twenty-five
 * throws away the other twenty-four, the stage, and — after three attempts of the
 * identical prompt — the entire eleven-stage run. That is exactly how the first
 * production run died, six times over, on three different rules, while the
 * analysis it was rejecting was sound each time.
 *
 * Here a faulty artefact is quarantined and named, its dependants cascade out
 * with it, and what survives is kept. The stage's own coverage rules in
 * `pipeline.ts` still decide whether what survived is enough — so leniency about
 * individual artefacts never becomes leniency about the assessment.
 */
export function triageOutput(raw: unknown, stage: number, prior: Artefact[], passKind?: PassKind | null): TriagedOutput {
  // Parsed WITHOUT the artefacts, then each artefact on its own. Parsing them as
  // one array of strict members put the all-or-nothing failure back a level: on
  // 2026-09-09 a live assessment lost a whole passage because one artefact of
  // eighteen left out a field that means nothing for its kind.
  const envelope = looseOutputSchema.safeParse(raw);
  if (!envelope.success) throw new PolicyError('contract', 'The model returned an invalid structured result. Resume to retry.');
  const malformed: Rejection[] = [];
  const artefacts: Artefact[] = [];
  for (const [index, candidate] of envelope.data.artefacts.entries()) {
    const one = artefactSchema.safeParse(candidate);
    if (one.success) { artefacts.push(one.data as Artefact); continue; }
    const where = one.error.issues.slice(0, 3).map((i) => `${i.path.join('.') || 'artefact'}: ${i.message}`).join('; ');
    const named = candidate && typeof candidate === 'object' ? String((candidate as { id?: unknown }).id ?? `item ${index + 1}`) : `item ${index + 1}`;
    malformed.push({ id: named, kind: String((candidate as { kind?: unknown })?.kind ?? 'unknown'), code: 'contract', reason: `An artefact did not match the contract (${where}).` });
  }
  const warnings = (envelope.data.warnings ?? []).filter((w): w is string => typeof w === 'string').slice(0, 100);
  const triaged = triageArtefacts({ artefacts, warnings }, stage, prior, passKind);
  if (!malformed.length) return triaged;
  const names = malformed.slice(0, 6).map((r) => `${r.id} (${r.kind})`).join(', ');
  return {
    artefacts: triaged.artefacts,
    warnings: clampWarnings([...triaged.warnings, `${malformed.length} model output${malformed.length === 1 ? ' was' : 's were'} discarded and are not part of this assessment — ${malformed[0].reason} Affected: ${names}${malformed.length > 6 ? `, and ${malformed.length - 6} more` : ''}.`]),
    rejected: [...malformed, ...triaged.rejected],
  };
}

/**
 * The same triage over an output that is ALREADY typed — a stage's assembled
 * result rather than one model response.
 *
 * `stageOutputSchema` bounds a single response at 2,000 artefacts and 100
 * warnings. A stage is the union of every unit of its fan-out, so a hundred-page
 * document blows both caps with every model call having succeeded. Re-parsing
 * the aggregate through the single-response envelope turned that into
 * "The model returned an invalid structured result", which is neither true nor
 * actionable. The per-artefact rules are what matter here, so apply those.
 */
export function triageArtefacts(output: StageOutput, stage: number, prior: Artefact[], passKind?: PassKind | null): TriagedOutput {
  const parsed = output;
  const priorIds = new Set(prior.map((a) => a.id));
  const rejected: Rejection[] = [];
  const drop = (a: Artefact, f: Fault) => { rejected.push({ id: a.id, kind: a.kind, code: f.code, reason: f.message }); };
  const pruned: string[] = [];
  const dropWarning = (a: Artefact) => (what: string) => pruned.push(`“${a.label}” lost ${what}.`);
  // DIVERGENCE: the same channel for a citation that resolved but was filed under
  // the wrong kind. Kept apart from `pruned` because the sentence it belongs in
  // is a different one: nothing here referred to something absent.
  const narrowed: string[] = [];

  let kept: Artefact[] = [];
  const seen = new Set<string>();
  for (const a of parsed.artefacts) {
    // Echoing a supplied artefact back is a courtesy, not a contract breach:
    // drop the copy rather than the response.
    if (priorIds.has(a.id) || seen.has(a.id)) { drop(a, fault('duplicate', 'The model repeated an identifier that already exists; the repeat was discarded.')); continue; }
    seen.add(a.id);
    kept.push(a);
  }

  const structural: Artefact[] = [];
  const map = new Map(prior.map((a) => [a.id, a]));
  for (const a of kept) {
    const f = structuralFault(a, map, stage, passKind);
    if (f) { drop(a, f); continue; }
    map.set(a.id, a);
    structural.push(a);
  }
  kept = structural;

  // Identifiers the model invented are pruned, ONCE, against everything that got
  // this far — before the cascade, so an id dropped for cause still takes its
  // dependants with it while an id that never existed only costs the mention.
  // Measured on a live stage-1 sweep: fifteen of twenty-seven discarded groups
  // were an actor whose `mentions` held the words "landlords" and "tenants"
  // rather than the passages that mention them, or a claim citing a sibling by a
  // name it had made up.
  for (const a of kept) prune(a, map, dropWarning(a));

  // Dropping an artefact can invalidate whatever pointed at it, so settle.
  for (let pass = 0; pass < 6; pass++) {
    const all = new Map(prior.map((a) => [a.id, a]));
    for (const a of kept) all.set(a.id, a);
    const survivors = kept.filter((a) => {
      const f = semanticFault(a, all, stage, (what) => narrowed.push(what)) ?? relationalFault(a, all);
      if (f) { drop(a, f); return false; }
      return true;
    });
    if (survivors.length === kept.length) { kept = survivors; break; }
    kept = survivors;
  }

  const warnings = [...parsed.warnings];
  if (pruned.length) warnings.push(`${pruned.length} item${pruned.length === 1 ? '' : 's'} referred to something that is not in this assessment; the reference was dropped and the item kept. ${pruned.slice(0, 4).join(' ')}${pruned.length > 4 ? ` And ${pruned.length - 4} more.` : ''}`.slice(0, 1000));
  // DIVERGENCE: see the narrowing rule in `semanticFault`.
  if (narrowed.length) warnings.push(`${narrowed.length} item${narrowed.length === 1 ? '' : 's'} named something real among the hypotheses ${narrowed.length === 1 ? 'it rests' : 'they rest'} on that is not an assumption record; that citation was dropped and the item kept, with the identifier retained in its provenance. ${narrowed.slice(0, 4).join(' ')}${narrowed.length > 4 ? ` And ${narrowed.length - 4} more.` : ''}`.slice(0, 1000));
  if (rejected.length) {
    const byCode = new Map<string, Rejection[]>();
    for (const r of rejected) byCode.set(r.code, [...(byCode.get(r.code) ?? []), r]);
    for (const [, group] of byCode) {
      const names = group.slice(0, 6).map((r) => `${r.id} (${r.kind})`).join(', ');
      warnings.push(`${group.length} model output${group.length === 1 ? ' was' : 's were'} discarded and are not part of this assessment — ${group[0].reason} Affected: ${names}${group.length > 6 ? `, and ${group.length - 6} more` : ''}.`.slice(0, 1000));
    }
  }
  return { artefacts: kept, warnings: clampWarnings(warnings), rejected };
}

/**
 * Warnings are shown to the reader and stored per stage, so a fan-out over a
 * hundred passages must not bury the page — or silently lose the tail, which is
 * what a bare `.slice()` does.
 */
export function clampWarnings(warnings: string[], limit = 60): string[] {
  if (warnings.length <= limit) return warnings;
  return [...warnings.slice(0, limit - 1), `And ${warnings.length - limit + 1} further warnings of the same kinds, not listed individually.`];
}

// Both traversals below share ONE visited set across the whole search. They used
// to copy it per edge — `new Set(seen)` — which turns reachability into full path
// enumeration: exponential in a dense provenance graph, and now run once per
// artefact per triage pass. Reachability does not care which path reached a node,
// so a shared set is both correct and linear.
const PRUNABLE = ['players', 'assumptions', 'resultIds', 'hypothesisIds', 'findingIds', 'reviewedFindingIds', 'challengeIds', 'targetIds', 'candidates', 'mentions', 'dependencies', 'affectedOutcomes', 'targets', 'preconditions'];

/**
 * Drop identifiers that name nothing, keeping the artefact.
 *
 * `refs` keeps whatever resolves; the emptiness and traceability rules then
 * decide whether what remains supports the artefact at all. A `data` array is
 * only pruned if the kind's OWN schema still accepts the result — so a model
 * with no players, or a finding with no results, is still refused rather than
 * quietly reduced to nothing.
 */
function prune(a: Artefact, all: Map<string, Artefact>, note: (what: string) => void): void {
  const refs = a.refs.filter((id) => id !== a.id && all.has(id));
  if (refs.length !== a.refs.length) { note(`${a.refs.length - refs.length} unresolvable provenance link${a.refs.length - refs.length === 1 ? '' : 's'}`); a.refs = refs; }
  for (const field of PRUNABLE) {
    const values = a.data[field];
    if (!Array.isArray(values)) continue;
    const trimmed = values.filter((v) => typeof v === 'string' && all.has(v));
    if (trimmed.length === values.length) continue;
    const candidate = { ...a.data, [field]: trimmed };
    if (!dataSchemas[a.kind].safeParse(candidate).success) continue;
    note(`${values.length - trimmed.length} unresolvable entr${values.length - trimmed.length === 1 ? 'y' : 'ies'} in ${field}`);
    a.data = candidate;
  }
}

export function hasSource(id: string, all: Map<string, Artefact>, seen = new Set<string>()): boolean {
  if (seen.has(id)) return false;
  seen.add(id);
  const a = all.get(id);
  if (!a) return false;
  if (a.kind === 'passage' || a.kind === 'research_source') return true;
  return a.refs.some((r) => hasSource(r, all, seen));
}

export function reaches(from: string, to: string, all: Map<string, Artefact>, seen = new Set<string>()): boolean {
  if (from === to) return true;
  if (seen.has(from)) return false;
  seen.add(from);
  return all.get(from)?.refs.some((id) => reaches(id, to, all, seen)) ?? false;
}
