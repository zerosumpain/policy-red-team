import { assessIdentity, type IdentityDecision } from '$lib/jkai/intel/resolve/policy';
import { isAcronymPair, normaliseName } from '$lib/jkai/intel/resolve/match';
import { PERSONA_TRAITS, TRAIT_LABELS, type Artefact, type TraitKey } from './contracts';
import { quotesDocument } from './query-guard';
import { travellingValue, travelsOf } from './travels';

export { PERSONA_TRAITS, TRAIT_LABELS, type TraitKey };
export { travellingValue, travelsOf };

/**
 * The persona library — a body the reader keeps meeting, remembered between
 * assessments.
 *
 * Everything here is pure and testable without a database. The store in
 * `server/personas.ts` reads and writes rows; this module decides what a persona
 * IS, which actor is which persona, and what a prior may say to a running
 * assessment.
 *
 * The whole design turns on one distinction. A persona is CONTEXT, never
 * evidence: it was drawn from other papers about other policies, and importing
 * its conclusions into this assessment would be the opposite of a red team. The
 * provenance rules already enforce that — nothing carrying `prior_assessment`
 * can reach a passage or a retrieved source, so `hasSource` keeps it out of the
 * findings on its own account — and the prompt says it in words as well.
 */

export type PersonaTrait = {
  key: string; label: string; value: string; origin: string; confidence: number | null;
  /**
   * The part of `value` that TRAVELS to another policy, computed when the
   * observation is written — with the paper's own programme names to hand — and
   * kept beside the full wording. Null where nothing travels. Absent on rows
   * written before phase 19, which `travellingValue` works out on read.
   */
  travels?: string | null;
};

export type PersonaRecord = {
  id: string;
  name: string;
  entityType: string;
  aliases: string[];
  summary: string | null;
  dossier: PersonaTrait[];
  sightings: number;
  researchedAt: string | null;
  updatedAt: string | null;
  /** The register body this persona IS, if one is known. See `register.ts`. */
  bodyId?: string | null;
};

/** One assessment's or one research pass's contribution to a persona. */
export type PersonaObservation = {
  id: string;
  personaId: string;
  kind: 'assessment' | 'research';
  analysisId: string | null;
  analysisTitle: string | null;
  actorId: string | null;
  traits: PersonaTrait[];
  plays: { label: string; band: string; exposure: number; legality: string }[];
  sources: { url: string; title: string; quality: string }[];
  note: string | null;
  /** That paper's own one-paragraph summary of the body. */
  summary?: string | null;
  /** The document's hash, where the reader is shown it: two runs of one document are one paper. */
  documentSha?: string | null;
  observedAt: string | null;
};

/** What a running stage is shown about a body it has met before. */
export type PersonaPrior = {
  actorId: string;
  personaId: string;
  name: string;
  entityType: string;
  sightings: number;
  summary: string | null;
  traits: PersonaTrait[];
  /** The plays this body was shown capable of in OTHER assessments, worst first. */
  trackRecord: { label: string; band: string; exposure: number; legality: string; policy: string | null }[];
  /** How the match was made, so the model can discount a weak one. */
  basis: string;
};

const clean = (v: unknown, max = 600): string => String(v ?? '').replace(/\s+/g, ' ').trim().slice(0, max);

/**
 * GROUPS OF PEOPLE ARE NOT PERSONAS.
 *
 * "Children", "parents", "care leavers" — a population a paper affects has no
 * strategy, no powers and no budget line, so a dossier of what its position
 * rewards is a category error. Measured on the live library: 18 of 35 personas
 * were `user_group`, and a generic alias ("children") was what caused the tie
 * that opened a second persona for one body. They are recorded as affected
 * groups instead — see `policy_affected_groups`.
 */
export const isAffectedGroup = (entityType: unknown) => String(entityType ?? '') === 'user_group';

/**
 * The type the identity policy is asked to compare.
 *
 * `assessIdentity` refuses to link two different entity types, which is right
 * for a person and a place and wrong for the public bodies a model types
 * inconsistently: the review found one department typed `department` in one
 * paper and `agency` in the next. Those four are one family here. The policy
 * still wants a strong name signal before it links anything.
 */
