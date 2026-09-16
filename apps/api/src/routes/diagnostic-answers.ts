import { Router, type IRouter } from "express";
import { DiagnosticKnowledgeResolver, DiagnosticValidationError, type DiagnosticAnswers } from "@workspace/domain/diagnostic";
import { findSession, saveDiagnosticDialogue } from "../persistence/artem-repository";

const router: IRouter = Router();

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

router.post("/diagnostic-answers", async (req, res): Promise<void> => {
  const body = req.body as Record<string, unknown>;
  const { conversationId } = body;

  if (typeof conversationId !== "string" || !UUID_RE.test(conversationId)) {
    res.status(400).json({ error: "conversationId must be a valid UUID" });
    return;
  }

  const answers: DiagnosticAnswers = { current_area: body.current_area as string,
    current_area_other_text: body.current_area_other_text as string | null | undefined,
    current_role: body.current_role as string, education_status: body.education_status as string,
    target_tasks: body.target_tasks as string };

  try {
    DiagnosticKnowledgeResolver.resolve(answers);
    if (!await findSession(conversationId)) { res.status(404).json({ error: "Session not found." }); return; }
    await saveDiagnosticDialogue(conversationId, answers);

    req.log.info({ conversationId }, "Diagnostic answers saved");
    res.status(201).json({ saved: true, conversationId });
  } catch (err: unknown) {
    if (err instanceof DiagnosticValidationError) { res.status(400).json({ error: err.code, issues: err.issues }); return; }
    const code = err instanceof Error && err.message === "DIAGNOSTIC_DIALOGUE_CONFLICT" ? err.message : "DIALOGUE_INSERT_FAILED";
    req.log.error({ sessionId: conversationId, stage: "diagnostic", errorCode: code, httpStatus: code.endsWith("CONFLICT") ? 409 : 500 }, "DIAGNOSTIC_DIALOGUE_FAILED");
    res.status(code.endsWith("CONFLICT") ? 409 : 500).json({ error: code });
  }
});

export default router;
