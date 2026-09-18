-- A pass: work the reader commissions AFTER the assessment has reported.
--
-- Pass n owns stage ordinals `100 * n + k`, which is the whole design. The
-- worker chains on `ordinal + 1` and `idPrefix` is already `s<ordinal>_<slot>_`,
-- so a block can neither collide with the main run's 0-17 nor with another pass,
-- and no new identifier mechanism is introduced.
--
-- `policy_documents` is deliberately NOT touched. It is unique on analysis_id,
-- that uniqueness is read by the ingest path and by `neighbourSummaries`, and
-- relaxing it would change what the PREVIOUS release does with rows it did not
-- write. A pass carries its own material instead.
CREATE TABLE IF NOT EXISTS policy_passes (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  analysis_id    uuid NOT NULL REFERENCES policy_analyses (id) ON DELETE CASCADE,
  -- 1, 2, 3 ... The stage ordinals this pass owns are 100 * pass + k.
  pass           integer NOT NULL,
  -- 'addendum' (four stages, carries material) or 'restatement' (one stage, none).
  kind           text NOT NULL,
  -- What the reader says the material IS. It changes how the model is told to
  -- read it: a rebuttal and a later draft want very different instructions.
  role           text,
  note           text,
  -- Material columns, all nullable: a restatement pass attaches nothing.
  -- Encrypted on a sealed run by the same key as everything else on the
  -- analysis, so an addendum cannot be the hole in the seal.
  filename       text,
  mime_type      text,
  size           integer,
  sha256         text,
  content        text,
  extracted_text text,
  metadata       jsonb,
  status         text NOT NULL DEFAULT 'queued',
  error          text,
  created_at     timestamptz NOT NULL DEFAULT now(),
  completed_at   timestamptz
);
CREATE UNIQUE INDEX IF NOT EXISTS policy_passes_analysis_pass_idx ON policy_passes (analysis_id, pass);
