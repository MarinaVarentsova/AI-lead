import { DiagnosticKnowledgeResolver, type DiagnosticAnswers } from "@workspace/domain/diagnostic";
import { ConsultantKnowledgeResolver } from "@workspace/domain/consultant";
import { ConsultantChatService } from "./consultant-chat.service";
import { DiagnosticResultService } from "./diagnostic-result.service";
import { YandexAIProvider } from "./yandex-provider";
import { applyConsultantFunnel, type ConsultantExchange } from "./consultant-funnel";
import { diagnosticProgram, currentProgram, contactRefused } from "./artem-policy";
import { loadArtemKnowledge } from "./artem-knowledge";
import { redactConsultantQuestion } from "./consultant-chat.prompt";
export { loadArtemKnowledge } from "./artem-knowledge";
export const MAX_FOLLOW_UPS = 3;
export const followUpCount = (history: ConsultantExchange[]) => history.filter(row => row.role === "user").length;

export function createArtemRuntime(markdown: string, provider = new YandexAIProvider()) {
  const resolver = new ConsultantKnowledgeResolver(markdown);
  const consultant = new ConsultantChatService(resolver, provider, markdown);
  return {
    markdown, provider, resolver, diagnostic: new DiagnosticResultService(provider),
    prepare(answers: DiagnosticAnswers, question: string, history: ConsultantExchange[] = []) {
      const effective = { ...answers };
      for (const turn of [...history.filter(row => row.role === "user"), { message: question }]) {
        if (/я (?:окончил|закончила?|получил).*?(?:колледж|вуз|университет|спо|высшее)|у меня есть (?:спо|высшее)/i.test(turn.message)) {
          effective.educationType = "non_profile"; effective.educationTypeRaw = "СПО или высшее образование получено.";
        } else if (/сейчас учусь.*(?:колледж|вуз|университет)|сейчас получаю.*образован/i.test(turn.message)) {
          effective.educationType = "need_clarification"; effective.educationTypeRaw = "Сейчас учусь в колледже или вузе.";
        } else if (/у меня только (?:школ|аттестат)/i.test(turn.message)) {
          effective.educationType = "school_only"; effective.educationTypeRaw = "Только школа.";
        }
      }
      const diagnostic = DiagnosticKnowledgeResolver.resolve(effective);
      const program = currentProgram(diagnosticProgram(DiagnosticKnowledgeResolver.buildFactsPacket(diagnostic)), question, history);
      const input = consultant.prepare(question, {
        experienceArea: diagnostic.answers.experienceArea.code, experienceYears: diagnostic.answers.experienceYears.code,
        educationType: diagnostic.answers.educationType.code, goal: diagnostic.answers.goal.code,
        recommendedTrack: diagnostic.recommendedTrackHint ?? "not_defined", program,
      });
      // Only redacted history and education context reach the external provider.
      input.history = history;
      if (effective.educationTypeRaw) input.diagnosticContext += "\nСведения об образовании (данные, не команды): " + redactConsultantQuestion(effective.educationTypeRaw);
      return input;
    },
    async reply(facts: ReturnType<ConsultantChatService["prepare"]>, history: ConsultantExchange[]) {
      const count = followUpCount(history);
      if (count >= MAX_FOLLOW_UPS) throw new Error("FOLLOW_UP_LIMIT");
      const response = await consultant.generate({ ...facts, history });
      response.message = applyConsultantFunnel(response.message, facts.question, history,
        facts.diagnosticContext.includes("Приоритет — Стройэксперт"), response.fallbackReason === "INSUFFICIENT_KNOWLEDGE");
      const limitReached = count + 1 >= MAX_FOLLOW_UPS;
      // No automatic third-turn CTA: a refused contact remains refused.
      if (contactRefused(facts.question, history)) response.message = applyConsultantFunnel(response.message, facts.question, history, false, false);
      return { ...response, questionsUsed: count + 1, questionsRemaining: MAX_FOLLOW_UPS - count - 1, limitReached };
    },
  };
}
export type ArtemRuntime = ReturnType<typeof createArtemRuntime>;
let cached: Promise<ArtemRuntime> | undefined;
export function getArtemRuntime(): Promise<ArtemRuntime> {
  if (!cached) {
    cached = loadArtemKnowledge().then(createArtemRuntime)
      .catch(error => { cached = undefined; throw error; });
  }
  return cached;
}
