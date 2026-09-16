export const DIAGNOSTIC_SCHEMA = [
  { questionNumber: 1, field: "current_area", questionText: "В какой сфере вы сейчас работаете?", options: [
    { code: "construction_repair", label: "Строительство и ремонт", allowsFreeText: false },
    { code: "design_estimates", label: "Проектирование и сметы", allowsFreeText: false },
    { code: "construction_control", label: "Строительный контроль", allowsFreeText: false },
    { code: "real_estate_valuation_law", label: "Недвижимость, оценка или право", allowsFreeText: false },
    { code: "other", label: "Другая сфера", allowsFreeText: true },
  ] },
  { questionNumber: 2, field: "current_role", questionText: "Какая у вас роль?", options: [
    { code: "engineer_designer_estimator", label: "Инженер, проектировщик или сметчик", allowsFreeText: false },
    { code: "foreman_master_site_specialist", label: "Прораб, мастер или специалист на объекте", allowsFreeText: false },
    { code: "manager_owner", label: "Руководитель или владелец компании", allowsFreeText: false },
    { code: "valuer_lawyer_expert", label: "Оценщик, юрист или эксперт", allowsFreeText: false },
    { code: "not_in_construction", label: "В строительстве пока не работаю", allowsFreeText: false },
  ] },
  { questionNumber: 3, field: "education_status", questionText: "Какое у вас образование?", options: [
    { code: "higher", label: "Высшее", allowsFreeText: false },
    { code: "secondary_vocational", label: "Среднее профессиональное", allowsFreeText: false },
    { code: "currently_studying", label: "Сейчас учусь в вузе или колледже", allowsFreeText: false },
    { code: "no_higher_or_secondary_vocational", label: "Ни высшего, ни среднего профессионального нет", allowsFreeText: false },
  ] },
  { questionNumber: 4, field: "target_tasks", questionText: "С какими задачами вы хотите работать?", options: [
    { code: "defects_quality", label: "Дефекты и качество строительных работ", allowsFreeText: false },
    { code: "damage_loss", label: "Заливы, пожары и оценка ущерба", allowsFreeText: false },
    { code: "apartment_house_acceptance", label: "Приёмка квартир и домов", allowsFreeText: false },
    { code: "judicial_construction_expertise", label: "Судебные строительно-технические экспертизы", allowsFreeText: false },
    { code: "explore", label: "Пока хочу разобраться", allowsFreeText: false },
  ] },
] as const;

export type DiagnosticQuestion = typeof DIAGNOSTIC_SCHEMA[number];
export type DiagnosticField = DiagnosticQuestion["field"];
export type CurrentArea = typeof DIAGNOSTIC_SCHEMA[0]["options"][number]["code"];
export type CurrentRole = typeof DIAGNOSTIC_SCHEMA[1]["options"][number]["code"];
export type EducationStatus = typeof DIAGNOSTIC_SCHEMA[2]["options"][number]["code"];
export type TargetTasks = typeof DIAGNOSTIC_SCHEMA[3]["options"][number]["code"];
export const CURRENT_AREA_CODES = DIAGNOSTIC_SCHEMA[0].options.map(option => option.code) as readonly CurrentArea[];
export const CURRENT_ROLE_CODES = DIAGNOSTIC_SCHEMA[1].options.map(option => option.code) as readonly CurrentRole[];
export const EDUCATION_STATUS_CODES = DIAGNOSTIC_SCHEMA[2].options.map(option => option.code) as readonly EducationStatus[];
export const TARGET_TASKS_CODES = DIAGNOSTIC_SCHEMA[3].options.map(option => option.code) as readonly TargetTasks[];
export function diagnosticOptionLabel(field: DiagnosticField, code: string): string | undefined {
  return DIAGNOSTIC_SCHEMA.find(question => question.field === field)?.options
    .find(option => option.code === code)?.label;
}
