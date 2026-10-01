-- Phase 22 part 2: what the reader brings to the research step.
--
-- Measured on the real Best Start run (`44dd5420`): 43 research questions, 116
-- sources, every one a search excerpt, and no way for the person who submitted
-- the paper to say "read this evaluation" or "look this up". Now they can, at
-- submission, and it is stored here until stage 5 reads it.
--
-- A TABLE OF ITS OWN, not a JSON column on `policy_analyses`: the analysis row
-- is selected by every lease check of every stage, and up to six megabytes of
-- supplied files riding along on each of those is the reason `policy_documents`
-- is a table of its own too. Cascades with the analysis, so purge takes it.
--
-- Sealed on a sealed run exactly as `policy_documents` is (`SEALED_FIELDS`
-- `readerInput`): a file, an address, an "about" and a note are all the
-- reader's words about an unpublished paper. Additive only.
CREATE TABLE IF NOT EXISTS policy_reader_inputs (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  analysis_id uuid NOT NULL REFERENCES policy_analyses (id) ON DELETE CASCADE,
  -- The order the reader gave them in, which is the order they are asked in.
  position    integer NOT NULL,
  -- 'file', 'page' or 'look_up'.
  kind        text NOT NULL,
  -- A page's address as the reader typed it. Fetched at stage 5, not now: a
  -- run may be sealed, or on an install that does not reach the open web.
  url         text,
  -- A file's name, type and bytes (base64), as `policy_documents` holds them.
  filename    text,
  mime_type   text,
  size        integer,
  content     text,
  -- The reader's words: what a source is about, their note on it, a look-up.
  about       text,
  note        text,
  wording     text,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS policy_reader_inputs_analysis_idx ON policy_reader_inputs (analysis_id, position);

-- Material aimed at ONE item, and material that arrived by address or by a
-- look-up rather than as a file. All nullable: every pass before this has none.
ALTER TABLE policy_passes ADD COLUMN IF NOT EXISTS target_id text;
ALTER TABLE policy_passes ADD COLUMN IF NOT EXISTS source_url text;
ALTER TABLE policy_passes ADD COLUMN IF NOT EXISTS look_up text;
