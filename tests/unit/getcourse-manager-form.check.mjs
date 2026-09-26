import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { createRequire, registerHooks } from "node:module";
import { fileURLToPath } from "node:url";

const root = new URL("../../", import.meta.url);
const require = createRequire(new URL("package.json", root));
const ts = require("typescript");
const hooks = registerHooks({
  resolve(specifier, context, next) {
    if (specifier.startsWith(".") && context.parentURL?.startsWith("file:")) {
      for (const suffix of [".ts", "/index.ts"]) { const url = new URL(specifier + suffix, context.parentURL);
        if (existsSync(url)) return { url: url.href, shortCircuit: true }; }
    }
    return next(specifier, context);
  },
  load(url, context, next) {
    if (url.startsWith("file:") && url.endsWith(".ts")) return { format: "module", shortCircuit: true,
      source: ts.transpileModule(readFileSync(new URL(url), "utf8"), { fileName: fileURLToPath(url),
        compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText };
    return next(url, context);
  },
});

try {
  const { formatGetCourseManagerComment, loadGetCourseManagerWidget, serializeGetCourseWidgetBody,
    submitGetCourseWidgetBody, localizeGetCourseCookies, getCourseCookieHeader,
    GETCOURSE_ACTION_FIELD, GETCOURSE_ENDPOINT, GETCOURSE_WIDGET_ENDPOINT } =
    await import(new URL("apps/api/src/services/getcourse-manager-form.ts", root));
  const context = { sessionId: "11111111-1111-4111-8111-111111111111", recommendedProgram: "Стройэксперт",
    recommendationText: "Точная персональная рекомендация.", diagnostic: { currentArea: "Проектирование",
      currentRole: "Проектировщик", educationStatus: "Высшее", targetTasks: "Исследовать дефекты" },
    dialogSummary: "Краткое резюме без домыслов.", transcript: [{ role: "user", text: "Сколько стоит?" },
      { role: "assistant", text: "Подтверждённая цена." }], knowledgeBaseVersion: "inobr-artem-v4.0-followup",
    createdAt: "2026-09-24T00:00:00.000Z", summarySource: "ai" };
  const comment = formatGetCourseManagerComment(context);
  const widgetFixture = `<!doctype html><html><head></head><body><form id="ltForm5600148" data-id="2252008810" action="${GETCOURSE_ENDPOINT}">
    <input name="formParams[phone]" data-phone-default-country="auto"><input name="formParams[dealCustomFields][11904802]">
    <input name="formParams[dealCustomFields][11904803]"><textarea id="field-input-22041910" name="formParams[dealCustomFields][22041910]"></textarea>
    <script src="/intlTelInputWithUtils.min.js"></script><script src="/phone-mask.js"></script></form></body></html>`;
  let requestedWidgetUrl = "";
  const trace = [];
  const widget = await loadGetCourseManagerWidget({ sessionId: context.sessionId,
    managerFormRequestId: "22222222-2222-4222-8222-222222222222", sourceUrl: "https://artem.inobr-expert.ru/",
    referrer: "https://inobr-expert.ru/" }, comment, async url => { requestedWidgetUrl = String(url);
    return new Response(widgetFixture, { headers: { "content-type": "text/html" } }); },
  (stage, details) => trace.push({ stage, ...details }));
  const html = widget.html;
  assert.ok(requestedWidgetUrl.startsWith(GETCOURSE_WIDGET_ENDPOINT));
  assert.match(requestedWidgetUrl, /loc=https%3A%2F%2Fartem\.inobr-expert\.ru/);
  assert.match(html, /<base href="https:\/\/inobr\.ru\.com\/">/); assert.match(html, /getcourse-manager-widget/);
  assert.match(html, /widget-submit\/11111111-1111-4111-8111-111111111111/); assert.match(html, /Сколько стоит\?/);
  assert.match(html, /__artem_getcourse_action/);
  assert.match(html, /action\.value="https:\/\/inobr\.ru\.com\/pl\/lite\/block-public\/process-html\?id=2252008810"/);
  assert.match(html, /__artem_manager_form_request_id/);
  assert.match(html, /\[data-id="22041910"\]\{display:none!important\}/);
  assert.ok(trace.some(item => item.stage === "getcourse_widget_fetch_success" && item.formFound));
  assert.ok(trace.some(item => item.stage === "getcourse_fields_resolved" && item.dialogue22041910));
  const fetchFailureTrace = [];
  await assert.rejects(() => loadGetCourseManagerWidget({ sessionId: context.sessionId,
    managerFormRequestId: "33333333-3333-4333-8333-333333333333", sourceUrl: "https://artem.inobr-expert.ru/", referrer: "" },
  comment, async () => new Response("upstream unavailable", { status: 503 }),
  (stage, details) => fetchFailureTrace.push({ stage, ...details })), /GETCOURSE_WIDGET_FAILED/);
  assert.ok(fetchFailureTrace.some(item => item.stage === "getcourse_widget_fetch_error" && item.upstreamStatus === 503));

  const body = serializeGetCourseWidgetBody({ formParams: { email: "test@example.com", full_name: "Тест",
    phone: "+79991234567", dealCustomFields: { 11904802: "1", 11904803: "1", 22041910: "tampered" } },
    requestTime: "1790252039", requestSimpleSign: "signature", isHtmlWidget: "1",
    [GETCOURSE_ACTION_FIELD]: "https://inobr.ru.com/pl/lite/block-public/process?id=2252008810&gcSession=test" }, comment);
  assert.equal(body.get("formParams[email]"), "test@example.com"); assert.equal(body.get("formParams[phone]"), "+79991234567");
  assert.equal(body.get("formParams[dealCustomFields][11904802]"), "1");
  assert.equal(body.get("formParams[dealCustomFields][11904803]"), "1");
  assert.equal(body.get("formParams[dealCustomFields][22041910]"), comment);
  let submitted;
  await submitGetCourseWidgetBody(body, "PHPSESSID5=session", async (url, init) => { submitted = { url, init };
    return new Response('{"success":true,"data":{"parts":[]}}', { headers: { "content-type": "application/json" } }); },
  (stage, details) => trace.push({ stage, ...details }));
  assert.equal(String(submitted.url), "https://inobr.ru.com/pl/lite/block-public/process?id=2252008810&gcSession=test");
  assert.equal(submitted.init.body, body); assert.equal(body.has(GETCOURSE_ACTION_FIELD), false);
  const missingConsent = new URLSearchParams(body); missingConsent.delete("formParams[dealCustomFields][11904803]");
  assert.match(localizeGetCourseCookies(["PHPSESSID5=session; Domain=inobr.ru.com; Path=/; HttpOnly"])[0], /Path=\/api\/manager-form/);
  assert.equal(getCourseCookieHeader("app=x; PHPSESSID5=session; _csrf=token"), "PHPSESSID5=session; _csrf=token");
  await assert.rejects(() => submitGetCourseWidgetBody(missingConsent, undefined), /GETCOURSE_WIDGET_CONSENT_REQUIRED/);
  const rejected = new URLSearchParams(body); rejected.set(GETCOURSE_ACTION_FIELD, GETCOURSE_ENDPOINT);
  const validationTrace = [];
  await assert.rejects(() => submitGetCourseWidgetBody(rejected, undefined,
    async () => new Response('{"success":true,"data":{"formProcessed":false,"error":"Не получилось обработать форму"}}'),
  (stage, details) => validationTrace.push({ stage, ...details })), /GETCOURSE_SUBMIT_FAILED/);
  assert.ok(validationTrace.some(item => item.stage === "getcourse_post_response" && item.validationError));
  const non2xx = new URLSearchParams(body); non2xx.set(GETCOURSE_ACTION_FIELD, GETCOURSE_ENDPOINT);
  const non2xxTrace = [];
  await assert.rejects(() => submitGetCourseWidgetBody(non2xx, undefined,
    async () => new Response("bad gateway", { status: 502 }),
  (stage, details) => non2xxTrace.push({ stage, ...details })), /GETCOURSE_SUBMIT_FAILED/);
  assert.ok(non2xxTrace.some(item => item.stage === "getcourse_post_error" && item.upstreamStatus === 502));
  const serializedTrace = JSON.stringify([...trace, ...validationTrace, ...non2xxTrace]);
  assert.doesNotMatch(serializedTrace, /test@example\.com|\+79991234567|signature|Подтверждённая цена/);
  console.log("PASS: official widget 1658046, native phone/consent runtime, server-injected dialogue and native payload proxy.");
} finally { hooks.deregister(); }
