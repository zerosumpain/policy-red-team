-- Phase 25: SEVERAL DOCUMENTS IN ONE ASSESSMENT, and A GROUNDING LIBRARY REUSED PER POLICY.
--
-- Additive except for one index. Every existing row reads exactly as it did:
-- its one document becomes document 0 with the empty id prefix, so every
-- passage id it ever minted (`passage_0001`) and every `sourceId` pointing at
-- one survives byte for byte. Checked on a copy of the live database; see
-- docs/phase-25-documents.md.

-- 3a. ONE ASSESSMENT, SEVERAL DOCUMENTS. The unique index on `analysis_id`
-- was the whole of the "one document per assessment" rule; it is replaced by
-- one on `(analysis_id, position)`.
DROP INDEX IF EXISTS policy_documents_analysis_idx;
-- The order the reader gave them in. Document 0 is the main paper.
ALTER TABLE policy_documents ADD COLUMN IF NOT EXISTS position integer NOT NULL DEFAULT 0;
-- 'main' for document 0, 'part' for an annex, a technical note or any other
-- part of the policy under assessment. Grounding material is NOT a role here:
-- it lives in its own tables below and is never decomposed as the paper.
ALTER TABLE policy_documents ADD COLUMN IF NOT EXISTS role text NOT NULL DEFAULT 'main';
-- What the reader calls it ("Annex A: costings"). Sealed on a sealed run.
-- Null on every row before this, which reads as the filename.
ALTER TABLE policy_documents ADD COLUMN IF NOT EXISTS title text;
-- The namespace its passages are minted under: '' for document 0, so every
-- existing passage id is untouched; `d1_`, `d2_` … for the rest.
ALTER TABLE policy_documents ADD COLUMN IF NOT EXISTS id_prefix text NOT NULL DEFAULT '';
CREATE UNIQUE INDEX IF NOT EXISTS policy_documents_analysis_position_idx ON policy_documents (analysis_id, position);

-- WHICH SET OF DOCUMENTS, AND WHICH PAPER. `document_set_hash` is the hash of
-- the sorted member digests — for a one-document set, that document's own
-- sha256, so every existing run keeps the identity it always had.
-- `paper_key` is what "the same paper" means for sightings, neighbours and
-- the bodies grid: inherited at submission from the earliest unsealed run that
-- shares ANY document with this one, so a re-run with an annex added is the
-- same paper, not a second one. Both in the clear, as `sha256` is.
ALTER TABLE policy_analyses ADD COLUMN IF NOT EXISTS document_set_hash text;
ALTER TABLE policy_analyses ADD COLUMN IF NOT EXISTS paper_key text;
UPDATE policy_analyses a
   SET document_set_hash = d.sha256, paper_key = d.sha256
  FROM policy_documents d
 WHERE d.analysis_id = a.id AND d.position = 0 AND a.document_set_hash IS NULL;
CREATE INDEX IF NOT EXISTS policy_analyses_paper_idx ON policy_analyses (owner, paper_key);

-- 3b. A POLICY: what drafts and re-runs of one policy share, and what its
-- grounding library hangs off. A table rather than a free-text key on the
-- analysis, because a policy has a name the reader picks from a list and a
-- library that must go when it goes; a key string would need both anyway.
CREATE TABLE IF NOT EXISTS policy_policies (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner      text NOT NULL,
  name       text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS policy_policies_owner_idx ON policy_policies (owner, name);
-- Which policy a run belongs to. Never set on a sealed run: which policy an
-- unpublished paper belongs to is itself something about it.
ALTER TABLE policy_analyses ADD COLUMN IF NOT EXISTS policy_id uuid REFERENCES policy_policies (id) ON DELETE SET NULL;

-- THE GROUNDING LIBRARY. Material a reader trusts to judge the policy by — an
-- impact assessment, consultation responses, statistics, guidance, an
-- evaluation — attached once to a policy and used by every run of it. Never
-- written from a sealed run.
CREATE TABLE IF NOT EXISTS policy_grounding (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner          text NOT NULL,
  policy_id      uuid NOT NULL REFERENCES policy_policies (id) ON DELETE CASCADE,
  role           text NOT NULL,
  title          text NOT NULL,
  publisher      text,
  -- As the reader gave it: "March 2025", "2024-11-02". Not parsed.
  published_on   text,
  -- A public page, fetched by this server (SSRF-guarded), or a file.
  url            text,
  filename       text,
  mime_type      text,
  size           integer,
  sha256         text,
  -- Base64 of the file, as `policy_documents` holds it.
  content        text,
  -- What was read: a file's extraction, or a page's text. Null for a page not
  -- yet fetched; a run fetches it (when it may) and writes it back here.
  extracted_text text,
  fetched_at     timestamptz,
  error          text,
  created_at     timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS policy_grounding_policy_idx ON policy_grounding (policy_id, created_at);

-- WHAT ONE RUN WAS GROUNDED ON: a copy, taken at submission, of each item it
-- uses. A copy and not a reference, so a run reads the same material however
-- the library changes after it, and so a SEALED run's grounding is sealed with
-- it (`SEALED_FIELDS.grounding`) and never read from or written back to the
-- shared library. Cascades with the run, so purge takes it.
CREATE TABLE IF NOT EXISTS policy_run_grounding (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  analysis_id    uuid NOT NULL REFERENCES policy_analyses (id) ON DELETE CASCADE,
  position       integer NOT NULL,
  -- The library item it was copied from, if any. Null on a sealed run, and
  -- for material a sealed submission brought with it.
  library_id     uuid REFERENCES policy_grounding (id) ON DELETE SET NULL,
  role           text NOT NULL,
  title          text NOT NULL,
  publisher      text,
  published_on   text,
  url            text,
  filename       text,
  mime_type      text,
  size           integer,
  sha256         text,
  content        text,
  extracted_text text,
  error          text,
  created_at     timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS policy_run_grounding_analysis_idx ON policy_run_grounding (analysis_id, position);
