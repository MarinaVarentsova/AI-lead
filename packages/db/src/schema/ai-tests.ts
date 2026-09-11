import { pgTable, uuid, text, integer, jsonb, timestamp, uniqueIndex, check } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
export const aiTestRuns = pgTable("ai_test_runs", {
  id: uuid("id").primaryKey().defaultRandom(), status: text("status").notNull(),
  requestedCases: integer("requested_cases").notNull(), completedCases: integer("completed_cases").notNull().default(0),
  knowledgeVersion: text("knowledge_version").notNull(), summary: jsonb("summary"),
  startedAt: timestamp("started_at", { withTimezone: true }).notNull().defaultNow(),
  completedAt: timestamp("completed_at", { withTimezone: true }),
}, table => [check("ai_test_runs_requested_range", sql`${table.requestedCases} between 1 and 10`),
  uniqueIndex("ai_test_runs_one_active").on(table.status).where(sql`${table.status} = 'running'`)]);
export const aiTestCases = pgTable("ai_test_cases", {
  id: uuid("id").primaryKey().defaultRandom(), runId: uuid("run_id").notNull().references(() => aiTestRuns.id),
  caseNumber: integer("case_number").notNull(), persona: jsonb("persona").notNull(), diagnosticAnswers: jsonb("diagnostic_answers").notNull(),
  diagnosticResult: jsonb("diagnostic_result"), transcript: jsonb("transcript"), evaluatorResult: jsonb("evaluator_result"),
  score: integer("score"), verdict: text("verdict"), errorMessage: text("error_message"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(), completedAt: timestamp("completed_at", { withTimezone: true }),
}, table => [uniqueIndex("ai_test_cases_run_number").on(table.runId, table.caseNumber)]);
