import type { ManagerLeadContext } from "./manager-lead-context";

export const GETCOURSE_FORM_ID = "ltForm20566";
export const GETCOURSE_BLOCK_ID = "2252008810";
export const GETCOURSE_WIDGET_ID = "1658046";
export const GETCOURSE_COMMENT_FIELD = "22041910";
export const GETCOURSE_ENDPOINT = `https://inobr.ru.com/pl/lite/block-public/process-html?id=${GETCOURSE_BLOCK_ID}`;
export const GETCOURSE_WIDGET_ENDPOINT = `https://inobr.ru.com/pl/lite/widget/widget?id=${GETCOURSE_WIDGET_ID}`;
export const GETCOURSE_ACTION_FIELD = "__artem_getcourse_action";
export const MANAGER_FORM_REQUEST_ID_FIELD = "__artem_manager_form_request_id";

export type ManagerFormTrace = (stage: string, details?: Record<string, unknown>) => void;

const errorDetails = (error: unknown) => ({
  errorClass: error instanceof Error ? error.name : "UnknownError",
  errorMessage: error instanceof Error ? error.message : String(error),
});

const sanitizedPreview = (value: string) => value.slice(0, 300)
  .replace(/[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}/g, "[email]")
  .replace(/\+?\d[\d\s()-]{7,}\d/g, "[phone]")
  .replace(/([A-Za-z_-]*hash)["'=:\s]+[A-Za-z0-9._-]+/gi, "$1=[redacted]")
  .replace(/(requestSimpleSign|token|cookie|authorization)["'=:\s]+[^\s"'<>&]+/gi, "$1=[redacted]");

export function formatGetCourseManagerComment(context: ManagerLeadContext): string {
  const transcript = context.transcript.map(turn =>
    `${turn.role === "user" ? "Пользователь" : "Артём"}: ${turn.text}`).join("\n");
  return [
    "ИНОБР Ассистент — консультация Артёма", "", "Рекомендованная программа:", context.recommendedProgram,
    "", "Рекомендация Артёма:", context.recommendationText, "", "Диагностика:",
    `Сфера: ${context.diagnostic.currentArea}`, `Роль: ${context.diagnostic.currentRole}`,
    `Образование: ${context.diagnostic.educationStatus}`, `Задача: ${context.diagnostic.targetTasks}`,
    "", "Краткое резюме:", context.dialogSummary, "", "Диалог:", transcript || "Дополнительных вопросов не было.",
    "", "Session ID:", context.sessionId, "", "Версия базы знаний:", context.knowledgeBaseVersion,
  ].join("\n");
}

const escapeTextarea = (value: string) => value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");

export interface GetCourseWidgetDocument { html: string; cookies: string[] }

export async function loadGetCourseManagerWidget(input: { sessionId: string; managerFormRequestId: string; sourceUrl: string; referrer: string },
  comment: string, fetcher: typeof fetch = fetch, trace: ManagerFormTrace = () => {}): Promise<GetCourseWidgetDocument> {
  const url = new URL(GETCOURSE_WIDGET_ENDPOINT);
  url.searchParams.set("loc", input.sourceUrl);
  url.searchParams.set("ref", input.referrer);
  trace("getcourse_widget_fetch_start", { endpoint: `${url.origin}${url.pathname}`, timestamp: new Date().toISOString() });
  let response: Response;
  try { response = await fetcher(url, { method: "GET", redirect: "follow" }); }
  catch (error) {
    trace("getcourse_widget_fetch_error", { ...errorDetails(error), network: true,
      timeout: error instanceof Error && error.name === "AbortError" });
    throw error;
  }
  if (!response.ok) {
    trace("getcourse_widget_fetch_error", { upstreamStatus: response.status, network: false, timeout: false });
    throw new Error("GETCOURSE_WIDGET_FAILED");
  }
  let html = await response.text();
  const formTag = new RegExp(`<form\\b[^>]*data-id\\s*=\\s*["']?${GETCOURSE_BLOCK_ID}["']?[^>]*>`, "i").exec(html)?.[0];
  const formFound = Boolean(formTag);
  const upstreamAction = formTag ? /\baction=["']([^"']+)["']/i.exec(formTag)?.[1]?.replaceAll("&amp;", "&") : undefined;
  trace("getcourse_widget_fetch_success", { httpStatus: response.status,
    contentType: response.headers.get("content-type") ?? "", responseLength: html.length, formFound,
    requestTimeFound: /window\.requestTime\s*=/.test(html), requestSimpleSignFound: /window\.requestSimpleSign\s*=/.test(html),
    upstreamActionFound: Boolean(upstreamAction), pdpConsentFieldsFound: html.includes("formParams[dealCustomFields][11904802]") &&
      html.includes("formParams[dealCustomFields][11904803]") });
  for (const marker of [`field-input-${GETCOURSE_COMMENT_FIELD}`,
    "formParams[dealCustomFields][11904802]", "formParams[dealCustomFields][11904803]",
    "intlTelInputWithUtils.min.js", "phone-mask.js"]) {
    if (!html.includes(marker)) throw new Error("GETCOURSE_WIDGET_INVALID");
  }
  if (!formFound) throw new Error("GETCOURSE_WIDGET_INVALID");
  if (!upstreamAction) throw new Error("GETCOURSE_WIDGET_ACTION_REQUIRED");
  const upstreamTarget = new URL(upstreamAction);
  if (upstreamTarget.protocol !== "https:" || upstreamTarget.hostname !== "inobr.ru.com" ||
    !["/pl/lite/block-public/process", "/pl/lite/block-public/process-html"].includes(upstreamTarget.pathname)) {
    throw new Error("GETCOURSE_WIDGET_ACTION_INVALID");
  }
  const textarea = new RegExp(`(<textarea[^>]+id=["']field-input-${GETCOURSE_COMMENT_FIELD}["'][^>]*>)[\\s\\S]*?(</textarea>)`, "i");
  if (!textarea.test(html)) throw new Error("GETCOURSE_COMMENT_FIELD_UNAVAILABLE");
  html = html.replace(textarea, `$1${escapeTextarea(comment)}$2`);
  html = html.replace(/<head([^>]*)>/i, `<head$1><base href="https://inobr.ru.com/">`);
  trace("getcourse_fields_resolved", { email: html.includes("formParams[email]"), fullName: html.includes("formParams[full_name]"),
    phone: html.includes("formParams[phone]"), consent11904802: html.includes("formParams[dealCustomFields][11904802]"),
    consent11904803: html.includes("formParams[dealCustomFields][11904803]"), dialogue22041910: textarea.test(html),
    helper: html.includes("__gc__internal__form__helper"), helperRef: html.includes("__gc__internal__form__helper_ref"),
    requestTime: /window\.requestTime\s*=/.test(html), requestSimpleSign: /window\.requestSimpleSign\s*=/.test(html) });
  const bridge = `<style>[data-id="${GETCOURSE_COMMENT_FIELD}"]{display:none!important}</style><script>
window.addEventListener("load",function(){setTimeout(function(){var form=document.querySelector('form[data-id="${GETCOURSE_BLOCK_ID}"]');if(form){var action=document.createElement("input");action.type="hidden";action.name=${JSON.stringify(GETCOURSE_ACTION_FIELD)};action.value=${JSON.stringify(upstreamAction)};form.appendChild(action);var requestId=document.createElement("input");requestId.type="hidden";requestId.name=${JSON.stringify(MANAGER_FORM_REQUEST_ID_FIELD)};requestId.value=${JSON.stringify(input.managerFormRequestId)};form.appendChild(requestId);form.action=window.location.origin+${JSON.stringify(`/api/manager-form/widget-submit/${input.sessionId}`)};window.parent.postMessage({type:"getcourse-manager-widget",status:"ready",sessionId:${JSON.stringify(input.sessionId)}} ,"*");}},0);});
</script>`;
  const getSetCookie = (response.headers as Headers & { getSetCookie?: () => string[] }).getSetCookie;
  return { html: html.replace(/<\/body>/i, `${bridge}</body>`), cookies: getSetCookie?.call(response.headers) ?? [] };
}

export function localizeGetCourseCookies(cookies: string[]): string[] {
  return cookies.map(cookie => {
    const [pair, ...attributes] = cookie.split(";");
    const retained = attributes.map(value => value.trim()).filter(value =>
      !/^domain=/i.test(value) && !/^path=/i.test(value) && !/^samesite=/i.test(value) && !/^max-age=/i.test(value));
    return [pair, "Path=/api/manager-form", "SameSite=Lax", "Max-Age=900", ...retained].join("; ");
  });
}

const GETCOURSE_COOKIE_NAMES = new Set(["PHPSESSID5", "gc_counter_132222", "gc_visitor_132222", "gc_visit_132222", "dd_bdfhyr", "_csrf"]);

export function getCourseCookieHeader(value: string | undefined): string | undefined {
  if (!value) return undefined;
  const cookies = value.split(";").map(item => item.trim()).filter(item => GETCOURSE_COOKIE_NAMES.has(item.split("=", 1)[0]));
  return cookies.length ? cookies.join("; ") : undefined;
}

function appendFormValue(params: URLSearchParams, name: string, value: unknown): void {
  if (Array.isArray(value)) { for (const item of value) appendFormValue(params, name, item); return; }
  if (value && typeof value === "object") {
    for (const [key, child] of Object.entries(value)) appendFormValue(params, name ? `${name}[${key}]` : key, child);
    return;
  }
  if (typeof value === "string") params.append(name, value);
}

export function serializeGetCourseWidgetBody(body: unknown, comment: string): URLSearchParams {
  const params = typeof body === "string" ? new URLSearchParams(body) : new URLSearchParams();
  if (body && typeof body === "object") appendFormValue(params, "", body);
  params.set(`formParams[dealCustomFields][${GETCOURSE_COMMENT_FIELD}]`, comment);
  return params;
}

export function validateGetCourseWidgetBody(params: URLSearchParams): void {
  for (const name of ["formParams[email]", "formParams[full_name]", "formParams[phone]"]) {
    if (!params.get(name)?.trim()) throw new Error("GETCOURSE_WIDGET_FORM_INVALID");
  }
  for (const id of ["11904802", "11904803"]) {
    if (params.get(`formParams[dealCustomFields][${id}]`) !== "1") throw new Error("GETCOURSE_WIDGET_CONSENT_REQUIRED");
  }
  if (!params.get(`formParams[dealCustomFields][${GETCOURSE_COMMENT_FIELD}]`)?.trim()) throw new Error("GETCOURSE_WIDGET_COMMENT_REQUIRED");
}

export interface GetCourseSubmitResult { status: number; contentType: string; body: string }

export async function submitGetCourseWidgetBody(params: URLSearchParams, cookie: string | undefined,
  fetcher: typeof fetch = fetch, trace: ManagerFormTrace = () => {}): Promise<GetCourseSubmitResult> {
  trace("getcourse_payload_built", { emailPresent: Boolean(params.get("formParams[email]")?.trim()),
    fullNamePresent: Boolean(params.get("formParams[full_name]")?.trim()),
    phonePresent: Boolean(params.get("formParams[phone]")?.trim()),
    consent11904802Present: params.has("formParams[dealCustomFields][11904802]"),
    consent11904802Value: params.get("formParams[dealCustomFields][11904802]") ?? "",
    consent11904803Present: params.has("formParams[dealCustomFields][11904803]"),
    consent11904803Value: params.get("formParams[dealCustomFields][11904803]") ?? "",
    dialogue22041910Present: Boolean(params.get(`formParams[dealCustomFields][${GETCOURSE_COMMENT_FIELD}]`)?.trim()),
    dialogue22041910Length: params.get(`formParams[dealCustomFields][${GETCOURSE_COMMENT_FIELD}]`)?.length ?? 0,
    requestTimePresent: Boolean(params.get("requestTime")), requestSimpleSignPresent: Boolean(params.get("requestSimpleSign")),
    helperPresent: params.has("__gc__internal__form__helper"), helperRefPresent: params.has("__gc__internal__form__helper_ref") });
  validateGetCourseWidgetBody(params);
  const action = params.get(GETCOURSE_ACTION_FIELD);
  if (!action) throw new Error("GETCOURSE_WIDGET_ACTION_REQUIRED");
  let target: URL;
  try { target = new URL(action); }
  catch { throw new Error("GETCOURSE_WIDGET_ACTION_INVALID"); }
  if (target.protocol !== "https:" || target.hostname !== "inobr.ru.com" ||
    !["/pl/lite/block-public/process", "/pl/lite/block-public/process-html"].includes(target.pathname)) {
    throw new Error("GETCOURSE_WIDGET_ACTION_INVALID");
  }
  params.delete(GETCOURSE_ACTION_FIELD);
  params.delete(MANAGER_FORM_REQUEST_ID_FIELD);
  trace("getcourse_post_start", { destinationHostname: target.hostname, destinationPath: target.pathname,
    method: "POST", timestamp: new Date().toISOString() });
  let response: Response;
  try {
    response = await fetcher(target, { method: "POST", redirect: "follow",
      headers: { "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8", ...(cookie ? { Cookie: cookie } : {}) }, body: params });
  } catch (error) {
    trace("getcourse_post_error", { ...errorDetails(error), upstreamStatus: null,
      timeout: error instanceof Error && error.name === "AbortError", network: true });
    throw error;
  }
  const responseText = await response.text();
  let processed: boolean | undefined;
  let success: boolean | undefined;
  try {
    const result = JSON.parse(responseText) as { success?: boolean; data?: { formProcessed?: boolean } };
    success = typeof result.success === "boolean" ? result.success : undefined;
    processed = typeof result.data?.formProcessed === "boolean" ? result.data.formProcessed : undefined;
  }
  catch { processed = undefined; }
  const validationError = /Не заполнено поле|Заявка не отправлена|Не получилось обработать форму/i.test(responseText);
  const successDetected = response.ok && success !== false && processed !== false && !validationError;
  trace("getcourse_post_response", { httpStatus: response.status, contentType: response.headers.get("content-type") ?? "",
    responseLength: responseText.length, responsePreview: sanitizedPreview(responseText), successDetected, validationError });
  if (!successDetected) {
    trace("getcourse_post_error", { errorClass: "GetCourseResponseError", errorMessage: "GETCOURSE_SUBMIT_FAILED",
      upstreamStatus: response.status, timeout: false, network: false });
    throw new Error("GETCOURSE_SUBMIT_FAILED");
  }
  return { status: response.status, contentType: response.headers.get("content-type") ?? "application/json", body: responseText };
}
