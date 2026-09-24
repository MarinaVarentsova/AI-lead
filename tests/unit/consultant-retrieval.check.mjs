// Run with Node 22.15+: node tests/unit/consultant-retrieval.check.mjs
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { registerHooks, createRequire } from "node:module";
const root = new URL("../../", import.meta.url);
const require = createRequire(new URL("package.json", root));
const ts = require("typescript");
const hooks = registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier.startsWith(".") && context.parentURL?.startsWith("file:")) {
      const url = new URL(specifier + ".ts", context.parentURL);
      if (existsSync(url)) return { url: url.href, shortCircuit: true };
    }
    return nextResolve(specifier, context);
  },
  load(url, context, nextLoad) {
    if (url.startsWith("file:") && url.endsWith(".ts")) return {
      format: "module", shortCircuit: true,
      source: ts.transpileModule(readFileSync(new URL(url), "utf8"), {
        compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
      }).outputText,
    };
    return nextLoad(url, context);
  },
});
try {
  const { ConsultantKnowledgeResolver, createConsultantSections } = await import(new URL("packages/domain/src/consultant/index.ts", root));
  const markdown = readFileSync(new URL("knowledge/inobr/artem_unified_knowledge_base_v3_9.md", root), "utf8");
  const resolver = new ConsultantKnowledgeResolver(markdown);
  const fixtures = JSON.parse(readFileSync(new URL("consultant-retrieval.fixtures.json", import.meta.url), "utf8"));
  for (const fixture of fixtures) {
    const result = resolver.resolve({ question: fixture.question });
    const ids = result.matchedSections.map(section => section.id);
    for (const id of fixture.expected) assert.ok(ids.includes(id), `${fixture.question}: missing ${id}: ${ids}`);
    for (const id of fixture.excluded ?? []) assert.ok(!ids.includes(id));
    assert.ok(ids.length >= 2 && ids.length <= 5);
    assert.equal(new Set(ids).size, ids.length);
    assert.ok(JSON.stringify(result).length < markdown.length / 2);
    assert.deepEqual(result, resolver.resolve({ question: fixture.question }));
  }
  const diagnosticContext = { currentArea: "construction_repair", currentRole: "foreman_master_site_specialist",
    educationStatus: "higher", targetTasks: "defects_quality", recommendedTrack: "construction_expertise" };
  const priority = resolver.resolve({ question: "Сколько стоит обучение?", diagnosticContext });
  assert.ok(priority.matchedSections.some(s => s.id === "stroyexpert"));
  assert.ok(priority.contextSummary.includes("Приоритет — Стройэксперт"));
  assert.ok(priority.contextSummary.includes("не спрашивать повторно"));
  const alternative = resolver.resolve({ question: "Мне нужен строительный контроль ИЖС", diagnosticContext });
  assert.equal(alternative.matchedSections[0].id, "house_control");
  assert.ok(!alternative.contextSummary.includes("Приоритет — Стройэксперт"));
  const { DiagnosticKnowledgeResolver } = await import(new URL("packages/domain/src/diagnostic/DiagnosticKnowledgeResolver.ts", root));
  for (const [current_area, current_role, education_status, target_tasks] of [
    ["construction_repair", "foreman_master_site_specialist", "higher", "defects_quality"],
    ["other", "not_in_construction", "secondary_vocational", "explore"],
    ["real_estate_valuation_law", "valuer_lawyer_expert", "higher", "damage_loss"],
  ]) assert.equal(DiagnosticKnowledgeResolver.resolve({ current_area, current_area_other_text: current_area === "other" ? "Другая сфера" : undefined,
    current_role, education_status, target_tasks }).recommendedTrackHint, "construction_expertise");
  for (const education_status of ["higher", "secondary_vocational", "currently_studying"]) {
    for (const target_tasks of ["defects_quality", "damage_loss", "judicial_construction_expertise", "explore", "apartment_house_acceptance"]) {
      const answers = { current_area: "construction_repair", current_role: "foreman_master_site_specialist", education_status, target_tasks };
      const profile = { currentArea: answers.current_area, currentRole: answers.current_role, educationStatus: education_status,
        targetTasks: target_tasks, recommendedTrack: target_tasks === "apartment_house_acceptance" ? "not_defined" : "construction_expertise" };
      const resolved = DiagnosticKnowledgeResolver.resolve(answers);
      assert.equal(resolved.recommendedTrackHint, target_tasks === "apartment_house_acceptance" ? null : "construction_expertise");
      const recommendation = resolver.resolve({ question: "Что мне подойдет?", diagnosticContext: profile });
      assert.equal(recommendation.contextSummary.includes("Приоритет — Стройэксперт"), target_tasks !== "apartment_house_acceptance");
    }
  }
  assert.equal(DiagnosticKnowledgeResolver.resolve({ current_area: "construction_repair", current_role: "foreman_master_site_specialist",
    education_status: "no_higher_or_secondary_vocational", target_tasks: "defects_quality" }).recommendedTrackHint, "apartment_acceptance");
  const school = resolver.resolve({ question: "Судебная экспертиза, заказы, клиенты, цены, Стройэксперт", diagnosticContext: { ...diagnosticContext, educationStatus: "no_higher_or_secondary_vocational" } });
  assert.ok(school.matchedSections.some(s => s.id === "school_restriction"));
  assert.ok(school.matchedSections.some(s => s.id === "apartment_acceptance"));
  assert.ok(!school.matchedSections.some(s => s.id === "stroyexpert"));
  assert.ok(school.contextSummary.includes("Стройэксперт не рекомендовать"));
  const privateResult = resolver.resolve({ question: "Иван Петров +79999999999 test@example.org @private_user. Сколько стоит обучение?",
    name: "PRIVATE_NAME", contact: { phone: "PRIVATE_PHONE" },
    diagnosticContext: { ...diagnosticContext, email: "PRIVATE_EMAIL", lead: { name: "PRIVATE_LEAD" } },
  });
  for (const secret of ["Иван Петров", "+79999999999", "test@example.org", "@private_user", "PRIVATE_"]) assert.ok(!JSON.stringify(privateResult).includes(secret));
  assert.throws(() => resolver.resolve({ question: " " }), { code: "CONSULTANT_VALIDATION_ERROR" });
  assert.throws(() => resolver.resolve({ question: "Привет", diagnosticContext: { educationStatus: "PRIVATE_VALUE" } }), { code: "CONSULTANT_VALIDATION_ERROR" });
  assert.deepEqual(resolver.resolve({ question: "Погода на Марсе?" }).matchedSections.map(s => s.id), ["faq", "manager"]);
  assert.equal(resolver.resolve({ question: "как дела?" }).intent, "small_talk");
  assert.equal(resolver.resolve({ question: "расскажи анекдот" }).intent, "off_topic");
  assert.equal(resolver.resolve({ question: "ты дебил" }).intent, "abusive_or_trolling");
  assert.equal(resolver.resolve({ question: "Да это хрень, сколько стоит Стройэксперт?" }).intent, "relevant_training_question");
  for (const question of ["Да вы охренели, почему это столько стоит?", "Цена конская", "За что такие деньги?",
    "Что за хрень с тарифами, нормально объяснить можешь?", "Бесит твой ответ. Сколько всё-таки стоит курс?",
    "Очередной развод на деньги — в чём реальная польза?", "Докажи без рекламной фигни, зачем мне эта программа",
    "Ты вообще понимаешь, что говоришь? Какой документ я получу?", "Гарантию работы дашь или опять вода?",
    "Диплом-то настоящий или бумажка?", "Можно без этой воды — что конкретно я смогу делать?"]) {
    assert.equal(resolver.resolve({ question, diagnosticContext }).intent, "relevant_training_question", question);
  }
  const distrust = resolver.resolve({ question: "Ты вообще что-нибудь знаешь?", diagnosticContext: { ...diagnosticContext, program: "construction_expertise" } });
  assert.equal(distrust.intent, "relevant_training_question");
  assert.ok(distrust.matchedSections.some(section => section.id === "role_benefit"));
  assert.equal(resolver.resolve({ question: "Какой номер лицензии?" }).intent, "genuine_unknown_program_fact");
  const catalog = createConsultantSections(markdown);
  assert.equal(catalog.length, 23);
  assert.ok(!catalog.some(s => s.sources.includes("6.3") || s.sources.includes("8.2") || s.sources.includes("16.5")));
  assert.ok(catalog.find(s => s.id === "house_control").content.includes("сопровождению строительства частного дома по этапам"));
  assert.ok(catalog.find(s => s.id === "prices").content.includes("14 900 ₽"));
  assert.ok(catalog.find(s => s.id === "prices").content.includes("33 000 ₽"));
  assert.ok(catalog.find(s => s.id === "prices").content.includes("56 000 ₽"));
  assert.ok(catalog.find(s => s.id === "prices").content.includes("99 000 ₽"));
  assert.ok(!catalog.find(s => s.id === "prices").content.includes("6 × 2 480 ₽"));
  assert.ok(!catalog.find(s => s.id === "prices").content.includes("6 × 9 330 ₽"));
  assert.throws(() => new ConsultantKnowledgeResolver("# 10. Missing rest"));
  console.log(`PASS: ${fixtures.length} retrieval fixtures; determinism, 2–5 limit, context priority, school guard, privacy, validation and final source checks.`);
  for (const fixture of fixtures.slice(0, 3)) console.log(JSON.stringify({ question: fixture.question,
    sections: resolver.resolve({ question: fixture.question }).matchedSections.map(s => s.title) }));
} finally { hooks.deregister(); }
