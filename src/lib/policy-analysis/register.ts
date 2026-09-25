import { looksLikeAcronym } from '$lib/jkai/intel/resolve/match';

/**
 * THE REGISTER OF PUBLIC BODIES — who a paper's "DfE" actually is.
 *
 * Measured on the live library, 25 September 2026: the Department for Education
 * appears in both real papers and was never linked. In one it was split twelve
 * ways; in the other it resolved cleanly, aliases and all, and still met no
 * earlier persona, because the identity policy caps an acronym match at 0.84
 * and demands the SAME entity type — "DfE" as an `agency` never meets
 * "Department for Education" as a `department`. A name is weak evidence of
 * identity. An entry in the government's own list of organisations is strong
 * evidence, and it is free.
 *
 * So this is that list, seeded from the GOV.UK organisations API
 * (`https://www.gov.uk/api/organisations`): about 1,265 bodies with their
 * official names, abbreviations, parent departments and whether they have
 * closed and what replaced them. The snapshot is committed at
 * `register/govuk-organisations.json` so a test, a fixture run or an
 * install with no network still has it; `npm run register:refresh` rewrites it.
 *
 * Pure: no database, no network. `server/register.ts` keeps the table,
 * `server/register-fetch.ts` talks to GOV.UK.
 *
 * PUBLIC DATA, and it may leave this install freely. Nothing here was drawn from
 * a paper — which is exactly why it is safe to show beside a dossier that was.
 */

export const REGISTER_SOURCE = 'govuk';
export const GOVUK_ORGANISATIONS_API = 'https://www.gov.uk/api/organisations';
export const GOVUK_LICENCE = 'Open Government Licence v3.0';

/** One organisation as the snapshot keeps it: the fields a reader or the matcher uses, nothing else. */
export type RegisterOrganisation = {
  slug: string;
  title: string;
  abbreviation: string | null;
  format: string | null;
  /** GOV.UK's own word: live, closed, exempt, joining, transitioning. */
  status: string;
  /** Why it closed: changed_name, replaced, merged, split, no_longer_exists, devolved. */
  closedStatus: string | null;
  closedAt: string | null;
  contentId: string | null;
  parents: string[];
  children: string[];
  supersedes: string[];
  supersededBy: string[];
};

export type RegisterSnapshot = {
  source: typeof REGISTER_SOURCE;
  url: string;
  licence: string;
  fetchedAt: string;
  count: number;
  organisations: RegisterOrganisation[];
};

/** A body as the store and the matcher see it. `id` is `govuk:<slug>`, stable across refreshes. */
export type RegisterBody = {
  id: string;
  name: string;
  acronym: string | null;
  format: string | null;
  status: string;
  closedStatus: string | null;
  closedAt: string | null;
  parentIds: string[];
  childIds: string[];
  supersedesIds: string[];
  supersededByIds: string[];
  aliases: string[];
  webUrl: string | null;
};

export const bodyId = (slug: string) => `${REGISTER_SOURCE}:${slug}`;
const webUrl = (slug: string) => `https://www.gov.uk/government/organisations/${slug}`;

/** The slug at the end of an API or web URL, which is how GOV.UK links one organisation to another. */
export const slugOf = (url: string) => url.replace(/\/+$/, '').split('/').at(-1) ?? '';

/**
 * One page of `GET /api/organisations`, reduced to what the snapshot keeps.
 *
 * Defensive on purpose: a field GOV.UK drops or renames must cost that field,
 * not the refresh. A row with no slug or no title is skipped — it cannot be
 * named or linked.
 */
