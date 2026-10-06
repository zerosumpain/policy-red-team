import { useSyncExternalStore } from 'react';

/**
 * HOW THIS READER WANTS THINGS EXPLAINED (phase 28): in plain English, or with
 * the detail.
 *
 * Borrowed from the policy engine's welcome, which ends by asking the reader
 * how to be addressed. Here the answer does two things:
 *
 * - the guide adds each chapter's `detail` (the same idea in the report's own
 *   terms) after its plain paragraphs, and each story beat a line saying what
 *   the report calls it;
 * - a report opens the disclosures that hold a way to beat it's workings
 *   ("How it would be run", and the costs, signs and counters), which plain
 *   leaves folded under the five plain lines.
 *
 * PLAIN IS THE DEFAULT and the only answer anything without a choice gets — a
 * first visit, the offline pack, storage that refuses. Plain never hides
 * anything: every disclosure is still one press away.
 *
 * Storage is wrapped exactly as `remember.ts` wraps the banner's: a read that
 * throws reads as plain, a write that throws still changes the page for this
 * visit. Subscribers are told in-page, and other tabs through `storage` events.
 */
export type ReadingLevel = 'plain' | 'detail';

export const READING_KEY = 'prt-reading-level';

type StorageLike = Pick<Storage, 'getItem' | 'setItem'>;

function defaultStorage(): StorageLike | null {
  try {
    return typeof window === 'undefined' ? null : window.localStorage;
  } catch {
    return null;
  }
}

/** For this visit only, when storage would not take the answer. */
let unsaved: ReadingLevel | null = null;
const listeners = new Set<() => void>();

export function readingLevel(storage: StorageLike | null = defaultStorage()): ReadingLevel {
  if (unsaved) return unsaved;
  try {
    return storage?.getItem(READING_KEY) === 'detail' ? 'detail' : 'plain';
  } catch {
    return 'plain';
  }
}

/** True when the choice was stored, false when it lives only as long as the page. */
export function chooseReadingLevel(level: ReadingLevel, storage: StorageLike | null = defaultStorage()): boolean {
  let saved = false;
  try {
    if (storage) {
      storage.setItem(READING_KEY, level);
      saved = true;
    }
  } catch {
    saved = false;
  }
  unsaved = saved ? null : level;
  listeners.forEach((listener) => listener());
  return saved;
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  const onStorage = (event: StorageEvent) => { if (event.key === READING_KEY) listener(); };
  if (typeof window !== 'undefined') window.addEventListener('storage', onStorage);
  return () => {
    listeners.delete(listener);
    if (typeof window !== 'undefined') window.removeEventListener('storage', onStorage);
  };
}

export function useReadingLevel(): ReadingLevel {
  return useSyncExternalStore(subscribe, () => readingLevel(), () => 'plain');
}
