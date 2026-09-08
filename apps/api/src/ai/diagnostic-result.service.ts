import { DiagnosticKnowledgeResolver, type DiagnosticAnswers } from "@workspace/domain/diagnostic";
import type { AIProvider } from "./provider";
import { selectDiagnosticFacts } from "./diagnostic-result.prompt";
import {
  DiagnosticAIError, hasSchoolGuard, validateDiagnosticResult,
  type DiagnosticAIErrorCode, type DiagnosticAIResult, type DiagnosticFactsPacket,
} from "./diagnostic-result.types";

export function generateDiagnosticFallback(facts: DiagnosticFactsPacket): DiagnosticAIResult {
  const schoolGuard = hasSchoolGuard(facts);
  let recommendedTrack = facts.recommendedTrackHint ?? "not_defined";
  if (schoolGuard && recommendedTrack === "construction_expertise") recommendedTrack = "not_defined";
  const recommendation = recommendedTrack === "apartment_acceptance"
    ? "Рекомендуем рассмотреть направление приёмки квартир с учётом вашего опыта, образования и цели."
    : recommendedTrack === "construction_expertise"
      ? "Рекомендуем рассмотреть программу «Стройэксперт». При персональной рекомендации учитываются ваш практический опыт и цель."
      : schoolGuard
        ? "Сначала необходимо получить среднее профессиональное или высшее образование. Программу ДПО «Стройэксперт» сейчас рекомендовать нельзя."
        : "Для выбора программы необходимо уточнить образование, практический опыт и цель. Направление пока не определено.";
  return {
    summary: "Результат составлен на основе четырёх ответов и проверенных правил ИНОБР.",
    experience: facts.experience,
    experienceYears: facts.experienceYears,
    education: facts.education,
    goal: facts.goal,
    recommendation,
    recommendedTrack,
    importantNote: schoolGuard
      ? "Для поступления на программу ДПО требуется среднее профессиональное или высшее образование. Школьного образования недостаточно."
      : null,
  };
}

export interface DiagnosticResultOutcome {
  result: DiagnosticAIResult;
  source: "ai" | "fallback";
  failureReason?: DiagnosticAIErrorCode;
}

export class DiagnosticResultService {
  constructor(private readonly provider: AIProvider) {}

  async generateDiagnosticResult(answers: DiagnosticAnswers): Promise<DiagnosticResultOutcome> {
    // Invalid answers are domain errors, not provider failures to hide with fallback.
    const resolved = DiagnosticKnowledgeResolver.resolve(answers);
    const facts = DiagnosticKnowledgeResolver.buildFactsPacket(resolved);
    return this.generate(facts);
  }

  /** Accepts the verified packet produced by DiagnosticKnowledgeResolver. */
  async generate(input: DiagnosticFactsPacket): Promise<DiagnosticResultOutcome> {
    const facts = selectDiagnosticFacts(input);
    try {
      const result = await this.provider.generateDiagnosticResult(
        selectDiagnosticFacts(facts),
      );
      return { result: validateDiagnosticResult(result, facts), source: "ai" };
    } catch (error) {
      return {
        result: generateDiagnosticFallback(facts),
        source: "fallback",
        failureReason: error instanceof DiagnosticAIError ? error.code : "AI_REQUEST_FAILED",
      };
    }
  }
}