export function organisationsFromPage(page: unknown): { organisations: RegisterOrganisation[]; pages: number | null; total: number | null } {
  const body = (page ?? {}) as { results?: unknown; pages?: unknown; total?: unknown };
  const results = Array.isArray(body.results) ? body.results : [];
  const str = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim() : null);
  const slugs = (v: unknown) => (Array.isArray(v) ? v : [])
    .map((o) => str((o as { id?: unknown })?.id) ?? str((o as { web_url?: unknown })?.web_url))
    .filter((u): u is string => Boolean(u))
    .map(slugOf)
    .filter(Boolean)
    .sort();
  const organisations: RegisterOrganisation[] = [];
  for (const raw of results) {
    const r = (raw ?? {}) as Record<string, unknown>;
    const details = (r.details ?? {}) as Record<string, unknown>;
    const slug = str(details.slug) ?? (str(r.id) ? slugOf(String(r.id)) : null);
    const title = str(r.title);
    if (!slug || !title) continue;
    organisations.push({
      slug, title,
      abbreviation: str(details.abbreviation),
      format: str(r.format),
      status: str(details.govuk_status) ?? 'live',
      closedStatus: str(details.govuk_closed_status),
      closedAt: str(details.closed_at),
      contentId: str(details.content_id),
      parents: slugs(r.parent_organisations),
      children: slugs(r.child_organisations),
      supersedes: slugs(r.superseded_organisations),
      supersededBy: slugs(r.superseding_organisations),
    });
  }
  return {
    organisations,
    pages: typeof body.pages === 'number' ? body.pages : null,
    total: typeof body.total === 'number' ? body.total : null,
  };
}

/**
 * A snapshot, sorted by slug and one organisation per line.
 *
 * Committed to the repository, so a refresh is a diff somebody can read: the
 * body that closed, the one that changed its name. A single-line JSON blob
 * would make every refresh a one-line change to a megabyte.
 */
export function serialiseSnapshot(snapshot: RegisterSnapshot): string {
  const { organisations, ...head } = snapshot;
  const rows = [...organisations].sort((a, b) => a.slug.localeCompare(b.slug)).map((o) => `    ${JSON.stringify(o)}`);
  const top = JSON.stringify({ ...head, count: organisations.length }, null, 2).replace(/\n}$/, '');
  return `${top},\n  "organisations": [\n${rows.join(',\n')}\n  ]\n}\n`;
}

/**
 * The names a body is known by, beyond its title.
 *
 * Only forms that are the SAME name written differently — the official
 * abbreviation, "HM"/"The" dropped, "&" for "and". Nothing guessed: a guessed
 * alias that collides is a wrong link, and a wrong link on this register is
 * worse than none because two personas that share a body are merged on sight.
 */
export function aliasesOf(org: Pick<RegisterOrganisation, 'title' | 'abbreviation'>): string[] {
  const out = new Set<string>();
  if (org.abbreviation && org.abbreviation !== org.title) out.add(org.abbreviation);
  const bare = org.title.replace(/^(the|hm|his majesty['’]s|her majesty['’]s)\s+/i, '');
  if (bare !== org.title) out.add(bare);
  if (org.title.includes('&')) out.add(org.title.replaceAll('&', 'and'));
  return [...out];
}

export function bodyFromOrganisation(org: RegisterOrganisation): RegisterBody {
  return {
    id: bodyId(org.slug),
    name: org.title,
    acronym: org.abbreviation && org.abbreviation !== org.title ? org.abbreviation : null,
    format: org.format,
    status: org.status,
    closedStatus: org.closedStatus,
    closedAt: org.closedAt,
    parentIds: org.parents.map(bodyId),
    childIds: org.children.map(bodyId),
    supersedesIds: org.supersedes.map(bodyId),
    supersededByIds: org.supersededBy.map(bodyId),
    aliases: aliasesOf(org),
    webUrl: webUrl(org.slug),
  };
}

// ---------------------------------------------------------------------------
// Resolution
// ---------------------------------------------------------------------------

/**
 * The comparable form of a body's name.
 *
 * Case, punctuation and a leading "the" say nothing about which body is meant.
 * "Department of X" and "Department for X" are folded together because papers
 * get the preposition wrong far more often than two live departments differ
 * only by it — and if two ever did, `resolveBody` sees two candidates and
 * declines rather than choosing.
 */
