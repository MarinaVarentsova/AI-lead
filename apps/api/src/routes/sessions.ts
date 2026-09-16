import { Router, type IRouter } from "express";
import { randomUUID } from "crypto";
import { getOrCreateSession } from "../persistence/artem-repository";

const router: IRouter = Router();

router.post("/sessions", async (req, res): Promise<void> => {
  const supplied = req.body?.sessionKey;
  if (supplied !== undefined && (typeof supplied !== "string" || !supplied.trim() || supplied.length > 200)) {
    res.status(400).json({ error: "sessionKey must be a non-empty string" }); return;
  }
  const sessionKey = typeof supplied === "string" ? supplied.trim() : randomUUID();

  try {
    const { session, created } = await getOrCreateSession(sessionKey);

    req.log.info({ sessionId: session.id, created }, "SESSION_READY");
    res.status(created ? 201 : 200).json({
      sessionId: session.id,
      sessionKey: session.sessionKey,
    });
  } catch (err: unknown) {
    req.log.error({ stage: "session", errorCode: "SESSION_PERSISTENCE_FAILED", httpStatus: 500 }, "SESSION_CREATE_FAILED");
    res.status(500).json({ error: "Unable to create or find session.", code: "SESSION_PERSISTENCE_FAILED" });
  }
});

export default router;
