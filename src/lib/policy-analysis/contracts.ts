import { isSelfHost } from '$lib/server/identity';
import { z } from 'zod';

export const STAGES = [
  'Document ingestion', 'Document decomposition', 'Entity resolution', 'Policy knowledge graph',
  'Actor and incentive profiles', 'Targeted research', 'Evidence matrix', 'Interaction models',
  'Automated policy tests', 'Adversarial scenarios and sensitivity', 'Exploitation playbook',
  'Cross-policy exposure', 'Synthesis', 'Actor persona library',
  // Appended rather than inserted. Existing and in-flight assessments persist
  // stage ordinals, so changing 0-13 would make a resumed run execute the wrong
  // contract. New assessments continue into these stages after the legacy report.
  'Theory of change', 'Options and evaluation', 'Independent challenge', 'Assured synthesis',
] as const;
/**
 * Fixed ordinals, not `STAGES.length - 1`.
 *
 * Synthesis stopped being the last stage when the persona library was appended
 * after it, and every rule that pins the report — which kinds synthesis may
 * emit, which results it must be shown — is written against ITS ordinal. Deriving
 * one of them from the array's length silently moved the report's contract onto
 * a stage that does not write a report. `stages.guard.test.ts` pins both names.
 */
export const SYNTHESIS_STAGE = 12;
export const PERSONA_STAGE = 13;
export const THEORY_STAGE = 14;
export const APPRAISAL_STAGE = 15;
export const ASSURANCE_STAGE = 16;
export const ASSURED_SYNTHESIS_STAGE = 17;
/**
 * THE ORDINAL SPACE FOR WORK COMMISSIONED AFTER THE REPORT.
 *
 * Pass `n` (1, 2, 3 …) owns stage ordinals `PASS_BASE * n + k`, and that single
 * number is what makes this feature possible at all. `persistArtefacts` is a
 * plain insert against a `(analysis_id, id)` primary key and every late stage
 * cites earlier ids, so a stage CANNOT be re-run: the `s<n>_<slot>_` namespace
 * collides, and deleting first leaves the report citing results that no longer
 * exist. Nothing here re-runs anything. It appends, in a block of ordinals that:
 *
 *   1. cannot collide — `policy_stages` is unique on `(analysis_id, ordinal)`;
 *   2. needs no new control flow — the worker chains on `ordinal + 1` and stops
 *      when there is no next row, which is exactly a block boundary;
 *   3. needs no new id mechanism — `idPrefix` is already `s${stage}_${slot}_`,
 *      so pass 1 mints `s100_…` and the collision problem solves itself.
 *
 * A pass numbered beyond this is not reachable: a hundred stages per pass is
 * twenty-five times what the longest pass uses, and the gap is what keeps the
 * arithmetic legible in a stage list a human reads.
 */
export const PASS_BASE = 100;
export const PASS_KINDS = ['addendum', 'restatement'] as const;
export type PassKind = (typeof PASS_KINDS)[number];
/**
 * The addendum pass: read the material, then say what it changes.
 *
 * Mirrors the main pipeline's read → test → write shape at a quarter of the
 * size. Appended-to, never reordered, for the same reason `STAGES` is: an
 * in-flight pass persists its ordinals.
 */
export const ADDENDUM_STAGES = ['Material ingestion', 'Material decomposition', 'Reconciliation', 'Addendum verdict'] as const;
/** The restatement pass: assured synthesis again, over everything including the addenda. */
export const RESTATEMENT_STAGES = ['Restated assessment'] as const;
export const PASS_STAGES: Record<PassKind, readonly string[]> = { addendum: ADDENDUM_STAGES, restatement: RESTATEMENT_STAGES };
/**
 * What the reader says the attached material IS.
 *
 * Interpolated into the decomposition and reconciliation prompts rather than
 * left for the model to infer. A consultation response read as though it were
 * the policy yields claims the policy never made; a later draft read as though
 * it were a critique yields contradictions that are simply the paper being
 * rewritten. The two are read in opposite directions and the reader is the one
 * who knows which is which.
 */
export const MATERIAL_ROLES = [
  ['later_draft', 'A later draft of this policy', 'A revision of the paper under assessment. Where it differs, the newer text SUPERSEDES the older — that is the relation to record, not a contradiction.'],
  ['supporting_evidence', 'Supporting evidence', 'Data, analysis or research offered in support of the policy. Test whether it actually supports what the paper claims, rather than assuming it does.'],
  ['consultation_response', 'A consultation response', 'A body responding to the policy. It is that body speaking in its own interest: read it as a statement of position, and it is evidence about the RESPONDENT at least as much as about the policy.'],
  ['critique', 'A critique or rebuttal', 'An argument against the policy. Test it as sceptically as the policy itself — a critique is not automatically right, and where it lands it lands on a specific claim.'],
  ['impact_assessment', 'An impact assessment', 'A formal appraisal of the policy\u2019s effects. Compare what it assesses against what the policy asserts, and note what it does not cover.'],
  ['related_policy', 'A related policy or guidance', 'A different instrument the policy interacts with. Look for what only exists because the two coexist.'],
  ['other', 'Something else', 'Read it on its own terms and say plainly what kind of document it turned out to be.'],
] as const;
export type MaterialRole = (typeof MATERIAL_ROLES)[number][0];
export const MATERIAL_ROLE_LABELS: Record<string, string> = Object.fromEntries(MATERIAL_ROLES.map(([k, label]) => [k, label]));
export const MATERIAL_ROLE_NOTES: Record<string, string> = Object.fromEntries(MATERIAL_ROLES.map(([k, , note]) => [k, note]));

/** Which pass an ordinal belongs to. 0 is the main run. */
export function passOf(ordinal: number): number { return Math.floor(ordinal / PASS_BASE); }
/** Where an ordinal sits inside its pass. Meaningless on the main run. */
export function passStep(ordinal: number): number { return ordinal % PASS_BASE; }
export function isPassStage(ordinal: number): boolean { return ordinal >= PASS_BASE; }
/** The first ordinal of pass `n`. */
export function passOrdinal(pass: number, step: number): number { return PASS_BASE * pass + step; }

/**
 * The prompt generation, as `policy_model_calls` records it. The cache key also
 * carries a hash of the prompt itself (`provider.ts`), which is what actually
 * stops an old reply being replayed; this names the generation for a person
 * reading the log. 3.1 is phase 19: every relationship type offered to stage 3,
 * short profiles at stage 4, and a plain-English writing rule on every call.
 */
