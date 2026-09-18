-- Match the nullable concurrency setting already used by the Policy Analysis schema.
ALTER TABLE policy_analyses ADD COLUMN IF NOT EXISTS concurrency integer;
