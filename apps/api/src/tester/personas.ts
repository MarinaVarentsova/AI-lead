import { DiagnosticKnowledgeResolver, type DiagnosticAnswers, CURRENT_AREA_CODES, CURRENT_ROLE_CODES,
  EDUCATION_STATUS_CODES, TARGET_TASKS_CODES } from "@workspace/domain/diagnostic";
import type { TesterMode } from "./stress-modes";
export interface Persona {
  label: string; answers: DiagnosticAnswers; questions: string[];
  mode?: TesterMode; intent?: string; scenarioSeed?: string;
}
export function validateRunCount(value: unknown): number {
  if (!Number.isInteger(value) || (value as number) < 1 || (value as number) > 10) throw new Error("INVALID_CASE_COUNT");
  return value as number;
}
export function generatePersonas(count: number, random = Math.random): Persona[] {
  validateRunCount(count);
  const pick = <T>(items: readonly T[]) => items[Math.floor(random() * items.length)]!;
  const sharedCode = (codes: readonly string[], value: string) => {
    if (!codes.includes(value)) throw new Error("TESTER_SCHEMA_CODE_MISMATCH");
    return value;
  };
  const templates: [string, string, string, string, string, string][] = [
    ["Строитель: дефекты", "construction_repair", "foreman_master_site_specialist", "higher", "defects_quality", "Как обучение поможет работать с дефектами?"],
    ["Проектировщик", "design_estimates", "engineer_designer_estimator", "secondary_vocational", "judicial_construction_expertise", "Что даст программа проектировщику?"],
    ["Строительный контроль", "construction_control", "manager_owner", "higher", "defects_quality", "Как расширить задачи в контроле качества?"],
    ["Оценщик ущерба", "real_estate_valuation_law", "valuer_lawyer_expert", "higher", "damage_loss", "Подходит ли программа для оценки ущерба?"],
    ["Не в строительстве", "other", "not_in_construction", "secondary_vocational", "explore", "С чего начать без строительной практики?"],
    ["Сейчас учится", "other", "not_in_construction", "currently_studying", "defects_quality", "Можно ли начать обучение сейчас?"],
    ["Без СПО и высшего", "other", "not_in_construction", "no_higher_or_secondary_vocational", "judicial_construction_expertise", "Что доступно с моим образованием?"],
    ["Приёмка объектов", "construction_repair", "foreman_master_site_specialist", "secondary_vocational", "apartment_house_acceptance", "Хочу заниматься приёмкой квартир и домов. Что выбрать?"],
    ["Судебное направление", "real_estate_valuation_law", "valuer_lawyer_expert", "higher", "judicial_construction_expertise", "Можно потом работать судебным экспертом?"],
    ["Пока изучает", "design_estimates", "engineer_designer_estimator", "higher", "explore", "Что мне выбрать?"],
  ];
  for (let i = templates.length - 1; i >= 1; i--) { const j = Math.floor(random() * (i + 1)); [templates[i], templates[j]] = [templates[j]!, templates[i]!]; }
  return templates.slice(0, count).map((template, index) => {
    const [label, area, role, defaultEducation, tasks, first] = template;
    const current_area = sharedCode(CURRENT_AREA_CODES, area);
    const current_role = sharedCode(CURRENT_ROLE_CODES, role);
    const target_tasks = sharedCode(TARGET_TASKS_CODES, tasks);
    sharedCode(EDUCATION_STATUS_CODES, defaultEducation);
    const education_status = label === "Пока изучает" ? pick(EDUCATION_STATUS_CODES) : defaultEducation;
    const answers: DiagnosticAnswers = { current_area, current_role, education_status, target_tasks,
      ...(current_area === "other" ? { current_area_other_text: label === "Сейчас учится" ? "Другая сфера" : "Профессиональная сфера вне строительства" } : {}) };
    DiagnosticKnowledgeResolver.resolve(answers);
    const questions: string[] = [first];
    const total = 1 + Math.floor(random() * 3);
    if (total >= 2) questions.push(pick(["Сколько стоит это обучение и есть ли рассрочка?", "Какой документ выдаётся?", "Можно ли рассчитывать на трудоустройство?", "Как искать первых клиентов?"]));
    if (total === 3) questions.push(index % 3 === 0 ? "Вы гарантируете заказы и доход после обучения?" : pick(["Дорого. В чём практическая польза?", "Я пока подумаю.", "Что мне выбрать?"]));
    return { label, answers, questions };
  });
}
