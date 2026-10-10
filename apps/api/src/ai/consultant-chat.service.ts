import { ConsultantKnowledgeResolver, classifyConsultantIntent, type ConsultantDiagnosticContext } from "@workspace/domain/consultant";
import type { ArtemProgram } from "@workspace/domain/diagnostic";
import { DiagnosticAIError } from "./diagnostic-result.types";
import { redactConsultantQuestion, selectConsultantInput } from "./consultant-chat.prompt";
import type { ConsultantAIProvider, ConsultantChatResponse, ConsultantProviderInput } from "./consultant-chat.types";
import { fallbackReply } from "./artem-policy";
import { loadArtemKnowledge } from "./artem-knowledge";
import { HttpProfessionalWebResearchService, type ProfessionalWebResearchService } from "./professional-web-research";

export function consultantFallback(input: ConsultantProviderInput, markdown: string): string {
  const program = /program=(construction_expertise|apartment_acceptance|house_acceptance|house_control|house_unspecified|acceptance_choice)/.exec(input.diagnosticContext)?.[1] as ArtemProgram | undefined;
  return fallbackReply(markdown, program ?? (/targetTasks=apartment_house_acceptance|no_professional_education/.test(input.diagnosticContext) ? "apartment_acceptance" : "construction_expertise"),
    input.question, input.history ?? [], input.diagnosticContext);
}
const SMALL_TALK_REPLY = "Спасибо, всё хорошо. Продолжим по обучению — что хотите уточнить?";
const OFF_TOPIC_REPLY = "Похоже, мы ушли от темы обучения. Я здесь, чтобы помочь выбрать подходящую программу. Сформулируйте вопрос в этом контексте — буду рад проконсультировать.";
const ABUSIVE_REPLY = "Давайте вернёмся к теме обучения. Я помогу выбрать подходящую программу и разобраться в условиях.";
const MANAGER_REFERRAL = "Для точного ответа по этому вопросу лучше связаться с менеджером — он подскажет актуальные условия. Воспользуйтесь кнопкой «Связаться с менеджером».";

const INTERNAL_KNOWLEDGE_DISCLOSURE = /(?:в|по)\s+(?:(?:моей|нашей|доступной\s+мне)\s+)?(?:баз[аеы](?:\s+знаний)?|источник(?:ах|е|и)?|знаниях)[^.!?]{0,140}(?:нет|отсутств|не\s+(?:указан\w*|зафиксирован\w*|подтвержд[её]н\w*|описан\w*|найден\w*|могу\s+подтвердить))|у\s+меня\s+нет[^.!?]{0,80}(?:в\s+)?источник|я\s+не\s+наш[её]л[^.!?]{0,80}(?:в\s+)?баз/iu;

/** Last-mile production guard: internal KB gaps may remain in logs/evaluator, never in the user reply. */
export function guardInternalKnowledgeDisclosure(message: string): string {
  let disclosed = false;
  const kept: string[] = [];
  for (const rawSentence of message.trim().match(/[^.!?\n]+[.!?]?/gu) ?? []) {
    const match = INTERNAL_KNOWLEDGE_DISCLOSURE.exec(rawSentence);
    INTERNAL_KNOWLEDGE_DISCLOSURE.lastIndex = 0;
    if (!match) {
      kept.push(rawSentence.trim());
      continue;
    }
    disclosed = true;
    const knownPrefix = rawSentence.slice(0, match.index)
      .replace(/[,;:\s]*(?:но|а|однако)?\s*$/iu, "").trim();
    if (knownPrefix && /\d|₽|выда[её]т|проходит|включает|содержит|стоит|стоимость/iu.test(knownPrefix)) {
      kept.push(/[.!?]$/u.test(knownPrefix) ? knownPrefix : knownPrefix + ".");
    }
  }
  const cleaned = kept.join(" ").replace(/\s{2,}/g, " ").trim();
  if (!disclosed) return message.trim();
  if (/менеджер/iu.test(cleaned)) return cleaned;
  return [cleaned, MANAGER_REFERRAL].filter(Boolean).join(" ");
}

