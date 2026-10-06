/**
 * WHETHER THIS READER HAS DISMISSED THE GUIDE BANNER (phase 26).
 *
 * A leaf module — no React, no imports — because the banner rides on the
 * landing page, the one route in the first paint (see `App.tsx`).
 *
 * EVERY ACCESS IS WRAPPED. `localStorage` throws on read in a private window
 * in some browsers, with site data blocked, and inside sandboxed previews; it
 * can also simply be missing. A banner that crashed the landing page because
 * storage was refused would be a worse first visit than no banner. So a read
 * that throws reads as "not dismissed" (the banner shows), and a write that
 * throws is swallowed (the caller still hides it for this visit from its own
 * state). `storage` is a parameter so the tests can hand in one that throws.
 */
export const GUIDE_BANNER_KEY = 'prt-guide-banner-dismissed';

type StorageLike = Pick<Storage, 'getItem' | 'setItem'>;

function defaultStorage(): Storage | null {
  try {
    return typeof window === 'undefined' ? null : window.localStorage;
  } catch {
    return null;
  }
}

export function bannerDismissed(storage: StorageLike | null = defaultStorage()): boolean {
  try {
    return storage?.getItem(GUIDE_BANNER_KEY) === '1';
  } catch {
    return false;
  }
}

/** True when the dismissal was stored, false when it lives only as long as the page. */
export function rememberDismissed(storage: StorageLike | null = defaultStorage()): boolean {
  try {
    if (!storage) return false;
    storage.setItem(GUIDE_BANNER_KEY, '1');
    return true;
  } catch {
    return false;
  }
}

/**
 * Undo "Hide this message" (phase 28), from the guide's front page: the banner
 * shows again on the landing page and on report pages. True when it worked.
 */
export function forgetDismissed(storage: Pick<Storage, 'removeItem'> | null = defaultStorage()): boolean {
  try {
    if (!storage) return false;
    storage.removeItem(GUIDE_BANNER_KEY);
    return true;
  } catch {
    return false;
  }
}
