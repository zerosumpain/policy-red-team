import type { Artefact } from '$lib/policy-analysis/contracts';

/**
 * TEN GAME-THEORETIC MODELS, AND THE ONE PART OF THEM THAT IS A SHAPE.
 *
 * The assessment builds a `model` artefact per pattern — principal agent,
 * metric gaming, regulatory capture and seven more — each carrying players,
 * strategies, equilibria, rewards, sanctions, information, a decision order and
 * a judgement of how well the pattern fits. Two of the four assured
 * recommendations cite one in their refs, and until now nothing in `client/`
 * rendered any of it: the report reasoned from ten objects it never showed.
 *
 * WHAT IS DRAWABLE IS THE PLAYERS. `equilibria` is three or four prose
 * paragraphs of forty to fifty words with no label and no link to a strategy, so
 * ten cards of it would add about 1,700 words to the move with the least prose.
 * `players` is an array of actor ids, all fifty of which resolve on this run to
 * thirteen distinct bodies, and an incidence grid of thirteen against ten is the
 * one reading none of the prose gives: Government is a player in every model and
 * most bodies are in three or fewer.
 *
 * NOTHING HERE CLASSIFIES PROSE. `applicability` opens "Moderate but
 * indeterminate…", "Weak or indeterminate…", "The pattern is applicable
 * because…" — free text, not an enum — so it is printed verbatim and the only
 * count taken off it is a leading-word test a reader can check for themselves.
 */

export type ModelPattern = {
  id: string;
  /** The raw `data.pattern`: `principal_agent`, `metric_gaming`, … */
  pattern: string;
  /** The model artefact's own name, for the drill. */
  label: string;
  playerIds: string[];
};

export type ModelBody = {
  /** The body's own name, lower-cased — the key, because a body is a name. */
  key: string;
  label: string;
  /**
   * Every candidate record the models cite this body under, most-cited first.
   *
   * A BODY IS A NAME, WHICH IS THE RULE THE REST OF THE REPORT COUNTS BY.
   * Entity resolution keeps candidate records apart rather than merging them,
   * and the models cite them as they found them: on this run "Higher education
   * providers" is cited six times as `s2_001_actor_011` and once as
   * `s2_001_actor_008_candidate_1`. Keyed by id the grid would carry two rows
   * with the same name reading 6 and 1, which is a fact about the resolver
   * presented as a fact about the policy.
   */
  ids: string[];
  /** How many of the patterns name this body as a player. */
  count: number;
};

export type ModelIncidence = {
  patterns: ModelPattern[];
  /** Distinct bodies, most models first. */
  bodies: ModelBody[];
  /** Is this body a player in this pattern? Keyed by `ModelBody.key`. */
  plays: (bodyKey: string, patternId: string) => boolean;
  /** Bodies appearing in no more than this many patterns — the tail the caption names. */
  tail: (atMost: number) => number;
};

export function modelIncidence(models: Artefact[], label: (id: string) => string | null): ModelIncidence {
  const patterns: ModelPattern[] = models.map((model) => ({
    id: model.id,
    pattern: String(model.data.pattern ?? ''),
    label: model.label,
    playerIds: [...new Set(
      Array.isArray(model.data.players)
        ? (model.data.players as unknown[]).filter((p): p is string => typeof p === 'string')
        : [],
    )],
  }));

  const found = new Map<string, { key: string; label: string; ids: Map<string, number>; patterns: Set<string> }>();
  for (const pattern of patterns) {
    for (const id of pattern.playerIds) {
      // A player id that no longer resolves is dropped rather than drawn as a
      // row headed by an identifier: the grid is read across names.
      const name = label(id);
      if (!name) continue;
      const key = name.trim().toLowerCase();
      const body = found.get(key) ?? { key, label: name.trim(), ids: new Map<string, number>(), patterns: new Set<string>() };
      body.ids.set(id, (body.ids.get(id) ?? 0) + 1);
      body.patterns.add(pattern.id);
      found.set(key, body);
    }
  }

  const bodies: ModelBody[] = [...found.values()]
    .map((body) => ({
      key: body.key,
      label: body.label,
      ids: [...body.ids.entries()].sort((a, b) => b[1] - a[1]).map(([id]) => id),
      count: body.patterns.size,
    }))
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));

  const filled = new Set([...found.values()].flatMap((body) => [...body.patterns].map((id) => `${body.key} ${id}`)));
  return {
    patterns,
    bodies,
    plays: (bodyKey, patternId) => filled.has(`${bodyKey} ${patternId}`),
    tail: (atMost) => bodies.filter((b) => b.count <= atMost).length,
  };
}

/**
 * How many patterns the assessment judges weak or indeterminate.
 *
 * A LEADING-WORD TEST, NOT A CLASSIFICATION. `applicability` is prose and the
 * ten open with seven different phrasings; eight of them begin with the word
 * "Weak". Counting the ones that do is a rule a reader can apply to the same
 * text printed underneath, which is the only kind of count this report takes off
 * a sentence.
 */
export function weaklyApplicable(models: Artefact[]): number {
  return models.filter((model) => /^weak/i.test(String(model.data.applicability ?? '').trim())).length;
}

/**
 * THE DECISION ORDER IS PRINTED AS THE MODEL WROTE IT, and that is a decision
 * rather than a shortcut.
 *
 * The proposal this component came from asked for an ordered list: split
 * `decisionOrder`'s first sentence on semicolons into an `<ol>` and render the
 * later sentences as caveats. I measured the ten paragraphs before building it.
 * Semicolon counts are 2, 0, 3, 3, 3, 3, 1, 2, 3, 0 — and their POSITION is what
 * decides the question. Six models put the sequence in the first sentence. One
 * (coordination) opens "The policy implies a sequential dependency but does not
 * define it." and puts its four steps in the second. Two (collective action,
 * coalition formation) write no semicolon anywhere and step through sentences
 * instead. And one (bargaining veto) has its single semicolon in the LAST
 * sentence, where it joins a consequence to a caveat — "Implementation proceeds
 * only where the required actors accept sufficient terms; unresolved bargaining
 * can delay, narrow or fragment delivery" — which is not a sequence at all.
 *
 * So no rule reads all ten without inventing an order on at least two of them,
 * and a numbered list is a claim that the paper stated an order. Most of these
 * paragraphs end by saying the opposite: "The exact sequencing and binding force
 * of each step are unspecified." The paragraph is printed whole, under a heading
 * that says what it is.
 */
export const DECISION_NOTE = 'Printed as the model wrote it. Most of the ten end by recording that the paper does not fix the order.';
