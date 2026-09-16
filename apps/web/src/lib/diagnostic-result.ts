import { apiFetch } from "./api";

export interface StructuredDiagnosticResult {
  summary: string;
  currentArea: string;
  currentRole: string;
  education: string;
  targetTasks: string;
  recommendation: string;
  recommendedTrack: "construction_expertise" | "apartment_acceptance" | "not_defined";
  importantNote: string | null;
}

export interface DiagnoseResponse {
  result: string;
  structuredResult: StructuredDiagnosticResult;
  isAI: boolean;
  provider: "yandex" | "fallback";
  sourceVersion: string;
  fallbackReason: string | null;
}

export interface DiagnosticPayload {
  conversationId: string;
  current_area: string;
  current_area_other_text?: string;
  current_role: string;
  education_status: string;
  target_tasks: string;
}

export const DIAGNOSTIC_ERROR = "Не удалось сформировать результат диагностики. Попробуйте ещё раз.";

function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(DIAGNOSTIC_ERROR);
  return value as Record<string, unknown>;
}

function text(value: unknown): string {
  if (typeof value !== "string" || !value.trim()) throw new Error(DIAGNOSTIC_ERROR);
  return value;
}

export function parseDiagnoseResponse(value: unknown): DiagnoseResponse {
  const response = record(value);
  const result = record(response.structuredResult);
  const track = result.recommendedTrack;
  const provider = response.provider;
  if ((track !== "construction_expertise" && track !== "apartment_acceptance" && track !== "not_defined") ||
    (provider !== "yandex" && provider !== "fallback") || typeof response.isAI !== "boolean") {
    throw new Error(DIAGNOSTIC_ERROR);
  }
  return {
    result: text(response.result),
    structuredResult: {
      summary: text(result.summary), currentArea: text(result.currentArea),
      currentRole: text(result.currentRole), education: text(result.education),
      targetTasks: text(result.targetTasks), recommendation: text(result.recommendation),
      recommendedTrack: track,
      importantNote: result.importantNote === null ? null : text(result.importantNote),
    },
    isAI: response.isAI,
    provider,
    sourceVersion: text(response.sourceVersion),
    fallbackReason: response.fallbackReason === null ? null : text(response.fallbackReason),
  };
}

/** Persist answers first. A failed save must never trigger generation. */
export async function completeDiagnostic(
  payload: DiagnosticPayload,
  saveAnswers: (payload: DiagnosticPayload) => Promise<unknown> = async value => {
    const response = await apiFetch("/api/diagnostic-answers", { method: "POST",
      headers: { "Content-Type": "application/json" }, body: JSON.stringify(value) });
    if (!response.ok) throw new Error(DIAGNOSTIC_ERROR);
    return response.json();
  },
): Promise<DiagnoseResponse> {
  await saveAnswers(payload);
  const response = await apiFetch("/api/diagnose", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ conversationId: payload.conversationId }),
  });
  if (!response.ok) throw new Error(DIAGNOSTIC_ERROR);
  return parseDiagnoseResponse(await response.json());
}
