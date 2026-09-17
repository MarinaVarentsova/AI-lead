import type { CurrentArea, CurrentRole, EducationStatus, TargetTasks } from "../diagnostic/diagnostic-schema";
export interface ConsultantDiagnosticContext {
  program?: import("../diagnostic/program-routing").ArtemProgram;
  currentArea?: CurrentArea; currentRole?: CurrentRole; educationStatus?: EducationStatus; targetTasks?: TargetTasks;
  recommendedTrack?: "construction_expertise" | "apartment_acceptance" | "not_defined";
}
export interface ConsultantInput { question: string; diagnosticContext?: ConsultantDiagnosticContext }
export interface ConsultantSection { id: string; title: string; content: string; sources: readonly string[]; keywords: readonly string[] }
export type ConsultantIntent = "relevant_training_question" | "small_talk" | "off_topic" | "abusive_or_trolling" | "genuine_unknown_program_fact";
export interface ConsultantRetrievalPacket {
  matchedSections: { id: string; title: string; content: string; score: number; reason: string[] }[];
  contextSummary: string; sourceVersion: string; intent: ConsultantIntent;
}
export class ConsultantValidationError extends Error {
  readonly code = "CONSULTANT_VALIDATION_ERROR";
  constructor() { super("Invalid consultant input."); this.name = "ConsultantValidationError"; }
}
