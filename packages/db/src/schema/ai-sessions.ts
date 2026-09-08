import { pgTable, uuid, text, timestamp, integer, boolean, jsonb } from "drizzle-orm/pg-core";

export const aiSessions = pgTable("ai_sessions", {
  id: uuid("id").primaryKey().defaultRandom(),
  sessionKey: text("session_key").notNull().unique(),
  firstPageUrl: text("first_page_url"),
  utmSource: text("utm_source"),
  utmMedium: text("utm_medium"),
  utmCampaign: text("utm_campaign"),
  utmContent: text("utm_content"),
  utmTerm: text("utm_term"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
});

export const aiConversations = pgTable("ai_conversations", {
  id: uuid("id").primaryKey().defaultRandom(),
  sessionId: uuid("session_id").references(() => aiSessions.id, { onDelete: "cascade" }),
  status: text("status").default("started"),
  startedAt: timestamp("started_at", { withTimezone: true }).defaultNow(),
  completedAt: timestamp("completed_at", { withTimezone: true }),
  currentStep: text("current_step"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
});

export const aiMessages = pgTable("ai_messages", {
  id: uuid("id").primaryKey().defaultRandom(),
  conversationId: uuid("conversation_id")
    .notNull()
    .references(() => aiConversations.id, { onDelete: "cascade" }),
  role: text("role").notNull(),
  message: text("message").notNull(),
  step: text("step"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
});

export const aiDiagnosticAnswers = pgTable("ai_diagnostic_answers", {
  id: uuid("id").primaryKey().defaultRandom(),
  conversationId: uuid("conversation_id")
    .notNull()
    .unique()
    .references(() => aiConversations.id, { onDelete: "cascade" }),
  experienceArea: text("experience_area"),
  experienceAreaRaw: text("experience_area_raw"),
  experienceYears: text("experience_years"),
  experienceYearsRaw: text("experience_years_raw"),
  educationType: text("education_type"),
  educationTypeRaw: text("education_type_raw"),
  goal: text("goal"),
  goalRaw: text("goal_raw"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
});

export const aiContacts = pgTable("ai_contacts", {
  id: uuid("id").primaryKey().defaultRandom(),
  conversationId: uuid("conversation_id").references(() => aiConversations.id, {
    onDelete: "cascade",
  }),
  name: text("name"),
  phone: text("phone"),
  email: text("email"),
  telegram: text("telegram"),
  contactChannel: text("contact_channel"),
  preferredTime: text("preferred_time"),
  comment: text("comment"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
});

export const aiLeads = pgTable("ai_leads", {
  id: uuid("id").primaryKey().defaultRandom(),
  conversationId: uuid("conversation_id").references(() => aiConversations.id, {
    onDelete: "cascade",
  }),
  contactId: uuid("contact_id").references(() => aiContacts.id, { onDelete: "set null" }),
  leadScore: integer("lead_score"),
  leadTemperature: text("lead_temperature"),
  recommendedTrack: text("recommended_track"),
  recommendedTariff: text("recommended_tariff"),
  mainQuestion: text("main_question"),
  mainObjection: text("main_objection"),
  aiBrief: text("ai_brief"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
});

export const aiEvents = pgTable("ai_events", {
  id: uuid("id").primaryKey().defaultRandom(),
  sessionId: uuid("session_id").references(() => aiSessions.id, { onDelete: "cascade" }),
  conversationId: uuid("conversation_id").references(() => aiConversations.id, {
    onDelete: "cascade",
  }),
  eventName: text("event_name").notNull(),
  payload: jsonb("payload"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
});

export const aiKnowledge = pgTable("ai_knowledge", {
  id: uuid("id").primaryKey().defaultRandom(),
  category: text("category").notNull(),
  title: text("title").notNull(),
  content: text("content").notNull(),
  isActive: boolean("is_active").default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
});

export const aiBitrixLogs = pgTable("ai_bitrix_logs", {
  id: uuid("id").primaryKey().defaultRandom(),
  leadId: uuid("lead_id").references(() => aiLeads.id, { onDelete: "cascade" }),
  bitrixLeadId: text("bitrix_lead_id"),
  requestPayload: jsonb("request_payload"),
  responsePayload: jsonb("response_payload"),
  status: text("status"),
  errorMessage: text("error_message"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
});

export const aiUsers = pgTable("ai_users", {
  id: uuid("id").primaryKey().defaultRandom(),
  authUserId: uuid("auth_user_id"),
  roleCode: text("role_code"),
  fullName: text("full_name"),
  email: text("email").unique(),
  phone: text("phone"),
  isActive: boolean("is_active").default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
});