export const PROMPT_VERSION = 'policy-analysis/3.1';
export const MAX_BYTES = 10 * 1024 * 1024;
export const MAX_CHARACTERS = 600_000;
export const MAX_PAGES = 400;
/**
 * How much of the assessment one call may carry, in characters.
 *
 * MEASURED 2026-09-10, against the bridge, with the real 2,278-artefact
 * inventory from the Post-16 white paper — never from the catalogue, because a
 * call that overruns the real window fails the stage rather than degrading.
 * gpt-5.6-luna answered every rung tried:
 *
 *   chars       artefacts     prompt tokens   wall
 *   360,000     153 of 2,278   74,014         16.8s   <- the old limit
 *   700,000     869           143,803         31.4s
 *   1,100,000   1,531         224,707         56.8s
 *   1,600,000   1,858         326,700         78.0s
 *   3,595,536   2,244         727,295         87.6s   <- the whole inventory
 *
 * NO CEILING WAS FOUND. So this is not set by the model's limit — it is set by
 * the three things that bite first:
 *
 *   COVERAGE. The old 360,000 carried 153 of 2,278 artefacts, 6.7%, which is why
 *   eight of fourteen stages logged "withheld from this call entirely" and the
 *   research stage planned its questions having seen no actor, claim or mechanism
 *   at all. 1,100,000 carries 67%. That is the whole point of the change.
 *
 *   DIMINISHING RETURNS. 360k to 1.1M buys 1,378 more artefacts. 1.1M to 1.6M
 *   buys 327 more for 45% more tokens and 37% more wall clock. The curve knees
 *   here.
 *
 *   ATTENTION AND QUOTA. A 200 is not comprehension: a model handed 727,000
 *   tokens does not attend to all of them evenly, and every token is subscription
 *   quota. The increase falls only on the calls that were actually shedding — the
 *   wide, late stages — since a stage-1 passage call carries one passage and is
 *   untouched.
 *
 * That leaves 224,707 tokens against 727,295 known to work: 3.2x of headroom for
 * a longer policy, a bigger system prompt, and the repair rounds that re-send on
 * top. Raise it again only against a fresh measurement.
 */
export const CONTEXT_LIMIT = 1_100_000;

/**
 * Room held back from the fit so a corrective round always has somewhere to go.
 *
 * The repair loop is what makes a retry meaningful: it carries the offending ids
 * and the broken rule back to the model, and it is how a play that failed the
 * provenance rule gets fixed instead of dropped. It is also the first thing to
 * die when the payload fills the window, because its room is computed as
 * `CONTEXT_LIMIT - sent - instruction - 2_000` and `sent` is whatever the fit
 * produced. Fit to the ceiling and that arithmetic goes negative.
 *
 * Measured on the verification run of 2026-09-10, immediately after the ceiling
 * was raised to 1,100,000: the exploitation playbook logged "There was no room
 * left in the model's context window for a corrective attempt", discarded seven
 * groups of output, and produced **12 plays across 8 actors against the previous
 * run's 31 across 10** — on the same document, the same model and the same twelve
 * calls. The plays were not judged bad; they failed a provenance rule and could
 * not be repaired.
 *
 * So the fit stops short of the ceiling. 60,000 characters is ~5% of the budget
 * and leaves a working instruction plus a useful echo of what the model got
 * wrong, which is the part that lets it correct itself.
 */
export const REPAIR_RESERVE = 60_000;
/** What a call may actually be filled to, leaving the reserve intact. */
export const FIT_LIMIT = CONTEXT_LIMIT - REPAIR_RESERVE;

export const DEPTHS = ['standard', 'deep'] as const;
export type Depth = (typeof DEPTHS)[number];
/**
 * How many units of a stage's fan-out may be in flight at once.
 *
 * Safe because the calls are independent BY CONSTRUCTION: every fan-out in
 * `executeStage` builds its context from `input.artefacts` alone and never from
 * what another unit produced, so N calls in flight return exactly what N calls
 * in sequence return. What is not order-free is the fold — see `fanOut`.
 *
 * Measured against the Codex bridge on 2026-09-10, replaying a real page of a
 * 72-page white paper through the real contract on gpt-5.6-luna:
 *
 *   agents   1      4      5      6
 *   wall     24.1s  33.6s  34.8s  33.7s
 *   per call 24.0s  29.8s  28.8s  26.8s
 *
 * No 429s at any level, and the per-call cost does not climb with N — four, five
 * and six all finish in about the same wall time, so six does half again as much
 * work as four for nothing. Six is the top of what was measured, not a ceiling
 * anybody found.
 *
 * The bridge has its own cap (`CODEX_BRIDGE_CONCURRENCY`, 3 by default) and
 * QUEUES past it, so asking for more agents than the bridge admits is not an
 * error and costs nothing — it simply stops going faster.
 */
export const CONCURRENCY_OPTIONS = [1, 2, 3, 4, 5, 6] as const;
export type Concurrency = (typeof CONCURRENCY_OPTIONS)[number];
/**
 * What an assessment with no stored preference does: six at a time.
 *
 * It was ONE, so that a run in flight when the option shipped would not widen
 * under itself. That reason is spent, and the default it left behind was the
 * single largest cost in the review of 25 September 2026: the submit form had no
 * field, so every run started from the browser ran serially — 387 minutes where
 * the same run at six lanes is about 126. Six is what every real run through the
 * CLI has used, and no 429 has been seen at it.
 *
 * Widening a paused run is now safe to do, not merely tolerable: the fan-out
 * folds in unit order, so the artefacts, the ids and the payloads a stage sends
 * are the same at any number of lanes (`pipeline.test.ts` asserts all three), and
 * a resumed run still hits its response cache.
 */
export const DEFAULT_CONCURRENCY: Concurrency = 6;
/**
 * What the submit form offers. The contract takes any of `CONCURRENCY_OPTIONS`;
 * the form asks a plainer question with three answers — one at a time for a
 * provider that throttles, three for a bridge at its own default cap, six for
 * everything else.
 */
export const OFFERED_CONCURRENCY = [1, 3, 6] as const satisfies readonly Concurrency[];
/**
 * HOW DECOMPOSITION ASKS FOR THE DOCUMENT INVENTORY.
 *
 * `prose` is the original contract: the model writes each claim's statement and
 * copies a verbatim quote out of the passage. `indexed` shows it the passage
 * with its sentences numbered and takes a NUMBER instead; the server slices the
 * statement, the quote and the offsets. See `sentences.ts` for why, with the
 * measurements.
 *
 * A CHOICE PER RUN rather than a deploy, and that is the point of it. The two
 * paths produce the same artefact kinds, so the same paper can be submitted
 * under each and the reports compared — and if the indexed inventory reads worse
 * on a real assessment, the next submission goes back to `prose` without a
 * release. Text rather than a boolean so a third way of asking needs no
 * migration, exactly as `model` and `thinking_level` are text.
 */
