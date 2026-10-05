// The guide's content model (phase 26): that its data is the shape the
// pipeline writes, that its arithmetic is the pipeline's, and that every
// pointer into it lands somewhere.
import { describe, expect, it } from 'vitest';
import { artefactSchema, dataSchemas } from '$lib/policy-analysis/contracts';
import { BANDS, EXPOSURE_FACTORS, exposureOf } from '$lib/policy-analysis/exposure';
import { isPlay } from '$lib/policy-analysis/cleared';
import { plainRows } from '$lib/policy-analysis/plain';
import {
  ASSUMPTIONS, bandFor, bandStretches, CHAPTERS, chapterPath, FACTORS, factorWords, HELP_FOR_SECTION,
  leadFactors, leadPlay, MINI_ASSESSMENT, MINI_PAPERS, PAPER, piecesSoFar, PLAYS, sentenceYield, asksOf, CLASH_BODY,
} from './content';
import { GUIDE } from '../places';

describe('the mini-assessment is real-shaped', () => {
  it('parses every artefact against the pipeline’s own schemas', () => {
    for (const a of MINI_ASSESSMENT) {
      expect(artefactSchema.safeParse(a).success, a.id).toBe(true);
      const schema = dataSchemas[a.kind as keyof typeof dataSchemas];
      const parsed = schema.safeParse(a.data);
      expect(parsed.success, `${a.id}: ${parsed.success ? '' : parsed.error.issues.map((i) => i.path.join('.')).join(', ')}`).toBe(true);
    }
  });

  it('stamps exposure and band exactly as the pipeline would', () => {
    for (const play of PLAYS) {
      const exposure = exposureOf(play.data);
      expect(play.data.exposure).toBe(Number(exposure.toFixed(4)));
      expect(play.data.band).toBe(BANDS.find((b) => exposure >= b.floor)!.band);
    }
  });

  it('gives every play a plain block and none reads as a clearance', () => {
    for (const play of PLAYS) {
      expect(isPlay(play), play.id).toBe(true);
      expect(plainRows(play).length, play.id).toBeGreaterThanOrEqual(4);
    }
  });

  it('opens chapter 3 on a severe play, so chapter 4 starts somewhere worth moving down from', () => {
    expect(leadPlay().data.band).toBe('severe');
    expect(bandFor(leadFactors()).band).toBe('severe');
  });

  it('every precondition and hypothesis names one of the three assumptions', () => {
    const ids = new Set(ASSUMPTIONS.map((a) => a.id));
    for (const a of MINI_ASSESSMENT) {
      for (const id of [...((a.data.preconditions as string[]) ?? []), ...((a.data.hypothesisIds as string[]) ?? [])]) {
        expect(ids.has(id), `${a.id} → ${id}`).toBe(true);
      }
    }
  });
});

describe('chapter 2: the paper comes apart', () => {
  it('every sentence gives up something, and all three kinds appear', () => {
    for (const s of PAPER) expect(s.pieces.length).toBeGreaterThan(0);
    const all = piecesSoFar(PAPER.length);
    expect(all.part.length).toBeGreaterThan(0);
    expect(all.assumption.length).toBeGreaterThan(0);
    expect(all.body.length).toBeGreaterThan(0);
  });

  it('lists a body named twice once, as the run resolves it', () => {
    const named = PAPER.flatMap((s) => s.pieces).filter((p) => p.text === 'Primary schools').length;
    expect(named).toBe(2);
    expect(piecesSoFar(PAPER.length).body.filter((b) => b === 'Primary schools')).toHaveLength(1);
  });

  it('grows one sentence at a time and never shrinks', () => {
    let before = 0;
    for (let n = 0; n <= PAPER.length; n += 1) {
      const count = Object.values(piecesSoFar(n)).flat().length;
      expect(count).toBeGreaterThanOrEqual(before);
      before = count;
    }
    expect(Object.values(piecesSoFar(0)).flat()).toHaveLength(0);
  });

  it('the assumptions the paper gives up are the ones chapter 5 switches off', () => {
    expect(piecesSoFar(PAPER.length).assumption.sort()).toEqual(ASSUMPTIONS.map((a) => a.label).sort());
  });

  it('says what a sentence gave, in the report’s words', () => {
    expect(sentenceYield(PAPER[1])).toBe('1 part of the policy, 1 assumption, 1 body');
  });
});

describe('chapter 4: the sliders', () => {
  it('are exactly the pipeline’s four factors', () => {
    expect(FACTORS.map((f) => f.key).sort()).toEqual(EXPOSURE_FACTORS.map(([key]) => key).sort());
  });

  it('a zero incentive takes the score to zero, a zero concealment does not', () => {
    const base = leadFactors();
    expect(bandFor({ ...base, incentive: 0 }).exposure).toBe(0);
    expect(bandFor({ ...base, concealment: 0 }).exposure).toBeGreaterThan(0);
  });

  it('reaches every band', () => {
    const seen = new Set([0.1, 0.35, 0.55, 0.9].map((v) => bandFor({ ease: v, concealment: v, incentive: v, impact: v }).band));
    expect([...seen].sort()).toEqual(['limited', 'moderate', 'severe', 'significant']);
  });

  it('describes a value in words for a screen reader', () => {
    expect(factorWords(0.8, FACTORS[0])).toBe('0.80, high (0 is very hard, 1 is very easy)');
  });

  it('draws the band key as four stretches covering 0 to 1 with no gap', () => {
    const stretches = bandStretches();
    expect(stretches[0].from).toBe(0);
    expect(stretches.at(-1)!.to).toBe(1);
    for (let i = 1; i < stretches.length; i += 1) expect(stretches[i].from).toBe(stretches[i - 1].to);
  });
});

describe('chapter 6 and the chapters', () => {
  it('puts the clash body in exactly two of three papers, with different asks', () => {
    expect(MINI_PAPERS).toHaveLength(3);
    const asks = asksOf(CLASH_BODY);
    expect(asks).toHaveLength(2);
    expect(new Set(asks.map((a) => a.ask)).size).toBe(2);
  });

  it('numbers six chapters in order, each with words the pack can print', () => {
    expect(CHAPTERS.map((c) => c.n)).toEqual([1, 2, 3, 4, 5, 6]);
    for (const c of CHAPTERS) {
      expect(c.takeaway.length).toBeGreaterThan(0);
      expect(chapterPath(c)).toBe(`${GUIDE}/${c.n}`);
    }
  });

  it('chapter 1 says the sentence the whole guide rests on', () => {
    expect(CHAPTERS[0].takeaway.join(' ')).toMatch(/finds weak points; it is not a prediction/);
  });

  it('every "?" in a report opens a chapter that exists', () => {
    for (const [section, n] of Object.entries(HELP_FOR_SECTION)) {
      expect(CHAPTERS.some((c) => c.n === n), section).toBe(true);
    }
    // Kept to a handful: a "?" on every heading is litter.
    expect(Object.keys(HELP_FOR_SECTION).length).toBeLessThanOrEqual(6);
  });

  it('uses the report’s words, not the pipeline’s', () => {
    const words = CHAPTERS.flatMap((c) => [c.title, c.question, ...c.takeaway]).join(' ');
    expect(words).not.toMatch(/\b(play|plays|artefact|mechanism|persona|exploit)\b/i);
    expect(words).toMatch(/way to beat/);
    expect(words).toMatch(/part of the policy|parts of the policy/);
  });
});
