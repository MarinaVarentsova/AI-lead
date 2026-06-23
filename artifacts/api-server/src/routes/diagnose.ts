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
import { db, aiDiagnosticAnswers, aiMessages, aiConversations } from "@workspace/db";
import { eq } from "drizzle-orm";
import { knowledgeBaseService } from "../services/KnowledgeBaseService";
import { openAIService } from "../services/OpenAIService";

const router: IRouter = Router();

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const FALLBACK_RESULT =
  "Спасибо за ответы. На основании диагностики специалист ИНОБР сможет подобрать подходящее направление обучения. Чтобы получить персональную консультацию, оставьте удобный способ связи.";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function diagLog(line: string, data?: Record<string, any>) {
  if (data !== undefined) {
    const pairs = Object.entries(data)
      .map(([k, v]) => `  ${k} = ${String(v)}`)
      .join("\n");
    process.stdout.write(`${line}\n${pairs}\n`);
  } else {
    process.stdout.write(`${line}\n`);
  }
}

router.post("/diagnose", async (req, res): Promise<void> => {
  const { conversationId } = req.body as { conversationId?: unknown };

  if (typeof conversationId !== "string" || !UUID_RE.test(conversationId)) {
    res.status(400).json({ error: "conversationId must be a valid UUID" });
    return;
  }

  diagLog("====================");
  diagLog("DIAGNOSTIC RESULT START");
  diagLog("====================");

  // Look up sessionId for the log
  let sessionId = "unknown";
  try {
    const [conv] = await db
      .select({ sessionId: aiConversations.sessionId })
      .from(aiConversations)
      .where(eq(aiConversations.id, conversationId));
    if (conv) sessionId = conv.sessionId;
  } catch {
    // non-critical
  }

  diagLog("", { conversationId, sessionId });

  // ── 1. Load answers ─────────────────────────────────────────────────────────
  diagLog("1. Загрузка ответов");

  const [answers] = await db
    .select()
    .from(aiDiagnosticAnswers)
    .where(eq(aiDiagnosticAnswers.conversationId, conversationId));

  if (!answers) {
    diagLog("ANSWERS LOADED: false");
    diagLog("FALLBACK USED", { reason: "no_answers" });
    diagLog("====================");
    diagLog("DIAGNOSTIC RESULT FINISH");
    diagLog("====================");
    res.status(404).json({ error: "Diagnostic answers not found for this conversation." });
    return;
  }

  diagLog("ANSWERS LOADED: true");
  diagLog("", {
    experience_area: answers.experienceArea ?? "null",
    experience_years: answers.experienceYears ?? "null",
    education_type: answers.educationType ?? "null",
    goal: answers.goal ?? "null",
  });

  // ── 2. Load knowledge base ───────────────────────────────────────────────────
  diagLog("2. Загрузка базы знаний");
  diagLog("KNOWLEDGE BASE LOAD START");

  let kbEntries: Awaited<ReturnType<typeof knowledgeBaseService.loadAll>> = [];
  let knowledgeBase = "";

  try {
    kbEntries = await knowledgeBaseService.loadAll();
    knowledgeBase = kbEntries.map((e) => e.content).join("\n\n---\n\n");

    const kbFound = kbEntries.length > 0;
    diagLog(`KNOWLEDGE BASE FOUND: ${kbFound}`);

    // Try to expose the file path if available
    const anyEntry = kbEntries[0] as (typeof kbEntries[0] & { filePath?: string }) | undefined;
    const kbPath = anyEntry?.filePath ?? "(path not exposed by service)";
    diagLog("", {
      "knowledge file path": kbPath,
    });

    diagLog("", {
      "knowledge length": `${knowledgeBase.length} symbols`,
      "knowledge chunks": kbEntries.length,
    });
  } catch (err) {
    diagLog("KNOWLEDGE BASE FOUND: false");
    diagLog("", { error: String(err) });
    diagLog("FALLBACK USED", { reason: "knowledge_not_found" });
    diagLog("KNOWLEDGE BASE LOAD END");
    diagLog("====================");
    diagLog("DIAGNOSTIC RESULT FINISH");
    diagLog("====================");

    res.status(200).json({ result: FALLBACK_RESULT, isAI: false, educationType: answers.educationType ?? null });
    return;
  }

  diagLog("KNOWLEDGE BASE LOAD END");

  // ── 3. Build prompt (delegated to OpenAIService, log size here) ─────────────
  diagLog("3. Формирование промпта");
  diagLog("PROMPT BUILD START");

  // Approximate prompt length: system prompt + KB + answers message
  const answersText = [
    `- Сфера опыта: ${answers.experienceAreaRaw ?? "не указано"} (код: ${answers.experienceArea ?? "—"})`,
    `- Стаж: ${answers.experienceYearsRaw ?? "не указано"} (код: ${answers.experienceYears ?? "—"})`,
    `- Образование: ${answers.educationTypeRaw ?? "не указано"} (код: ${answers.educationType ?? "—"})`,
    `- Цель: ${answers.goalRaw ?? "не указано"} (код: ${answers.goal ?? "—"})`,
  ].join("\n");
  const promptLength = knowledgeBase.length + answersText.length;

  diagLog("", { "prompt length (approx)": `${promptLength} symbols` });
  diagLog("PROMPT BUILD END");

  // ── 4. Call OpenAI ───────────────────────────────────────────────────────────
  diagLog("4. Вызов OpenAI");
  diagLog("OPENAI CALL START");

  const apiKeyPresent = Boolean(process.env.OPENAI_API_KEY);
  diagLog("", {
    model: "gpt-4o-mini",
    "api key present": apiKeyPresent,
  });

  let result = FALLBACK_RESULT;
  let isAI = false;

  try {
    result = await openAIService.diagnose({ knowledgeBase, answers });

    diagLog("OPENAI CALL END");

    // ── 5. OpenAI response ───────────────────────────────────────────────────
    diagLog("5. Ответ OpenAI");
    diagLog("OPENAI RESPONSE RECEIVED");
    diagLog("", { "response length": `${result.length} symbols` });
    diagLog("response preview:");
    process.stdout.write(result.slice(0, 1000) + "\n");

    if (!result || result.trim().length === 0) {
      diagLog("FALLBACK USED", { reason: "openai_empty_response" });
      result = FALLBACK_RESULT;
    } else {
      isAI = true;
      req.log.info({ conversationId, isAI }, "Diagnostic result generated");
    }
  } catch (err) {
    diagLog("OPENAI CALL END");
    diagLog("FALLBACK USED", { reason: "openai_error", error: String(err) });
    req.log.warn({ err }, "OpenAI diagnose unavailable, using fallback");
  }

  // ── 6. Save result ───────────────────────────────────────────────────────────
  diagLog("6. Сохранение результата");
  diagLog("SAVE DIAGNOSTIC RESULT START");

  try {
    const [saved] = await db
      .insert(aiMessages)
      .values({
        conversationId,
        role: "assistant",
        message: result,
        step: "diagnostic_result",
      })
      .returning({ id: aiMessages.id });

    diagLog("", {
      "saved to ai_messages": true,
      "message id": saved?.id ?? "unknown",
    });
  } catch (err) {
    diagLog("", { "saved to ai_messages": false, error: String(err) });
    diagLog("FALLBACK USED", { reason: "save_error" });
    req.log.error({ err }, "Failed to save diagnostic result message");
  }

  diagLog("SAVE DIAGNOSTIC RESULT END");
  diagLog("====================");
  diagLog("DIAGNOSTIC RESULT FINISH");
  diagLog("====================");

  res.status(200).json({
    result,
    isAI,
    educationType: answers.educationType ?? null,
  });
});

export default router;
