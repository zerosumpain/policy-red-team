import { describe, expect, it } from 'vitest';
import { expandIndexed, numbered, sentences, spanOf } from './sentences';

/**
 * The indexed extraction path rests entirely on these offsets. A sentence whose
 * `start`/`end` are wrong produces a quote that is not in the document, which
 * `validation.ts` rejects — so the failure is loud rather than silent, but it is
 * still a lost artefact. Every case below is a shape a real policy paper has.
 */
describe('sentences', () => {
  it('numbers from one and keeps offsets that slice the original verbatim', () => {
    const text = 'Skills England will be established. It reports to the Secretary of State.';
    const list = sentences(text);
    expect(list.map((s) => s.n)).toEqual([1, 2]);
    for (const s of list) expect(text.slice(s.start, s.end)).toBe(s.text);
    expect(list[1].text).toBe('It reports to the Secretary of State.');
  });

  it('does not break on the abbreviations a white paper is written in', () => {
    const text = 'The Rt Hon. J. Smith M.P. said the reform is vital. See para. 4.2.';
    expect(sentences(text).map((s) => s.text)).toEqual([
      'The Rt Hon. J. Smith M.P. said the reform is vital.',
      'See para. 4.2.',
    ]);
  });

  it('keeps a numbered paragraph as its own sentence', () => {
    // `1.1 The Department…` opens with a digit but is a new sentence; `4.2.`
    // after `para.` opens with a digit and is not. Both are covered by
    // `cannotStart`, and getting the two the same way round is the whole point.
    const text = '1.1 The Department for Education will fund providers directly. 1.2 This replaces the current route.';
    expect(sentences(text).map((s) => s.text)).toEqual([
      '1.1 The Department for Education will fund providers directly.',
      '1.2 This replaces the current route.',
    ]);
  });

  it('drops blank lines rather than numbering them', () => {
    const text = 'First line.\n\n\nSecond line.';
    const list = sentences(text);
    expect(list).toHaveLength(2);
    expect(list[1].text).toBe('Second line.');
  });

  it('gives each bullet its own number', () => {
    const text = 'By 2028, we will:\n- raise participation;\n- publish a report; and\n- review the levy.';
    expect(sentences(text)).toHaveLength(4);
  });

  it('renders the numbering the model is shown', () => {
    expect(numbered(sentences('One. Two.'))).toBe('[1] One.\n[2] Two.');
  });
});

describe('spanOf', () => {
  const text = 'By 2028, we will:\n- raise participation;\n- publish a report; and\n- review the levy.';
  const list = sentences(text);

  it('resolves a single sentence', () => {
    expect(spanOf(text, list, 2)?.text).toBe('- raise participation;');
  });

  it('resolves an inclusive span verbatim, separators and all', () => {
    const span = spanOf(text, list, [1, 4]);
    expect(span?.text).toBe(text);
    // The span must be a substring of the passage, not a re-join of the list.
    expect(text.slice(span!.start, span!.end)).toBe(span!.text);
  });

  it('accepts a numeric string, because a model will send one', () => {
    expect(spanOf(text, list, '2')?.text).toBe('- raise participation;');
  });

  it('refuses a reference the passage does not have rather than clamping', () => {
    // Clamping would turn a fabricated citation into a real-looking one. Same
    // rule as `locateQuote` refusing a quote instead of finding the nearest.
    expect(spanOf(text, list, 40)).toBeNull();
    expect(spanOf(text, list, 0)).toBeNull();
    expect(spanOf(text, list, [3, 1])).toBeNull();
    expect(spanOf(text, list, 'page four')).toBeNull();
    expect(spanOf(text, list, [1, 2, 3])).toBeNull();
    expect(spanOf(text, list, null)).toBeNull();
  });
});

