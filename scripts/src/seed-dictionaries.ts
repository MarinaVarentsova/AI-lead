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
    { code: "construction", name: "строительство / ремонт" },
    { code: "design", name: "проектирование / сметы" },
    { code: "supervision", name: "технадзор / стройконтроль" },
    { code: "legal_expertise", name: "юриспруденция / оценка / экспертиза" },
    { code: "no_experience", name: "опыта нет" },
    { code: "other", name: "другое" },
  ]);
  console.log("✓ ai_dict_experience_area");

  await db.delete(aiDictExperienceYears);
  await db.insert(aiDictExperienceYears).values([
    { code: "none", name: "нет опыта", sortOrder: 1 },
    { code: "up_to_3", name: "до 3 лет", sortOrder: 2 },
    { code: "from_3_to_10", name: "3–10 лет", sortOrder: 3 },
    { code: "more_than_10", name: "более 10 лет", sortOrder: 4 },
    { code: "related_experience", name: "опыт смежный", sortOrder: 5 },
  ]);
  console.log("✓ ai_dict_experience_years");

  await db.delete(aiDictEducation);
  await db.insert(aiDictEducation).values([
    { code: "higher_technical", name: "высшее строительное / техническое" },
    { code: "secondary_technical", name: "среднее профессиональное строительное / техническое" },
    { code: "non_profile", name: "непрофильное высшее / среднее профессиональное" },
    { code: "school_only", name: "только школа / аттестат" },
    { code: "diploma_not_available", name: "диплом есть, но не на руках" },
  ]);
  console.log("✓ ai_dict_education");

  await db.delete(aiDictGoals);
  await db.insert(aiDictGoals).values([
    { code: "extra_income", name: "дополнительный доход" },
    { code: "new_profession", name: "новая профессия" },
    { code: "expand_services", name: "расширение услуг компании" },
    { code: "apartment_acceptance", name: "приёмка квартир" },
    { code: "construction_expertise", name: "строительные экспертизы" },
    { code: "research_only", name: "пока изучаю" },
  ]);
  console.log("✓ ai_dict_goals");

  await db.delete(aiDictRoles);
  await db.insert(aiDictRoles).values([
    { code: "manager", name: "Менеджер" },
    { code: "admin", name: "Администратор" },
    { code: "editor", name: "Редактор" },
  ]);
  console.log("✓ ai_dict_roles");

  await db.delete(aiDictStatuses);
  await db.insert(aiDictStatuses).values([
    { code: "started", name: "Начат", sortOrder: 1 },
    { code: "diagnostic_in_progress", name: "Диагностика", sortOrder: 2 },
    { code: "diagnostic_completed", name: "Диагностика завершена", sortOrder: 3 },
    { code: "consultation", name: "Консультация", sortOrder: 4 },
    { code: "completed", name: "Завершён", sortOrder: 5 },
  ]);
  console.log("✓ ai_dict_statuses");

  await db.delete(aiDictChannels);
  await db.insert(aiDictChannels).values([
    { code: "phone", name: "Телефон" },
    { code: "whatsapp", name: "WhatsApp" },
    { code: "telegram", name: "Telegram" },
    { code: "max", name: "MAX" },
    { code: "email", name: "Email" },
  ]);
  console.log("✓ ai_dict_channels");

  await db.delete(aiDictTariffs);
  await db.insert(aiDictTariffs).values([
    { code: "basic", name: "Базовый" },
    { code: "standard", name: "Стандарт" },
    { code: "premium", name: "Премиум" },
    { code: "premium_ijs", name: "Премиум ИЖС" },
    { code: "not_defined", name: "Не определён" },
  ]);
  console.log("✓ ai_dict_tariffs");

  await db.delete(aiDictTracks);
  await db.insert(aiDictTracks).values([
    { code: "sste", name: "ССТЭ" },
    { code: "apartment_acceptance", name: "Приёмка квартир" },
    { code: "sste_plus_acceptance", name: "ССТЭ + Приёмка" },
    { code: "ijs", name: "ИЖС" },
    { code: "need_manager_review", name: "Требует разбора менеджером" },
  ]);
  console.log("✓ ai_dict_tracks");

  await db.delete(aiDictLeadTemperature);
  await db.insert(aiDictLeadTemperature).values([
    { code: "hot", name: "Горячий", minScore: 90, maxScore: 130 },
    { code: "warm", name: "Тёплый", minScore: 60, maxScore: 89 },
    { code: "cold", name: "Холодный", minScore: 30, maxScore: 59 },
    { code: "info", name: "Информационный", minScore: 0, maxScore: 29 },
  ]);
  console.log("✓ ai_dict_lead_temperature");

  await db.delete(aiDictKnowledgeCategories);
  await db.insert(aiDictKnowledgeCategories).values([
    { code: "about_program", name: "О программе", sortOrder: 1 },
    { code: "pricing", name: "Стоимость", sortOrder: 2 },
    { code: "career", name: "Карьера", sortOrder: 3 },
    { code: "requirements", name: "Требования к поступлению", sortOrder: 4 },
    { code: "faq", name: "FAQ", sortOrder: 5 },
  ]);
  console.log("✓ ai_dict_knowledge_categories");

  console.log("\nAll dictionaries seeded successfully.");
  process.exit(0);
}

seed().catch((err) => {
  console.error("Seed failed:", err);
  process.exit(1);
});
