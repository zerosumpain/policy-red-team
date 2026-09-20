/**
 * THE EIGHT CONDITIONS THE POLICY HAS TO SURVIVE — the shaping behind Move 3's
 * scenario section.
 *
 * `scenarioBeats()` has sat in the tracked view layer (view.ts:450) under a
 * nine-line doc comment arguing for its own existence, and a grep across
 * client, src, server, tests and packages finds exactly one occurrence of the
 * name: its own definition. Nothing has ever called it. What the reader got
 * instead is one write-up card headed "Scenarios" whose prose names all eight in
 * a single sentence — measured on assessment 36ebca37, that sentence stands in
 * for 8 scenarios, 58 downstream effects and 100 references to the machinery and
 * claims those effects land on.
 *
 * NOTHING HERE RESHAPES A BEAT. `scenarioBeats` is imported and called, not
 * reimplemented — it is the tracked copy of upstream's sequence and a second
 * answer to "what are the beats of a scenario" is exactly the drift this repo
 * avoids by copying the view layer verbatim. What this module adds is the three
 * things a component would otherwise work out in its JSX: the opening sentence
 * a reader chooses from, the artefacts the references resolve to, and the count
 * of what the cap drops.
 *
 * THE CAP IS READ BACK, NOT RESTATED. `scenarioBeats` slices
 * `downstreamEffects` at six. Measured on this run the chains are 7, 7, 7, 8, 8,
 * 7, 7, 7 effects long, so EVERY ONE of the eight overruns and ten of the 58
 * effects never reach the page — not the two the finding predicted. `hidden` is
 * therefore derived by counting the effect beats the function actually returned
 * rather than by writing `6` down a second time: if the tracked cap moves, the
 * sentence under the chain moves with it and cannot go stale.
 */
import type { Artefact } from '$lib/policy-analysis/contracts';
import { of, scenarioBeats, type Beat } from '$lib/policy-analysis/view';

/**
 * One row of the drawn sequence.
 *
 * THE EFFECT BEATS ARE ONE SEGMENT AND NOT SIX, because the tracked function
 * labels them `And then` followed by `Which in turn` for every beat after the
 * first — which on this run means the phrase "Which in turn" is returned five
 * times per scenario and would stand as a bold label forty times in one
 * section. The labels are correct as prose and wrong as headings, so the run is
 * collapsed here into a single beat whose body is the numbered chain. Nothing is
 * dropped and nothing is relabelled: the segment carries the first effect
 * beat's own label and every beat the function returned, in its order.
 */
export type BeatSegment =
  | { kind: 'beat'; key: string; label: string; beat: Beat }
  | { kind: 'effects'; key: string; label: string; beats: Beat[] };

export type ScenarioView = {
  artefact: Artefact;
  /** `data.scenario` — `minimum_compliance` and the like. Titled by the component. */
  key: string;
  /** The first sentence of `changedConditions`: what a reader picks one by. */
  gist: string;
  beats: Beat[];
  /** The same beats as drawn: the consecutive effect run collapsed into one. */
  segments: BeatSegment[];
  /** All eight resolve on this run, but a scenario naming a body that is not in the copy still renders. */
  firstActor: Artefact | null;
  /** Every machinery and claim reference that resolves, in the order the record holds them. */
  outcomes: Artefact[];
  /** What `downstreamEffects` actually holds, before the cap. */
  effects: number;
  /** How many of them the beat chain does not draw. Never negative. */
  hidden: number;
};

export type ScenarioTotals = {
  scenarios: number;
  effects: number;
  /** Effects the cap drops, summed — 10 of 58 on this run. */
  hidden: number;
  /** Distinct artefacts the eight chains land on: 100 references, 44 things. */
  outcomes: number;
};

const strings = (value: unknown): string[] =>
  Array.isArray(value) ? value.filter((v): v is string => typeof v === 'string') : [];

/**
 * The first sentence of a paragraph, for the line a reader chooses a scenario by.
 *
 * The boundary rule is `summarise()`'s, for `summarise()`'s reason: a full stop
 * followed by a space and a capital is the only break worth trusting in policy
 * prose, because abbreviations and decimals are everywhere and neither is
 * followed by a capital. What differs is the floor — `summarise` will not cut
 * before 320 characters because it is summarising a verdict, while these
 * opening sentences measure 76 to 244 characters on the real run and the short
 * ones are the ones worth showing whole.
 */
export function openingSentence(text: string): string {
  const full = String(text ?? '').trim();
  const boundary = full.search(/[.!?]\s+[A-Z“"(]/);
  return boundary < 0 ? full : full.slice(0, boundary + 1).trim();
}

/**
 * The beats as rows, with the consecutive effect run gathered into one.
 *
 * Position is preserved rather than assumed: the run is collapsed where it is
 * found, so a scenario filing no effects at all simply has no effects segment
 * and a future beat order needs nothing changed here.
 */
export function segmentBeats(beats: Beat[]): BeatSegment[] {
  const rows: BeatSegment[] = [];
  for (const beat of beats) {
    if (!beat.key.startsWith('effect-')) {
      rows.push({ kind: 'beat', key: beat.key, label: beat.label, beat });
      continue;
    }
    const last = rows[rows.length - 1];
    if (last?.kind === 'effects') last.beats.push(beat);
    else rows.push({ kind: 'effects', key: beat.key, label: beat.label, beats: [beat] });
  }
  return rows;
}

export function scenarioViews(artefacts: Artefact[]): ScenarioView[] {
  const byId = new Map(artefacts.map((a) => [a.id, a]));
  return of(artefacts, 'scenario').map((artefact) => {
    const data = artefact.data;
    const beats = scenarioBeats(artefact, artefacts);
    const effectBeats = beats.filter((beat) => beat.key.startsWith('effect-'));
    const effects = strings(data.downstreamEffects).length;
    const firstActorId = typeof data.firstActor === 'string' ? data.firstActor : null;
    return {
      artefact,
      key: typeof data.scenario === 'string' ? data.scenario : artefact.label,
      gist: openingSentence(String(data.changedConditions ?? '')),
      beats,
      segments: segmentBeats(beats),
      firstActor: (firstActorId ? byId.get(firstActorId) : null) ?? null,
      outcomes: strings(data.affectedOutcomes)
        .map((id) => byId.get(id))
        .filter((a): a is Artefact => Boolean(a)),
      effects,
      hidden: Math.max(0, effects - effectBeats.length),
    };
  });
}

export function scenarioTotals(views: ScenarioView[]): ScenarioTotals {
  const outcomes = new Set<string>();
  for (const view of views) for (const artefact of view.outcomes) outcomes.add(artefact.id);
  return {
    scenarios: views.length,
    effects: views.reduce((n, view) => n + view.effects, 0),
    hidden: views.reduce((n, view) => n + view.hidden, 0),
    outcomes: outcomes.size,
  };
}
