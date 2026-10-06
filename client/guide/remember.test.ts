// The banner's memory (phase 26): remembered where storage works, harmless
// where it throws or is missing.
import { describe, expect, it } from 'vitest';
import { bannerDismissed, forgetDismissed, GUIDE_BANNER_KEY, rememberDismissed } from './remember';

const memory = () => {
  const store = new Map<string, string>();
  return { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => { store.set(k, v); } };
};
const refusing = { getItem: () => { throw new Error('SecurityError'); }, setItem: () => { throw new Error('QuotaExceededError'); } };

describe('remembering the dismissed banner', () => {
  it('shows the banner on a first visit and hides it once dismissed', () => {
    const storage = memory();
    expect(bannerDismissed(storage)).toBe(false);
    expect(rememberDismissed(storage)).toBe(true);
    expect(storage.getItem(GUIDE_BANNER_KEY)).toBe('1');
    expect(bannerDismissed(storage)).toBe(true);
  });

  it('shows the banner, and does not throw, when storage refuses', () => {
    expect(bannerDismissed(refusing)).toBe(false);
    expect(rememberDismissed(refusing)).toBe(false);
  });

  it('copes with no storage at all', () => {
    expect(bannerDismissed(null)).toBe(false);
    expect(rememberDismissed(null)).toBe(false);
  });

  it('shows the banner again once forgotten, and does not throw when storage refuses', () => {
    const store = new Map<string, string>();
    const storage = { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => { store.set(k, v); }, removeItem: (k: string) => { store.delete(k); } };
    rememberDismissed(storage);
    expect(forgetDismissed(storage)).toBe(true);
    expect(bannerDismissed(storage)).toBe(false);
    expect(forgetDismissed({ removeItem: () => { throw new Error('SecurityError'); } })).toBe(false);
    expect(forgetDismissed(null)).toBe(false);
  });
});