export const EXTRACTIONS = ['prose', 'indexed'] as const;
export type Extraction = (typeof EXTRACTIONS)[number];
/**
 * What an assessment with no stored preference does.
 *
 * `prose`, so nothing changes for a run already in flight when this ships, and
 * nothing changes for a reader who does not touch the control. The indexed path
 * has to be ASKED for until a real comparison says it should not be.
 */
export const DEFAULT_EXTRACTION: Extraction = 'prose';
/**
 * The stages that may raise a research question of their own.
 *
 * Until now stage 5 was the only one, and it runs BEFORE the tests, interaction
 * models, scenarios, exploitation playbook, appraisal and challenge exist —
 * before anything that would generate a question worth asking. Every stage here
 * forms a hypothesis and is followed by something that can use the answer.
 *
 * Deliberately absent: 11, which never leaves its blast radius by design; 12 and
 * 17, because a report must not open a new line of enquiry while it is being
 * written, and they are already the longest calls in the run; 13, a write-back.
 */
export const FOLLOW_UP_STAGES = [7, 9, 10, THEORY_STAGE, APPRAISAL_STAGE, ASSURANCE_STAGE] as const;

/**
 * The run-wide retrieval ceiling: everything the depth can plan, plus a tenth.
 *
 * DERIVED, not chosen, because it is a runaway guard and a guard that is smaller
 * than the plan is not a guard — it is a silent cut to the last stages to ask.
 * Set by hand it would need re-tuning every time one of the four numbers beside
 * it moved, and the failure mode of forgetting is invisible: the enquiry simply
 * stops partway through the run and explains itself in a warning nobody reads as
 * a misconfiguration.
 *
 * The tenth of headroom is there so an ordinary run never touches this at all.
 */
function sourceCeiling(questions: number, results: number, rounds: number, followUps: number): number {
  return Math.ceil((questions * results * rounds + FOLLOW_UP_STAGES.length * followUps * results) * 1.1);
}

/**
 * What "run it for longer" actually buys. `rounds` is the one that matters: a
 * second round of research is planned FROM what the first round found, which is
 * how a line of enquiry gets developed rather than merely widened.
 *
 * THESE CAPS BOUND EVERY RUN, NOT JUST THE LONG ONES. Read from production on
 * 2026-09-17: all eight completed assessments produced exactly 8 questions and
 * exactly 24 sources — `standard`'s ceiling, hit every single time, on documents
 * from a synthetic library test to a 72-page government white paper. A ceiling
 * that binds on every run is not a safety limit, it is the setting.
 *
 * Raised against measurement of `standard` ONLY. Deep depth has never completed:
 * the one deep run was cancelled at stage 1 on Sol's per-call timeout, so
 * `rounds: 3` remains unexercised and this table is deliberately modest until a
 * deep run survives. The volume rise is affordable because retrieval now starts
 * instant (`server/research.ts`) — more sources, each much lighter, with full
 * text fetched only where the enquiry needs it.
 *
 * `followUps` is per LATER STAGE, over the six that may now raise a question
 * (`FOLLOW_UP_STAGES`), and `sources` is the run-wide runaway guard — the same
 * kind of number as the 1,500-call limit, not a budget anybody should be
 * spending up to.
 */
export const DEPTH_LIMITS: Record<Depth, { questions: number; results: number; rounds: number; actors: number; followUps: number; sources: number }> = {
  standard: { questions: 12, results: 4, rounds: 2, actors: 12, followUps: 2, sources: sourceCeiling(12, 4, 2, 2) },
  deep: { questions: 16, results: 6, rounds: 3, actors: 20, followUps: 3, sources: sourceCeiling(16, 6, 3, 3) },
};
/**
 * The persona dossier vocabulary: twelve traits that survive a change of policy.
 *
 * Deliberately NOT the twenty-one profile fields. A profile answers "what does
 * this body want from THIS paper", which is exactly the part that does not
 * travel; a persona answers "what is this body, and what does its position
 * reward", which does. The keys are fixed so two assessments a year apart can be
 * compared line for line rather than merged into prose.
 */
export const PERSONA_TRAITS = [
  ['mandate', 'What it exists to do'],
  ['accountableTo', 'Who it answers to'],
  ['judgedOn', 'What it is judged on'],
  ['timeHorizon', 'How far ahead it can afford to look'],
  ['resources', 'What it can bring to bear'],
  ['legalPowers', 'What it can compel or block'],
  ['informationControl', 'What it knows that others do not'],
  ['constraints', 'What limits it'],
  ['outsideOption', 'What it does if it declines to play'],
  ['gainFromFailure', 'Who around it is better off if a policy fails'],
  ['standingStrategies', 'How it typically plays'],
  ['reputation', 'How it is regarded, and its track record'],
] as const;
export type TraitKey = (typeof PERSONA_TRAITS)[number][0];
export const TRAIT_LABELS: Record<string, string> = Object.fromEntries(PERSONA_TRAITS);

export const TRIGGER = 'policy-analysis';
export const WORKFLOW_ID = 'policy-analysis-v1';
// `prior_assessment` is what the persona library contributes: something an
// EARLIER assessment of a DIFFERENT policy established about this body. It is
// not evidence about the policy in hand — nothing carrying it can reach a
// passage or a retrieved source, so `hasSource` keeps it out of the findings on
// its own account — and the reader must be able to see which of these came from
// somewhere else.
export const ORIGINS = ['extracted_fact', 'external_evidence', 'structural_inference', 'behavioural_hypothesis', 'model_result', 'normative_judgement', 'prior_assessment'] as const;
export const RELATIONS = ['funds', 'regulates', 'commissions', 'delivers', 'reports_to', 'depends_on', 'supplies_data_to', 'has_authority_over', 'bears_cost_of', 'receives_benefit_from', 'is_accountable_for', 'can_veto', 'is_measured_by', 'is_exposed_to', 'supports', 'contradicts', 'assumes', 'provides_evidence_for', 'owns_data', 'reciprocates', 'sanctions', 'can_adapt', 'lobbies', 'allies_with', 'competes_with', 'appoints'] as const;
export const LEGALITY = ['compliant', 'grey', 'breach'] as const;
export const CROSS_PATTERNS = ['conflicting_demand', 'cumulative_burden', 'shared_assumption', 'regime_arbitrage', 'common_actor_overload', 'contradictory_measure', 'duplicated_authority'] as const;
export const PATTERNS = ['principal_agent', 'collective_action', 'coordination', 'metric_gaming', 'information_asymmetry', 'enforcement_credibility', 'bargaining_veto', 'repeated_interaction', 'regulatory_capture', 'coalition_formation'] as const;
export const SCENARIOS = ['genuine_cooperation', 'minimum_compliance', 'strategic_gaming', 'limited_capacity', 'leadership_change', 'active_opposition', 'poor_information', 'unequal_distribution'] as const;
/**
 * What new material does to something the assessment already holds.
 *
 * `supersedes` is the one that does not exist anywhere else in the contract and
 * is the reason this vocabulary is not just `evidence.result`: a later draft
 * does not CONTRADICT the paragraph it replaces, it replaces it, and reporting
 * a redraft as a contradiction would read as the policy disagreeing with itself.
 */
