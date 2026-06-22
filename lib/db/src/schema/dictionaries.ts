import { pgTable, serial, text, integer, boolean } from "drizzle-orm/pg-core";

export const aiDictExperienceArea = pgTable("ai_dict_experience_area", {
  id: serial("id").primaryKey(),
  label: text("label").notNull(),
  sortOrder: integer("sort_order").notNull().default(0),
  isActive: boolean("is_active").notNull().default(true),
});

export const aiDictExperienceYears = pgTable("ai_dict_experience_years", {
  id: serial("id").primaryKey(),
  label: text("label").notNull(),
  sortOrder: integer("sort_order").notNull().default(0),
  isActive: boolean("is_active").notNull().default(true),
});

export const aiDictEducation = pgTable("ai_dict_education", {
  id: serial("id").primaryKey(),
  label: text("label").notNull(),
  sortOrder: integer("sort_order").notNull().default(0),
  isActive: boolean("is_active").notNull().default(true),
});

export const aiDictGoals = pgTable("ai_dict_goals", {
  id: serial("id").primaryKey(),
  label: text("label").notNull(),
  sortOrder: integer("sort_order").notNull().default(0),
  isActive: boolean("is_active").notNull().default(true),
});

export const aiDictRoles = pgTable("ai_dict_roles", {
  id: serial("id").primaryKey(),
  label: text("label").notNull(),
  sortOrder: integer("sort_order").notNull().default(0),
});

export const aiDictStatuses = pgTable("ai_dict_statuses", {
  id: serial("id").primaryKey(),
  label: text("label").notNull(),
  code: text("code").notNull().unique(),
});

export const aiDictChannels = pgTable("ai_dict_channels", {
  id: serial("id").primaryKey(),
  label: text("label").notNull(),
  code: text("code").notNull().unique(),
  sortOrder: integer("sort_order").notNull().default(0),
});

export const aiDictTariffs = pgTable("ai_dict_tariffs", {
  id: serial("id").primaryKey(),
  label: text("label").notNull(),
  code: text("code").notNull().unique(),
  sortOrder: integer("sort_order").notNull().default(0),
});

export const aiDictTracks = pgTable("ai_dict_tracks", {
  id: serial("id").primaryKey(),
  label: text("label").notNull(),
  code: text("code").notNull().unique(),
  sortOrder: integer("sort_order").notNull().default(0),
});

export const aiDictLeadTemperature = pgTable("ai_dict_lead_temperature", {
  id: serial("id").primaryKey(),
  label: text("label").notNull(),
  code: text("code").notNull().unique(),
  sortOrder: integer("sort_order").notNull().default(0),
});

export const aiDictObjections = pgTable("ai_dict_objections", {
  id: serial("id").primaryKey(),
  label: text("label").notNull(),
  sortOrder: integer("sort_order").notNull().default(0),
});

export const aiDictKnowledgeCategories = pgTable("ai_dict_knowledge_categories", {
  id: serial("id").primaryKey(),
  label: text("label").notNull(),
  code: text("code").notNull().unique(),
});

export type DictItem = {
  id: number;
  label: string;
  sortOrder: number;
  isActive: boolean;
};
