import type { DiagnosticAIResult } from "./diagnostic-result.types";
export function formatDiagnosticResult(result: DiagnosticAIResult): string {
  return result.recommendation;
}