export function nameKey(name: string): string {
  return name
    .toLowerCase()
    .replaceAll('&', ' and ')
    .replace(/['‘’ʼ`]s\b/g, 's')
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^the /, '')
    .replace(/^(hm|his majestys|her majestys) /, '')
    .replace(/^(department|ministry) (of|for) /, '$1 ');
}

const acronymKey = (name: string) => name.replace(/[^\p{L}]/gu, '').toLowerCase();

export type RegisterIndex = {
  bodies: Map<string, RegisterBody>;
  byName: Map<string, string[]>;
  byAcronym: Map<string, string[]>;
};

export function buildRegisterIndex(bodies: RegisterBody[]): RegisterIndex {
  const index: RegisterIndex = { bodies: new Map(), byName: new Map(), byAcronym: new Map() };
  const add = (map: Map<string, string[]>, key: string, id: string) => {
    if (!key) return;
    const held = map.get(key) ?? [];
    if (!held.includes(id)) held.push(id);
    map.set(key, held);
  };
  for (const body of bodies) {
    index.bodies.set(body.id, body);
    add(index.byName, nameKey(body.name), body.id);
    for (const alias of body.aliases) add(index.byName, nameKey(alias), body.id);
    if (body.acronym) add(index.byAcronym, acronymKey(body.acronym), body.id);
  }
  return index;
}

const OPEN = new Set(['live', 'exempt', 'joining', 'transitioning']);

/**
 * One body from several that share a name, or none.
 *
 * An open body beats a closed one that once had the same name or letters — the
 * register keeps the Department for Education and Skills, closed in 2007, and a
 * paper written this decade that says "DfE" means the one that is open. Two
 * OPEN bodies sharing a key is a genuine ambiguity and returns nothing.
 */
function decide(ids: string[] | undefined, index: RegisterIndex): RegisterBody | null {
  if (!ids?.length) return null;
  if (ids.length === 1) return index.bodies.get(ids[0]) ?? null;
  const open = ids.map((id) => index.bodies.get(id)).filter((b): b is RegisterBody => Boolean(b && OPEN.has(b.status)));
  return open.length === 1 ? open[0] : null;
}

/** "Department for Education (DfE)" is two names, and either may be the one the register knows. */
function forms(name: string): string[] {
  const out = [name];
  const inner = /^(.*?)\s*\(([^)]{2,40})\)\s*$/.exec(name);
  if (inner) out.push(inner[1], inner[2]);
  return out.map((n) => n.trim()).filter(Boolean);
}

/**
 * Which register body an actor is, from its label and aliases.
 *
 * Exact title, official abbreviation, or one of `aliasesOf` — after `nameKey`
 * has taken out case, punctuation, "the", "HM" and the of/for slip. An
 * abbreviation is only tried for a string SHAPED like one (`looksLikeAcronym`),
 * so "Education" never reaches the acronym table.
 *
 * ENTITY TYPE IS NOT CONSULTED, deliberately. The review found the same
 * department typed `department`, `agency` and `government` in different
 * papers, and a type the model chose is exactly the weak evidence the register
 * exists to overrule. The only types kept out are the ones that cannot be an
 * organisation at all — see `REGISTER_EXCLUDED_TYPES`.
 *
 * Every name must agree. A label that says one body and an alias that says
 * another is a conflict, and a conflict links nothing.
 */
export const REGISTER_EXCLUDED_TYPES = new Set(['person', 'user_group', 'geography']);

export function resolveBody(
  actor: { label: string; aliases?: string[]; entityType?: string },
  index: RegisterIndex,
): { body: RegisterBody; basis: string } | null {
  if (REGISTER_EXCLUDED_TYPES.has(actor.entityType ?? '')) return null;
  let found: { body: RegisterBody; basis: string } | null = null;
  for (const name of [actor.label, ...(actor.aliases ?? [])]) {
    for (const form of forms(name)) {
      const byName = decide(index.byName.get(nameKey(form)), index);
      const byAcronym = !byName && looksLikeAcronym(form) ? decide(index.byAcronym.get(acronymKey(form)), index) : null;
      const body = byName ?? byAcronym;
      if (!body) continue;
      if (found && found.body.id !== body.id) return null;
      found ??= { body, basis: byName ? `“${form}” is the name of ${body.name} on the GOV.UK register` : `“${form}” is the abbreviation of ${body.name} on the GOV.UK register` };
    }
  }
  return found;
}

