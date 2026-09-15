import type { DiagnosticGoal, EducationType, ExperienceArea, ExperienceYears } from "./diagnostic-types";

// Human descriptions of unchanged codes. Product policy comes from v2.2.
export const EXPERIENCE_AREA_RULES = Object.freeze({
  construction: "У вас есть опыт в строительстве или ремонте.",
  design: "Ваш опыт связан с проектированием или сметами.",
  supervision: "У вас есть опыт технадзора или строительного контроля.",
  legal_expertise: "Ваш опыт связан с юридической, оценочной или экспертной работой.",
  no_experience: "У вас пока нет практического опыта.",
  other: "Вы указали другую область опыта; её связь с будущими задачами пока неясна.",
} satisfies Record<ExperienceArea, string>);
export const EXPERIENCE_YEARS_RULES = Object.freeze({
  none: "Практического стажа у вас пока нет.",
  up_to_3: "Ваш стаж — до трёх лет.",
  from_3_to_10: "Ваш стаж — от трёх до десяти лет.",
  more_than_10: "Ваш стаж — более десяти лет.",
  related_experience: "Вы указали смежный опыт.",
  need_clarification: "Продолжительность вашего опыта требует уточнения.",
} satisfies Record<ExperienceYears, string>);
export const EDUCATION_TYPE_RULES = Object.freeze({
  higher_technical: "У вас есть высшее техническое или профильное образование.",
  secondary_technical: "У вас есть среднее профессиональное техническое или профильное образование.",
  non_profile: "У вас есть непрофильное СПО или высшее образование; его профиль не препятствует поступлению на «Стройэксперт».",
  school_only: "Вы указали школьное образование; для «Стройэксперта» нужно СПО или высшее образование.",
  diploma_not_available: "Статус вашего диплома пока неясен; это не означает, что СПО или высшего образования нет.",
  need_clarification: "Ваш уровень образования требует уточнения; пока возможен только условный вывод.",
} satisfies Record<EducationType, string>);
export const GOAL_RULES = Object.freeze({
  extra_income: "Вы хотите освоить дополнительную деятельность.",
  new_profession: "Ваша цель — освоить новую профессию.",
  expand_services: "Вы хотите расширить перечень услуг.",
  apartment_acceptance: "Ваша цель — осмотр и приёмка квартир.",
  construction_expertise: "Ваша цель — строительная экспертиза.",
  research_only: "Вы пока изучаете возможности обучения.",
} satisfies Record<DiagnosticGoal, string>);