function unknownProgramFactReply(question: string): string {
  const q = question.toLowerCase();
  const parameter = /лиценз/.test(q) ? "номер и реквизиты лицензии" : /договор/.test(q) ? "условия договора" :
    /возврат/.test(q) ? "условия возврата" : /доступ/.test(q) ? "срок доступа к материалам" :
      /иностран|признан.*диплом/.test(q) ? "признание конкретного диплома" :
        /суд/.test(q) ? "требования конкретного суда" : /работодател/.test(q) ? "требования конкретного работодателя" : "запрошенный параметр программы";
  return `Для точного ответа про ${parameter} лучше связаться с менеджером — он подскажет актуальные условия. Воспользуйтесь кнопкой «Связаться с менеджером».`;
}
export class ConsultantChatService {
  constructor(private readonly resolver: ConsultantKnowledgeResolver, private readonly provider: ConsultantAIProvider,
    private readonly markdown?: string, private readonly webResearch: ProfessionalWebResearchService = new HttpProfessionalWebResearchService()) {}
  prepare(question: string, diagnosticContext: ConsultantDiagnosticContext): ConsultantProviderInput {
    const safeQuestion = redactConsultantQuestion(question);
    const retrieval = this.resolver.resolve({ question: safeQuestion, diagnosticContext });
    const match = retrieval.faqMatches[0];
    return selectConsultantInput({ question: safeQuestion, diagnosticContext: retrieval.contextSummary, sourceVersion: retrieval.sourceVersion,
      matchedSections: retrieval.matchedSections, professional: retrieval.professional,
      ...(match ? { faqMatch: { id: match.id, intent: match.intent,
        policy: match.normalizedPolicy, similarity: match.similarity, answer: match.answer, kbReference: match.kbReference } } : {}) });
  }
  async generate(input: ConsultantProviderInput): Promise<ConsultantChatResponse> {
    const facts = selectConsultantInput(input);
    const markdown = this.markdown ?? await loadArtemKnowledge();
    const faq = facts.faqMatch;
    const professional = facts.professional;
    const webResearchEligible = Boolean(professional?.professionalWebEligible &&
      (!professional.kbSufficient || professional.mixedProductAndProfessional));
    let webResearchUsed = false; let webResearchSourceCount = 0; let webResearchDomains: string[] = [];
    let webResearchLatencyMs = 0; let webResearchFallbackReason: string | null = webResearchEligible ? "not_attempted" : "not_eligible";
    const faqMeta = faq ? { faqMatchUsed: true, faqMatchId: faq.id, faqIntent: faq.intent, faqPolicy: faq.policy,
      faqSimilarity: faq.similarity, kbReference: faq.kbReference, sourceVersion: facts.sourceVersion } :
      { faqMatchUsed: false, sourceVersion: facts.sourceVersion };
    const respond = (response: ConsultantChatResponse): ConsultantChatResponse => ({ ...response, ...faqMeta,
      webResearchEligible, webResearchUsed, webResearchIntent: professional?.intent ?? undefined,
      webResearchSourceCount, webResearchDomains, webResearchLatencyMs, webResearchFallbackReason });
    const commercialQuestion = professional?.intent !== "professional_cost_estimation" &&
      /рассроч|кредит|отсроч|оплат|частями|график.*плат|платить.*месяц|ежемесяч|перв.*взнос|разбить.*плат|заплатить потом|перенести.*плат|досрочн.*погаш|сколько стоит|стоимость|какая цена|какие цены|цен[аыуеой]|тариф/i.test(facts.question) &&
      !/скидк|акци|индивидуальн|специальн.*цен|конкурент.*дешев|бесплатн/i.test(facts.question);
    const tariffComparisonQuestion = /чем отличаются.*тариф|разниц.*(?:тариф|базов|средн|премиум|час|документ|материал)|(?:средн|премиум|базов).*отлича|что входит.*(?:тариф|базов|средн|премиум)|какой тариф выбрать|почему тарифы|что.*в каждом тариф|сравнить.*тариф|какие тарифы|в каком тариф|тариф.*разные программ/i.test(facts.question);
    const directFactQuestion = /какой документ|что (?:я )?получу после обуч|можно (?:ли )?начать|когда (?:можно )?начать|что входит|содержан.*программ|как проходит обуч|формат обуч|обучение дистанционное|онлайн|офлайн|приезжать очно|очн(?:ые|ая|ое|ый).*?(?:занят|встреч|посещ)|другого города|другой страны|посещать институт|обучение дома|своем темпе|своём темпе|есть практика|практическ.*задани|сколько длится|продолжительность/i.test(facts.question);
    const policyMatrixQuestion = /как (?:записаться|поступить|попасть|оформить)|куда записываться|что делать дальше|скидк|промокод|акци|возврат|вернуть деньги|ближайш.*(?:старт|поток)|расписан|срок.*доступ|что такое.*(?:при[её]мк|строительн.*контрол)|что выбрать.*(?:стройэксперт|при[её]мк)|судебн.*эксперт|конкретн.*суд|(?:^|\s)сро(?:\s|[?.!,]|$)|гарант.*(?:работ|доход|заказ)|сколько.*час|чему учат/i.test(facts.question);
    const managerContactQuestion = /как со мной свяж|как связаться.*менеджер|свяжется менеджер/i.test(facts.question);
    if (tariffComparisonQuestion || commercialQuestion || managerContactQuestion || directFactQuestion || policyMatrixQuestion) return respond({
      message: consultantFallback(facts, markdown), isAI: false, provider: "fallback",
      matchedSectionIds: facts.matchedSections.map(section => section.id), fallbackReason: null,
    });
    const unknown = facts.matchedSections.every(section => ["faq", "manager"].includes(section.id));
    const intent = webResearchEligible ? "relevant_training_question" : classifyConsultantIntent(facts.question, !unknown);
    if (intent === "small_talk") return respond({ message: SMALL_TALK_REPLY, isAI: false, provider: "fallback",
      matchedSectionIds: facts.matchedSections.map(section => section.id), fallbackReason: null });
    if (intent === "off_topic" || intent === "abusive_or_trolling") return respond({
      message: intent === "abusive_or_trolling" ? ABUSIVE_REPLY : OFF_TOPIC_REPLY,
      isAI: false, provider: "fallback", matchedSectionIds: facts.matchedSections.map(section => section.id), fallbackReason: null,
    });
    const genuineUnknown = intent === "genuine_unknown_program_fact" || (unknown && intent === "relevant_training_question");
    try {
      if ((unknown || genuineUnknown) && !webResearchEligible) throw new Error("INSUFFICIENT_KNOWLEDGE");
      let providerFacts = facts;
      let webSources: Awaited<ReturnType<ProfessionalWebResearchService["research"]>>["sources"] = [];
      if (webResearchEligible && professional?.intent) {
        const researchQuery = professional.mixedProductAndProfessional
          ? facts.question.split(/(?:и вообще|а почему|при этом)/iu).at(-1)?.trim() || facts.question
          : facts.question;
        const researched = await this.webResearch.research(researchQuery, professional.intent, professional.freshnessRequired);
        webResearchLatencyMs = researched.latencyMs; webResearchFallbackReason = researched.fallbackReason;
        webSources = researched.sources; webResearchUsed = webSources.length > 0;
        webResearchSourceCount = webSources.length; webResearchDomains = [...new Set(webSources.map(source => source.domain))];
        if (webResearchUsed) providerFacts = { ...facts, matchedSections: [
          ...webSources.map((source, index) => ({ id: `web-source:${index + 1}`, title: source.title,
            content: `Источник: ${source.url}\nФактическая выдержка: ${source.snippet}` })),
          ...facts.matchedSections].slice(0, 5) };
      }
      let message = await this.provider.generateConsultantReply(selectConsultantInput(providerFacts));
      if (webResearchUsed) message = `${message.trim()}\n\nИсточники:\n${webSources.map(source => `— ${source.title} — ${source.url}`).join("\n")}`;
      if (typeof message !== "string" || !message.trim() || message.length > 6000) throw new DiagnosticAIError("AI_INVALID_RESULT");
      const guardedMessage = guardInternalKnowledgeDisclosure(message);
      if (/Пользователь имеет|рекомендация должна|no_professional_education|recommendedTrack|diagnosticContext/i.test(guardedMessage) ||
        /(?:оставьте|напишите|пришлите|укажите|сообщите)[^.!?]{0,50}(?:телефон|номер|email|e-mail|telegram|телеграм|whatsapp|ватсап|контакт)|как с вами связаться/i.test(guardedMessage)) throw new DiagnosticAIError("AI_INVALID_RESULT");
      if (facts.diagnosticContext.includes("no_professional_education") &&
        /(?:рекомендую|вам подходит|можете поступить)[^.!?]{0,60}Стройэксперт/i.test(message)) throw new DiagnosticAIError("AI_INVALID_RESULT");
      if (/скидк|акци|индивидуальн.*цен|возврат|срок.*доступ|бессроч|перв.*взнос|беспроцент/i.test(facts.question) &&
        /скидок нет|такой скидки нет|такой акции нет|индивидуальн[^.!?]{0,40}не предусмотр|возврат[^.!?]{0,40}зависит от тарифа|доступ не бессроч|срок доступа не установлен/i.test(message)) {
        throw new DiagnosticAIError("AI_INVALID_RESULT");
      }
      return respond({ message: guardedMessage, isAI: true, provider: "yandex",
        matchedSectionIds: providerFacts.matchedSections.map(section => section.id), fallbackReason: null });
    } catch (error) {
      const commercialUnknown = /возврат|доступ.*материал|срок.*доступ|навсегда|бессроч/i.test(facts.question);
      const fallbackMessage = genuineUnknown && !commercialUnknown ? unknownProgramFactReply(facts.question) : consultantFallback(facts, markdown);
      return respond({ message: fallbackMessage, isAI: false, provider: "fallback",
        matchedSectionIds: facts.matchedSections.map(section => section.id),
        fallbackReason: genuineUnknown ? "INSUFFICIENT_KNOWLEDGE" : faq ? null :
          error instanceof DiagnosticAIError ? error.code : "AI_REQUEST_FAILED" });
    }
  }
}