const PUBLIC_BODY_TYPES = new Set(['department', 'agency', 'local_authority', 'committee']);
export const identityType = (entityType: string) => (PUBLIC_BODY_TYPES.has(entityType) ? 'public_body' : entityType || 'concept');

/** A resolvable entity in the shape the site's identity policy expects. */
function resolvable(id: string, name: string, type: string, aliases: string[]) {
  const family = identityType(type);
  return { id, name, typeId: family, typeName: family, degree: 0, noteCount: 1, aliases };
}

/** A reader's ruling on identity, as the store holds it. */
export type IdentityRuling = { personaId: string; subject: string; verdict: 'same' | 'different' };

/** The subject a ruling about a NAME is filed under: the name the identity policy would compare. */
export const nameSubject = (name: string) => `name:${normaliseName(name)}`;
export const bodySubject = (bodyId: string) => `body:${bodyId}`;
export const personaSubject = (personaId: string) => `persona:${personaId}`;

/** What a reader has ruled about this persona against any of these subjects. "Different" wins a disagreement. */
export function ruling(rulings: IdentityRuling[], personaId: string, subjects: string[]): 'same' | 'different' | null {
  const mine = rulings.filter((r) => r.personaId === personaId && subjects.includes(r.subject));
  if (mine.some((r) => r.verdict === 'different')) return 'different';
  return mine.length ? 'same' : null;
}

/**
 * Which persona, if any, this actor already is.
 *
 * FIRST THE REGISTER. An actor the GOV.UK register resolved (`bodyId`) is the
 * same body as any persona carrying that id, whatever each paper called it or
 * typed it as — "DfE" as an agency meets "Department for Education" as a
 * department here, where the identity policy alone never let it. Two personas
 * with DIFFERENT register ids are two bodies, and a similar name does not
 * overrule that.
 *
 * THEN THE NAME, through `assessIdentity` — the site's own identity policy,
 * deliberately conservative: a shared name is not a shared body. A reader's
 * ruling goes in as the `IdentityDecision` that policy was written to take and
 * was never given: "not the same" scores nothing, "the same" links outright.
 *
 * An unresolved match opens a NEW persona rather than merging two, because a
 * wrongly merged dossier would quietly contaminate every future assessment that
 * reads it. The reader can merge from the dossier page.
 */
export function matchPersona(
  actor: { id: string; label: string; entityType: string; aliases: string[] },
  candidates: PersonaRecord[],
  context: { bodyId?: string | null; bodyName?: string | null; rulings?: IdentityRuling[] } = {},
): { persona: PersonaRecord; basis: string } | null {
  if (isAffectedGroup(actor.entityType)) return null;
  const rulings = context.rulings ?? [];
  const bodyId = context.bodyId ?? null;
  const subjects = [...new Set([actor.label, ...actor.aliases].map(nameSubject)), ...(bodyId ? [bodySubject(bodyId)] : [])];
  const eligible = candidates.filter((p) => ruling(rulings, p.id, subjects) !== 'different');

  if (bodyId) {
    const same = eligible
      .filter((p) => p.bodyId === bodyId)
      .sort((a, b) => b.sightings - a.sightings || a.id.localeCompare(b.id));
    if (same.length) return { persona: same[0], basis: `Both are ${context.bodyName ?? 'the same body'} on the GOV.UK register` };
  }

  const mine = resolvable(actor.id, actor.label, actor.entityType, actor.aliases);
  const scored = eligible
    .filter((p) => !(bodyId && p.bodyId && p.bodyId !== bodyId))
    .map((persona) => {
      const said = ruling(rulings, persona.id, subjects);
      const decision: IdentityDecision | null = said ? { verdict: said, decidedBy: 'human' } : null;
      return { persona, assessment: assessIdentity(mine, resolvable(persona.id, persona.name, persona.entityType, persona.aliases), {}, decision) };
    })
    .filter((c) => c.assessment.canLink)
    .sort((a, b) => b.assessment.score - a.assessment.score || a.persona.id.localeCompare(b.persona.id));
  if (!scored.length) return null;
  // Two personas the policy cannot separate is exactly the ambiguity the entity
  // stage preserves rather than resolves. Open a new one and let the reader merge.
  if (scored.length > 1 && scored[1].assessment.score >= scored[0].assessment.score - 0.08) return null;
  return { persona: scored[0].persona, basis: scored[0].assessment.reason };
}

