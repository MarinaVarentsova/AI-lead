import type { DiagnosticAIResult, DiagnosticFactsPacket } from "./diagnostic-result.types";

export interface AIProvider {
  generateDiagnosticResult(input: DiagnosticFactsPacket): Promise<DiagnosticAIResult>;
}
