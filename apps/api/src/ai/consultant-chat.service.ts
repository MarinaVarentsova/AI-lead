import { ConsultantKnowledgeResolver, type ConsultantDiagnosticContext } from "@workspace/domain/consultant";
import { DiagnosticAIError } from "./diagnostic-result.types";
import { redactConsultantQuestion, selectConsultantInput } from "./consultant-chat.prompt";
import type { ConsultantAIProvider, ConsultantChatResponse, ConsultantProviderInput } from "./consultant-chat.types";

/** Use source answer paragraphs, not the legacy prompts, JSON or manager templates. */
export function consultantFallback(input: ConsultantProviderInput): string {
  const sections = input.matchedSections;
  const find = (id: string) => sections.find(section => section.id === id);
  if (input.diagnosticContext.includes("school_only_no_dpo")) {
    return "Для программы «Стройэксперт» с дипломом ДПО требуется СПО или ВО; одного аттестата недостаточно. Можно рассмотреть приёмку квартир с сертификатом об окончании курса — это не диплом профессиональной переподготовки.";
  }
  const prices = find("prices");
  if (prices) {
    const amounts = [...prices.content.matchAll(/^>\s*([\d ]+ ₽)\s*$/gm)].map(match => match[1]!.trim());
    if (amounts.length) return `В базе указаны тарифы со стоимостью ${[...new Set(amounts)].join(", ")}. Они отличаются объёмом программы, документами и дополнительными направлениями; предусмотрена рассрочка на 6 месяцев. Финальные условия нужно подтвердить перед оформлением.`;
  }
  if (find("non_profile") && find("admission") && /эконом|поступ|непрофиль/i.test(input.question)) {
    return "Для поступления на «Стройэксперт» подходит любое среднее профессиональное или высшее образование, независимо от профиля диплома. Профильное строительное образование и строительный опыт не являются обязательными условиями поступления. Возможность выполнять конкретные экспертные работы и поступление на обучение — разные вопросы.";
  }
  const preferred = ["judicial", "orders", "house_control", "comparison"].map(find).find(Boolean) ?? sections[0];
  if (!preferred) throw new DiagnosticAIError("AI_INVALID_RESULT");
  if (preferred.id === "house_control" || preferred.id === "comparison") return preferred.content.split("\n\n")[0]!;
  const quotes = [...preferred.content.matchAll(/^> (.+)$/gm)].map(match => match[1]!)
    .filter(text => !/Я (?:могу передать|передам)|Да, сможете всё/.test(text));
  let answer = quotes[0] ?? preferred.content.split("\n\n")[0]!;
  if (preferred.id === "orders") {
    const limitations = quotes.find(text => text.includes("не могу гарантировать"));
    if (limitations) answer += " " + limitations;
    answer += " Пошаговой методики поиска заказов в базе нет.";
  }
  // Source quotes may describe a future handoff: no handoff is executed here.
  return answer.replace(/Я (?:могу передать|передам)[^.]*\./g, "Этот вопрос можно уточнить у менеджера.").trim();
}

export class ConsultantChatService {
  constructor(private readonly resolver: ConsultantKnowledgeResolver, private readonly provider: ConsultantAIProvider) {}

  prepare(question: string, diagnosticContext: ConsultantDiagnosticContext): ConsultantProviderInput {
    const safeQuestion = redactConsultantQuestion(question);
    const retrieval = this.resolver.resolve({ question: safeQuestion, diagnosticContext });
    return selectConsultantInput({ question: safeQuestion, diagnosticContext: retrieval.contextSummary,
      matchedSections: retrieval.matchedSections });
  }

  async generate(input: ConsultantProviderInput): Promise<ConsultantChatResponse> {
    const facts = selectConsultantInput(input);
    try {
      const message = await this.provider.generateConsultantReply(selectConsultantInput(facts));
      if (typeof message !== "string" || !message.trim() || message.length > 6000 ||
        (facts.diagnosticContext.includes("school_only_no_dpo") && /стройэксперт|сстэ|профпереподготов/i.test(message))) {
        throw new DiagnosticAIError("AI_INVALID_RESULT");
      }
      return { message: message.trim(), isAI: true, provider: "yandex",
        matchedSectionIds: facts.matchedSections.map(section => section.id), fallbackReason: null };
    } catch (error) {
      return { message: consultantFallback(facts), isAI: false, provider: "fallback",
        matchedSectionIds: facts.matchedSections.map(section => section.id),
        fallbackReason: error instanceof DiagnosticAIError ? error.code : "AI_REQUEST_FAILED" };
    }
  }
}
