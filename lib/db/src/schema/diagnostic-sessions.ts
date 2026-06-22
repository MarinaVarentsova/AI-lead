import { pgTable, serial, text, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const diagnosticSessionsTable = pgTable("diagnostic_sessions", {
  id: serial("id").primaryKey(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  question1: text("question_1").notNull(),
  question2: text("question_2").notNull(),
  question3: text("question_3").notNull(),
  question4: text("question_4").notNull(),
});

export const insertDiagnosticSessionSchema = createInsertSchema(
  diagnosticSessionsTable,
).omit({ id: true, createdAt: true });

export type InsertDiagnosticSession = z.infer<
  typeof insertDiagnosticSessionSchema
>;
export type DiagnosticSession = typeof diagnosticSessionsTable.$inferSelect;
