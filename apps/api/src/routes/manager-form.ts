import { Router, type IRouter, type Request, type Response } from "express";
import { randomUUID } from "node:crypto";
import { findSession, recordEvent } from "../persistence/artem-repository";
import { buildManagerLeadContext, ManagerLeadContextError } from "../services/manager-lead-context";
import { formatGetCourseManagerComment, loadGetCourseManagerWidget, serializeGetCourseWidgetBody,
  getCourseCookieHeader, localizeGetCourseCookies, MANAGER_FORM_REQUEST_ID_FIELD, submitGetCourseWidgetBody,
  type ManagerFormTrace } from "../services/getcourse-manager-form";

const router: IRouter = Router();
const UUID_RE = /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i;
const text = (value: unknown, max: number): value is string => typeof value === "string" && Boolean(value.trim()) && value.trim().length <= max;
const widgetMessageHtml = (sessionId: string, status: "success" | "error") => `<!doctype html><html lang="ru"><head><meta charset="utf-8"></head><body><p>${status === "success" ? "Заявка отправлена." : "Не удалось отправить заявку. Попробуйте ещё раз."}</p><script>window.parent.postMessage({type:"getcourse-manager-widget",status:${JSON.stringify(status)},sessionId:${JSON.stringify(sessionId)}},"*");</script></body></html>`;
const widgetSubmitError = (res: Response, status: number) => res.status(status)
  .type("application/json").send(JSON.stringify({ success: false,
    data: { formProcessed: false, error: "Не удалось отправить заявку. Попробуйте ещё раз." } }));

const traceFor = (req: Request,
  sessionId: string, managerFormRequestId: string): ManagerFormTrace => (stage, details = {}) =>
    req.log.info({ managerFormRequestId, sessionId, stage, ...details }, "MANAGER_FORM_TRACE");

const requestIdFrom = (body: unknown): string => {
  const value = typeof body === "string" ? new URLSearchParams(body).get(MANAGER_FORM_REQUEST_ID_FIELD)
    : body && typeof body === "object" ? (body as Record<string, unknown>)[MANAGER_FORM_REQUEST_ID_FIELD] : undefined;
  return typeof value === "string" && UUID_RE.test(value) ? value : randomUUID();
};

async function contextFor(sessionId: string, trace: ManagerFormTrace = () => {}) {
  trace("manager_context_start");
  try {
    const context = await buildManagerLeadContext(sessionId);
    trace("manager_context_success", { recommendedProgramPresent: Boolean(context.recommendedProgram),
      recommendationTextLength: context.recommendationText.length, diagnosticPresent: Boolean(context.diagnostic),
      dialogSummaryLength: context.dialogSummary.length, transcriptMessageCount: context.transcript.length,
      knowledgeBaseVersion: context.knowledgeBaseVersion, totalContextSize: JSON.stringify(context).length });
    const comment = formatGetCourseManagerComment(context);
    trace("getcourse_comment_formatted", { commentLength: comment.length,
      containsRecommendation: comment.includes(context.recommendationText),
      containsTranscript: context.transcript.length === 0 || context.transcript.some(turn => comment.includes(turn.text)),
      containsSessionId: comment.includes(sessionId) });
    return { context, comment };
  } catch (error) {
    trace("manager_context_error", { errorClass: error instanceof Error ? error.name : "UnknownError",
      errorMessage: error instanceof Error ? error.message : String(error) });
    throw error;
  }
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
  const managerFormRequestId = randomUUID();
  const trace = traceFor(req, sessionId, managerFormRequestId);
  try {
    if (!await findSession(sessionId)) { res.status(404).type("html").send(widgetMessageHtml(sessionId, "error")); return; }
    const { comment } = await contextFor(sessionId, trace);
    const widget = await loadGetCourseManagerWidget({ sessionId, managerFormRequestId,
      sourceUrl: sourceUrl.trim(), referrer: referrer.trim() }, comment, fetch, trace);
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
  const managerFormRequestId = requestIdFrom(req.body);
  const trace = traceFor(req, sessionId, managerFormRequestId);
  trace("manager_form_request_received", { requestId: managerFormRequestId, timestamp: new Date().toISOString() });
  try {
    if (!await findSession(sessionId)) { res.status(404).type("html").send(widgetMessageHtml(sessionId, "error")); return; }
    const { comment } = await contextFor(sessionId, trace);
    const params = serializeGetCourseWidgetBody(req.body, comment);
    const upstream = await submitGetCourseWidgetBody(params, getCourseCookieHeader(req.headers.cookie), fetch, trace);
    try {
      await recordEvent(sessionId, "manager_form_submit");
      trace("manager_form_submit_event_write", { attempted: true, written: true });
    } catch {
      req.log.error({ managerFormRequestId, sessionId, stage: "manager_form_submit_event_write",
        errorCode: "MANAGER_FORM_EVENT_FAILED", attempted: true, written: false }, "MANAGER_FORM_EVENT_FAILED");
    }
    trace("manager_form_completed", { result: "success" });
    res.status(upstream.status).set("Content-Type", upstream.contentType).send(upstream.body);
  } catch (error) {
    if (error instanceof ManagerLeadContextError) {
      trace("manager_form_completed", { result: "internal_error", errorCode: error.code });
      widgetSubmitError(res, error.code === "SESSION_NOT_FOUND" ? 404 : 409); return;
    }
    const errorCode = error instanceof Error ? error.message : "MANAGER_FORM_SUBMIT_FAILED";
    const validationError = ["GETCOURSE_WIDGET_FORM_INVALID", "GETCOURSE_WIDGET_CONSENT_REQUIRED",
      "GETCOURSE_WIDGET_COMMENT_REQUIRED"].includes(errorCode);
    const result = validationError ? "validation_error" :
      ["GETCOURSE_WIDGET_ACTION_REQUIRED", "GETCOURSE_WIDGET_ACTION_INVALID"].includes(errorCode) ? "internal_error" :
        errorCode.startsWith("GETCOURSE_") ? "upstream_error" : "internal_error";
    trace("manager_form_completed", { result, errorCode });
    req.log.error({ managerFormRequestId, sessionId, stage: "manager_form_submit", errorCode,
      httpStatus: validationError ? 400 : 502 },
      "MANAGER_FORM_FAILED");
    widgetSubmitError(res, validationError ? 400 : 502);
  }
});

export default router;
