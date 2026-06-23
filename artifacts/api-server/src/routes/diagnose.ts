/**
 * POST /api/diagnose
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

export type DiagnoseDebugInfo = {
  step: string;
  answersFound: boolean;
  knowledgeBaseFound: boolean;
  knowledgeBaseLength: number;
  knowledgeBaseChunks: number;
  promptLengthApprox: number;
  apiKeyPresent: boolean;
  openAICalled: boolean;
  openAIResponseLength: number;
  openAIPreview: string;
  fallbackUsed: boolean;
  fallbackReason: string | null;
  savedToDb: boolean;
  messageId: string | null;
  error: string | null;
};

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

  const debug: DiagnoseDebugInfo = {
    step: "start",
    answersFound: false,
    knowledgeBaseFound: false,
    knowledgeBaseLength: 0,
    knowledgeBaseChunks: 0,
    promptLengthApprox: 0,
    apiKeyPresent: false,
    openAICalled: false,
    openAIResponseLength: 0,
    openAIPreview: "",
    fallbackUsed: false,
    fallbackReason: null,
    savedToDb: false,
    messageId: null,
    error: null,
  };

  diagLog("====================");
  diagLog("DIAGNOSTIC RESULT START");
  diagLog("====================");

  let sessionId = "unknown";
  try {
    const [conv] = await db
      .select({ sessionId: aiConversations.sessionId })
      .from(aiConversations)
      .where(eq(aiConversations.id, conversationId));
    if (conv) sessionId = conv.sessionId ?? "unknown";
  } catch { /* non-critical */ }

  diagLog("", { conversationId, sessionId });

  // ── 1. Load answers ──────────────────────────────────────────────────────────
  debug.step = "loading_answers";
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

    debug.answersFound = false;
    debug.fallbackUsed = true;
    debug.fallbackReason = "no_answers";
    res.status(404).json({ error: "Diagnostic answers not found for this conversation." });
    return;
  }

  debug.answersFound = true;
  diagLog("ANSWERS LOADED: true");
  diagLog("", {
    experience_area: answers.experienceArea ?? "null",
    experience_years: answers.experienceYears ?? "null",
    education_type: answers.educationType ?? "null",
    goal: answers.goal ?? "null",
  });

  // ── 2. Load knowledge base ───────────────────────────────────────────────────
  debug.step = "loading_knowledge_base";
  diagLog("2. Загрузка базы знаний");
  diagLog("KNOWLEDGE BASE LOAD START");

  let knowledgeBase = "";

  try {
    const kbEntries = await knowledgeBaseService.loadAll();
    knowledgeBase = kbEntries.map((e) => e.content).join("\n\n---\n\n");

    debug.knowledgeBaseFound = kbEntries.length > 0;
    debug.knowledgeBaseLength = knowledgeBase.length;
    debug.knowledgeBaseChunks = kbEntries.length;

    diagLog(`KNOWLEDGE BASE FOUND: ${debug.knowledgeBaseFound}`);
    diagLog("", {
      "knowledge length": `${knowledgeBase.length} symbols`,
      "knowledge chunks": kbEntries.length,
    });
  } catch (err) {
    debug.knowledgeBaseFound = false;
    debug.fallbackUsed = true;
    debug.fallbackReason = "knowledge_not_found";
    debug.error = String(err);

    diagLog("KNOWLEDGE BASE FOUND: false");
    diagLog("", { error: String(err) });
    diagLog("FALLBACK USED", { reason: "knowledge_not_found" });
    diagLog("KNOWLEDGE BASE LOAD END");
    diagLog("====================");
    diagLog("DIAGNOSTIC RESULT FINISH");
    diagLog("====================");

    res.status(200).json({ result: FALLBACK_RESULT, isAI: false, educationType: answers.educationType ?? null, debug });
    return;
  }

  diagLog("KNOWLEDGE BASE LOAD END");

  // ── 3. Prompt size estimate ──────────────────────────────────────────────────
  debug.step = "building_prompt";
  diagLog("3. Формирование промпта");
  const answersText = [
    `- Сфера опыта: ${answers.experienceAreaRaw ?? "не указано"} (код: ${answers.experienceArea ?? "—"})`,
    `- Стаж: ${answers.experienceYearsRaw ?? "не указано"} (код: ${answers.experienceYears ?? "—"})`,
    `- Образование: ${answers.educationTypeRaw ?? "не указано"} (код: ${answers.educationType ?? "—"})`,
    `- Цель: ${answers.goalRaw ?? "не указано"} (код: ${answers.goal ?? "—"})`,
  ].join("\n");
  debug.promptLengthApprox = knowledgeBase.length + answersText.length;
  diagLog("", { "prompt length (approx)": `${debug.promptLengthApprox} symbols` });

  // ── 4. Call OpenAI ───────────────────────────────────────────────────────────
  debug.step = "calling_openai";
  debug.apiKeyPresent = Boolean(process.env.OPENAI_API_KEY);
  diagLog("4. Вызов OpenAI");
  diagLog("OPENAI CALL START");
  diagLog("", { model: "gpt-4o-mini", "api key present": debug.apiKeyPresent });

  let result = FALLBACK_RESULT;
  let isAI = false;

  try {
    debug.openAICalled = true;
    result = await openAIService.diagnose({ knowledgeBase, answers });

    diagLog("OPENAI CALL END");
    diagLog("5. Ответ OpenAI");
    diagLog("OPENAI RESPONSE RECEIVED");
    diagLog("", { "response length": `${result.length} symbols` });
    diagLog("response preview:");
    process.stdout.write(result.slice(0, 1000) + "\n");

    debug.openAIResponseLength = result.length;
    debug.openAIPreview = result.slice(0, 500);

    if (!result || result.trim().length === 0) {
      debug.fallbackUsed = true;
      debug.fallbackReason = "openai_empty_response";
      diagLog("FALLBACK USED", { reason: "openai_empty_response" });
      result = FALLBACK_RESULT;
    } else {
      isAI = true;
      req.log.info({ conversationId, isAI }, "Diagnostic result generated");
    }
  } catch (err) {
    diagLog("OPENAI CALL END");
    debug.fallbackUsed = true;
    debug.fallbackReason = "openai_error";
    debug.error = String(err);
    diagLog("FALLBACK USED", { reason: "openai_error", error: String(err) });
    req.log.warn({ err }, "OpenAI diagnose unavailable, using fallback");
  }

  // ── 5. Save result ───────────────────────────────────────────────────────────
  debug.step = "saving";
  diagLog("6. Сохранение результата");
  diagLog("SAVE DIAGNOSTIC RESULT START");

  try {
    const [saved] = await db
      .insert(aiMessages)
      .values({ conversationId, role: "assistant", message: result, step: "diagnostic_result" })
      .returning({ id: aiMessages.id });

    debug.savedToDb = true;
    debug.messageId = saved?.id ?? null;
    diagLog("", { "saved to ai_messages": true, "message id": saved?.id ?? "unknown" });
  } catch (err) {
    debug.savedToDb = false;
    debug.error = String(err);
    diagLog("", { "saved to ai_messages": false, error: String(err) });
    diagLog("FALLBACK USED", { reason: "save_error" });
    req.log.error({ err }, "Failed to save diagnostic result message");
  }

  debug.step = "done";
  diagLog("SAVE DIAGNOSTIC RESULT END");
  diagLog("====================");
  diagLog("DIAGNOSTIC RESULT FINISH");
  diagLog("====================");

  res.status(200).json({ result, isAI, educationType: answers.educationType ?? null, debug });
});

export default router;