/**
 * Pairs of personas a reader should look at: possibly one body recorded twice.
 *
 * Offered, never acted on. The same register body is the strong case and is
 * said as such; one name being the abbreviation of the other, or two names very
 * alike, is the weak one. A pair a reader already ruled different is not
 * offered again, and two DIFFERENT register bodies are never offered at all.
 */
export type DuplicatePair = { a: PersonaRecord; b: PersonaRecord; reason: string; strong: boolean };

export function possibleDuplicates(personas: PersonaRecord[], rulings: IdentityRuling[], bodyNames: Map<string, string> = new Map()): DuplicatePair[] {
  const out: DuplicatePair[] = [];
  const names = (p: PersonaRecord) => [p.name, ...p.aliases];
  for (let i = 0; i < personas.length; i++) {
    for (let j = i + 1; j < personas.length; j++) {
      const a = personas[i], b = personas[j];
      if (ruling(rulings, a.id, [personaSubject(b.id)]) === 'different' || ruling(rulings, b.id, [personaSubject(a.id)]) === 'different') continue;
      if (a.bodyId && b.bodyId) {
        if (a.bodyId === b.bodyId) out.push({ a, b, strong: true, reason: `Both are ${bodyNames.get(a.bodyId) ?? 'the same body'} on the GOV.UK register.` });
        continue;
      }
      if (names(a).some((x) => names(b).some((y) => isAcronymPair(x, y)))) {
        out.push({ a, b, strong: false, reason: 'One name is a short form of the other.' });
        continue;
      }
      const score = assessIdentity(resolvable(a.id, a.name, a.entityType, a.aliases), resolvable(b.id, b.name, b.entityType, b.aliases)).score;
      if (score >= 0.6) out.push({ a, b, strong: false, reason: 'Their names are very alike.' });
    }
  }
  return out.sort((x, y) => Number(y.strong) - Number(x.strong) || x.a.name.localeCompare(y.a.name));
}

/**
 * ONE LINK PER ACTOR, whatever the model sent.
 *
 * Measured on the live library: one call emitted two `persona_link`s for the
 * actor "Children" and the store opened two personas for it. The prompt says
 * "exactly one"; a prompt is not a control. The fullest is kept — most traits
 * recorded, then the most said — and the caller warns once.
 */
export function onePerActor(links: Artefact[]): { kept: Artefact[]; dropped: number } {
  const richness = (a: Artefact): [number, number] => {
    const observed = Array.isArray(a.data.observed) ? (a.data.observed as { value?: unknown }[]) : [];
    return [observed.filter((t) => String(t.value ?? '').trim()).length, JSON.stringify(a.data).length];
  };
  const best = new Map<string, Artefact>();
  for (const link of links) {
    const actorId = String(link.data.actorId ?? link.id);
    const held = best.get(actorId);
    if (!held) { best.set(actorId, link); continue; }
    const [heldTraits, heldLength] = richness(held);
    const [traits, length] = richness(link);
    if (traits > heldTraits || (traits === heldTraits && length > heldLength)) best.set(actorId, link);
  }
  return { kept: [...best.values()], dropped: links.length - best.size };
}

/**
 * THE STANDING DOSSIER, COMPUTED FROM WHAT IS LEFT.
 *
 * It used to be merged model prose, written once and never recomputed — so
 * deleting a paper cascaded its observation away and left its wording in the
 * dossier and summary for good (`server/store.ts`, measured). Now it is a fold
 * of the observations that remain, oldest first, through `foldTraits`'s rules;
 * delete a paper and the dossier is rebuilt without it.
 *
 * What goes in: each paper's `observed` traits, reduced to what travels, and
 * public-source research as it was recorded. What stays out: a trait marked
 * `prior_assessment` — carried from the library, not established by that paper
 * — which folded back in would be the library confirming itself.
 */
