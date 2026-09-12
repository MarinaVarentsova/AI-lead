export const verdictLabel = (value: string) => ({ PASS: "ПРОЙДЕН", REVIEW: "ТРЕБУЕТ ВНИМАНИЯ", FAIL: "ПРОВАЛ ПО КАЧЕСТВУ", TECH_ERROR: "ТЕХНИЧЕСКАЯ ОШИБКА" }[value] ?? "ОЖИДАНИЕ ОЦЕНКИ");
export const runStatusLabel = (value: string) => ({ running: "Выполняется", completed: "Завершена", failed: "Прервана" }[value] ?? "Ожидание");
export const errorLabel = (value: string) => ({
  AI_SUMMARY_UNAVAILABLE: "Итог сформирован резервным способом",
  NO_EVALUATED_CASES: "Нет успешно оценённых сценариев. Итог сформирован по техническим результатам.",
  CASE_EXECUTION_OR_EVALUATION_FAILED: "Не удалось выполнить или оценить сценарий.",
  AI_CONFIGURATION_ERROR: "AI-оценщик не настроен.", AI_REQUEST_TIMEOUT: "Превышено время ожидания AI-оценки.",
  AI_REQUEST_FAILED: "Не удалось получить AI-оценку.", AI_INVALID_RESULT: "AI вернул некорректную оценку.",
  RUN_INTERRUPTED: "Серия прервана. Запустите новую серию вручную.", RUN_STORAGE_FAILED: "Не удалось сохранить результаты серии.",
}[value] ?? "Не удалось выполнить или оценить сценарий.");
export const areaLabel = (value: string) => ({ knowledge_base: "База знаний", behavior_instruction: "Поведенческая инструкция", diagnostic_rules: "Правила диагностики", consultant_prompt: "Промпт консультанта", retrieval: "Поиск по базе знаний", funnel: "Воронка", ui: "Интерфейс" }[value] ?? "Слой требует уточнения");
export const severityLabel = (value: string) => ({ high: "Высокая", medium: "Средняя", low: "Низкая" }[value] ?? "Не указана");
export const scoreStatus = (score: number | null | undefined) => score == null ? "Нет оценки" :
  score >= 90 ? "Отлично" : score >= 80 ? "Хорошо, есть точки роста" : score >= 70 ? "Требует улучшения" : "Критично";
export const criterionLabel = (value: string) => ({
  qualification: "Квалификация кандидата", recommendedTrack: "Точность выбора программы",
  conversion: "Конверсионная логика", personalization: "Персонализация",
  grounding: "Опора на базу знаний", noHallucinations: "Отсутствие выдумок",
  objections: "Работа с возражениями", sales: "Продажа через пользу",
  cta: "Качество CTA", tone: "Тон общения",
  noRepeatedQuestions: "Нет повторных вопросов", maxQuestions: "Соблюдение лимита вопросов",
}[value] ?? "Критерий");
export interface RunAssessmentView {
  executiveSummary: string; overallScore: number | null; qualificationScore: number | null; knowledgeGroundingScore: number | null; salesFunnelScore: number | null;
  criterionScores: Record<string, number | null>;
  systemicProblems: { title: string; severity: string; evidenceCaseNumbers: number[]; frequency: number; evaluatedCases: number; description: string; businessImpact: string }[];
  strengths: string[];
  recommendedChanges: { priority: number; area: string; target: string; problem: string; evidenceCaseNumbers: number[]; frequency: number; evaluatedCases: number; change: string; expectedEffect: string; requiresBusinessDecision: boolean }[];
  recommendationsForKnowledgeBase: { section: string; currentGap: string; recommendedAddition: string; evidenceCaseNumbers: number[]; priority: string; requiresProductDecision: boolean }[];
  trainingRules: string[]; doNotChange: string[]; codexTask: string;
}