describe('expandIndexed', () => {
  const text = 'Skills England will be established. It reports to the Secretary of State.';
  const passage = { id: 'passage_0001', text, list: sentences(text) };
  const envelope = (a: Record<string, unknown>) => ({ artefacts: [{ id: 's1_000_c1', kind: 'claim', label: 'Establishment', data: { category: 'objective', notes: '' }, ...a }], warnings: [] });
  const first = (raw: unknown) => (raw as { artefacts: Record<string, unknown>[] }).artefacts[0];

  it('fills the statement, the quote and the provenance from the sentence number', () => {
    const out = first(expandIndexed(envelope({ sentence: 1 }), passage));
    expect(out.statement).toBe('Skills England will be established.');
    expect(out.sourceQuote).toBe('Skills England will be established.');
    expect(out.sourceId).toBe('passage_0001');
    expect(out.origin).toBe('extracted_fact');
    expect(out.refs).toEqual(['passage_0001']);
    // The reference itself is consumed; nothing downstream knows this path ran.
    expect(out.sentence).toBeUndefined();
  });

  it('keeps a statement the model did write, because a mechanism needs its own', () => {
    const out = first(expandIndexed(envelope({ sentence: 1, statement: 'A new executive agency is created.' }), passage));
    expect(out.statement).toBe('A new executive agency is created.');
    // The quote is still the document's own words, not the paraphrase.
    expect(out.sourceQuote).toBe('Skills England will be established.');
  });

  it('leaves an unresolvable reference for triage, parseable, with no quote', () => {
    // MEASURED REGRESSION. It used to come back carrying `badSentence` so the
    // repair round could name the number — but that key is unrecognised by the
    // strict artefact schema, so it died at the PARSE rather than at the span
    // check, and the reader was told a statement was missing rather than that a
    // citation was wrong.
    const out = first(expandIndexed(envelope({ sentence: 40 }), passage));
    expect(out.sourceQuote).toBeUndefined();
    expect(out.badSentence).toBeUndefined();
    expect(out.sentence).toBeUndefined();
    // Parseable, and pointed at the passage, so it fails the span rule.
    expect(typeof out.statement).toBe('string');
    expect(out.origin).toBe('extracted_fact');
  });

  it('strips a NULL sentence, which is what an assumption is told to send', () => {
    // THE BUG THAT COST THE FIRST INDEXED RUN ITS ASSUMPTIONS: 189 on the prose
    // run, 10 on the indexed one. The prompt says an assumption carries no
    // `sentence`, the schema shown declares it nullable, so the model sent null
    // — and the early return left the key on the artefact for a strict schema
    // to reject. Every assumption that obeyed the instruction died for obeying.
    const raw = { artefacts: [{ id: 's1_000_a1', kind: 'assumption', label: 'Capacity', statement: 'Capacity is assumed.', origin: 'behavioural_hypothesis', refs: ['s1_000_m1'], data: {}, sentence: null }], warnings: [] };
    const out = first(expandIndexed(raw, passage));
    expect(out.sentence).toBeUndefined();
    expect('sentence' in out).toBe(false);
    // Everything else about an assumption is untouched.
    expect(out.origin).toBe('behavioural_hypothesis');
    expect(out.statement).toBe('Capacity is assumed.');
    expect(out.sourceQuote).toBeUndefined();
  });

  it('never leaves the required statement missing, whatever the model sent', () => {
    // `statement` is required by the strict schema and the prompt asks the model
    // to OMIT it. When no sentence supplies one, the artefact used to fail to
    // parse at all — out of the assessment before any rule could explain why.
    const noSentence = { artefacts: [{ id: 's1_000_c9', kind: 'claim', label: 'A claim with neither', data: { category: 'objective', notes: '' } }], warnings: [] };
    expect(first(expandIndexed(noSentence, passage)).statement).toBe('A claim with neither');
    // And a bad reference still ends up with one.
    expect(first(expandIndexed(envelope({ sentence: 99 }), passage)).statement).toBe('Establishment');
  });

  it('passes an assumption through untouched', () => {
    const raw = { artefacts: [{ id: 's1_000_a1', kind: 'assumption', label: 'Capacity', statement: 'Capacity is assumed.', origin: 'behavioural_hypothesis', refs: ['s1_000_m1'], data: {} }], warnings: [] };
    expect(expandIndexed(raw, passage)).toEqual(raw);
  });

  it('does not throw on a reply that is not an envelope', () => {
    expect(expandIndexed(null, passage)).toBeNull();
    expect(expandIndexed({ artefacts: 'nope' }, passage)).toEqual({ artefacts: 'nope' });
    expect(expandIndexed({ artefacts: [null, 7] }, passage)).toEqual({ artefacts: [null, 7] });
  });
});
