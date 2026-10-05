/**
 * THE MASTER LIST OF ACTORS, AND HOW A RUN MATCHES BACK INTO IT — phase 23.
 *
 * John, 5 October 2026: "I've found lots of duplicate actors, because they're
 * recorded from different perspectives. I want to create a master list of
 * actors with matching back in. If there's a hierarchy around an actor's role,
 * that should be baked into the design, vs recording duplicate actors."
 *
 * MEASURED on the real Best Start run (44dd5420): 236 stage-2 actor rows under
 * 148 labels. 227 of them were `_candidate_` rows. The model had grouped the
 * mentions itself — 19 actors on the main call — and two "unclaimed" top-ups
 * dumped 115 more into two buckets called "Unresolved source actor mentions";
 * then `preserveAmbiguity` split EVERY group in which two members failed the
 * identity policy pairwise (a `department` and a `concept` cannot link), so
 * "Government" went back to thirteen rows, "Parents" to thirteen. The
 * duplication was manufactured downstream of a model that had mostly got it
 * right, which is why the fix is a register and a server that decides, not a
 * longer prompt.
 *
 * So a run now matches into ONE owner-wide list (the persona library,
 * extended — see `migrations/0006-actor-register.sql`):
 *
 *   1. DETERMINISTIC FIRST. Exact name, alias, the GOV.UK register, and every
 *      ruling the reader has made. No model call. Groups of people, offices and
 *      sectors are matched exactly as bodies are; a named private individual is
 *      dropped before anything else sees it.
 *   2. ONE MODEL CALL FOR THE REST, handed the master list as a compact tree
 *      that is byte-identical across the calls of a run, so a second chunk reads
 *      it from the prompt cache. Each answer is "this is r12, in capacity C",
 *      "new, part of / kind of Y", or "not an actor, because".
 *   3. A RECONCILIATION over everything, in the server: one actor per master
 *      actor, whatever any call said, so independent calls cannot duplicate.
 *   4. ANYTHING NEW IS PROPOSED. Used in this run, queued for the reader.
 *
 * Pure: no database, no network. `server/actor-register.ts` reads and writes
 * the rows; `pipeline.ts` runs the stage.
 */
import { normaliseName } from '$lib/jkai/intel/resolve/match';
import { ACTOR_KINDS, CAPACITIES, NOT_ACTOR_REASONS, artefact, type Artefact } from './contracts';
import { bodyFacts, nameKey, resolveBody, type RegisterIndex } from './register';

export { ACTOR_KINDS, CAPACITIES, NOT_ACTOR_REASONS };
export type ActorKind = (typeof ACTOR_KINDS)[number];
export type RegisterKind = ActorKind | 'not_an_actor';
export type Capacity = (typeof CAPACITIES)[number];
export type NotActorReason = (typeof NOT_ACTOR_REASONS)[number];
export const REGISTER_KINDS: readonly RegisterKind[] = [...ACTOR_KINDS, 'not_an_actor'];

/** One row of the master list, as the matcher sees it. */
export type RegisterEntry = {
  id: string;
  name: string;
  aliases: string[];
  kind: RegisterKind;
  partOf: string | null;
  kindOf: string | null;
  status: 'confirmed' | 'proposed';
  bodyId: string | null;
  whatItIs: string | null;
  notActorReason: string | null;
  entityType: string;
};

/** A reader's ruling, as `personas.ts` keeps it: same or different, about a persona, a body or a name. */
export type RegisterRuling = { personaId: string; subject: string; verdict: 'same' | 'different' };

/** Everything a run reads from the register: read-only, and the same for every call of the stage. */
export type RegisterView = { entries: RegisterEntry[]; rulings: RegisterRuling[]; bodies?: RegisterIndex | null };

const clip = (v: unknown, max: number) => String(v ?? '').replace(/\s+/g, ' ').trim().slice(0, max);
const strings = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : []);

// ---------------------------------------------------------------------------
// Names
// ---------------------------------------------------------------------------

/**
 * One government, however a paper writes it. "The Government", "HM
 * Government", "UK Government" and "central government" were four labels for
 * one actor on the Best Start run. "Labour government" is NOT here: it was the
 * 1998 government that introduced funded hours — history, not the actor.
 */
const GOVERNMENT = new Set(['government', 'uk government', 'central government', 'national government', 'uk central government', 'westminster government', 'this government']);

/** The last word, singular: "childminders" and "childminder", "authorities" and "authority", are one key. */
function singular(word: string): string {
  if (word.length <= 3) return word;
  if (/ies$/.test(word)) return `${word.slice(0, -3)}y`;
  if (/(ch|sh|x|ss)es$/.test(word)) return word.slice(0, -2);
  if (/(us|is|ss)$/.test(word)) return word;
  if (/s$/.test(word)) return word.slice(0, -1);
  return word;
}

/**
 * THE COMPARABLE FORM OF AN ACTOR'S NAME. The register's `nameKey` (case,
 * punctuation, a leading "the" or "HM", the of/for slip in a department's
 * name), then the government folding above and the last word made singular.
 * Deliberately no fuzzier than that: "Early years teachers" and "Early years
 * workforce" are one actor only when a reader or the model says so.
 */
export function actorKey(name: string): string {
  const key = nameKey(name);
  if (GOVERNMENT.has(key)) return 'government';
  const words = key.split(' ');
  words[words.length - 1] = singular(words[words.length - 1] ?? '');
  return words.join(' ').trim();
}

/** The subject a NAME ruling is filed under — identical to `personas.ts`'s `nameSubject`. */
export const nameSubject = (name: string) => `name:${normaliseName(name)}`;
export const bodySubject = (bodyId: string) => `body:${bodyId}`;
export const personaSubject = (personaId: string) => `persona:${personaId}`;

