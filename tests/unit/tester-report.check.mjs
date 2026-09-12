import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { registerHooks, createRequire } from "node:module";

const root = new URL("../../", import.meta.url);
const require = createRequire(new URL("package.json", root));
const ts = require("typescript");
const hooks = registerHooks({
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
  const report = await import(new URL("apps/web/src/lib/tester-report.ts", root));
  assert.equal(report.verdictLabel("PASS"), "ПРОЙДЕН");
  assert.equal(report.verdictLabel("REVIEW"), "ТРЕБУЕТ ВНИМАНИЯ");
  assert.equal(report.verdictLabel("FAIL"), "ПРОВАЛ ПО КАЧЕСТВУ");
  assert.equal(report.verdictLabel("TECH_ERROR"), "ТЕХНИЧЕСКАЯ ОШИБКА");
  assert.equal(report.errorLabel("CASE_EXECUTION_OR_EVALUATION_FAILED"), "Не удалось выполнить или оценить сценарий.");
  assert.equal(report.scoreStatus(90), "Отлично");
  assert.equal(report.scoreStatus(80), "Хорошо, есть точки роста");
  assert.equal(report.scoreStatus(70), "Требует улучшения");
  assert.equal(report.scoreStatus(69), "Критично");

  const page = readFileSync(new URL("apps/web/src/pages/tester.tsx", root), "utf8");
  assert.ok(page.includes("Итоговое заключение руководителя отдела продаж"));
  assert.ok(page.includes("Скопировать задачу для Codex"));
  assert.ok(page.includes("Что нужно исправить в Артёме"));
  assert.ok(page.includes("Рекомендации для базы знаний"));
  assert.ok(page.includes("Чему доучить Артёма"));
  assert.ok(page.includes("Всего сценариев:"));
  assert.ok(page.includes("Технические ошибки не считаются"));
  assert.ok(page.includes("Продолжить на тех же сценариях"));
  assert.ok(page.includes("Достигнут предел 5 серий"));
  assert.ok(!page.includes("CASE_EXECUTION_OR_EVALUATION_FAILED"));
  assert.ok(!page.includes("TECH_ERROR}"));
  console.log("PASS: Russian tester statuses, manager conclusion, Codex copy action, and manual 5-series UI.");
} finally {
  hooks.deregister();
}
