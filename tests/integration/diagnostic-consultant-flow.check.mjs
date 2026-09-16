// Unified Artem persistence integration: real Drizzle queries against local PGlite.
import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { createRequire, registerHooks } from "node:module";
import { fileURLToPath } from "node:url";
import { randomUUID } from "node:crypto";
import { PGlite } from "@electric-sql/pglite";

const root = new URL("../../", import.meta.url);
const require = createRequire(new URL("package.json", root));
const apiRequire = createRequire(new URL("apps/api/package.json", root));
const ts = require("typescript");
const { drizzle } = apiRequire("drizzle-orm/pglite");
const pg = new PGlite();
globalThis.__unifiedPersistenceDb = drizzle(pg);

const hooks = registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier === "@workspace/db") return { url: "unified-persistence:db", shortCircuit: true };
    if (specifier.startsWith(".") && context.parentURL?.startsWith("file:")) {
      const url = new URL(specifier, context.parentURL);
      for (const suffix of [".ts", "/index.ts"]) {
        if (existsSync(new URL(url.href + suffix))) return { url: url.href + suffix, shortCircuit: true };
      }
    }
    return nextResolve(specifier, context);
  },
  load(url, context, nextLoad) {
    if (url === "unified-persistence:db") return { format: "module", shortCircuit: true, source:
      `export const db = globalThis.__unifiedPersistenceDb;
       export * from ${JSON.stringify(new URL("packages/db/src/schema/ai-sessions.ts", root).href)};` };
    if (url.startsWith("file:") && url.endsWith(".ts")) return { format: "module", shortCircuit: true,
      source: ts.transpileModule(readFileSync(new URL(url), "utf8"), {
        fileName: fileURLToPath(url), compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
      }).outputText };
    return nextLoad(url, context);
  },
});

const response = () => ({ statusCode: 200, status(code) { this.statusCode = code; return this; }, json(body) { this.body = body; return this; } });
const log = { info() {}, warn() {}, error() {} };
const invoke = async (router, path, body) => {
  const handler = router.stack.find(layer => layer.route?.path === path).route.stack[0].handle;
  const res = response();
  await handler({ body, log }, res);
  return res;
};

