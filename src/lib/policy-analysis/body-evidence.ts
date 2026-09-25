import { artefact, type Artefact } from './contracts';
import { quotesDocument } from './query-guard';

/**
 * WHAT THE PUBLIC RECORD SAYS ABOUT A BODY — phase 19, workstream X.
 *
 * Measured on the live library, 25 September 2026: personas held no external
 * evidence at all, `researchPersona` had never been run, and 46 of 47
 * exploitation plays found no precedent. A body's own track record — the
 * annual report that says what it has to spend, the select committee report
 * on how it did last time, the debate where Parliament criticised it — IS the
 * precedent those plays lacked. Most of it is on free, keyless APIs, and none
 * of it needs a model to fetch.
 *
 * So this is a dated store of public records keyed by GOV.UK register body,
 * reused by every assessment that meets the body. Three rules make it safe to
 * share across assessments, sealed ones included:
 *
 *   - THE QUERY COMES FROM THE REGISTER, NEVER FROM A PAPER. A GOV.UK slug, or
 *     the official name in quotes. `searchTerm` still runs the document guard
 *     over it, for the day somebody widens what a query is built from.
 *   - WHAT COMES BACK IS PUBLIC: a title, a date, a summary the publisher
 *     wrote, and a link. Nothing here was drawn from anybody's document.
 *   - THE QUESTION A RECORD ANSWERS IS SET BY A RULE, on the document's kind and
 *     title (`classify*`). A model deciding what a source "is about" would make
 *     the store depend on a call, and the point is that it does not.
 *
 * Pure: no database, no network. `server/body-sources.ts` talks to the APIs,
 * `server/body-evidence.ts` keeps the table.
 */

export const EVIDENCE_SOURCES = ['govuk', 'committees', 'hansard'] as const;
export type EvidenceSource = (typeof EVIDENCE_SOURCES)[number];

/** What a record can tell a red team about a body. */
export const EVIDENCE_QUESTIONS = ['track_record', 'capacity', 'powers', 'incentives', 'stance'] as const;
export type EvidenceQuestion = (typeof EVIDENCE_QUESTIONS)[number];

/**
 * The plain words for each, for the pages. Short, because they sit in a table
 * column and a heading.
 */
export const QUESTION_WORDS: Record<EvidenceQuestion, { label: string; means: string }> = {
  track_record: { label: 'Track record', means: 'how it has done before, and what others found' },
  capacity: { label: 'Money and staff', means: 'what it has to work with' },
  powers: { label: 'Powers', means: 'what it is allowed or required to do' },
  incentives: { label: 'Its own aims', means: 'its plans, targets and priorities' },
  stance: { label: 'What it has said', means: 'its positions and its answers to others' },
};

export const SOURCE_WORDS: Record<EvidenceSource, string> = {
  govuk: 'GOV.UK',
  committees: 'a Parliament committee',
  hansard: 'Hansard, the record of Parliament',
};

/**
 * How long a check stands before it is asked again.
 *
 * Thirty days: a body publishes a handful of documents a month and a committee
 * reports on it a few times a year, so a month-old answer is rarely wrong about
 * the track record, and asking three free services once a month per body is
 * polite. A reader who wants it now presses "Check again" on the body's page.
 */
export const EVIDENCE_TTL_DAYS = 30;
export const EVIDENCE_TTL_MS = EVIDENCE_TTL_DAYS * 24 * 60 * 60_000;

/** How many records one source may add for one body in one check. */
export const PER_SOURCE = 12;

/**
 * How many records about one body go into a run's prompt.
 *
 * Three, each a title, a date and a clipped summary. They land in stage 4's and
 * stage 10's per-call context for the body they are about, and — as retrieved
 * sources — in later stages' shared context, where they are the first thing
 * shed when a call is tight. Twenty-four fully profiled bodies at three each is
 * the ceiling; a real paper names far fewer register bodies than that.
 */
export const RUN_RECORDS_PER_BODY = 3;
const EXCERPT_CHARACTERS = 300;

export type BodyEvidenceRecord = {
  bodyId: string;
  source: EvidenceSource;
  /** The source's own word for the document: corporate_report, Report, debate. */
  sourceKind: string;
  question: EvidenceQuestion;
  title: string;
  url: string;
  publisher: string | null;
  /** ISO date, or null where the source gave none. */
  publishedAt: string | null;
  retrievedAt: string;
  expiresAt: string;
  excerpt: string | null;
};

