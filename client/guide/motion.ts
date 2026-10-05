import { useEffect, useState } from 'react';

/**
 * WHETHER THIS READER HAS ASKED FOR LESS MOTION (phase 26).
 *
 * The CSS already honours `prefers-reduced-motion` — every duration token in
 * `parts/_motion.scss` collapses to near zero under it, and the guide's one
 * looping animation is switched off. This is for the decisions CSS cannot make:
 * whether a looping figure starts PLAYING or starts on its end state, and
 * therefore whether its pause control says "Play" or "Pause".
 *
 * `matchMedia` is missing in some test environments and old embedded views, so
 * its absence reads as "no preference", which is the platform default.
 */
const QUERY = '(prefers-reduced-motion: reduce)';

function query(): MediaQueryList | null {
  try {
    return typeof window !== 'undefined' && typeof window.matchMedia === 'function' ? window.matchMedia(QUERY) : null;
  } catch {
    return null;
  }
}

export function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(() => query()?.matches ?? false);
  useEffect(() => {
    const list = query();
    if (!list) return;
    const update = () => setReduced(list.matches);
    list.addEventListener?.('change', update);
    return () => list.removeEventListener?.('change', update);
  }, []);
  return reduced;
}