/**
 * Bodies whose name contains every word of a query — the search on the page
 * where a reader confirms which body a persona is.
 */
export function searchRegister(query: string, index: RegisterIndex, limit = 20): RegisterBody[] {
  const key = nameKey(query);
  if (!key) return [];
  const words = key.split(' ');
  const acronym = acronymKey(query);
  const scored: { body: RegisterBody; score: number }[] = [];
  for (const body of index.bodies.values()) {
    const names = [body.name, ...body.aliases].map(nameKey);
    let score = 0;
    if (names.includes(key)) score = 100;
    else if (body.acronym && acronymKey(body.acronym) === acronym) score = 90;
    else if (names.some((n) => words.every((w) => n.split(' ').some((t) => t.startsWith(w))))) score = 50;
    if (!score) continue;
    if (OPEN.has(body.status)) score += 5;
    scored.push({ body, score });
  }
  return scored.sort((a, b) => b.score - a.score || a.body.name.localeCompare(b.body.name)).slice(0, limit).map((s) => s.body);
}

// ---------------------------------------------------------------------------
// What a reader is shown
// ---------------------------------------------------------------------------

/**
 * GOV.UK's words for the kinds of body, and a plain gloss where the word alone
 * is jargon. A reader who does not already know what a "non-departmental
 * public body" is should not have to look it up to read the page.
 */
const FORMAT_GLOSS: Record<string, string> = {
  'Ministerial department': 'a government department led by a minister',
  'Non-ministerial department': 'a government department not led by a minister',
  'Executive agency': 'part of a government department that delivers a service',
  'Executive non-departmental public body': 'a public body that works at arm’s length from government',
  'Advisory non-departmental public body': 'a public body that gives ministers independent advice',
  'Tribunal': 'a body that hears appeals and decides disputes',
  'Public corporation': 'a publicly owned company',
  'Independent monitoring body': 'a body that inspects or checks on others',
  'Ad-hoc advisory group': 'a group set up to advise on one question',
  'Sub organisation': 'part of a larger public body',
  'Devolved government': 'the government of Scotland, Wales or Northern Ireland',
  'Court': 'a court',
  'Civil service': 'part of the Civil Service',
};

const CLOSED_BECAUSE: Record<string, string> = {
  changed_name: 'It changed its name.',
  replaced: 'It was replaced.',
  merged: 'It was merged into another body.',
  split: 'It was split into other bodies.',
  no_longer_exists: 'It no longer exists.',
  devolved: 'Its work moved to a devolved government.',
};

export type BodyFacts = {
  id: string;
  name: string;
  acronym: string | null;
  kind: string | null;
  kindMeans: string | null;
  parents: { id: string; name: string }[];
  open: boolean;
  status: string;
  closedBecause: string | null;
  closedOn: string | null;
  replacedBy: { id: string; name: string }[];
  url: string | null;
};

const STATUS_WORDS: Record<string, string> = {
  live: 'Open',
  exempt: 'Open (it keeps its own website rather than a GOV.UK page)',
  joining: 'Open (moving its pages onto GOV.UK)',
  transitioning: 'Open (moving its pages onto GOV.UK)',
  closed: 'Closed',
};

export function bodyFacts(body: RegisterBody, index: RegisterIndex): BodyFacts {
  const named = (ids: string[]) => ids
    .map((id) => index.bodies.get(id))
    .filter((b): b is RegisterBody => Boolean(b))
    .map((b) => ({ id: b.id, name: b.name }));
  return {
    id: body.id,
    name: body.name,
    acronym: body.acronym,
    kind: body.format,
    kindMeans: body.format ? FORMAT_GLOSS[body.format] ?? null : null,
    parents: named(body.parentIds),
    open: OPEN.has(body.status),
    status: STATUS_WORDS[body.status] ?? body.status,
    closedBecause: body.closedStatus ? CLOSED_BECAUSE[body.closedStatus] ?? null : null,
    closedOn: body.closedAt,
    replacedBy: named(body.supersededByIds),
    url: body.webUrl,
  };
}