const clip = (v: unknown, max: number) => String(v ?? '').replace(/\s+/g, ' ').trim().slice(0, max);
const isoOrNull = (v: unknown) => (typeof v === 'string' && !Number.isNaN(Date.parse(v)) ? new Date(v).toISOString() : null);

// ---------------------------------------------------------------------------
// What each record answers, by rule
// ---------------------------------------------------------------------------

/**
 * Title rules, first match wins, tried before the document's kind.
 *
 * ORDER MATTERS AND IS DELIBERATE. "Annual report and accounts" is about money
 * and staff before it is about performance; "framework document" is about
 * powers whatever kind of document GOV.UK filed it as. Each rule is a phrase a
 * reader would agree with on sight, which is the test for a rule here: if it
 * needs explaining, it is not simple enough to be honest.
 */
const TITLE_RULES: [RegExp, EvidenceQuestion][] = [
  [/\b(framework document|memorandum of understanding|terms of reference|remit|statutory (?:duty|duties|powers|functions)|powers)\b/i, 'powers'],
  [/\b(annual report|accounts|workforce|headcount|staff(?:ing)?|budget|spending|funding|financial|estimates?|capacity|resourc\w*)\b/i, 'capacity'],
  [/\b(business plan|corporate plan|strategy|strategic plan|priorities|objectives|outcome delivery plan|targets?)\b/i, 'incentives'],
  [/\b(evaluation|review|inspection|audit|findings|progress|monitoring|lessons|investigation|performance|work with)\b/i, 'track_record'],
  [/\b(response|consultation outcome|position|statement)\b/i, 'stance'],
];

/** GOV.UK's document kinds, and what each is about when the title says nothing more. */
const GOVUK_KIND: Record<string, EvidenceQuestion> = {
  corporate_report: 'track_record',
  independent_report: 'track_record',
  research: 'track_record',
  statutory_guidance: 'powers',
  impact_assessment: 'capacity',
  policy_paper: 'stance',
  consultation_outcome: 'stance',
};

/** The GOV.UK kinds asked for. Transparency data is left out: it is mostly monthly spend lines, and twelve of them would push out every report. */
export const GOVUK_KINDS = Object.keys(GOVUK_KIND);

const byTitle = (title: string): EvidenceQuestion | null => TITLE_RULES.find(([rule]) => rule.test(title))?.[1] ?? null;

export function classifyGovuk(kind: string, title: string): EvidenceQuestion {
  // Statutory guidance is about powers even when its title names a review.
  if (kind === 'statutory_guidance') return 'powers';
  return byTitle(title) ?? GOVUK_KIND[kind] ?? 'track_record';
}

/**
 * A committee's publications. A RESPONSE is what a body said back — its stance
 * — whether the committee filed it as a "Government Response" or as a special
 * report titled "…: Ofsted response to the Committee's report". Anything else
 * is Parliament's view of the body, which is track record unless the title
 * says it is about money or powers.
 */
export function classifyCommittee(kind: string, title: string): EvidenceQuestion {
  if (/response/i.test(kind) || /\bresponses?\b/i.test(title)) return 'stance';
  return byTitle(title) ?? 'track_record';
}

/** A debate titled with a body's name is Parliament scrutinising it. */
export const classifyDebate = (): EvidenceQuestion => 'track_record';

/**
 * The words sent to a search, from the register's official name only.
 *
 * In quotes, so a committee search for "Skills England" is not a search for
 * skills and for England. Run through the SAME guard the in-run research uses
 * (`quotesDocument`): the name comes from the register, not from the paper, so
 * this should never fire — but a guard that is only applied where it seems
 * necessary is one the next change walks round. A long official name that
 * happens to be six words of the paper costs that source for that body, which
 * is the right way round to be wrong.
 */
