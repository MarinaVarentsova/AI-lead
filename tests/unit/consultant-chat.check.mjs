// Node 22.15+; uses existing TypeScript for in-memory loading, no new test runner.
// Run: node tests/unit/diagnose-route.check.mjs
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { registerHooks, createRequire } from "node:module";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = new URL("../../", import.meta.url);
const require = createRequire(new URL("package.json", root));
const ts = require("typescript");
const fixture = JSON.parse(readFileSync(new URL("diagnose-route.fixtures.json", import.meta.url), "utf8"));
const apiRequire = createRequire(new URL("apps/api/package.json", root));
// Deliberately resolve through the API workspace link: do not hide broken wiring.
assert.ok(apiRequire.resolve("@workspace/domain/diagnostic").endsWith("index.ts"));

let state;
let schema;
let fetchCalls = 0;
const originalFetch = globalThis.fetch;
globalThis.fetch = async () => { fetchCalls++; throw new Error("Network disabled for consultant checks"); };
const envNames = ["AI_PROVIDER", "YANDEX_AI_BASE_URL", "YANDEX_AI_API_KEY", "YANDEX_AI_MODEL"];
const savedEnv = Object.fromEntries(envNames.map(key => [key, process.env[key]]));
process.env.AI_PROVIDER = "yandex";
process.env.YANDEX_AI_BASE_URL = "https://ai.api.cloud.yandex.net/v1";
delete process.env.YANDEX_AI_API_KEY;
delete process.env.YANDEX_AI_MODEL;

const db = {
  select() {
    state.reads++;
    return { from(table) {
      assert.equal(table, schema.aiDiagnosticAnswers);
      return { where(query) {
        assert.ok(query);
        return { async limit(count) {
          assert.equal(count, 1);
          if (state.loadFailure) throw new Error("private database detail");
          return state.row ? [state.row] : [];
        } };
      } };
    } };
  },
  insert(table) {
    assert.equal(table, schema.aiMessages);
    return { values(value) {
      state.writes.push(value);
      return { async returning() {
        if (state.saveFailure) throw new Error("private database detail");
        state.saved = true;
        return [{ id: "22222222-2222-4222-8222-222222222222" }];
      } };
    } };
  },
};
globalThis.__diagnoseCheckDB = db;
const hooks = registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier === "@workspace/db") return { url: "diagnose-check:db", shortCircuit: true };
    if (specifier.startsWith(".") && context.parentURL?.startsWith("file:")) {
      const url = new URL(specifier, context.parentURL);
      for (const suffix of [".ts", "/index.ts"]) {
        const candidate = new URL(url.href + suffix);
        if (existsSync(candidate)) return { url: candidate.href, shortCircuit: true };
      }
    }
    return nextResolve(specifier, context);
  },
  load(url, context, nextLoad) {
    if (url === "diagnose-check:db") {
      return { format: "module", shortCircuit: true, source:
        `export const db = globalThis.__diagnoseCheckDB;
         export { aiDiagnosticAnswers, aiMessages } from ${JSON.stringify(new URL("packages/db/src/schema/ai-sessions.ts", root).href)};` };
    }
    if (url.startsWith("file:") && url.endsWith(".ts")) {
      return { format: "module", shortCircuit: true, source: ts.transpileModule(
        readFileSync(new URL(url), "utf8"), {
          fileName: fileURLToPath(url),
          compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
        },
      ).outputText };
    }
    return nextLoad(url, context);
  },
});


