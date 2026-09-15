import { DiagnosticKnowledgeResolver, type DiagnosticAnswers } from "@workspace/domain/diagnostic";
import type { AIProvider } from "./provider";
import { selectDiagnosticFacts } from "./diagnostic-result.prompt";
import { diagnosticProgram, PROGRAM_NAMES, BENEFITS } from "./artem-policy";
import { DiagnosticAIError, hasSchoolGuard, validateDiagnosticResult,
  type DiagnosticAIErrorCode, type DiagnosticAIResult, type DiagnosticFactsPacket } from "./diagnostic-result.types";

export function generateDiagnosticFallback(facts: DiagnosticFactsPacket): DiagnosticAIResult {
  const school = hasSchoolGuard(facts);
  const program = diagnosticProgram(facts);
  const uncertain = !school && facts.recommendedTrackHint === null;
  const title = PROGRAM_NAMES[program];
  const conclusion = school ? "Если сейчас у вас только школьное образование, можно рассмотреть «Приёмку квартир»: для «Стройэксперта» нужно СПО или высшее образование." :
    program === "house_unspecified" ? "По вашему интересу к ИЖС пока возможен условный выбор направления." :
    uncertain && program === "construction_expertise" ? "Если СПО или высшее образование получено, можно рассмотреть «Стройэксперт»; статус диплома нужно уточнить." :
    `Под вашу задачу можно рассмотреть «${title}».`;
  const next = program === "house_unspecified" ? "После заключения можно уточнить, интересуют ли вас разовые проверки или сопровождение стройки." :
    uncertain && program === "construction_expertise" ? "После заключения можно уточнить, получено ли образование или только нет документа под рукой." :
    "Для уточнения программы и условий нажмите «Связаться с менеджером».";
  return {
    summary: "Ваше персональное заключение после четырёх ответов.",
    experience: facts.experience, experienceYears: facts.experienceYears, education: facts.education, goal: facts.goal,
    recommendation: [conclusion, facts.experience, facts.goal, BENEFITS[program], school ? "Приёмка квартир не заменяет переподготовку строительного эксперта." : "", next].filter(Boolean).join(" "),
    recommendedTrack: facts.recommendedTrackHint ?? "not_defined",
    importantNote: school ? "Для «Стройэксперта» требуется СПО или высшее образование; если вы сейчас учитесь, порядок зачисления уточнит менеджер." :
      /иностран|зарубеж/i.test(facts.rawAnswers.educationType ?? "") ? "Документ требует индивидуальной проверки; признание заранее не обещается." : null,
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
