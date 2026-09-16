import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { createRequire, registerHooks } from "node:module";
import { fileURLToPath } from "node:url";

const root = new URL("../../", import.meta.url);
const require = createRequire(new URL("package.json", root));
const ts = require("typescript");
const hooks = registerHooks({
  resolve(specifier, context, nextResolve) {
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
    if (url.startsWith("file:") && url.endsWith(".ts")) return {
      format: "module", shortCircuit: true,
      source: ts.transpileModule(readFileSync(new URL(url), "utf8"), {
        fileName: fileURLToPath(url), compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
      }).outputText,
    };
    return nextLoad(url, context);
  },
});

try {
  const domain = await import(new URL("packages/domain/src/diagnostic/index.ts", root));
  const { DIAGNOSTIC_SCHEMA, DiagnosticKnowledgeResolver, DiagnosticValidationError } = domain;
  assert.equal(DIAGNOSTIC_SCHEMA.length, 4);
  assert.deepEqual(DIAGNOSTIC_SCHEMA.map(({ questionNumber, field }) => ({ questionNumber, field })), [
    { questionNumber: 1, field: "current_area" },
    { questionNumber: 2, field: "current_role" },
    { questionNumber: 3, field: "education_status" },
    { questionNumber: 4, field: "target_tasks" },
  ]);
  assert.deepEqual(DIAGNOSTIC_SCHEMA.map(question => question.options.map(option => option.code)), [
    ["construction_repair", "design_estimates", "construction_control", "real_estate_valuation_law", "other"],
    ["engineer_designer_estimator", "foreman_master_site_specialist", "manager_owner", "valuer_lawyer_expert", "not_in_construction"],
    ["higher", "secondary_vocational", "currently_studying", "no_higher_or_secondary_vocational"],
    ["defects_quality", "damage_loss", "apartment_house_acceptance", "judicial_construction_expertise", "explore"],
  ]);
  for (const question of DIAGNOSTIC_SCHEMA) for (const option of question.options) {
    assert.equal(option.allowsFreeText, question.field === "current_area" && option.code === "other");
  }
  const json = JSON.stringify(DIAGNOSTIC_SCHEMA);
  for (const legacy of ["experience_area", "experience_years", "education_type", '"goal"']) assert.ok(!json.includes(legacy));

  const valid = { current_area: "construction_repair", current_role: "foreman_master_site_specialist",
    education_status: "higher", target_tasks: "defects_quality" };
  assert.equal(DiagnosticKnowledgeResolver.resolve(valid).answers.currentArea.code, "construction_repair");
  assert.equal(DiagnosticKnowledgeResolver.resolve({ ...valid, current_area: "other", current_area_other_text: "Промышленная безопасность" }).answers.currentArea.otherText, "Промышленная безопасность");
  assert.throws(() => DiagnosticKnowledgeResolver.resolve({ ...valid, current_area: "other" }), error =>
    error instanceof DiagnosticValidationError && error.issues.some(issue => issue.field === "current_area_other_text" && issue.code === "required"));
  assert.doesNotThrow(() => DiagnosticKnowledgeResolver.resolve(valid));

  const { default: router } = await import(new URL("apps/api/src/routes/diagnostic-schema.ts", root));
  const handler = router.stack.find(layer => layer.route?.path === "/diagnostic/schema").route.stack[0].handle;
  const response = { statusCode: 0, status(code) { this.statusCode = code; return this; }, json(body) { this.body = body; return this; } };
  handler({}, response);
  assert.equal(response.statusCode, 200);
  assert.deepEqual(response.body, DIAGNOSTIC_SCHEMA);
  console.log("PASS: v3 schema endpoint, exact order/codes/free-text flags, no legacy fields, and v3 validation.");
} finally {
  hooks.deregister();
}
