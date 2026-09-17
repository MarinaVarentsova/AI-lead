import { apiFetch } from "./api";

export interface StructuredDiagnosticResult {
  recommendation: string;
  recommendedTrack: "construction_expertise" | "apartment_acceptance" | "not_defined";
}

export interface DiagnoseResponse {
  structuredResult: StructuredDiagnosticResult;
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
  if (track !== "construction_expertise" && track !== "apartment_acceptance" && track !== "not_defined") {
    throw new Error(DIAGNOSTIC_ERROR);
  }
  return {
    structuredResult: { recommendation: text(result.recommendation), recommendedTrack: track },
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

/** Generate only after the turn endpoint has confirmed all four answers. */
export async function completePersistedDiagnostic(conversationId: string): Promise<DiagnoseResponse> {
  const response = await apiFetch("/api/diagnose", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ conversationId }),
  });
  if (!response.ok) throw new Error(DIAGNOSTIC_ERROR);
  return parseDiagnoseResponse(await response.json());
}
