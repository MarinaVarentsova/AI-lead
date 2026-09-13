import { DiagnosticKnowledgeResolver, type DiagnosticAnswers } from "@workspace/domain/diagnostic";
import type { AIProvider } from "./provider";
import { selectDiagnosticFacts } from "./diagnostic-result.prompt";
import {
  DiagnosticAIError, hasSchoolGuard, validateDiagnosticResult,
  type DiagnosticAIErrorCode, type DiagnosticAIResult, type DiagnosticFactsPacket,
} from "./diagnostic-result.types";

export function generateDiagnosticFallback(facts: DiagnosticFactsPacket): DiagnosticAIResult {
  const schoolGuard = hasSchoolGuard(facts);
  let recommendedTrack: DiagnosticAIResult["recommendedTrack"] = facts.recommendedTrackHint ?? "not_defined";
  if (schoolGuard && recommendedTrack === "construction_expertise") recommendedTrack = "not_defined";
  const experienceReason = facts.experience.startsWith("Практического опыта пока нет")
    ? "Отсутствие опыта не препятствует поступлению: начните с освоения основ, без ожидания готовности сразу работать экспертом."
    : facts.experience.startsWith("Есть практический опыт")
      ? "Ваш строительный опыт может стать базой для работы с дефектами объектов и технической документацией."
      : facts.experience;
  const goalReason = facts.goal.startsWith("Цель — расширить")
    ? "Для расширения услуг программа даёт возможность освоить смежную экспертную компетенцию."
    : facts.goal.startsWith("Цель — новая")
      ? "Для смены профессии это последовательный путь освоения экспертного направления."
      : facts.goal.startsWith("Цель — дополнительный")
        ? "Экспертное направление может дополнить текущую деятельность, но доход и заказы не гарантируются."
        : "Если Вы пока сравниваете варианты, ориентируйтесь на задачи с объектами, дефектами и документацией, которые хотите освоить.";
  const experienceBase = facts.experience.startsWith("Есть практический опыт в строительстве")
    ? "У вас уже есть практический опыт в строительстве"
    : facts.experience.startsWith("Опыт в проектировании")
      ? "У вас есть опыт в проектировании или сметах"
      : facts.experience.startsWith("Опыт технадзора")
        ? "У вас есть опыт технадзора или строительного контроля"
        : facts.experience.startsWith("Практического опыта пока нет")
          ? "У вас пока нет практического опыта, но обучение можно начать с последовательного освоения основ"
          : "У вас есть база, которую важно учитывать при выборе направления";
  const experienceYearsBase = facts.experienceYears.startsWith("Есть начальный практический опыт")
    ? " и начальный стаж до трёх лет"
    : facts.experienceYears.startsWith("Есть устойчивый практический опыт")
      ? " и стаж от трёх до десяти лет"
      : facts.experienceYears.startsWith("Есть значительный практический стаж")
        ? " и стаж более десяти лет"
        : "";
  const recommendation = recommendedTrack === "apartment_acceptance"
    ? `${experienceBase}${experienceYearsBase}. С учётом вашей цели рекомендую направление «Приёмка квартир». Это прикладной маршрут для освоения проверки качества квартиры.`
    : recommendedTrack === "construction_expertise"
      ? `${experienceBase}${experienceYearsBase}, а имеющееся СПО или ВО позволяет поступить на программу. С учётом вашей цели основным направлением я бы рекомендовал «Стройэксперт». ${experienceReason} ${goalReason}`
      : schoolGuard
        ? "У вас пока нет подтверждённого СПО или ВО, поэтому программа «Стройэксперт» сейчас недоступна. В вашем случае можно рассмотреть направление «Приёмка квартир», если оно соответствует вашей цели."
        : "В вашем случае нужно уточнить документ об образовании, прежде чем рекомендовать программу ДПО. После уточнения можно будет назвать конкретное направление.";
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
