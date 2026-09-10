import { Router, type IRouter } from "express";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { db, aiDiagnosticAnswers, aiMessages } from "@workspace/db";
import { and, eq } from "drizzle-orm";
import { DiagnosticKnowledgeResolver, DiagnosticValidationError } from "@workspace/domain/diagnostic";
import { ConsultantKnowledgeResolver, ConsultantValidationError } from "@workspace/domain/consultant";
import { ConsultantChatService, YandexAIProvider } from "../ai";

import { applyConsultantFunnel } from "../ai/consultant-funnel";

const router: IRouter = Router();
let service: ConsultantChatService | undefined;
async function getService(): Promise<ConsultantChatService> {
  if (service) return service;
  const cwd = process.cwd();
  const root = cwd.endsWith(path.join("apps", "api")) ? path.resolve(cwd, "../..") : cwd;
  const markdown = await readFile(path.join(root, "knowledge/inobr/artem-expertovich-final.md"), "utf8");
  service = new ConsultantChatService(new ConsultantKnowledgeResolver(markdown), new YandexAIProvider());
  return service;
}

router.post("/consultant-chat", async (req, res): Promise<void> => {
  req.log.info("CONSULTANT_CHAT_START");
  let phase = "validation";
  try {
    const conversationId: unknown = req.body?.conversationId;
    const value: unknown = req.body?.message;
    if (typeof conversationId !== "string" || !/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(conversationId) ||
      typeof value !== "string" || !value.trim() || value.trim().length > 4000) {
      res.status(400).json({ error: "Invalid conversationId or message (1–4000 characters required)." });
      return;
    }
    const message = value.trim();
    phase = "load_context";
    const [row] = await db.select({ experienceArea: aiDiagnosticAnswers.experienceArea,
      experienceYears: aiDiagnosticAnswers.experienceYears, educationType: aiDiagnosticAnswers.educationType,
      goal: aiDiagnosticAnswers.goal }).from(aiDiagnosticAnswers)
      .where(eq(aiDiagnosticAnswers.conversationId, conversationId)).limit(1);
    if (!row) { res.status(404).json({ error: "Diagnostic answers not found." }); return; }
    const diagnostic = DiagnosticKnowledgeResolver.resolve({ experienceArea: row.experienceArea ?? "",
      experienceYears: row.experienceYears ?? "", educationType: row.educationType ?? "", goal: row.goal ?? "" });
    req.log.info("CONSULTANT_CONTEXT_LOADED");
    phase = "resolve_knowledge";
    const consultant = await getService();
    const facts = consultant.prepare(message, {
      experienceArea: diagnostic.answers.experienceArea.code,
      experienceYears: diagnostic.answers.experienceYears.code,
      educationType: diagnostic.answers.educationType.code,
      goal: diagnostic.answers.goal.code,
      recommendedTrack: diagnostic.recommendedTrackHint ?? "not_defined",
    });
    req.log.info({ sectionIds: facts.matchedSections.map(section => section.id) }, "CONSULTANT_KNOWLEDGE_RESOLVED");
    phase = "load_funnel";
    const history = await db.select({ role: aiMessages.role, message: aiMessages.message }).from(aiMessages)
      .where(and(eq(aiMessages.conversationId, conversationId), eq(aiMessages.step, "post_diagnostic_chat")));
    phase = "save_user";
    const [savedUser] = await db.insert(aiMessages).values({ conversationId, role: "user", step: "post_diagnostic_chat", message })
      .returning({ id: aiMessages.id });
    if (!savedUser) throw new Error("Message not saved");
    phase = "generate";
    req.log.info({ provider: "yandex" }, "CONSULTANT_AI_CALL_START");
    const response = await consultant.generate(facts);
    if (response.isAI) req.log.info({ length: response.message.length }, "CONSULTANT_AI_CALL_SUCCESS");
    else {
      req.log.warn({ reason: response.fallbackReason }, "CONSULTANT_AI_CALL_FAILED");
      req.log.info({ reason: response.fallbackReason }, "CONSULTANT_FALLBACK_USED");
    }
    response.message = applyConsultantFunnel(response.message, message, history,
      facts.diagnosticContext.includes("Приоритет — Стройэксперт"),
      response.fallbackReason === "INSUFFICIENT_KNOWLEDGE");
    phase = "save_assistant";
    const [savedAssistant] = await db.insert(aiMessages).values({ conversationId, role: "assistant", step: "post_diagnostic_chat", message: response.message })
      .returning({ id: aiMessages.id });
    if (!savedAssistant) throw new Error("Message not saved");
    req.log.info("CONSULTANT_MESSAGES_SAVED");
    res.json(response);
  } catch (error) {
    if (error instanceof DiagnosticValidationError || error instanceof ConsultantValidationError) {
      res.status(400).json({ error: error.code }); return;
    }
    req.log.error({ phase }, "CONSULTANT_CHAT_FAILED");
    res.status(500).json({ error: "Unable to complete consultant message." });
  } finally { req.log.info({ statusCode: res.statusCode }, "CONSULTANT_CHAT_FINISH"); }
});

export default router;