export function rebuildDossier(observations: PersonaObservation[]): { dossier: PersonaTrait[]; summary: string | null } {
  const oldestFirst = [...observations].sort((a, b) => (a.observedAt ?? '').localeCompare(b.observedAt ?? ''));
  let dossier: PersonaTrait[] = [];
  for (const o of oldestFirst) {
    const traits: PersonaTrait[] = [];
    for (const t of o.traits) {
      if (t.origin === 'prior_assessment') continue;
      const value = o.kind === 'research' ? t.value : travelsOf(t);
      if (value) traits.push({ key: t.key, label: t.label, value, origin: t.origin, confidence: t.confidence });
    }
    dossier = foldTraits(dossier, traits);
  }
  // The newest paper's summary, or a commissioned enquiry's where that is newer:
  // both describe the body, and neither survives the observation it came with.
  const latest = [...oldestFirst].reverse().find((o) => o.summary);
  return { dossier: dossier.slice(0, 30), summary: latest?.summary ?? null };
}

/**
 * Bound a prior to what a stage can actually use.
 *
 * The context budget sheds by kind and a prior is not an artefact, so it rides
 * the payload uncapped unless something caps it. Twelve traits at 600 characters
 * plus six plays is about 9,000 characters for an actor — affordable once per
 * fan-out unit, and the fan-out is one actor at a time.
 */
export const PRIOR_TRAITS = 12;
export const PRIOR_PLAYS = 6;

/**
 * What a running stage is shown about a body — or null when every sighting is
 * the paper now being assessed.
 *
 * `exclude` is the running analysis AND every other analysis of the same
 * document. Measured on the live library: the only personas "seen twice" were
 * two runs of one paper, so a re-run was shown its own earlier run as though
 * another policy had found it. A redraft of the same paper is not another
 * policy — `neighbourSummaries` already knew that; the library did not. The
 * traits are recomputed from the remaining observations, so nothing the
 * excluded runs said reaches the prompt through the folded dossier either.
 */
export function personaPrior(
  actorId: string,
  match: { persona: PersonaRecord; basis: string },
  observations: PersonaObservation[],
  exclude: string | null | ReadonlySet<string> = null,
): PersonaPrior | null {
  const { persona, basis } = match;
  const excluded = (id: string | null) => (exclude instanceof Set ? exclude.has(id ?? '') : typeof exclude === 'string' ? id === exclude : false);
  const mine = observations.filter((o) => o.personaId === persona.id);
  const remaining = mine.filter((o) => !excluded(o.analysisId));
  const papers = new Set(remaining.filter((o) => o.kind === 'assessment' && o.analysisId).map((o) => o.analysisId));
  // Nothing left but this paper: there is no prior, only an echo.
  if (mine.length && !papers.size) return null;
  const rebuilt = mine.length ? rebuildDossier(remaining) : null;
  const traits = rebuilt?.dossier ?? persona.dossier;
  // The stored summary may be the excluded run's own words; it is only used
  // when nothing was excluded and no observation carries a summary of its own.
  const summary = rebuilt?.summary ?? (remaining.length === mine.length ? persona.summary : null);
  const trackRecord = remaining
    .filter((o) => o.personaId === persona.id)
    .flatMap((o) => o.plays.map((p) => ({ ...p, policy: o.analysisTitle })))
    .sort((a, b) => b.exposure - a.exposure)
    .slice(0, PRIOR_PLAYS)
    .map((p) => ({ label: clean(p.label, 200), band: clean(p.band, 40), exposure: Number(p.exposure) || 0, legality: clean(p.legality, 40), policy: p.policy ? clean(p.policy, 120) : null }));
  return {
    actorId,
    personaId: persona.id,
    name: persona.name,
    entityType: persona.entityType,
    sightings: mine.length ? papers.size : persona.sightings,
    summary: summary ? clean(summary, 900) : null,
    traits: traits.slice(0, PRIOR_TRAITS).map((t) => ({ ...t, value: clean(t.value) })),
    trackRecord,
    basis: clean(basis, 200),
  };
}

/**
 * What one assessment observed about a body, distilled from its profile.
 *
 * A deterministic fallback, used when the merge call cannot run: the persona
 * still gains a row and the reader still sees a sighting, rather than the
 * assessment having met the body and recorded nothing.
 */