export const RECONCILE_RELATIONS = ['confirms', 'extends', 'qualifies', 'contradicts', 'supersedes'] as const;
/** Where a conclusion stands once the material has been read against it. */
export const REVISION_STATUSES = ['upheld', 'strengthened', 'weakened', 'overturned', 'superseded'] as const;
/**
 * WHERE A PLAY'S PRECEDENT CAME FROM.
 *
 * 46 of 47 plays on the one completed real run said no precedent was found,
 * because the prompt allowed only a case the run had evidence for and research
 * is planned before any play exists. A model does know comparable cases — a
 * college gaming a completion measure, a council re-basing a waiting list — and
 * a reader is better served by "this has happened before, from memory, not
 * checked" than by a blank, PROVIDED the page says which it is.
 *
 * So the precedent is labelled rather than trusted. `external_evidence` must
 * cite a retrieved source or evidence row in refs, or triage downgrades it to
 * `unverified_recall`; `prior_assessment` is a repeat of a play the persona
 * library recorded for this body; `unverified_recall` is the model's own memory
 * and is shown as "not checked"; `none` says nothing comparable was found. A
 * link in the text is removed whatever the basis — URLs come from retrieval,
 * never from a model.
 *
 * Not an ORIGIN, deliberately: `ORIGINS` describes a whole artefact and every
 * view reads it that way. This is one field of one kind, so it sits beside that
 * field.
 */
export const PRECEDENT_BASES = ['external_evidence', 'prior_assessment', 'unverified_recall', 'none'] as const;
export const JUDGEMENTS = ['well_supported', 'supported_with_limits', 'contested', 'provisional', 'unknown'] as const;
/**
 * The challenge remits, one call each, all with equal weight.
 *
 * The first seven test whether the report is WRONG. On the one completed real
 * run they pushed it toward hedging: of five challenges raised as issues, three
 * said "overconfident" or "under-evidenced", and the answer to each was a
 * softer sentence — which is how the headline became "ambitious and potentially
 * relevant … not decision-ready". Nothing asked whether the report was USEFUL.
 *
 * The last four do. `generic` — would this apply to any white paper?
 * `actionability` — does it say who should decide or do what? `sharpest_play`
 * — did it miss the play that matters most? `unanswered_play` — is a severe
 * play left with no recommendation answering it? Appended, never inserted: a
 * stored challenge carries its category as a string and nothing reads the
 * position.
 */
export const ASSURANCE_CATEGORIES = ['omission', 'citation', 'causality', 'counterevidence', 'confidence', 'recommendation', 'completeness', 'generic', 'actionability', 'sharpest_play', 'unanswered_play'] as const;
const text = z.string().min(1).max(12000);
const strings = z.array(text).max(80);
const ids = z.array(z.string().max(100)).max(10000);
const unit = z.number().min(0).max(1);
export const confidenceSchema = unit.nullable().default(null);
const field = z.object({ value: text, origin: z.enum(ORIGINS), confidence: confidenceSchema, refs: ids }).strict();
export const PROFILE_FIELDS = ['formalRole', 'statedObjectives', 'operationalObjectives', 'accountableTo', 'successCriteria', 'timeHorizon', 'resources', 'constraints', 'legalPowers', 'informationPossessed', 'informationControlled', 'dependencies', 'costs', 'benefits', 'risks', 'outsideOption', 'gainFromFailure', 'reputationalIncentives', 'politicalIncentives', 'institutionalMotivations', 'strategies'] as const;
/**
 * THE FIELDS A SHORT PROFILE CARRIES: its role, what it wants, what it controls.
 *
 * Stage 4 wrote all twenty-one fields for every body, one call each — 168 calls
 * on one real run, where 230 of 239 actors were mentioned once. The top
 * `FULL_PROFILES` bodies by connectivity still get the full twenty-one; every
 * other body gets these five, several to a call, so it still HAS a profile —
 * every view and rule downstream reads "has a profile" — without paying for
 * sixteen fields the paper cannot support for a body it names once in passing.
 */
export const SHORT_PROFILE_FIELDS = ['formalRole', 'statedObjectives', 'operationalObjectives', 'legalPowers', 'resources'] as const satisfies readonly (typeof PROFILE_FIELDS)[number][];
/**
 * How many bodies get the full profile. Above `DEPTH_LIMITS.deep.actors`, so
 * every body the red team or the persona library takes has a full one — a test
 * holds the two numbers apart.
 */
export const FULL_PROFILES = 24;
/** How many short profiles one call writes. */
export const SHORT_PROFILE_BATCH = 8;
/**
 * OPTIONAL IN THE SHAPE, REQUIRED BY THE FORM. `validation.ts` demands every
 * field of a full profile and the five of a short one; the schema cannot say
 * "which fields depends on `form`" without a refinement the prompt's JSON schema
 * would not show, so the rule lives beside the other contract checks instead.
 */
const profileFields = Object.fromEntries(PROFILE_FIELDS.map((k) => [k, field.optional()])) as Record<(typeof PROFILE_FIELDS)[number], z.ZodOptional<typeof field>>;
/**
 * A persona trait carries its own origin and confidence.
 *
 * The dossier is drawn from several assessments of several policies, so "who
 * this body answers to" may be an extracted fact in one paper and an inference
 * in another. Averaging that away would be the whole problem: a trait states its
 * epistemic status, and the page shows it.
 */
