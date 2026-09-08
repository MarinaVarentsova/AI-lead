import type { DiagnosticFactsPacket } from "@workspace/domain/diagnostic";

export type { DiagnosticFactsPacket };

export interface DiagnosticAIResult {
  summary: string;
  experience: string;
  experienceYears: string;
  education: string;
  goal: string;
  recommendation: string;
  recommendedTrack: "construction_expertise" | "apartment_acceptance" | "not_defined";
  importantNote: string | null;
}

export type DiagnosticAIErrorCode =
  | "AI_CONFIGURATION_ERROR"
  | "AI_REQUEST_FAILED"
  | "AI_REQUEST_TIMEOUT"
  | "AI_INVALID_RESULT";

/** Safe to report: never includes credentials, response bodies or user input. */
export class DiagnosticAIError extends Error {
  constructor(readonly code: DiagnosticAIErrorCode) {
    super(code);
    this.name = "DiagnosticAIError";
  }
}

export function hasSchoolGuard(facts: DiagnosticFactsPacket): boolean {
  return facts.guards.some(({ code, severity }) =>
    code === "school_only_no_dpo" && severity === "hard");
}

export function validateDiagnosticResult(value: unknown, facts: DiagnosticFactsPacket): DiagnosticAIResult {
  const invalid = (): never => { throw new DiagnosticAIError("AI_INVALID_RESULT"); };
  if (!value || typeof value !== "object" || Array.isArray(value)) return invalid();
  const record = value as Record<string, unknown>;
  const readText = (key: string): string => {
    const text = record[key];
    return typeof text === "string" && text.trim() ? text.trim() : invalid();
  };
  const track = record.recommendedTrack;
  if (track !== "construction_expertise" && track !== "apartment_acceptance" && track !== "not_defined") {
    return invalid();
  }
  if (track === "construction_expertise" &&
    (hasSchoolGuard(facts) || facts.recommendedTrackHint !== "construction_expertise")) {
    return invalid();
  }
  return {
    summary: readText("summary"),
    experience: readText("experience"),
    experienceYears: readText("experienceYears"),
    education: readText("education"),
    goal: readText("goal"),
    recommendation: readText("recommendation"),
    recommendedTrack: track,
    importantNote: record.importantNote === null ? null : readText("importantNote"),
  };
}

export function parseDiagnosticResult(text: string, facts: DiagnosticFactsPacket): DiagnosticAIResult {
  const trimmed = text.trim();
  const fenced = /^```(?:json)?\s*\n?([\s\S]*?)\n?```$/i.exec(trimmed);
  let value: unknown;
  try {
    value = JSON.parse(fenced ? fenced[1]! : trimmed);
  } catch {
    throw new DiagnosticAIError("AI_INVALID_RESULT");
  }
  return validateDiagnosticResult(value, facts);
}
