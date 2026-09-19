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
  analysisId: string | null;
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
  readings: { value: string; where: string[] }[];
};

export type Dossier = {
  sightings: Sighting[];
  research: ResearchNote[];
  plays: DossierPlay[];
  contested: Contested[];
};

const BANDS = ['severe', 'significant', 'moderate', 'limited'];
const bandRank = (band: string) => {
  const at = BANDS.indexOf(band);
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
      analysisId: o.analysisId,
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
  };
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
 */
export function contested(sightings: Sighting[]): Contested[] {
  const byKey = new Map<string, { label: string; values: Map<string, string[]> }>();

  for (const sighting of sightings) {
    for (const trait of sighting.traits) {
      const value = flat(trait.value);
      if (!value) continue;
      const entry = byKey.get(trait.key) ?? { label: trait.label, values: new Map<string, string[]>() };
      entry.values.set(value, [...(entry.values.get(value) ?? []), sighting.title]);
      byKey.set(trait.key, entry);
    }
  }

  return [...byKey]
    .filter(([, entry]) => entry.values.size > 1)
    .map(([key, entry]) => ({
      key,
      label: entry.label,
      // Most-often-said first: the reading two papers share leads the one only
      // this paper offers.
      readings: [...entry.values]
        .map(([value, where]) => ({ value, where }))
        .sort((a, b) => b.where.length - a.where.length || a.value.localeCompare(b.value)),
    }))
    .sort((a, b) => b.readings.length - a.readings.length || a.label.localeCompare(b.label));
}
