import type { DiagnosticAIResult } from "./diagnostic-result.types";
export function formatDiagnosticResult(result: DiagnosticAIResult): string {
  return [
    result.summary,
    `Текущая сфера: ${result.currentArea}`,
    `Роль: ${result.currentRole}`,
    `Образование: ${result.education}`,
    `Желаемые задачи: ${result.targetTasks}`,
    `Рекомендация: ${result.recommendation}`,
    ...(result.importantNote ? [`Важно: ${result.importantNote}`] : []),
  ].join("\n\n");
}

