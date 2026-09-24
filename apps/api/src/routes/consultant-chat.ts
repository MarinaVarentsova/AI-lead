import { Router, type IRouter } from "express";
import { randomUUID } from "node:crypto";
import { DiagnosticValidationError } from "@workspace/domain/diagnostic";
import { ConsultantValidationError } from "@workspace/domain/consultant";
import { getArtemRuntime, followUpCount } from "../ai/artem-runtime";
import { appendDialogueLocked, consultationRows, diagnosticAnswersFromDialogue, readDialogue, withDialogueLock } from "../persistence/artem-repository";
const router: IRouter = Router();
const uuid = (value: unknown): value is string => typeof value === "string" && /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(value);
router.post("/consultant-chat", async (req, res): Promise<void> => {
  const suppliedRequestId = req.body?.requestId;
  const traceRequestId = uuid(suppliedRequestId) ? suppliedRequestId : randomUUID();
  let phase = "validation";
  let errorCode: string | null = null;
  let provider = "yandex";
  req.log.info({ requestId: traceRequestId, stage: phase, provider }, "CONSULTANT_CHAT_START");
  try {
    const { conversationId, message: value, requestId: suppliedId } = req.body ?? {};
    if (!uuid(conversationId) || typeof value !== "string" || !value.trim() || value.trim().length > 1000 ||
      (suppliedId !== undefined && !uuid(suppliedId))) {
      errorCode = "CONSULTANT_REQUEST_INVALID";
      res.status(400).json({ error: typeof value === "string" && value.trim().length > 1000
        ? "Вопрос получился слишком длинным. Сократите его до 1000 знаков."
        : "Вопрос должен содержать от 1 до 1000 знаков.", code: errorCode }); return;
    }
    const message = value.trim();
    const requestId = suppliedId ?? randomUUID();
    // The session lock serializes message_order and keeps each user/Artem pair atomic.
    const result = await withDialogueLock(conversationId, async tx => {
      phase = "load_context";
      const dialogue = await readDialogue(tx, conversationId);
      let answers;
      try { answers = diagnosticAnswersFromDialogue(dialogue); }
      catch { return { status: 404, body: { error: "Diagnostic answers not found.", code: "DIAGNOSTIC_ANSWERS_NOT_FOUND" } }; }
      const consultation = consultationRows(dialogue);
      const history = consultation.map(row => ({ id: row.id, role: row.speaker === "user" ? "user" as const : "assistant" as const, message: row.text }));
      const count = followUpCount(history);
      const existing = history.findIndex(item => item.id === requestId && item.role === "user");
      if (existing >= 0) {
        const reply = history[existing + 1];
        if (history[existing]!.message !== message || reply?.role !== "assistant") return { status: 409, body: { error: "REQUEST_ID_CONFLICT" } };
        return { status: 200, body: { message: reply.message, replayed: true, questionsUsed: count } };
      }
      req.log.info({ requestId, stage: phase, provider }, "CONSULTANT_CONTEXT_LOADED");
      phase = "load_runtime";
      const runtime = await getArtemRuntime();
      const facts = runtime.prepare(answers, message, history);
      req.log.info({ requestId, stage: phase, provider, sectionIds: facts.matchedSections.map(s => s.id) }, "CONSULTANT_KNOWLEDGE_RESOLVED");
      phase = "save_user";
      const [user] = await appendDialogueLocked(tx, conversationId, [
        { id: requestId, speaker: "user", stage: "consultation", messageType: "user_question", text: message },
      ]);
      if (!user) throw new Error("SAVE_FAILED");
      phase = "generate";
      req.log.info({ requestId, stage: phase, provider }, "CONSULTANT_AI_CALL_START");
      const response = await runtime.reply(facts, history);
      provider = response.provider;
      if (response.isAI) req.log.info({ requestId, stage: phase, provider }, "CONSULTANT_AI_CALL_SUCCESS");
      else {
        req.log.warn({ requestId, stage: phase, provider, errorCode: response.fallbackReason }, "CONSULTANT_AI_CALL_FAILED");
        req.log.info({ requestId, stage: phase, provider, errorCode: response.fallbackReason }, "CONSULTANT_FALLBACK_USED");
      }
      phase = "save_assistant";
      const [assistant] = await appendDialogueLocked(tx, conversationId, [
        { speaker: "artem", stage: "consultation", messageType: "artem_answer", text: response.message },
      ]);
      if (!assistant) throw new Error("SAVE_FAILED");
      return { status: 200, body: response };
    });
    errorCode = "code" in result.body && typeof result.body.code === "string" ? result.body.code :
      "error" in result.body && typeof result.body.error === "string" ? result.body.error : null;
    if ("provider" in result.body && typeof result.body.provider === "string") provider = result.body.provider;
    if (result.status === 200) req.log.info({ requestId: traceRequestId, stage: phase, provider, httpStatus: result.status }, "CONSULTANT_MESSAGES_SAVED");
    res.status(result.status).json(result.body);
  } catch (error) {
    if (error instanceof DiagnosticValidationError || error instanceof ConsultantValidationError) {
      errorCode = error.code;
      res.status(400).json({ error: error.code, code: errorCode, requestId: traceRequestId }); return;
    }
    errorCode = error instanceof Error && /^[A-Z][A-Z0-9_]+$/.test(error.message)
      ? error.message : `CONSULTANT_${phase.toUpperCase()}_FAILED`;
    req.log.error({ requestId: traceRequestId, stage: phase, errorCode, provider, httpStatus: 500 }, "CONSULTANT_CHAT_FAILED");
    res.status(500).json({ error: "Unable to complete consultant message.", code: errorCode, requestId: traceRequestId });
  } finally {
    req.log.info({ requestId: traceRequestId, stage: phase, errorCode, provider, httpStatus: res.statusCode }, "CONSULTANT_CHAT_FINISH");
  }
});
export default router;
