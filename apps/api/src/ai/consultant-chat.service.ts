import { ConsultantKnowledgeResolver, classifyConsultantIntent, type ConsultantDiagnosticContext } from "@workspace/domain/consultant";
import type { ArtemProgram } from "@workspace/domain/diagnostic";
import { DiagnosticAIError } from "./diagnostic-result.types";
import { redactConsultantQuestion, selectConsultantInput } from "./consultant-chat.prompt";
import type { ConsultantAIProvider, ConsultantChatResponse, ConsultantProviderInput } from "./consultant-chat.types";
import { fallbackReply } from "./artem-policy";
import { loadArtemKnowledge } from "./artem-knowledge";

export function consultantFallback(input: ConsultantProviderInput, markdown: string): string {
  const program = /program=(construction_expertise|apartment_acceptance|house_acceptance|house_control|house_unspecified|acceptance_choice)/.exec(input.diagnosticContext)?.[1] as ArtemProgram | undefined;
  return fallbackReply(markdown, program ?? (/targetTasks=apartment_house_acceptance|no_professional_education/.test(input.diagnosticContext) ? "apartment_acceptance" : "construction_expertise"),
    input.question, input.history ?? [], input.diagnosticContext);
}
const SMALL_TALK_REPLY = "Спасибо, всё хорошо. Продолжим по обучению — что хотите уточнить?";
const OFF_TOPIC_REPLY = "Похоже, мы ушли от темы обучения. Я здесь, чтобы помочь выбрать подходящую программу. Сформулируйте вопрос в этом контексте — буду рад проконсультировать.";
const ABUSIVE_REPLY = "Давайте вернёмся к теме обучения. Я помогу выбрать подходящую программу и разобраться в условиях.";
function unknownProgramFactReply(question: string): string {
  const q = question.toLowerCase();
  const parameter = /лиценз/.test(q) ? "номер и реквизиты лицензии" : /договор/.test(q) ? "условия договора" :
    /возврат/.test(q) ? "условия возврата" : /доступ/.test(q) ? "срок доступа к материалам" :
      /иностран|признан.*диплом/.test(q) ? "признание конкретного диплома" :
        /суд/.test(q) ? "требования конкретного суда" : /работодател/.test(q) ? "требования конкретного работодателя" : "запрошенный параметр программы";
  return `Подтверждённых данных про ${parameter} сейчас нет. Этот конкретный параметр нужно уточнить у менеджера.`;
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
    const intent = classifyConsultantIntent(facts.question, !unknown);
    if (intent === "small_talk") return { message: SMALL_TALK_REPLY, isAI: false, provider: "fallback",
      matchedSectionIds: facts.matchedSections.map(section => section.id), fallbackReason: null };
    if (intent === "off_topic" || intent === "abusive_or_trolling") return {
      message: intent === "abusive_or_trolling" ? ABUSIVE_REPLY : OFF_TOPIC_REPLY,
      isAI: false, provider: "fallback", matchedSectionIds: facts.matchedSections.map(section => section.id), fallbackReason: null,
    };
    const genuineUnknown = intent === "genuine_unknown_program_fact" || (unknown && intent === "relevant_training_question");
    try {
      if (unknown || genuineUnknown) throw new Error("INSUFFICIENT_KNOWLEDGE");
      const message = await this.provider.generateConsultantReply(selectConsultantInput(facts));
      if (typeof message !== "string" || !message.trim() || message.length > 6000 ||
        /в базе знаний|Пользователь имеет|рекомендация должна|no_professional_education|recommendedTrack|diagnosticContext/i.test(message)) throw new DiagnosticAIError("AI_INVALID_RESULT");
      if (facts.diagnosticContext.includes("no_professional_education") &&
        /(?:рекомендую|вам подходит|можете поступить)[^.!?]{0,60}Стройэксперт/i.test(message)) throw new DiagnosticAIError("AI_INVALID_RESULT");
      if (/скидк|акци|индивидуальн.*цен|возврат|срок.*доступ|бессроч|перв.*взнос|беспроцент/i.test(facts.question) &&
        /скидок нет|такой скидки нет|такой акции нет|индивидуальн[^.!?]{0,40}не предусмотр|возврат[^.!?]{0,40}зависит от тарифа|доступ не бессроч|срок доступа не установлен/i.test(message)) {
        throw new DiagnosticAIError("AI_INVALID_RESULT");
      }
      return { message: message.trim(), isAI: true, provider: "yandex",
        matchedSectionIds: facts.matchedSections.map(section => section.id), fallbackReason: null };
    } catch (error) {
      const commercialUnknown = /возврат|доступ.*материал|срок.*доступ|навсегда|бессроч/i.test(facts.question);
      const fallbackMessage = genuineUnknown && !commercialUnknown ? unknownProgramFactReply(facts.question) : consultantFallback(facts, markdown);
      return { message: fallbackMessage, isAI: false, provider: "fallback",
        matchedSectionIds: facts.matchedSections.map(section => section.id),
        fallbackReason: genuineUnknown ? "INSUFFICIENT_KNOWLEDGE" : error instanceof DiagnosticAIError ? error.code : "AI_REQUEST_FAILED" };
    }
  }
}
