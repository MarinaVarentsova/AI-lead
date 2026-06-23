/**
 * LeadQualificationService
 *
 * Receives raw JSON from OpenAI, validates values against allowed enums,
 * calculates lead_score on the backend (OpenAI does NOT score),
 * generates ai_brief, and writes the result to ai_leads.
 */
import { db, aiLeads } from "@workspace/db";
import { logger } from "../lib/logger";

// ─── Allowed enum values ───────────────────────────────────────────────────────

const EDUCATION_TYPES = [
  "higher_technical", "secondary_technical", "non_profile",
  "school_only", "diploma_not_available", "need_clarification",
] as const;

const EXPERIENCE_AREAS = [
  "construction", "design", "supervision", "legal_expertise",
  "no_experience", "other",
] as const;

const EXPERIENCE_YEARS = [
  "none", "up_to_3", "from_3_to_10", "more_than_10",
  "related_experience", "need_clarification",
] as const;

const GOALS = [
  "extra_income", "new_profession", "expand_services",
  "apartment_acceptance", "construction_expertise", "research_only",
] as const;

const RECOMMENDED_TRACKS = [
  "sste", "apartment_acceptance", "sste_plus_acceptance",
  "ijs", "need_manager_review",
] as const;

const RECOMMENDED_TARIFFS = [
  "basic", "standard", "premium", "premium_ijs", "not_defined",
] as const;

const MAIN_OBJECTIONS = [
  "expensive", "no_orders", "no_time", "education_doubt",
  "compare_competitors", "other", "none",
] as const;

const START_READINESS = [
  "now", "this_month", "later", "just_researching", "unknown",
] as const;

const CONTACT_CHANNELS = [
  "phone", "whatsapp", "telegram", "max", "email", "unknown",
] as const;

// ─── Types ────────────────────────────────────────────────────────────────────

export interface QualificationData {
  education_type: string;
  experience_area: string;
  experience_years: string;
  goal: string;
  recommended_track: string;
  recommended_tariff: string;
  main_question: string;
  main_objection: string;
  installment_interest: boolean;
  start_readiness: string;
  contact_channel: string;
  manager_note: string;
}

