import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { createRequire, registerHooks } from "node:module";

const root = new URL("../../", import.meta.url);
const require = createRequire(new URL("package.json", root));
const ts = require("typescript");
const hooks = registerHooks({
  resolve(specifier, context, next) {
    if (specifier.startsWith(".") && context.parentURL?.startsWith("file:")) {
      for (const extension of [".ts", "/index.ts"]) {
        const url = new URL(specifier + extension, context.parentURL);
        if (existsSync(url)) return { url: url.href, shortCircuit: true };
      }
    }
    return next(specifier, context);
  },
  load(url, context, next) {
    if (url.startsWith("file:") && url.endsWith(".ts")) return {
      format: "module", shortCircuit: true,
      source: ts.transpileModule(readFileSync(new URL(url), "utf8"), {
        compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
      }).outputText,
    };
    return next(url, context);
  },
});

try {
  const { runTester, normalizeStoredCase, TESTER_AI_TIMEOUT_MS, TESTER_CASE_DELAY_MS, TESTER_RETRY_DELAYS_MS } =
    await import(new URL("apps/api/src/tester/runner.ts", root));
  const { CRITERIA } = await import(new URL("apps/api/src/tester/evaluator.ts", root));
  assert.equal(TESTER_AI_TIMEOUT_MS, 45_000);
  assert.equal(TESTER_CASE_DELAY_MS, 1_000);
  assert.deepEqual(TESTER_RETRY_DELAYS_MS, [1_000, 2_000]);
  assert.match(readFileSync(new URL("apps/api/src/routes/tester.ts", root), "utf8"),
    /AI_REQUEST_TIMEOUT_MS:\s*String\(TESTER_AI_TIMEOUT_MS\)/);

  const answers = { current_area: "construction_repair", current_role: "foreman_master_site_specialist",
    education_status: "higher", target_tasks: "defects_quality" };
  const personas = [1, 2].map(number => ({ label: `Case ${number}`, answers, questions: [`Question ${number}`] }));
  const diagnosticResult = { summary: "Summary", currentArea: "Area", currentRole: "Role",
    education: "Education", targetTasks: "Tasks", recommendation: "Recommendation",
    recommendedTrack: "construction_expertise", importantNote: null };
  const evaluation = { criteria: Object.fromEntries(CRITERIA.map(key => [key, 90])), strengths: ["Stable"],
    problems: [], recommendedFixes: [], funnelAssessment: "Stable", groundingAssessment: "Grounded" };
  const runAssessment = { executiveSummary: "Stable run", systemicProblems: [], strengths: ["Stable"],
    recommendedChanges: [], recommendationsForKnowledgeBase: [],
    trainingRules: ["Rule one", "Rule two", "Rule three"], doNotChange: ["Runtime"] };

  function runtimeFor(overrides = {}) {
    const counters = { diagnostic: 0, reply: 0, evaluator: 0, summary: 0 };
    const runtime = {
      markdown: "## 1. Canonical v4.2\nConfirmed knowledge.",
      diagnostic: { async generate() {
        counters.diagnostic++;
        return overrides.diagnostic ? overrides.diagnostic(counters.diagnostic) : { result: diagnosticResult, source: "ai" };
      } },
      prepare(_answers, question) { return { question, diagnosticContext: "program=construction_expertise",
        matchedSections: [{ id: "one", title: "One", content: "Confirmed knowledge." }] }; },
      async reply(input) {
        counters.reply++;
        return overrides.reply ? overrides.reply(counters.reply, input) : { message: "Answer", isAI: true, provider: "yandex",
          matchedSectionIds: ["one"], fallbackReason: null, questionsUsed: 1, questionsRemaining: 2, limitReached: false };
      },
      provider: { async generateStructured(prompt) {
        if (prompt.includes("systemicProblems")) { counters.summary++; return runAssessment; }
        counters.evaluator++;
        return overrides.evaluator ? overrides.evaluator(counters.evaluator) : evaluation;
      } },
    };
    return { runtime, counters };
  }
  const storeFor = events => ({ async saveCase(result) { events.push(`save:${result.caseNumber}`); },
    async progress(number) { events.push(`progress:${number}`); }, async finish() { events.push("summary:finish"); } });

  // Cases are fully sequential and exactly one 1s pause separates them.
  {
    const events = [], delays = [];
    const { runtime, counters } = runtimeFor();
    const originalGenerate = runtime.diagnostic.generate;
    runtime.diagnostic.generate = async (...args) => { events.push(`diagnostic:${counters.diagnostic + 1}`); return originalGenerate(...args); };
    runtime.provider.generateStructured = async prompt => {
      if (prompt.includes("systemicProblems")) { events.push("summary:start"); return runAssessment; }
      return evaluation;
    };
    await runTester(2, runtime, storeFor(events), personas, { sleep: async ms => { delays.push(ms); events.push(`sleep:${ms}`); } });
    assert.deepEqual(delays, [1_000]);
    assert.ok(events.indexOf("save:1") < events.indexOf("sleep:1000"));
    assert.ok(events.indexOf("sleep:1000") < events.indexOf("diagnostic:2"));
    assert.ok(events.indexOf("save:2") < events.indexOf("summary:start"));
  }

  // Diagnostic generation retries twice with 1s/2s backoff.
  {
    const delays = [];
    const { runtime, counters } = runtimeFor({ diagnostic: attempt => attempt < 3
      ? { result: diagnosticResult, source: "fallback", failureReason: "AI_REQUEST_TIMEOUT" }
      : { result: diagnosticResult, source: "ai" } });
    await runTester(1, runtime, storeFor([]), personas.slice(0, 1), { sleep: async ms => delays.push(ms) });
    assert.equal(counters.diagnostic, 3);
    assert.deepEqual(delays, [1_000, 2_000]);
  }

  // A prod-validated v3 fallback is a valid diagnostic result, not a tester parser failure.
  {
    const saved = [];
    const { runtime, counters } = runtimeFor({ diagnostic: () =>
      ({ result: diagnosticResult, source: "fallback", failureReason: "AI_INVALID_RESULT" }) });
    const summary = await runTester(1, runtime, { async saveCase(result) { saved.push(result); },
      async progress() {}, async finish() {} }, personas.slice(0, 1), { sleep: async () => {} });
    assert.equal(counters.diagnostic, 1);
    assert.equal(saved[0].diagnosticResult.failureReason, "AI_INVALID_RESULT");
    assert.notEqual(saved[0].verdict, "TECH_ERROR");
    assert.equal(summary.TECH_ERROR, 0);
  }

  // Evaluator retry never regenerates Artem's diagnostic or answer.
  {
    const delays = [];
    const { runtime, counters } = runtimeFor({ evaluator: attempt => {
      if (attempt < 3) throw new TypeError("network transport failed");
      return evaluation;
    } });
    await runTester(1, runtime, storeFor([]), personas.slice(0, 1), { sleep: async ms => delays.push(ms) });
    assert.equal(counters.evaluator, 3);
    assert.equal(counters.diagnostic, 1);
    assert.equal(counters.reply, 1);
    assert.deepEqual(delays, [1_000, 2_000]);
  }

  // Exhaustion records stage/code/attempts and excludes TECH_ERROR from averages.
  {
    const saved = [];
    const { runtime } = runtimeFor({ reply: (_attempt, input) => input.question === "Question 2"
      ? { message: "Fallback", fallbackReason: "AI_REQUEST_FAILED" }
      : { message: "Answer", isAI: true, provider: "yandex", matchedSectionIds: ["one"], fallbackReason: null,
        questionsUsed: 1, questionsRemaining: 2, limitReached: false } });
    const summary = await runTester(2, runtime, { async saveCase(result) { saved.push(result); },
      async progress() {}, async finish() {} }, personas, { sleep: async () => {} });
    assert.equal(saved[1].verdict, "TECH_ERROR");
    assert.equal(saved[1].stage, "consultant_generation");
    assert.equal(saved[1].errorCode, "AI_REQUEST_FAILED");
    assert.equal(saved[1].attempts, 3);
    assert.match(saved[1].errorDetail, /AI_REQUEST_FAILED/);
    assert.equal(summary.TECH_ERROR, 1);
    assert.equal(summary.evaluatedCases, 1);
    assert.equal(summary.averageScore, 90);
    const restored = normalizeStoredCase({ evaluatorResult: null, verdict: "TECH_ERROR", score: null,
      errorMessage: JSON.stringify({ stage: saved[1].stage, errorCode: saved[1].errorCode,
        errorDetail: saved[1].errorDetail, attempts: saved[1].attempts }) });
    assert.equal(restored.stage, "consultant_generation");
    assert.equal(restored.errorCode, "AI_REQUEST_FAILED");
    assert.equal(restored.attempts, 3);
    assert.equal(restored.errorDetail, saved[1].errorDetail);
  }

  // Evaluator exhaustion preserves Artem's completed transcript and exact safe failure detail.
  {
    const saved = [];
    const { runtime, counters } = runtimeFor({ evaluator: () => { throw new Error("INVALID_EVALUATION"); } });
    const summary = await runTester(1, runtime, { async saveCase(result) { saved.push(result); },
      async progress() {}, async finish() {} }, personas.slice(0, 1), { sleep: async () => {} }, "Ботан");
    assert.equal(counters.diagnostic, 1); assert.equal(counters.reply, 1); assert.equal(counters.evaluator, 3);
    assert.equal(saved[0].stage, "evaluator"); assert.equal(saved[0].errorCode, "INVALID_EVALUATION");
    assert.equal(saved[0].attempts, 3); assert.match(saved[0].errorDetail, /INVALID_EVALUATION/);
    assert.ok(saved[0].transcript.some(turn => turn.role === "assistant"));
    assert.equal(summary.TECH_ERROR, 1);
  }

  console.log("PASS: tester concurrency=1, inter-case delay, generation/evaluator retry isolation, 45s timeout, TECH_ERROR metadata and average exclusion.");
} finally {
  hooks.deregister();
}
