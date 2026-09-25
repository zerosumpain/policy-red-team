-- Phase 19, workstream X: what the public record says about a register body.
--
-- Measured on the live library, 25 September 2026: personas held no external
-- evidence at all, the reader-triggered enquiry had never been run, and 46 of
-- 47 exploitation plays found no precedent. A body's own track record — its
-- annual reports, what select committees said about it, what Parliament
-- debated — IS the precedent those plays were missing, and most of it is free
-- to fetch with no model call.
--
-- PUBLIC DATA, keyed by the GOV.UK register id, and shared by every owner on
-- the install exactly as `policy_bodies` is. Nothing in it was drawn from a
-- paper, and nothing in it may be: the queries are built from the register's
-- own names, never from a document. That is what makes it safe to reuse across
-- assessments, sealed ones included. Additive only.
CREATE TABLE IF NOT EXISTS policy_body_evidence (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  body_id       text NOT NULL REFERENCES policy_bodies (id) ON DELETE CASCADE,
  -- Which free source it came from: govuk, committees or hansard.
  source        text NOT NULL,
  -- That source's own word for the document: corporate_report, Report, debate.
  source_kind   text NOT NULL,
  -- What it can answer about the body: capacity, track_record, incentives,
  -- stance or powers. Set by rules on the kind and title, never by a model.
  question      text NOT NULL,
  title         text NOT NULL,
  url           text NOT NULL,
  publisher     text,
  -- NULL when the source gave no date. The point of the table is that it
  -- usually does, which in-run research never recorded.
  published_at  timestamptz,
  retrieved_at  timestamptz NOT NULL,
  expires_at    timestamptz NOT NULL,
  excerpt       text
);
CREATE UNIQUE INDEX IF NOT EXISTS policy_body_evidence_url_idx ON policy_body_evidence (body_id, url);
CREATE INDEX IF NOT EXISTS policy_body_evidence_body_idx ON policy_body_evidence (body_id, published_at);

-- When each source was last asked about each body, and what it said. Kept
-- apart from the records because "asked, and there was nothing" is an answer
-- too: without it a body no committee has reported on would be asked again on
-- every run.
CREATE TABLE IF NOT EXISTS policy_body_evidence_checks (
  body_id     text NOT NULL REFERENCES policy_bodies (id) ON DELETE CASCADE,
  source      text NOT NULL,
  checked_at  timestamptz NOT NULL,
  expires_at  timestamptz NOT NULL,
  found       integer NOT NULL DEFAULT 0,
  error       text,
  PRIMARY KEY (body_id, source)
);
