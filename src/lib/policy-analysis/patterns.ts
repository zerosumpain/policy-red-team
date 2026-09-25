import type { Artefact } from './contracts';
import { bandOf, byExposure, type Band } from './exposure';

/**
 * PLAYS GROUPED INTO PATTERNS, AND RANKED AGAINST EACH OTHER.
 *
 * Stage 10 runs once per body with the same checklist, so the red team writes
 * the same few plays many times over. Measured on the one completed real run
 * (`36ebca37`, Post-16): about two thirds of 47 plays fell into four
 * archetypes by label — minimal or visible compliance 11, selective take-up or
 * cream-skimming 11, information control 6, relabelling or re-basing 5. And the
 * score did not separate them: 38 of 47 sat between 0.54 and 0.77, and 42 of
 * 47 were severe or significant. A list of 47 plays in exposure order is a
 * list of the same four ideas, each at about the same height.
 *
 * So the unit a reader needs is the PATTERN — one idea, the bodies that could
 * run it and the machinery it is aimed at — and the ranking is RELATIVE: where
 * a pattern or a play stands among the others in this run, not a 0–1 figure
 * that puts everything between a half and three quarters.
 *
 * DETERMINISTIC, from the plays' own words. The archetypes are stage 10's own
 * checklist (instruction 10 in `prompts.ts`) plus the one the real run showed
 * that the checklist does not name, selective take-up. A play is filed under
 * the archetype its label names most strongly, then its play text. No model
 * call, no new stage, nothing re-run: the same plays always fall into the same
 * patterns, a test can pin every rule, and an old assessment gets patterns the
 * moment this ships. A play whose words name no archetype is filed as "other"
 * rather than forced into one.
 */

/**
 * The archetypes, in the order a tie is broken.
 *
 * `cues` are word stems. The LABEL is the model's own name for the play and is
 * weighted three times the play text, because a play labelled "Visible
 * compliance on the reported measure" is a compliance play that happens to
 * mention a measure — not a measure-gaming one. Order breaks the rest: the
 * narrower ideas come before the broad ones ("measure" and "information" turn
 * up in almost every play's prose).
 */
export const PLAY_PATTERNS = [
  { key: 'selective_take_up', label: 'Picking the easy cases', what: 'Taking on the people or cases that are cheapest to serve, and leaving the hard ones.', cues: ['cream', 'cherry', 'selective', 'skim', 'easiest', 'easy case', 'easier case', 'parking', 'gatekeep', 'screen out', 'take-up', 'take up', 'eligib', 'select'] },
  { key: 'relabelling', label: 'Relabelling what already happens', what: 'Counting existing work as new, or changing a definition or baseline so the numbers move without anything else moving.', cues: ['relabel', 're-label', 'rebadg', 're-badg', 'rebrand', 're-brand', 'rebas', 're-bas', 'reclassif', 're-classif', 'redefin', 're-defin', 'repackag', 'rename', 'deadweight', 'existing provision', 'baseline'] },
  { key: 'minimal_compliance', label: 'Doing the minimum that shows', what: 'Meeting the visible letter of the requirement while the practice behind it does not change.', cues: ['minimal', 'minimum', 'tick-box', 'tick box', 'box-tick', 'box tick', 'visible compliance', 'token', 'surface', 'paper compliance', 'symbolic', 'cosmetic', 'letter of', 'nominal', 'compliance'] },
  { key: 'measure_gaming', label: 'Gaming a measure', what: 'Changing behaviour to hit a target or indicator rather than the outcome it stands for.', cues: ['gaming', 'game the', 'metric', 'target', 'indicator', 'league table', 'score', 'measure'] },
  { key: 'timing', label: 'Playing the clock', what: 'Timing action around a reporting, funding or political window, or delaying until the pressure passes.', cues: ['timing', 'delay', 'defer', 'slow', 'window', 'clock', 'stall', 'wait', 'front-load', 'back-load', 'year-end', 'year end'] },
  { key: 'cost_shifting', label: 'Pushing cost or blame elsewhere', what: 'Moving the cost, the risk or the blame onto a weaker body or onto the people the policy is for.', cues: ['shift', 'blame', 'offload', 'off-load', 'pass on', 'passing on', 'displac', 'cost onto', 'costs onto', 'burden', 'transfer'] },
  { key: 'veto_and_delay', label: 'Blocking through a formal right', what: 'Using a veto, an appeal, a legal challenge or a consultation right to stop or slow the policy.', cues: ['veto', 'appeal', 'judicial review', 'legal challenge', 'litigat', 'consultation', 'objection', 'block'] },
  { key: 'coalition', label: 'Joining forces to resist', what: 'Acting with other bodies so that enforcing the policy against any one of them costs more.', cues: ['coalition', 'lobby', 'alliance', 'collective', 'jointly', 'sector-wide', 'sector wide', 'trade body', 'union'] },
  { key: 'capture', label: 'Capturing whoever judges it', what: 'Influencing the regulator, inspector or assessor, or marking its own homework.', cues: ['capture', 'regulator', 'inspector', 'inspection', 'assessor', 'revolving', 'own homework', 'self-assess', 'self assess'] },
  { key: 'funding_capture', label: 'Taking the money without the change', what: 'Drawing the funding or the benefit while the change it pays for does not happen.', cues: ['funding', 'grant', 'subsid', 'money', 'windfall', 'rent-seek', 'double-count', 'double count', 'claim'] },
  { key: 'information_control', label: 'Controlling the information', what: 'Withholding, delaying or shaping the information the policy depends on.', cues: ['information', 'withhold', 'disclos', 'narrative', 'opaque', 'obscur', 'transparen', 'data', 'report'] },
] as const;

