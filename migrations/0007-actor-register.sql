-- Phase 23: ONE MASTER LIST OF ACTORS, with a hierarchy, that every run matches into.
--
-- Measured on the live run 44dd5420 (Best Start, 25 September 2026): 236
-- stage-2 actor rows under 148 labels for what a person would count as 40 to 50
-- actors. 227 of the 236 were `_candidate_` rows: the model had grouped the
-- mentions and the server split every group whose members the identity policy
-- could not link pairwise ("Government" x13, "Parents" x13). The persona library
-- carried the same duplicates (two "Government", four early years provider rows).
--
-- THE REGISTER IS `policy_personas`, EXTENDED — not a parallel identity table.
-- A persona already carries the GOV.UK body, aliases, the reader's rulings,
-- observations and a computed dossier; a second identity system beside it would
-- have to be kept in step with all of that by hand. A register entry with no
-- observation is simply a master actor no paper has written a dossier for yet.
-- Additive only. Every existing row reads as a PROPOSED organisation until the
-- backfill (`server/actor-register.ts`) seeds its kind and status: nothing on
-- the list is confirmed that no reader (or the GOV.UK register) vouched for.

-- What sort of thing it is. `not_an_actor` keeps a programme, a place or an
-- assessment a reader (or a run) ruled out, so the next run matches it
-- deterministically and never profiles it.
ALTER TABLE policy_personas ADD COLUMN IF NOT EXISTS kind text NOT NULL DEFAULT 'organisation';
-- STRUCTURE: who it sits inside. The Secretary of State is part of the DfE,
-- which is part of Government; a family hub is part of the local authority
-- that runs it. For a programme (`not_an_actor`), the actor that runs it.
ALTER TABLE policy_personas ADD COLUMN IF NOT EXISTS part_of uuid REFERENCES policy_personas (id) ON DELETE SET NULL;
-- CATEGORY: what sort of thing it is a member of. Childminders are a kind of
-- early years provider. Two hierarchies because "who sits inside whom" and
-- "what sort of thing is this" give different trees, and folding them together
-- is how a category ends up as the parent of one nursery. Cycles are refused in
-- code, under the owner's advisory lock, in both.
ALTER TABLE policy_personas ADD COLUMN IF NOT EXISTS kind_of uuid REFERENCES policy_personas (id) ON DELETE SET NULL;
-- `confirmed` once a reader accepted it (or the GOV.UK register vouches for it);
-- `proposed` when a run or the backfill added it, and the default, so a writer
-- that forgets to say is never taken as a reader's word. Both are matched into.
ALTER TABLE policy_personas ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'proposed';
-- One plain line: what this actor is.
ALTER TABLE policy_personas ADD COLUMN IF NOT EXISTS what_it_is text;
-- Why it is not an actor: programme, place, assessment or other.
ALTER TABLE policy_personas ADD COLUMN IF NOT EXISTS not_actor_reason text;
-- The paper that proposed it, for the review queue.
ALTER TABLE policy_personas ADD COLUMN IF NOT EXISTS proposed_in uuid REFERENCES policy_analyses (id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS policy_personas_status_idx ON policy_personas (owner, status);

-- MATCHING BACK IN: each source mention of an unsealed paper, the master actor
-- it resolved to, and the capacity the paper shows it in. "DfE as funder" and
-- "DfE as regulator" are two rows to one actor. Cascades with the paper, so a
-- deleted paper takes its sightings with it; a sealed paper writes none.
CREATE TABLE IF NOT EXISTS policy_actor_mentions (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner        text NOT NULL,
  analysis_id  uuid NOT NULL REFERENCES policy_analyses (id) ON DELETE CASCADE,
  -- The run's stage-2 actor artefact (s2_…), or null for a mention that was
  -- not an actor.
  actor_id     text,
  -- The stage-1 mention it came from.
  mention_id   text NOT NULL,
  master_id    uuid NOT NULL REFERENCES policy_personas (id) ON DELETE CASCADE,
  capacity     text,
  -- How the match was made: name, alias, register, ruling, model, reconciled.
  basis        text NOT NULL,
  -- What this paper called it.
  wording      text NOT NULL,
  created_at   timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS policy_actor_mentions_mention_idx ON policy_actor_mentions (analysis_id, mention_id, master_id);
CREATE INDEX IF NOT EXISTS policy_actor_mentions_master_idx ON policy_actor_mentions (master_id);
CREATE INDEX IF NOT EXISTS policy_actor_mentions_owner_idx ON policy_actor_mentions (owner);
