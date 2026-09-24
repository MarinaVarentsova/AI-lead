import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { createRequire, registerHooks } from "node:module";
const root = new URL("../../", import.meta.url);
const require = createRequire(new URL("package.json", root));
const ts = require("typescript");
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
      source: ts.transpileModule(readFileSync(new URL(url), "utf8"), { compilerOptions: {
        module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022,
      } }).outputText };
    return next(url, context);
  },
});
try {
  const modes = await import(new URL("apps/api/src/tester/stress-modes.ts", root));
  const { evaluatorPromptForMode, validateEvaluation, CRITERIA } = await import(new URL("apps/api/src/tester/evaluator.ts", root));
  assert.deepEqual(modes.TESTER_MODES, ["Разводило", "Ботан", "Адекват", "Быдло", "Психологиня"]);
  for (const mode of modes.TESTER_MODES) {
    assert.ok(modes.TESTER_MODE_DESCRIPTIONS[mode].length > 20);
    assert.match(modes.TESTER_MODE_PROMPTS[mode], new RegExp(`Режим «${mode}»`));
    assert.ok(modes.TESTER_MODE_FALLBACKS[mode].length >= 10);
    const fallback = modes.fallbackStressPersonas(5, mode, () => 0.42);
    assert.equal(fallback.length, 5);
    assert.ok(fallback.every(item => item.mode === mode && item.questions.length >= 1 && item.questions.length <= 3));
    assert.equal(new Set(fallback.flatMap(item => item.questions).map(text => text.toLowerCase())).size, 5);
    assert.match(evaluatorPromptForMode(mode), new RegExp(`Активный stress-mode: «${mode}»`));
    assert.match(evaluatorPromptForMode(mode), new RegExp(`${mode}:`));
  }
  const fraudPrompt = evaluatorPromptForMode("Разводило");
  for (const rule of [/Unknown не означает no|unknown != no/i, /ложного отрицания/i, /индивидуальной цены/i,
    /первого взноса/i, /Названия подтверждённых тарифов не являются выдуманным позиционированием/i,
    /Не требуй маркетинговую пользу сертификата/i, /textual CTA/i]) assert.match(fraudPrompt, rule);
  assert.match(fraudPrompt, /Базовый.*Средний.*Премиум.*Премиум \+ ИЖС/s);
  assert.match(fraudPrompt, /доверия заказчиков|новых заказов|пользы в спорах/i);
  const botanyPrompt = evaluatorPromptForMode("Ботан");
  for (const rule of [/professional.*precision|factual precision/i, /textual CTA.*не требуй|Не требуй textual CTA/i,
    /3–4 месяца/, /6–8 месяцев/, /учебные задания.*реценз/i, /В follow-up не требуй повторения/i,
    /сферы услуг/i, /unknown document/i]) assert.match(botanyPrompt, rule);
  const adequatePrompt = evaluatorPromptForMode("Адекват");
  for (const rule of [/корректная рекомендация/i, /что выбрать.*не off-topic/i, /не требуй textual CTA/i,
    /я подумаю/i, /Учебные задания.*не hallucination/i, /широкой сферой/i, /поиска клиентов.*без sales plan/i,
    /смысл ответа.*не exact wording/i]) assert.match(adequatePrompt, rule);
  assert.match(evaluatorPromptForMode("Быдло"), /Не штрафуй.*мат.*штрафуй ответное оскорбление/s);
  assert.match(evaluatorPromptForMode("Психологиня"), /Полный off-topic.*смешанном сообщении.*учебную часть/s);
  const ai = await modes.generateStressPersonas(1, "Адекват", { async generateStructured(system) {
    assert.equal(system, modes.TESTER_MODE_PROMPTS["Адекват"]);
    return { cases: [{ label: "обычный клиент", intent: "выбор курса", answers: {
      current_area: "construction_repair", current_role: "foreman_master_site_specialist",
      education_status: "higher", target_tasks: "defects_quality",
    }, questions: ["Что мне подойдёт?"] }] };
  }});
  assert.equal(ai.source, "ai"); assert.equal(ai.personas[0].mode, "Адекват");
  const duplicate = await modes.generateStressPersonas(2, "Ботан", { async generateStructured() { return { cases: [
    { label: "a", intent: "a", answers: ai.personas[0].answers, questions: ["Одинаково?"] },
    { label: "b", intent: "b", answers: ai.personas[0].answers, questions: ["Одинаково?"] },
  ] }; } }, () => 0.42);
  assert.equal(duplicate.source, "fallback");
  const minimalValid = validateEvaluation({ criteria: Object.fromEntries(CRITERIA.map(key => [key, 90])) });
  assert.equal(minimalValid.verdict, "PASS");
  assert.deepEqual(minimalValid.problems, []);
  const page = readFileSync(new URL("apps/web/src/pages/tester.tsx", root), "utf8");
  const modeUi = readFileSync(new URL("apps/web/src/lib/tester-modes.ts", root), "utf8");
  for (const mode of modes.TESTER_MODES) assert.ok(modeUi.includes(mode));
  assert.match(page, /role="tab" aria-selected=\{mode === item\}/);
  assert.match(page, /TESTER_MODE_DESCRIPTIONS\[mode\]/);
  assert.match(page, /JSON\.stringify\(\{ count, parentRunId, mode \}\)/);
  assert.match(page, /Режим: \{summary\?\.mode \?\? mode\}/);
  const route = readFileSync(new URL("apps/api/src/routes/tester.ts", root), "utf8");
  assert.match(route, /parent\.summary[\s\S]*?mode/);
  assert.match(route, /previousCases\.map\(row => row\.persona as Persona\)/);
  assert.match(route, /summary: \{ mode, modeDescription:[\s\S]*?generatorSource/);
  assert.match(route, /errorDetail, attempts, artemResponseSaved/);
  assert.ok(!route.includes("aiSessions") && !route.includes("aiDialogue") && !route.includes("aiEvents"));
  console.log("PASS: 5 stress modes, distinct prompts/fallbacks, evaluator calibration, UI request/display and JSONB continuation metadata.");
} finally { hooks.deregister(); }
