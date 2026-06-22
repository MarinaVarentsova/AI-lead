CREATE TABLE "diagnostic_sessions" (
	"id" serial PRIMARY KEY NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"question_1" text NOT NULL,
	"question_2" text NOT NULL,
	"question_3" text NOT NULL,
	"question_4" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ai_dict_channels" (
	"id" serial PRIMARY KEY NOT NULL,
	"label" text NOT NULL,
	"code" text NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "ai_dict_channels_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE "ai_dict_education" (
	"id" serial PRIMARY KEY NOT NULL,
	"label" text NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ai_dict_experience_area" (
	"id" serial PRIMARY KEY NOT NULL,
	"label" text NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ai_dict_experience_years" (
	"id" serial PRIMARY KEY NOT NULL,
	"label" text NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ai_dict_goals" (
	"id" serial PRIMARY KEY NOT NULL,
	"label" text NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ai_dict_knowledge_categories" (
	"id" serial PRIMARY KEY NOT NULL,
	"label" text NOT NULL,
	"code" text NOT NULL,
	CONSTRAINT "ai_dict_knowledge_categories_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE "ai_dict_lead_temperature" (
	"id" serial PRIMARY KEY NOT NULL,
	"label" text NOT NULL,
	"code" text NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "ai_dict_lead_temperature_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE "ai_dict_objections" (
	"id" serial PRIMARY KEY NOT NULL,
	"label" text NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ai_dict_roles" (
	"id" serial PRIMARY KEY NOT NULL,
	"label" text NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ai_dict_statuses" (
	"id" serial PRIMARY KEY NOT NULL,
	"label" text NOT NULL,
	"code" text NOT NULL,
	CONSTRAINT "ai_dict_statuses_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE "ai_dict_tariffs" (
	"id" serial PRIMARY KEY NOT NULL,
	"label" text NOT NULL,
	"code" text NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "ai_dict_tariffs_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE "ai_dict_tracks" (
	"id" serial PRIMARY KEY NOT NULL,
	"label" text NOT NULL,
	"code" text NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "ai_dict_tracks_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE "ai_bitrix_logs" (
	"id" serial PRIMARY KEY NOT NULL,
	"lead_id" integer,
	"bitrix_lead_id" text,
	"status" text DEFAULT 'pending' NOT NULL,
	"error_message" text,
	"payload" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ai_contacts" (
	"id" serial PRIMARY KEY NOT NULL,
	"lead_id" integer,
	"conversation_id" integer,
	"name" text,
	"phone" text,
	"email" text,
	"telegram" text,
	"contact_channel" text,
	"preferred_time" text,
	"comment" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ai_conversations" (
	"id" serial PRIMARY KEY NOT NULL,
	"session_id" integer NOT NULL,
	"status" text DEFAULT 'in_progress' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ai_diagnostic_answers" (
	"id" serial PRIMARY KEY NOT NULL,
	"conversation_id" integer NOT NULL,
	"question_number" integer NOT NULL,
	"question_key" text NOT NULL,
	"answer_text" text NOT NULL,
	"dict_id" integer,
	"is_custom" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ai_events" (
	"id" serial PRIMARY KEY NOT NULL,
	"session_id" integer,
	"conversation_id" integer,
	"event_type" text NOT NULL,
	"payload" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ai_knowledge" (
	"id" serial PRIMARY KEY NOT NULL,
	"category_id" integer,
	"title" text NOT NULL,
	"content" text NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ai_leads" (
	"id" serial PRIMARY KEY NOT NULL,
	"session_id" integer NOT NULL,
	"conversation_id" integer,
	"contact_id" integer,
	"education_type" text,
	"experience_area" text,
	"experience_years" text,
	"goal" text,
	"recommended_track" text,
	"recommended_tariff" text,
	"main_question" text,
	"main_objection" text,
	"installment_interest" boolean DEFAULT false,
	"start_readiness" text,
	"contact_channel" text,
	"manager_note" text,
	"ai_brief" text,
	"qualification_json" text,
	"lead_score" integer,
	"lead_temperature" text,
	"status" text DEFAULT 'new' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ai_messages" (
	"id" serial PRIMARY KEY NOT NULL,
	"conversation_id" integer NOT NULL,
	"role" text NOT NULL,
	"content" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ai_sessions" (
	"id" serial PRIMARY KEY NOT NULL,
	"session_token" text NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "ai_sessions_session_token_unique" UNIQUE("session_token")
);
--> statement-breakpoint
CREATE TABLE "ai_users" (
	"id" serial PRIMARY KEY NOT NULL,
	"session_id" integer,
	"name" text,
	"phone" text,
	"email" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "ai_bitrix_logs" ADD CONSTRAINT "ai_bitrix_logs_lead_id_ai_leads_id_fk" FOREIGN KEY ("lead_id") REFERENCES "public"."ai_leads"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_contacts" ADD CONSTRAINT "ai_contacts_lead_id_ai_leads_id_fk" FOREIGN KEY ("lead_id") REFERENCES "public"."ai_leads"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_contacts" ADD CONSTRAINT "ai_contacts_conversation_id_ai_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."ai_conversations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_conversations" ADD CONSTRAINT "ai_conversations_session_id_ai_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."ai_sessions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_diagnostic_answers" ADD CONSTRAINT "ai_diagnostic_answers_conversation_id_ai_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."ai_conversations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_events" ADD CONSTRAINT "ai_events_session_id_ai_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."ai_sessions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_events" ADD CONSTRAINT "ai_events_conversation_id_ai_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."ai_conversations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_leads" ADD CONSTRAINT "ai_leads_session_id_ai_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."ai_sessions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_leads" ADD CONSTRAINT "ai_leads_conversation_id_ai_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."ai_conversations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_messages" ADD CONSTRAINT "ai_messages_conversation_id_ai_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."ai_conversations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_users" ADD CONSTRAINT "ai_users_session_id_ai_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."ai_sessions"("id") ON DELETE no action ON UPDATE no action;