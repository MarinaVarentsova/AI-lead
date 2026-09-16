import { DiagnosticKnowledgeResolver, type DiagnosticAnswers } from "@workspace/domain/diagnostic";
import type { AIProvider } from "./provider";
import { selectDiagnosticFacts } from "./diagnostic-result.prompt";
import { diagnosticProgram, PROGRAM_NAMES, BENEFITS } from "./artem-policy";
import { DiagnosticAIError, hasSchoolGuard, validateDiagnosticResult,
  type DiagnosticAIErrorCode, type DiagnosticAIResult, type DiagnosticFactsPacket } from "./diagnostic-result.types";

export function generateDiagnosticFallback(facts: DiagnosticFactsPacket): DiagnosticAIResult {
  const school = hasSchoolGuard(facts);
  const program = diagnosticProgram(facts);
  const conditional = facts.answerCodes.educationStatus === "currently_studying";
  const title = PROGRAM_NAMES[program];
  const conclusion = school ? "Если сейчас у вас только школьное образование, можно рассмотреть «Приёмку квартир»: для «Стройэксперта» нужно СПО или высшее образование." :
    program === "acceptance_choice" ? "Вам можно рассмотреть два направления — «Приёмка квартир» и «Приёмка ИЖС»." :
    conditional ? "По вашей задаче можно рассмотреть «Стройэксперт» и начать обучение уже сейчас; выпускные документы выдаются после предъявления оконченного диплома СПО или высшего образования." :
    `Под вашу задачу можно рассмотреть «${title}».`;
  const next = program === "acceptance_choice" ? "После заключения можно уточнить, хотите ли вы начать с квартир или сразу работать с частными домами." :
    "Для уточнения программы и условий нажмите «Связаться с менеджером».";
  return {
    summary: "Ваше персональное заключение после четырёх ответов.",
    currentArea: facts.currentArea, currentRole: facts.currentRole, education: facts.education, targetTasks: facts.targetTasks,
    recommendation: [conclusion, facts.education, facts.targetTasks, BENEFITS[program], school ? "Приёмка квартир не заменяет переподготовку строительного эксперта." : "", next].filter(Boolean).join(" "),
    recommendedTrack: facts.recommendedTrackHint ?? "not_defined",
    importantNote: school ? "Для «Стройэксперта» требуется СПО или высшее образование." : conditional
      ? "Выпускные документы выдаются после предъявления оконченного диплома СПО или высшего образования." : null,
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
