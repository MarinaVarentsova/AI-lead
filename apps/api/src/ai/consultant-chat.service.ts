import { ConsultantKnowledgeResolver, isConsultantChoiceQuestion, type ConsultantDiagnosticContext } from "@workspace/domain/consultant";
import { DiagnosticAIError } from "./diagnostic-result.types";
import { redactConsultantQuestion, selectConsultantInput } from "./consultant-chat.prompt";
import type { ConsultantAIProvider, ConsultantChatResponse, ConsultantProviderInput } from "./consultant-chat.types";

const UNKNOWN_REPLY = "В базе знаний недостаточно информации для точного ответа. Этот вопрос лучше уточнить у менеджера.";
const unknown = (input: ConsultantProviderInput) => input.matchedSections.every(section => ["faq", "manager"].includes(section.id));

/** Extract only the selected final-source text; never substitute legacy prices. */
export function consultantFallback(input: ConsultantProviderInput): string {
  if (unknown(input)) return UNKNOWN_REPLY;
  const sections = input.matchedSections;
  const find = (id: string) => sections.find(section => section.id === id);
  const school = input.diagnosticContext.includes("school_only_no_dpo");
  if (isConsultantChoiceQuestion(input.question) && !school &&
    input.diagnosticContext.includes("Приоритет — Стройэксперт") && find("stroyexpert")) {
    const beginner = /experienceArea=no_experience|experienceYears=none/.test(input.diagnosticContext);
    return "С учётом Вашего образования основным направлением я бы рекомендовал «Стройэксперт»: любого СПО или ВО достаточно для поступления. " +
      (beginner ? "Отсутствие строительного опыта не препятствует обучению; начинать стоит с освоения основ, без ожидания готовности сразу работать экспертом. " :
        "Программу можно использовать для освоения экспертной работы с объектами, дефектами и технической документацией с опорой на Ваш текущий опыт. ") +
      (/goal=expand_services/.test(input.diagnosticContext) ? "Для расширения услуг это путь к дополнительной экспертной компетенции." :
       /goal=new_profession/.test(input.diagnosticContext) ? "Для смены профессии это последовательное освоение нового направления." :
       /goal=extra_income/.test(input.diagnosticContext) ? "Это направление может дополнить текущую деятельность, но доход и заказы не гарантированы." :
       "Если Вы пока изучаете варианты, начните с сопоставления содержания программы с задачами, которые хотите решать.");
  }
  const prices = find("prices");
  if (prices && /цен|стоим|стоит|рассроч|тариф/i.test(input.question)) {
    const amounts = prices.content.match(/\d[\d ]* ₽(?: в месяц)?/g) ?? [];
    return `Полная стоимость вариантов Стройэксперта: ${amounts.slice(0, 4).join(", ")}. Рассрочка на 6 месяцев: ${amounts.slice(4, 8).join(", ")}. Состав программы и документы зависят от тарифа; актуальные акции нужно уточнять отдельно.` +
      (school ? " При наличии только аттестата Стройэксперт недоступен." : "");
  }
  const alternative = /Основной маршрут — (house_control|house_acceptance|apartment_acceptance)/.exec(input.diagnosticContext)?.[1];
  const selected = (isConsultantChoiceQuestion(input.question) && alternative ? find(alternative) : undefined) ?? (school ? find("school_restriction") : undefined) ??
    (["judicial", "orders", "house_control", "house_acceptance", "comparison"].map(find).find(Boolean)) ??
    (find("non_profile") && /эконом|образован|поступ/i.test(input.question) ? find("non_profile") : undefined) ?? sections[0];
  if (!selected) return UNKNOWN_REPLY;
  return selected.content.split("\n").filter(line => !line.startsWith("#"))
    .join("\n").replace(/\*\*/g, "").replace(/\n{3,}/g, "\n\n").trim();
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
    if (unknown(facts)) return { message: UNKNOWN_REPLY, isAI: false, provider: "fallback",
      matchedSectionIds: facts.matchedSections.map(section => section.id), fallbackReason: "INSUFFICIENT_KNOWLEDGE" };
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
