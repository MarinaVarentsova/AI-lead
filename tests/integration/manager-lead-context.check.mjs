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
globalThis.__managerContextDb = drizzle(pg);
const hooks = registerHooks({
  resolve(specifier, context, next) {
    if (specifier === "@workspace/db") return { url: "manager-context:db", shortCircuit: true };
    if (specifier.startsWith(".") && context.parentURL?.startsWith("file:")) {
      for (const suffix of [".ts", "/index.ts"]) {
        const url = new URL(specifier + suffix, context.parentURL);
        if (existsSync(url)) return { url: url.href, shortCircuit: true };
      }
    }
    return next(specifier, context);
  },
  load(url, context, next) {
    if (url === "manager-context:db") return { format: "module", shortCircuit: true, source:
      `export const db = globalThis.__managerContextDb;
       export * from ${JSON.stringify(new URL("packages/db/src/schema/ai-sessions.ts", root).href)};` };
    if (url.startsWith("file:") && url.endsWith(".ts")) return { format: "module", shortCircuit: true,
      source: ts.transpileModule(readFileSync(new URL(url), "utf8"), { fileName: fileURLToPath(url),
        compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText };
    return next(url, context);
  },
});

const response = () => ({ statusCode: 200, status(code) { this.statusCode = code; return this; }, json(body) { this.body = body; return this; } });
const log = { info() {}, warn() {}, error() {} };

try {
  await pg.exec(`
    CREATE TABLE ai_sessions (id uuid PRIMARY KEY, session_key text NOT NULL UNIQUE, first_page_url text,
      utm_source text, utm_medium text, utm_campaign text, utm_content text, utm_term text,
      created_at timestamptz DEFAULT now(), updated_at timestamptz DEFAULT now());
    CREATE TABLE ai_dialogue (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), session_id uuid NOT NULL REFERENCES ai_sessions(id),
      message_order integer NOT NULL, speaker text NOT NULL, stage text NOT NULL, message_type text NOT NULL,
      text text NOT NULL, created_at timestamptz DEFAULT now(), UNIQUE(session_id,message_order));
    CREATE TABLE ai_events (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), session_id uuid NOT NULL REFERENCES ai_sessions(id),
      event_type text NOT NULL, event_data jsonb, created_at timestamptz DEFAULT now());
  `);
  const [{ buildManagerLeadContext, MANAGER_LEAD_SUMMARY_PROMPT }, { default: router }, { YandexAIProvider }] = await Promise.all([
    import(new URL("apps/api/src/services/manager-lead-context.ts", root)),
    import(new URL("apps/api/src/routes/manager-lead-context.ts", root)),
    import(new URL("apps/api/src/ai/yandex-provider.ts", root)),
  ]);
  assert.match(MANAGER_LEAD_SUMMARY_PROMPT, /Не придумывай намерение купить, бюджет, степень готовности/);
  assert.match(MANAGER_LEAD_SUMMARY_PROMPT, /Максимум 1000 символов/);

  const sessionId = randomUUID();
  await pg.query("INSERT INTO ai_sessions(id,session_key,created_at) VALUES($1,$2,$3)",
    [sessionId, "manager-context", "2026-09-22T10:00:00.000Z"]);
  const recommendation = "В вашем случае основная рекомендация — «Стройэксперт». Она связана с работой с документацией и экспертными заключениями.";
  const rows = [
    ["artem", "diagnostic", "diagnostic_question", "В какой сфере вы сейчас работаете?"],
    ["user", "diagnostic", "diagnostic_answer", "Проектирование и сметы"],
    ["artem", "diagnostic", "diagnostic_question", "Какая у вас роль?"],
    ["user", "diagnostic", "diagnostic_answer", "Инженер, проектировщик или сметчик"],
    ["artem", "diagnostic", "diagnostic_question", "Какое у вас образование?"],
    ["user", "diagnostic", "diagnostic_answer", "Высшее"],
    ["artem", "diagnostic", "diagnostic_question", "С какими задачами вы хотите работать?"],
    ["user", "diagnostic", "diagnostic_answer", "Судебные строительно-технические экспертизы"],
    ["artem", "recommendation", "recommendation", recommendation],
    ["user", "consultation", "user_question", "Сколько стоит обучение?"],
    ["artem", "consultation", "artem_answer", "Есть четыре тарифа с подтверждёнными ценами."],
    ["user", "consultation", "user_question", "Какой документ я получу?"],
    ["artem", "consultation", "artem_answer", "Диплом о профессиональной переподготовке."],
    ["evaluator", "tester", "evaluation", "Скрытая оценка не должна попасть в transcript"],
  ];
  for (const [index, row] of rows.entries()) await pg.query(
    "INSERT INTO ai_dialogue(session_id,message_order,speaker,stage,message_type,text) VALUES($1,$2,$3,$4,$5,$6)",
    [sessionId, index + 1, ...row]);

  let summaryInput;
  YandexAIProvider.prototype.generateStructured = async (prompt, input) => {
    assert.equal(prompt, MANAGER_LEAD_SUMMARY_PROMPT); summaryInput = input;
    return { summary: "Пользователь работает с проектированием и уточнил стоимость и документ. Диалог завершён ответом о дипломе." };
  };
  const context = await buildManagerLeadContext(sessionId);
  assert.equal(context.recommendationText, recommendation);
  assert.equal(context.recommendedProgram, "Стройэксперт");
  assert.deepEqual(context.diagnostic, { currentArea: "Проектирование и сметы",
    currentRole: "Инженер, проектировщик или сметчик", educationStatus: "Высшее",
    targetTasks: "Судебные строительно-технические экспертизы" });
  assert.deepEqual(context.transcript, [
    { role: "user", text: "Сколько стоит обучение?" },
    { role: "assistant", text: "Есть четыре тарифа с подтверждёнными ценами." },
    { role: "user", text: "Какой документ я получу?" },
    { role: "assistant", text: "Диплом о профессиональной переподготовке." },
  ]);
  assert.equal(context.summarySource, "ai"); assert.equal(context.knowledgeBaseVersion, "inobr-artem-v3.9");
  assert.equal(context.createdAt, "2026-09-22T10:00:00.000Z");
  assert.equal(summaryInput.recommendationText, recommendation);
  assert.equal(JSON.stringify(summaryInput).includes("Скрытая оценка"), false);

  YandexAIProvider.prototype.generateStructured = async () => { throw new Error("provider unavailable"); };
  const fallback = await buildManagerLeadContext(sessionId);
  assert.equal(fallback.summarySource, "fallback"); assert.match(fallback.dialogSummary, /задал 2 дополнительных вопросов/);

  const emptySession = randomUUID();
  await pg.query("INSERT INTO ai_sessions(id,session_key) VALUES($1,$2)", [emptySession, "empty-context"]);
  for (const [index, row] of rows.slice(0, 9).entries()) await pg.query(
    "INSERT INTO ai_dialogue(session_id,message_order,speaker,stage,message_type,text) VALUES($1,$2,$3,$4,$5,$6)",
    [emptySession, index + 1, ...row]);
  const withoutFollowups = await buildManagerLeadContext(emptySession);
  assert.deepEqual(withoutFollowups.transcript, []); assert.match(withoutFollowups.dialogSummary, /задал 0 дополнительных вопросов/);

  const auth = router.stack.find(layer => !layer.route).handle;
  const handler = router.stack.find(layer => layer.route?.path === "/internal/manager-lead-context/:sessionId").route.stack[0].handle;
  async function invoke(id, token) {
    const req = { params: { sessionId: id }, get: name => name === "X-Internal-Tester-Token" ? token : undefined, log };
    const res = response(); let next;
    auth(req, res, () => { next = handler(req, res); });
    if (next) await next;
    return res;
  }
  process.env.INTERNAL_TESTER_ENABLED = "true"; process.env.INTERNAL_TESTER_TOKEN = "internal-secret";
  assert.equal((await invoke(sessionId, "wrong")).statusCode, 401);
  assert.equal((await invoke(randomUUID(), "internal-secret")).statusCode, 404);
  assert.equal((await invoke(sessionId, "internal-secret")).statusCode, 200);

  const pending = randomUUID();
  await pg.query("INSERT INTO ai_sessions(id,session_key) VALUES($1,$2)", [pending, "pending-context"]);
  assert.equal((await invoke(pending, "internal-secret")).statusCode, 409);
  console.log("PASS A-J: deterministic manager context, exact recommendation, labels, chronology, summary/fallback, protected endpoint and transcript filtering.");
} finally {
  hooks.deregister(); await pg.close(); delete globalThis.__managerContextDb;
  delete process.env.INTERNAL_TESTER_ENABLED; delete process.env.INTERNAL_TESTER_TOKEN;
}
