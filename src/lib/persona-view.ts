/**
 * A BODY'S RECORD ACROSS PAPERS.
 *
 * `server/personas.ts` reads the rows; `policy-analysis/personas.ts` decides
 * what a persona IS and which actor is which. Neither decides what a reader
 * opening one should be shown, and that is this.
 *
 * THE POINT OF A LIBRARY IS THE SECOND SIGHTING. A dossier on a body met once is
 * a profile with extra steps — the assessment it came from says the same thing
 * and says it in context. What only a library can answer is what changed: the
 * department that was "accountable for delivery" in one paper and "a delivery
 * partner" in the next, the body whose capacity was assumed sufficient here and
 * questioned there. `contested()` is that, and it is the first thing the page
 * shows for anything seen more than once.
 *
 * A PERSONA IS CONTEXT, NEVER EVIDENCE — the rule `personas.ts` is built on, and
 * the reason nothing here is allowed to read like a finding. It was drawn from
 * other papers about other policies; importing its conclusions into the
 * assessment in front of you is the opposite of a red team.
 */
import type { PersonaObservation, PersonaTrait } from '$lib/policy-analysis/personas';
import { travelsOf } from '$lib/policy-analysis/travels';

/** One play, and which paper found it. */
export type DossierPlay = {
  label: string;
  band: string;
  exposure: number;
  legality: string;
  /** The assessment that found it, for a reader asking "where did that come from". */
  from: string;
  analysisId: string | null;
};

/** What one assessment contributed. */
export type Sighting = {
  /** The observation's own id. A paper can produce more than one, so nothing else is a stable key. */
  id: string;
  analysisId: string | null;
  /** Which PAPER this was: the document's hash where known, so two runs of one document are one paper. */
  paper: string;
  title: string;
  observedAt: string | null;
  traits: PersonaTrait[];
  plays: DossierPlay[];
  note: string | null;
};

/** What a reader-commissioned enrichment contributed. */
export type ResearchNote = {
  id: string;
  observedAt: string | null;
  note: string | null;
  traits: PersonaTrait[];
  sources: { url: string; title: string; quality: string }[];
};

/** One trait the papers do not agree about. */
export type Contested = {
  key: string;
  label: string;
  /** Distinct values, each with every place it was said. */
  readings: {
    value: string;
    /** How it was arrived at — a document's own words, or a model's inference. */
    origin: string;
    /** The papers that said it, each named once however many observations they produced. */
    where: string[];
  }[];
};

/** A trait two or more papers recorded and agreed about. */
export type Agreed = { key: string; label: string; value: string; where: string[] };

export type Dossier = {
  sightings: Sighting[];
  research: ResearchNote[];
  plays: DossierPlay[];
  contested: Contested[];
  /**
   * Traits two or more PAPERS recorded and agreed about.
   *
   * Separate from "contested is empty", which is not the same claim and was
   * being made as if it were: two papers recording DISJOINT trait keys, or no
   * traits at all, produce an empty `contested` and no agreement whatsoever.
   * Telling a reader the papers agree on that basis is the page reading like a
   * finding when there is nothing to find.
   */
  agreed: Agreed[];
};

const BANDS = ['severe', 'significant', 'moderate', 'limited'];
/**
 * CASE-FOLDED. `playsFor` stores whatever the model wrote, so a `"Severe"` was
 * ranked as an unknown word and sank to the bottom of a table captioned "worst
 * first" — a silent demotion of the worst thing on the page.
 */
const bandRank = (band: string) => {
  const at = BANDS.indexOf(band.trim().toLowerCase());
  return at === -1 ? BANDS.length : at;
};

/**
 * Most recent first, and anything undated last.
 *
 * A null `observedAt` is a row written before the column was populated rather
 * than a row from the beginning of time, so it sorts to the end rather than
 * leading the page.
 */
const byNewest = (a: { observedAt: string | null }, b: { observedAt: string | null }) => {
  if (a.observedAt === b.observedAt) return 0;
  if (!a.observedAt) return 1;
  if (!b.observedAt) return -1;
  return a.observedAt < b.observedAt ? 1 : -1;
};

const flat = (value: string) => value.replace(/\s+/g, ' ').trim();

