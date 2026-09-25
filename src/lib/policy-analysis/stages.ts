// The eighteen stages, explained for the reader.
//
// FINAL COPY from the design handoff (2026-09-14). Keyed by the fixed ordinals in
// `contracts.ts`: `STAGE_NOTES[i]` describes `STAGES[i]`. The ordinals are
// load-bearing — a resumed run persists them — so entries are appended here, never
// reordered, exactly as in the contract.
//
// `produced`, `mins`, `calls` and `status` in the design mock are RUN DATA and are
// NOT included here: take them from `policy_stages`, `policy_executions` and the
// artefact counts. Everything in this file is static explanatory copy.
//
// `given` is the reader's version of `STAGE_CONTEXT` in contracts.ts, which is
// what the pipeline actually sends each stage since phase 19. Change one and
// read the other.

export type StagePhaseKey = 'read' | 'who' | 'test' | 'attack' | 'write';

export type StagePhase = {
  key: StagePhaseKey;
  /** Phase heading, e.g. "Attack it". */
  name: string;
  /** One line on why the phase sits where it does in the order. */
  why: string;
};

export type StageNote = {
  phase: StagePhaseKey;
  /** The contract's stage name, repeated here so the copy is checkable against it. */
  name: string;
  /** One sentence, shown on the collapsed row. */
  what: string;
  /** The paragraph shown when the row is opened. */
  detail: string;
  /** What the stage is handed. */
  given: string;
  /** The artefact kinds it writes, in plain words. */
  emits: string;
  /** The honest limit. Always shown — this is the point of the page. */
  limit: string;
  /** The journey step or annex view its output lands in. */
  lands: string;
  /** True for the exploitation playbook: the stage that produces step 02. */
  lead?: boolean;
};

export const STAGE_PHASES: StagePhase[] = [
  { key: 'read', name: 'Read the paper', why: 'Nothing is judged yet. The paper is taken apart into things that can be pointed at later — passages, claims, bodies, relationships.' },
  { key: 'who', name: 'Work out who is in it', why: 'A red-team read needs motives, so every body named gets a profile before anything is tested.' },
  { key: 'test', name: 'Test it against the world', why: 'What the paper asserts is checked against sources outside it, and against its own wiring.' },
  { key: 'attack', name: 'Attack it', why: 'The adversarial passes. This is where the threats you read on step 02 are produced.' },
  { key: 'write', name: 'Write it up, then challenge it', why: 'The report is written, challenged by a second analytical pass, then rewritten answering every challenge.' },
];

