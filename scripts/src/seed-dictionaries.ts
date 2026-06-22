import { db } from "@workspace/db";
import {
  aiDictExperienceArea,
  aiDictExperienceYears,
  aiDictEducation,
  aiDictGoals,
  aiDictRoles,
  aiDictStatuses,
  aiDictChannels,
  aiDictTariffs,
  aiDictTracks,
  aiDictLeadTemperature,
  aiDictKnowledgeCategories,
} from "@workspace/db";

async function seed() {
  console.log("Seeding dictionaries...");

  await db.delete(aiDictExperienceArea);
  await db.insert(aiDictExperienceArea).values([
    { label: "строительство / ремонт", sortOrder: 1 },
    { label: "проектирование / сметы", sortOrder: 2 },
    { label: "технадзор / стройконтроль", sortOrder: 3 },
    { label: "юриспруденция / оценка / экспертиза", sortOrder: 4 },
    { label: "опыта нет", sortOrder: 5 },
  ]);
  console.log("✓ ai_dict_experience_area");

  await db.delete(aiDictExperienceYears);
  await db.insert(aiDictExperienceYears).values([
    { label: "нет опыта", sortOrder: 1 },
    { label: "до 3 лет", sortOrder: 2 },
    { label: "3–10 лет", sortOrder: 3 },
    { label: "более 10 лет", sortOrder: 4 },
    { label: "опыт смежный", sortOrder: 5 },
  ]);
  console.log("✓ ai_dict_experience_years");

  await db.delete(aiDictEducation);
  await db.insert(aiDictEducation).values([
    { label: "высшее строительное", sortOrder: 1 },
    { label: "среднее профессиональное", sortOrder: 2 },
    { label: "непрофильное образование", sortOrder: 3 },
    { label: "только школа / аттестат", sortOrder: 4 },
    { label: "диплом есть, но не на руках", sortOrder: 5 },
  ]);
  console.log("✓ ai_dict_education");

  await db.delete(aiDictGoals);
  await db.insert(aiDictGoals).values([
    { label: "дополнительный доход", sortOrder: 1 },
    { label: "новая профессия", sortOrder: 2 },
    { label: "расширение услуг компании", sortOrder: 3 },
    { label: "приемка квартир", sortOrder: 4 },
    { label: "строительные экспертизы", sortOrder: 5 },
    { label: "пока изучаю", sortOrder: 6 },
  ]);
  console.log("✓ ai_dict_goals");

  await db.delete(aiDictRoles);
  await db.insert(aiDictRoles).values([
    { label: "Студент", sortOrder: 1 },
    { label: "Специалист", sortOrder: 2 },
    { label: "Руководитель", sortOrder: 3 },
    { label: "Предприниматель", sortOrder: 4 },
  ]);
  console.log("✓ ai_dict_roles");

  await db.delete(aiDictStatuses);
  await db.insert(aiDictStatuses).values([
    { label: "Новый", code: "new" },
    { label: "В работе", code: "in_progress" },
    { label: "Завершён", code: "completed" },
    { label: "Отменён", code: "cancelled" },
  ]);
  console.log("✓ ai_dict_statuses");

  await db.delete(aiDictChannels);
  await db.insert(aiDictChannels).values([
    { label: "Сайт", code: "website", sortOrder: 1 },
    { label: "Tilda", code: "tilda", sortOrder: 2 },
    { label: "Telegram", code: "telegram", sortOrder: 3 },
    { label: "WhatsApp", code: "whatsapp", sortOrder: 4 },
  ]);
  console.log("✓ ai_dict_channels");

  await db.delete(aiDictTariffs);
  await db.insert(aiDictTariffs).values([
    { label: "Базовый", code: "basic", sortOrder: 1 },
    { label: "Стандарт", code: "standard", sortOrder: 2 },
    { label: "Профессионал", code: "professional", sortOrder: 3 },
  ]);
  console.log("✓ ai_dict_tariffs");

  await db.delete(aiDictTracks);
  await db.insert(aiDictTracks).values([
    { label: "Строительная экспертиза", code: "construction_expertise", sortOrder: 1 },
    { label: "Судебная экспертиза", code: "judicial_expertise", sortOrder: 2 },
    { label: "Технический надзор", code: "technical_supervision", sortOrder: 3 },
  ]);
  console.log("✓ ai_dict_tracks");

  await db.delete(aiDictLeadTemperature);
  await db.insert(aiDictLeadTemperature).values([
    { label: "Горячий", code: "hot", sortOrder: 1 },
    { label: "Тёплый", code: "warm", sortOrder: 2 },
    { label: "Холодный", code: "cold", sortOrder: 3 },
  ]);
  console.log("✓ ai_dict_lead_temperature");

  await db.delete(aiDictKnowledgeCategories);
  await db.insert(aiDictKnowledgeCategories).values([
    { label: "О программе", code: "about_program" },
    { label: "Стоимость", code: "pricing" },
    { label: "Карьера", code: "career" },
    { label: "Требования к поступлению", code: "requirements" },
    { label: "FAQ", code: "faq" },
  ]);
  console.log("✓ ai_dict_knowledge_categories");

  console.log("\nAll dictionaries seeded successfully.");
  process.exit(0);
}

seed().catch((err) => {
  console.error("Seed failed:", err);
  process.exit(1);
});
