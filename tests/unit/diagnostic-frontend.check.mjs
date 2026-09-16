// Standalone Node assertions; no test runner, browser or real network needed.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
const root = new URL("../../", import.meta.url);
const require = createRequire(new URL("package.json", root));
const ts = require("typescript");
const apiSource = readFileSync(new URL("apps/web/src/lib/api.ts", root), "utf8")
  .replace("import.meta.env.VITE_API_BASE_URL", '""');
const apiCode = ts.transpileModule(apiSource, { compilerOptions: {
  module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022,
} }).outputText;
const apiModule = "data:text/javascript;base64," + Buffer.from(apiCode).toString("base64");
const source = readFileSync(new URL("apps/web/src/lib/diagnostic-result.ts", root), "utf8")
  .replace('"./api"', JSON.stringify(apiModule));
const compiled = ts.transpileModule(source, { compilerOptions: {
  module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022,
} }).outputText;
const { completeDiagnostic, parseDiagnoseResponse } = await import(
  "data:text/javascript;base64," + Buffer.from(compiled).toString("base64")
);
const schemaSource = readFileSync(new URL("apps/web/src/lib/diagnostic-schema.ts", root), "utf8")
  .replace('"./api"', JSON.stringify(apiModule));
const schemaCompiled = ts.transpileModule(schemaSource, { compilerOptions: {
  module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022,
} }).outputText;
const { getDiagnosticSchema, parseDiagnosticSchema } = await import(
  "data:text/javascript;base64," + Buffer.from(schemaCompiled).toString("base64")
);
const dialogueSource = readFileSync(new URL("apps/web/src/lib/diagnostic-dialogue.ts", root), "utf8")
  .replace('"./api"', JSON.stringify(apiModule));
const dialogueCompiled = ts.transpileModule(dialogueSource, { compilerOptions: {
  module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022,
} }).outputText;
const { recordDiagnosticQuestion, recordDiagnosticAnswer } = await import(
  "data:text/javascript;base64," + Buffer.from(dialogueCompiled).toString("base64")
);
const eventsSource = readFileSync(new URL("apps/web/src/lib/events.ts", root), "utf8")
  .replace('"./api"', JSON.stringify(apiModule));
const eventsCompiled = ts.transpileModule(eventsSource, { compilerOptions: {
  module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022,
} }).outputText;
const { recordManagerContactClick } = await import(
  "data:text/javascript;base64," + Buffer.from(eventsCompiled).toString("base64")
);
const fixture = JSON.parse(readFileSync(new URL("diagnose-route.fixtures.json", import.meta.url), "utf8"));
const payload = { conversationId: fixture.conversationId, current_area: fixture.row.currentArea,
  current_role: fixture.row.currentRole, education_status: fixture.row.educationStatus,
  target_tasks: fixture.row.targetTasks };
