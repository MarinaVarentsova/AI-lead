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
globalThis.fetch = async () => { fetchCalls++; throw new Error("Network disabled for diagnostic checks"); };
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
  const { default: router } = await import(new URL("apps/api/src/routes/diagnose.ts", root));
  const { YandexAIProvider, parseDiagnosticResult } = await import(new URL("apps/api/src/ai/index.ts", root));
  const { DiagnosticKnowledgeResolver } = await import(pathToFileURL(apiRequire.resolve("@workspace/domain/diagnostic")));
  const route = router.stack.find(layer => layer.route?.path === "/diagnose").route;
  const handler = route.stack[0].handle;
  const originalGenerate = YandexAIProvider.prototype.generateDiagnosticResult;

  async function run({ body = { conversationId: fixture.conversationId }, row = fixture.row,
    status = 200, providerResult, saveFailure = false, loadFailure = false } = {}) {
    state = { row, reads: 0, writes: [], logs: [], saved: false, saveFailure, loadFailure };
    let providerCalls = 0;
    YandexAIProvider.prototype.generateDiagnosticResult = async function(facts) {
      providerCalls++;
      assert.deepEqual(Object.keys(facts), fixture.factsPacketKeys);
      return providerResult ?? originalGenerate.call(this, facts);
    };
    const log = Object.fromEntries(["info", "warn", "error"].map(level => [level, (...args) => state.logs.push({ level, args })]));
    const res = {
      statusCode: 200,
      status(value) { this.statusCode = value; return this; },
      json(value) {
        assert.equal(this.body, undefined);
        if (this.statusCode === 200) assert.equal(state.saved, true, "Persist before HTTP success");
        this.body = value;
        return this;
      },
    };
    try { await handler({ body, log }, res); }
    finally { YandexAIProvider.prototype.generateDiagnosticResult = originalGenerate; }
    assert.equal(res.statusCode, status);
    const events = state.logs.map(entry => entry.args.at(-1));
    assert.equal(events[0], "DIAGNOSTIC_RESULT_START");
    assert.equal(events.at(-1), "DIAGNOSTIC_RESULT_FINISH");
    assert.ok(!JSON.stringify(state.logs).includes("private database detail"));
    if (status === 200) {
      assert.deepEqual(state.writes, [{ conversationId: fixture.conversationId, role: "assistant",
        step: "diagnostic_result", message: res.body.result }]);
      assert.equal(res.body.sourceVersion, fixture.expectedSourceVersion);
      for (const key of ["summary", "experience", "experienceYears", "education", "goal", "recommendation"]) {
        assert.ok(res.body.structuredResult[key].trim());
        assert.ok(res.body.result.includes(res.body.structuredResult[key]));
      }
      assert.ok(!res.body.result.includes("recommendedTrack"));
      const middle = res.body.isAI ? ["DIAGNOSTIC_AI_CALL_SUCCESS"] : ["DIAGNOSTIC_AI_CALL_FAILED", "DIAGNOSTIC_FALLBACK_USED"];
      assert.deepEqual(events, ["DIAGNOSTIC_RESULT_START", "DIAGNOSTIC_ANSWERS_LOADED",
        "DIAGNOSTIC_KNOWLEDGE_RESOLVED", "DIAGNOSTIC_AI_CALL_START", ...middle,
        "DIAGNOSTIC_RESULT_SAVED", "DIAGNOSTIC_RESULT_FINISH"]);
      assert.equal(providerCalls, 1);
    } else if (status !== 500) {
      assert.equal(providerCalls, 0);
      assert.deepEqual(state.writes, []);
    }
    checks++;
    return res.body;
  }

  const fallback = await run();
  assert.equal(fallback.isAI, false);
  assert.equal(fallback.provider, "fallback");
  assert.equal(fallback.fallbackReason, "AI_CONFIGURATION_ERROR");
  assert.equal(fallback.structuredResult.recommendedTrack, "construction_expertise");
  for (const body of [null, {}, { conversationId: "invalid" }, { conversationId: 123 }]) {
    await run({ body, status: 400 });
    assert.equal(state.reads, 0);
  }
  await run({ row: null, status: 404 });
  for (const key of ["experienceArea", "experienceYears", "educationType", "goal"]) {
    for (const value of [null, "", "unknown_code"]) {
      const result = await run({ row: { ...fixture.row, [key]: value }, status: 400 });
      assert.equal(result.error, "DIAGNOSTIC_VALIDATION_ERROR");
      assert.ok(result.issues.some(issue => issue.field === key));
    }
  }
  const schoolRow = { ...fixture.row, educationType: "school_only", educationTypeRaw: "Школа" };
  for (const providerResult of [undefined, fixture.validResult]) {
    const school = await run({ row: schoolRow, providerResult });
    assert.equal(school.structuredResult.recommendedTrack, "not_defined");
    assert.ok(school.structuredResult.importantNote);
    assert.ok(!school.result.includes("construction_expertise"));
    assert.equal(school.isAI, false);
  }
  const apartment = await run({ row: { ...fixture.row, goal: "apartment_acceptance" } });
  assert.equal(apartment.structuredResult.recommendedTrack, "apartment_acceptance");
  const success = await run({ providerResult: fixture.validResult });
  assert.equal(success.isAI, true);
  assert.equal(success.provider, "yandex");
  assert.equal(success.fallbackReason, null);
  await run({ saveFailure: true, status: 500 });
  assert.ok(!state.logs.some(entry => entry.args.at(-1) === "DIAGNOSTIC_RESULT_SAVED"));
  await run({ loadFailure: true, status: 500 });

  await run({ row: { ...fixture.row,
    experienceAreaRaw: "PRIVATE_RAW_ANSWER",
    contact: { phone: "PRIVATE_PHONE", email: "PRIVATE_EMAIL", telegram: "PRIVATE_TELEGRAM", name: "PRIVATE_NAME" },
  } });
  assert.ok(!JSON.stringify(state.logs).includes("PRIVATE_"));

  const facts = DiagnosticKnowledgeResolver.buildFactsPacket(DiagnosticKnowledgeResolver.resolve(fixture.row));
  assert.deepEqual(parseDiagnosticResult("```json\n" + JSON.stringify(fixture.validResult) + "\n```", facts), fixture.validResult);
  assert.throws(() => parseDiagnosticResult("not json", facts), { code: "AI_INVALID_RESULT" });
  assert.equal(fetchCalls, 0);
  console.log(`PASS: ${checks} route cases; parser checks; workspace resolution; zero fetch calls.`);
} finally {
  hooks.deregister();
  globalThis.fetch = originalFetch;
  delete globalThis.__diagnoseCheckDB;
  for (const key of envNames) {
    if (savedEnv[key] === undefined) delete process.env[key];
    else process.env[key] = savedEnv[key];
  }
}