const personaTraits = z.array(z.object({ key: z.string().max(60), label: z.string().max(120), value: text, origin: z.enum(ORIGINS), confidence: confidenceSchema }).strict()).max(30);
export const dataSchemas = {
  passage: z.object({ documentHash: text }),
  claim: z.object({ category: z.enum(['objective', 'problem', 'responsibility', 'decision_right', 'funding', 'dependency', 'data_flow', 'measure', 'constraint', 'risk', 'benefit', 'claim', 'cited_evidence']), notes: text }),
  mechanism: z.object({ intervention: text, implementation: text, notes: text }),
  assumption: z.object({ importance: unit, uncertainty: unit, consequence: unit, priority: unit.optional(), notes: text }),
  actor: z.object({ entityType: z.enum(['person', 'department', 'agency', 'local_authority', 'provider', 'contractor', 'programme', 'dataset', 'legislation', 'committee', 'user_group', 'geography', 'concept']), aliases: strings, mentions: ids, ambiguity: text, dates: strings, parent: z.string().nullable() }),
  alias: z.object({ actorId: text }),
  resolution_candidate: z.object({ candidates: ids.min(2), reason: text, resolved: z.literal(false) }),
  edge: z.object({ notes: text }),
  // `coversActorIds` is stamped by the SERVER after the call, never asked of the
  // model: entity resolution deliberately refuses to merge rows that share a
  // label, so this records which rows one profile was drawn for without
  // asserting they are one body. Optional because a profile from before this
  // existed, or from a single-row group, carries none.
  // `form` is stamped by the SERVER too, from the call the profile came from —
  // never taken from the model, which could otherwise excuse a full profile
  // from sixteen of its fields by calling it short. Absent means full, which is
  // every profile written before short ones existed.
  profile: z.object({ actorId: text, coversActorIds: ids.optional(), form: z.enum(['full', 'short']).optional(), ...profileFields }),
  research_question: z.object({ importance: unit, uncertainty: unit, consequence: unit, priority: unit.optional(), rationale: text, searchStrategy: text, gap: text }),
  research_source: z.object({ questionId: text, retrievedAt: text, quality: text, qualityBasis: text, freshness: text, jurisdictionalRelevance: text, retrieval: z.enum(['full_text', 'search_excerpt']), gap: text }),
  evidence: z.object({ claimId: z.string().nullable(), mechanismId: z.string().nullable(), actorId: z.string().nullable(), assumptionId: z.string().nullable(), sourceId: text, evidenceType: text, result: z.enum(['supports', 'contradicts', 'mixed', 'insufficient']), sourceQuality: text, relevance: text, freshness: text, dispute: text }),
  model: z.object({ pattern: z.enum(PATTERNS), players: ids, strategies: strings, decisionOrder: text, information: text, costs: text, benefits: text, rewards: text, sanctions: text, dependencies: ids, assumptions: ids.min(1), responses: strings, equilibria: strings, explanation: text, applicability: text }),
  // `basis` and `extracted` are written by `tests.ts`, never by a model: a check
  // the run could not make because its own graph did not link what the paper
  // states is an EXTRACTION GAP, and says which relation and how many items.
  test: z.object({ testId: text, rationale: text, inputs: ids, rule: text, reasoning: text, result: z.enum(['low_risk', 'moderate_risk', 'high_risk', 'indeterminate']), severity: z.enum(['low', 'moderate', 'high', 'unknown']), actors: ids, mitigation: text, basis: z.literal('extraction_gap').optional(), extracted: z.object({ relation: text, what: text, count: z.number().int().positive() }).optional() }),
  scenario: z.object({ scenario: z.enum(SCENARIOS), changedConditions: text, firstActor: z.string().nullable(), strategy: text, downstreamEffects: strings, affectedOutcomes: ids, detectability: text, correction: text, weaknesses: strings, assumptions: ids.min(1), sensitivity: strings.min(1) }),
  exploit: z.object({
    actorId: text, motivation: text, play: text, legality: z.enum(LEGALITY),
    targets: ids.min(1), preconditions: ids.min(1), payoff: text, costToPolicy: text,
    // Four factors a reader can name, each on [0,1]. `exposure` and `band` are
    // computed from them by the server so the ranking is reproducible.
    incentive: unit, ease: unit, impact: unit, concealment: unit,
    exposure: unit.optional(), band: z.string().max(40).optional(),
    earlyWarning: text, counter: text, precedent: text,
    // Where `precedent` came from. Optional so a play written before it existed
    // still parses; see PRECEDENT_BASES.
    precedentBasis: z.enum(PRECEDENT_BASES).optional(),
  }).strict(),
  cross_policy: z.object({
    pattern: z.enum(CROSS_PATTERNS), otherAnalysisId: z.string().max(100), otherAnalysisTitle: text,
    // Identifiers in ANOTHER analysis: recorded, never joined. Provenance rows may
    // not cross an analysis boundary, so these stay plain strings in `data`.
    otherArtefactIds: ids, actorId: z.string().nullable(),
    interaction: text, consequence: text, severity: unit, evidenceLimits: text, action: text,
  }).strict(),
  causal_chain: z.object({
    mechanismId: text, inputs: strings, activities: strings.min(1), outputs: strings.min(1),
    outcomes: strings.min(1), impacts: strings, causalMechanisms: strings.min(1), assumptions: ids.min(1),
    alternativeExplanations: strings.min(1), negativePathways: strings.min(1),
    indicators: z.array(z.object({ name: text, baseline: text, target: text, dataSource: text, timing: text }).strict()).max(30),
    evidenceLimits: text, judgement: z.enum(JUDGEMENTS),
  }).strict(),
  option_appraisal: z.object({
    optionType: z.enum(['business_as_usual', 'minimum_intervention', 'proposed_policy', 'alternative']),
    description: text, objectiveFit: text, costs: text, benefits: text, risks: text, distribution: text,
    affordability: text, deliverability: text, reversibility: text, assumptions: ids.min(1),
    evidenceLimits: text, judgement: z.enum(JUDGEMENTS),
  }).strict(),
  evaluation_plan: z.object({
    processQuestions: strings.min(1), impactQuestions: strings.min(1), valueForMoneyQuestions: strings.min(1),
    counterfactual: text,
    indicators: z.array(z.object({ name: text, type: z.enum(['process', 'output', 'outcome', 'impact', 'cost']), baseline: text, target: text, source: text, owner: text, cadence: text }).strict()).min(1).max(40),
    decisionRules: strings.min(1), dataGaps: strings, assumptions: ids.min(1), judgement: z.enum(JUDGEMENTS),
  }).strict(),
  assurance_challenge: z.object({
    category: z.enum(ASSURANCE_CATEGORIES), finding: z.enum(['issue', 'cleared']),
    materiality: z.enum(['high', 'medium', 'low']), targetIds: ids.min(1), challenge: text,
    testApplied: text, evidence: text, resolutionNeeded: text,
  }).strict(),
  assurance_response: z.object({
    challengeId: text, disposition: z.enum(['accepted', 'partly_accepted', 'rejected', 'unresolved']),
    response: text, changes: text, remainingLimit: text,
  }).strict(),
  review_summary: z.object({
    decisionUse: z.enum(['exploratory', 'decision_support', 'independently_challenged']),
    judgement: z.enum(JUDGEMENTS), openChallenges: z.number().int().nonnegative(),
    acceptedChallenges: z.number().int().nonnegative(), unresolvedMaterialChallenges: z.number().int().nonnegative(),
    scope: text, limitations: strings,
  }).strict(),
  finding: z.object({
    section: z.enum(['executive_assessment', 'scope_methodology', 'objectives', 'actors', 'mechanisms', 'theory_of_change', 'options_appraisal', 'evaluation_plan', 'assurance', 'high_risk_assumptions', 'test_results', 'strategic_responses', 'scenarios', 'exploitation', 'cross_policy', 'evidence_gaps', 'confidence_uncertainty', 'distribution', 'unresolved_questions']),
    resultIds: ids.min(1), hypothesisIds: ids.min(1), revision: z.enum(['initial', 'assured']).default('initial'),
    reviewedFindingIds: ids.default([]), challengeIds: ids.default([]), judgement: z.enum(JUDGEMENTS).default('unknown'),
  }).strict(),
  recommendation: z.object({
    findingIds: ids.min(1), change: text, tradeoffs: text, beneficiaries: strings, burdenBearers: strings,
    validationNeeded: text, revision: z.enum(['initial', 'assured']).default('initial'), challengeIds: ids.default([]),
    judgement: z.enum(JUDGEMENTS).default('unknown'),
  }).strict(),
  /**
   * How ONE thing the assessment already holds stands after the new material.
   *
   * Deliberately alongside `evidence` rather than instead of it. Where the
   * material is evidence for or against a claim, the reconciliation stage emits
   * an ordinary `evidence` row — so "What is backed up" picks it up with no new
   * code at all. This kind carries the two relations `evidence` cannot express:
   * SUPERSEDES, which is what a later draft does to the text it replaces, and
   * EXTENDS, which is material adding something the paper never addressed.
   *
   * `targetId` is an artefact of this analysis and must resolve, which triage
   * enforces: a reconciliation naming nothing is a judgement about nothing.
   */
  reconciliation: z.object({
    targetId: text, targetKind: text,
    relation: z.enum(RECONCILE_RELATIONS),
    basis: text,
    /** How much this moves the assessment, on [0,1]. Not how confident it is. */
    significance: unit,
    notes: text,
  }).strict(),
  /**
   * The addendum verdict on one CONCLUSION — a finding, a recommendation or an
   * exploitation play.
   *
   * Separate from `reconciliation` because the two answer different questions
   * and a reader needs them apart: one says what the material does to a piece of
   * the assessment's groundwork, the other says whether a conclusion the reader
   * may already have acted on still stands. `overturned` is the word this whole
   * feature exists to be able to say.
   */
  revision: z.object({
    targetId: text, targetKind: text,
    status: z.enum(REVISION_STATUSES),
    reason: text,
    /** The reconciliations this judgement rests on. Also required in refs. */
    reconciliationIds: ids,
    residualRisk: text, actionNeeded: text,
  }).strict(),
  /**
   * One per addendum pass: what the material was, and what it moved.
   *
   * The row the banner on step 01 reads. The counts are RECOMPUTED by the server
   * from the `revision` rows rather than trusted from the model, for the same
   * reason `review_summary`'s are: a tally the model writes drifts from the rows
   * it is a tally of, and the reader reads the tally.
   */
  addendum_summary: z.object({
    pass: z.number().int().positive(), role: text, materialSummary: text,
    upheld: z.number().int().nonnegative().optional(), strengthened: z.number().int().nonnegative().optional(),
    weakened: z.number().int().nonnegative().optional(), overturned: z.number().int().nonnegative().optional(),
    superseded: z.number().int().nonnegative().optional(),
    newIssues: strings, judgement: z.enum(JUDGEMENTS), limitations: strings,
  }).strict(),
  persona_link: z.object({
    // The persona this actor was matched to, echoed back from the candidates the
    // server supplied. Null means "no existing persona fits" and a new one is
    // opened. An id the server did not supply is treated as null rather than
    // trusted — the model cannot mint a row in the reader's library.
    personaId: z.string().max(100).nullable(),
    personaName: text, entityType: text, actorId: text, aliases: strings,
    summary: text,
    // The standing dossier AFTER this assessment, and what this assessment on
    // its own establishes. Kept apart on purpose: the first is cumulative and
    // the second is the row that survives if another assessment is deleted.
    traits: personaTraits, observed: personaTraits,
    continuity: text, divergence: text,
  }).strict(),
} as const;
/**
 * The kinds a `finding` may cite as its result.
 *
 * Read in two places that must not drift: `relationalFault` rejects a conclusion
 * citing anything else, and synthesis pins exactly these into its model call so
 * the context budget can never shed what the rule then demands.
 */
