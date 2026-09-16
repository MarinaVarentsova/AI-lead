import type { CurrentArea, CurrentRole, EducationStatus, TargetTasks } from "./diagnostic-schema";

export type DiagnosticAnswers = {
  current_area: string;
  current_area_other_text?: string | null;
  current_role: string;
  education_status: string;
  target_tasks: string;
};
export const SOURCE_VERSION = "inobr-artem-v3.0" as const;
export type ResolvedAnswer<Code extends string> = { code: Code };
export type DiagnosticGuard = { code: "no_professional_education" | "completion_document_pending";
  severity: "hard" | "conditional"; rule: string };
export type RecommendedTrackHint = "apartment_acceptance" | "construction_expertise" | null;
export type ResolvedDiagnostic = {
  sourceVersion: typeof SOURCE_VERSION;
  answers: {
    currentArea: ResolvedAnswer<CurrentArea> & { otherText: string | null };
    currentRole: ResolvedAnswer<CurrentRole>;
    educationStatus: ResolvedAnswer<EducationStatus>;
    targetTasks: ResolvedAnswer<TargetTasks>;
  };
  facts: { currentArea: string; currentRole: string; education: string; targetTasks: string };
  guards: DiagnosticGuard[];
  recommendedTrackHint: RecommendedTrackHint;
};
export type DiagnosticFactsPacket = {
  sourceVersion: typeof SOURCE_VERSION;
  currentArea: string; currentRole: string; education: string; targetTasks: string;
  rawAnswers: { currentAreaOtherText: string | null };
  answerCodes: { currentArea: CurrentArea; currentRole: CurrentRole; educationStatus: EducationStatus; targetTasks: TargetTasks };
  guards: DiagnosticGuard[];
  recommendedTrackHint: RecommendedTrackHint;
};
export type DiagnosticValidationIssue = { field: keyof DiagnosticAnswers | "answers";
  code: "invalid_input" | "required" | "unknown_code" | "invalid_raw" | "unexpected" };
export class DiagnosticValidationError extends Error {
  readonly code = "DIAGNOSTIC_VALIDATION_ERROR";
  constructor(readonly issues: readonly DiagnosticValidationIssue[]) {
    super("Diagnostic answers failed validation."); this.name = "DiagnosticValidationError";
  }
}
