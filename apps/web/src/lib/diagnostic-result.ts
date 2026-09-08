export interface StructuredDiagnosticResult {
  summary: string;
  experience: string;
  experienceYears: string;
  education: string;
  goal: string;
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
  experienceArea: string;
  experienceAreaRaw: string;
  experienceYears: string;
  experienceYearsRaw: string;
  educationType: string;
  educationTypeRaw: string;
  goal: string;
  goalRaw: string;
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
      summary: text(result.summary), experience: text(result.experience),
      experienceYears: text(result.experienceYears), education: text(result.education),
      goal: text(result.goal), recommendation: text(result.recommendation),
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
  saveAnswers: (payload: DiagnosticPayload) => Promise<unknown>,
): Promise<DiagnoseResponse> {
  await saveAnswers(payload);
  const response = await fetch("/api/diagnose", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ conversationId: payload.conversationId }),
  });
  if (!response.ok) throw new Error(DIAGNOSTIC_ERROR);
  return parseDiagnoseResponse(await response.json());
}
