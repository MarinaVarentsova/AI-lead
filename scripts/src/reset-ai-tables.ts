/**
 * Drops all AI tables (in FK-safe order) so drizzle-kit push can recreate
 * them cleanly with the new UUID-based schema.
 */
import { db, sql } from "@workspace/db";

async function reset() {
  console.log("Dropping AI tables (CASCADE)...");

  await db.execute(sql.raw(`
    DROP TABLE IF EXISTS
      ai_bitrix_logs,
      ai_events,
      ai_leads,
      ai_contacts,
      ai_diagnostic_answers,
      ai_messages,
      ai_conversations,
      ai_sessions,
      ai_users,
      ai_knowledge,
      ai_dict_experience_area,
      ai_dict_experience_years,
      ai_dict_education,
      ai_dict_goals,
      ai_dict_roles,
      ai_dict_statuses,
      ai_dict_channels,
      ai_dict_tariffs,
      ai_dict_tracks,
      ai_dict_lead_temperature,
      ai_dict_objections,
      ai_dict_knowledge_categories,
      ai_dict_start_readiness,
      diagnostic_sessions
    CASCADE
  `));

  console.log("✓ All AI tables dropped. Run drizzle push next.");
  process.exit(0);
}

reset().catch((err) => {
  console.error("Reset failed:", err.message);
  process.exit(1);
});
