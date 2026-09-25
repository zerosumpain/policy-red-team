import { useRef, useState, type KeyboardEvent, type RefObject } from 'react';

/**
 * ONE TAB STOP FOR A LIST OF CONTROLS, and arrow keys inside it.
 *
 * Measured live on the deployed report: `#report-panel-causality` has 63
 * focusable elements and the mechanism chart's buttons were indices 0 to 21 —
 * every one of them before anything else in the panel. Causality has only two
 * sections, so the `< 3` guard on the in-panel contents list suppresses it, and
 * reaching the first thing after the chart cost 22 presses of Tab. The
 * every-ref coverage fix takes that list from 22 rows to 41, which would have
 * doubled the cost.
 *
 * THE FIX IS NOT A CAP. A "show all" control hides rows behind an interaction
 * that a printed copy and the offline pack render collapsed, and the thing the
 * measurement actually complained about was tab stops, not rows. A composite
 * widget is one tab stop whatever it holds: 41 rows and 13 chips become two.
 *
 * `role="toolbar"`, NOT `role="radiogroup"` — the caller's business, but the
 * reason belongs with the hook: a radio cannot be un-checked by pressing it
 * again, and these controls clear the selection when the pressed one is pressed.
 * Radio semantics would describe behaviour the component does not have.
 *
 * BOTH ARROW PAIRS MOVE. The mechanism bars are a vertical toolbar and the
 * one-play chips are a wrapped horizontal one, and a chip row that wraps to
 * three lines is neither: a reader pressing Down on the second line of chips
 * means the same thing as Right. Home and End are included because 41 rows is
 * long enough to want them.
 */
export function useRoving<T extends HTMLElement = HTMLUListElement>(count: number, current: number): {
  container: RefObject<T | null>;
  tabIndexFor: (index: number) => 0 | -1;
  onKeyDown: (event: KeyboardEvent<T>) => void;
} {
  // GENERIC SINCE PHASE 19: the pattern grid is a table, not a list, and is one
  // tab stop for the same reason the mechanism bars were.
  const container = useRef<T | null>(null);
  const [at, setAt] = useState(current > 0 ? current : 0);

  /*
   * THE TAB STOP FOLLOWS THE SELECTION, and this is React's own pattern for a
   * state that is derived from a prop and also set by the user — adjusted
   * during render rather than in an effect, so there is no second paint with
   * the tab stop in the old place.
   *
   * A CLEARED SELECTION LEAVES IT WHERE IT IS. `current` goes to -1 when the
   * reader presses the row that is already pressed, and snapping the tab stop
   * back to row 0 at that moment would take it away from the row the reader is
   * standing on and still has focus in.
   */
  const [seen, setSeen] = useState(current);
  if (current !== seen) {
    setSeen(current);
    if (current >= 0) setAt(current);
  }

  const items = () => [...(container.current?.querySelectorAll<HTMLElement>('[data-roving]') ?? [])];

  const onKeyDown = (event: KeyboardEvent<T>) => {
    const step: Record<string, number> = { ArrowUp: -1, ArrowLeft: -1, ArrowDown: 1, ArrowRight: 1 };
    let next: number | null = null;
    if (event.key in step) next = (at + step[event.key] + count) % count;
    if (event.key === 'Home') next = 0;
    if (event.key === 'End') next = count - 1;
    if (next === null || !count) return;
    event.preventDefault();
    setAt(next);
    // Focus is moved rather than only marked: a roving tabindex that does not
    // move focus is a list the arrow keys appear to do nothing to.
    items()[next]?.focus();
  };

  return {
    container,
    // Clamped, because the list is rebuilt whenever the carried selection
    // narrows it and the remembered position can outlive the row it named.
    tabIndexFor: (index) => (index === Math.min(at, Math.max(count - 1, 0)) ? 0 : -1),
    onKeyDown,
  };
}
