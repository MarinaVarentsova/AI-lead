import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { createRequire, registerHooks } from "node:module";

const root = new URL("../../", import.meta.url);
const require = createRequire(new URL("package.json", root));
const ts = require("typescript");
const hooks = registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier.startsWith(".") && context.parentURL?.startsWith("file:")) {
      const url = new URL(specifier, context.parentURL);
      for (const suffix of [".ts", "/index.ts"]) {
        if (existsSync(new URL(url.href + suffix))) return { url: url.href + suffix, shortCircuit: true };
      }
    }
    return nextResolve(specifier, context);
  },
  load(url, context, nextLoad) {
    if (url.startsWith("file:") && url.endsWith(".ts")) return { format: "module", shortCircuit: true,
      source: ts.transpileModule(readFileSync(new URL(url), "utf8"), {
        compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
      }).outputText };
    return nextLoad(url, context);
  },
});

try {
  const { DiagnosticKnowledgeResolver, buildFactsPacket } = await import(new URL("packages/domain/src/diagnostic/index.ts", root));
  const { diagnosticProgram, currentProgram } = await import(new URL("apps/api/src/ai/artem-policy.ts", root));
  const { generateDiagnosticFallback } = await import(new URL("apps/api/src/ai/diagnostic-result.service.ts", root));
  const { formatDiagnosticResult } = await import(new URL("apps/api/src/ai/format-diagnostic.ts", root));
  const base = { current_area: "construction_repair", current_role: "foreman_master_site_specialist",
    education_status: "higher", target_tasks: "defects_quality" };
  const resolve = answers => buildFactsPacket(DiagnosticKnowledgeResolver.resolve(answers));
  const result = answers => {
    const facts = resolve(answers);
    return { facts, output: generateDiagnosticFallback(facts) };
  };

  for (const education_status of ["higher", "secondary_vocational"]) {
    for (const target_tasks of ["defects_quality", "damage_loss", "judicial_construction_expertise"]) {
      const { facts, output } = result({ ...base, education_status, target_tasks });
      assert.equal(facts.recommendedTrackHint, "construction_expertise");
      assert.equal(diagnosticProgram(facts), "construction_expertise");
      assert.match(output.recommendation, /Стройэксперт/);
    }
  }

  const acceptance = result({ ...base, target_tasks: "apartment_house_acceptance" });
  assert.equal(diagnosticProgram(acceptance.facts), "acceptance_choice");
  assert.match(acceptance.output.recommendation, /Приёмка квартир.*Приёмка ИЖС/);

  for (const target_tasks of ["defects_quality", "apartment_house_acceptance"]) {
    const student = result({ ...base, education_status: "currently_studying", target_tasks });
    assert.match(student.output.recommendation, /начать обучение можно уже сейчас/i);
    assert.match(student.output.recommendation, /выпускные документы.*после.*диплом/i);
  }

  const school = result({ ...base, education_status: "no_higher_or_secondary_vocational" });
  assert.equal(diagnosticProgram(school.facts), "apartment_acceptance");
  assert.match(school.output.recommendation, /Приёмка квартир/);
  assert.doesNotMatch(school.output.recommendation, /можно рассмотреть «Стройэксперт»/);

  for (const variant of [
    { current_area: "design_estimates", current_role: "engineer_designer_estimator" },
    { current_area: "construction_control", current_role: "manager_owner" },
    { current_area: "other", current_area_other_text: "Банковская сфера", current_role: "not_in_construction" },
  ]) {
    const routed = result({ ...base, ...variant });
    assert.equal(diagnosticProgram(routed.facts), "construction_expertise");
    assert.ok(routed.output.recommendation.includes(routed.facts.education));
    assert.ok(routed.output.recommendation.includes(routed.facts.targetTasks));
    assert.doesNotMatch(routed.output.recommendation, /стаж/i);
  }

  assert.equal(currentProgram("construction_expertise", "Нужен технадзор при строительстве частного дома", []), "house_control");
  assert.equal(currentProgram("construction_expertise", "Хочу сопровождать стройку ИЖС по этапам", []), "house_control");

  const publicResult = formatDiagnosticResult(result(base).output);
  assert.doesNotMatch(publicResult, /Ваш опыт|Стаж|Образование:|Ваша цель|Текущая сфера:|Роль:/i);
  assert.match(publicResult, /Стройэксперт/);
  assert.throws(() => DiagnosticKnowledgeResolver.resolve({ experience_area: "construction_repair",
    experience_years: "foreman_master_site_specialist", education_type: "higher", goal: "defects_quality" }));

  console.log("PASS: KB v3 recommendation routing, education guards, acceptance choice, explicit ИЖС control and public format.");
} finally {
  hooks.deregister();
}
