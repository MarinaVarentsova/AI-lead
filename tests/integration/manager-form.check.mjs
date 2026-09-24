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
  json(body) { this.body = body; return this; } });
const log = { error() {} };
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
  const postHandler = router.stack.find(layer => layer.route?.path === "/manager-form/submit").route.stack[0].handle;
  const contextRes = response(); await getHandler({ params: { sessionId }, log }, contextRes);
  assert.equal(contextRes.statusCode, 200); assert.match(contextRes.body.comment, /Точная рекомендация/);

  const originalFetch = globalThis.fetch;
  let shouldFail = true; let postedBody;
  globalThis.fetch = async (_url, init = {}) => {
    if (init.method === "POST") { postedBody = init.body; return new Response(shouldFail ? "Произошла ошибка" : "success", { status: 200 }); }
    return new Response('window.requestTime=1;window.requestSimpleSign="abc";', { status: 200 });
  };
  const req = { body: { sessionId, email: "test-artem@example.com", fullName: "ТЕСТ Артем_Экспертович",
    phone: "+70000000000", sourceUrl: "https://artem.inobr-expert.ru/", referrer: "" }, log };
  await recordEvent(sessionId, "manager_contact_click");
  let submitRes = response(); await postHandler(req, submitRes); assert.equal(submitRes.statusCode, 502);
  assert.equal((await pg.query("SELECT count(*)::int count FROM ai_events WHERE event_type='manager_form_submit'")).rows[0].count, 0);
  shouldFail = false;
  if (process.env.GETCOURSE_REAL_SUBMIT === "1") globalThis.fetch = originalFetch;
  submitRes = response(); await postHandler(req, submitRes); assert.equal(submitRes.statusCode, 201);
  assert.equal((await pg.query("SELECT count(*)::int count FROM ai_events WHERE event_type='manager_form_submit'")).rows[0].count, 1);
  assert.equal(postedBody.get("formParams[email]"), "test-artem@example.com");
  if (postedBody) assert.match(postedBody.get("formParams[dealCustomFields][11904802]"), /Сколько стоит\?/);
  assert.equal((await pg.query("SELECT count(*)::int count FROM ai_events WHERE event_type='manager_contact_click'")).rows[0].count, 1);
  globalThis.fetch = originalFetch;
  console.log(`PASS: current session context, simultaneous payload, failed-submit retry and success-only manager_form_submit event${process.env.GETCOURSE_REAL_SUBMIT === "1" ? "; real GetCourse HTTP submit accepted" : ""}.`);
} finally { hooks.deregister(); await pg.close(); delete globalThis.__managerFormDb; }