const response = {
  result: "Readable result", structuredResult: fixture.validResult,
  isAI: false, provider: "fallback", sourceVersion: fixture.expectedSourceVersion,
  fallbackReason: "AI_CONFIGURATION_ERROR",
};
const visibleResponse = { structuredResult: { recommendation: fixture.validResult.recommendation } };
const schema = [
  { questionNumber: 1, field: "current_area", questionText: "Сфера?", options: [
    { code: "construction_repair", label: "Строительство", allowsFreeText: false },
    { code: "other", label: "Другая сфера", allowsFreeText: true },
  ] },
  { questionNumber: 2, field: "current_role", questionText: "Роль?", options: [
    { code: "manager_owner", label: "Руководитель", allowsFreeText: false },
  ] },
  { questionNumber: 3, field: "education_status", questionText: "Образование?", options: [
    { code: "higher", label: "Высшее", allowsFreeText: false },
  ] },
  { questionNumber: 4, field: "target_tasks", questionText: "Задачи?", options: [
    { code: "defects_quality", label: "Дефекты", allowsFreeText: false },
  ] },
];
const originalFetch = globalThis.fetch;
let calls = [];
try {
  globalThis.fetch = async (url, options) => {
    assert.equal(url, "/api/diagnostic/schema"); assert.equal(options.cache, "no-store"); return Response.json(schema);
  };
  const loadedSchema = await getDiagnosticSchema();
  assert.deepEqual(loadedSchema, schema);
  assert.deepEqual(loadedSchema.map(question => question.field),
    ["current_area", "current_role", "education_status", "target_tasks"]);
  assert.deepEqual(loadedSchema[0].options.map(option => option.label), ["Строительство", "Другая сфера"]);
  assert.throws(() => parseDiagnosticSchema([schema[1], schema[0], schema[2], schema[3]]));
  assert.throws(() => parseDiagnosticSchema(schema.map((question, index) => index === 0 ? {
    ...question, options: question.options.map(option => ({ ...option, allowsFreeText: false })),
  } : question)));

  const turnBodies = [];
  globalThis.fetch = async (url, options) => {
    assert.equal(url, "/api/diagnostic/turns"); turnBodies.push(JSON.parse(options.body)); return Response.json({ saved: true });
  };
  await recordDiagnosticQuestion(fixture.conversationId, 1);
  await recordDiagnosticAnswer(fixture.conversationId, 1, "other", "Банковская сфера");
  assert.deepEqual(turnBodies, [
    { conversationId: fixture.conversationId, questionNumber: 1, kind: "question" },
    { conversationId: fixture.conversationId, questionNumber: 1, kind: "answer", answerCode: "other", otherText: "Банковская сфера" },
  ]);

  let eventCalls = 0;
  globalThis.fetch = async (url, options) => {
    eventCalls++;
    assert.equal(url, "/api/events");
    assert.equal(options.method, "POST");
    assert.deepEqual(JSON.parse(options.body), {
      sessionId: fixture.conversationId, eventType: "manager_contact_click",
    });
    return Response.json({ recorded: true }, { status: 201 });
  };
  assert.equal(eventCalls, 0, "rendering/importing must not record an event");
  await recordManagerContactClick(fixture.conversationId);
  assert.equal(eventCalls, 1, "one actual click records one event");

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
  assert.deepEqual(await pending, visibleResponse);
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
  assert.deepEqual(parseDiagnoseResponse(response), visibleResponse);
  assert.throws(() => parseDiagnoseResponse({ ...response, structuredResult: { ...fixture.validResult, recommendation: " " } }));
  globalThis.fetch = async () => Response.json(response);
  assert.deepEqual(await completeDiagnostic(payload, async () => {}), visibleResponse);

  const widget = readFileSync(new URL("apps/web/src/components/chat-widget.tsx", root), "utf8");
  assert.ok(widget.includes("getDiagnosticSchema()"));
  assert.ok(widget.includes("const dictItems = q.options"));
  assert.ok(widget.includes("opt.allowsFreeText"));
  assert.match(widget, /pendingAnswer\.code === "other" \? customInput\.trim\(\) : pendingAnswer\.raw/);
  assert.ok(widget.includes('activeCustomQ === `q${q.questionNumber}`'));
  assert.ok(widget.includes("disabled={!canContinue || isTyping}"));
  assert.match(widget, /current_area:\s*allAnswers\[0\]\.code/);
  assert.match(widget, /allAnswers\[0\]\.code === "other"[\s\S]*current_area_other_text:\s*allAnswers\[0\]\.raw/);
  assert.match(widget, /current_role:\s*allAnswers\[1\]\.code/);
  assert.match(widget, /education_status:\s*allAnswers\[2\]\.code/);
  assert.match(widget, /target_tasks:\s*allAnswers\[3\]\.code/);
  assert.ok(widget.includes("<p>{result.recommendation}</p>"));
  assert.ok(widget.includes("onClick={onGetConsultation}"));
  assert.ok(widget.includes("await recordManagerContactClick(conversationId)"));
  assert.ok(widget.includes('onGetConsultation={() => { void handleManagerContactClick(); }}'));
  for (const legacyBlock of ["result.currentArea", "result.currentRole", "result.education", "result.targetTasks"]) {
    assert.ok(!widget.includes(legacyBlock));
  }
  for (const legacyQuestion of ["С какой сферой связан ваш опыт?", "Какой у вас стаж?", "Какая цель вам ближе?"]) {
    assert.ok(!widget.includes(legacyQuestion));
  }
  console.log("PASS: API schema order/options, required other text, v3 payload, recommendation-only result, save/generate and error paths.");
} finally {
  globalThis.fetch = originalFetch;
}
