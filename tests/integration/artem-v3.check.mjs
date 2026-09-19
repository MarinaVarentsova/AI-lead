// v3.7 A–O: production and tester use the same runtime and canonical knowledge.
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { createRequire, registerHooks } from "node:module";

const root = new URL("../../", import.meta.url);
const require = createRequire(new URL("package.json", root));
const ts = require("typescript");
const read = path => readFileSync(new URL(path, root), "utf8");
const hooks = registerHooks({
  resolve(specifier, context, next) {
    if (specifier.startsWith(".") && context.parentURL?.startsWith("file:")) {
      for (const suffix of [".ts", "/index.ts"]) {
        const url = new URL(specifier + suffix, context.parentURL);
        if (existsSync(url)) return { url: url.href, shortCircuit: true };
      }
    }
    return next(specifier, context);
  },
  load(url, context, next) {
    if (url.startsWith("file:") && url.endsWith(".ts")) return { format: "module", shortCircuit: true,
      source: ts.transpileModule(readFileSync(new URL(url), "utf8"), {
        compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
      }).outputText };
    return next(url, context);
  },
});

try {
  const { createArtemRuntime, loadArtemKnowledge } = await import(new URL("apps/api/src/ai/artem-runtime.ts", root));
  const { YandexAIProvider } = await import(new URL("apps/api/src/ai/yandex-provider.ts", root));
  const { runTester } = await import(new URL("apps/api/src/tester/runner.ts", root));
  const { generatePersonas } = await import(new URL("apps/api/src/tester/personas.ts", root));
  const { TESTER_MODES, fallbackStressPersonas } = await import(new URL("apps/api/src/tester/stress-modes.ts", root));
  const { CRITERIA, EVALUATOR_PROMPT } = await import(new URL("apps/api/src/tester/evaluator.ts", root));
  const { DIAGNOSTIC_SCHEMA } = await import(new URL("packages/domain/src/diagnostic/diagnostic-schema.ts", root));
  const canonical = read("knowledge/inobr/artem_unified_knowledge_base_v3_7.md");
  assert.equal((await loadArtemKnowledge()).replace(/\r\n/g, "\n").trim(), canonical.replace(/\r\n/g, "\n").trim());
  assert.equal(existsSync(new URL("knowledge/inobr/artem_unified_knowledge_base_v3.md", root)), false);
  assert.equal(existsSync(new URL("knowledge/inobr/artem_unified_knowledge_base_v3_1.md", root)), false);
  assert.equal(existsSync(new URL("knowledge/inobr/artem_unified_knowledge_base_v3_2.md", root)), false);
  assert.equal(existsSync(new URL("knowledge/inobr/artem_unified_knowledge_base_v4_0.md", root)), false);
  assert.match(canonical, /Версия 3\.7/);
  assert.throws(() => createArtemRuntime("# Устаревшая база"));

  const base = { current_area: "construction_repair", current_role: "foreman_master_site_specialist",
    education_status: "higher", target_tasks: "defects_quality" };
  const cases = [
    ["A дефекты", base, ["Что мне выбрать?"]],
    ["B ущерб", { ...base, target_tasks: "damage_loss" }, ["Чем поможет обучение?"]],
    ["C судебная", { ...base, education_status: "secondary_vocational", target_tasks: "judicial_construction_expertise" }, ["Можно работать судебным экспертом?"]],
    ["D изучает", { ...base, target_tasks: "explore" }, ["Что выбрать?"]],
    ["E приёмка", { ...base, target_tasks: "apartment_house_acceptance" }, ["Что выбрать?"]],
    ["F студент", { ...base, education_status: "currently_studying" }, ["Можно начать сейчас?"]],
    ["G без СПО", { ...base, education_status: "no_higher_or_secondary_vocational" }, ["Что доступно?"]],
    ["H СПО", { ...base, education_status: "secondary_vocational" }, ["Подхожу ли я?"]],
    ["I проектировщик", { ...base, current_area: "design_estimates", current_role: "engineer_designer_estimator" }, ["Что даст программа?"]],
    ["J контроль", { ...base, current_area: "construction_control", current_role: "manager_owner" }, ["Как расширить задачи?"]],
    ["K оценщик", { ...base, current_area: "real_estate_valuation_law", current_role: "valuer_lawyer_expert", target_tasks: "damage_loss" }, ["Подойдёт ли мне?"]],
    ["L другая сфера", { ...base, current_area: "other", current_area_other_text: "Промышленная безопасность", current_role: "not_in_construction" }, ["С чего начать?"]],
    ["M память", base, ["Мне нужна Приёмка ИЖС", "Сколько стоит это обучение?"]],
    ["N отказ", base, ["Не хочу оставлять контакт, просто ответьте", "Какой документ?"]],
    ["O неизвестное", base, ["Какой номер лицензии?"]],
  ].map(([label, answers, questions]) => ({ label, answers, questions }));

  const provider = new YandexAIProvider({});
  provider.generateStructured = async prompt => {
    if (prompt.includes("systemicProblems")) throw new Error("summary unavailable");
    return { criteria: Object.fromEntries(CRITERIA.map(key => [key, 90])), strengths: ["v3.7"], problems: [],
      recommendedFixes: [], funnelAssessment: "Корректно", groundingAssessment: "Только v3.7" };
  };
  const runtime = createArtemRuntime(canonical, provider);
  const schemaCodes = Object.fromEntries(DIAGNOSTIC_SCHEMA.map(question =>
    [question.field, new Set(question.options.map(option => option.code))]));
  for (const persona of generatePersonas(10, () => 0.42)) {
    for (const field of DIAGNOSTIC_SCHEMA.map(question => question.field)) {
      assert.ok(schemaCodes[field].has(persona.answers[field]), `${field} must come from shared schema`);
    }
    for (const legacy of ["experience_area", "experience_years", "education_type", "goal"]) {
      assert.equal(legacy in persona.answers, false);
    }
  }
  const direct = [];
  for (const persona of cases) {
    const diagnostic = await runtime.diagnostic.generateDiagnosticResult(persona.answers);
    assert.ok(diagnostic.result.recommendation.trim(), persona.label);
    const history = [];
    for (const question of persona.questions) {
      const reply = await runtime.reply(runtime.prepare(persona.answers, question, history), history);
      assert.ok(reply.message.trim(), persona.label);
      assert.doesNotMatch(reply.message, /recommendedTrack|education_status|target_tasks|в базе знаний/i);
      history.push({ role: "user", message: question }, { role: "assistant", message: reply.message });
    }
    direct.push({ diagnostic: diagnostic.result, history });
  }
  const saved = [];
  for (const group of [cases.slice(0, 10), cases.slice(10)]) {
    const summary = await runTester(group.length, runtime, { async saveCase(value) { saved.push(value); }, async progress() {}, async finish() {} }, group, { sleep: async () => {} });
    assert.equal(summary.TECH_ERROR, 0);
    assert.equal(summary.averageScore, 90);
  }
  saved.forEach((result, index) => {
    assert.deepEqual(result.diagnosticResult.result, direct[index].diagnostic, cases[index].label);
    assert.deepEqual(result.transcript.slice(1), direct[index].history, cases[index].label);
  });
  const invalidStructuredProvider = new YandexAIProvider({});
  invalidStructuredProvider.generateDiagnosticResult = async () => ({ recommendation: "wrong legacy shape" });
  invalidStructuredProvider.generateStructured = provider.generateStructured;
  const fallbackRuntime = createArtemRuntime(canonical, invalidStructuredProvider);
  const fallbackCases = [cases[0], cases[5], cases[6], cases[4]];
  const fallbackSaved = [];
  const fallbackSummary = await runTester(fallbackCases.length, fallbackRuntime, {
    async saveCase(value) { fallbackSaved.push(value); }, async progress() {}, async finish() {},
  }, fallbackCases, { sleep: async () => {} });
  assert.equal(fallbackSummary.TECH_ERROR, 0);
  for (const result of fallbackSaved) {
    assert.equal(result.diagnosticResult.source, "fallback");
    assert.equal(result.diagnosticResult.failureReason, "AI_INVALID_RESULT");
    assert.ok(result.diagnosticResult.result.recommendation.trim());
    assert.notEqual(result.verdict, "TECH_ERROR");
  }
  const syntheticCases = generatePersonas(10, () => 0.42);
  const syntheticSaved = [];
  const syntheticSummary = await runTester(10, runtime, {
    async saveCase(value) { syntheticSaved.push(value); }, async progress() {}, async finish() {},
  }, syntheticCases, { sleep: async () => {} });
  assert.equal(syntheticSaved.length, 10);
  assert.ok(syntheticSaved.every(result => result.diagnosticResult?.result?.recommendation?.trim()));
  assert.ok(syntheticSaved.every(result => result.transcript.length >= 3));
  assert.ok(syntheticSaved.every(result => result.evaluatorResult));
  assert.deepEqual({ PASS: syntheticSummary.PASS, REVIEW: syntheticSummary.REVIEW,
    FAIL: syntheticSummary.FAIL, TECH_ERROR: syntheticSummary.TECH_ERROR },
  { PASS: 10, REVIEW: 0, FAIL: 0, TECH_ERROR: 0 });
  const acceptanceCase = syntheticSaved.find(result => result.persona.label === "Приёмка объектов");
  assert.ok(acceptanceCase, "synthetic run must include Приёмка объектов");
  assert.notEqual(acceptanceCase.verdict, "TECH_ERROR");
  assert.ok(acceptanceCase.diagnosticResult?.result?.recommendation?.trim());
  assert.ok(syntheticSummary.runEvaluation);
  const modeSmoke = {};
  for (const mode of TESTER_MODES) {
    const count = ["Быдло", "Ботан", "Разводило"].includes(mode) ? 10 : 5;
    const smokeCases = fallbackStressPersonas(count, mode, () => 0.42);
    const smokeSaved = [];
    const smokeSummary = await runTester(count, runtime, { async saveCase(value) { smokeSaved.push(value); },
      async progress() {}, async finish() {} }, smokeCases, { sleep: async () => {} }, mode);
    modeSmoke[mode] = { PASS: smokeSummary.PASS, REVIEW: smokeSummary.REVIEW, FAIL: smokeSummary.FAIL,
      TECH_ERROR: smokeSummary.TECH_ERROR };
    assert.equal(smokeSaved.length, count); assert.equal(smokeSummary.mode, mode);
    assert.deepEqual(modeSmoke[mode], { PASS: count, REVIEW: 0, FAIL: 0, TECH_ERROR: 0 },
      JSON.stringify(smokeSaved.filter(item => item.verdict === "TECH_ERROR").map(item => ({ label: item.persona.label,
        questions: item.persona.questions, stage: item.stage, code: item.errorCode, detail: item.errorDetail }))));
  }
  assert.match(direct[4].diagnostic.recommendation, /Приёмка квартир.*Приёмка ИЖС/);
  assert.match(direct[5].diagnostic.recommendation, /выпускные документы/i);
  assert.match(direct[6].diagnostic.recommendation, /При.мк[ау] квартир/);
  assert.match(direct[9].diagnostic.recommendation, /Стройэксперт/);
  assert.doesNotMatch(direct[9].diagnostic.recommendation, /Строительный контроль ИЖС/);
  assert.match(direct[8].history[1].message, /проектн.*техническ.*документац/i);
  assert.match(direct[8].history[1].message, /исследова.*дефект/i);
  assert.match(direct[8].history[1].message, /экспертн.*заключен/i);
  assert.doesNotMatch(direct[8].history[1].message, /требует проверки|уточн.*менеджер/i);
  assert.match(direct[9].history[1].message, /фиксац.*качеств/i);
  assert.match(direct[9].history[1].message, /причин.*дефект/i);
  assert.match(direct[9].history[1].message, /экспертн.*(?:вывод|заключен)/i);
  assert.doesNotMatch(direct[9].history[1].message, /требует проверки|уточн.*менеджер/i);
  assert.match(direct[8].diagnostic.recommendation, /проектирован|проектн.*документац/i);
  const supervisionHistory = [];
  const supervisionQuestion = "Хочу сопровождать стройку ИЖС по этапам и вести технадзор";
  const supervision = await runtime.reply(runtime.prepare(base, supervisionQuestion, supervisionHistory), supervisionHistory);
  assert.match(supervision.message, /Строительный контроль ИЖС/);
  const limitHistory = [];
  for (const question of ["Что входит?", "Какой документ?", "Сколько стоит?"]) {
    const reply = await runtime.reply(runtime.prepare(base, question, limitHistory), limitHistory);
    limitHistory.push({ role: "user", message: question }, { role: "assistant", message: reply.message });
  }
  await assert.rejects(runtime.reply(runtime.prepare(base, "Четвёртый вопрос", limitHistory), limitHistory), /FOLLOW_UP_LIMIT/);
  for (const turn of direct[13].history.filter(turn => turn.role === "assistant")) assert.doesNotMatch(turn.message, /оставьте (?:контакт|телефон)|нажмите «Связаться|свяжитесь с менеджером/i);
  assert.match(EVALUATOR_PROMPT, /KB v3\.7/);
  for (const evaluatorGuard of [/не требуй цену.*если пользователь.*не спрашивал/i, /проверь transcript по смыслу/i,
    /Базовый — для основ/, /портфолио из примеров заключений/, /соцсети/, /retrieval\/behavior failure/i,
    /Не придумывай названия модулей/i, /Различай подтверждённую учебную работу и overclaim/i,
    /После полного профессионального\/справочного ответа textual CTA не обязателен/i, /не требуй выяснять, дело в цене или пользе/i]) {
    assert.match(EVALUATOR_PROMPT, evaluatorGuard);
  }
  for (const rule of [/ровно четыре стартовых поля/, /стаж не спрашивается/, /2–3 подтверждённых факта/,
    /apartment_house_acceptance/, /currently_studying/, /no_higher_or_secondary_vocational/,
    /current_area и current_role сами по себе не переключают/, /технадзор ИЖС/, /важнее landing priority/]) {
    assert.match(EVALUATOR_PROMPT, rule);
  }
  console.log("PASS: v3.7 A–O, 10-case Быдло/Ботан/Разводило and 5-case other-mode smoke; prod/tester runtime parity, education guards, refusal and evaluator contract.");
} finally {
  hooks.deregister();
}