export const RESULT_KINDS = ['test', 'model', 'scenario', 'exploit', 'cross_policy', 'causal_chain', 'option_appraisal', 'evaluation_plan'] as const;

export const REPORT_SECTIONS = ['executive_assessment', 'scope_methodology', 'objectives', 'actors', 'mechanisms', 'theory_of_change', 'options_appraisal', 'evaluation_plan', 'assurance', 'high_risk_assumptions', 'test_results', 'strategic_responses', 'scenarios', 'exploitation', 'cross_policy', 'evidence_gaps', 'confidence_uncertainty', 'distribution', 'unresolved_questions'] as const;
export type Kind = keyof typeof dataSchemas;
export const KINDS = Object.keys(dataSchemas) as [Kind, ...Kind[]];
// Every nullable field also DEFAULTS to null. A model that omits `toId` on an
// actor — where the field means nothing — is being reasonable, and on
// 2026-09-09 one such omission in one of eighteen artefacts failed the whole
// envelope and cost a passage of a live assessment. Absent and null mean the
// same thing here, so they are treated the same.
export const artefactSchema = z.object({
  id: z.string().regex(/^[a-zA-Z0-9_-]{1,100}$/), kind: z.enum(KINDS),
  label: z.string().min(1).max(300), statement: text, origin: z.enum(ORIGINS), confidence: confidenceSchema,
  refs: ids.default([]), sourceId: z.string().nullable().default(null), sourceQuote: z.string().max(12000).nullable().default(null),
  page: z.number().int().positive().nullable().default(null), section: z.string().max(300).nullable().default(null),
  startOffset: z.number().int().nonnegative().nullable().default(null), endOffset: z.number().int().nonnegative().nullable().default(null),
  url: z.string().nullable().default(null), fromId: z.string().nullable().default(null), toId: z.string().nullable().default(null),
  relation: z.enum(RELATIONS).nullable().default(null), temporal: z.enum(['proposed', 'current', 'historical', 'inferred']).nullable().default(null),
  data: z.record(z.string(), z.unknown()),
}).strict();