let checks = 0;
try {
  schema = await import(new URL("packages/db/src/schema/ai-sessions.ts", root));
  const { default: router } = await import(new URL("apps/api/src/routes/consultant-chat.ts", root));
  const { YandexAIProvider } = await import(new URL("apps/api/src/ai/index.ts", root));
  const handler = router.stack.find(layer => layer.route?.path === "/consultant-chat").route.stack[0].handle;
  const originalGenerate = YandexAIProvider.prototype.generateConsultantReply;
  let captured;
  async function run({ message = "Сколько стоит обучение?", conversationId = fixture.conversationId,
    row = fixture.row, status = 200, aiReply, saveFailure = false } = {}) {
    state = { row, reads: 0, writes: [], logs: [], saved: false, saveFailure };
    captured = undefined;
    YandexAIProvider.prototype.generateConsultantReply = async function(input) {
      assert.equal(state.writes.length, 1, "Save user before generation");
      captured = input;
      assert.deepEqual(Object.keys(input), ["question", "diagnosticContext", "matchedSections"]);
      assert.ok(input.matchedSections.length >= 2 && input.matchedSections.length <= 5);
      for (const section of input.matchedSections) assert.deepEqual(Object.keys(section), ["id", "title", "content"]);
      assert.ok(!JSON.stringify(input).includes("knowledge_base_id:"));
      assert.ok(!JSON.stringify(input).includes("Lead Score"));
      return aiReply ?? originalGenerate.call(this, input);
    };
    const log = Object.fromEntries(["info", "warn", "error"].map(level => [level, (...args) => state.logs.push({ level, args })]));
    const res = { statusCode: 200, status(value) { this.statusCode = value; return this; }, json(body) { this.body = body; return this; } };
    try { await handler({ body: { conversationId, message }, log }, res); }
    finally { YandexAIProvider.prototype.generateConsultantReply = originalGenerate; }
    assert.equal(res.statusCode, status);
    const events = state.logs.map(entry => entry.args.at(-1));
    assert.equal(events[0], "CONSULTANT_CHAT_START");
    assert.equal(events.at(-1), "CONSULTANT_CHAT_FINISH");
    if (status === 200) {
      assert.ok(res.body.message.length > 60);
      assert.deepEqual(state.writes, [
        { conversationId, role: "user", step: "post_diagnostic_chat", message: message.trim() },
        { conversationId, role: "assistant", step: "post_diagnostic_chat", message: res.body.message },
      ]);
      assert.deepEqual(res.body.matchedSectionIds, captured.matchedSections.map(s => s.id));
      assert.deepEqual(events, ["CONSULTANT_CHAT_START", "CONSULTANT_CONTEXT_LOADED", "CONSULTANT_KNOWLEDGE_RESOLVED", "CONSULTANT_AI_CALL_START",
        ...(res.body.isAI ? ["CONSULTANT_AI_CALL_SUCCESS"] : ["CONSULTANT_AI_CALL_FAILED", "CONSULTANT_FALLBACK_USED"]),
        "CONSULTANT_MESSAGES_SAVED", "CONSULTANT_CHAT_FINISH"]);
    } else if (status !== 500) { assert.deepEqual(state.writes, []); assert.equal(captured, undefined); }
    checks++;
    return res.body;
  }
  const examples = [];
  for (const message of ["Сколько стоит обучение?", "Можно ли с экономическим дипломом?", "Можно потом работать судебным экспертом?", "Где брать заказы?"]) {
    const result = await run({ message });
    assert.equal(result.isAI, false);
    assert.equal(result.fallbackReason, "AI_CONFIGURATION_ERROR");
    examples.push({ question: message, answer: result.message });
  }
  assert.ok(examples[0].answer.includes("14 900"));
  assert.ok(examples[1].answer.includes("любое среднее профессиональное"));
  assert.ok(examples[2].answer.includes("гарантировать судебный результат нельзя"));
  assert.ok(examples[3].answer.includes("не могу гарантировать"));
  const school = await run({ row: { ...fixture.row, educationType: "school_only" } });
  assert.ok(school.message.includes("одного аттестата недостаточно"));
  for (const message of ["", " ", null, "a".repeat(4001)]) await run({ message, status: 400 });
  await run({ conversationId: "invalid", status: 400 });
  await run({ row: null, status: 404 });
  await run({ row: { ...fixture.row, goal: null }, status: 400 });
  const ai = await run({ aiReply: "Стоимость зависит от выбранного тарифа и состава программы. Предусмотрена рассрочка на шесть месяцев." });
  assert.equal(ai.isAI, true);
  await run({ message: "Меня зовут Иван Петров. +79999999999 test@example.org @private_user. Сколько стоит обучение?",
    row: { ...fixture.row, name: "PRIVATE_NAME", phone: "PRIVATE_PHONE", goalRaw: "PRIVATE_RAW" } });
  for (const privateValue of ["Иван", "Петров", "79999999999", "test@example.org", "@private_user", "PRIVATE_"]) {
    assert.ok(!JSON.stringify(captured).includes(privateValue));
    assert.ok(!JSON.stringify(state.logs).includes(privateValue));
  }
  await run({ saveFailure: true, status: 500 });
  assert.equal(captured, undefined);
  assert.equal(fetchCalls, 0);
  // Inspect the actual Yandex request with fake configuration and an in-memory fetch.
  let outbound;
  globalThis.fetch = async (_url, options) => {
    outbound = JSON.parse(options.body);
    return Response.json({ choices: [{ finish_reason: "stop", message: { content: JSON.stringify({ message: "Проверочный ответ консультанта." }) } }] });
  };
  const provider = new YandexAIProvider({ AI_PROVIDER: "yandex", YANDEX_AI_BASE_URL: "https://example.invalid/v1", YANDEX_AI_API_KEY: "test-only", YANDEX_AI_MODEL: "gpt://test/model/latest" });
  await provider.generateConsultantReply({ question: "Сколько стоит обучение? @private_user", diagnosticContext: "educationType=non_profile",
    matchedSections: [{ id: "prices", title: "Цена", content: "Только выбранная секция" }], contact: "PRIVATE_CONTACT", markdown: "PRIVATE_FULL_KB" });
  assert.ok(!JSON.stringify(outbound).includes("PRIVATE_"));
  assert.ok(!JSON.stringify(outbound).includes("@private_user"));
  assert.equal(outbound.messages.length, 2);
  console.log(`PASS: ${checks} consultant route cases; mocked provider payload; zero real network calls.`);
  for (const example of examples.slice(0, 3)) console.log(JSON.stringify(example));
} finally {
  hooks.deregister();
  globalThis.fetch = originalFetch;
  delete globalThis.__diagnoseCheckDB;
  for (const key of envNames) {
    if (savedEnv[key] === undefined) delete process.env[key];
    else process.env[key] = savedEnv[key];
  }
}