export interface ScoredLead {
  leadId: string;
  leadScore: number;
  leadTemperature: string;
  qualification: QualificationData;
  aiBrief: string;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function validateEnum<T extends string>(
  value: unknown,
  allowed: readonly T[],
  fallback: T
): T {
  if (typeof value === "string" && allowed.includes(value as T)) {
    return value as T;
  }
  return fallback;
}

function parseQualification(raw: string): QualificationData {
  let data: Record<string, unknown>;
  try {
    data = JSON.parse(raw);
  } catch {
    logger.warn({ raw: raw.slice(0, 200) }, "Failed to parse qualification JSON");
    data = {};
  }

  const education_type = validateEnum(data.education_type, EDUCATION_TYPES, "need_clarification");
  const isSchoolOnly = education_type === "school_only";

  return {
    education_type,
    experience_area: validateEnum(data.experience_area, EXPERIENCE_AREAS, "other"),
    experience_years: validateEnum(data.experience_years, EXPERIENCE_YEARS, "need_clarification"),
    goal: validateEnum(data.goal, GOALS, "research_only"),
    recommended_track: isSchoolOnly
      ? "apartment_acceptance"
      : validateEnum(data.recommended_track, RECOMMENDED_TRACKS, "need_manager_review"),
    recommended_tariff: isSchoolOnly
      ? "not_defined"
      : validateEnum(data.recommended_tariff, RECOMMENDED_TARIFFS, "not_defined"),
    main_question: typeof data.main_question === "string" ? data.main_question : "",
    main_objection: validateEnum(data.main_objection, MAIN_OBJECTIONS, "none"),
    installment_interest: data.installment_interest === true,
    start_readiness: validateEnum(data.start_readiness, START_READINESS, "unknown"),
    contact_channel: validateEnum(data.contact_channel, CONTACT_CHANNELS, "unknown"),
    manager_note: isSchoolOnly
      ? "У клиента только аттестат. ССТЭ / ДПО не предлагать как основной вариант."
      : (typeof data.manager_note === "string" ? data.manager_note : ""),
  };
}

// ─── Lead score calculation (backend only) ────────────────────────────────────

function calculateScore(q: QualificationData): { score: number; temperature: string } {
  let score = 0;

  if (["higher_technical", "secondary_technical", "non_profile"].includes(q.education_type)) {
    score += 20;
  }
  if (["higher_technical", "secondary_technical"].includes(q.education_type)) {
    score += 20;
  }
  if (["from_3_to_10", "more_than_10"].includes(q.experience_years)) {
    score += 20;
  }
  if (["extra_income", "new_profession", "expand_services", "construction_expertise"].includes(q.goal)) {
    score += 20;
  }
  if (q.installment_interest || /рассрочк|стоимост|цен|договор|документ/i.test(q.main_question)) {
    score += 20;
  }
  if (["now", "this_month"].includes(q.start_readiness)) {
    score += 20;
  }
  if (["phone", "whatsapp", "telegram", "max"].includes(q.contact_channel)) {
    score += 10;
  }

  if (q.education_type === "school_only") {
    score = Math.min(score, 30);
  }

  const temperature =
    score >= 90 ? "hot" : score >= 60 ? "warm" : score >= 30 ? "cold" : "info";

  return { score, temperature };
}

// ─── Brief generator ──────────────────────────────────────────────────────────

const EDUCATION_LABELS: Record<string, string> = {
  higher_technical: "Высшее строительное / техническое",
  secondary_technical: "Среднее профессиональное строительное / техническое",
  non_profile: "Высшее / среднее профессиональное непрофильное",
  school_only: "Только школа / аттестат",
  diploma_not_available: "Диплом есть, но не на руках",
  need_clarification: "Требует уточнения",
};

const EXPERIENCE_LABELS: Record<string, string> = {
  construction: "Строительство / ремонт",
  design: "Проектирование / сметы",
  supervision: "Технадзор / стройконтроль",
  legal_expertise: "Юриспруденция / оценка / экспертиза",
  no_experience: "Нет опыта",
  other: "Другое",
};

const YEARS_LABELS: Record<string, string> = {
  none: "Нет опыта",
  up_to_3: "До 3 лет",
  from_3_to_10: "3–10 лет",
  more_than_10: "Более 10 лет",
  related_experience: "Смежный опыт",
  need_clarification: "Требует уточнения",
};

const GOAL_LABELS: Record<string, string> = {
  extra_income: "Дополнительный доход",
  new_profession: "Новая профессия",
  expand_services: "Расширить услуги компании",
  apartment_acceptance: "Приёмка квартир",
  construction_expertise: "Строительные экспертизы",
  research_only: "Просто изучает",
};

const TRACK_LABELS: Record<string, string> = {
  sste: "ССТЭ (Судебная строительно-техническая экспертиза)",
  apartment_acceptance: "Приёмка квартир",
  sste_plus_acceptance: "ССТЭ + Приёмка квартир",
  ijs: "ИЖС",
  need_manager_review: "Требует разбора менеджером",
};

const TARIFF_LABELS: Record<string, string> = {
  basic: "Базовый",
  standard: "Стандарт",
  premium: "Премиум",
  premium_ijs: "Премиум ИЖС",
  not_defined: "Не определён",
};

const TEMPERATURE_LABELS: Record<string, string> = {
  hot: "🔥 Горячий",
  warm: "🌤 Тёплый",
  cold: "🧊 Холодный",
  info: "ℹ️ Информационный",
};

function buildAiBrief(q: QualificationData, score: number, temperature: string): string {
  const lines: string[] = [
    "═══════════════ AI-БРИФ ИНОБР ═══════════════",
    "",
    "📋 ПРОФИЛЬ",
    `   Опыт: ${EXPERIENCE_LABELS[q.experience_area] ?? q.experience_area}`,
    `   Стаж: ${YEARS_LABELS[q.experience_years] ?? q.experience_years}`,
    `   Образование: ${EDUCATION_LABELS[q.education_type] ?? q.education_type}`,
    "",
    "🎯 ЦЕЛЬ",
    `   ${GOAL_LABELS[q.goal] ?? q.goal}`,
    "",
    "📚 ОГРАНИЧЕНИЕ ПО ОБРАЗОВАНИЮ",
    q.education_type === "school_only"
      ? "   ⚠️ Только аттестат — ССТЭ / ДПО недоступны"
      : q.education_type === "need_clarification"
      ? "   ❓ Образование требует уточнения"
      : "   ✅ Образование позволяет рассматривать программы ДПО",
    "",
    "🏆 ПРЕДВАРИТЕЛЬНАЯ РЕКОМЕНДАЦИЯ",
    `   Трек: ${TRACK_LABELS[q.recommended_track] ?? q.recommended_track}`,
    `   Тариф: ${TARIFF_LABELS[q.recommended_tariff] ?? q.recommended_tariff}`,
    `   Рассрочка: ${q.installment_interest ? "Интересует" : "Не уточнялось"}`,
    "",
    "❓ ГЛАВНЫЙ ВОПРОС",
    `   ${q.main_question || "Не зафиксирован"}`,
    "",
    "🚧 ГЛАВНОЕ ВОЗРАЖЕНИЕ",
    `   ${q.main_objection === "none" ? "Явного возражения нет" : q.main_objection}`,
    "",
    "📱 СВЯЗЬ",
    `   Канал: ${q.contact_channel}`,
    `   Готовность: ${q.start_readiness}`,
    "",
    "🌡️ ТЕМПЕРАТУРА ЛИДА",
    `   ${TEMPERATURE_LABELS[temperature] ?? temperature} (score: ${score})`,
    "",
    "👤 РЕКОМЕНДАЦИЯ МЕНЕДЖЕРУ",
    `   ${q.manager_note || "—"}`,
    "",
    "═════════════════════════════════════════════",
  ];

  return lines.join("\n");
}

// ─── Service ──────────────────────────────────────────────────────────────────

class LeadQualificationService {
  async processAndSave(params: {
    rawJson: string;
    conversationId: string;
    contactId?: string;
  }): Promise<ScoredLead> {
    const { rawJson, conversationId, contactId } = params;

    const qualification = parseQualification(rawJson);
    const { score, temperature } = calculateScore(qualification);
    const aiBrief = buildAiBrief(qualification, score, temperature);

    logger.info(
      { conversationId, score, temperature, track: qualification.recommended_track },
      "Lead qualified"
    );

    const [lead] = await db
      .insert(aiLeads)
      .values({
        conversationId,
        contactId: contactId ?? null,
        leadScore: score,
        leadTemperature: temperature,
        recommendedTrack: qualification.recommended_track,
        recommendedTariff: qualification.recommended_tariff,
        mainQuestion: qualification.main_question,
        mainObjection: qualification.main_objection,
        aiBrief,
      })
      .returning();

    return {
      leadId: lead.id,
      leadScore: score,
      leadTemperature: temperature,
      qualification,
      aiBrief,
    };
  }
}

export const leadQualificationService = new LeadQualificationService();
