import { readFile } from "node:fs/promises";
import path from "node:path";
import { DiagnosticKnowledgeResolver, type DiagnosticAnswers } from "@workspace/domain/diagnostic";
import { ConsultantKnowledgeResolver } from "@workspace/domain/consultant";
import { ConsultantChatService } from "./consultant-chat.service";
import { DiagnosticResultService } from "./diagnostic-result.service";
import { YandexAIProvider } from "./yandex-provider";
import { applyConsultantFunnel, type ConsultantExchange } from "./consultant-funnel";
export const MAX_FOLLOW_UPS = 3;
export const followUpCount = (history: ConsultantExchange[]) => history.filter(row => row.role === "user").length;
export function createArtemRuntime(markdown: string, provider = new YandexAIProvider()) {
  const resolver = new ConsultantKnowledgeResolver(markdown);
  const consultant = new ConsultantChatService(resolver, provider);
  return {
    markdown, provider, resolver, diagnostic: new DiagnosticResultService(provider),
    prepare(answers: DiagnosticAnswers, question: string) {
      const diagnostic = DiagnosticKnowledgeResolver.resolve(answers);
      return consultant.prepare(question, {
        experienceArea: diagnostic.answers.experienceArea.code, experienceYears: diagnostic.answers.experienceYears.code,
        educationType: diagnostic.answers.educationType.code, goal: diagnostic.answers.goal.code,
        recommendedTrack: diagnostic.recommendedTrackHint ?? "not_defined",
      });
    },
    async reply(facts: ReturnType<ConsultantChatService["prepare"]>, history: ConsultantExchange[]) {
      const count = followUpCount(history);
      if (count >= MAX_FOLLOW_UPS) throw new Error("FOLLOW_UP_LIMIT");
      const response = await consultant.generate(facts);
      response.message = applyConsultantFunnel(response.message, facts.question, history,
        facts.diagnosticContext.includes("Приоритет — Стройэксперт"), response.fallbackReason === "INSUFFICIENT_KNOWLEDGE");
      const limitReached = count + 1 >= MAX_FOLLOW_UPS;
      if (limitReached) response.message += " Дальше можно продолжить с менеджером через кнопку «Связаться с менеджером».";
      return { ...response, questionsUsed: count + 1, questionsRemaining: MAX_FOLLOW_UPS - count - 1, limitReached };
    },
  };
}
export type ArtemRuntime = ReturnType<typeof createArtemRuntime>;
let cached: Promise<ArtemRuntime> | undefined;
export function getArtemRuntime(): Promise<ArtemRuntime> {
  if (!cached) {
    const cwd = process.cwd();
    const root = cwd.endsWith(path.join("apps", "api")) ? path.resolve(cwd, "../..") : cwd;
    cached = readFile(path.join(root, "knowledge/inobr/artem-expertovich-final.md"), "utf8").then(createArtemRuntime)
      .catch(error => { cached = undefined; throw error; });
  }
  return cached;
}
