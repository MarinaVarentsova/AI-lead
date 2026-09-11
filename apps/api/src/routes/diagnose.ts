/** POST /api/diagnose: resolve verified facts, generate a result and persist it. */
import { Router, type IRouter } from "express";
import { db, aiDiagnosticAnswers, aiMessages } from "@workspace/db";
import {
  DiagnosticKnowledgeResolver, DiagnosticValidationError, buildFactsPacket,
  type DiagnosticAnswers,
} from "@workspace/domain/diagnostic";
import { eq } from "drizzle-orm";
import { DiagnosticResultService, YandexAIProvider } from "../ai";

const router: IRouter = Router();
const service = new DiagnosticResultService(new YandexAIProvider());
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

import { formatDiagnosticResult } from "../ai/format-diagnostic";
export { formatDiagnosticResult } from "../ai/format-diagnostic";

router.post("/diagnose", async (req, res): Promise<void> => {
  // Do not log request bodies, raw answers, generated text or underlying errors.
  req.log.info("DIAGNOSTIC_RESULT_START");
  let phase = "validation";
  try {
    const conversationId: unknown = req.body?.conversationId;
    if (typeof conversationId !== "string" || !UUID_RE.test(conversationId)) {
      res.status(400).json({ error: "conversationId must be a valid UUID" });
      return;
    }

    phase = "load_answers";
    const [row] = await db.select({
      experienceArea: aiDiagnosticAnswers.experienceArea,
      experienceAreaRaw: aiDiagnosticAnswers.experienceAreaRaw,
      experienceYears: aiDiagnosticAnswers.experienceYears,
      experienceYearsRaw: aiDiagnosticAnswers.experienceYearsRaw,
      educationType: aiDiagnosticAnswers.educationType,
      educationTypeRaw: aiDiagnosticAnswers.educationTypeRaw,
      goal: aiDiagnosticAnswers.goal,
      goalRaw: aiDiagnosticAnswers.goalRaw,
    }).from(aiDiagnosticAnswers)
      .where(eq(aiDiagnosticAnswers.conversationId, conversationId)).limit(1);
    req.log.info({ found: Boolean(row) }, "DIAGNOSTIC_ANSWERS_LOADED");
    if (!row) {
      res.status(404).json({ error: "Diagnostic answers not found for this conversation." });
      return;
    }

    phase = "resolve_answers";
    // Drizzle maps the existing snake_case columns to these camelCase properties.
    // Empty codes remain invalid; the resolver reports all missing/unknown codes.
    const answers: DiagnosticAnswers = {
      experienceArea: row.experienceArea ?? "",
      experienceAreaRaw: row.experienceAreaRaw,
      experienceYears: row.experienceYears ?? "",
      experienceYearsRaw: row.experienceYearsRaw,
      educationType: row.educationType ?? "",
      educationTypeRaw: row.educationTypeRaw,
      goal: row.goal ?? "",
      goalRaw: row.goalRaw,
    };
    const resolved = DiagnosticKnowledgeResolver.resolve(answers);
    const facts = buildFactsPacket(resolved);
    req.log.info({
      sourceVersion: facts.sourceVersion,
      recommendedTrackHint: facts.recommendedTrackHint,
      guards: facts.guards.map(({ code }) => code),
    }, "DIAGNOSTIC_KNOWLEDGE_RESOLVED");

    phase = "generate_result";
    req.log.info({ provider: "yandex" }, "DIAGNOSTIC_AI_CALL_START");
    const outcome = await service.generate(facts);
    const structuredResult = outcome.result;
    const result = formatDiagnosticResult(structuredResult);
    const isAI = outcome.source === "ai";
    const fallbackReason = outcome.failureReason ?? null;
    if (isAI) {
      req.log.info({ length: result.length }, "DIAGNOSTIC_AI_CALL_SUCCESS");
    } else {
      req.log.warn({ reason: fallbackReason }, "DIAGNOSTIC_AI_CALL_FAILED");
      req.log.info({ reason: fallbackReason }, "DIAGNOSTIC_FALLBACK_USED");
    }

    phase = "save_result";
    const [saved] = await db.insert(aiMessages).values({
      conversationId,
      role: "assistant",
      step: "diagnostic_result",
      message: result,
    }).returning({ id: aiMessages.id });
    if (!saved) throw new Error("Diagnostic result was not saved");
    req.log.info("DIAGNOSTIC_RESULT_SAVED");

    res.status(200).json({
      result,
      structuredResult,
      isAI,
      provider: isAI ? "yandex" : "fallback",
      sourceVersion: facts.sourceVersion,
      fallbackReason,
    });
  } catch (error) {
    if (error instanceof DiagnosticValidationError) {
      res.status(400).json({ error: error.code, issues: error.issues });
      return;
    }
    req.log.error({ phase }, "DIAGNOSTIC_RESULT_FAILED");
    res.status(500).json({ error: "Unable to complete diagnostic result." });
  } finally {
    req.log.info({ statusCode: res.statusCode }, "DIAGNOSTIC_RESULT_FINISH");
  }
});

export default router;
