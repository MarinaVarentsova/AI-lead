export const EXPERIENCE_AREA_CODES = [
  "construction", "design", "supervision", "legal_expertise", "no_experience", "other",
] as const;
export const EXPERIENCE_YEARS_CODES = [
  "none", "up_to_3", "from_3_to_10", "more_than_10", "related_experience", "need_clarification",
] as const;
export const EDUCATION_TYPE_CODES = [
  "higher_technical", "secondary_technical", "non_profile", "school_only",
  "diploma_not_available", "need_clarification",
] as const;
export const GOAL_CODES = [
  "extra_income", "new_profession", "expand_services", "apartment_acceptance",
  "construction_expertise", "research_only",
] as const;

export type ExperienceArea = typeof EXPERIENCE_AREA_CODES[number];
export type ExperienceYears = typeof EXPERIENCE_YEARS_CODES[number];
export type EducationType = typeof EDUCATION_TYPE_CODES[number];
export type DiagnosticGoal = typeof GOAL_CODES[number];

export type DiagnosticAnswers = {
  experienceArea: string;
  experienceAreaRaw?: string | null;
  experienceYears: string;
  experienceYearsRaw?: string | null;
  educationType: string;
  educationTypeRaw?: string | null;
  goal: string;
  goalRaw?: string | null;
};

export const SOURCE_VERSION = "inobr-diagnostic-rules-v1" as const;

export type DiagnosticGuard = {
  code: "school_only_no_dpo";
  severity: "hard";
  rule: "Do not recommend SSTE/DPO as the primary training path.";
};
export type RecommendedTrackHint = "apartment_acceptance" | "construction_expertise" | null;
export type ResolvedAnswer<Code extends string> = { code: Code; raw: string | null };

export type ResolvedDiagnostic = {
  sourceVersion: typeof SOURCE_VERSION;
  answers: {
    experienceArea: ResolvedAnswer<ExperienceArea>;
    experienceYears: ResolvedAnswer<ExperienceYears>;
    educationType: ResolvedAnswer<EducationType>;
    goal: ResolvedAnswer<DiagnosticGoal>;
  };
  rules: {
    experience: string;
    experienceYears: string;
    education: string;
    goal: string;
  };
  guards: DiagnosticGuard[];
  recommendedTrackHint: RecommendedTrackHint;
};

export type DiagnosticFactsPacket = {
  sourceVersion: typeof SOURCE_VERSION;
  experience: string;
  experienceYears: string;
  education: string;
  goal: string;
  rawAnswers: {
    experienceArea: string | null;
    experienceYears: string | null;
    educationType: string | null;
    goal: string | null;
  };
  guards: DiagnosticGuard[];
  recommendedTrackHint: RecommendedTrackHint;
};

export type DiagnosticValidationIssue = {
  field: keyof DiagnosticAnswers | "answers";
  code: "invalid_input" | "required" | "unknown_code" | "invalid_raw";
};

/** Controlled input error; does not echo user input or contact data. */
export class DiagnosticValidationError extends Error {
  readonly code = "DIAGNOSTIC_VALIDATION_ERROR";
  readonly issues: readonly DiagnosticValidationIssue[];

  constructor(issues: DiagnosticValidationIssue[]) {
    super("Diagnostic answers failed validation.");
    this.name = "DiagnosticValidationError";
    this.issues = issues;
  }
}
