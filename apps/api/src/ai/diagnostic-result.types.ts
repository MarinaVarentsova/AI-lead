import type { DiagnosticFactsPacket } from "@workspace/domain/diagnostic";
import { diagnosticProgram, PROGRAM_NAMES } from "./artem-policy";

export type { DiagnosticFactsPacket };

export interface DiagnosticAIResult {
  summary: string;
  currentArea: string;
  currentRole: string;
  education: string;
  targetTasks: string;
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
    code === "no_professional_education" && severity === "hard");
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
  if (facts.recommendedTrackHint === "construction_expertise" && !hasSchoolGuard(facts) && track !== "construction_expertise") {
    return invalid();
  }
  if (facts.recommendedTrackHint === "apartment_acceptance" && track !== "apartment_acceptance") return invalid();
  if (track !== "construction_expertise" && track !== "apartment_acceptance" && track !== "not_defined") {
    return invalid();
  }
  if (track === "construction_expertise" &&
    (hasSchoolGuard(facts) || facts.recommendedTrackHint !== "construction_expertise")) {
    return invalid();
  }
  const recommendation = readText("recommendation");
  const normalize = (text: string) => text.toLowerCase().replace(/ё/g, "е").replace(/приемку/g, "приемка").replace(/[«»".,;:!?]/g, "").replace(/\s+/g, " ").trim();
  const publicText = normalize(recommendation);
  if (!normalize(recommendation.split(/[.!?]/)[0] ?? "").includes(normalize(PROGRAM_NAMES[diagnosticProgram(facts)]))) return invalid();
  const confirmed = [facts.currentArea, facts.currentRole, facts.education, facts.targetTasks]
    .filter(fact => publicText.includes(normalize(fact)));
  if (confirmed.length < 2 || confirmed.length > 3 || !publicText.includes(normalize(PROGRAM_NAMES[diagnosticProgram(facts)])) ||
    !/дефект|документац|исследова|заключени|осмотр|проверк|стройк|подрядчик/i.test(recommendation) ||
    !/Связаться с менеджером|уточни/i.test(recommendation) ||
    /для уточнения программы и условий/i.test(recommendation)) return invalid();
  if (facts.answerCodes.educationStatus === "currently_studying" &&
    !/начать обучение.*сейчас|сейчас.*начать обучение/i.test(recommendation)) return invalid();
  if (facts.answerCodes.educationStatus === "currently_studying" &&
    !/выпускн[а-я]* документ[а-я]*.*после.*диплом/i.test(recommendation)) return invalid();
  if (["summary", "currentArea", "currentRole", "education", "targetTasks", "recommendation"].some(key =>
    /Пользователь имеет|Рекомендация должна|recommendedTrack|education_status|target_tasks/i.test(readText(key)))) return invalid();
  if (/Пользователь имеет|Рекомендация должна учитывать/iu.test(recommendation) ||
    !/(?:у вас|ваш|вам|в вашем|с вашим)/iu.test(recommendation)) {
    return invalid();
  }
  return {
    summary: readText("summary"),
    currentArea: readText("currentArea"),
    currentRole: readText("currentRole"),
    education: readText("education"),
    targetTasks: readText("targetTasks"),
    recommendation,
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
