// The invariant a URL broke: one panel is always visible and one tab always
// holds the tab stop.
//
// `?move=do` is a real URL on the report — `do` is a move that is deliberately
// not a tab — and it rendered five panels all carrying `hidden` and five tabs
// none of which held `tabIndex=0`. Measured on the deployed report:
// {panels: 5, visible: 0, tabs: 5, tabbable: 0, selected: 0}. Nothing throws and
// nothing is logged; the page simply has no content and no keyboard route back
// into it.
//
// The component compares every `selected`, `tabIndex` and `hidden` against
// `activeTabId` rather than against the raw `current`, so the two counts below
// are the whole of that guarantee and they can be asserted without a browser.
import { describe, expect, it } from 'vitest';
import { activeTabId, type Tab } from './Tabs';

const tab = (id: string): Tab => ({ id, label: id, panel: null });
const MOVES = ['verdict', 'causality', 'threats', 'actors', 'provenance'].map(tab);

/**
 * The two expressions the component renders, restated: the panel's `hidden` and
 * the tab's `tabIndex`. Written the way `Tabs` writes them rather than
 * simplified, so this stays a test of what the markup does.
 */
const drawn = (tabs: Tab[], current: string) => {
  const active = activeTabId(tabs, current);
  const hidden = tabs.map((t) => t.id !== active);
  const tabIndex = tabs.map((t) => (t.id === active ? 0 : -1));
  return {
    visible: hidden.filter((is) => !is).length,
    tabbable: tabIndex.filter((index) => index === 0).length,
  };
};

describe('activeTabId', () => {
  it('honours a current that names a tab', () => {
    expect(activeTabId(MOVES, 'threats')).toBe('threats');
    expect(drawn(MOVES, 'threats')).toEqual({ visible: 1, tabbable: 1 });
  });

  it('shows the first tab for a move that is not one — the ?move=do case', () => {
    expect(activeTabId(MOVES, 'do')).toBe('verdict');
    expect(drawn(MOVES, 'do')).toEqual({ visible: 1, tabbable: 1 });
  });

  it('shows exactly one panel for any current at all', () => {
    for (const current of ['', 'do', 'VERDICT', 'threats ', '../etc', 'undefined']) {
      expect(drawn(MOVES, current)).toEqual({ visible: 1, tabbable: 1 });
    }
  });

  it('returns the current unchanged when there are no tabs, rather than throwing', () => {
    // A report with no panels is a bug elsewhere, but it must not be a crash
    // here: this runs during render, above the early returns of every caller.
    expect(activeTabId([], 'verdict')).toBe('verdict');
  });
});
