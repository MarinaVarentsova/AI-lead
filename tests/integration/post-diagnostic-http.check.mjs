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
  for (const table of [schema.aiSessions, schema.aiDialogue, schema.aiEvents]) {
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
  for (const route of ["sessions", "conversations", "diagnostic-answers", "consultant-chat"]) {
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
    consultantBusy: { current: false }, consultantRequest: { current: null },
    failedQuestion: { current: null }, uid: randomUUID, showNextStep() {},
    setConsultantLoading() {}, setConsultantMessages() {}, setQuestionDraft() {},
    setConsultantError(value) { context.consultantError = value; },
  };
  // Load actual transport + helpers into the same insecure context.
  const helperCode = [read("apps/web/src/lib/api.ts").replace("import.meta.env.VITE_API_BASE_URL", JSON.stringify(base)),
    read("apps/web/src/lib/consultant-chat.ts")]
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
  for (const message of ["Какие документы нужны?", "Когда начинается обучение?", "Четвёртый вопрос?", "Пятый вопрос?", "Шестой вопрос?"]) {
    const result = await post("/api/consultant-chat", { conversationId, message, requestId: randomUUID() });
    assert.equal(result.status, 200); assert.ok(result.body.message.trim());
  }
  assert.equal((await pg.query("SELECT count(*)::int AS n FROM ai_dialogue WHERE stage='consultation' AND speaker='user'")).rows[0].n, 6);
  assert.equal((await pg.query("SELECT count(*)::int AS n FROM ai_dialogue WHERE stage='diagnostic'")).rows[0].n, 8);
  console.log("PASS: actual insecure-context widget handler → HTTP POST → unified dialogue; retry idempotency and unlimited consultation preserved.");
} finally {
  if (server) { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); }
  hooks.deregister(); delete globalThis.__postDiagnosticDb; await pg.close();
}
