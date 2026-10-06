// How the reader wants things explained (phase 28): plain unless they chose
// the detail, remembered where storage works, harmless where it does not.
import { describe, expect, it } from 'vitest';
import { chooseReadingLevel, READING_KEY, readingLevel } from './reading';

const memory = () => {
  const store = new Map<string, string>();
  return { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => { store.set(k, v); } };
};
const refusing = { getItem: () => { throw new Error('SecurityError'); }, setItem: () => { throw new Error('QuotaExceededError'); } };

describe('the reading level', () => {
  it('is plain on a first visit, and remembers the detail once chosen', () => {
    const storage = memory();
    expect(readingLevel(storage)).toBe('plain');
    expect(chooseReadingLevel('detail', storage)).toBe(true);
    expect(storage.getItem(READING_KEY)).toBe('detail');
    expect(readingLevel(storage)).toBe('detail');
    chooseReadingLevel('plain', storage);
    expect(readingLevel(storage)).toBe('plain');
  });

  it('reads anything it does not recognise as plain', () => {
    const storage = memory();
    storage.setItem(READING_KEY, 'everything');
    expect(readingLevel(storage)).toBe('plain');
  });

  it('keeps the choice for the visit when storage refuses it', () => {
    expect(readingLevel(refusing)).toBe('plain');
    expect(chooseReadingLevel('detail', refusing)).toBe(false);
    expect(readingLevel(refusing)).toBe('detail');
    // Choosing again where storage works clears the visit-only answer.
    const storage = memory();
    chooseReadingLevel('plain', storage);
    expect(readingLevel(storage)).toBe('plain');
  });
});