export function observationFromProfile(profile: Artefact | null): PersonaTrait[] {
  if (!profile) return [];
  const FROM_PROFILE: [TraitKey, string][] = [
    ['accountableTo', 'accountableTo'], ['judgedOn', 'successCriteria'], ['timeHorizon', 'timeHorizon'],
    ['resources', 'resources'], ['legalPowers', 'legalPowers'], ['informationControl', 'informationControlled'],
    ['constraints', 'constraints'], ['outsideOption', 'outsideOption'], ['gainFromFailure', 'gainFromFailure'],
    ['standingStrategies', 'strategies'], ['mandate', 'formalRole'],
  ];
  const traits: PersonaTrait[] = [];
  for (const [key, field] of FROM_PROFILE) {
    const raw = profile.data[field];
    if (!raw || typeof raw !== 'object') continue;
    const f = raw as { value?: unknown; origin?: unknown; confidence?: unknown };
    const value = clean(f.value);
    if (!value || /^unknown\b/i.test(value)) continue;
    traits.push({ key, label: TRAIT_LABELS[key] ?? key, value, origin: String(f.origin ?? 'structural_inference'), confidence: typeof f.confidence === 'number' ? f.confidence : null });
  }
  return traits;
}

/** The plays an assessment found for one actor, in the shape a persona keeps them. */
export function playsFor(actorId: string, artefacts: Artefact[]) {
  return artefacts
    .filter((a) => a.kind === 'exploit' && a.data.actorId === actorId)
    .map((a) => ({ label: clean(a.label, 200), band: clean(a.data.band, 40) || 'limited', exposure: Number(a.data.exposure) || 0, legality: clean(a.data.legality, 40) }))
    .sort((a, b) => b.exposure - a.exposure)
    .slice(0, 12);
}

/**
 * Fold one assessment's traits into a standing dossier, key by key.
 *
 * The server's fallback when the merge call fails, and the shape the merge call
 * is asked to produce. A newer observation supersedes an older one for the same
 * key, EXCEPT where the older is an extracted fact and the newer is an
 * inference: an inference does not overwrite something a document actually said.
 */
const ORIGIN_RANK: Record<string, number> = {
  extracted_fact: 4, external_evidence: 3, model_result: 2, structural_inference: 1,
  behavioural_hypothesis: 1, prior_assessment: 0, normative_judgement: 0,
};

export function foldTraits(standing: PersonaTrait[], observed: PersonaTrait[]): PersonaTrait[] {
  const byKey = new Map(standing.map((t) => [t.key, t]));
  for (const trait of observed) {
    if (!trait.value) continue;
    const held = byKey.get(trait.key);
    if (held && (ORIGIN_RANK[held.origin] ?? 0) > (ORIGIN_RANK[trait.origin] ?? 0)) continue;
    byKey.set(trait.key, { ...trait, label: TRAIT_LABELS[trait.key] ?? trait.label ?? trait.key });
  }
  // Dossier order follows the vocabulary, not insertion, so two personas read
  // the same way down the page.
  const order = PERSONA_TRAITS.map(([key]) => key as string);
  return [...byKey.values()].sort((a, b) => {
    const ai = order.indexOf(a.key), bi = order.indexOf(b.key);
    return (ai < 0 ? order.length : ai) - (bi < 0 ? order.length : bi) || a.key.localeCompare(b.key);
  });
}

/**
 * The persona queries that may actually be sent.
 *
 * A dossier is written by a model reading somebody's UNPUBLISHED policy paper,
 * so a trait's value can carry that paper's own wording — and the query planner
 * is shown every trait. The prompt says "no document quotes"; a prompt is not a
 * control, and this is the same measured guard the in-run research uses. The
 * corpus is the passages of exactly the assessments the dossier was built from,
 * which are the only documents whose wording could have reached it.
 *
 * Exported, and tested, because a guard nobody can see fail is a guard that
 * quietly stops running.
 */
export function sendableQueries(questions: Artefact[], corpus: Set<string>): Artefact[] {
  return questions.filter((q) => !quotesDocument(String(q.data.searchStrategy ?? ''), corpus));
}
