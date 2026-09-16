import { Router, type IRouter } from "express";
import { findSession, saveDiagnosticTurn } from "../persistence/artem-repository";

const router: IRouter = Router();
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

router.post("/diagnostic/turns", async (req, res): Promise<void> => {
  const { conversationId, questionNumber, kind, answerCode, otherText } = req.body as Record<string, unknown>;
  if (typeof conversationId !== "string" || !UUID_RE.test(conversationId) ||
    !Number.isInteger(questionNumber) || (questionNumber as number) < 1 || (questionNumber as number) > 4 ||
    (kind !== "question" && kind !== "answer") ||
    (kind === "answer" && typeof answerCode !== "string") ||
    (otherText !== undefined && typeof otherText !== "string")) {
    res.status(400).json({ error: "DIAGNOSTIC_TURN_INVALID" }); return;
  }
  try {
    if (!await findSession(conversationId)) { res.status(404).json({ error: "SESSION_NOT_FOUND" }); return; }
    const result = await saveDiagnosticTurn(conversationId, questionNumber as number, kind === "answer"
      ? { code: answerCode as string, ...(typeof otherText === "string" ? { otherText } : {}) } : undefined);
    res.status(result.created ? 201 : 200).json({ saved: true, conversationId, questionNumber, kind });
  } catch (error) {
    const code = error instanceof Error && error.message === "DIAGNOSTIC_TURN_INVALID" ? error.message :
      error instanceof Error && error.message === "DIAGNOSTIC_DIALOGUE_CONFLICT" ? error.message : "DIALOGUE_INSERT_FAILED";
    const status = code === "DIAGNOSTIC_TURN_INVALID" ? 400 : code === "DIAGNOSTIC_DIALOGUE_CONFLICT" ? 409 : 500;
    req.log.error({ sessionId: conversationId, stage: "diagnostic_turn", errorCode: code, httpStatus: status }, "DIAGNOSTIC_TURN_FAILED");
    res.status(status).json({ error: code });
  }
});

export default router;
