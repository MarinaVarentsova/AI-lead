import { Router, type IRouter } from "express";
import { findSession } from "../persistence/artem-repository";

const router: IRouter = Router();

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

router.post("/conversations", async (req, res): Promise<void> => {
  const { sessionId } = req.body as Record<string, unknown>;

  if (typeof sessionId !== "string" || !UUID_RE.test(sessionId)) {
    res.status(400).json({ error: "sessionId must be a valid UUID" });
    return;
  }

  try {
    const session = await findSession(sessionId);
    if (!session) { res.status(404).json({ error: "Session not found." }); return; }
    req.log.info({ sessionId }, "SESSION_DIALOGUE_READY");
    res.status(201).json({
      conversationId: session.id,
      sessionId: session.id,
      currentStep: "current_area",
    });
  } catch (err: unknown) {
    req.log.error({ sessionId, stage: "session_lookup", errorCode: "SESSION_LOOKUP_FAILED", httpStatus: 500 }, "SESSION_LOOKUP_FAILED");
    res.status(500).json({ error: "Unable to find session." });
  }
});

export default router;