export function searchTerm(name: string, corpus: Set<string> = new Set()): string | null {
  const bare = clip(name, 120).replace(/["“”]/g, '');
  if (bare.length < 3) return null;
  if (quotesDocument(bare, corpus)) return null;
  return `"${bare}"`;
}

// ---------------------------------------------------------------------------
// Reading each API's answer
// ---------------------------------------------------------------------------

/**
 * Only links onto the publisher's own public site survive. The APIs return
 * paths and ids, and the URL is built here from a fixed host — so nothing a
 * response says can point a reader, or a later fetch, somewhere else.
 */
const PUBLIC_HOSTS = new Set(['www.gov.uk', 'committees.parliament.uk', 'hansard.parliament.uk', 'publications.parliament.uk']);
export function publicLink(url: string): string | null {
  try {
    const u = new URL(url);
    if (u.protocol !== 'https:' || u.username || u.password || !PUBLIC_HOSTS.has(u.hostname)) return null;
    return u.href;
  } catch { return null; }
}

type Stamp = { bodyId: string; now: Date };
const stamp = ({ now }: Stamp) => ({ retrievedAt: now.toISOString(), expiresAt: new Date(now.getTime() + EVIDENCE_TTL_MS).toISOString() });

/** `GET https://www.gov.uk/api/search.json?filter_organisations=<slug>…` */
export function govukRecords(page: unknown, at: Stamp): BodyEvidenceRecord[] {
  const results = Array.isArray((page as { results?: unknown })?.results) ? (page as { results: unknown[] }).results : [];
  const out: BodyEvidenceRecord[] = [];
  for (const raw of results) {
    const r = (raw ?? {}) as Record<string, unknown>;
    const link = typeof r.link === 'string' && r.link.startsWith('/') && !r.link.startsWith('//') ? publicLink(`https://www.gov.uk${r.link}`) : null;
    const title = clip(r.title, 300);
    if (!link || !title) continue;
    const kind = clip(r.content_store_document_type, 60) || 'publication';
    out.push({
      bodyId: at.bodyId, source: 'govuk', sourceKind: kind, question: classifyGovuk(kind, title), title, url: link,
      publisher: 'GOV.UK', publishedAt: isoOrNull(r.public_timestamp), excerpt: clip(r.description, 600) || null, ...stamp(at),
    });
  }
  return out.slice(0, PER_SOURCE);
}

/** `GET https://committees-api.parliament.uk/api/Publications?SearchTerm=…` */
export function committeeRecords(page: unknown, at: Stamp): BodyEvidenceRecord[] {
  const items = Array.isArray((page as { items?: unknown })?.items) ? (page as { items: unknown[] }).items : [];
  const out: BodyEvidenceRecord[] = [];
  for (const raw of items) {
    const r = (raw ?? {}) as Record<string, unknown>;
    const id = typeof r.id === 'number' && Number.isInteger(r.id) && r.id > 0 ? r.id : null;
    const title = clip(r.description, 300);
    if (!id || !title) continue;
    const type = (r.type ?? {}) as { name?: unknown };
    const committee = (r.committee ?? {}) as { name?: unknown; house?: unknown };
    const kind = clip(type.name, 60) || 'Publication';
    const name = clip(committee.name, 200);
    const house = clip(committee.house, 40);
    out.push({
      bodyId: at.bodyId, source: 'committees', sourceKind: kind, question: classifyCommittee(kind, title), title,
      url: `https://committees.parliament.uk/publications/${id}/`,
      publisher: name ? `${name}${house ? ` (${house === 'Lords' ? 'House of Lords' : house === 'Commons' ? 'House of Commons' : house})` : ''}` : null,
      publishedAt: isoOrNull(r.publicationStartDate), excerpt: null, ...stamp(at),
    });
  }
  return out.slice(0, PER_SOURCE);
}

const GUID = /^[0-9A-F]{8}-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{12}$/i;
const slugOfTitle = (title: string) => title.replace(/[^\p{L}\p{N}]+/gu, '').slice(0, 80) || 'Debate';

/** `GET https://hansard-api.parliament.uk/search/debates.json?queryParameters.searchTerm=…` */
export function hansardRecords(page: unknown, at: Stamp): BodyEvidenceRecord[] {
  const results = Array.isArray((page as { Results?: unknown })?.Results) ? (page as { Results: unknown[] }).Results : [];
  const out: BodyEvidenceRecord[] = [];
  for (const raw of results) {
    const r = (raw ?? {}) as Record<string, unknown>;
    const ext = typeof r.DebateSectionExtId === 'string' && GUID.test(r.DebateSectionExtId) ? r.DebateSectionExtId : null;
    const house = r.House === 'Lords' || r.House === 'Commons' ? r.House : null;
    const date = isoOrNull(r.SittingDate);
    const title = clip(r.Title, 300);
    if (!ext || !house || !date || !title) continue;
    const section = clip(r.DebateSection, 80);
    out.push({
      bodyId: at.bodyId, source: 'hansard', sourceKind: 'debate', question: classifyDebate(), title: `Debate: ${title}`,
      url: `https://hansard.parliament.uk/${house}/${date.slice(0, 10)}/debates/${ext}/${slugOfTitle(title)}`,
      publisher: `House of ${house}${section ? `, ${section}` : ''}`, publishedAt: date, excerpt: null, ...stamp(at),
    });
  }
  return out.slice(0, PER_SOURCE);
}

// ---------------------------------------------------------------------------
// Into a run
// ---------------------------------------------------------------------------

const time = (r: BodyEvidenceRecord) => (r.publishedAt ? Date.parse(r.publishedAt) : -Infinity);

/**
 * The few records a run is shown about one body.
 *
 * One of each kind of question first, newest first, so three records are three
 * different things to know rather than three annual reports; then the newest of
 * what is left. Deterministic, so a resumed stage asks the same question and
 * its cached answer still applies.
 */
export function pickEvidence(records: BodyEvidenceRecord[], n = RUN_RECORDS_PER_BODY): BodyEvidenceRecord[] {
  const sorted = [...records].sort((a, b) => time(b) - time(a) || a.url.localeCompare(b.url));
  const chosen: BodyEvidenceRecord[] = [];
  for (const question of EVIDENCE_QUESTIONS) {
    if (chosen.length >= n) break;
    const first = sorted.find((r) => r.question === question);
    if (first) chosen.push(first);
  }
  for (const r of sorted) {
    if (chosen.length >= n) break;
    if (!chosen.includes(r)) chosen.push(r);
  }
  return chosen.sort((a, b) => time(b) - time(a) || a.url.localeCompare(b.url));
}

const longDate = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' }) : null);

/** Ids of the run's body evidence: `s4_body_<n>`, in stage 4's namespace and in no model call's. */
export const BODY_EVIDENCE_PREFIX = 's4_body_';
export const isBodyEvidence = (a: Pick<Artefact, 'id' | 'kind'>) => a.kind === 'research_source' && a.id.startsWith(BODY_EVIDENCE_PREFIX);

/**
 * Stored records as the run's own retrieved sources, about one actor.
 *
 * A RETRIEVED SOURCE AND NOT A PRIOR, which is the whole difference from a
 * persona. A dossier is other papers' readings of a body — context, never
 * evidence. A committee report dated March 2024 is a public document with a
 * date and a publisher: it IS evidence, with `external_evidence` as its origin,
 * and the provenance rules treat it exactly as they treat a Tavily result.
 *
 * `questionId` names the ACTOR, because the question this source answers is
 * "what is this body's record?" and the actor is the thing asked about. It has
 * to resolve (the validator checks every `*Id` scalar), and it does. The
 * source's publication date is in `freshness` in words and in `publishedAt` as
 * a date — the field in-run research could only ever fill with "not verified".
 */
export function evidenceArtefacts(start: number, actorId: string, bodyName: string, records: BodyEvidenceRecord[]): Artefact[] {
  return records.map((r, i) => {
    const published = longDate(r.publishedAt);
    const statement = [
      `${r.title}.`,
      r.excerpt ? clip(r.excerpt, EXCERPT_CHARACTERS) : null,
      `${published ? `Published ${published}` : 'No publication date given'}${r.publisher ? ` by ${r.publisher}` : ''}.`,
      `A public record about ${bodyName} from ${SOURCE_WORDS[r.source]}, not about this paper.`,
    ].filter(Boolean).join(' ');
    return artefact(`${BODY_EVIDENCE_PREFIX}${start + i}`, 'research_source', clip(r.title, 300), statement, {
      questionId: actorId,
      retrievedAt: r.retrievedAt,
      quality: r.source === 'govuk' ? 'government' : 'parliament',
      qualityBasis: r.source === 'govuk' ? 'Published on GOV.UK by or about a public body on its register.' : 'An official record of the UK Parliament.',
      freshness: published ? `Published ${published}; retrieved ${longDate(r.retrievedAt)}.` : `Publication date not given by the source; retrieved ${longDate(r.retrievedAt)}.`,
      jurisdictionalRelevance: `About ${bodyName}, a body on the GOV.UK register. Whether it bears on this policy is a judgement, not a given.`,
      retrieval: 'search_excerpt',
      gap: 'Only the title and the publisher’s summary were read, not the document itself.',
      bodyId: r.bodyId,
      question: r.question,
      publishedAt: r.publishedAt,
      publisher: r.publisher,
    }, { origin: 'external_evidence', confidence: null, refs: [actorId], url: r.url });
  });
}
