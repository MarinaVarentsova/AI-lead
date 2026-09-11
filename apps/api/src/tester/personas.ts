import { DiagnosticKnowledgeResolver, type DiagnosticAnswers, EDUCATION_TYPE_CODES, EXPERIENCE_YEARS_CODES } from "@workspace/domain/diagnostic";
export interface Persona { label: string; answers: DiagnosticAnswers; questions: string[] }
export function validateRunCount(value: unknown): number {
  if (!Number.isInteger(value) || (value as number) < 1 || (value as number) > 10) throw new Error("INVALID_CASE_COUNT");
  return value as number;
}
export function generatePersonas(count: number, random = Math.random): Persona[] {
  validateRunCount(count);
  const pick = <T>(items: readonly T[]) => items[Math.floor(random() * items.length)]!;
  const templates = [
    ["Опытный строитель", "construction", "more_than_10", "higher_technical", "expand_services", "Я уже много лет строитель. Зачем мне учиться?"],
    ["Непрофильный диплом", "other", "related_experience", "non_profile", "new_profession", "Можно ли поступить с экономическим дипломом?"],
    ["Без строительного опыта", "no_experience", "none", "non_profile", "new_profession", "У меня нет строительного опыта. Получится освоить программу?"],
    ["Проектировщик", "design", "from_3_to_10", "higher_technical", "expand_services", "Как экспертная работа дополнит мои услуги проектирования?"],
    ["Юрист или оценщик", "legal_expertise", "related_experience", "non_profile", "extra_income", "Можно потом работать судебным экспертом?"],
    ["Только аттестат", "no_experience", "none", "school_only", "construction_expertise", "У меня только аттестат. Что мне выбрать?"],
    ["Только приёмка квартир", "construction", "up_to_3", "secondary_technical", "apartment_acceptance", "Хочу только приёмку квартир. Чем она отличается от Стройэксперта?"],
    ["ИЖС", "supervision", "more_than_10", "secondary_technical", "expand_services", "Мне нужен строительный контроль ИЖС: длительно сопровождать стройку по этапам."],
    ["Пока изучает", "construction", "related_experience", "higher_technical", "research_only", "Кем быть в итоге, что выбрать?"],
    ["Дополнительная деятельность", "other", "up_to_3", "secondary_technical", "extra_income", "Где брать заказы после обучения?"],
  ];
  // Shuffle without replacement: each ten-case run covers all ten scenario families.
  for (let i = templates.length - 1; i > 0; i--) { const j = Math.floor(random() * (i + 1)); [templates[i], templates[j]] = [templates[j]!, templates[i]!]; }
  return templates.slice(0, count).map((t, i) => {
    const [label, experienceArea, experienceYears, educationType, goal, first] = t as [string,string,string,string,string,string];
    const answers = { experienceArea, experienceYears, educationType, goal };
    if (["Опытный строитель", "Проектировщик", "ИЖС", "Пока изучает"].includes(label)) {
      answers.educationType = pick(["higher_technical", "secondary_technical", "non_profile"]);
    }
    if (["Проектировщик", "Юрист или оценщик"].includes(label)) answers.experienceYears = pick(["related_experience", "from_3_to_10", "more_than_10"]);
    if (label === "Дополнительная деятельность") { answers.educationType = pick(EDUCATION_TYPE_CODES); answers.experienceYears = pick(EXPERIENCE_YEARS_CODES); }
    DiagnosticKnowledgeResolver.resolve(answers);
    const questions = [label === "ИЖС" && random() < .5 ? "Мне нужна разовая проверка частного дома перед покупкой, а не сопровождение стройки." : first];
    const total = 1 + Math.floor(random() * 3);
    if (total >= 2) questions.push(pick(["Сколько стоит это обучение и есть ли рассрочка?", "Какой документ выдаётся?", "Можно ли рассчитывать на трудоустройство?", "Как искать первых клиентов?"]));
    if (total === 3) questions.push(i % 3 === 0 ? "Вы гарантируете заказы и доход после обучения?" : pick(["Дорого. В чём практическая польза для моей ситуации?", "Я пока подумаю.", "Что мне выбрать с учётом моего опыта?"]));
    return { label, answers, questions };
  });
}