export type PatternKey = (typeof PLAY_PATTERNS)[number]['key'] | 'other';
export const OTHER_PATTERN = { key: 'other' as const, label: 'Other plays', what: 'Plays whose words name none of the patterns above.' };

const LABEL_WEIGHT = 3;

/**
 * A cue matches at the START of a word, so a stem like "rent" cannot fire on
 * "current" or "parent", and "data" cannot fire on "update".
 */
const CUES = new Map(PLAY_PATTERNS.map((p) => [p.key, p.cues.map((cue) => new RegExp(`\\b${cue.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`))]));
const count = (text: string, cue: RegExp) => (cue.test(text) ? 1 : 0);

/** The archetype a play's own words name most strongly, or `other`. */
export function patternOf(play: Pick<Artefact, 'label' | 'data'>): PatternKey {
  const label = String(play.label ?? '').toLowerCase();
  const prose = String(play.data?.play ?? '').toLowerCase();
  let best: PatternKey = 'other';
  let top = 0;
  for (const pattern of PLAY_PATTERNS) {
    const score = (CUES.get(pattern.key) ?? []).reduce((n, cue) => n + LABEL_WEIGHT * count(label, cue) + count(prose, cue), 0);
    // Strictly greater, so an earlier (narrower) archetype wins a tie.
    if (score > top) { top = score; best = pattern.key; }
  }
  return best;
}

export type PatternPlay = { id: string; label: string; actorId: string | null; exposure: number; band: Band; legality: string; targets: string[] };
export type PatternMember = { id: string; label: string; plays: number; worst: number };
export type PlayPattern = {
  key: PatternKey;
  label: string;
  what: string;
  /** Worst first. */
  plays: PatternPlay[];
  /** The bodies that could run it, worst first. */
  bodies: PatternMember[];
  /** The mechanisms its plays are aimed at, most-aimed-at first. */
  mechanisms: PatternMember[];
  /** The sharpest instance's exposure. */
  worst: number;
  band: Band;
  /** Plays in it that break no rule — the ones the drafters will not have priced. */
  compliant: number;
  /** 1 is the pattern that leads this run. */
  rank: number;
  /** Where it stands among this run's patterns, 1 at the top and 0 at the bottom. */
  standing: number;
  tier: Tier;
};
export type Tier = 'leading' | 'middle' | 'trailing';