try {
  await pg.exec(`
    CREATE TABLE ai_sessions (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(), session_key text NOT NULL UNIQUE,
      first_page_url text, utm_source text, utm_medium text, utm_campaign text,
      utm_content text, utm_term text, created_at timestamptz DEFAULT now(), updated_at timestamptz DEFAULT now()
    );
    CREATE TABLE ai_dialogue (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(), session_id uuid NOT NULL REFERENCES ai_sessions(id) ON DELETE CASCADE,
      message_order integer NOT NULL, speaker text NOT NULL, stage text NOT NULL,
      message_type text NOT NULL, text text NOT NULL, created_at timestamptz DEFAULT now(),
      UNIQUE(session_id, message_order)
    );
    CREATE TABLE ai_events (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(), session_id uuid NOT NULL REFERENCES ai_sessions(id) ON DELETE CASCADE,
      event_type text NOT NULL, event_data jsonb, created_at timestamptz DEFAULT now()
    );
  `);

  const [{ default: sessions }, { default: conversations }, { default: diagnosticTurns }, { default: diagnosticAnswers },
    { default: diagnose }, { default: consultant }, repository, { YandexAIProvider }] = await Promise.all([
    import(new URL("apps/api/src/routes/sessions.ts", root)),
    import(new URL("apps/api/src/routes/conversations.ts", root)),
    import(new URL("apps/api/src/routes/diagnostic-turns.ts", root)),
    import(new URL("apps/api/src/routes/diagnostic-answers.ts", root)),
    import(new URL("apps/api/src/routes/diagnose.ts", root)),
    import(new URL("apps/api/src/routes/consultant-chat.ts", root)),
    import(new URL("apps/api/src/persistence/artem-repository.ts", root)),
    import(new URL("apps/api/src/ai/yandex-provider.ts", root)),
  ]);
  YandexAIProvider.prototype.generateConsultantReply = async ({ question }) => `Ответ Артёма: ${question}`;

  // A/B: create once and reuse the same session_key.
  const sessionKey = "integration-session-key";
  const first = await invoke(sessions, "/sessions", { sessionKey });
  const repeated = await invoke(sessions, "/sessions", { sessionKey });
  assert.equal(first.statusCode, 201);
  assert.equal(repeated.statusCode, 200);
  assert.equal(repeated.body.sessionId, first.body.sessionId);
  assert.equal((await pg.query("SELECT count(*)::int AS n FROM ai_sessions WHERE session_key=$1", [sessionKey])).rows[0].n, 1);

  const ready = await invoke(conversations, "/conversations", { sessionId: first.body.sessionId });
  assert.equal(ready.statusCode, 201);
  assert.equal(ready.body.conversationId, first.body.sessionId);
  const sessionId = ready.body.conversationId;

  // C/D/E: canonical question/answer pairs, human labels, strict order and idempotent replay.
  const answers = { conversationId: sessionId, current_area: "other", current_area_other_text: "Банковская сфера",
    current_role: "foreman_master_site_specialist", education_status: "secondary_vocational", target_tasks: "defects_quality" };
  const turns = [
    { answerCode: "other", otherText: "Банковская сфера" },
    { answerCode: "foreman_master_site_specialist" },
    { answerCode: "secondary_vocational" },
    { answerCode: "defects_quality" },
  ];
  for (const [index, answer] of turns.entries()) {
    const questionNumber = index + 1;
    assert.equal((await invoke(diagnosticTurns, "/diagnostic/turns",
      { conversationId: sessionId, questionNumber, kind: "question" })).statusCode, 201);
    if (questionNumber === 1) {
      const shown = (await pg.query("SELECT * FROM ai_dialogue WHERE session_id=$1 ORDER BY message_order", [sessionId])).rows;
      assert.equal(shown.length, 1); assert.equal(shown[0].message_type, "diagnostic_question");
    }
    assert.equal((await invoke(diagnosticTurns, "/diagnostic/turns",
      { conversationId: sessionId, questionNumber, kind: "answer", ...answer })).statusCode, 201);
    if (questionNumber === 1) {
      const answered = (await pg.query("SELECT * FROM ai_dialogue WHERE session_id=$1 ORDER BY message_order", [sessionId])).rows;
      assert.deepEqual(answered.map(row => row.message_type), ["diagnostic_question", "diagnostic_answer"]);
    }
  }
  assert.equal((await invoke(diagnosticAnswers, "/diagnostic-answers", answers)).statusCode, 201);
  assert.equal((await invoke(diagnosticAnswers, "/diagnostic-answers", answers)).statusCode, 201);
  const diagnosticRows = (await pg.query("SELECT * FROM ai_dialogue WHERE session_id=$1 ORDER BY message_order", [sessionId])).rows;
  assert.equal(diagnosticRows.length, 8);
  assert.deepEqual(diagnosticRows.map(row => row.message_order), [1, 2, 3, 4, 5, 6, 7, 8]);
  assert.deepEqual(diagnosticRows.map(row => row.message_type), ["diagnostic_question", "diagnostic_answer",
    "diagnostic_question", "diagnostic_answer", "diagnostic_question", "diagnostic_answer",
    "diagnostic_question", "diagnostic_answer"]);
  assert.equal(diagnosticRows[1].text, "Другая сфера: Банковская сфера");
  await assert.rejects(pg.query(`INSERT INTO ai_dialogue
    (session_id,message_order,speaker,stage,message_type,text) VALUES ($1,8,'user','diagnostic','diagnostic_answer','duplicate')`, [sessionId]));

  // F: persist the exact recommendation as one separate chronological row.
  const recommendation = await invoke(diagnose, "/diagnose", { conversationId: sessionId });
  assert.equal(recommendation.statusCode, 200);
  const recommendationRows = (await pg.query("SELECT * FROM ai_dialogue WHERE session_id=$1 AND message_type='recommendation'", [sessionId])).rows;
  assert.equal(recommendationRows.length, 1);
  assert.equal(recommendationRows[0].speaker, "artem");
  assert.equal(recommendationRows[0].stage, "recommendation");
  assert.equal(recommendationRows[0].text, recommendation.body.result);

  // G/H/I: question and answer share the same history and remain strictly ordered.
  const requestId = randomUUID();
  const consultation = await invoke(consultant, "/consultant-chat", {
    conversationId: sessionId, requestId, message: "Сколько стоит обучение?",
  });
  assert.equal(consultation.statusCode, 200);
  assert.ok(consultation.body.message.trim());
  const replay = await invoke(consultant, "/consultant-chat", {
    conversationId: sessionId, requestId, message: "Сколько стоит обучение?",
  });
  assert.equal(replay.statusCode, 200);
  assert.equal(replay.body.replayed, true);
  const history = await repository.readDialogue(globalThis.__unifiedPersistenceDb, sessionId);
  assert.deepEqual(history.map(row => row.messageOrder), Array.from({ length: 11 }, (_, index) => index + 1));
  assert.deepEqual(history.slice(-2).map(row => [row.speaker, row.stage, row.messageType]), [
    ["user", "consultation", "user_question"], ["artem", "consultation", "artem_answer"],
  ]);

  // J: generic event persistence writes the supplied type/data without touching dialogue.
  await repository.recordEvent(sessionId, "manager_contact_click", { source: "integration" });
  const events = (await pg.query("SELECT * FROM ai_events WHERE session_id=$1", [sessionId])).rows;
  assert.equal(events.length, 1);
  assert.equal(events[0].event_type, "manager_contact_click");
  assert.deepEqual(events[0].event_data, { source: "integration" });

  // K: production runtime must not reference tables removed from the prepared database.
  const productionRoots = ["apps/api/src/routes", "apps/api/src/persistence", "apps/api/src/services"];
  const files = [];
  const collect = path => {
    for (const entry of readdirSync(new URL(path + "/", root))) {
      const next = `${path}/${entry}`;
      const full = fileURLToPath(new URL(next, root));
      if (statSync(full).isDirectory()) collect(next); else if (/\.ts$/.test(entry)) files.push(next);
    }
  };
  productionRoots.forEach(collect);
  for (const file of files.filter(file => !file.includes("/tester"))) {
    const source = readFileSync(new URL(file, root), "utf8");
    for (const removed of ["ai_conversations", "ai_messages", "ai_diagnostic_answers", "ai_contacts"]) {
      assert.ok(!source.includes(removed), `${file} still references ${removed}`);
    }
  }

  console.log("PASS A-K: unified ai_sessions/ai_dialogue/ai_events persistence, ordering, idempotency, event and old-table scan.");
} finally {
  hooks.deregister();
  delete globalThis.__unifiedPersistenceDb;
  await pg.close();
}
