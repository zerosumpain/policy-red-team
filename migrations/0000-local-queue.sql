-- The local stand-in for the site's workflow queue.
--
-- The copied policy code writes queue envelopes to `workflow_runs` and registers
-- one row in `workflows`, and two foreign keys in the next migration point at
-- `workflow_runs`. On the site those tables belong to the workflow engine and
-- carry its whole feature set. Here they are ours, and they carry only what the
-- policy pipeline touches, so that `server/store.ts`, `server/worker.ts` and
-- `server/census.ts` apply unchanged.
--
-- `healing_history` and `paused_at_node_id` are deliberately absent: they belong
-- to the workflow engine's self-repair and pause features, neither of which
-- exists here, and nothing in the policy pipeline reads them.
--
-- The claim and lease columns ARE kept even though this build runs one worker in
-- one process. The copied code reads `claimed_by`, `claimed_at`, `lease_expires_at`
-- and `heartbeat_at` on the cancel, purge and progress paths; keeping four
-- nullable columns is cheaper than editing code that is otherwise a verbatim copy.
BEGIN;

CREATE TABLE IF NOT EXISTS "workflows" (
	"id" text PRIMARY KEY DEFAULT gen_random_uuid()::text NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"trigger" jsonb DEFAULT '{"type":"manual"}'::jsonb,
	"notifications" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "workflow_runs" (
	"id" text PRIMARY KEY DEFAULT gen_random_uuid()::text NOT NULL,
	"workflow_id" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"trigger" text DEFAULT 'manual' NOT NULL,
	"started_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"error" text,
	"heartbeat_at" timestamp with time zone,
	"claimed_by" text,
	"claimed_at" timestamp with time zone,
	"lease_expires_at" timestamp with time zone,
	"input_data" jsonb
);

DO $$ BEGIN
	ALTER TABLE "workflow_runs" ADD CONSTRAINT "workflow_runs_workflow_id_workflows_id_fk"
		FOREIGN KEY ("workflow_id") REFERENCES "workflows"("id") ON DELETE cascade;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE INDEX IF NOT EXISTS "workflow_runs_workflow_idx" ON "workflow_runs" ("workflow_id","started_at");
CREATE INDEX IF NOT EXISTS "workflow_runs_status_idx" ON "workflow_runs" ("status","started_at");

COMMIT;
