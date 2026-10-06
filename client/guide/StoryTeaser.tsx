import { useState } from 'react';
import { MINI_POLICY, STORY_EARLY, STORY_EATEN } from './content';
import { useReducedMotion } from './motion';
import { StoryPicture } from './StoryOpening';

/**
 * THE WHOLE IDEA IN ONE PICTURE, on the guide's front page (phase 28).
 *
 * Chapter 1 tells the story in seven beats; a newcomer deciding whether to
 * start the guide gets two of them as a before-and-after, the Data Spine's
 * counterfactual toggle: the same picture as the paper means it, and as the
 * school reads it. One press, the money and the count move, the gap opens.
 *
 * Two buttons with `aria-pressed`, not a radio group: they change what is
 * shown, not a value anything submits. The picture is hidden from screen
 * readers and the caption under it — which changes with the view and is read
 * politely — says everything it shows.
 */
const VIEWS = [
  {
    key: 'paper',
    button: 'As the paper means it',
    beat: 2,
    caption: `${STORY_EATEN} children come for breakfast. The school counts them and is paid £1.20 each; the council checks a sample once a year.`,
  },
  {
    key: 'school',
    button: 'As the school reads it',
    beat: 5,
    caption: `Every child in the building before the bell is counted, so ${STORY_EATEN + STORY_EARLY} are paid for and ${STORY_EATEN} are eaten. Nothing on the return is false, and the yearly sample finds nothing wrong.`,
  },
] as const;

export function StoryTeaser() {
  const reduced = useReducedMotion();
  const [view, setView] = useState<(typeof VIEWS)[number]['key']>('paper');
  const current = VIEWS.find((v) => v.key === view)!;
  return (
    <figure className="prt-teaser">
      <div className="prt-teaser__toggle" role="group" aria-label={`Two ways to read ${MINI_POLICY.title}`}>
        {VIEWS.map((v) => (
          <button
            key={v.key}
            type="button"
            className={`govuk-button govuk-button--secondary prt-teaser__button${v.key === view ? ' is-pressed' : ''}`}
            data-module="govuk-button"
            aria-pressed={v.key === view}
            onClick={() => setView(v.key)}
          >
            {v.button}
          </button>
        ))}
      </div>
      <div className="prt-teaser__picture" aria-hidden="true">
        <StoryPicture beat={current.beat} reduced={reduced} />
      </div>
      <figcaption className="govuk-body prt-teaser__caption" aria-live="polite">{current.caption}</figcaption>
    </figure>
  );
}
