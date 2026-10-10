import { DiagnosticKnowledgeResolver, type DiagnosticAnswers } from "@workspace/domain/diagnostic";
import { ConsultantKnowledgeResolver, classifyProfessionalIntent, type FaqEntry } from "@workspace/domain/consultant";
import { ConsultantChatService, guardInternalKnowledgeDisclosure } from "./consultant-chat.service";
import { DiagnosticResultService } from "./diagnostic-result.service";
import { YandexAIProvider } from "./yandex-provider";
import { applyConsultantFunnel, type ConsultantExchange } from "./consultant-funnel";
import { diagnosticProgram, currentProgram, contactRefused } from "./artem-policy";
import { loadArtemFaq, loadArtemKnowledge } from "./artem-knowledge";
import { redactConsultantQuestion } from "./consultant-chat.prompt";
import { OpenAIProfessionalWebResearchService, type ProfessionalWebResearchService } from "./professional-web-research";
export { loadArtemFaq, loadArtemKnowledge } from "./artem-knowledge";
export const followUpCount = (history: ConsultantExchange[]) => history.filter((row) => row.role === "user").length;

export function createArtemRuntime(markdown: string, provider = new YandexAIProvider(), faq: readonly FaqEntry[] = [],
  webResearch: ProfessionalWebResearchService = new OpenAIProfessionalWebResearchService()) {
  const resolver = new ConsultantKnowledgeResolver(markdown, faq);
  const consultant = new ConsultantChatService(resolver, provider, markdown, webResearch);
  return {
    markdown,
    faq,
    webResearch,
    provider,
    resolver,
    diagnostic: new DiagnosticResultService(provider),
    prepare(answers: DiagnosticAnswers, question: string, history: ConsultantExchange[] = []) {
      const effective = { ...answers };
      for (const turn of [...history.filter((row) => row.role === "user"), { message: question }]) {
        if (/я (?:окончил|закончила?|получил).*?(?:колледж|вуз|университет|спо|высшее)|у меня есть (?:спо|высшее)/i.test(turn.message)) {
          effective.education_status = "higher";
        } else if (/сейчас учусь.*(?:колледж|вуз|университет)|сейчас получаю.*образован/i.test(turn.message)) {
          effective.education_status = "currently_studying";
        } else if (/у меня только (?:школ|аттестат)/i.test(turn.message)) {
          effective.education_status = "no_higher_or_secondary_vocational";
        }
      }
      const diagnostic = DiagnosticKnowledgeResolver.resolve(effective);
      const diagnosticTrack = diagnosticProgram(DiagnosticKnowledgeResolver.buildFactsPacket(diagnostic));
      const program = classifyProfessionalIntent(question).professionalWebEligible ? diagnosticTrack :
        currentProgram(diagnosticTrack, question, history);
      const input = consultant.prepare(question, {
        currentArea: diagnostic.answers.currentArea.code,
        currentRole: diagnostic.answers.currentRole.code,
        educationStatus: diagnostic.answers.educationStatus.code,
        targetTasks: diagnostic.answers.targetTasks.code,
        recommendedTrack: diagnostic.recommendedTrackHint ?? "not_defined",
        program,
      });
      // Only redacted history and education context reach the external provider.
      input.history = history;
      input.diagnosticContext += "\nСтатус образования: " + effective.education_status;
      return input;
    },
    async reply(facts: ReturnType<ConsultantChatService["prepare"]>, history: ConsultantExchange[]) {
      const count = followUpCount(history);
      const response = await consultant.generate({ ...facts, history });
      response.message = applyConsultantFunnel(response.message, facts.question, history, facts.diagnosticContext.includes("Приоритет — Стройэксперт"), response.fallbackReason === "INSUFFICIENT_KNOWLEDGE");
      // No automatic third-turn CTA: a refused contact remains refused.
      if (contactRefused(facts.question, history)) response.message = applyConsultantFunnel(response.message, facts.question, history, false, false);
      response.message = guardInternalKnowledgeDisclosure(response.message);
      return { ...response, questionsUsed: count + 1 };
    },
  };
}
export type ArtemRuntime = ReturnType<typeof createArtemRuntime>;
let cached: Promise<ArtemRuntime> | undefined;
export function getArtemRuntime(): Promise<ArtemRuntime> {
  if (!cached) {
    cached = Promise.all([loadArtemKnowledge(), loadArtemFaq()])
      .then(([markdown, faq]) => createArtemRuntime(markdown, new YandexAIProvider(), faq))
      .catch((error) => {
        cached = undefined;
        throw error;
      });
  }
  return cached;
}
