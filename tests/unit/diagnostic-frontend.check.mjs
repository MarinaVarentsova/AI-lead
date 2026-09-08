// Standalone Node assertions; no test runner, browser or real network needed.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
const root = new URL("../../", import.meta.url);
const require = createRequire(new URL("package.json", root));
const ts = require("typescript");
const source = readFileSync(new URL("apps/web/src/lib/diagnostic-result.ts", root), "utf8");
const compiled = ts.transpileModule(source, { compilerOptions: {
  module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022,
} }).outputText;
const { completeDiagnostic, parseDiagnoseResponse } = await import(
  "data:text/javascript;base64," + Buffer.from(compiled).toString("base64")
);
const fixture = JSON.parse(readFileSync(new URL("diagnose-route.fixtures.json", import.meta.url), "utf8"));
const payload = { conversationId: fixture.conversationId, ...fixture.row };
const response = {
  result: "Readable result", structuredResult: fixture.validResult,
  isAI: false, provider: "fallback", sourceVersion: fixture.expectedSourceVersion,
  fallbackReason: "AI_CONFIGURATION_ERROR",
};
const originalFetch = globalThis.fetch;
let calls = [];
try {
  globalThis.fetch = async (url, options) => {
    calls.push(url);
    assert.equal(url, "/api/diagnose");
    assert.deepEqual(JSON.parse(options.body), { conversationId: fixture.conversationId });
    return Response.json(response);
  };
  let releaseSave;
  const saved = new Promise(resolve => { releaseSave = resolve; });
  const pending = completeDiagnostic(payload, async data => {
    assert.deepEqual(data, payload);
    calls.push("/api/diagnostic-answers");
    await saved;
  });
  assert.deepEqual(calls, ["/api/diagnostic-answers"]);
  releaseSave();
  assert.deepEqual(await pending, response);
  assert.deepEqual(calls, ["/api/diagnostic-answers", "/api/diagnose"]);

  calls = [];
  await assert.rejects(completeDiagnostic(payload, async () => { throw new Error("Save failed"); }));
  assert.deepEqual(calls, []);
  globalThis.fetch = async () => new Response("Failed", { status: 500 });
  await assert.rejects(completeDiagnostic(payload, async () => {}));
  globalThis.fetch = async () => Response.json({ result: "Old response" });
  await assert.rejects(completeDiagnostic(payload, async () => {}));
  globalThis.fetch = async () => new Response("not JSON");
  await assert.rejects(completeDiagnostic(payload, async () => {}));
  assert.equal(parseDiagnoseResponse(response).structuredResult.importantNote, null);
  assert.equal(parseDiagnoseResponse({ ...response, structuredResult: {
    ...fixture.validResult, importantNote: "Требуется СПО или ВО",
  } }).structuredResult.importantNote, "Требуется СПО или ВО");
  assert.throws(() => parseDiagnoseResponse({ ...response, structuredResult: { ...fixture.validResult, summary: " " } }));
  assert.deepEqual(parseDiagnoseResponse({ ...response, isAI: true, provider: "yandex", fallbackReason: null }).structuredResult, fixture.validResult);
  globalThis.fetch = async () => Response.json(response);
  assert.deepEqual(await completeDiagnostic(payload, async () => {}), response);
  console.log("PASS: 10 frontend helper cases; sequential save/generate, errors, retry, structured AI/fallback; zero real network calls.");
} finally {
  globalThis.fetch = originalFetch;
}