/**
 * The envelope, parsed WITHOUT its artefacts.
 *
 * `stageOutputSchema` types `artefacts` as an array of strict artefacts, so a
 * single malformed member fails the whole parse — before per-artefact triage can
 * quarantine it. That is precisely the all-or-nothing behaviour triage exists to
 * end, one level up. The runtime path parses this and then checks each artefact
 * on its own.
 */
export const looseOutputSchema = z.object({
  artefacts: z.array(z.unknown()).max(4000),
  warnings: z.array(z.unknown()).max(4000).optional(),
});
export type Artefact = z.infer<typeof artefactSchema>;
/**
 * `sealed` is here so two stages can say the RIGHT thing rather than a true one.
 *
 * A sealed run is handed no neighbours and no persona priors, and from inside the
 * pipeline that is indistinguishable from having none — so stage 11 told the
 * reader "no other assessment was available to compare", which is not why. A
 * chapter that is missing on purpose has to say so on purpose.
 *
 * `searches` is a SEPARATE fact from `sealed`, and keeping them apart is the
 * point. A sealed run may now be allowed to search — the reader ticks for it —
 * while still being handed no neighbours and no personas, because those two
 * write the paper's substance into rows that outlive the run and search does
 * not. So "is this run sealed" no longer answers "can this stage chase its own
 * question", and any stage that asks the second one must ask it directly.
 * Unset falls back to what sealing implies — an unsealed run searches, a sealed
 * one does not — which is what every caller from before the toggle meant, and is
 * the safer way round if the flag ever goes missing.
 */
export type StageInput = { stage: number; title: string; depth?: Depth; graphLoss?: number; sealed?: boolean; searches?: boolean; jurisdiction: string | null; policyArea: string | null; context: string | null; priorWarnings?: string[]; artefacts: Artefact[] };
export type StageOutput = { artefacts: Artefact[]; warnings: string[] };
export const stageOutputSchema = z.object({ artefacts: z.array(artefactSchema).max(2000), warnings: z.array(z.string().max(1000)).max(100) }).strict();
/**
 * The envelope as the INDEXED decomposition is shown it. Display only.
 *
 * `artefactSchema` is strict, so the JSON schema the prompt carries says
 * `additionalProperties: false` — and a prompt that asks for a `sentence` field
 * while showing a schema that forbids one is a contradiction the model resolves
 * by dropping whichever half it likes less. This variant is what `prompts.ts`
 * renders for that path.
 *
 * NOTHING PARSES WITH IT. `expandIndexed` turns a sentence reference into an
 * ordinary extracted fact before triage runs, so by the time anything is
 * validated the response has the shape `stageOutputSchema` describes and the
 * provenance rules are untouched. Keeping the parse on the strict schema is
 * what stops the indexed path becoming a second contract to maintain.
 */
const indexedArtefactSchema = artefactSchema.extend({
  sentence: z.union([z.number().int(), z.tuple([z.number().int(), z.number().int()])]).nullable().default(null),
  // Optional here and required there: on this path the sentence IS the statement
  // for a claim or an actor mention, and the server fills it in.
  statement: text.optional(),
}).strict();
export const indexedOutputSchema = z.object({ artefacts: z.array(indexedArtefactSchema).max(2000), warnings: z.array(z.string().max(1000)).max(100) }).strict();
// Modelling, scenarios and the red team may all surface a hypothesis the
// document inventory did not, and they must be able to record it: a model whose
// `assumptions` point at ids that do not exist is refused, so forbidding the kind
// took the model down with it. Seen on a live run at stage 7, three patterns in
// a row.
// WHAT MAY EXIST IN A STAGE'S OUTPUT — which is not the same list as what the
// MODEL may write. `validation.ts` checks every artefact against this, including
// the rows the retrieval adapter mints itself, which is why `research_source`
// appears on every stage that may retrieve one. `prompts.ts` builds the schema
// list it shows the model from `MODEL_KINDS` below, which drops that kind: a
// later stage may raise a question, and only the adapter may answer one.
//
// `research_question` on 7, 9, 10, 14, 15 and 16 is what lets a later stage ask
// — see FOLLOW_UP_STAGES.
export const STAGE_KINDS: Kind[][] = [
  ['passage'], ['claim', 'mechanism', 'assumption', 'actor'], ['actor', 'alias', 'resolution_candidate'],
  ['edge'], ['profile'], ['research_question', 'research_source'], ['evidence'], ['model', 'assumption', 'research_question', 'research_source'], ['test'], ['scenario', 'assumption', 'research_question', 'research_source'],
  ['exploit', 'assumption', 'research_question', 'research_source'], ['cross_policy'], ['finding', 'recommendation', 'assumption'], ['persona_link'],
  ['causal_chain', 'assumption', 'research_question', 'research_source'], ['option_appraisal', 'evaluation_plan', 'assumption', 'research_question', 'research_source'],
  ['assurance_challenge', 'research_question', 'research_source'], ['finding', 'recommendation', 'assurance_response', 'review_summary', 'assumption'],
];
/**
 * What the MODEL is told it may write, per stage.
 *
 * Only the retrieval adapter mints a `research_source`, and `absorb` discards a
 * model-authored one wherever it appears — but until now stage 5's prompt handed
 * the model that schema anyway, which is an invitation to hand back a source, and
 * a URL, of its own. Describing a kind the model may not write is the defect;
 * this is the one place the two lists are allowed to differ.
 */
export const MODEL_KINDS: Kind[][] = STAGE_KINDS.map((kinds) => kinds.filter((kind) => kind !== 'research_source'));
/**
 * WHAT A STAGE IS GIVEN, AS KINDS, IN THE ORDER IT NEEDS THEM.
 *
 * `stages.ts` says what each stage is `given` in words for the reader; this is
 * the same declaration as the pipeline reads it. A stage listed here is sent
 * ONLY these kinds, and when its context has to be cut the first kind named is
 * the last to go (`fitToBudget`'s `declared`).
 *
 * WHY IT EXISTS. The context used to be "everything, fitted", and the fitter
 * ranks by how late a kind is produced — so the long, late kinds won at every
 * stage, whatever the stage was for. Measured on assessment 03c83ea5 in the
 * review of 25 September 2026: stage 7's context was 90% actor profiles; stage
 * 14 (theory of change) saw 1 mechanism, 1 assumption and 0 evidence against a
 * declared input of "mechanisms, evidence and assumptions"; stage 16 (the
 * challenge) saw no plays at all.
 *
 * Every kind a stage's own contract obliges it to CITE is here — the
 * assumptions a model, scenario, play or chain must rest on; the results a
 * finding must name — because a model can only cite an id it was shown.
 * `research_source` sits near the end of the stages after 6: a follow-up source
 * is read by nothing else, and the one an evidence row has already read is shed
 * first whatever its position (see `budget.ts`).
 *
 * A stage absent from this table keeps the context it always had: 1-4 and 13
 * build a per-unit context of their own, and 8 makes no model call.
 */
