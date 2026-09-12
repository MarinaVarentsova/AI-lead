export const verdictLabel = (value: string) => ({ PASS: "ПРОЙДЕН", REVIEW: "ТРЕБУЕТ ВНИМАНИЯ", FAIL: "ПРОВАЛ", TECH_ERROR: "ТЕХНИЧЕСКАЯ ОШИБКА" }[value] ?? "ОЖИДАНИЕ ОЦЕНКИ");
export const runStatusLabel = (value: string) => ({ running: "Выполняется", completed: "Завершена", failed: "Прервана" }[value] ?? "Ожидание");
export const errorLabel = (value: string) => ({
  AI_SUMMARY_UNAVAILABLE: "Итоговое заключение AI недоступно",
  NO_EVALUATED_CASES: "Нет успешно оценённых сценариев. Итоговое заключение AI недоступно.",
  CASE_EXECUTION_OR_EVALUATION_FAILED: "Не удалось выполнить или оценить сценарий.",
  AI_CONFIGURATION_ERROR: "AI-оценщик не настроен.", AI_REQUEST_TIMEOUT: "Превышено время ожидания AI-оценки.",
  AI_REQUEST_FAILED: "Не удалось получить AI-оценку.", AI_INVALID_RESULT: "AI вернул некорректную оценку.",
  RUN_INTERRUPTED: "Серия прервана. Запустите новую серию вручную.", RUN_STORAGE_FAILED: "Не удалось сохранить результаты серии.",
}[value] ?? "Не удалось выполнить или оценить сценарий.");
export const areaLabel = (value: string) => ({ knowledge_base: "База знаний", diagnostic_rules: "Правила диагностики", consultant_prompt: "Инструкция консультанта", retrieval: "Поиск по базе знаний", funnel: "Воронка", ui: "Интерфейс" }[value] ?? "Слой требует уточнения");
export const severityLabel = (value: string) => ({ high: "Высокая", medium: "Средняя", low: "Низкая" }[value] ?? "Не указана");
export interface RunAssessmentView {
  executiveSummary: string; overallScore: number; qualificationScore: number; knowledgeGroundingScore: number; salesFunnelScore: number;
  systemicProblems: { title: string; severity: string; evidenceCaseNumbers: number[]; description: string; businessImpact: string }[];
  strengths: string[];
  recommendedChanges: { priority: number; area: string; problem: string; change: string; expectedEffect: string }[];
  doNotChange: string[]; codexTask: string;
}
