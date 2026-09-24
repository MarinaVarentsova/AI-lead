import { Router, type IRouter } from "express";
import { findSession, recordEvent } from "../persistence/artem-repository";
import { buildManagerLeadContext, ManagerLeadContextError } from "../services/manager-lead-context";
import { formatGetCourseManagerComment, submitGetCourseManagerForm } from "../services/getcourse-manager-form";

const router: IRouter = Router();
const UUID_RE = /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i;
const text = (value: unknown, max: number): value is string => typeof value === "string" && Boolean(value.trim()) && value.trim().length <= max;

async function contextFor(sessionId: string) {
  const context = await buildManagerLeadContext(sessionId);
  return { context, comment: formatGetCourseManagerComment(context) };
}

router.get("/manager-form/context/:sessionId", async (req, res): Promise<void> => {
  try {
    if (!UUID_RE.test(req.params.sessionId)) { res.status(404).json({ error: "SESSION_NOT_FOUND" }); return; }
    const { context, comment } = await contextFor(req.params.sessionId);
    res.json({ sessionId: context.sessionId, comment });
  } catch (error) {
    if (error instanceof ManagerLeadContextError) {
      res.status(error.code === "SESSION_NOT_FOUND" ? 404 : 409).json({ error: error.code }); return;
    }
    req.log.error({ stage: "manager_form_context", errorCode: "MANAGER_FORM_CONTEXT_FAILED" }, "MANAGER_FORM_FAILED");
    res.status(500).json({ error: "MANAGER_FORM_CONTEXT_FAILED" });
  }
});

router.post("/manager-form/submit", async (req, res): Promise<void> => {
  const { sessionId, email, fullName, phone, sourceUrl, referrer } = req.body ?? {};
  if (!UUID_RE.test(sessionId) || !text(email, 254) || !text(fullName, 200) || !text(phone, 50) ||
    !text(sourceUrl, 2000) || typeof referrer !== "string" || referrer.length > 2000) {
    res.status(400).json({ error: "MANAGER_FORM_INVALID" }); return;
  }
  try {
    if (!await findSession(sessionId)) { res.status(404).json({ error: "SESSION_NOT_FOUND" }); return; }
    const { comment } = await contextFor(sessionId);
    await submitGetCourseManagerForm({ email: email.trim(), fullName: fullName.trim(), phone: phone.trim(),
      sourceUrl: sourceUrl.trim(), referrer: referrer.trim() }, comment);
    try { await recordEvent(sessionId, "manager_form_submit"); }
    catch { req.log.error({ sessionId, stage: "manager_form_event", errorCode: "MANAGER_FORM_EVENT_FAILED" },
      "MANAGER_FORM_EVENT_FAILED"); }
    res.status(201).json({ submitted: true, sessionId });
  } catch (error) {
    if (error instanceof ManagerLeadContextError) {
      res.status(error.code === "SESSION_NOT_FOUND" ? 404 : 409).json({ error: error.code }); return;
    }
    req.log.error({ sessionId, stage: "manager_form_submit", errorCode: "MANAGER_FORM_SUBMIT_FAILED", httpStatus: 502 },
      "MANAGER_FORM_FAILED");
    res.status(502).json({ error: "MANAGER_FORM_SUBMIT_FAILED" });
  }
});

export default router;