export const STAGE_NOTES: StageNote[] = [
  { phase: 'read', name: 'Document ingestion', what: 'Extracts the text, hashes the file, and splits it into passages that everything later can cite.',
    detail: 'The upload is converted to text, fingerprinted with SHA-256 so the assessment can prove which file it read, and divided into passages. Every later artefact points back at a passage, which is why a finding can always be traced to a line in your paper.',
    given: 'The uploaded file', emits: 'Passages', limit: 'It reads what the file contains. A scanned image with no text layer yields nothing.',
    lands: 'Working' },
  { phase: 'read', name: 'Document decomposition', what: 'Reads each passage and pulls out what the paper claims, the machinery it sets up, what it assumes and who it names.',
    detail: 'One model call per passage, so a long paper costs more calls rather than losing detail. Claims are categorised — objective, responsibility, funding, measure, constraint — and assumptions are scored on importance, uncertainty and consequence at the point they are found.',
    given: 'One passage at a time', emits: 'Claims · mechanisms · assumptions · actor mentions',
    limit: 'It records what the paper says, not whether it is true.',
    lands: 'The write-up' },
  { phase: 'read', name: 'Entity resolution', what: 'Decides which of those names are the same body — and records the ones it refuses to merge.',
    detail: 'Names are matched into bodies with their aliases. Where two rows share a label but not enough evidence to be one body, the pair is kept as an unresolved candidate rather than silently merged, because a wrong merge would attribute one body’s incentives to another.',
    given: 'Every actor mention', emits: 'Bodies · aliases · unresolved candidates',
    limit: 'Pairs it cannot separate are listed as unresolved rather than guessed at.',
    lands: 'Who is involved' },
  { phase: 'read', name: 'Policy knowledge graph', what: 'States every relationship the paper asserts between those bodies and that machinery.',
    detail: 'Twenty-six relationship types — funds, regulates, is accountable for, owns data, can veto — drawn only from what the document states. The gaps matter as much as the links: a body nothing reports to, or a duty with no enforcer, shows up here as an absence.',
    given: 'Bodies, claims and mechanisms', emits: 'Relationships',
    limit: 'Only relationships the paper states. It does not infer the ones it thinks ought to exist.',
    lands: 'How they connect' },
  { phase: 'who', name: 'Actor and incentive profiles', what: 'Profiles the most connected bodies on twenty-one fields, including the one no assurance review asks: who is better off if this fails.',
    detail: 'Stated objectives against operational objectives, what it is judged on, its time horizon, what it can compel, what it knows that others do not, its outside option, and who gains from failure. Each field carries its own origin — extracted fact, inference or behavioural hypothesis — so a reader can see which parts are read off the paper and which are reasoned. The 24 bodies the policy runs through most get all twenty-one fields; every other body gets a short profile — its role, what it wants and what it controls — several to a call.',
    given: 'Each resolved body and its relationships', emits: 'Profiles',
    limit: 'A profile is a hypothesis about incentives, never a finding about any named person. A short profile says less, because the paper says less about that body.',
    lands: 'Who is involved' },
  { phase: 'test', name: 'Targeted research', what: 'Plans questions about what the paper leaves unproven, then goes and retrieves sources.',
    detail: 'Questions are ranked on importance, uncertainty and consequence before any search runs, and each round is planned from what the last round found rather than from the paper again — which is how a line of enquiry develops rather than merely widens. This is no longer the only stage that may ask: the interaction models, scenarios, exploitation playbook, theory of change, appraisal and independent challenge may each raise a further question, and what it finds reaches the stages after them.',
    given: 'The claims and assumptions, and what is still unproven', emits: 'Questions · retrieved sources',
    limit: 'A search excerpt is weak evidence and is labelled as one. A retrieval date is not a publication date.',
    lands: 'What is backed up' },
  { phase: 'test', name: 'Evidence matrix', what: 'Links each claim to something outside the paper — or records that nothing settles it.',
    detail: 'Every link states whether the source supports, contradicts, is mixed on, or is insufficient for the claim, with the source’s quality, relevance and freshness kept separate so a strong claim on a weak source cannot hide.',
    given: 'Claims, assumptions and retrieved sources', emits: 'Evidence links',
    limit: 'Insufficient is a real result and is shown as one, not as a pass.',
    lands: 'What is backed up' },
  { phase: 'test', name: 'Interaction models', what: 'Names the game each part of the policy sets up — principal-agent, metric gaming, enforcement credibility.',
    detail: 'Ten standing patterns. For each one that applies: the players, the strategies open to them, the order of decisions, who knows what, the rewards and sanctions, and the likely equilibria. This is the machinery the later attack passes reason with.',
    given: 'Assumptions, mechanisms and the relationship graph, then evidence and profiles', emits: 'Interaction models',
    limit: 'Semi-formal reasoning about behaviour, not a numerical simulation.',
    lands: 'If things change' },
  { phase: 'test', name: 'Automated policy tests', what: 'Twelve deterministic checks over the paper’s own wiring. No model is involved in any of them.',
    detail: 'Each check walks the stated relationships and asks whether the counterpart it depends on is present: responsibility with authority, accountability with resources, a measure with a data owner, a duty with an enforcer. The only figures in the assessment no model produced.',
    given: 'The relationship graph', emits: 'Check results',
    limit: 'Where the paper does not say enough for a check to run, the result is an open question — never a green.',
    lands: 'Gaps in the paper' },
  { phase: 'attack', name: 'Adversarial scenarios and sensitivity', what: 'Steps through the conditions the policy has to survive, one beat at a time.',
    detail: 'Eight standing conditions — minimum compliance, strategic gaming, limited capacity, leadership change, active opposition. Each is stepped through: what changes, who moves first, what follows, what it lands on, whether anyone would notice, and what would correct it.',
    given: 'Assumptions, interaction models, check results and the graph, then profiles', emits: 'Scenarios · new assumptions',
    limit: 'Each scenario carries its own sensitivity notes: what would change the answer.',
    lands: 'If things change' },
  { phase: 'attack', name: 'Exploitation playbook', what: 'The red team. What each body could do to serve itself at the policy’s expense, scored on four factors.',
    detail: 'For every play: the body that would run it, what it gains, what it costs the policy, what it aims at, whether it stays inside the rules, what would count as early warning, and what would close it. The four factors — incentive, ease, impact and concealment — are judged here; the overall risk figure and its band are computed from them by the server, so the ranking you read on step 02 is reproducible rather than asserted.',
    given: 'Each body’s own profile, with assumptions, mechanisms, models, scenarios and the graph', emits: 'Threats · new assumptions',
    limit: 'A play is a hypothesis about incentives. Where it says a body would act, that is not a finding about anyone.',
    lands: 'Key threats — step 02', lead: true },
  { phase: 'attack', name: 'Cross-policy exposure', what: 'Compares this paper with your other assessments for failures that only exist because several policies are in force at once.',
    detail: 'Seven patterns: conflicting demands on one body, cumulative burden, a shared assumption several policies rest on, arbitrage between regimes, overloaded common actors, contradictory measures, duplicated authority. Identifiers in another assessment are recorded, never joined.',
    given: 'This assessment and your completed ones', emits: 'Cross-policy findings',
    limit: 'A sealed run is handed no neighbours at all, and says so rather than reporting none.',
    lands: 'Other policies' },
  { phase: 'write', name: 'Synthesis', what: 'Writes the report for the first time — kept as the audit record, not the version you read.',
    detail: 'Nineteen sections, each conclusion required to cite the results it rests on. This first pass is retained so the independent challenge has something to challenge and so the trail from challenge to change is inspectable.',
    given: 'Every result produced so far', emits: 'Findings · recommendations',
    limit: 'Superseded by stage 18. It is kept for the audit trail, not shown as the report.',
    lands: 'Working' },
  { phase: 'write', name: 'Actor persona library', what: 'Matches the bodies in this paper to ones you have assessed before.',
    detail: 'Twelve traits that survive a change of policy — mandate, what it is judged on, what it can compel, how it typically plays. What the library holds is kept apart from what this run found, and a prior is context: nothing in the findings rests on it.',
    given: 'Profiles and your existing library', emits: 'Persona links',
    limit: 'The model cannot mint a record in your library; an id it was not offered is treated as no match.',
    lands: 'Met before' },
  { phase: 'write', name: 'Theory of change', what: 'Separates what the policy does from what it produces and what it ultimately changes.',
    detail: 'Inputs, activities, outputs, outcomes and impacts, plus the causal mechanisms between them — and then the two things a logic model usually omits: alternative explanations for the same outcome, and pathways where the intervention makes things worse.',
    given: 'Mechanisms, evidence and assumptions', emits: 'Causal chains',
    limit: 'Each chain states its own judgement: well supported, supported with limits, contested or provisional.',
    lands: 'Why it should work' },
  { phase: 'write', name: 'Options and evaluation', what: 'Compares the proposal with doing nothing, doing the minimum, and the alternatives — then plans how anyone would know it worked.',
    detail: 'Each option is appraised on objective fit, cost, benefit, risk, distribution, affordability, deliverability and reversibility. The evaluation plan keeps process, impact and value-for-money questions apart, and every indicator names a baseline, a target, a source, an owner and a cadence.',
    given: 'Causal chains and the first report, then evidence, assumptions and the paper’s objectives', emits: 'Option appraisals · an evaluation plan',
    limit: 'It appraises the options the paper admits, plus the obvious counterfactuals. It is not a business case.',
    lands: 'Choices and evaluation' },
  { phase: 'write', name: 'Independent challenge', what: 'A second analytical pass whose only job is to attack the report it was handed.',
    detail: 'Seven categories: omission, citation, causality, counter-evidence, confidence, recommendation, completeness. Each challenge records what was tested, the evidence for the objection, its materiality, and what resolution it would need.',
    given: 'The first report and every result behind it', emits: 'Challenges',
    limit: 'This is an automated second pass, not formal human assurance. It is never described as one.',
    lands: 'Independent challenge' },
  { phase: 'write', name: 'Assured synthesis', what: 'Rewrites the report answering every challenge. This is the version you read.',
    detail: 'Each challenge gets a disposition — accepted, partly accepted, rejected or unresolved — and the rewritten findings carry the challenge ids they answer. Anything still unresolved is counted on the verdict rather than buried, so the report cannot quietly close its own objections.',
    given: 'The first report and all seven challenges', emits: 'The report · recommendations · responses · a review summary',
    limit: 'A challenge it could not settle is reported as open rather than quietly closed.',
    lands: 'Verdict — step 01' },
];
