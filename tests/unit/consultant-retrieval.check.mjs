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
  const markdown = readFileSync(new URL("knowledge/inobr/artem-expertovich-final.md", root), "utf8");
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
  const diagnosticContext = { experienceArea: "no_experience", experienceYears: "none", educationType: "non_profile", goal: "construction_expertise", recommendedTrack: "construction_expertise" };
  const priority = resolver.resolve({ question: "Сколько стоит обучение?", diagnosticContext });
  assert.ok(priority.matchedSections.some(s => s.id === "stroyexpert"));
  assert.ok(priority.contextSummary.includes("Приоритет — Стройэксперт"));
  assert.ok(priority.contextSummary.includes("не спрашивать повторно"));
  const alternative = resolver.resolve({ question: "Мне нужен строительный контроль ИЖС", diagnosticContext });
  assert.equal(alternative.matchedSections[0].id, "house_control");
  assert.ok(!alternative.contextSummary.includes("Приоритет — Стройэксперт"));
  const { DiagnosticKnowledgeResolver } = await import(new URL("packages/domain/src/diagnostic/DiagnosticKnowledgeResolver.ts", root));
  for (const [experienceArea, experienceYears, educationType, goal] of [
    ["construction", "related_experience", "higher_technical", "research_only"],
    ["no_experience", "none", "non_profile", "new_profession"],
    ["construction", "more_than_10", "non_profile", "expand_services"],
  ]) assert.equal(DiagnosticKnowledgeResolver.resolve({ experienceArea, experienceYears, educationType, goal }).recommendedTrackHint, "construction_expertise");
  for (const educationType of ["higher_technical", "secondary_technical", "non_profile"]) {
    for (const goal of ["extra_income", "new_profession", "expand_services", "research_only", "construction_expertise", "apartment_acceptance"]) {
      const profile = { experienceArea: "no_experience", experienceYears: "none", educationType, goal };
      const resolved = DiagnosticKnowledgeResolver.resolve(profile);
      assert.equal(resolved.recommendedTrackHint, goal === "apartment_acceptance" ? "apartment_acceptance" : "construction_expertise");
      const recommendation = resolver.resolve({ question: "Что мне подойдет?", diagnosticContext: profile });
      assert.equal(recommendation.contextSummary.includes("Приоритет — Стройэксперт"), goal !== "apartment_acceptance");
    }
  }
  for (const educationType of ["school_only", "diploma_not_available", "need_clarification"]) {
    assert.equal(DiagnosticKnowledgeResolver.resolve({ ...diagnosticContext, educationType }).recommendedTrackHint, null);
  }
  const school = resolver.resolve({ question: "Судебная экспертиза, заказы, клиенты, цены, Стройэксперт", diagnosticContext: { ...diagnosticContext, educationType: "school_only" } });
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
  assert.throws(() => resolver.resolve({ question: "Привет", diagnosticContext: { educationType: "PRIVATE_VALUE" } }), { code: "CONSULTANT_VALIDATION_ERROR" });
  assert.deepEqual(resolver.resolve({ question: "Погода на Марсе?" }).matchedSections.map(s => s.id), ["faq", "manager"]);
  const catalog = createConsultantSections(markdown);
  assert.equal(catalog.length, 22);
  assert.ok(!catalog.some(s => s.sources.includes("6.3") || s.sources.includes("8.2") || s.sources.includes("16.5")));
  assert.ok(catalog.find(s => s.id === "house_control").content.includes("Длительное сопровождение"));
  assert.throws(() => new ConsultantKnowledgeResolver("# 10. Missing rest"));
  console.log(`PASS: ${fixtures.length} retrieval fixtures; determinism, 2–5 limit, context priority, school guard, privacy, validation and final source checks.`);
  for (const fixture of fixtures.slice(0, 3)) console.log(JSON.stringify({ question: fixture.question,
    sections: resolver.resolve({ question: fixture.question }).matchedSections.map(s => s.title) }));
} finally { hooks.deregister(); }
