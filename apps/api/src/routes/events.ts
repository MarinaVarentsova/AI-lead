import { Router, type IRouter } from "express";
import { findSession, recordEvent } from "../persistence/artem-repository";

const router: IRouter = Router();
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MANAGER_CONTACT_CLICK = "manager_contact_click";

router.post("/events", async (req, res): Promise<void> => {
  const { sessionId, eventType } = req.body as Record<string, unknown>;
  if (typeof sessionId !== "string" || !UUID_RE.test(sessionId) || eventType !== MANAGER_CONTACT_CLICK) {
    res.status(400).json({ error: "EVENT_INVALID" }); return;
  }

  try {
    if (!await findSession(sessionId)) { res.status(404).json({ error: "SESSION_NOT_FOUND" }); return; }
    await recordEvent(sessionId, MANAGER_CONTACT_CLICK);
    res.status(201).json({ recorded: true, sessionId, eventType: MANAGER_CONTACT_CLICK });
  } catch {
    req.log.error({ sessionId, stage: "event_insert", errorCode: "EVENT_INSERT_FAILED", httpStatus: 500 },
      "EVENT_ROUTE_FAILED");
    res.status(500).json({ error: "EVENT_INSERT_FAILED" });
  }
});

export default router;
