import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { createRequire, registerHooks } from "node:module";
import { fileURLToPath } from "node:url";
import { PGlite } from "@electric-sql/pglite";

const root = new URL("../../", import.meta.url);
const require = createRequire(new URL("package.json", root));
const apiRequire = createRequire(new URL("apps/api/package.json", root));
const ts = require("typescript");
const { drizzle } = apiRequire("drizzle-orm/pglite");
const pg = new PGlite();
globalThis.__managerFormDb = drizzle(pg);
const hooks = registerHooks({
  resolve(specifier, context, next) {
    if (specifier === "@workspace/db") return { url: "manager-form:db", shortCircuit: true };
    if (specifier.startsWith(".") && context.parentURL?.startsWith("file:")) {
      for (const suffix of [".ts", "/index.ts"]) { const url = new URL(specifier + suffix, context.parentURL);
        if (existsSync(url)) return { url: url.href, shortCircuit: true }; }
    }
    return next(specifier, context);
  },
  load(url, context, next) {
    if (url === "manager-form:db") return { format: "module", shortCircuit: true, source:
      `export const db=globalThis.__managerFormDb; export * from ${JSON.stringify(new URL("packages/db/src/schema/ai-sessions.ts", root).href)};` };
    if (url.startsWith("file:") && url.endsWith(".ts")) return { format: "module", shortCircuit: true,
      source: ts.transpileModule(readFileSync(new URL(url), "utf8"), { fileName: fileURLToPath(url),
        compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText };
    return next(url, context);
  },
});

const response = () => ({ statusCode: 200, status(code) { this.statusCode = code; return this; },
  headers: [], append(name, value) { this.headers.push([name, value]); return this; },
  set(name, value) { this.headers.push([name, value]); return this; },
  json(body) { this.body = body; return this; }, type(value) { this.contentType = value; return this; },
  send(body) { this.body = body; return this; } });
const traceLogs = [];
const log = { info(data) { traceLogs.push(data); }, error(data) { traceLogs.push(data); } };
try {
  await pg.exec(`CREATE TABLE ai_sessions(id uuid PRIMARY KEY,session_key text NOT NULL UNIQUE,first_page_url text,
    utm_source text,utm_medium text,utm_campaign text,utm_content text,utm_term text,created_at timestamptz DEFAULT now(),updated_at timestamptz DEFAULT now());
    CREATE TABLE ai_dialogue(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),session_id uuid NOT NULL REFERENCES ai_sessions(id),
    message_order integer NOT NULL,speaker text NOT NULL,stage text NOT NULL,message_type text NOT NULL,text text NOT NULL,
    created_at timestamptz DEFAULT now(),UNIQUE(session_id,message_order));
    CREATE TABLE ai_events(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),session_id uuid NOT NULL REFERENCES ai_sessions(id),
    event_type text NOT NULL,event_data jsonb,created_at timestamptz DEFAULT now());`);
  const [{ default: router }, { YandexAIProvider }, { recordEvent }] = await Promise.all([
    import(new URL("apps/api/src/routes/manager-form.ts", root)), import(new URL("apps/api/src/ai/yandex-provider.ts", root)),
    import(new URL("apps/api/src/persistence/artem-repository.ts", root))]);
  YandexAIProvider.prototype.generateStructured = async () => ({ summary: "Проектировщику рекомендован Стройэксперт; уточнены цена и документ." });
  const sessionId = randomUUID();
  await pg.query("INSERT INTO ai_sessions(id,session_key) VALUES($1,$2)", [sessionId, "manager-form"]);
  const rows = [
    ["artem","diagnostic","diagnostic_question","В какой сфере вы сейчас работаете?"],
    ["user","diagnostic","diagnostic_answer","Проектирование и сметы"],
    ["artem","diagnostic","diagnostic_question","Какая у вас роль?"],
    ["user","diagnostic","diagnostic_answer","Инженер, проектировщик или сметчик"],
    ["artem","diagnostic","diagnostic_question","Какое у вас образование?"],
    ["user","diagnostic","diagnostic_answer","Высшее"],
    ["artem","diagnostic","diagnostic_question","С какими задачами вы хотите работать?"],
    ["user","diagnostic","diagnostic_answer","Дефекты и качество строительных работ"],
    ["artem","recommendation","recommendation","Точная рекомендация — «Стройэксперт» для работы с дефектами."],
    ["user","consultation","user_question","Сколько стоит?"], ["artem","consultation","artem_answer","Стоимость зависит от тарифа."],
  ];
  for (const [index,row] of rows.entries()) await pg.query(
    "INSERT INTO ai_dialogue(session_id,message_order,speaker,stage,message_type,text) VALUES($1,$2,$3,$4,$5,$6)",
    [sessionId,index+1,...row]);
  const getHandler = router.stack.find(layer => layer.route?.path === "/manager-form/context/:sessionId").route.stack[0].handle;
  const widgetHandler = router.stack.find(layer => layer.route?.path === "/manager-form/widget/:sessionId").route.stack[0].handle;
  const postHandler = router.stack.find(layer => layer.route?.path === "/manager-form/widget-submit/:sessionId").route.stack[0].handle;
  const contextRes = response(); await getHandler({ params: { sessionId }, log }, contextRes);
  assert.equal(contextRes.statusCode, 200); assert.match(contextRes.body.comment, /Точная рекомендация/);

  const originalFetch = globalThis.fetch; let shouldFail = true; let postedBody;
  globalThis.fetch = async (_url, init = {}) => {
    if (init.method === "POST") { postedBody = init.body; return new Response(shouldFail ? "Не заполнено поле Email" : "success", { status: 200 }); }
  };
  const formBody = { formParams: { email: "test-artem-debug@example.com", full_name: "ТЕСТ Артем_Экспертович_DEBUG",
    phone: "+70000000000", dealCustomFields: { 11904802: "1", 11904803: "1", 22041910: "browser value" } },
    __artem_getcourse_canonical_phone: "+7 (000) 000-00-00",
    pdpConfirmCheckbox: "on", requestTime: "1", requestSimpleSign: "abc", isHtmlWidget: "1",
    __artem_getcourse_action: "https://inobr.ru.com/pl/lite/block-public/process?id=2252008810&gcSession=test" };
  const req = { params: { sessionId }, body: formBody, headers: { cookie: "PHPSESSID5=test; _csrf=test" }, log };
  const missingConsentRes = response(); await postHandler({ ...req, body: { ...formBody,
    formParams: { ...formBody.formParams, dealCustomFields: { ...formBody.formParams.dealCustomFields, 11904803: "" } } } }, missingConsentRes);
  assert.equal(missingConsentRes.statusCode, 400);
  await recordEvent(sessionId, "manager_contact_click");
  let submitRes = response(); await postHandler(req, submitRes); assert.equal(submitRes.statusCode, 502);
  assert.equal((await pg.query("SELECT count(*)::int count FROM ai_events WHERE event_type='manager_form_submit'")).rows[0].count, 0);
  shouldFail = false;
  let realRequestId;
  if (process.env.GETCOURSE_REAL_SUBMIT === "1") {
    globalThis.fetch = originalFetch;
    const widgetRes = response();
    await widgetHandler({ params: { sessionId }, query: { sourceUrl: "https://artem.inobr-expert.ru/", referrer: "" }, log }, widgetRes);
    assert.equal(widgetRes.statusCode, 200);
    const widgetHtml = widgetRes.body;
    const action = /<form[\s\S]*?data-id\s*=\s*["']?2252008810["']?[\s\S]*?action="([^"]+)"/i.exec(widgetHtml)?.[1]
      ?.replaceAll("&amp;", "&");
    assert.ok(action?.startsWith("https://inobr.ru.com/pl/lite/block-public/process?"));
    const realParams = new URLSearchParams();
    for (const [, tag] of widgetHtml.matchAll(/<input\b([^>]*)>/gi)) {
      const name = /\bname="([^"]+)"/i.exec(tag)?.[1];
      if (!name) continue;
      const value = /\bvalue="([^"]*)"/i.exec(tag)?.[1] ?? "";
      realParams.append(name.replaceAll("&amp;", "&"), value.replaceAll("&quot;", '"').replaceAll("&amp;", "&"));
    }
    realParams.set("formParams[email]", "test-artem-debug@example.com");
    realParams.set("formParams[full_name]", "ТЕСТ Артем_Экспертович_DEBUG");
    realParams.set("formParams[phone]", "+79991234567");
    realParams.set("formParams[dealCustomFields][11904802]", "1");
    realParams.set("formParams[dealCustomFields][11904803]", "1");
    realParams.set("pdpConfirmCheckbox", "on");
    realParams.set("requestTime", /window\.requestTime\s*=\s*(\d+)/.exec(widgetHtml)?.[1] ?? "");
    realParams.set("requestSimpleSign", /window\.requestSimpleSign\s*=\s*"([^"]+)"/.exec(widgetHtml)?.[1] ?? "");
    assert.ok(realParams.get("requestTime"));
    assert.ok(realParams.get("requestSimpleSign"));
    realParams.set("__artem_getcourse_action", action);
    const managerFormRequestId = /requestId\.value="([0-9a-f-]{36})"/i.exec(widgetHtml)?.[1];
    assert.ok(managerFormRequestId);
    realRequestId = managerFormRequestId;
    realParams.set("__artem_manager_form_request_id", managerFormRequestId);
    req.body = realParams.toString();
    req.headers.cookie = widgetRes.headers.filter(([name]) => name === "Set-Cookie").map(([, value]) => value.split(";", 1)[0]).join("; ");
    globalThis.fetch = async (url, init = {}) => {
    if (init.method === "POST") postedBody = init.body;
    const response = await originalFetch(url, init);
    if (init.method === "POST") {
      const responseText = await response.clone().text();
      const validationAt = responseText.search(/Не заполнено поле|Заявка не отправлена/i);
      console.log(JSON.stringify({ getCourseStatus: response.status,
        validationMessage: validationAt < 0 ? null : responseText.slice(validationAt, validationAt + 300).replace(/<[^>]+>/g, " ").replace(/\s+/g, " "),
        responsePreview: responseText.replace(/requestSimpleSign[^\s<]*/gi, "[signature removed]").slice(0, 500) }));
    }
    return response;
    };
  }
  submitRes = response(); await postHandler(req, submitRes); assert.equal(submitRes.statusCode, 200);
  assert.equal(submitRes.body, "success");
  assert.equal((await pg.query("SELECT count(*)::int count FROM ai_events WHERE event_type='manager_form_submit'")).rows[0].count, 1);
  assert.equal(postedBody.get("formParams[email]"), "test-artem-debug@example.com");
  assert.equal(postedBody.get("formParams[full_name]"), "ТЕСТ Артем_Экспертович_DEBUG");
  assert.equal(postedBody.get("formParams[phone]"), process.env.GETCOURSE_REAL_SUBMIT === "1" ? "+79991234567" : "+70000000000");
  assert.equal(postedBody.has("__artem_getcourse_canonical_phone"), false);
  assert.equal(postedBody.get("formParams[dealCustomFields][11904802]"), "1");
  assert.equal(postedBody.get("formParams[dealCustomFields][11904803]"), "1");
  assert.equal(postedBody.get("pdpConfirmCheckbox"), "on");
  const submittedComment = postedBody.get("formParams[dealCustomFields][22041910]");
  assert.ok(submittedComment); assert.match(submittedComment, /Сколько стоит\?/);
  for (const part of ["Рекомендованная программа:", "Рекомендация Артёма:", "Диагностика:",
    "Краткое резюме:", "Диалог:", "Session ID:", "Версия базы знаний:"]) assert.ok(submittedComment.includes(part));
  assert.equal((await pg.query("SELECT count(*)::int count FROM ai_events WHERE event_type='manager_contact_click'")).rows[0].count, 1);
  const emptySessionId = randomUUID();
  await pg.query("INSERT INTO ai_sessions(id,session_key) VALUES($1,$2)", [emptySessionId, "manager-form-empty"]);
  const contextFailureRes = response();
  await postHandler({ params: { sessionId: emptySessionId }, body: formBody,
    headers: { cookie: "PHPSESSID5=test" }, log }, contextFailureRes);
  assert.equal(contextFailureRes.statusCode, 409);
  assert.ok(traceLogs.some(item => item.sessionId === emptySessionId && item.stage === "manager_context_error"));
  const serializedLogs = JSON.stringify(traceLogs);
  assert.doesNotMatch(serializedLogs, /test-artem-debug@example\.com|\+79991234567|requestSimpleSign":"|Пользователь: Сколько стоит/);
  globalThis.fetch = originalFetch;
  if (process.env.GETCOURSE_REAL_SUBMIT === "1") console.log(JSON.stringify({ managerFormRequestId: realRequestId,
    timeline: traceLogs.filter(item => item.managerFormRequestId === realRequestId).map(item => ({ stage: item.stage,
      result: item.result, httpStatus: item.httpStatus, successDetected: item.successDetected, validationError: item.validationError })),
    dialogueField: "formParams[dealCustomFields][22041910]",
    commentLength: submittedComment.length, commentFirst200: submittedComment.slice(0, 200),
    commentLast200: submittedComment.slice(-200), transcriptPresent: submittedComment.includes("Пользователь: Сколько стоит?") }));
  console.log(`PASS: current session context, simultaneous payload, failed-submit retry and success-only manager_form_submit event${process.env.GETCOURSE_REAL_SUBMIT === "1" ? "; real GetCourse HTTP submit accepted" : ""}.`);
} finally { hooks.deregister(); await pg.close(); delete globalThis.__managerFormDb; }
