import { Router, type IRouter } from "express";
import { findSession, recordEvent } from "../persistence/artem-repository";
import { buildManagerLeadContext, ManagerLeadContextError } from "../services/manager-lead-context";
import { formatGetCourseManagerComment, loadGetCourseManagerWidget, serializeGetCourseWidgetBody,
  getCourseCookieHeader, localizeGetCourseCookies, submitGetCourseWidgetBody } from "../services/getcourse-manager-form";

const router: IRouter = Router();
const UUID_RE = /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i;
const text = (value: unknown, max: number): value is string => typeof value === "string" && Boolean(value.trim()) && value.trim().length <= max;
const widgetMessageHtml = (sessionId: string, status: "success" | "error") => `<!doctype html><html lang="ru"><head><meta charset="utf-8"></head><body><p>${status === "success" ? "Заявка отправлена." : "Не удалось отправить заявку. Попробуйте ещё раз."}</p><script>window.parent.postMessage({type:"getcourse-manager-widget",status:${JSON.stringify(status)},sessionId:${JSON.stringify(sessionId)}},"*");</script></body></html>`;

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

router.get("/manager-form/widget/:sessionId", async (req, res): Promise<void> => {
  const { sessionId } = req.params;
  const { sourceUrl, referrer = "" } = req.query;
  if (!UUID_RE.test(sessionId) || !text(sourceUrl, 2000) || typeof referrer !== "string" || referrer.length > 2000) {
    res.status(400).type("html").send(widgetMessageHtml(sessionId, "error")); return;
  }
  try {
    if (!await findSession(sessionId)) { res.status(404).type("html").send(widgetMessageHtml(sessionId, "error")); return; }
    const { comment } = await contextFor(sessionId);
    const widget = await loadGetCourseManagerWidget({ sessionId, sourceUrl: sourceUrl.trim(), referrer: referrer.trim() }, comment);
    for (const cookie of localizeGetCourseCookies(widget.cookies)) res.append("Set-Cookie", cookie);
    res.type("html").send(widget.html);
  } catch (error) {
    req.log.error({ sessionId, stage: "manager_form_widget", errorCode: "MANAGER_FORM_WIDGET_FAILED" }, "MANAGER_FORM_FAILED");
    res.status(502).type("html").send(widgetMessageHtml(sessionId, "error"));
  }
});

router.post("/manager-form/widget-submit/:sessionId", async (req, res): Promise<void> => {
  const { sessionId } = req.params;
  if (!UUID_RE.test(sessionId)) { res.status(400).type("html").send(widgetMessageHtml(sessionId, "error")); return; }
  try {
    if (!await findSession(sessionId)) { res.status(404).type("html").send(widgetMessageHtml(sessionId, "error")); return; }
    const { comment } = await contextFor(sessionId);
    const params = serializeGetCourseWidgetBody(req.body, comment);
    await submitGetCourseWidgetBody(params, getCourseCookieHeader(req.headers.cookie));
    try { await recordEvent(sessionId, "manager_form_submit"); }
    catch { req.log.error({ sessionId, stage: "manager_form_event", errorCode: "MANAGER_FORM_EVENT_FAILED" },
      "MANAGER_FORM_EVENT_FAILED"); }
    res.type("html").send(widgetMessageHtml(sessionId, "success"));
  } catch (error) {
    if (error instanceof ManagerLeadContextError) {
      res.status(error.code === "SESSION_NOT_FOUND" ? 404 : 409).type("html").send(widgetMessageHtml(sessionId, "error")); return;
    }
    req.log.error({ sessionId, stage: "manager_form_submit", errorCode: "MANAGER_FORM_SUBMIT_FAILED", httpStatus: 502 },
      "MANAGER_FORM_FAILED");
    res.status(502).type("html").send(widgetMessageHtml(sessionId, "error"));
  }
});

export default router;
