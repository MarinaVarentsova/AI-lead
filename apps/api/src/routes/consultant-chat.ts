import { Router, type IRouter } from "express";
import { randomUUID } from "node:crypto";
import { db, aiDiagnosticAnswers, aiMessages } from "@workspace/db";
import { and, asc, eq, sql } from "drizzle-orm";
import { DiagnosticValidationError } from "@workspace/domain/diagnostic";
import { ConsultantValidationError } from "@workspace/domain/consultant";
import { getArtemRuntime, followUpCount, MAX_FOLLOW_UPS } from "../ai/artem-runtime";
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
    if (!uuid(conversationId) || typeof value !== "string" || !value.trim() || value.trim().length > 4000 ||
      (suppliedId !== undefined && !uuid(suppliedId))) {
      errorCode = "CONSULTANT_REQUEST_INVALID";
      res.status(400).json({ error: "Invalid conversationId, requestId or message (1–4000 characters required).", code: errorCode }); return;
    }
    const message = value.trim();
    const requestId = suppliedId ?? randomUUID();
    // PostgreSQL lock serializes this conversation across processes. Both messages commit
    // together; failed transactions consume no questions. requestId is the user message UUID.
    const result = await db.transaction(async tx => {
      await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${conversationId}))`);
      phase = "load_context";
      const [row] = await tx.select({ experienceArea: aiDiagnosticAnswers.experienceArea,
        experienceYears: aiDiagnosticAnswers.experienceYears, educationType: aiDiagnosticAnswers.educationType,
        goal: aiDiagnosticAnswers.goal, goalRaw: aiDiagnosticAnswers.goalRaw,
        educationTypeRaw: aiDiagnosticAnswers.educationTypeRaw }).from(aiDiagnosticAnswers).where(eq(aiDiagnosticAnswers.conversationId, conversationId)).limit(1);
      if (!row) return { status: 404, body: { error: "Diagnostic answers not found.", code: "DIAGNOSTIC_ANSWERS_NOT_FOUND" } };
      const history = await tx.select({ id: aiMessages.id, role: aiMessages.role, message: aiMessages.message }).from(aiMessages)
        .where(and(eq(aiMessages.conversationId, conversationId), eq(aiMessages.step, "post_diagnostic_chat")))
        .orderBy(asc(aiMessages.createdAt), asc(aiMessages.id));
      const count = followUpCount(history);
      const existing = history.findIndex(item => item.id === requestId && item.role === "user");
      if (existing >= 0) {
        const reply = history[existing + 1];
        if (history[existing]!.message !== message || reply?.role !== "assistant") return { status: 409, body: { error: "REQUEST_ID_CONFLICT" } };
        return { status: 200, body: { message: reply.message, replayed: true, questionsUsed: count,
          questionsRemaining: Math.max(0, MAX_FOLLOW_UPS - count), limitReached: count >= MAX_FOLLOW_UPS } };
      }
      if (count >= MAX_FOLLOW_UPS) return { status: 409, body: { error: "FOLLOW_UP_LIMIT", limitReached: true, questionsRemaining: 0 } };
      req.log.info({ requestId, stage: phase, provider }, "CONSULTANT_CONTEXT_LOADED");
      phase = "load_runtime";
      const runtime = await getArtemRuntime();
      const facts = runtime.prepare({ experienceArea: row.experienceArea ?? "", experienceYears: row.experienceYears ?? "",
        educationType: row.educationType ?? "", educationTypeRaw: row.educationTypeRaw,
        goal: row.goal ?? "", goalRaw: row.goalRaw }, message, history);
      req.log.info({ requestId, stage: phase, provider, sectionIds: facts.matchedSections.map(s => s.id) }, "CONSULTANT_KNOWLEDGE_RESOLVED");
      phase = "save_user";
      const [user] = await tx.insert(aiMessages).values({ id: requestId, conversationId, role: "user", step: "post_diagnostic_chat", message, createdAt: new Date() }).returning({ id: aiMessages.id });
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
      const [assistant] = await tx.insert(aiMessages).values({ conversationId, role: "assistant", step: "post_diagnostic_chat", message: response.message,
        createdAt: new Date(Date.now() + 1) }).returning({ id: aiMessages.id });
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
