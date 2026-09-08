import type { DiagnosticGoal, EducationType, ExperienceArea, ExperienceYears } from "../diagnostic/diagnostic-types";

export interface ConsultantDiagnosticContext {
  experienceArea?: ExperienceArea;
  experienceYears?: ExperienceYears;
  educationType?: EducationType;
  goal?: DiagnosticGoal;
  recommendedTrack?: "construction_expertise" | "apartment_acceptance" | "not_defined";
}

export interface ConsultantInput {
  question: string;
  diagnosticContext?: ConsultantDiagnosticContext;
}

export interface ConsultantSection {
  id: string;
  title: string;
  content: string;
  sources: readonly string[];
  keywords: readonly string[];
}

export interface ConsultantRetrievalPacket {
  matchedSections: {
    id: string;
    title: string;
    content: string;
    score: number;
    reason: string[];
  }[];
  contextSummary: string;
  sourceVersion: string;
}

export class ConsultantValidationError extends Error {
  readonly code = "CONSULTANT_VALIDATION_ERROR";
  constructor() { super("Invalid consultant input."); this.name = "ConsultantValidationError"; }
}
