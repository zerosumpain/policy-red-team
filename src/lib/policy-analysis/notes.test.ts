import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { boundWarnings } from './budget';
import { flagNotes, splitNotes, withNotes } from './notes';
import { triageOutput } from './validation';
import { stageFacts } from './stage-facts';

/**
 * The Post-16 run's 256 stage warnings, and WHICH of them the model wrote.
 *
 * `warnings.fixture.notes.json` was read off that run's stored replies — every
 * string a model put in its reply's `warnings`, matched by stage and text
 * against what the stage recorded — not off the wording. 103 of 256.
 */
const fixture: [number, string][] = JSON.parse(readFileSync('client/report/warnings.fixture.json', 'utf8'));
const written = new Set<number>(JSON.parse(readFileSync('client/report/warnings.fixture.notes.json', 'utf8')));

describe('the model\'s notes about the paper, kept apart from the run\'s state', () => {
  it('a model reply\'s own warnings come back as notes, and triage\'s own findings as warnings', () => {
    const triaged = triageOutput({ artefacts: [], warnings: ['The passage does not specify funding amounts.'] }, 1, []);
    expect(triaged.notes).toEqual(['The passage does not specify funding amounts.']);
    expect(triaged.warnings).toEqual([]);
  });

  it('a stage written since the split shows its notes inside `warnings` for every existing reader, and as `notes`', () => {
    const [stage] = withNotes([{ ordinal: 1, warnings: ['2 model outputs were discarded.'], notes: ['No funding is stated.'], output: { contractVersion: 2 } }]);
    expect(stage.warnings).toEqual(['2 model outputs were discarded.', 'No funding is stated.']);
    expect(stage.notes).toEqual(['No funding is stated.']);
    expect(splitNotes(stage)).toEqual({ limits: ['2 model outputs were discarded.'], notes: ['No funding is stated.'] });
  });

  it('an older stage is parted by what the model WROTE, not by how a sentence reads', () => {
    const older = { ordinal: 3, warnings: ['No funding is stated.', 'No funding is stated in this passage either.'], output: { contractVersion: 1 } };
    const [stage] = withNotes([older], new Map([[3, new Set(['No funding is stated.'])]]));
    // Only the exact string the reply carried; its near neighbour stays a limit.
    expect(stage.notes).toEqual(['No funding is stated.']);
    expect(stage.warnings).toEqual(older.warnings);
    // And with no replies on record — a sealed run — nothing moves.
    expect(withNotes([older])[0].notes).toEqual([]);
  });

  it('a new stage with no notes is not re-read from the replies', () => {
    const [stage] = withNotes([{ ordinal: 1, warnings: ['No funding is stated.'], notes: [], output: { contractVersion: 2 } }], new Map([[1, new Set(['No funding is stated.'])]]));
    expect(stage.notes).toEqual([]);
  });

  it('parting is a multiset: a sentence that is a note once and a limit once keeps the limit', () => {
    expect(splitNotes({ warnings: ['A', 'B', 'A'], notes: ['A'] })).toEqual({ limits: ['B', 'A'], notes: ['A'] });
    expect(flagNotes({ warnings: ['A', 'B', 'A'], notes: ['A'] })).toEqual([{ text: 'A', note: true }, { text: 'B' }, { text: 'A' }]);
  });
});

describe('measured on the Post-16 run\'s 256 warnings', () => {
  const all = fixture.map(([, text]) => text);
  const machine = fixture.filter((_, i) => !written.has(i)).map(([, text]) => text);
  const notes = fixture.filter((_, i) => written.has(i)).map(([, text]) => text);
  const chars = (list: string[]) => list.reduce((n, w) => n + w.length, 0);

  it('103 are the model\'s notes, and none of them is a machine sentence stage-facts recognises', () => {
    expect(notes).toHaveLength(103);
    // Every one falls to `open` — the bucket stage-facts keeps for prose it
    // will not pattern-match — so provenance and the machine rules agree.
    for (const note of notes) expect(stageFacts([note])[0].kind).toBe('open');
  });

  it('what leaves the carried-forward budget', () => {
    const before = boundWarnings(all);
    const after = boundWarnings(machine);
    const noteSet = new Set(notes.map((n) => n.trim()));
    const carriedNotes = before.filter((w) => noteSet.has(w));
    // The figures `docs/phase-23-tokens.md` quotes. Unique notes are what the
    // budget sees: it de-duplicates before it spends.
    expect({
      notes: notes.length,
      noteChars: chars(notes),
      uniqueNotes: new Set(notes).size,
      carriedBefore: before.length,
      notesCarriedBefore: carriedNotes.length,
      noteCharsCarriedBefore: chars(carriedNotes),
      carriedAfter: after.length,
      notesCarriedAfter: after.filter((w) => noteSet.has(w)).length,
    }).toMatchInlineSnapshot(`
      {
        "carriedAfter": 71,
        "carriedBefore": 90,
        "noteChars": 18070,
        "noteCharsCarriedBefore": 7364,
        "notes": 103,
        "notesCarriedAfter": 0,
        "notesCarriedBefore": 54,
        "uniqueNotes": 103,
      }
    `);
    expect(after.some((w) => noteSet.has(w))).toBe(false);
  });
});
