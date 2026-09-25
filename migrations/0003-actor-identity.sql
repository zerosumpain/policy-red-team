-- Phase 19, workstream P: who a body in a paper actually is.
--
-- Measured on the live library, 25 September 2026: 35 personas, and the only
-- three seen twice were two runs of the SAME paper. The Department for
-- Education was in both real papers and never linked. One call minted two
-- personas for one actor, and "children" — a group of people, not a body with
-- a strategy — caused the tie that split the library. Additive only.

-- THE REGISTER OF PUBLIC BODIES, seeded from the GOV.UK organisations API.
-- Public data, shared by every owner on the install: nothing in it was drawn
-- from a paper. `id` is `<source>:<source id>` so it survives a refresh and a
-- second source can join without colliding.
CREATE TABLE IF NOT EXISTS policy_bodies (
  id              text PRIMARY KEY,
  source          text NOT NULL,
  source_id       text NOT NULL,
  name            text NOT NULL,
  slug            text,
  acronym         text,
  format          text,
  status          text NOT NULL DEFAULT 'live',
  closed_status   text,
  closed_at       timestamptz,
  parent_ids      jsonb NOT NULL DEFAULT '[]'::jsonb,
  child_ids       jsonb NOT NULL DEFAULT '[]'::jsonb,
  supersedes_ids  jsonb NOT NULL DEFAULT '[]'::jsonb,
  superseded_by_ids jsonb NOT NULL DEFAULT '[]'::jsonb,
  aliases         jsonb NOT NULL DEFAULT '[]'::jsonb,
  web_url         text,
  fetched_at      timestamptz NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS policy_bodies_source_idx ON policy_bodies (source, source_id);

-- A persona that IS a register body carries its id. Two personas with the same
-- body are the same body, whatever each paper called it or typed it as.
-- `dossier_version` marks a dossier computed from its observations (1) rather
-- than merged model prose (0), so the boot-time upgrade knows what to rebuild.
ALTER TABLE policy_personas ADD COLUMN IF NOT EXISTS body_id text REFERENCES policy_bodies (id) ON DELETE SET NULL;
ALTER TABLE policy_personas ADD COLUMN IF NOT EXISTS dossier_version integer NOT NULL DEFAULT 0;
CREATE INDEX IF NOT EXISTS policy_personas_body_idx ON policy_personas (owner, body_id);

-- Each paper's own one-paragraph summary, so the persona's summary can be
-- rebuilt from what is left when a paper is deleted instead of outliving it.
ALTER TABLE policy_persona_observations ADD COLUMN IF NOT EXISTS summary text;

-- A reader's ruling on identity. `subject` is `persona:<uuid>`, `body:<id>` or
-- `name:<normalised name>`; `verdict` is same or different. The matcher reads
-- these and never links against a "different".
CREATE TABLE IF NOT EXISTS policy_persona_decisions (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner       text NOT NULL,
  persona_id  uuid NOT NULL REFERENCES policy_personas (id) ON DELETE CASCADE,
  subject     text NOT NULL,
  verdict     text NOT NULL,
  decided_by  text NOT NULL DEFAULT 'human',
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS policy_persona_decisions_subject_idx ON policy_persona_decisions (persona_id, subject);
CREATE INDEX IF NOT EXISTS policy_persona_decisions_owner_idx ON policy_persona_decisions (owner);

-- GROUPS OF PEOPLE A PAPER AFFECTS, kept apart from bodies. A group has no
-- strategy to profile, and 18 of the 35 live personas were groups. One row per
-- actor per paper; it goes when the paper goes.
CREATE TABLE IF NOT EXISTS policy_affected_groups (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner        text NOT NULL,
  analysis_id  uuid NOT NULL REFERENCES policy_analyses (id) ON DELETE CASCADE,
  actor_id     text NOT NULL,
  name         text NOT NULL,
  aliases      jsonb NOT NULL DEFAULT '[]'::jsonb,
  observed_at  timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS policy_affected_groups_actor_idx ON policy_affected_groups (analysis_id, actor_id);
CREATE INDEX IF NOT EXISTS policy_affected_groups_owner_idx ON policy_affected_groups (owner, name);
