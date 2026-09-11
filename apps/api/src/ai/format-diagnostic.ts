import type { DiagnosticAIResult } from "./diagnostic-result.types";
export function formatDiagnosticResult(result: DiagnosticAIResult): string {
  return [
    result.summary,
    `Ваш опыт: ${result.experience}`,
    `Стаж: ${result.experienceYears}`,
    `Образование: ${result.education}`,
    `Ваша цель: ${result.goal}`,
    `Рекомендация: ${result.recommendation}`,
    ...(result.importantNote ? [`Важно: ${result.importantNote}`] : []),
  ].join("\n\n");
}

