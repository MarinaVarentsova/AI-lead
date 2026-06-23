import { pgTable, text, integer, boolean, timestamp, numeric } from "drizzle-orm/pg-core";

export const aiDictRoles = pgTable("ai_dict_roles", {
  code: text("code").primaryKey(),
  name: text("name").notNull(),
  description: text("description"),
  isActive: boolean("is_active").default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
});

export const aiDictStatuses = pgTable("ai_dict_statuses", {
  code: text("code").primaryKey(),
  name: text("name").notNull(),
  sortOrder: integer("sort_order"),
  isActive: boolean("is_active").default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
});

export const aiDictEducation = pgTable("ai_dict_education", {
  code: text("code").primaryKey(),
  name: text("name").notNull(),
  isActive: boolean("is_active").default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
});

export const aiDictExperienceArea = pgTable("ai_dict_experience_area", {
  code: text("code").primaryKey(),
  name: text("name").notNull(),
  isActive: boolean("is_active").default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
});

export const aiDictExperienceYears = pgTable("ai_dict_experience_years", {
  code: text("code").primaryKey(),
  name: text("name").notNull(),
  sortOrder: integer("sort_order"),
  isActive: boolean("is_active").default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
});

export const aiDictGoals = pgTable("ai_dict_goals", {
  code: text("code").primaryKey(),
  name: text("name").notNull(),
  isActive: boolean("is_active").default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
});

export const aiDictChannels = pgTable("ai_dict_channels", {
  code: text("code").primaryKey(),
  name: text("name").notNull(),
  isActive: boolean("is_active").default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
});

export const aiDictTariffs = pgTable("ai_dict_tariffs", {
  code: text("code").primaryKey(),
  name: text("name").notNull(),
  price: numeric("price"),
  installment: numeric("installment"),
  isActive: boolean("is_active").default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
});

export const aiDictTracks = pgTable("ai_dict_tracks", {
  code: text("code").primaryKey(),
  name: text("name").notNull(),
  isActive: boolean("is_active").default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
});

export const aiDictLeadTemperature = pgTable("ai_dict_lead_temperature", {
  code: text("code").primaryKey(),
  name: text("name").notNull(),
  minScore: integer("min_score"),
  maxScore: integer("max_score"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
});

export const aiDictObjections = pgTable("ai_dict_objections", {
  code: text("code").primaryKey(),
  name: text("name").notNull(),
  isActive: boolean("is_active").default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
});

export const aiDictKnowledgeCategories = pgTable("ai_dict_knowledge_categories", {
  code: text("code").primaryKey(),
  name: text("name").notNull(),
  description: text("description"),
  sortOrder: integer("sort_order"),
  isActive: boolean("is_active").default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
});

export const aiDictStartReadiness = pgTable("ai_dict_start_readiness", {
  code: text("code").primaryKey(),
  name: text("name").notNull(),
  isActive: boolean("is_active").default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
});
