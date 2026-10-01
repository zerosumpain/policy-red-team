import type { Artefact } from './contracts';

/**
 * A BODY THE RED TEAM CHECKED AND FOUND NO MATERIAL WAY TO BEAT THE POLICY.
 *
 * The playbook (stage 10) runs once per body, and until phase 22 a body with no
 * room was told to "say so in one play with low factors". So it did: on the
 * real Best Start run (`44dd5420`) eight of the 46 rows are clearances, not
 * plays — "No material exploit available to children and babies", "Limited
 * room for Jobcentre Plus exploitation", "Low room for families to defeat
 * delivery" — and every one of them was counted in the total, the bands, the
 * pattern grid, the legality figure and the actor board as a way to beat it.
 * Seven of them are "compliant", so each inflated the report's sharpest claim
 * too: how many ways in stay inside the rules.
 *
 * A NEW ROW SAYS SO ITSELF: `data.cleared === true`, which prompt 10 now asks
 * for and `validation.ts` stamps when a row is written in these words without
 * it. AN OLDER ROW IS RECOGNISED BY ITS WORDING, and the pattern is
 * deliberately tight — a clearance is announced in the label's first words or
 * the play's first sentence, and the test file holds all 46 real labels and
 * proves the 8 match and the 38 do not. Loosening it to "low factors" would be
 * wrong: a play with a low score is still a play, and the band already says it
 * is a weak one.
 */
const CLEARED_LABEL = /^(?:no (?:material|executable|stronger|direct|credible|real)\b|(?:limited|low|little|no) room\b)/i;
const CLEARED_PLAY = /^(?:no executable play|no material (?:exploit|play|way)|no stronger play|no credible play)\b/i;

/** Is this row a clearance rather than a way to beat the policy? */
export function isCleared(artefact: Artefact): boolean {
  if (artefact.kind !== 'exploit') return false;
  if (artefact.data?.cleared === true) return true;
  if (artefact.data?.cleared === false) return false;
  return clearedByWording(artefact.label, artefact.data?.play);
}

/** The wording test on its own — what `validation.ts` stamps from and the tests pin. */
export function clearedByWording(label: unknown, play?: unknown): boolean {
  return CLEARED_LABEL.test(String(label ?? '').trim()) || CLEARED_PLAY.test(String(play ?? '').trim());
}

/** A way to beat the policy: an exploitation row that is not a clearance. */
export function isPlay(artefact: Artefact): boolean {
  return artefact.kind === 'exploit' && !isCleared(artefact);
}

export type ClearedBody = {
  /** The body that was checked, when it resolves. */
  actor: Artefact | null;
  /** Its name, from the body or, failing that, the row. */
  name: string;
  /** The row that cleared it — the item page a reader is sent to. */
  row: Artefact;
  /** Why, in the row's own words. */
  reason: string;
};

/**
 * THE BODIES THAT CAME BACK CLEAR, ONE LINE EACH.
 *
 * A body is cleared only when EVERY row it has is a clearance. Ofsted on the
 * real run has four plays and a fifth row reading "No material exploit beyond
 * weak discretion evidence" — a summing-up of the four, not a clearance of the
 * body — so Ofsted is not listed here, and that fifth row is simply not a play.
 * Bodies with more than one clearance (it happens across a retried unit) keep
 * the first, in id order.
 */
export function clearedBodies(artefacts: Artefact[]): ClearedBody[] {
  const actors = new Map(artefacts.filter((a) => a.kind === 'actor').map((a) => [a.id, a]));
  const byBody = new Map<string, Artefact[]>();
  for (const a of artefacts) {
    if (a.kind !== 'exploit') continue;
    const key = String(a.data?.actorId ?? '');
    byBody.set(key, [...(byBody.get(key) ?? []), a]);
  }
  const out: ClearedBody[] = [];
  for (const [actorId, rows] of byBody) {
    if (!rows.every(isCleared)) continue;
    const row = [...rows].sort((a, b) => a.id.localeCompare(b.id))[0];
    const actor = actors.get(actorId) ?? null;
    out.push({ actor, name: actor?.label ?? row.label, row, reason: String(row.data?.play ?? row.statement ?? '').trim() });
  }
  return out.sort((a, b) => a.name.localeCompare(b.name));
}

/**
 * Clearances written BESIDE real plays: a body's note that it had nothing
 * further. Not a cleared body — `clearedBodies` leaves these out — and not a
 * play either. Id order, so the sentence that names them is stable.
 */
export function clearanceNotes(artefacts: Artefact[]): Artefact[] {
  const playing = new Set(artefacts.filter(isPlay).map((a) => String(a.data?.actorId ?? '')));
  return artefacts.filter((a) => isCleared(a) && playing.has(String(a.data?.actorId ?? ''))).sort((a, b) => a.id.localeCompare(b.id));
}
