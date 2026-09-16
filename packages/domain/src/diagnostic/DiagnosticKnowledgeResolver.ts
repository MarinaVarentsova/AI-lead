import { CURRENT_AREA_CODES, CURRENT_ROLE_CODES, EDUCATION_STATUS_CODES, TARGET_TASKS_CODES, diagnosticOptionLabel,
  type CurrentArea, type CurrentRole, type EducationStatus, type TargetTasks } from "./diagnostic-schema";
import { DiagnosticValidationError, SOURCE_VERSION, type DiagnosticAnswers, type DiagnosticFactsPacket,
  type DiagnosticValidationIssue, type ResolvedDiagnostic } from "./diagnostic-types";

function readCode<Code extends string>(answers: DiagnosticAnswers, field: keyof DiagnosticAnswers,
  allowed: readonly Code[], issues: DiagnosticValidationIssue[]): Code | undefined {
  const value: unknown = Object.hasOwn(answers, field) ? answers[field] : undefined;
  if (value === undefined || value === null || value === "") { issues.push({ field, code: "required" }); return; }
  if (typeof value !== "string" || !allowed.includes(value as Code)) { issues.push({ field, code: "unknown_code" }); return; }
  return value as Code;
}

export class DiagnosticKnowledgeResolver {
  static resolve(answers: DiagnosticAnswers): ResolvedDiagnostic {
    if (!answers || typeof answers !== "object" || Array.isArray(answers)) {
      throw new DiagnosticValidationError([{ field: "answers", code: "invalid_input" }]);
    }
    const issues: DiagnosticValidationIssue[] = [];
    const currentArea = readCode(answers, "current_area", CURRENT_AREA_CODES, issues);
    const currentRole = readCode(answers, "current_role", CURRENT_ROLE_CODES, issues);
    const educationStatus = readCode(answers, "education_status", EDUCATION_STATUS_CODES, issues);
    const targetTasks = readCode(answers, "target_tasks", TARGET_TASKS_CODES, issues);
    const raw = answers.current_area_other_text;
    let otherText: string | null = null;
    if (currentArea === "other") {
      if (typeof raw !== "string" || !raw.trim()) issues.push({ field: "current_area_other_text", code: "required" });
      else if (raw.trim().length > 500) issues.push({ field: "current_area_other_text", code: "invalid_raw" });
      else otherText = raw.trim();
    } else if (raw !== undefined && raw !== null && raw !== "") issues.push({ field: "current_area_other_text", code: "unexpected" });
    if (!currentArea || !currentRole || !educationStatus || !targetTasks || issues.length) throw new DiagnosticValidationError(issues);

    const guards: ResolvedDiagnostic["guards"] = [];
    if (educationStatus === "no_higher_or_secondary_vocational") guards.push({ code: "no_professional_education", severity: "hard",
      rule: "Стройэксперт сейчас недоступен; основная стартовая альтернатива — Приёмка квартир." });
    if (educationStatus === "currently_studying") guards.push({ code: "completion_document_pending", severity: "conditional",
      rule: "Начать обучение можно; выпускные документы выдаются после предъявления оконченного диплома СПО или высшего образования." });
    const recommendedTrackHint = educationStatus === "no_higher_or_secondary_vocational" ? "apartment_acceptance" :
      targetTasks === "apartment_house_acceptance" ? null : "construction_expertise";
    const areaLabel = diagnosticOptionLabel("current_area", currentArea)!;
    return { sourceVersion: SOURCE_VERSION,
      answers: { currentArea: { code: currentArea, otherText }, currentRole: { code: currentRole },
        educationStatus: { code: educationStatus }, targetTasks: { code: targetTasks } },
      facts: {
        currentArea: currentArea === "other" ? `Ваша текущая сфера — ${otherText}.` : `Ваша текущая сфера — ${areaLabel}.`,
        currentRole: `Ваша роль — ${diagnosticOptionLabel("current_role", currentRole)!.toLowerCase()}.`,
        education: educationStatus === "currently_studying" ? "Вы сейчас учитесь в вузе или колледже." :
          educationStatus === "no_higher_or_secondary_vocational" ? "У вас пока нет высшего или среднего профессионального образования." :
          `У вас ${diagnosticOptionLabel("education_status", educationStatus)!.toLowerCase()} образование.`,
        targetTasks: `Вы хотите работать с задачами: ${diagnosticOptionLabel("target_tasks", targetTasks)!.toLowerCase()}.`,
      }, guards, recommendedTrackHint };
  }
  static buildFactsPacket(resolved: ResolvedDiagnostic): DiagnosticFactsPacket { return buildFactsPacket(resolved); }
}
export function buildFactsPacket(resolved: ResolvedDiagnostic): DiagnosticFactsPacket {
  return { sourceVersion: resolved.sourceVersion, ...resolved.facts,
    rawAnswers: { currentAreaOtherText: resolved.answers.currentArea.otherText },
    answerCodes: { currentArea: resolved.answers.currentArea.code, currentRole: resolved.answers.currentRole.code,
      educationStatus: resolved.answers.educationStatus.code, targetTasks: resolved.answers.targetTasks.code },
    guards: resolved.guards.map(guard => ({ ...guard })), recommendedTrackHint: resolved.recommendedTrackHint };
}
