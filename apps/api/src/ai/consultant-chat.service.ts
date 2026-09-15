import { ConsultantKnowledgeResolver, UNKNOWN_KNOWLEDGE, type ConsultantDiagnosticContext } from "@workspace/domain/consultant";
import type { ArtemProgram } from "@workspace/domain/diagnostic";
import { DiagnosticAIError } from "./diagnostic-result.types";
import { redactConsultantQuestion, selectConsultantInput } from "./consultant-chat.prompt";
import type { ConsultantAIProvider, ConsultantChatResponse, ConsultantProviderInput } from "./consultant-chat.types";
import { fallbackReply } from "./artem-policy";
import { loadArtemKnowledge } from "./artem-knowledge";

export function consultantFallback(input: ConsultantProviderInput, markdown: string): string {
  const program = /program=(construction_expertise|apartment_acceptance|house_acceptance|house_control|house_unspecified)/.exec(input.diagnosticContext)?.[1] as ArtemProgram | undefined;
  return fallbackReply(markdown, program ?? (/goal=apartment_acceptance|school_only_no_dpo/.test(input.diagnosticContext) ? "apartment_acceptance" : "construction_expertise"),
    input.question, input.history ?? [], input.diagnosticContext);
}
export class ConsultantChatService {
  constructor(private readonly resolver: ConsultantKnowledgeResolver, private readonly provider: ConsultantAIProvider, private readonly markdown?: string) {}
  prepare(question: string, diagnosticContext: ConsultantDiagnosticContext): ConsultantProviderInput {
    const safeQuestion = redactConsultantQuestion(question);
    const retrieval = this.resolver.resolve({ question: safeQuestion, diagnosticContext });
    return selectConsultantInput({ question: safeQuestion, diagnosticContext: retrieval.contextSummary, matchedSections: retrieval.matchedSections });
  }
  async generate(input: ConsultantProviderInput): Promise<ConsultantChatResponse> {
    const facts = selectConsultantInput(input);
    const markdown = this.markdown ?? await loadArtemKnowledge();
    const unknown = facts.matchedSections.every(section => ["faq", "manager"].includes(section.id));
    try {
      if (unknown) throw new Error("INSUFFICIENT_KNOWLEDGE");
      const message = await this.provider.generateConsultantReply(selectConsultantInput(facts));
      if (typeof message !== "string" || !message.trim() || message.length > 6000 ||
        /в базе знаний|Пользователь имеет|рекомендация должна|school_only|recommendedTrack|diagnosticContext/i.test(message)) throw new DiagnosticAIError("AI_INVALID_RESULT");
      if (facts.diagnosticContext.includes("school_only_no_dpo") &&
        /(?:рекомендую|вам подходит|можете поступить)[^.!?]{0,60}Стройэксперт/i.test(message)) throw new DiagnosticAIError("AI_INVALID_RESULT");
      return { message: message.trim(), isAI: true, provider: "yandex",
        matchedSectionIds: facts.matchedSections.map(section => section.id), fallbackReason: null };
    } catch (error) {
      return { message: unknown ? UNKNOWN_KNOWLEDGE : consultantFallback(facts, markdown), isAI: false, provider: "fallback",
        matchedSectionIds: facts.matchedSections.map(section => section.id),
        fallbackReason: unknown ? "INSUFFICIENT_KNOWLEDGE" : error instanceof DiagnosticAIError ? error.code : "AI_REQUEST_FAILED" };
    }
  }
}
