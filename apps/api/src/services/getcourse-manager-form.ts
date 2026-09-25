import type { ManagerLeadContext } from "./manager-lead-context";

export const GETCOURSE_FORM_ID = "ltForm20566";
export const GETCOURSE_BLOCK_ID = "2252008810";
export const GETCOURSE_WIDGET_ID = "1658046";
export const GETCOURSE_COMMENT_FIELD = "22041910";
export const GETCOURSE_ENDPOINT = `https://inobr.ru.com/pl/lite/block-public/process-html?id=${GETCOURSE_BLOCK_ID}`;
export const GETCOURSE_WIDGET_ENDPOINT = `https://inobr.ru.com/pl/lite/widget/widget?id=${GETCOURSE_WIDGET_ID}`;
export const GETCOURSE_ACTION_FIELD = "__artem_getcourse_action";

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

export async function loadGetCourseManagerWidget(input: { sessionId: string; sourceUrl: string; referrer: string },
  comment: string, fetcher: typeof fetch = fetch): Promise<GetCourseWidgetDocument> {
  const url = new URL(GETCOURSE_WIDGET_ENDPOINT);
  url.searchParams.set("loc", input.sourceUrl);
  url.searchParams.set("ref", input.referrer);
  const response = await fetcher(url, { method: "GET", redirect: "follow" });
  if (!response.ok) throw new Error("GETCOURSE_WIDGET_FAILED");
  let html = await response.text();
  for (const marker of [`field-input-${GETCOURSE_COMMENT_FIELD}`,
    "formParams[dealCustomFields][11904802]", "formParams[dealCustomFields][11904803]",
    "intlTelInputWithUtils.min.js", "phone-mask.js"]) {
    if (!html.includes(marker)) throw new Error("GETCOURSE_WIDGET_INVALID");
  }
  if (!new RegExp(`<form[^>]+data-id\\s*=\\s*["']?${GETCOURSE_BLOCK_ID}["']?`, "i").test(html)) {
    throw new Error("GETCOURSE_WIDGET_INVALID");
  }
  const textarea = new RegExp(`(<textarea[^>]+id=["']field-input-${GETCOURSE_COMMENT_FIELD}["'][^>]*>)[\\s\\S]*?(</textarea>)`, "i");
  if (!textarea.test(html)) throw new Error("GETCOURSE_COMMENT_FIELD_UNAVAILABLE");
  html = html.replace(textarea, `$1${escapeTextarea(comment)}$2`);
  html = html.replace(/<head([^>]*)>/i, `<head$1><base href="https://inobr.ru.com/">`);
  const bridge = `<style>[data-id="${GETCOURSE_COMMENT_FIELD}"]{display:none!important}</style><script>
window.addEventListener("load",function(){setTimeout(function(){var form=document.querySelector('form[data-id="${GETCOURSE_BLOCK_ID}"]');if(form){var action=document.createElement("input");action.type="hidden";action.name=${JSON.stringify(GETCOURSE_ACTION_FIELD)};action.value=form.action;form.appendChild(action);form.action=window.location.origin+${JSON.stringify(`/api/manager-form/widget-submit/${input.sessionId}`)};window.parent.postMessage({type:"getcourse-manager-widget",status:"ready",sessionId:${JSON.stringify(input.sessionId)}} ,"*");}},0);});
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

export async function submitGetCourseWidgetBody(params: URLSearchParams, cookie: string | undefined,
  fetcher: typeof fetch = fetch): Promise<void> {
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
  const response = await fetcher(target, { method: "POST", redirect: "follow",
    headers: { "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8", ...(cookie ? { Cookie: cookie } : {}) }, body: params });
  const responseText = await response.text();
  let processed: boolean | undefined;
  let success: boolean | undefined;
  try {
    const result = JSON.parse(responseText) as { success?: boolean; data?: { formProcessed?: boolean } };
    success = typeof result.success === "boolean" ? result.success : undefined;
    processed = typeof result.data?.formProcessed === "boolean" ? result.data.formProcessed : undefined;
  }
  catch { processed = undefined; }
  if (!response.ok || success === false || processed === false ||
    /Не заполнено поле|Заявка не отправлена|Не получилось обработать форму/i.test(responseText)) {
    throw new Error("GETCOURSE_SUBMIT_FAILED");
  }
}
