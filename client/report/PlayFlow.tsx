import type { ReactNode } from 'react';
import type { Artefact } from '$lib/policy-analysis/contracts';
import { BAND_LABEL, type Play } from '$lib/policy-analysis/view';

/**
 * A PLAY, DRAWN AS THE THING IT IS: a body, some conditions, and what gives way.
 *
 * The exploit page was seven headings of prose. Everything a reader needs to
 * see at a glance is in the record already and none of it was drawn — an
 * exploit carries `actorId` (who is positioned to run it), `preconditions` (the
 * assumptions it needs to hold) and `targets` (the mechanisms and claims it
 * defeats). Those three fields are a sentence with a subject, a condition and
 * an object, so they are laid out as one.
 *
 * NOT A GRAPH LIBRARY, AND NOT AN SVG. Every box here is a body of text of
 * unpredictable length and every box is a way into another page; SVG gives
 * neither wrapping nor a link that behaves like a link. Three columns of real
 * HTML with the arrows drawn between them is the same picture, reflows on a
 * phone, and is navigable with a keyboard because it is made of anchors.
 *
 * THE ARROWS ARE DECORATION AND SAY SO. The headings carry the reading —
 * "what it needs to be true", "what it defeats" — so the glyphs are hidden from
 * anyone not looking at them rather than read out as "rightwards arrow" nine
 * times.
 */
export function PlayFlow({ play, resolve, linkTo }: {
  play: Play;
  /** An id to the artefact it names, where this copy holds it. */
  resolve: (id: string) => Artefact | null;
  linkTo: (artefact: Artefact) => ReactNode;
}) {
  const ids = (key: string): Artefact[] => {
    const raw = play.artefact.data[key];
    return Array.isArray(raw)
      ? raw.map((id) => resolve(String(id))).filter((a): a is Artefact => !!a)
      : [];
  };
  const needs = ids('preconditions');
  const defeats = ids('targets');
  const counter = typeof play.artefact.data.counter === 'string' ? play.artefact.data.counter : '';

  // Nothing to draw. A play written by a stage that filed none of the three
  // still renders its prose below; it simply gets no picture.
  if (!play.actor && !needs.length && !defeats.length) return null;

  return (
    <div className="prt-flow">
      <div className="prt-flow__row">
        <Stage
          title="What it needs to be true"
          empty="The record names nothing it needs."
          hint={needs.length ? `${needs.length} assumption${needs.length === 1 ? '' : 's'} the assessment recorded` : undefined}
        >
          {needs.map((item) => (
            <li key={item.id} className="prt-flow__item">{linkTo(item)}</li>
          ))}
        </Stage>

        <span className="prt-flow__arrow" aria-hidden="true">→</span>

        {/*
          THE SUBJECT, and the one box that is not a list. The body is above the
          play rather than beside it because "who would do this" is the first
          question a reader asks of an exploit and the last thing the old page
          answered — it was a field in a table twelve screens down.
        */}
        <div className="prt-flow__stage prt-flow__stage--subject">
          <h3 className="prt-flow__head">The way to beat it</h3>
          <div className={`prt-flow__card prt-flow__card--${play.band}`}>
            {play.actor ? (
              <p className="prt-flow__who">{linkTo(play.actor)}</p>
            ) : (
              <p className="prt-flow__who prt-meta">No body is named as able to run it</p>
            )}
            <p className="prt-flow__title">{play.artefact.label}</p>
            <p className="prt-flow__figures">
              <span className={`prt-band prt-band--${play.band}`}>{BAND_LABEL[play.band]}</span>
              <span className="prt-meta">score {play.exposure.toFixed(2)}</span>
            </p>
          </div>
        </div>

        <span className="prt-flow__arrow" aria-hidden="true">→</span>

        <Stage
          title="What it defeats"
          empty="The record names nothing it defeats."
          hint={defeats.length ? `${defeats.length} thing${defeats.length === 1 ? '' : 's'} the paper relies on` : undefined}
        >
          {defeats.map((item) => (
            <li key={item.id} className="prt-flow__item">{linkTo(item)}</li>
          ))}
        </Stage>
      </div>

      {counter ? (
        <div className="prt-flow__counter">
          <h3 className="prt-flow__head">What would stop it</h3>
          <p className="govuk-body">{counter}</p>
        </div>
      ) : null}
    </div>
  );
}

function Stage({ title, hint, empty, children }: {
  title: string;
  hint?: string;
  empty: string;
  children: ReactNode[];
}) {
  return (
    <div className="prt-flow__stage">
      <h3 className="prt-flow__head">{title}</h3>
      {hint ? <p className="govuk-body-s prt-meta prt-flow__hint">{hint}</p> : null}
      {children.length
        ? <ul className="prt-flow__list">{children}</ul>
        : <p className="govuk-body-s prt-meta">{empty}</p>}
    </div>
  );
}
