import {
  EDUCATION_TYPE_RULES, EXPERIENCE_AREA_RULES, EXPERIENCE_YEARS_RULES, GOAL_RULES,
} from "./diagnostic-rules";
import {
  DiagnosticValidationError, SOURCE_VERSION,
  type DiagnosticAnswers, type DiagnosticFactsPacket, type DiagnosticValidationIssue,
  type ResolvedAnswer, type ResolvedDiagnostic,
} from "./diagnostic-types";

function readAnswer<Code extends string>(
  input: DiagnosticAnswers,
  field: "experienceArea" | "experienceYears" | "educationType" | "goal",
  rawField: "experienceAreaRaw" | "experienceYearsRaw" | "educationTypeRaw" | "goalRaw",
  rules: Readonly<Record<Code, string>>,
  issues: DiagnosticValidationIssue[],
): ResolvedAnswer<Code> | undefined {
  const code: unknown = Object.hasOwn(input, field) ? input[field] : undefined;
  const raw: unknown = Object.hasOwn(input, rawField) ? input[rawField] : undefined;
  let valid = true;
  if (code === undefined || code === null || code === "") {
    issues.push({ field, code: "required" });
    valid = false;
  } else if (typeof code !== "string" || !Object.hasOwn(rules, code)) {
    issues.push({ field, code: "unknown_code" });
    valid = false;
  }
  if (raw !== undefined && raw !== null && typeof raw !== "string") {
    issues.push({ field: rawField, code: "invalid_raw" });
    valid = false;
  }
  if (!valid) return undefined;
  // Membership was checked exactly; no trimming, inference or fallback is applied.
  return { code: code as Code, raw: typeof raw === "string" ? raw : null };
}

export class DiagnosticKnowledgeResolver {
  /** Throws DiagnosticValidationError for missing/invalid codes; returns exactly four rules. */
  static resolve(answers: DiagnosticAnswers): ResolvedDiagnostic {
    if (answers === null || typeof answers !== "object" || Array.isArray(answers)) {
      throw new DiagnosticValidationError([{ field: "answers", code: "invalid_input" }]);
    }
    const issues: DiagnosticValidationIssue[] = [];
    const experienceArea = readAnswer(answers, "experienceArea", "experienceAreaRaw", EXPERIENCE_AREA_RULES, issues);
    const experienceYears = readAnswer(answers, "experienceYears", "experienceYearsRaw", EXPERIENCE_YEARS_RULES, issues);
    const educationType = readAnswer(answers, "educationType", "educationTypeRaw", EDUCATION_TYPE_RULES, issues);
    const goal = readAnswer(answers, "goal", "goalRaw", GOAL_RULES, issues);
    if (!experienceArea || !experienceYears || !educationType || !goal) {
      throw new DiagnosticValidationError(issues);
    }

    const guards: ResolvedDiagnostic["guards"] = [];
    if (educationType.code === "school_only") {
      guards.push({
        code: "school_only_no_dpo",
        severity: "hard",
        rule: "Do not recommend SSTE/DPO as the primary training path.",
      });
    }
    let recommendedTrackHint: ResolvedDiagnostic["recommendedTrackHint"] = null;
    if (goal.code === "apartment_acceptance") {
      recommendedTrackHint = "apartment_acceptance";
    } else if (
      goal.code === "construction_expertise" &&
      (educationType.code === "higher_technical" || educationType.code === "secondary_technical")
    ) {
      recommendedTrackHint = "construction_expertise";
    }
    return {
      sourceVersion: SOURCE_VERSION,
      answers: { experienceArea, experienceYears, educationType, goal },
      rules: {
        experience: EXPERIENCE_AREA_RULES[experienceArea.code],
        experienceYears: EXPERIENCE_YEARS_RULES[experienceYears.code],
        education: EDUCATION_TYPE_RULES[educationType.code],
        goal: GOAL_RULES[goal.code],
      },
      guards,
      recommendedTrackHint,
    };
  }

  static buildFactsPacket(resolvedDiagnostic: ResolvedDiagnostic): DiagnosticFactsPacket {
    return buildFactsPacket(resolvedDiagnostic);
  }
}

/** Explicit allowlist: never spreads input objects or copies contact fields. */
export function buildFactsPacket(resolved: ResolvedDiagnostic): DiagnosticFactsPacket {
  return {
    sourceVersion: resolved.sourceVersion,
    experience: resolved.rules.experience,
    experienceYears: resolved.rules.experienceYears,
    education: resolved.rules.education,
    goal: resolved.rules.goal,
    rawAnswers: {
      experienceArea: resolved.answers.experienceArea.raw,
      experienceYears: resolved.answers.experienceYears.raw,
      educationType: resolved.answers.educationType.raw,
      goal: resolved.answers.goal.raw,
    },
    guards: resolved.guards.map(({ code, severity, rule }) => ({ code, severity, rule })),
    recommendedTrackHint: resolved.recommendedTrackHint,
  };
}
