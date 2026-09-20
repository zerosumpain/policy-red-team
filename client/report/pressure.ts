import type { Artefact } from '$lib/policy-analysis/contracts';
import type { ActorView, Band, Play } from '$lib/policy-analysis/view';

/**
 * THE BODY-AGAINST-TARGET JOIN, UNCAPPED, COMPUTED WHERE IT CAN BE TESTED.
 *
 * `interplay()` in the tracked core answers the same question and answers it for
 * a DRAWING: it ranks the 99 targets, keeps the worst twelve, and then rebuilds
 * its actor list from the links that survived that cut (view.ts:420-434). That is
 * the right arithmetic for a twelve-row table and the wrong arithmetic for a
 * sentence about a body, and Move 4 printed both from the same object. Measured
 * on the live run: `interplay.actors` holds ten bodies where twelve run a play —
 * UK Research and Innovation (5 plays, reach 16) and Independent training
 * providers (3, 12) vanish because every play they run is aimed below the cap —
 * and four of the ten survivors are under-counted, so the Department for
 * Education was 4 plays in one table and 5 in another 1,000px below it.
 *
 * So the cap stays where it belongs, on the drawing, and every figure about a
 * BODY is computed here from every link. `interplay()` is untouched: it is
 * verbatim-tracked, and editing it costs a recorded divergence.
 *
 * THE SAME SORT, DELIBERATELY. Targets rank by pressure, then by incoming plays,
 * then by name — the comparator `interplay()` uses — so the twelve this module
 * ranks first are character-for-character the twelve the drawn table shows. Two
 * derivations of one order that disagree in the tail would be the defect this
 * file exists to fix, one level down.
 */

/** The four bands, worst first — the order a segmented bar is built in. */
const BANDS: Band[] = ['severe', 'significant', 'moderate', 'limited'];

/**
 * Everything the join needs off a play and nothing else.
 *
 * `spread.ts` is the precedent: a plain input type means the test can build the
 * forty-seven plays of a real run by hand, without an `Artefact` fixture for
 * every actor, mechanism and claim they point at.
 */
export type PressurePlay = {
  id: string;
  exposure: number;
  band: Band;
  /** `compliant`, `grey`, or whatever else the assessment wrote. */
  legality: string;
  actor: { id: string; label: string; entityType: string } | null;
  targetIds: string[];
};

export type PressureTarget = {
  id: string;
  label: string;
  /** `mechanism`, `claim`, `assumption` — the kind of thing the play is aimed at. */
  kind: string;
  incoming: number;
  pressure: number;
  /**
   * The pressure split by band, as SUMMED EXPOSURE rather than as a play count.
   *
   * The bar's whole length is a sum of exposure, so a reader reads a segment's
   * width as a contribution to that sum. Sizing the segments by how many plays
   * are in each band would draw six limited plays wider than two severe ones
   * inside a bar whose length says the opposite.
   */
  split: { band: Band; exposure: number }[];
};

export type PressureBody = {
  id: string;
  label: string;
  /** `department`, `agency`, `provider`, `user_group`, `concept` — as written, underscores out. */
  entityType: string;
  plays: number;
  /** How many of the targets under pressure this body is aimed at. */
  reach: number;
  worst: number;
  worstBand: Band;
  /** Plays this body could run that break no rule, and plays in a grey area. */
  compliant: number;
  grey: number;
  /** Anything the assessment classed as neither — zero on every run so far. */
  other: number;
};

export type PressureLink = { actorId: string; targetId: string; playId: string; exposure: number; band: Band };

export type PressureBoard = {
  targets: PressureTarget[];
  bodies: PressureBody[];
  links: PressureLink[];
};

/** What a target id resolves to. Null where the artefact has left the assessment. */
export type TargetLookup = (id: string) => { label: string; kind: string } | null;

/** The view layer's plays, reduced to what the join reads. */
export function pressurePlays(list: Play[]): PressurePlay[] {
  return list.map((play) => ({
    id: play.artefact.id,
    exposure: play.exposure,
    band: play.band,
    legality: String(play.artefact.data.legality ?? ''),
    actor: play.actor
      ? {
        id: play.actor.id,
        label: play.actor.label,
        // The exact expression `traitGrid()` uses at matrix.ts:120, so the cast
        // grid and the body table print one word for one body rather than two.
        entityType: String(play.actor.data.entityType ?? '').replaceAll('_', ' '),
      }
      : null,
    targetIds: Array.isArray(play.artefact.data.targets)
      ? (play.artefact.data.targets as unknown[]).filter((t): t is string => typeof t === 'string')
      : [],
  }));
}

/** A lookup over the artefacts, for the caller that has them. */
export function targetLookup(artefacts: Artefact[]): TargetLookup {
  const byId = new Map(artefacts.map((a) => [a.id, a]));
  return (id) => {
    const found = byId.get(id);
    return found ? { label: found.label, kind: found.kind } : null;
  };
}

