/**
 * THE WATCH LIST: WHAT TO LOOK OUT FOR, AND WHAT ANSWERS IT.
 *
 * Every play the run keeps carries an early warning (`data.earlyWarning`) and a
 * counter-measure (`data.counter`) — 47 of 47 on the Post-16 run — and the
 * report printed them one card at a time, behind a disclosure each. That is the
 * right reading for somebody studying one play and the wrong one for the person
 * the phase 19 review had in mind: somebody who has to MONITOR the policy and
 * wants one table they can take away, one row per risk, with the sign to watch
 * for and the recommendation that closes it.
 *
 * THE RECOMMENDATION IS `linkRecommendation()`'s, never a second join. That
 * function tiers its links by how they were made — named by a finding, sharing
 * an assumption, sharing a measure — and argues at length why it stops at two
 * edges. A row takes the strongest link any recommendation has to the play, and
 * says which kind of link it is, so a reader can tell "the assessment said so"
 * from "they rest on the same thing".
 *
 * OWNER IS READ, NEVER GUESSED. No recommendation on any run so far names one
 * (`beneficiaries` and `burdenBearers` say who gains and who pays, which is not
 * who is responsible). `data.owner` is read if a later stage writes it; until
 * then the column is empty and the page leaves it out.
 */
import type { Artefact } from '$lib/policy-analysis/contracts';
import { BAND_LABEL, type Play } from '$lib/policy-analysis/view';
import { linkRecommendation, type Tier } from '$lib/recommendation';

export type WatchRow = {
  play: Play;
  /** What you would see first if somebody were doing it. */
  warning: string;
  /** What the assessment says would stop it. */
  counter: string;
  /** The recommendation with the strongest link to this play, if any. */
  recommendation: Artefact | null;
  tier: Tier | null;
  /** Who is responsible, where the recommendation says. Empty on every run so far. */
  owner: string;
};

/** How each kind of link reads in a table cell. */
export const TIER_SHORT: Record<Tier, string> = {
  named: 'named in its findings',
  assumption: 'rests on the same assumption',
  mechanism: 'targets the same part of the policy',
};

const TIER_ORDER: Tier[] = ['named', 'assumption', 'mechanism'];

const text = (value: unknown): string => (typeof value === 'string' ? value.trim() : '');

function ownerOf(rec: Artefact | null): string {
  if (!rec) return '';
  const own = rec.data.owner ?? rec.data.owners;
  if (Array.isArray(own)) return own.map(String).filter(Boolean).join('; ');
  return text(own);
}

/**
 * One row per play, in the order `list` is in (the assessment's own ranking).
 *
 * A play several recommendations reach takes the strongest tier; between two of
 * the same tier, the first recommendation in the report's order wins, so the
 * table is stable from one render to the next.
 */
export function watchList(list: Play[], recs: Artefact[], artefacts: Artefact[]): WatchRow[] {
  const best = new Map<string, { rec: Artefact; tier: Tier }>();
  for (const rec of recs) {
    for (const link of linkRecommendation(rec, artefacts).plays) {
      const held = best.get(link.id);
      if (!held || TIER_ORDER.indexOf(link.tier) < TIER_ORDER.indexOf(held.tier)) {
        best.set(link.id, { rec, tier: link.tier });
      }
    }
  }
  return list.map((play) => {
    const found = best.get(play.artefact.id) ?? null;
    return {
      play,
      warning: text(play.artefact.data.earlyWarning),
      counter: text(play.artefact.data.counter),
      recommendation: found?.rec ?? null,
      tier: found?.tier ?? null,
      owner: ownerOf(found?.rec ?? null),
    };
  });
}

/**
 * A CSV a spreadsheet opens as it should.
 *
 * RFC 4180 quoting, CRLF line ends, and a byte-order mark so Excel reads the
 * curly quotes the model writes as UTF-8 rather than as three characters of
 * mojibake. A cell that begins with `=`, `+`, `-` or `@` is prefixed with an
 * apostrophe: every word in this file came out of a model reading a document,
 * and a spreadsheet will execute a cell that looks like a formula.
 */
export function watchCsv(rows: WatchRow[]): string {
  const cell = (value: string | number): string => {
    let s = String(value);
    if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
    return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const header = [
    'Rank', 'Way to beat the policy', 'Who could do it', 'How exposed', 'Score',
    'Early warning sign', 'What would stop it', 'Recommendation that answers it', 'How they are linked', 'Owner',
  ];
  const body = rows.map((row, i) => [
    i + 1,
    row.play.artefact.label,
    row.play.actor?.label ?? '',
    BAND_LABEL[row.play.band],
    row.play.exposure.toFixed(2),
    row.warning,
    row.counter,
    row.recommendation?.label ?? '',
    row.tier ? TIER_SHORT[row.tier] : '',
    row.owner,
  ]);
  return `﻿${[header, ...body].map((line) => line.map(cell).join(',')).join('\r\n')}\r\n`;
}
