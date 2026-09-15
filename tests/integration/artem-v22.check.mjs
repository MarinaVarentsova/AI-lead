// v2.2 A–O: same runtime and first-result formatter as prod and tester.
// Provider transport is mocked; no production DB/network or KB writes.
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { createRequire, registerHooks } from "node:module";
const root = new URL("../../", import.meta.url);
const require = createRequire(new URL("package.json", root));
const ts = require("typescript");
const read = p => readFileSync(new URL(p, root), "utf8");
const hooks = registerHooks({
  resolve(s, c, next) {
    if (s.startsWith(".") && c.parentURL?.startsWith("file:")) {
      for (const ext of [".ts", "/index.ts"]) { const u = new URL(s + ext, c.parentURL); if (existsSync(u)) return { url: u.href, shortCircuit: true }; }
    }
    return next(s, c);
  },
  load(u, c, next) {
    if (u.startsWith("file:") && u.endsWith(".ts")) return { format: "module", shortCircuit: true,
      source: ts.transpileModule(readFileSync(new URL(u), "utf8"), { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText };
    return next(u, c);
  },
});
const originalFetch = globalThis.fetch;
try {
  const { createArtemRuntime, loadArtemKnowledge } = await import(new URL("apps/api/src/ai/artem-runtime.ts", root));
  const { YandexAIProvider } = await import(new URL("apps/api/src/ai/yandex-provider.ts", root));
  const { runTester } = await import(new URL("apps/api/src/tester/runner.ts", root));
  const { CRITERIA, EVALUATOR_PROMPT } = await import(new URL("apps/api/src/tester/evaluator.ts", root));
  const { formatDiagnosticResult } = await import(new URL("apps/api/src/ai/format-diagnostic.ts", root));
  const { validateDiagnosticResult } = await import(new URL("apps/api/src/ai/diagnostic-result.types.ts", root));
  const { DiagnosticKnowledgeResolver } = await import(new URL("packages/domain/src/diagnostic/DiagnosticKnowledgeResolver.ts", root));
  const markdown = await loadArtemKnowledge();
  assert.equal(markdown.replace(/\r\n/g, "\n").trim(), read("knowledge/inobr/artem_unified_knowledge_base_v2_2.md").replace(/\r\n/g, "\n").trim());
  assert.throws(() => createArtemRuntime(read("knowledge/inobr/artem-expertovich-final.md")));
  const base = { experienceArea: "construction", experienceYears: "more_than_10", educationType: "secondary_technical", goal: "construction_expertise" };
  const cases = [
    { label: "A экспертная цель", answers: base, questions: ["Что мне выбрать?"] },
    { label: "B диплом не под рукой", answers: { ...base, educationType: "diploma_not_available" }, questions: ["Что мне выбрать?"] },
    { label: "C уточнение после заключения", answers: { ...base, educationType: "diploma_not_available" }, questions: ["Уточните образование", "Я окончил колледж, просто диплома нет под рукой. Можно поступить?"] },
    { label: "D школа", answers: { ...base, educationType: "school_only" }, questions: ["Почему нельзя поступить?"] },
    { label: "E квартира", answers: { ...base, goal: "apartment_acceptance" }, questions: ["Сколько стоит?"] },
    { label: "F дом разово", answers: { ...base, goalRaw: "Хочу научиться проверять дома перед покупкой" }, questions: ["Сколько стоит?"] },
    { label: "G стройка", answers: { ...base, goalRaw: "Сопровождение строительства дома по этапам" }, questions: ["Сколько стоит?"] },
    { label: "H страница Стройэксперта", answers: { ...base, goal: "research_only", experienceArea: "no_experience", experienceYears: "none" }, questions: ["Что мне выбрать?"] },
    { label: "I память программы", answers: base, questions: ["Мне нужна Приёмка ИЖС", "Сколько стоит это обучение?", "Какой документ?"] },
    { label: "J полная стоимость", answers: base, questions: ["Сколько стоит Премиум?", "9 330 — это весь курс?"] },
    { label: "K дорого", answers: base, questions: ["Сколько стоит Средний?", "Дорого"] },
    { label: "L пауза", answers: base, questions: ["Я подумаю", "Я подумаю"] },
    { label: "M отказ от контакта", answers: base, questions: ["Телефон оставлять не хочу, просто отвечайте здесь", "Сколько стоит?", "Какой документ?"] },
    { label: "N судебная экспертиза", answers: base, questions: ["Можно потом работать судебным экспертом?"] },
    { label: "O неизвестный факт", answers: base, questions: ["Какой номер лицензии?"] },
  ];
  const provider = new YandexAIProvider({});
  let evaluations = 0;
  provider.generateStructured = async (prompt, input) => {
    if (prompt.includes("systemicProblems")) throw Error("Test run-summary fallback");
    evaluations++;
    assert.equal(input.expectedRules.behaviourRules, markdown);
    assert.equal(input.expectedRules.maxAdditionalQuestions, 3);
    assert.match(prompt, /diploma_not_available/);
    assert.match(prompt, /отказа от контакта/);
    return { criteria: Object.fromEntries(CRITERIA.map(k => [k, 90])), strengths: ["v2.2"], problems: [], recommendedFixes: [],
      funnelAssessment: "Контакт уместен", groundingAssessment: "Только v2.2" };
  };
  const runtime = createArtemRuntime(markdown, provider);
  const direct = [];
  for (const persona of cases) {
    const d = await runtime.diagnostic.generateDiagnosticResult(persona.answers);
    assert.equal(d.result.summary, "Ваше персональное заключение после четырёх ответов.");
    const facts = DiagnosticKnowledgeResolver.buildFactsPacket(DiagnosticKnowledgeResolver.resolve(persona.answers));
    assert.doesNotThrow(() => validateDiagnosticResult(d.result, facts), persona.label);
    assert.throws(() => validateDiagnosticResult({ ...d.result, recommendation: "Вам подходит Стройэксперт." }, facts));
    const history = [], transcript = [{ role: "assistant", message: formatDiagnosticResult(d.result) }];
    for (const q of persona.questions) {
      const response = await runtime.reply(runtime.prepare(persona.answers, q, history), history);
      assert.ok(response.message.trim());
      assert.doesNotMatch(response.message, /в базе знаний|рекомендация должна|recommendedTrack|school_only/);
      const pair = [{ role: "user", message: q }, { role: "assistant", message: response.message }];
      history.push(...pair); transcript.push(...pair);
    }
    direct.push({ d: d.result, transcript, history });
  }
  const saved = [];
  for (const group of [cases.slice(0, 10), cases.slice(10)]) {
    const summary = await runTester(group.length, runtime, { async saveCase(c) { saved.push(c); }, async progress() {}, async finish() {} }, group, { sleep: async () => {} });
    assert.equal(summary.TECH_ERROR, 0); assert.equal(summary.averageScore, 90);
    assert.equal(summary.summarySource, "deterministic"); assert.ok(summary.runEvaluation);
  }
  assert.equal(evaluations, 15);
  saved.forEach((result, i) => {
    assert.deepEqual(result.transcript, direct[i].transcript, cases[i].label + ": prod/tester drift");
    assert.deepEqual(result.diagnosticResult.result, direct[i].d);
  });
  const answer = (i, n = 0) => direct[i].history.filter(t => t.role === "assistant")[n].message;
  assert.match(direct[0].d.recommendation, /Стройэксперт.*У вас.*Ваша цель.*дефект.*Связаться с менеджером/);
  assert.match(direct[1].d.recommendation, /Если СПО.*уточнить/); assert.doesNotMatch(direct[1].d.recommendation, /недоступна|нет образования/);
  assert.match(answer(2), /окончили колледж или вуз/);
  assert.doesNotMatch(answer(2, 1), /или такого образования нет\?/);
  assert.match(direct[3].d.recommendation, /Приёмку квартир.*не заменяет/);
  assert.match(answer(4), /28 000.*44 000.*72 000/); assert.doesNotMatch(answer(4), /14 880|6 ×/);
  assert.match(direct[5].d.recommendation, /Приёмка ИЖС/); assert.match(answer(5), /35 100.*62 000.*89 000/);
  assert.match(direct[6].d.recommendation, /Строительный контроль ИЖС/); assert.match(answer(6), /150 000.*3 × 50 000.*210 000.*3 × 70 000/);
  assert.match(direct[7].d.recommendation, /Стройэксперт/);
  assert.match(answer(8, 1), /35 100/); assert.doesNotMatch(answer(8, 1), /14 880/);
  assert.match(answer(8, 2), /нужно уточнить/);
  assert.match(answer(9, 1), /55 980.*9 330.*один из шести/);
  assert.match(answer(10, 1), /дефект.*33 000.*5 500/); assert.doesNotMatch(answer(10, 1), /окупится/);
  assert.match(answer(11), /Что пока осталось неясным/); assert.doesNotMatch(answer(11, 1), /\?/);
  for (const t of direct[12].history.filter(t => t.role === "assistant")) assert.doesNotMatch(t.message, /Связаться с менеджером|оставьте|нажмите/i);
  assert.match(answer(13), /назначение.*отдельно.*не гарантирует/);
  assert.match(answer(14), /параметр требует проверки/);
  const invalid = { ...base }; delete invalid.goal;
  await assert.rejects(runtime.diagnostic.generateDiagnosticResult(invalid), { code: "DIAGNOSTIC_VALIDATION_ERROR" });
  const uncertainHouse = await runtime.diagnostic.generateDiagnosticResult({ ...base, goalRaw: "Интересует ИЖС" });
  assert.match(uncertainHouse.result.recommendation, /условный/);
  assert.match((await runtime.reply(runtime.prepare({ ...base, goalRaw: "Интересует ИЖС" }, "Что выбрать?"), [])).message, /ИЖС/);
  for (const raw of ["Сейчас учусь в колледже", "Иностранный диплом"]) {
    const result = await runtime.diagnostic.generateDiagnosticResult({ ...base, educationType: "diploma_not_available", educationTypeRaw: raw });
    assert.doesNotMatch(result.result.recommendation, /недоступна|отказ/);
  }
  // Exercise real Yandex adapters and inspect both outgoing system prompts.
  const configured = new YandexAIProvider({ AI_PROVIDER: "yandex", YANDEX_AI_BASE_URL: "https://ai.example.test/v1",
    YANDEX_AI_API_KEY: "test-only", YANDEX_AI_MODEL: "gpt://test/model" });
  const packets = [];
  globalThis.fetch = async (_url, init) => {
    const body = JSON.parse(init.body); packets.push(body);
    const response = body.messages[0].content.includes("recommendedTrack —") ? direct[0].d : { message: "Подтверждённый ответ по программе." };
    return Response.json({ choices: [{ finish_reason: "stop", message: { content: JSON.stringify(response) } }] });
  };
  await configured.generateDiagnosticResult(DiagnosticKnowledgeResolver.buildFactsPacket(DiagnosticKnowledgeResolver.resolve(base)));
  await configured.generateConsultantReply(runtime.prepare(base, "Сколько стоит?", [{ role: "user", message: "test@example.invalid +79999999999" }]));
  assert.equal(packets.length, 2);
  for (const packet of packets) {
    assert.ok(packet.messages[0].content.startsWith(markdown));
    assert.doesNotMatch(packet.messages[0].content, /В моей базе нет точной информации/);
  }
  assert.doesNotMatch(packets[1].messages[1].content, /test@example.invalid|79999999999/);
  // No UI/answer-code edits are needed for the new policy.
  assert.match(read("apps/api/src/routes/diagnose.ts"), /getArtemRuntime/);
  assert.match(EVALUATOR_PROMPT, /минимум два подтверждённых факта/);
  console.log("PASS: A–O + diploma corrections/student/foreign/unknown IЖС, prod/tester transcript parity, independent 12-criterion evaluator, exact shared v2.2 system prompts and redacted history. Mocked AI only.");
} finally { globalThis.fetch = originalFetch; hooks.deregister(); }
