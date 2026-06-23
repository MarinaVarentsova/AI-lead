/**
 * POST /api/diagnose
 *
 * Generates a structured AI diagnostic result after the user completes 4 questions.
 * 1. Reads saved answers from ai_diagnostic_answers.
 * 2. Loads the knowledge base.
 * 3. Calls OpenAI to produce a plain-text structured result.
 * 4. Saves the result to ai_messages (role: assistant, step: diagnostic_result).
 * 5. Returns { result, isAI, educationType } to the client.
 *
 * Fallback: if OpenAI is unavailable, returns a safe generic message.
 */
import { Router, type IRouter } from "express";
import { db, aiDiagnosticAnswers, aiMessages } from "@workspace/db";
import { eq } from "drizzle-orm";
import { knowledgeBaseService } from "../services/KnowledgeBaseService";
import { openAIService } from "../services/OpenAIService";

const router: IRouter = Router();

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const FALLBACK_RESULT =
  "Спасибо за ответы. На основании диагностики специалист ИНОБР сможет подобрать подходящее направление обучения. Чтобы получить персональную консультацию, оставьте удобный способ связи.";

router.post("/diagnose", async (req, res): Promise<void> => {
  const { conversationId } = req.body as { conversationId?: unknown };

  if (typeof conversationId !== "string" || !UUID_RE.test(conversationId)) {
    res.status(400).json({ error: "conversationId must be a valid UUID" });
    return;
  }

  // Read diagnostic answers
  const [answers] = await db
    .select()
    .from(aiDiagnosticAnswers)
    .where(eq(aiDiagnosticAnswers.conversationId, conversationId));

  if (!answers) {
    res.status(404).json({ error: "Diagnostic answers not found for this conversation." });
    return;
  }

  // Load knowledge base
  const kbEntries = await knowledgeBaseService.loadAll();
  const knowledgeBase = kbEntries.map((e) => e.content).join("\n\n---\n\n");

  // Call OpenAI for structured diagnostic result
  let result = FALLBACK_RESULT;
  let isAI = false;

  try {
    result = await openAIService.diagnose({ knowledgeBase, answers });
    isAI = true;
    req.log.info({ conversationId, isAI }, "Diagnostic result generated");
  } catch (err) {
    req.log.warn({ err }, "OpenAI diagnose unavailable, using fallback");
  }

  // Persist to ai_messages
  try {
    await db.insert(aiMessages).values({
      conversationId,
      role: "assistant",
      message: result,
      step: "diagnostic_result",
    });
  } catch (err) {
    req.log.error({ err }, "Failed to save diagnostic result message");
  }

  res.status(200).json({
    result,
    isAI,
    educationType: answers.educationType ?? null,
  });
});

export default router;