const num = (v: unknown) => (Number.isFinite(Number(v)) ? Number(v) : 0);
const idList = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : []);

/**
 * Each value's share of the OTHER values it beats, ties counted as half.
 *
 * Relative by construction: the same four patterns score the same standing
 * whether their plays sit at 0.55 or 0.75, which is the point — an absolute
 * score that bunches does not tell a reader which one to read first.
 */
export function percentiles(values: number[]): number[] {
  if (values.length < 2) return values.map(() => 1);
  return values.map((v) => {
    let beaten = 0;
    for (const w of values) {
      if (w < v) beaten += 1;
      else if (w === v) beaten += 0.5;
    }
    // Remove the value's tie with itself.
    return (beaten - 0.5) / (values.length - 1);
  });
}

/** Top quarter leads, bottom quarter trails — at least one leads whenever there is anything. */
function tierOf(rank: number, of: number): Tier {
  const quarter = Math.max(1, Math.round(of / 4));
  if (rank <= quarter) return 'leading';
  if (of > 2 && rank > of - quarter) return 'trailing';
  return 'middle';
}

/**
 * THE PATTERNS, RANKED WITHIN THE RUN.
 *
 * A pattern is ranked on three things a reader can argue with, each as a
 * percentile among this run's patterns and then averaged:
 *
 *   - how bad its sharpest instance is (the worst exposure);
 *   - how many bodies could run it — an idea eleven bodies share is a design
 *     flaw, not one body's opportunism;
 *   - how much of the machinery it is aimed at.
 *
 * Ties are broken by the summed exposure of its plays, then by the archetype
 * order. The composite is never shown as a score, only as a rank and a tier,
 * because it is a way of ordering these patterns and means nothing outside them.
 */
export function playPatterns(artefacts: Artefact[]): PlayPattern[] {
  const byId = new Map(artefacts.map((a) => [a.id, a]));
  const exploits = artefacts.filter((a) => a.kind === 'exploit').sort(byExposure);
  if (!exploits.length) return [];
  const groups = new Map<PatternKey, Artefact[]>();
  for (const play of exploits) {
    const key = patternOf(play);
    groups.set(key, [...(groups.get(key) ?? []), play]);
  }
  const order: PatternKey[] = [...PLAY_PATTERNS.map((p) => p.key), 'other'];
  const built = [...groups.entries()].map(([key, members]) => {
    const meta = PLAY_PATTERNS.find((p) => p.key === key) ?? OTHER_PATTERN;
    const plays: PatternPlay[] = members.map((a) => {
      const exposure = num(a.data.exposure);
      return {
        id: a.id, label: a.label,
        actorId: typeof a.data.actorId === 'string' ? a.data.actorId : null,
        exposure, band: (String(a.data.band || bandOf(exposure).band)) as Band,
        legality: String(a.data.legality ?? ''),
        targets: idList(a.data.targets),
      };
    });
    const tally = (ids: (p: PatternPlay) => string[], keep: (id: string) => boolean) => {
      const rows = new Map<string, PatternMember>();
      for (const play of plays) {
        for (const id of new Set(ids(play))) {
          if (!keep(id)) continue;
          const row = rows.get(id) ?? { id, label: byId.get(id)?.label ?? id, plays: 0, worst: 0 };
          row.plays += 1;
          row.worst = Math.max(row.worst, play.exposure);
          rows.set(id, row);
        }
      }
      return [...rows.values()].sort((a, b) => b.worst - a.worst || b.plays - a.plays || a.label.localeCompare(b.label));
    };
    const bodies = tally((p) => (p.actorId ? [p.actorId] : []), () => true);
    const mechanisms = tally((p) => p.targets, (id) => byId.get(id)?.kind === 'mechanism')
      .sort((a, b) => b.plays - a.plays || b.worst - a.worst || a.label.localeCompare(b.label));
    const worst = plays[0]?.exposure ?? 0;
    return {
      key, label: meta.label, what: meta.what, plays, bodies, mechanisms, worst,
      band: bandOf(worst).band as Band,
      compliant: plays.filter((p) => p.legality === 'compliant').length,
      mass: plays.reduce((n, p) => n + p.exposure, 0),
    };
  });
  const severity = percentiles(built.map((p) => p.worst));
  const reach = percentiles(built.map((p) => p.bodies.length));
  const breadth = percentiles(built.map((p) => p.mechanisms.length));
  const composite = built.map((_, i) => (severity[i] + reach[i] + breadth[i]) / 3);
  const ranked = built
    .map((p, i) => ({ p, c: composite[i] }))
    .sort((x, y) => y.c - x.c || y.p.mass - x.p.mass || order.indexOf(x.p.key) - order.indexOf(y.p.key));
  const standings = percentiles(ranked.map((_, i) => ranked.length - i));
  return ranked.map(({ p }, i) => {
    const { mass: _mass, ...rest } = p;
    return { ...rest, rank: i + 1, standing: Number(standings[i].toFixed(4)), tier: tierOf(i + 1, ranked.length) };
  });
}

