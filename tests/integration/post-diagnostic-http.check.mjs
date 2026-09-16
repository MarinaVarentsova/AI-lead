// Real loopback HTTP + PostgreSQL (PGlite), actual routes, helpers and widget handlers.
// Only the external AI provider is deterministic. No production connections.
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { createRequire, registerHooks } from "node:module";
import { fileURLToPath } from "node:url";
import { runInNewContext } from "node:vm";
import { webcrypto, randomUUID } from "node:crypto";
import { PGlite } from "@electric-sql/pglite";

const root = new URL("../../", import.meta.url);
const require = createRequire(new URL("package.json", root));
const apiRequire = createRequire(new URL("apps/api/package.json", root));
const ts = require("typescript");
const express = apiRequire("express");
const { drizzle } = apiRequire("drizzle-orm/pglite");
const { getTableConfig, PgDialect } = apiRequire("drizzle-orm/pg-core");
const read = path => readFileSync(new URL(path, root), "utf8");
const transpile = source => ts.transpileModule(source, { compilerOptions: {
  module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022,
} }).outputText;
const pg = new PGlite();
globalThis.__postDiagnosticDb = drizzle(pg);
const hooks = registerHooks({
  resolve(specifier, context, next) {
    if (specifier === "@workspace/db") return { url: "regression:db", shortCircuit: true };
    if (specifier.startsWith(".") && context.parentURL?.startsWith("file:")) {
      const url = new URL(specifier, context.parentURL);
      for (const suffix of [".ts", "/index.ts"]) {
        if (existsSync(new URL(url.href + suffix))) return { url: url.href + suffix, shortCircuit: true };
      }
    }
    return next(specifier, context);
  },
  load(url, context, next) {
    if (url === "regression:db") return { format: "module", shortCircuit: true, source:
      `export const db = globalThis.__postDiagnosticDb;
       export * from ${JSON.stringify(new URL("packages/db/src/schema/ai-sessions.ts", root).href)};` };
    if (url.startsWith("file:") && url.endsWith(".ts")) return {
      format: "module", shortCircuit: true, source: transpile(readFileSync(fileURLToPath(url), "utf8")),
    };
    return next(url, context);
  },
});
let server;
try {
  const schema = await import(new URL("packages/db/src/schema/ai-sessions.ts", root));
  // Materialize the repository schema, including actual column names and FK constraints.
  const dialect = new PgDialect();
  for (const table of [schema.aiSessions, schema.aiConversations, schema.aiDiagnosticAnswers, schema.aiMessages, schema.aiContacts]) {
    const config = getTableConfig(table);
    const columns = config.columns.map(column => {
      let ddl = `"${column.name}" ${column.getSQLType()}`;
      if (column.primary) ddl += " PRIMARY KEY";
      if (column.notNull) ddl += " NOT NULL";
      if (column.isUnique) ddl += " UNIQUE";
      if (column.default !== undefined) ddl += " DEFAULT " + (typeof column.default === "string"
        ? `'${column.default.replaceAll("'", "''")}'` : dialect.sqlToQuery(column.default).sql);
      return ddl;
    });
    for (const fk of config.foreignKeys) {
      const ref = fk.reference();
      columns.push(`FOREIGN KEY (${ref.columns.map(c => `"${c.name}"`).join(",")}) REFERENCES "${getTableConfig(ref.foreignTable).name}" (${ref.foreignColumns.map(c => `"${c.name}"`).join(",")})`);
    }
    await pg.exec(`CREATE TABLE "${config.name}" (${columns.join(",")})`);
  }
  const { YandexAIProvider } = await import(new URL("apps/api/src/ai/yandex-provider.ts", root));
  YandexAIProvider.prototype.generateConsultantReply = async ({ question }) => `Ответ Артёма: ${question}`;
  const app = express();
  const logs = [], requests = [];
  app.use(express.json());
  app.use((req, _res, next) => {
    requests.push(req.path);
    req.log = Object.fromEntries(["info", "warn", "error"].map(level => [level, (data, message) => logs.push({ data, message })]));
    next();
  });
  for (const route of ["sessions", "conversations", "diagnostic-answers", "consultant-chat", "contacts"]) {
    app.use("/api", (await import(new URL(`apps/api/src/routes/${route}.ts`, root))).default);
  }
  server = app.listen(0, "127.0.0.1");
  await new Promise(resolve => server.once("listening", resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  const post = async (path, payload) => {
    const res = await fetch(base + path, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
    return { status: res.status, body: await res.json() };
  };
  const s = await post("/api/sessions", {});
  assert.equal(s.status, 201);
  const c = await post("/api/conversations", { sessionId: s.body.sessionId });
  assert.equal(c.status, 201);
  const conversationId = c.body.conversationId;
  assert.equal((await post("/api/diagnostic-answers", { conversationId,
    current_area: "construction_repair", current_role: "foreman_master_site_specialist",
    education_status: "secondary_vocational", target_tasks: "defects_quality",
  })).status, 201);

  // Execute the actual widget handlers, not copies. Emulate insecure browser globals.
  const widget = ts.createSourceFile("widget.tsx", read("apps/web/src/components/chat-widget.tsx"), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  function handler(name) {
    let expression;
    function visit(node) {
      if (ts.isVariableDeclaration(node) && node.name.getText(widget) === name) expression = node.initializer.getText(widget);
      ts.forEachChild(node, visit);
    }
    visit(widget);
    assert.ok(expression);
    return transpile(`(${expression})`);
  }
  const clientLogs = [];
  const context = { crypto: { getRandomValues: array => webcrypto.getRandomValues(array) },
    Uint8Array, Response, console: { info: (...args) => clientLogs.push(args), error: (...args) => clientLogs.push(args) },
    fetch, conversationId, questionDraft: "Сколько стоит обучение?",
    consultantLimitReached: false, consultantBusy: { current: false }, consultantRequest: { current: null },
    failedQuestion: { current: null }, contactBusy: { current: false }, selectedChannel: "email",
    contactInput: "codex-regression@example.invalid", uid: randomUUID, showNextStep() {},
    setConsultantLoading() {}, setConsultantMessages() {}, setQuestionDraft() {},
    setConsultantLimitReached(value) { context.consultantLimitReached = value; },
    setConsultantError(value) { context.consultantError = value; },
    setContactError(value) { context.contactError = value; }, setContactSubmitting() {},
    setContactPhase(value) { context.contactPhase = value; },
  };
  // Load actual transport + helpers into the same insecure context.
  const helperCode = [read("apps/web/src/lib/api.ts").replace("import.meta.env.VITE_API_BASE_URL", JSON.stringify(base)),
    read("apps/web/src/lib/consultant-chat.ts"), read("apps/web/src/lib/contact.ts")]
    .map(source => transpile(source).replace(/^import .*;\r?\n/gm, "").replace(/\bexport /g, "")).join("\n");
  const setup = helperCode + "\n";
  // Baseline proof: old handler raises before HTTP fetch in this same context.
  const oldHandler = handler("handleConsultantSubmit").replace("createConsultantRequestId()", "crypto.randomUUID()");
  const before = requests.length;
  await runInNewContext(setup + oldHandler.replace(/;\s*$/, "") + "()", context);
  assert.equal(context.consultantError, true);
  assert.equal(requests.length, before);
  const invokeWidget = name => runInNewContext(setup + handler(name).replace(/;\s*$/, "") + "()", { ...context });
  // Lose both acknowledgements after the server has committed the first question.
  const wireFetch = context.fetch;
  context.fetch = async (...args) => { await wireFetch(...args); throw new TypeError("Lost acknowledgement"); };
  await invokeWidget("handleConsultantSubmit");
  const firstId = context.consultantRequest.current.id;
  assert.match(firstId, /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  context.fetch = wireFetch;
  await invokeWidget("handleConsultantSubmit");
  assert.equal(context.consultantError, false);
  assert.equal(context.consultantRequest.current, null);
  const replay = await post("/api/consultant-chat", { conversationId, message: context.questionDraft, requestId: firstId });
  assert.equal(replay.status, 200); assert.ok(replay.body.message.trim()); assert.equal(replay.body.questionsUsed, 1);
  for (const message of ["Какие документы нужны?", "Когда начинается обучение?"]) {
    const result = await post("/api/consultant-chat", { conversationId, message, requestId: randomUUID() });
    assert.equal(result.status, 200); assert.ok(result.body.message.trim());
  }
  const fourth = await post("/api/consultant-chat", { conversationId, message: "Четвёртый?", requestId: randomUUID() });
  assert.equal(fourth.status, 409); assert.equal(fourth.body.error, "FOLLOW_UP_LIMIT");
  assert.equal((await pg.query("SELECT count(*)::int AS n FROM ai_messages WHERE step='post_diagnostic_chat' AND role='user'")).rows[0].n, 3);

  await invokeWidget("handleSubmitContact");
  assert.equal(context.contactPhase, "submitted"); assert.equal(context.contactError, false);
  const rows = (await pg.query("SELECT * FROM ai_contacts")).rows;
  assert.equal(rows.length, 1); assert.equal(rows[0].email, context.contactInput);
  assert.equal(rows[0].contact_channel, "email"); assert.equal(rows[0].conversation_id, conversationId);
  const telegram = await post("/api/contacts", { conversationId, contactChannel: "telegram", telegram: "@regression_test" });
  assert.equal(telegram.status, 201); assert.equal(telegram.body.conversationId, conversationId);
  const saved = (await pg.query("SELECT * FROM ai_contacts WHERE id=$1", [telegram.body.contactId])).rows[0];
  assert.equal(saved.telegram, "@regression_test"); assert.equal(saved.contact_channel, "telegram"); assert.equal(saved.phone, null);
  context.selectedChannel = "call"; context.contactInput = "+79999999999";
  await invokeWidget("handleSubmitContact");
  assert.equal((await pg.query("SELECT phone FROM ai_contacts WHERE contact_channel='call'")).rows[0].phone, context.contactInput);
  context.contactPhase = "details"; context.selectedChannel = "unknown";
  await invokeWidget("handleSubmitContact");
  assert.equal(context.contactPhase, "details"); assert.equal(context.contactError, true);
  context.selectedChannel = "email";
  // Real SQL error, not a mocked rejected promise. Restore column afterwards.
  await pg.exec("ALTER TABLE ai_contacts RENAME COLUMN contact_channel TO unavailable_channel");
  await invokeWidget("handleSubmitContact");
  assert.equal(context.contactPhase, "details"); assert.equal(context.contactError, true);
  assert.equal((await pg.query("SELECT count(*)::int AS n FROM ai_contacts")).rows[0].n, 3);
  await pg.exec("ALTER TABLE ai_contacts RENAME COLUMN unavailable_channel TO contact_channel");
  const failure = logs.find(log => log.message === "CONTACT_REQUEST_FAILED");
  assert.equal(failure.data.stage, "insert"); assert.equal(failure.data.errorCode, "42703");
  assert.equal(failure.data.httpStatus, 500);
  for (const { data, message } of logs.filter(log => log.message.startsWith("CONTACT_"))) {
    assert.ok(Object.keys(data).every(key => ["requestId", "stage", "errorCode", "httpStatus", "constraint"].includes(key)));
    assert.ok(!JSON.stringify({ data, message }).includes(context.contactInput));
  }
  for (const [, data] of clientLogs) {
    assert.ok(Object.keys(data).every(key => ["stage", "errorCode", "httpStatus"].includes(key)));
  }
  assert.ok(!JSON.stringify(clientLogs).includes("@"));
  assert.ok(clientLogs.some(([message, data]) => message === "CONTACT_CLIENT_FAILED" && data.httpStatus === 400));
  assert.ok(clientLogs.some(([message, data]) => message === "CONTACT_CLIENT_FAILED" && data.httpStatus === 500));
  console.log("PASS: actual widget handlers without randomUUID → HTTP POST → PostgreSQL; chat 200/retry/200/200/409, exactly 3 questions; email/telegram/phone persisted, 201 receipt; validation and real DB failure never confirm success. External AI stubbed; production untouched.");
} finally {
  if (server) { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); }
  hooks.deregister(); delete globalThis.__postDiagnosticDb; await pg.close();
}