export function dossier(observations: PersonaObservation[]): Dossier {
  const seen = observations.filter((o) => o.kind !== 'research');
  const research = observations.filter((o) => o.kind === 'research');

  const sightings: Sighting[] = seen
    .map((o) => ({
      id: o.id,
      analysisId: o.analysisId,
      paper: o.documentSha ? `sha:${o.documentSha}` : o.analysisId ? `analysis:${o.analysisId}` : `title:${o.analysisTitle ?? ''}`,
      title: o.analysisTitle ?? 'An assessment no longer in this install',
      observedAt: o.observedAt,
      traits: o.traits,
      note: o.note,
      plays: o.plays.map((p) => ({ ...p, from: o.analysisTitle ?? 'an earlier assessment', analysisId: o.analysisId })),
    }))
    .sort(byNewest);

  return {
    sightings,
    research: research
      .map((o) => ({ id: o.id, observedAt: o.observedAt, note: o.note, traits: o.traits, sources: o.sources }))
      .sort(byNewest),
    // Worst first across every paper, because a body's exposure is not a
    // per-assessment fact to a reader deciding whether to worry about it.
    plays: sightings.flatMap((s) => s.plays).sort((a, b) => bandRank(a.band) - bandRank(b.band) || b.exposure - a.exposure),
    contested: contested(sightings),
    agreed: agreed(sightings),
  };
}

/**
 * One row per PAPER, not per observation.
 *
 * `applyPersonaLinks` de-duplicates on `(personaId, analysisId, actorId)`, and
 * the actor is deliberately in that key — so two actors in one assessment that
 * both resolve to the same body produce two observation rows for one paper.
 * Counting those as two papers inflated every figure on the page and let one
 * paper's internal inconsistency outrank a reading two real papers shared.
 */
function papers(sightings: Sighting[]): { title: string; traits: PersonaTrait[] }[] {
  const grouped = new Map<string, { title: string; traits: PersonaTrait[] }>();
  // BY DOCUMENT since phase 19: two runs of one paper agreeing with each other
  // is one paper saying the same thing twice, which is not agreement.
  for (const sighting of sightings) {
    const key = sighting.paper;
    const found = grouped.get(key);
    if (found) found.traits.push(...sighting.traits);
    else grouped.set(key, { title: sighting.title, traits: [...sighting.traits] });
  }
  return [...grouped.values()];
}

/**
 * The traits the papers do not agree about.
 *
 * COMPARED ON THE WORDING, WHITESPACE-NORMALISED, and nothing cleverer. Two
 * model-written sentences that mean the same thing in different words will read
 * as a disagreement, which is the right way round to be wrong: this is an
 * invitation to look, and a reader who looks and finds they agree has lost ten
 * seconds. The opposite mistake hides the one thing a library is for.
 *
 * A trait said once, or said identically everywhere, is not here — it is in the
 * dossier proper, which is what `foldTraits` already produced.
 *
 * ON THE PART THAT TRAVELS, since phase 19. Two papers about two policies each
 * name their own budget and their own deadline, so compared on the whole
 * wording almost every trait read as a disagreement — "£523 million by 2028"
 * against "£40 million from April 2026" is two papers, not two views of the
 * body. The paper-specific sentences are still in each sighting below; what is
 * compared here is what the library keeps.
 */
type Readings = Map<string, { origin: string; where: Set<string> }>;

function index(sightings: Sighting[]): Map<string, { label: string; values: Readings }> {
  const byKey = new Map<string, { label: string; values: Readings }>();
  for (const paper of papers(sightings)) {
    for (const trait of paper.traits) {
      const value = flat(travelsOf(trait) ?? '');
      if (!value) continue;
      const entry = byKey.get(trait.key) ?? { label: trait.label, values: new Map() as Readings };
      const reading = entry.values.get(value) ?? { origin: trait.origin, where: new Set<string>() };
      // A SET, so a paper that said the same thing twice is named once.
      reading.where.add(paper.title);
      entry.values.set(value, reading);
      byKey.set(trait.key, entry);
    }
  }
  return byKey;
}

export function contested(sightings: Sighting[]): Contested[] {
  return [...index(sightings)]
    .filter(([, entry]) => entry.values.size > 1)
    .map(([key, entry]) => ({
      key,
      label: entry.label,
      // Most-often-said first: the reading two papers share leads the one only
      // this paper offers. The ORIGIN travels with it — "the document said X"
      // and "a model inferred Y" are not two equal readings, and the list that
      // leads this page was presenting them as if they were.
      readings: [...entry.values]
        .map(([value, reading]) => ({ value, origin: reading.origin, where: [...reading.where] }))
        .sort((a, b) => b.where.length - a.where.length || a.value.localeCompare(b.value)),
    }))
    .sort((a, b) => b.readings.length - a.readings.length || a.label.localeCompare(b.label));
}

/**
 * What two or more papers recorded AND agreed about.
 *
 * The positive claim, made only where it is true. "Nothing contested" covers
 * papers that recorded disjoint traits and papers that recorded none, neither
 * of which is agreement.
 */
export function agreed(sightings: Sighting[]): Agreed[] {
  return [...index(sightings)]
    .filter(([, entry]) => entry.values.size === 1 && [...entry.values.values()][0].where.size > 1)
    .map(([key, entry]) => {
      const [value, reading] = [...entry.values][0];
      return { key, label: entry.label, value, where: [...reading.where] };
    })
    .sort((a, b) => b.where.length - a.where.length || a.label.localeCompare(b.label));
}
