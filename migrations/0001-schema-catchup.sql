-- Two columns the upstream migrations never had.
--
-- `policy_analyses.extraction` and `policy_analyses.shared_context_first` exist
-- in upstream's Drizzle schema and in its running database, but in none of its
-- ten migration files: they were added with `drizzle-kit push` against the live
-- database rather than written down. A fresh deployment from those migrations
-- alone gets a schema that the code cannot insert into — which is exactly what
-- happened here, on the first integration run:
--
--   column "extraction" of relation "policy_analyses" does not exist
--
-- Locally authored, hence the numeric prefix: `scripts/sync-core.mjs` does not
-- manage this file, and it will not be overwritten by a sync. A diff of the
-- Drizzle schema against the migrated database found these two and nothing else
-- across all thirteen tables, which is also a decent check on the schema copy.
BEGIN;

ALTER TABLE "policy_analyses" ADD COLUMN IF NOT EXISTS "extraction" text;
ALTER TABLE "policy_analyses" ADD COLUMN IF NOT EXISTS "shared_context_first" boolean DEFAULT false NOT NULL;

COMMIT;