/**
 * Where each play stands among this run's plays: "3rd of 47", not 0.62.
 *
 * The exposure is still the fact — this only says how it compares. Equal
 * exposures share a rank, so two plays the model judged identically are never
 * told apart by the order the model happened to write them in.
 */
export function playStanding(artefacts: Artefact[]): Map<string, { rank: number; of: number; standing: number; tier: Tier }> {
  const plays = artefacts.filter((a) => a.kind === 'exploit').sort(byExposure);
  const values = plays.map((a) => num(a.data.exposure));
  const pct = percentiles(values);
  const result = new Map<string, { rank: number; of: number; standing: number; tier: Tier }>();
  plays.forEach((play, i) => {
    const rank = values.findIndex((v) => v === values[i]) + 1;
    result.set(play.id, { rank, of: plays.length, standing: Number(pct[i].toFixed(4)), tier: tierOf(rank, plays.length) });
  });
  return result;
}

/**
 * THE SEVERE PLAYS NO RECOMMENDATION ANSWERS.
 *
 * On the real run three severe plays had no recommendation answering them, and
 * nothing in the pipeline could see it: a recommendation cites findings, a
 * finding cites results, and nobody walked the two hops back. A play is
 * ANSWERED when a recommendation names it directly or names a finding that
 * cites it. Computed rather than asked for, so the challenge stage is handed
 * the list as a fact to test and the report can print it.
 *
 * `recommendations` defaults to every recommendation in the run; the report
 * passes the current generation only.
 */
export function unansweredPlays(artefacts: Artefact[], recommendations = artefacts.filter((a) => a.kind === 'recommendation'), bands: readonly Band[] = ['severe']): Artefact[] {
  const findings = new Map(artefacts.filter((a) => a.kind === 'finding').map((a) => [a.id, a]));
  const answered = new Set<string>();
  for (const rec of recommendations) {
    for (const id of [...rec.refs, ...idList(rec.data.findingIds)]) {
      answered.add(id);
      const finding = findings.get(id);
      if (finding) for (const cited of [...finding.refs, ...idList(finding.data.resultIds)]) answered.add(cited);
    }
  }
  return artefacts
    .filter((a) => a.kind === 'exploit' && (bands as readonly string[]).includes(String(a.data.band)) && !answered.has(a.id))
    .sort(byExposure);
}

/** How many plays a model call is told about per pattern. The rest are counted. */
const BRIEF_PLAYS = 5;

/**
 * The patterns as a model call is handed them — compact, and ids it can cite.
 *
 * Stages 12, 16 and 17 see the plays themselves in their context, forty-seven
 * of them that all look alike. This is the same plays, already grouped and
 * ranked, so a finding can say "eleven bodies can do the minimum that shows"
 * and cite the sharpest of them instead of picking one at random. Sent beside
 * the artefacts, after them, so a stage's cached prefix is untouched.
 */
