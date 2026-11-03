/** POST /api/diagnose: resolve verified facts, generate a result and persist it. */
import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import {
  DiagnosticKnowledgeResolver,
  DiagnosticValidationError,
  buildFactsPacket,
  type DiagnosticAnswers,
} from "@workspace/domain/diagnostic";
import { getArtemRuntime } from "../ai/artem-runtime";
import {
  appendDialogueLocked,
  diagnosticAnswersFromDialogue,
  readDialogue,
  withDialogueLock,
} from "../persistence/artem-repository";

const router: IRouter = Router();
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

import { formatDiagnosticResult } from "../ai/format-diagnostic";
export { formatDiagnosticResult } from "../ai/format-diagnostic";

router.post("/diagnose", async (req, res): Promise<void> => {
  const startedAt = performance.now();
  const timings = {
    diagnostic_persist_ms: 0,
    recommendation_route_ms: 0,
    faq_retrieval_ms: 0,
    kb_retrieval_ms: 0,
    ai_request_ms: 0,
    ai_response_parse_ms: 0,
    recommendation_persist_ms: 0,
  };
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
    const persistStartedAt = performance.now();
    const dialogue = await readDialogue(db, conversationId);
    timings.diagnostic_persist_ms = Math.round(
      performance.now() - persistStartedAt,
    );
    req.log.info(
      {
        found: dialogue.some((row) => row.messageType === "diagnostic_answer"),
      },
      "DIAGNOSTIC_ANSWERS_LOADED",
    );
    if (!dialogue.some((row) => row.messageType === "diagnostic_answer")) {
      res
        .status(404)
        .json({ error: "Diagnostic answers not found for this conversation." });
      return;
    }

    phase = "resolve_answers";
    const answers: DiagnosticAnswers = diagnosticAnswersFromDialogue(dialogue);
    const resolved = DiagnosticKnowledgeResolver.resolve(answers);
    const facts = buildFactsPacket(resolved);
    req.log.info(
      {
        sourceVersion: facts.sourceVersion,
        recommendedTrackHint: facts.recommendedTrackHint,
        guards: facts.guards.map(({ code }) => code),
      },
      "DIAGNOSTIC_KNOWLEDGE_RESOLVED",
    );

    phase = "generate_result";
    const routeStartedAt = performance.now();
    const outcome = await (await getArtemRuntime()).diagnostic.generate(facts);
    timings.recommendation_route_ms = Math.round(
      performance.now() - routeStartedAt,
    );
    const structuredResult = outcome.result;
    const result = formatDiagnosticResult(structuredResult);
    const isAI = outcome.source === "ai";
    const fallbackReason = outcome.failureReason ?? null;
    if (isAI)
      req.log.info({ length: result.length }, "DIAGNOSTIC_AI_CALL_SUCCESS");
    else
      req.log.info({ length: result.length }, "DIAGNOSTIC_DETERMINISTIC_USED");

    phase = "save_result";
    const recommendationPersistStartedAt = performance.now();
    await withDialogueLock(conversationId, async (tx) => {
      const current = await readDialogue(tx, conversationId);
      if (
        !current.some(
          (row) =>
            row.stage === "recommendation" &&
            row.messageType === "recommendation",
        )
      ) {
        await appendDialogueLocked(tx, conversationId, [
          {
            speaker: "artem",
            stage: "recommendation",
            messageType: "recommendation",
            text: result,
          },
        ]);
      }
    });
    timings.recommendation_persist_ms = Math.round(
      performance.now() - recommendationPersistStartedAt,
    );
    req.log.info("DIAGNOSTIC_RESULT_SAVED");

    res.status(200).json({
      result,
      structuredResult,
      isAI,
      provider: isAI ? "yandex" : "deterministic",
      sourceVersion: facts.sourceVersion,
      fallbackReason,
      timings: {
        ...timings,
        diagnostic_total_ms: Math.round(performance.now() - startedAt),
      },
    });
  } catch (error) {
    if (error instanceof DiagnosticValidationError) {
      res.status(400).json({ error: error.code, issues: error.issues });
      return;
    }
    req.log.error({ phase }, "DIAGNOSTIC_RESULT_FAILED");
    res.status(500).json({ error: "Unable to complete diagnostic result." });
  } finally {
    req.log.info(
      {
        statusCode: res.statusCode,
        ...timings,
        diagnostic_total_ms: Math.round(performance.now() - startedAt),
      },
      "DIAGNOSTIC_RESULT_FINISH",
    );
  }
});

export default router;