function ruled(rulings: RegisterRuling[], personaId: string, subjects: string[]): 'same' | 'different' | null {
  const mine = rulings.filter((r) => r.personaId === personaId && subjects.includes(r.subject));
  if (mine.some((r) => r.verdict === 'different')) return 'different';
  return mine.length ? 'same' : null;
}

// ---------------------------------------------------------------------------
// What a mention is
// ---------------------------------------------------------------------------

/**
 * A word that makes a person-typed label a ROLE rather than a person: "the
 * Secretary of State for Education", "Speech therapists", "Family help lead
 * practitioner". A person-typed label with none of these and the shape of a
 * name is a named individual.
 */
const ROLE_WORD = /\b(secretar(?:y|ies)|ministers?|chancellors?|commissioners?|champions?|chiefs?|directors?|officers?|leads?|leaders?|co-?ordinators?|advis[eo]rs?|inspectors?|heads?|managers?|teachers?|practitioners?|professionals?|therapists?|visitors?|workers?|staff|chairs?|governors?|registrars?|ombudsm[ae]n|mayors?|councillors?|clerks?|auditors?|regulators?|nurses?|doctors?|gps?|midwi(?:fe|ves)|educators?|parents?|mothers?|fathers?|carers?|child(?:ren)?|pupils?|students?|famil(?:y|ies)|members?|officials?|president|judges?|panel|board|team|coordinator|assistants?|specialists?|experts?|employers?|providers?|leaders?|tutors?|mentors?|apprentices?|trainees?|people|residents?|users?|claimants?)\b/i;