export function patternBrief(artefacts: Artefact[]) {
  const patterns = playPatterns(artefacts);
  if (!patterns.length) return null;
  return {
    patterns: patterns.map((p) => ({
      pattern: p.key, name: p.label, meaning: p.what, rank: p.rank, of: patterns.length, tier: p.tier,
      worstExposure: Number(p.worst.toFixed(2)), compliantPlays: p.compliant,
      bodies: p.bodies.map((b) => b.id),
      mechanisms: p.mechanisms.map((m) => m.id),
      sharpestPlays: p.plays.slice(0, BRIEF_PLAYS).map((play) => play.id),
      morePlays: Math.max(0, p.plays.length - BRIEF_PLAYS),
    })),
    unansweredSeverePlays: unansweredPlays(artefacts).map((a) => a.id),
  };
}

/** A grid a page can draw: the tail of the machinery is counted, not drawn. */
export const GRID_MECHANISMS = 12;

export type GridCell = {
  pattern: PatternKey;
  mechanismId: string;
  /** The worst exposure of any play in this pattern aimed at this mechanism. */
  worst: number;
  band: Band;
  /** Where this cell stands among the grid's filled cells, 1 at the top. */
  relative: number;
  plays: string[];
};
export type PatternGrid = {
  /** Rows, ranked. */
  patterns: PlayPattern[];
  /** Columns, most-aimed-at first. */
  mechanisms: { id: string; label: string; plays: number; worst: number }[];
  cells: GridCell[];
  /** Mechanisms some play is aimed at that did not fit the grid. */
  hiddenMechanisms: number;
  /** Plays aimed at no mechanism at all — at a measure or objective only. */
  offGrid: number;
};

/**
 * PATTERN × MECHANISM, WORST EXPOSURE IN EACH CELL.
 *
 * The question the grid answers is "which idea, aimed at which piece of
 * machinery, is the worst thing in this paper" — which neither the play list
 * (one idea many times) nor the interplay map (bodies and targets) answers.
 *
 * `relative` is the cell's percentile among the filled cells, so a page can
 * shade it and the shading separates cells whose raw exposures sit within a
 * few hundredths of each other.
 */
export function patternGrid(artefacts: Artefact[]): PatternGrid {
  const patterns = playPatterns(artefacts);
  const byId = new Map(artefacts.map((a) => [a.id, a]));
  const columns = new Map<string, { id: string; label: string; plays: Set<string>; worst: number }>();
  let offGrid = 0;
  for (const pattern of patterns) {
    for (const play of pattern.plays) {
      const aimed = play.targets.filter((id) => byId.get(id)?.kind === 'mechanism');
      if (!aimed.length) offGrid += 1;
      for (const id of new Set(aimed)) {
        const col = columns.get(id) ?? { id, label: byId.get(id)?.label ?? id, plays: new Set<string>(), worst: 0 };
        col.plays.add(play.id);
        col.worst = Math.max(col.worst, play.exposure);
        columns.set(id, col);
      }
    }
  }
  const ordered = [...columns.values()]
    .map((c) => ({ id: c.id, label: c.label, plays: c.plays.size, worst: c.worst }))
    .sort((a, b) => b.plays - a.plays || b.worst - a.worst || a.label.localeCompare(b.label));
  const shown = ordered.slice(0, GRID_MECHANISMS);
  const raw: Omit<GridCell, 'relative'>[] = [];
  for (const pattern of patterns) {
    for (const column of shown) {
      const plays = pattern.plays.filter((p) => p.targets.includes(column.id));
      if (!plays.length) continue;
      const worst = Math.max(...plays.map((p) => p.exposure));
      raw.push({ pattern: pattern.key, mechanismId: column.id, worst, band: bandOf(worst).band as Band, plays: plays.map((p) => p.id) });
    }
  }
  const relative = percentiles(raw.map((c) => c.worst));
  return {
    patterns,
    mechanisms: shown,
    cells: raw.map((c, i) => ({ ...c, relative: Number(relative[i].toFixed(4)) })),
    hiddenMechanisms: ordered.length - shown.length,
    offGrid,
  };
}
