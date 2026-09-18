/**
 * The schema, reduced to what the policy pipeline touches.
 *
 * Upstream this file is 365 kB and 207 tables — the whole Strange Ramblings site.
 * The pipeline uses thirteen of them: the eleven `policy_*` tables its migrations
 * create, plus `workflows` and `workflow_runs`, which belong to the site's
 * workflow engine and are recreated locally by `migrations/0000-local-queue.sql`.
 *
 * The table definitions below are COPIED from upstream's `src/lib/db/schema.ts`,
 * because they are what its migrations were generated from and retyping them from
 * the SQL would invite a silent mismatch. Two columns are trimmed — `healing_history`
 * and `paused_at_node_id`, which belong to the engine's self-repair and pause
 * features — and `notifications` keeps its column but loses a type that belongs to
 * the engine. Everything else is upstream's, verbatim.
 */
import {
  pgTable,
  text,
  timestamp,
  integer,
  check,
  doublePrecision,
  boolean,
  uniqueIndex,
  index,
  jsonb,
  primaryKey,
  uuid,
} from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';

export const policyAnalyses = pgTable('policy_analyses', {
  id: uuid('id').primaryKey().defaultRandom(),
  owner: text('owner').notNull(),
  title: text('title').notNull(),
  jurisdiction: text('jurisdiction'),
  policyArea: text('policy_area'),
  context: text('context'),
  depth: text('depth').notNull().default('standard'),
  model: text('model'),
  thinkingLevel: text('thinking_level'),
  concurrency: integer('concurrency'),
  extraction: text('extraction'),
  sharedContextFirst: boolean('shared_context_first').notNull().default(false),
  sealed: boolean('sealed').notNull().default(false),
  sealedResearch: boolean('sealed_research').notNull().default(false),
  status: text('status').notNull().default('queued'),
  cancelledAt: timestamp('cancelled_at', { withTimezone: true }),
  error: text('error'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  completedAt: timestamp('completed_at', { withTimezone: true }),
}, (t) => [index('policy_analyses_owner_idx').on(t.owner, t.createdAt)]);

export const policyDocuments = pgTable('policy_documents', {
  id: uuid('id').primaryKey().defaultRandom(),
  analysisId: uuid('analysis_id').notNull().references(() => policyAnalyses.id, { onDelete: 'cascade' }),
  filename: text('filename').notNull(),
  mimeType: text('mime_type').notNull(),
  size: integer('size').notNull(),
  sha256: text('sha256').notNull(),
  content: text('content').notNull(),
  extractedText: text('extracted_text'),
  metadata: jsonb('metadata'),
}, (t) => [uniqueIndex('policy_documents_analysis_idx').on(t.analysisId)]);

export const policyStages = pgTable('policy_stages', {
  id: uuid('id').primaryKey().defaultRandom(),
  analysisId: uuid('analysis_id').notNull().references(() => policyAnalyses.id, { onDelete: 'cascade' }),
  runId: text('run_id').references(() => workflowRuns.id),
  ordinal: integer('ordinal').notNull(),
  name: text('name').notNull(),
  status: text('status').notNull().default('pending'),
  attempts: integer('attempts').notNull().default(0),
  startedAt: timestamp('started_at', { withTimezone: true }),
  completedAt: timestamp('completed_at', { withTimezone: true }),
  error: text('error'),
  warnings: jsonb('warnings').$type<string[]>().notNull().default([]),
  output: jsonb('output'),
}, (t) => [uniqueIndex('policy_stages_order_idx').on(t.analysisId, t.ordinal)]);

export const policyExecutions = pgTable('policy_executions', {
  id: uuid('id').primaryKey().defaultRandom(),
  stageId: uuid('stage_id').notNull().references(() => policyStages.id, { onDelete: 'cascade' }),
  runId: text('run_id').notNull().references(() => workflowRuns.id),
  status: text('status').notNull().default('running'),
  startedAt: timestamp('started_at', { withTimezone: true }).notNull().defaultNow(),
  completedAt: timestamp('completed_at', { withTimezone: true }),
  error: text('error'),
}, (t) => [index('policy_executions_stage_idx').on(t.stageId)]);

export const policyArtefacts = pgTable('policy_artefacts', {
  id: text('id').notNull(),
  analysisId: uuid('analysis_id').notNull().references(() => policyAnalyses.id, { onDelete: 'cascade' }),
  stage: integer('stage').notNull(),
  kind: text('kind').notNull(),
  label: text('label').notNull(),
  statement: text('statement').notNull(),
  origin: text('origin').notNull(),
  confidence: doublePrecision('confidence'),
  sourceId: text('source_id'),
  sourceQuote: text('source_quote'),
  page: integer('page'),
  section: text('section'),
  startOffset: integer('start_offset'),
  endOffset: integer('end_offset'),
  url: text('url'),
  fromId: text('from_id'),
  toId: text('to_id'),
  relation: text('relation'),
  temporal: text('temporal'),
  data: jsonb('data').$type<Record<string, unknown>>().notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  primaryKey({ columns: [t.analysisId, t.id] }),
  index('policy_artefacts_kind_idx').on(t.analysisId, t.kind),
  index('policy_artefacts_graph_idx').on(t.analysisId, t.fromId, t.toId),
  check('policy_confidence_range', sql`${t.confidence} IS NULL OR (${t.confidence} >= 0 AND ${t.confidence} <= 1)`),
]);

export const policyProvenance = pgTable('policy_provenance', {
  analysisId: uuid('analysis_id').notNull().references(() => policyAnalyses.id, { onDelete: 'cascade' }),
  fromId: text('from_id').notNull(),
  toId: text('to_id').notNull(),
  relation: text('relation').notNull().default('derived_from'),
}, (t) => [
  primaryKey({ columns: [t.analysisId, t.fromId, t.toId] }),
]);

export const policyModelCalls = pgTable('policy_model_calls', {
  id: uuid('id').primaryKey().defaultRandom(),
  executionId: uuid('execution_id').notNull().references(() => policyExecutions.id, { onDelete: 'cascade' }),
  callKey: text('call_key').notNull(),
  promptVersion: text('prompt_version').notNull(),
  inputHash: text('input_hash').notNull(),
  //
  input: jsonb('input'),
  output: jsonb('output'),
  status: text('status').notNull(),
  provider: text('provider'),
  model: text('model'),
  usage: jsonb('usage'),
  startedAt: timestamp('started_at', { withTimezone: true }).notNull().defaultNow(),
  completedAt: timestamp('completed_at', { withTimezone: true }),
  error: text('error'),
}, (t) => [
  index('policy_model_calls_execution_idx').on(t.executionId),
  index('policy_model_calls_hash_idx').on(t.inputHash, t.promptVersion),
]);

export const policyPersonas = pgTable('policy_personas', {
  id: uuid('id').primaryKey().defaultRandom(),
  owner: text('owner').notNull(),
  name: text('name').notNull(),
  entityType: text('entity_type').notNull().default('concept'),
  aliases: jsonb('aliases').$type<string[]>().notNull().default([]),
  summary: text('summary'),
  dossier: jsonb('dossier').$type<{ key: string; label: string; value: string; origin: string; confidence: number | null }[]>().notNull().default([]),
  jurisdiction: text('jurisdiction'),
  sightings: integer('sightings').notNull().default(0),
  researchedAt: timestamp('researched_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [index('policy_personas_owner_idx').on(t.owner, t.name)]);

export const policyPersonaObservations = pgTable('policy_persona_observations', {
  id: uuid('id').primaryKey().defaultRandom(),
  personaId: uuid('persona_id').notNull().references(() => policyPersonas.id, { onDelete: 'cascade' }),
  analysisId: uuid('analysis_id').references(() => policyAnalyses.id, { onDelete: 'cascade' }),
  kind: text('kind').notNull().default('assessment'),
  analysisTitle: text('analysis_title'),
  actorId: text('actor_id'),
  traits: jsonb('traits').$type<{ key: string; label: string; value: string; origin: string; confidence: number | null }[]>().notNull().default([]),
  plays: jsonb('plays').$type<{ label: string; band: string; exposure: number; legality: string }[]>().notNull().default([]),
  sources: jsonb('sources').$type<{ url: string; title: string; quality: string }[]>().notNull().default([]),
  note: text('note'),
  observedAt: timestamp('observed_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index('policy_persona_observations_persona_idx').on(t.personaId, t.observedAt),
  index('policy_persona_observations_analysis_idx').on(t.analysisId),
]);

export const policyPasses = pgTable('policy_passes', {
  id: uuid('id').primaryKey().defaultRandom(),
  analysisId: uuid('analysis_id').notNull().references(() => policyAnalyses.id, { onDelete: 'cascade' }),
  /** 1, 2, 3 … The stage ordinals this pass owns are `100 * pass + k`. */
  pass: integer('pass').notNull(),
  /** 'addendum' — four stages, carries material — or 'restatement' — one stage, none. */
  kind: text('kind').notNull(),
  role: text('role'),
  note: text('note'),
  filename: text('filename'),
  mimeType: text('mime_type'),
  size: integer('size'),
  sha256: text('sha256'),
  /** Base64 of the bounded original bytes, exactly as `policy_documents` holds it. */
  content: text('content'),
  extractedText: text('extracted_text'),
  metadata: jsonb('metadata'),
  status: text('status').notNull().default('queued'),
  error: text('error'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  completedAt: timestamp('completed_at', { withTimezone: true }),
}, (t) => [uniqueIndex('policy_passes_analysis_pass_idx').on(t.analysisId, t.pass)]);

export const policyShares = pgTable('policy_share', {
  id: uuid('id').primaryKey().defaultRandom(),
  analysisId: uuid('analysis_id').notNull().references(() => policyAnalyses.id, { onDelete: 'cascade' }),
  tokenHash: text('token_hash').notNull(),
  label: text('label'),
  createdBy: text('created_by').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  revokedAt: timestamp('revoked_at', { withTimezone: true }),
  lastUsedAt: timestamp('last_used_at', { withTimezone: true }),
  useCount: integer('use_count').notNull().default(0),
}, (t) => [
  uniqueIndex('policy_share_token_hash_idx').on(t.tokenHash),
  index('policy_share_analysis_idx').on(t.analysisId),
]);

export const workflows = pgTable('workflows', {
  id: text('id').primaryKey().default(sql`gen_random_uuid()::text`),
  name: text('name').notNull(),
  description: text('description'),
  trigger: jsonb('trigger').default(sql`'{"type":"manual"}'::jsonb`),
  notifications: jsonb('notifications'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const workflowRuns = pgTable('workflow_runs', {
  id: text('id').primaryKey().default(sql`gen_random_uuid()::text`),
  workflowId: text('workflow_id').notNull().references(() => workflows.id, { onDelete: 'cascade' }),
  status: text('status').notNull().default('pending'),
  trigger: text('trigger').notNull().default('manual'),
  startedAt: timestamp('started_at', { withTimezone: true }),
  completedAt: timestamp('completed_at', { withTimezone: true }),
  error: text('error'),
  /** Liveness ping written by the engine every ~10s while the run is active.
   *  The boot + periodic reaper marks runs whose heartbeat is &gt;5min stale as
   *  failed/abandoned so a crash or deploy mid-run doesn't leave orphaned
   *  `running` rows that block subsequent dispatch. */
  heartbeatAt: timestamp('heartbeat_at', { withTimezone: true }),
  claimedBy: text('claimed_by'),
  claimedAt: timestamp('claimed_at', { withTimezone: true }),
  leaseExpiresAt: timestamp('lease_expires_at', { withTimezone: true }),
  inputData: jsonb('input_data'),
}, (t) => [
  index('workflow_runs_workflow_idx').on(t.workflowId, t.startedAt),
  index('workflow_runs_status_idx').on(t.status, t.startedAt),
]);

export type PolicyAnalysesRow = typeof policyAnalyses.$inferSelect;
export type PolicyDocumentsRow = typeof policyDocuments.$inferSelect;
export type PolicyStagesRow = typeof policyStages.$inferSelect;
export type PolicyExecutionsRow = typeof policyExecutions.$inferSelect;
export type PolicyArtefactsRow = typeof policyArtefacts.$inferSelect;
export type PolicyProvenanceRow = typeof policyProvenance.$inferSelect;
export type PolicyModelCallsRow = typeof policyModelCalls.$inferSelect;
export type PolicyPersonasRow = typeof policyPersonas.$inferSelect;
export type PolicyPersonaObservationsRow = typeof policyPersonaObservations.$inferSelect;
export type PolicyPassesRow = typeof policyPasses.$inferSelect;
export type PolicySharesRow = typeof policyShares.$inferSelect;
export type WorkflowsRow = typeof workflows.$inferSelect;
export type WorkflowRunsRow = typeof workflowRuns.$inferSelect;