/** A capitalised word of a personal name: "Lauren", "Alex", "O'Neill", "Smith-Jones". */
const NAME_WORD = /^(?:[A-Z][a-z’'.-]+|Dr|Mr|Mrs|Ms|Mx|Prof|Rt|Hon|MP|MBE|OBE|CBE|[A-Z]\.)$/;

/**
 * A NAMED PRIVATE INDIVIDUAL — "Lauren", "Alex Armstrong" — never an actor.
 *
 * The About page promises no profile of a named person, and the Best Start run
 * made one of a case-study mother. A privacy fix as much as a tidy-up, so it is
 * decided here, by rule, before a model or the register sees the mention. Only
 * person-typed labels: a provider called "Tiney" is a company, not a person.
 * A public office named by its title is a role and stays.
 */
export function isNamedPerson(label: string, entityType: string): boolean {
  if (entityType !== 'person') return false;
  const words = label.trim().split(/\s+/).filter(Boolean);
  if (!words.length || words.length > 5) return false;
  if (ROLE_WORD.test(label)) return false;
  return words.every((w) => NAME_WORD.test(w));
}

/** A label that names a service or a body, even when stage 1 typed it a programme: "Family hubs", "Maths Hubs". */
const ORG_WORD = /\b(hubs?|services?|centres?|centers?|teams?|units?|panels?|taskforces?|boards?|commissions?|networks?|agenc(?:y|ies)|authorit(?:y|ies)|councils?|trusts?|foundations?|alliances?|offices?|departments?|institutes?|bodies|body|organisations?|providers?|schools?|nurseries|nursery|colleges?)\b/i;
/** A label that names a scheme, benefit, app, plan or measure: never an actor. */
const SCHEME_WORD = /\b(programmes?|programs?|schemes?|credits?|allowances?|grants?|app|apps|plans?|strateg(?:y|ies)|funds?|funding|entitlements?|initiatives?|pilots?|offers?|frameworks?|guarantees?|campaigns?|missions?|reforms?|polic(?:y|ies)|acts?|bills?|regulations?|profiles?|assessments?|curriculum|standards?|tests?|measures?|targets?|indicators?|returns?|data|datasets?|registers?|portal|website|platform)\b/i;
const ASSESSMENT_WORD = /\b(profiles?|assessments?|curriculum|standards?|tests?|measures?|targets?|indicators?|frameworks?|returns?|data|datasets?)\b/i;

export type MentionClass =
  | { is: 'actor' }
  | { is: 'not_actor'; reason: NotActorReason }
  | { is: 'unsure'; hint: 'programme' | 'person' | 'composite' };

/**
 * What a mention is, by rule alone. `unsure` goes to the model with a hint;
 * the deterministic answers are the ones a reader would not argue with.
 */
export function classifyMention(mention: { label: string; data: Record<string, unknown> }): MentionClass {
  const type = String(mention.data.entityType ?? '');
  const label = mention.label;
  if (isNamedPerson(label, type)) return { is: 'not_actor', reason: 'named_person' };
  if (type === 'geography') return { is: 'not_actor', reason: 'place' };
  if (type === 'dataset' || type === 'legislation') return { is: 'not_actor', reason: type === 'dataset' ? 'assessment' : 'other' };
  if (type === 'person' && !ROLE_WORD.test(label)) return { is: 'unsure', hint: 'person' };
  if (type === 'programme' && !ORG_WORD.test(label)) return { is: 'unsure', hint: 'programme' };
  // By the LAST word: "Early Years Foundation Stage Profile assessment" is an
  // assessment although "Foundation" names a body elsewhere.
  if (type === 'concept' && ASSESSMENT_WORD.test(label.trim().split(/\s+/).at(-1) ?? '')) return { is: 'not_actor', reason: 'assessment' };
  return { is: 'actor' };
}

/**
 * "Nurseries and childminders" is two mentions of two actors. Split on a comma,
 * "and" or "&". Only ever ACCEPTED where every part is something the register
 * or this paper already names on its own — "Department for Work and Pensions"
 * and "Early education and childcare providers" stay whole unless a reader or
 * the model says otherwise.
 */
export function splitComposite(label: string): string[] | null {
  if (!/,|\band\b|&/i.test(label)) return null;
  const parts = label.split(/\s*,\s*(?:and\s+)?|\s+and\s+|\s*&\s*/i).map((p) => p.trim()).filter(Boolean);
  return parts.length >= 2 ? parts : null;
}

/**
 * The capacity a passage shows an actor in, read off stage 1's own one-line
 * statement of the mention. A rule a reader can check, used where the model
 * gave none and for every mention matched without a call. First match wins, in
 * the order a policy paper's verbs carry most weight.
 */
const CAPACITY_RULES: [Capacity, RegExp][] = [
  ['regulates', /\b(regulat|inspect|enforc|oversee|oversight|licens|registr|sanction|accredit)/i],
  ['funds', /\b(fund(s|ed|er|ing)?\b|pays?\b|paid\b|financ|invest|grant[s]? to|allocat|budget)/i],
  ['commissions', /\b(commission|procur|contract(s|ed)?\b)/i],
  ['is_measured', /\b(measured|judged|held to account|accountable|targets?\b|report card|outcomes? (?:are|is) measured|performance)/i],
  ['decides', /\b(decide|sets?\b|lead(s|ing)?\b|appoint|polic(y|ies) (body|sponsor)|responsible for|determin|approv|direct(s|ed)?\b|pursu|introduc|present)/i],
  ['delivers', /\b(deliver|provid|run(s|ning)?\b|operat|offer|supply|supplies|build|expand|work(s)? with famil|support(s|ing)?\b|distribut)/i],
  ['advises', /\b(advis|evidence|research|guidance|recommend|evaluat)/i],
  ['partners', /\b(partner|work(s|ing)? (with|alongside|in partnership)|collaborat|consult)/i],
  ['receives', /\b(receiv|benefit|recipient|eligible|entitled|users?\b|use[sd]?\b|access|take[- ]up|intended|target(ed)? (group|of))/i],
  ['is_affected', /\b(affected|burden|bear|cost to|impact(ed)? on|face)/i],
];
export function capacityOf(statement: string): Capacity {
  for (const [capacity, re] of CAPACITY_RULES) if (re.test(statement)) return capacity;
  return 'named_only';
}

/**
 * A new actor's kind, from what stage 1 typed it and how it is named. A
 * plural provider or authority ("Early years providers", "Local authorities")
 * is a category of bodies, not one body.
 */
export function inferKind(entityType: string, label: string): ActorKind {
  const plural = /s$/i.test(label.trim().split(/\s+/).at(-1) ?? '') && !/(us|ss|is)$/i.test(label.trim());
  if (entityType === 'user_group') return 'group_of_people';
  if (entityType === 'person') return plural ? 'group_of_people' : 'office_or_role';
  if (['provider', 'local_authority', 'contractor'].includes(entityType) && plural) return 'sector_or_category';
  return 'organisation';
}

// ---------------------------------------------------------------------------
// Matching
// ---------------------------------------------------------------------------

/** What a mention resolved to. A composite mention resolves to several. */
export type Target =
  | { to: 'existing'; id: string }
  | { to: 'new'; key: string };

export type Proposal = {
  key: string;
  name: string;
  kind: ActorKind | 'not_an_actor';
  entityType: string;
  partOf: Target | null;
  kindOf: Target | null;
  bodyId: string | null;
  whatItIs: string | null;
  notActorReason: NotActorReason | null;
};

export type Resolution = {
  mentionId: string;
  /** Null for a mention that is dropped outright (a named person). */
  target: Target | null;
  /** Set when the target is not an actor: the mention is context, never profiled. */
  notActor: NotActorReason | null;
  /** For a programme: the actor that runs it. */
  runBy: Target | null;
  capacity: Capacity;
  basis: 'name' | 'alias' | 'register' | 'ruling' | 'model' | 'reconciled' | 'rule' | 'fallback';
};

/** An unmatched group of mentions sharing one name, as the model is shown it. */
export type MatchItem = { item: string; mentions: string[]; said: string; type: string; context: string; hint?: string; parts?: string[] };

export type DeterministicResult = {
  resolutions: Resolution[];
  proposals: Map<string, Proposal>;
  items: MatchItem[];
  /** Mentions dropped as named individuals — counted, never named. */
  people: number;
};

const newKey = (name: string) => `n:${actorKey(name)}`;

/**
 * An index of the register by key, with the reader's "not the same" rulings
 * applied per name. Built once per stage.
 */
export function entryIndex(view: RegisterView) {
  const byKey = new Map<string, RegisterEntry[]>();
  const byAlias = new Map<string, RegisterEntry[]>();
  const byBody = new Map<string, RegisterEntry[]>();
  const add = (map: Map<string, RegisterEntry[]>, key: string, entry: RegisterEntry) => {
    if (!key) return;
    const held = map.get(key) ?? [];
    if (!held.includes(entry)) held.push(entry);
    map.set(key, held);
  };
  for (const entry of view.entries) {
    add(byKey, actorKey(entry.name), entry);
    for (const alias of entry.aliases) add(byAlias, actorKey(alias), entry);
    if (entry.bodyId) add(byBody, entry.bodyId, entry);
  }
  const byId = new Map(view.entries.map((e) => [e.id, e]));
  return { byKey, byAlias, byBody, byId, rulings: view.rulings };
}
type EntryIndex = ReturnType<typeof entryIndex>;

/**
 * ONE name against the register, by rule. Null when nothing matches or when
 * two entries match equally — a tie goes to the model, never to a coin.
 */
export function matchName(name: string, index: EntryIndex): { entry: RegisterEntry; basis: Resolution['basis'] } | null {
  const subject = nameSubject(name);
  // A "the same" ruling about this name is the reader saying where it goes.
  const sameAs = index.rulings.filter((r) => r.subject === subject && r.verdict === 'same').map((r) => index.byId.get(r.personaId)).filter((e): e is RegisterEntry => Boolean(e));
  const allowed = (e: RegisterEntry) => ruled(index.rulings, e.id, [subject]) !== 'different';
  if (sameAs.length === 1 && allowed(sameAs[0])) return { entry: sameAs[0], basis: 'ruling' };
  const key = actorKey(name);
  const pick = (found: RegisterEntry[] | undefined) => {
    const ok = (found ?? []).filter(allowed);
    if (ok.length === 1) return ok[0];
    // Two rows with one name: the confirmed one, if exactly one is.
    const confirmed = ok.filter((e) => e.status === 'confirmed');
    return confirmed.length === 1 ? confirmed[0] : null;
  };
  const byName = pick(index.byKey.get(key));
  if (byName) return { entry: byName, basis: 'name' };
  if (index.byKey.get(key)?.some(allowed)) return null;
  const byAlias = pick(index.byAlias.get(key));
  if (byAlias) return { entry: byAlias, basis: 'alias' };
  return null;
}

/**
 * STEP 1: every mention the rules can place, without a model.
 *
 * Identical names in ONE paper are one actor, always: the owner's own example
 * is "Government" thirteen times. Mentions the rules cannot place are grouped
 * by that same key into items for the model, so it answers once for a name
 * however often the paper uses it.
 */
export function matchDeterministic(mentions: Artefact[], view: RegisterView): DeterministicResult {
  const index = entryIndex(view);
  const resolutions: Resolution[] = [];
  const proposals = new Map<string, Proposal>();
  const pending = new Map<string, { mentions: Artefact[]; hint?: MatchItem['hint']; parts?: string[] }>();
  let people = 0;
  // What THIS paper names on its own, so a composite whose parts are each named
  // elsewhere in it can be split without asking.
  const ownKeys = new Set(mentions.filter((m) => !splitComposite(m.label)).map((m) => actorKey(m.label)));
  const statement = (m: Artefact) => `${m.statement} ${m.label}`;

  const placeByRule = (name: string, mention: Artefact): Target | null => {
    const hit = matchName(name, index);
    if (hit) return { to: 'existing', id: hit.entry.id };
    return null;
  };
  const viaRegister = (mention: Artefact): Target | null => {
    if (!view.bodies) return null;
    const type = String(mention.data.entityType ?? '');
    const aliases = strings(mention.data.aliases).filter((a) => !isNamedPerson(a, 'person'));
    const resolved = resolveBody({ label: mention.label, aliases, entityType: type }, view.bodies);
    if (!resolved) return null;
    const subjects = [bodySubject(resolved.body.id), nameSubject(mention.label)];
    const held = (index.byBody.get(resolved.body.id) ?? []).filter((e) => ruled(index.rulings, e.id, subjects) !== 'different');
    if (held.length) return { to: 'existing', id: held[0].id };
    // A body the GOV.UK register vouches for is new to this reader: proposed
    // under its OFFICIAL name, with what the register says it is.
    const official = resolved.body.name;
    const byOfficial = matchName(official, index);
    if (byOfficial) return { to: 'existing', id: byOfficial.entry.id };
    const key = newKey(official);
    if (!proposals.has(key)) {
      const facts = bodyFacts(resolved.body, view.bodies);
      proposals.set(key, {
        key, name: official, kind: 'organisation', entityType: type || 'agency', partOf: null, kindOf: null, bodyId: resolved.body.id,
        whatItIs: facts.kindMeans ? `${facts.kindMeans[0].toUpperCase()}${facts.kindMeans.slice(1)}.` : null, notActorReason: null,
      });
    }
    return { to: 'new', key };
  };

  for (const mention of mentions) {
    const capacity = capacityOf(statement(mention));
    const kind = classifyMention(mention);
    if (kind.is === 'not_actor' && kind.reason === 'named_person') {
      people++;
      resolutions.push({ mentionId: mention.id, target: null, notActor: 'named_person', runBy: null, capacity, basis: 'rule' });
      continue;
    }
    // The register first, whatever the rules think of the mention: a reader's
    // "not an actor" is an entry too, and a programme already on the list is
    // matched here rather than asked about again.
    const ruledTarget = placeByRule(mention.label, mention);
    if (ruledTarget) {
      const entry = index.byId.get((ruledTarget as { id: string }).id)!;
      resolutions.push({ mentionId: mention.id, target: ruledTarget, notActor: entry.kind === 'not_an_actor' ? (entry.notActorReason as NotActorReason) ?? 'other' : null, runBy: null, capacity, basis: matchName(mention.label, index)!.basis });
      continue;
    }
    if (kind.is === 'not_actor') {
      // A place or a dataset is context. It is recorded under its own name so
      // the reader can overrule it, and so the next paper matches it by rule.
      const key = newKey(mention.label);
      if (!proposals.has(key)) proposals.set(key, { key, name: clip(mention.label, 300), kind: 'not_an_actor', entityType: String(mention.data.entityType ?? 'concept'), partOf: null, kindOf: null, bodyId: null, whatItIs: null, notActorReason: kind.reason });
      resolutions.push({ mentionId: mention.id, target: { to: 'new', key }, notActor: kind.reason, runBy: null, capacity, basis: 'rule' });
      continue;
    }
    const registered = viaRegister(mention);
    if (registered) {
      resolutions.push({ mentionId: mention.id, target: registered, notActor: null, runBy: null, capacity, basis: 'register' });
      continue;
    }
    // A composite whose every part the register or this paper already names.
    const parts = splitComposite(mention.label);
    if (parts) {
      const placed = parts.map((p) => placeByRule(p, mention) ?? (ownKeys.has(actorKey(p)) ? { to: 'new' as const, key: newKey(p) } : null));
      if (placed.every(Boolean)) {
        for (const [i, target] of placed.entries()) {
          if (target!.to === 'new' && !proposals.has(target!.key)) {
            // Its own mention will propose it with full detail; this keeps the
            // name until then.
            proposals.set(target!.key, { key: target!.key, name: clip(parts[i], 300), kind: inferKind(String(mention.data.entityType ?? ''), parts[i]), entityType: String(mention.data.entityType ?? 'concept'), partOf: null, kindOf: null, bodyId: null, whatItIs: null, notActorReason: null });
          }
          resolutions.push({ mentionId: mention.id, target: target!, notActor: null, runBy: null, capacity, basis: 'rule' });
        }
        continue;
      }
    }
    const key = actorKey(mention.label);
    const held = pending.get(key) ?? { mentions: [] };
    held.mentions.push(mention);
    if (kind.is === 'unsure') held.hint ??= kind.hint;
    if (parts && !held.parts) { held.parts = parts; held.hint ??= 'composite'; }
    pending.set(key, held);
  }

  const items: MatchItem[] = [...pending.values()].map((group, i) => {
    const first = group.mentions[0];
    return {
      item: `u${i + 1}`,
      mentions: group.mentions.map((m) => m.id),
      said: clip(first.label, 200),
      type: String(first.data.entityType ?? ''),
      context: clip(group.mentions.map((m) => m.statement).sort((a, b) => b.length - a.length)[0], 220),
      ...(group.hint ? { hint: group.hint } : {}),
      ...(group.parts ? { parts: group.parts } : {}),
    };
  });
  return { resolutions, proposals, items, people };
}

// ---------------------------------------------------------------------------
// The tree the model is shown
// ---------------------------------------------------------------------------

/** How many register lines a call carries at most. A few thousand tokens. */
export const TREE_LIMIT = 800;

/**
 * THE MASTER LIST AS ONE LINE PER ACTOR, short ids, sorted by name.
 *
 * BYTE-IDENTICAL for every call of a stage — it is built once, before any call,
 * from the register and the actors this paper's rules have just proposed — so
 * the second and later calls read it from the prompt cache. `r…` is an actor
 * already on the list; `n…` is one this paper names for the first time.
 */
export function registerTree(entries: RegisterEntry[], proposals: Proposal[]): { text: string; refs: Map<string, Target> } {
  const kept = [...entries]
    .sort((a, b) => Number(b.status === 'confirmed') - Number(a.status === 'confirmed') || a.name.localeCompare(b.name) || a.id.localeCompare(b.id))
    .slice(0, TREE_LIMIT)
    .sort((a, b) => a.name.localeCompare(b.name) || a.id.localeCompare(b.id));
  const refs = new Map<string, Target>();
  const shortOf = new Map<string, string>();
  kept.forEach((e, i) => { const s = `r${i + 1}`; refs.set(s, { to: 'existing', id: e.id }); shortOf.set(e.id, s); });
  const fresh = [...proposals].sort((a, b) => a.name.localeCompare(b.name) || a.key.localeCompare(b.key));
  fresh.forEach((p, i) => { const s = `n${i + 1}`; refs.set(s, { to: 'new', key: p.key }); shortOf.set(p.key, s); });
  const line = (id: string, name: string, kind: string, partOf: string | null, kindOf: string | null, aliases: string[], reason: string | null) => [
    `${id} ${clip(name, 120)} [${kind === 'not_an_actor' ? `not an actor: ${reason ?? 'other'}` : kind.replaceAll('_', ' ')}]`,
    partOf && shortOf.has(partOf) ? `part of ${shortOf.get(partOf)}` : '',
    kindOf && shortOf.has(kindOf) ? `kind of ${shortOf.get(kindOf)}` : '',
    aliases.length ? `also "${aliases.slice(0, 3).map((a) => clip(a, 60)).join('", "')}"` : '',
  ].filter(Boolean).join('; ');
  const lines = [
    ...kept.map((e) => line(shortOf.get(e.id)!, e.name, e.kind, e.partOf, e.kindOf, e.aliases, e.notActorReason)),
    ...fresh.map((p) => line(shortOf.get(p.key)!, p.name, p.kind, p.partOf?.to === 'existing' ? p.partOf.id : p.partOf?.key ?? null, p.kindOf?.to === 'existing' ? p.kindOf.id : p.kindOf?.key ?? null, [], p.notActorReason)),
  ];
  return { text: lines.join('\n'), refs };
}

// ---------------------------------------------------------------------------
// The model's answers
// ---------------------------------------------------------------------------

/**
 * STEP 2's answers, as resolutions. Every `actor_match` is checked against the
 * items it was asked: a mention it was not asked about is ignored, an unknown
 * register id becomes a new actor under the answer's own label, and a named
 * person is dropped whatever else the answer says.
 */
export function fromModel(answers: Artefact[], items: MatchItem[], refs: Map<string, Target>, view: RegisterView, proposals: Map<string, Proposal>, mentions: Map<string, Artefact>): { resolutions: Resolution[]; people: number } {
  const index = entryIndex(view);
  const asked = new Set(items.flatMap((i) => i.mentions));
  const resolutions: Resolution[] = [];
  let people = 0;
  // Labels of the new actors this reply proposes, so partOf / kindOf may name
  // one by its label.
  const replyKeys = new Map(answers.filter((a) => a.data.answer === 'new').map((a) => [actorKey(a.label), newKey(a.label)]));
  const resolveRef = (value: unknown): Target | null => {
    const v = clip(value, 300);
    if (!v) return null;
    if (refs.has(v)) return refs.get(v)!;
    const k = actorKey(v);
    if (replyKeys.has(k)) return { to: 'new', key: replyKeys.get(k)! };
    const hit = matchName(v, index);
    if (hit) return { to: 'existing', id: hit.entry.id };
    if (proposals.has(newKey(v))) return { to: 'new', key: newKey(v) };
    return null;
  };
  for (const answer of answers) {
    if (answer.kind !== 'actor_match') continue;
    const data = answer.data;
    const ids = strings(data.mentions).filter((id) => asked.has(id));
    if (!ids.length) continue;
    const given = new Map((Array.isArray(data.capacities) ? data.capacities as { mentionId?: unknown; capacity?: unknown }[] : [])
      .filter((c) => (CAPACITIES as readonly string[]).includes(String(c.capacity)))
      .map((c) => [String(c.mentionId), String(c.capacity) as Capacity]));
    const capacity = (id: string) => given.get(id) ?? capacityOf(`${mentions.get(id)?.statement ?? ''} ${mentions.get(id)?.label ?? ''}`);
    const reason = (NOT_ACTOR_REASONS as readonly string[]).includes(String(data.notActor)) ? String(data.notActor) as NotActorReason : null;
    if (data.answer === 'not_actor' || reason === 'named_person') {
      if (reason === 'named_person') {
        people += ids.length;
        for (const id of ids) resolutions.push({ mentionId: id, target: null, notActor: 'named_person', runBy: null, capacity: capacity(id), basis: 'model' });
        continue;
      }
      const name = clip(answer.label, 300) || clip(mentions.get(ids[0])?.label, 300);
      const existing = matchName(name, index);
      const target: Target = existing ? { to: 'existing', id: existing.entry.id } : { to: 'new', key: newKey(name) };
      if (target.to === 'new' && !proposals.has(target.key)) {
        proposals.set(target.key, { key: target.key, name, kind: 'not_an_actor', entityType: String(mentions.get(ids[0])?.data.entityType ?? 'concept'), partOf: null, kindOf: null, bodyId: null, whatItIs: clip(data.whatItIs, 400) || null, notActorReason: reason ?? 'other' });
      }
      const runBy = resolveRef(data.runBy);
      if (target.to === 'new' && runBy && !proposals.get(target.key)!.partOf) proposals.get(target.key)!.partOf = runBy;
      for (const id of ids) resolutions.push({ mentionId: id, target, notActor: reason ?? 'other', runBy, capacity: capacity(id), basis: 'model' });
      continue;
    }
    let target: Target | null = data.answer === 'existing' ? resolveRef(data.matchId) : null;
    if (!target) {
      const name = clip(answer.label, 300) || clip(mentions.get(ids[0])?.label, 300);
      // "New" for a name the register already holds is the register's answer.
      const existing = matchName(name, index);
      if (existing) target = { to: 'existing', id: existing.entry.id };
      else {
        const key = newKey(name);
        target = { to: 'new', key };
        const type = String(mentions.get(ids[0])?.data.entityType ?? 'concept');
        const kind = (ACTOR_KINDS as readonly string[]).includes(String(data.kind)) ? String(data.kind) as ActorKind : inferKind(type, name);
        const held = proposals.get(key);
        if (!held) proposals.set(key, { key, name, kind, entityType: type, partOf: null, kindOf: null, bodyId: null, whatItIs: clip(data.whatItIs, 400) || null, notActorReason: null });
        else if (!held.whatItIs && clip(data.whatItIs, 400)) held.whatItIs = clip(data.whatItIs, 400);
      }
    }
    if (target.to === 'new') {
      const held = proposals.get(target.key);
      if (held) {
        held.partOf ??= resolveRef(data.partOf);
        held.kindOf ??= resolveRef(data.kindOf);
        if (!held.whatItIs && clip(data.whatItIs, 400)) held.whatItIs = clip(data.whatItIs, 400);
      }
    }
    for (const id of ids) resolutions.push({ mentionId: id, target, notActor: null, runBy: null, capacity: capacity(id), basis: 'model' });
  }
  return { resolutions, people };
}

/**
 * A mention nothing answered for keeps its own name as a proposed actor, or —
 * where the rules thought it a programme — is recorded as not an actor. The
 * stage never drops an entity silently, and never fails for want of an answer.
 */
export function fallbackFor(items: MatchItem[], answered: Set<string>, mentions: Map<string, Artefact>, proposals: Map<string, Proposal>): Resolution[] {
  const out: Resolution[] = [];
  for (const item of items) {
    const missing = item.mentions.filter((id) => !answered.has(id));
    if (!missing.length) continue;
    const key = newKey(item.said);
    const programme = item.hint === 'programme';
    if (!proposals.has(key)) {
      proposals.set(key, {
        key, name: item.said, kind: programme ? 'not_an_actor' : inferKind(item.type, item.said), entityType: item.type || 'concept',
        partOf: null, kindOf: null, bodyId: null, whatItIs: null, notActorReason: programme ? 'programme' : null,
      });
    }
    for (const id of missing) {
      const m = mentions.get(id);
      out.push({ mentionId: id, target: { to: 'new', key }, notActor: programme ? 'programme' : null, runBy: null, capacity: capacityOf(`${m?.statement ?? ''} ${m?.label ?? ''}`), basis: 'fallback' });
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// Hierarchy
// ---------------------------------------------------------------------------

/**
 * WOULD THIS PARENT MAKE A CYCLE? Walk up from the proposed parent; reaching
 * the child is a loop. Used for both hierarchies, for a reader's re-parent and
 * for a run's proposals alike. A walk longer than the list is a loop already
 * there, and is refused too.
 */
export function wouldCycle(child: string, parent: string | null, parentOf: (id: string) => string | null, limit = 10_000): boolean {
  if (!parent) return false;
  let at: string | null = parent;
  for (let steps = 0; at; steps++) {
    if (at === child || steps > limit) return true;
    at = parentOf(at);
  }
  return false;
}

/** The breadcrumb above an actor, nearest first: "Department for Education › Government". */
export function ancestry(id: string, parentOf: (id: string) => string | null, nameOf: (id: string) => string | null, max = 6): string[] {
  const out: string[] = [];
  const seen = new Set([id]);
  let at = parentOf(id);
  while (at && !seen.has(at) && out.length < max) {
    seen.add(at);
    const name = nameOf(at);
    if (name) out.push(name);
    at = parentOf(at);
  }
  return out;
}

// ---------------------------------------------------------------------------
// Step 3: one actor per master actor
// ---------------------------------------------------------------------------

/** What the worker writes at commit, for an unsealed run. Never persisted as an artefact. */
export type RegisterPlan = {
  proposals: Proposal[];
  mentions: { mentionId: string; wording: string; target: Target; actorId: string | null; capacity: Capacity; basis: string }[];
  aliases: { id: string; names: string[] }[];
};

export type Assembled = { actors: Artefact[]; plan: RegisterPlan; notes: string[] };

const targetId = (t: Target) => (t.to === 'existing' ? `e:${t.id}` : t.key);

/**
 * THE RECONCILIATION. Every resolution, deterministic or the model's, folded
 * into ONE stage-2 actor per master actor. Ids are the server's own
 * (`s2_reg_000`…), numbered in the order the paper first names each actor, so
 * a replay of the same answers mints the same ids.
 */
export function assemble(mentions: Artefact[], resolutions: Resolution[], proposals: Map<string, Proposal>, view: RegisterView): Assembled {
  const index = entryIndex(view);
  const order = new Map(mentions.map((m, i) => [m.id, i]));
  const byMention = new Map(mentions.map((m) => [m.id, m]));
  const notes: string[] = [];

  // A proposal whose name the register already holds is that entry.
  const remap = new Map<string, Target>();
  for (const p of proposals.values()) {
    const hit = matchName(p.name, index) ?? (p.bodyId ? { entry: index.byBody.get(p.bodyId)?.[0] } : null);
    if (hit?.entry) remap.set(p.key, { to: 'existing', id: hit.entry.id });
  }
  const settle = (t: Target | null): Target | null => (t && t.to === 'new' && remap.has(t.key) ? remap.get(t.key)! : t);

  type Group = { target: Target; mentions: Artefact[]; capacities: Map<string, Capacity>; first: number; programmes: string[] };
  const groups = new Map<string, Group>();
  const programmes: { name: string; runBy: Target | null; reason: NotActorReason }[] = [];
  const plan: RegisterPlan = { proposals: [], mentions: [], aliases: [] };
  const seenPair = new Set<string>();
  for (const r of resolutions) {
    const mention = byMention.get(r.mentionId);
    if (!mention || !r.target) continue;
    const target = settle(r.target)!;
    const pair = `${r.mentionId}|${targetId(target)}`;
    if (seenPair.has(pair)) continue;
    seenPair.add(pair);
    const entry = target.to === 'existing' ? index.byId.get(target.id) : null;
    const proposal = target.to === 'new' ? proposals.get(target.key) : null;
    const notActor = r.notActor ?? (entry?.kind === 'not_an_actor' ? (entry.notActorReason as NotActorReason) ?? 'other' : null) ?? (proposal?.kind === 'not_an_actor' ? proposal.notActorReason ?? 'other' : null);
    plan.mentions.push({ mentionId: r.mentionId, wording: clip(mention.label, 300), target, actorId: null, capacity: r.capacity, basis: r.basis });
    if (notActor) {
      programmes.push({ name: entry?.name ?? proposal?.name ?? mention.label, runBy: settle(r.runBy ?? (entry?.partOf ? { to: 'existing', id: entry.partOf } : proposal?.partOf ?? null)), reason: notActor });
      continue;
    }
    const key = targetId(target);
    const group: Group = groups.get(key) ?? { target, mentions: [], capacities: new Map(), first: order.get(r.mentionId) ?? 0, programmes: [] };
    if (!group.mentions.includes(mention)) group.mentions.push(mention);
    group.capacities.set(mention.id, r.capacity);
    group.first = Math.min(group.first, order.get(r.mentionId) ?? 0);
    groups.set(key, group);
  }

  // Programmes join the actor that runs them, where that actor is in this paper.
  const unattached: string[] = [];
  for (const p of programmes) {
    if (p.reason !== 'programme') continue;
    const runner = p.runBy ? groups.get(targetId(p.runBy)) : undefined;
    if (runner) { if (!runner.programmes.includes(p.name)) runner.programmes.push(p.name); }
    else if (!unattached.includes(p.name)) unattached.push(p.name);
  }

  const ordered = [...groups.values()].sort((a, b) => a.first - b.first);
  const idOf = new Map<string, string>();
  ordered.forEach((g, i) => idOf.set(targetId(g.target), `s2_reg_${String(i).padStart(3, '0')}`));

  // THE HIERARCHY of what this paper proposes, with every loop broken. The
  // register's own parents count, so a new actor cannot close a loop through
  // an old one either.
  const parentField = (field: 'partOf' | 'kindOf') => (key: string): string | null => {
    if (key.startsWith('e:')) {
      const parent = index.byId.get(key.slice(2))?.[field];
      return parent ? `e:${parent}` : null;
    }
    const p = proposals.get(key)?.[field];
    const settled = settle(p ?? null);
    return settled ? targetId(settled) : null;
  };
  for (const field of ['partOf', 'kindOf'] as const) {
    for (const p of proposals.values()) {
      const parent = settle(p[field]);
      if (!parent) continue;
      if (targetId(parent) === p.key || wouldCycle(p.key, targetId(parent), parentField(field))) {
        p[field] = null;
        notes.push(`“${p.name}” was proposed as ${field === 'partOf' ? 'part' : 'a kind'} of something that is itself ${field === 'partOf' ? 'part' : 'a kind'} of it; that link was left out.`);
      } else p[field] = parent;
    }
  }
  const nameOfTarget = (t: Target | null): { id: string | null; key: string; name: string } | null => {
    const s = settle(t);
    if (!s) return null;
    if (s.to === 'existing') { const e = index.byId.get(s.id); return e ? { id: e.id, key: `e:${e.id}`, name: e.name } : null; }
    const p = proposals.get(s.key);
    return p ? { id: null, key: p.key, name: p.name } : null;
  };

  const actors = ordered.map((g) => {
    const id = idOf.get(targetId(g.target))!;
    const entry = g.target.to === 'existing' ? index.byId.get(g.target.id)! : null;
    const proposal = g.target.to === 'new' ? proposals.get(g.target.key)! : null;
    const name = entry?.name ?? proposal!.name;
    const types = g.mentions.map((m) => String(m.data.entityType ?? '')).filter(Boolean);
    const commonest = [...new Set(types)].sort((a, b) => types.filter((t) => t === b).length - types.filter((t) => t === a).length)[0] ?? entry?.entityType ?? 'concept';
    const kind = (entry ? entry.kind : proposal!.kind) as ActorKind;
    const partOf = entry ? nameOfTarget(entry.partOf ? { to: 'existing', id: entry.partOf } : null) : nameOfTarget(proposal!.partOf);
    const kindOf = entry ? nameOfTarget(entry.kindOf ? { to: 'existing', id: entry.kindOf } : null) : nameOfTarget(proposal!.kindOf);
    const wordings = [...new Map(g.mentions.map((m) => [normaliseName(m.label), clip(m.label, 120)])).values()].filter((w) => normaliseName(w) !== normaliseName(name));
    const whatItIs = entry?.whatItIs ?? proposal?.whatItIs ?? null;
    const statement = whatItIs ?? clip([...g.mentions].sort((a, b) => b.statement.length - a.statement.length)[0]?.statement, 600) ?? name;
    const basisOf = resolutions.find((r) => g.mentions.some((m) => m.id === r.mentionId) && r.target && targetId(settle(r.target)!) === targetId(g.target))?.basis ?? 'reconciled';
    for (const row of plan.mentions) if (targetId(row.target) === targetId(g.target)) row.actorId = id;
    if (entry && wordings.length) plan.aliases.push({ id: entry.id, names: wordings });
    const data: Record<string, unknown> = {
      entityType: commonest,
      aliases: wordings.slice(0, 24),
      mentions: g.mentions.map((m) => m.id),
      ambiguity: g.mentions.length > 1 ? `${g.mentions.length} mentions in this paper, matched to one actor on the master list.` : 'One mention in this paper.',
      dates: [],
      parent: partOf?.name ?? null,
      master: {
        id: entry?.id ?? null,
        key: targetId(g.target),
        status: entry ? entry.status : 'new',
        kind: (ACTOR_KINDS as readonly string[]).includes(kind) ? kind : 'organisation',
        partOf, kindOf,
        bodyId: entry?.bodyId ?? proposal?.bodyId ?? null,
        basis: clip(basisOf, 40),
      },
      capacities: g.mentions.map((m) => ({ mentionId: m.id, capacity: g.capacities.get(m.id) ?? 'named_only' })),
      ...(whatItIs ? { whatItIs: clip(whatItIs, 400) } : {}),
      ...(g.programmes.length ? { programmes: g.programmes.slice(0, 40) } : {}),
    };
    return artefact(id, 'actor', clip(name, 300), clip(statement, 2000) || name, data, { refs: g.mentions.map((m) => m.id), origin: 'structural_inference', confidence: null });
  });

  // Every proposal that is still new and still used, in the plan.
  const used = new Set(plan.mentions.map((m) => targetId(m.target)));
  for (const p of proposals.values()) {
    if (remap.has(p.key)) continue;
    const parentUsed = [...proposals.values()].some((q) => used.has(q.key) && [q.partOf, q.kindOf].some((t) => t?.to === 'new' && t.key === p.key));
    if (used.has(p.key) || parentUsed) plan.proposals.push(p);
  }
  // Settle every target the plan carries, so the writer meets no stale key.
  for (const row of plan.mentions) row.target = settle(row.target)!;

  if (unattached.length) notes.push(`${unattached.length} programme${unattached.length === 1 ? '' : 's'} or scheme${unattached.length === 1 ? ' was' : 's were'} named as if ${unattached.length === 1 ? 'it were an actor' : 'they were actors'} and ${unattached.length === 1 ? 'is' : 'are'} kept as context, not profiled: ${unattached.slice(0, 8).join(', ')}${unattached.length > 8 ? `, and ${unattached.length - 8} more` : ''}.`);
  return { actors, plan, notes };
}

/**
 * Whether an actor is a group of people: by its master kind where the register
 * placed it, by stage 1's type otherwise. A group has no strategy to profile in
 * short and no dossier, but a group central to the policy still gets its full
 * profile — on the Best Start run "Parents and families" carried five ways to
 * beat the policy, none of them small.
 */
export function isGroupOfPeople(actor: Pick<Artefact, 'data'>): boolean {
  const master = actor.data.master as { kind?: unknown } | undefined;
  if (master?.kind) return master.kind === 'group_of_people';
  return String(actor.data.entityType ?? '') === 'user_group';
}

/** The master actor id an actor carries, if the register placed it. */
export function masterIdOf(actor: Pick<Artefact, 'data'>): string | null {
  const master = actor.data.master as { id?: unknown } | undefined;
  return typeof master?.id === 'string' && master.id ? master.id : null;
}

/** The part-of breadcrumb an actor carries, for the report's tables. */
export function partOfName(actor: Pick<Artefact, 'data'>): string | null {
  const master = actor.data.master as { partOf?: { name?: unknown } | null } | undefined;
  return typeof master?.partOf?.name === 'string' ? master.partOf.name : null;
}
