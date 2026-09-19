import { describe, expect, it } from 'vitest';
import { highlight, locate, merge, reflow } from './highlight';

/**
 * The passages here are shaped like the real ones: hard-wrapped at the width the
 * PDF extractor produced, with a word broken across a line.
 */
const PASSAGE = [
  'Providers will more routinely work in partnership together to ensure that the',
  'overall breadth of provision and research is sustain-',
  'able and retained in local areas. We will encourage high-quality and novel',
  'alternative business models, including federated models.',
].join('\n');

describe('locating a stored quote in the passage it came from', () => {
  it('finds a quote whose line breaks fall somewhere else', () => {
    // The stored quote is re-wrapped: the break is after "work", not after "the".
    const span = locate(PASSAGE, 'Providers will more routinely work\nin partnership together');
    expect(span).not.toBeNull();
    expect(PASSAGE.slice(span!.start, span!.end)).toBe(
      'Providers will more routinely work in partnership together',
    );
  });

  it('matches across a word the extractor broke with a hyphen', () => {
    const span = locate(PASSAGE, 'research is sustainable and retained in local areas');
    expect(span).not.toBeNull();
    // The ORIGINAL text comes back, hyphen and line break intact — the point of
    // the section is that it reads as the document has it.
    expect(PASSAGE.slice(span!.start, span!.end)).toContain('sustain-\nable');
  });

  it('locates a quote truncated mid-word, and finishes the word', () => {
    // "…business mod" matches inside "…business models". Stopping the mark where
    // the quote stopped would draw a highlight three letters into a word, which
    // reads as a rendering fault rather than as a citation.
    const span = locate(PASSAGE, 'We will encourage high-quality and novel alternative business mod');
    expect(span).not.toBeNull();
    expect(PASSAGE.slice(span!.start, span!.end).replace(/\s+/g, ' ')).toBe(
      'We will encourage high-quality and novel alternative business models',
    );
  });

  it('is case-insensitive, because a quote is sometimes recapitalised', () => {
    expect(locate(PASSAGE, 'PROVIDERS WILL MORE ROUTINELY WORK IN PARTNERSHIP')).not.toBeNull();
  });

  it('refuses a needle short enough to match by coincidence', () => {
    // "the department" occurs forty times in a policy paper; marking all forty
    // would be the tool asserting a relevance the data does not carry.
    expect(locate(PASSAGE, 'in local')).toBeNull();
  });

  it('returns null when the quote is simply not there', () => {
    expect(locate(PASSAGE, 'The Secretary of State will lay regulations before Parliament')).toBeNull();
  });
});

describe('cutting the passage into runs', () => {
  it('marks every quote it can place and leaves the rest alone', () => {
    const runs = highlight(PASSAGE, [
      'Providers will more routinely work in partnership together',
      'alternative business models, including federated models',
    ]);
    expect(runs.filter((r) => r.mark)).toHaveLength(2);
    // NOTHING IS LOST: the runs rejoin to exactly the text that went in.
    expect(runs.map((r) => r.text).join('')).toBe(PASSAGE);
  });

  it('renders one unmarked run when nothing matches, so a caller never branches', () => {
    expect(highlight(PASSAGE, ['nothing like this at all, anywhere in the document'])).toEqual([
      { text: PASSAGE, mark: false },
    ]);
  });

  it('ignores null and empty quotes, which most artefacts carry', () => {
    expect(highlight(PASSAGE, [null, undefined, ''])).toEqual([{ text: PASSAGE, mark: false }]);
  });

  it('merges two quotes that overlap into one mark', () => {
    const runs = highlight(PASSAGE, [
      'Providers will more routinely work in partnership',
      'routinely work in partnership together to ensure that the overall breadth',
    ]);
    expect(runs.filter((r) => r.mark)).toHaveLength(1);
    expect(runs.map((r) => r.text).join('')).toBe(PASSAGE);
  });
});

describe('merging spans', () => {
  it('joins overlapping and touching ranges and keeps them in order', () => {
    expect(merge([{ start: 10, end: 20 }, { start: 0, end: 5 }, { start: 18, end: 30 }]))
      .toEqual([{ start: 0, end: 5 }, { start: 10, end: 30 }]);
  });
});

describe('reflowing an extracted passage', () => {
  it('joins a wrapped line and keeps a paragraph break', () => {
    expect(reflow('one line\nwrapped here\n\na new paragraph'))
      .toBe('one line wrapped here\n\na new paragraph');
  });

  it('repairs a word the extractor broke across a line', () => {
    expect(reflow('research is sustain-\nable and retained')).toBe('research is sustainable and retained');
  });

  it('leaves a real hyphenated compound alone', () => {
    // The hyphen only goes when a line break follows it.
    expect(reflow('high-quality and novel')).toBe('high-quality and novel');
  });

  it('is what gets highlighted, so the marks land on the reflowed text', () => {
    const flowed = reflow(PASSAGE);
    const runs = highlight(flowed, ['research is sustainable and retained in local areas']);
    expect(runs.filter((r) => r.mark)).toHaveLength(1);
    expect(runs.map((r) => r.text).join('')).toBe(flowed);
  });
});
