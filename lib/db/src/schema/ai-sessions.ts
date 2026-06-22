import { pgTable, serial, text, timestamp, integer, boolean } from "drizzle-orm/pg-core";

export const aiSessions = pgTable("ai_sessions", {
  id: serial("id").primaryKey(),
  sessionToken: text("session_token").notNull().unique(),
  status: text("status").notNull().default("active"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const aiConversations = pgTable("ai_conversations", {
  id: serial("id").primaryKey(),
  sessionId: integer("session_id")
    .notNull()
    .references(() => aiSessions.id),
  status: text("status").notNull().default("in_progress"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const aiMessages = pgTable("ai_messages", {
  id: serial("id").primaryKey(),
  conversationId: integer("conversation_id")
    .notNull()
    .references(() => aiConversations.id),
  role: text("role").notNull(),
  content: text("content").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const aiDiagnosticAnswers = pgTable("ai_diagnostic_answers", {
  id: serial("id").primaryKey(),
  conversationId: integer("conversation_id")
    .notNull()
    .references(() => aiConversations.id),
  questionNumber: integer("question_number").notNull(),
  questionKey: text("question_key").notNull(),
  answerText: text("answer_text").notNull(),
  dictId: integer("dict_id"),
  isCustom: boolean("is_custom").notNull().default(false),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const aiUsers = pgTable("ai_users", {
  id: serial("id").primaryKey(),
  sessionId: integer("session_id").references(() => aiSessions.id),
  name: text("name"),
  phone: text("phone"),
  email: text("email"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const aiLeads = pgTable("ai_leads", {
  id: serial("id").primaryKey(),
  sessionId: integer("session_id")
    .notNull()
    .references(() => aiSessions.id),
  conversationId: integer("conversation_id").references(() => aiConversations.id),
  contactId: integer("contact_id"),
  // Qualification fields
  educationType: text("education_type"),
  experienceArea: text("experience_area"),
  experienceYears: text("experience_years"),
  goal: text("goal"),
  recommendedTrack: text("recommended_track"),
  recommendedTariff: text("recommended_tariff"),
  mainQuestion: text("main_question"),
  mainObjection: text("main_objection"),
  installmentInterest: boolean("installment_interest").default(false),
  startReadiness: text("start_readiness"),
  contactChannel: text("contact_channel"),
  managerNote: text("manager_note"),
  aiBrief: text("ai_brief"),
  qualificationJson: text("qualification_json"),
  // Scoring
  leadScore: integer("lead_score"),
  leadTemperature: text("lead_temperature"),
  status: text("status").notNull().default("new"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const aiEvents = pgTable("ai_events", {
  id: serial("id").primaryKey(),
  sessionId: integer("session_id").references(() => aiSessions.id),
  conversationId: integer("conversation_id").references(() => aiConversations.id),
  eventType: text("event_type").notNull(),
  payload: text("payload"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const aiKnowledge = pgTable("ai_knowledge", {
  id: serial("id").primaryKey(),
  categoryId: integer("category_id"),
  title: text("title").notNull(),
  content: text("content").notNull(),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const aiBitrixLogs = pgTable("ai_bitrix_logs", {
  id: serial("id").primaryKey(),
  leadId: integer("lead_id").references(() => aiLeads.id),
  bitrixLeadId: text("bitrix_lead_id"),
  status: text("status").notNull().default("pending"),
  errorMessage: text("error_message"),
  payload: text("payload"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const aiContacts = pgTable("ai_contacts", {
  id: serial("id").primaryKey(),
  leadId: integer("lead_id").references(() => aiLeads.id),
  conversationId: integer("conversation_id").references(() => aiConversations.id),
  name: text("name"),
  phone: text("phone"),
  email: text("email"),
  telegram: text("telegram"),
  contactChannel: text("contact_channel"),
  preferredTime: text("preferred_time"),
  comment: text("comment"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});