export function pressureBoard(plays: PressurePlay[], lookup: TargetLookup): PressureBoard {
  const links: PressureLink[] = [];
  for (const play of plays) {
    if (!play.actor) continue;
    // A play may name the same target twice; a link is a pair, not a mention.
    for (const targetId of new Set(play.targetIds)) {
      links.push({ actorId: play.actor.id, targetId, playId: play.id, exposure: play.exposure, band: play.band });
    }
  }

  const targets = [...new Set(links.map((l) => l.targetId))].map((id) => {
    const mine = links.filter((l) => l.targetId === id);
    const found = lookup(id);
    return {
      id,
      label: found?.label ?? 'A target no longer in the assessment',
      kind: found?.kind ?? 'unknown',
      incoming: mine.length,
      pressure: mine.reduce((n, l) => n + l.exposure, 0),
      split: BANDS
        .map((band) => ({ band, exposure: mine.filter((l) => l.band === band).reduce((n, l) => n + l.exposure, 0) }))
        .filter((entry) => entry.exposure > 0),
    };
  }).sort((a, b) => b.pressure - a.pressure || b.incoming - a.incoming || a.label.localeCompare(b.label));

  const byActor = new Map<string, { id: string; label: string; entityType: string }>();
  for (const play of plays) if (play.actor) byActor.set(play.actor.id, play.actor);

  const bodies = [...byActor.values()].map((actor) => {
    const mine = links.filter((l) => l.actorId === actor.id);
    const own = plays.filter((p) => p.actor?.id === actor.id);
    const worstPlay = own.reduce((worst, p) => (p.exposure > worst.exposure ? p : worst), own[0]);
    return {
      id: actor.id,
      label: actor.label,
      entityType: actor.entityType,
      /*
       * COUNTED OFF THE PLAYS, NOT OFF THE LINKS. A body whose plays name no
       * target at all still runs them, and counting distinct play ids among the
       * links would drop it from its own table — which is the shape of the
       * defect this module exists for, one level in.
       */
      plays: own.length,
      reach: new Set(mine.map((l) => l.targetId)).size,
      worst: worstPlay?.exposure ?? 0,
      worstBand: worstPlay?.band ?? 'limited',
      compliant: own.filter((p) => p.legality === 'compliant').length,
      grey: own.filter((p) => p.legality === 'grey').length,
      other: own.filter((p) => p.legality !== 'compliant' && p.legality !== 'grey').length,
    };
  }).sort((a, b) => b.reach - a.reach || b.worst - a.worst || a.label.localeCompare(b.label));

  return { targets, bodies, links };
}

/**
 * What a set of things is made of, largest group first.
 *
 * Used twice on the panel and for two different compositions — the 99 parts
 * under pressure are 55 mechanisms, 41 claims and 3 assumptions; the 12 bodies
 * are 5 agencies, 4 providers, a department, a user group and one the
 * assessment could only call a concept. Both sentences used to be absent, and a
 * sentence stating a composition is a figure, so it is counted here rather than
 * typed into a component.
 */
export function kindCounts(items: { kind: string }[]): { kind: string; count: number }[] {
  const counts = new Map<string, number>();
  for (const item of items) {
    const kind = item.kind || 'unclassified';
    counts.set(kind, (counts.get(kind) ?? 0) + 1);
  }
  return [...counts.entries()]
    .map(([kind, count]) => ({ kind, count }))
    .sort((a, b) => b.count - a.count || a.kind.localeCompare(b.kind));
}

/** The bodies whose every play breaks no rule — the sentence a legality column is worth adding for. */
export function cleanBodies(bodies: PressureBody[]): PressureBody[] {
  return bodies.filter((body) => body.plays > 0 && body.grey === 0 && body.other === 0);
}

export type Funnel = {
  /** Candidate rows on the board — a body may hold several. */
  rows: number;
  /** Distinct names among them. */
  names: number;
  /** Names positioned to run at least one play. */
  active: number;
  /** Names with a profile and no play, and the rows that stand for them. */
  idle: { label: string; entityType: string }[];
  /** Names the paper names and never profiles. */
  idleUnprofiled: number;
  /** Rows that are a second record of a name already counted. */
  duplicates: number;
};

/**
 * WHO IS IN THE ROOM, AND WHAT FELL AWAY AT EACH STEP.
 *
 * A BOARD ROW IS A CANDIDATE, NOT A BODY. Entity resolution deliberately keeps
 * candidates apart rather than merging them, so on the live run 171 rows stand
 * for 55 names — "Employers" appears 25 times, "Skills England" 23. Every count
 * here is therefore a count of NAMES, and the row figure appears in exactly one
 * place: the sentence about resolution, where it means something.
 *
 * Lifted out of `Report.tsx`, where the same arithmetic ran inline and printed
 * four facts in the smallest grey type on the page. It is here so the tiles that
 * replaced them can be asserted against a run rather than read off a screenshot.
 */
export function funnel(board: ActorView[]): Funnel {
  const nameOf = (view: ActorView) => view.actor.label.trim().toLowerCase();
  const names = new Set(board.map(nameOf));
  const active = board.filter((view) => view.plays.length);
  const activeNames = new Set(active.map(nameOf));
  const profiledNames = new Set(board.filter((view) => view.profile).map(nameOf));

  const idle: { label: string; entityType: string }[] = [];
  const seen = new Set<string>();
  let idleUnprofiled = 0;
  for (const view of board) {
    const key = nameOf(view);
    if (activeNames.has(key) || seen.has(key)) continue;
    seen.add(key);
    if (!profiledNames.has(key)) { idleUnprofiled += 1; continue; }
    idle.push({
      label: view.actor.label,
      entityType: String(view.actor.data.entityType ?? '').replaceAll('_', ' '),
    });
  }

  return {
    rows: board.length,
    names: names.size,
    active: activeNames.size,
    idle: idle.sort((a, b) => a.label.localeCompare(b.label)),
    idleUnprofiled,
    duplicates: board.length - names.size,
  };
}