export const STAGE_CONTEXT: Partial<Record<number, readonly Kind[]>> = {
  5: ['assumption', 'claim', 'mechanism', 'actor', 'edge', 'profile', 'research_question', 'research_source'],
  6: ['claim', 'assumption', 'mechanism', 'actor'],
  7: ['assumption', 'mechanism', 'edge', 'actor', 'evidence', 'profile', 'claim', 'research_source'],
  9: ['assumption', 'model', 'test', 'mechanism', 'edge', 'actor', 'evidence', 'profile', 'claim', 'research_source'],
  10: ['assumption', 'mechanism', 'model', 'scenario', 'test', 'edge', 'actor', 'evidence', 'claim', 'research_source'],
  11: ['mechanism', 'assumption', 'claim', 'actor', 'exploit', 'test', 'model', 'scenario', 'edge'],
  12: ['test', 'model', 'scenario', 'exploit', 'cross_policy', 'assumption', 'evidence', 'mechanism', 'claim', 'actor', 'profile', 'edge', 'research_question', 'research_source'],
  14: ['mechanism', 'evidence', 'assumption', 'claim', 'research_source'],
  15: ['causal_chain', 'finding', 'recommendation', 'evidence', 'assumption', 'mechanism', 'claim', 'exploit', 'test', 'research_source'],
  16: ['finding', 'recommendation', 'exploit', 'causal_chain', 'option_appraisal', 'evaluation_plan', 'test', 'model', 'scenario', 'cross_policy', 'assumption', 'evidence', 'mechanism', 'claim', 'actor', 'research_source'],
  17: ['assurance_challenge', 'finding', 'recommendation', 'causal_chain', 'option_appraisal', 'evaluation_plan', 'exploit', 'test', 'model', 'scenario', 'cross_policy', 'assumption', 'evidence', 'mechanism', 'claim', 'actor', 'research_source'],
};
/**
 * What an ADDENDUM pass's stages may emit, indexed by step within the pass.
 *
 * Step 0 mints passages on the server with no model involved, exactly as stage 0
 * does. Step 1 reuses the main inventory kinds so the material's claims are the
 * same sort of thing as the paper's and every existing view reads them. Step 2
 * emits `evidence` as well as `reconciliation` — where the material really is
 * evidence for or against a claim, the right row is the one the evidence matrix
 * already understands.
 */
export const ADDENDUM_KINDS: Kind[][] = [
  ['passage'],
  ['claim', 'mechanism', 'assumption', 'actor'],
  ['evidence', 'reconciliation'],
  ['revision', 'addendum_summary'],
];
/** A restatement runs the assured-synthesis contract verbatim. */
export const RESTATEMENT_KINDS: Kind[][] = [['finding', 'recommendation', 'assurance_response', 'review_summary', 'assumption']];
export const PASS_KIND_TABLE: Record<PassKind, Kind[][]> = { addendum: ADDENDUM_KINDS, restatement: RESTATEMENT_KINDS };

/**
 * THE THREE LOOKUPS THAT MUST UNDERSTAND A PASS ORDINAL.
 *
 * `STAGES`, `STAGE_KINDS` and `MODEL_KINDS` are arrays indexed by ordinal, and
 * a pass ordinal is 100+ — so every one of them returns `undefined` for a pass
 * and the stage would emit nothing, validate nothing and be described to the
 * model as `undefined`. These three functions are the only way any of those
 * arrays should be read from here on.
 *
 * A pass's KIND is not derivable from its ordinal (pass 2 may be an addendum or
 * a restatement), so it is passed in. The caller has it: the worker reads it off
 * the `policy_passes` row, and the pipeline is handed it on `StageInput`.
 */
export function stageName(ordinal: number, passKind?: PassKind | null): string {
  if (!isPassStage(ordinal)) return STAGES[ordinal] ?? `Stage ${ordinal}`;
  const names = PASS_STAGES[passKind ?? 'addendum'] ?? ADDENDUM_STAGES;
  return names[passStep(ordinal)] ?? `Stage ${ordinal}`;
}
export function stageKinds(ordinal: number, passKind?: PassKind | null): Kind[] {
  if (!isPassStage(ordinal)) return STAGE_KINDS[ordinal] ?? [];
  return (PASS_KIND_TABLE[passKind ?? 'addendum'] ?? ADDENDUM_KINDS)[passStep(ordinal)] ?? [];
}
/**
 * What the MODEL may write, as opposed to what the stage may carry.
 *
 * Same split as `MODEL_KINDS`: only the retrieval adapter mints a
 * `research_source`. A pass never retrieves, so for a pass the two lists are
 * identical — but the filter stays, because the day a pass is allowed to search
 * is the day an unfiltered copy here would invite the model to author a source.
 */
export function modelKinds(ordinal: number, passKind?: PassKind | null): Kind[] {
  return stageKinds(ordinal, passKind).filter((kind) => kind !== 'research_source');
}

export function artefact(id: string, kind: Kind, label: string, statement: string, data: Record<string, unknown>, overrides: Partial<Artefact> = {}): Artefact {
  return { id, kind, label, statement, data, origin: 'structural_inference', confidence: null, refs: [], sourceId: null, sourceQuote: null, page: null, section: null, startOffset: null, endOffset: null, url: null, fromId: null, toId: null, relation: null, temporal: null, ...overrides };
}
export function safeSourceUrl(value: string): string | null {
  try {
    const u = new URL(value);
    if (!['https:', 'http:'].includes(u.protocol) || u.username || u.password) return null;
    // External citations must not point at the site, local addresses, or special hosts.
    // FORK DIVERGENCE: "the site" is whichever host THIS install is served
    // under, asked of `$lib/server/identity`, rather than the author's own
    // domain hard-coded. A department's deployment has never heard of that one
    // and does have a hostname of its own worth refusing.
    if (!u.hostname.includes('.') || /(^localhost$|\.local$|\.internal$)/i.test(u.hostname) || isSelfHost(u.hostname) || /^[\d.]+$/.test(u.hostname) || u.hostname.includes(':')) return null;
    return u.href;
  } catch { return null; }
}
