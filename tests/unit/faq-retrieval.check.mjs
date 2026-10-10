import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { createRequire, registerHooks } from "node:module";
import { fileURLToPath } from "node:url";

const root = new URL("../../", import.meta.url); const require = createRequire(new URL("package.json", root));
const ts = require("typescript");
const hooks = registerHooks({
  resolve(specifier, context, next) {
    if (specifier.startsWith("@workspace/domain/")) return { url: new URL(`packages/domain/src/${specifier.slice(18)}/index.ts`, root).href, shortCircuit: true };
    if (specifier.startsWith(".") && context.parentURL?.startsWith("file:")) for (const suffix of [".ts", "/index.ts"]) {
      const url = new URL(specifier + suffix, context.parentURL); if (existsSync(url)) return { url: url.href, shortCircuit: true };
    }
    return next(specifier, context);
  },
  load(url, context, next) {
    if (url.startsWith("file:") && url.endsWith(".ts")) return { format: "module", shortCircuit: true,
      source: ts.transpileModule(readFileSync(new URL(url), "utf8"), { fileName: fileURLToPath(url),
        compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText };
    return next(url, context);
  },
});

try {
  const { createArtemRuntime, loadArtemKnowledge, loadArtemFaq } = await import(new URL("apps/api/src/ai/artem-runtime.ts", root));
  const markdown = await loadArtemKnowledge(); const faq = await loadArtemFaq(); assert.equal(faq.length, 1200);
  const provider = { generateStructured: async () => { throw new Error("disabled"); }, generateConsultantReply: async () => { throw new Error("disabled"); } };
  const runtime = createArtemRuntime(markdown, provider, faq);
  const answers = { current_area: "design_estimates", current_role: "engineer_designer_estimator",
    education_status: "higher", target_tasks: "defects_quality" };

  const exact = runtime.prepare(answers, "А тарифы чем вообще отличаются?");
  assert.equal(exact.faqMatch?.intent, "tariff_comparison"); assert.ok(exact.faqMatch.similarity >= 0.46);
  assert.ok(exact.matchedSections.some(section => section.id.startsWith("faq:")));
  const resolvedExact = runtime.resolver.resolve({ question: "А тарифы чем вообще отличаются?",
    diagnosticContext: { program: "construction_expertise" } });
  assert.ok(resolvedExact.matchedSections.some(section => section.reason.includes("faq_kb_reference")));
  assert.equal(runtime.prepare(answers, "А кредит можно оформить?").faqMatch?.policy, "MANAGER");
  assert.equal(runtime.prepare(answers, "сколько стоит и как записаться").faqMatch?.policy, "MIXED");
  assert.equal(runtime.prepare(answers, "Это очно или можно из дома?").faqMatch?.policy, "KB");
  assert.equal(runtime.prepare(answers, "Погода на Марсе и рецепт борща").faqMatch, undefined);

  const variants = [
    ["tariff_comparison", ["За что доплата между пакетами обучения", "Сопоставьте комплектации тарифов", "Почему учебные пакеты стоят по-разному", "Что добавляется в дорогих тарифах", "Разложите различия пакетов по пунктам"]],
    ["financing", ["Получится оплатить курс частями", "Есть банковский кредит на обучение", "Как устроены платежи в рассрочку", "Можно перенести оплату на потом", "Предусмотрена отсрочка платежа"]],
    ["format_online_offline", ["Мне обязательно приезжать на занятия", "Смогу учиться полностью из дома", "Курс проходит очно или удаленно", "Нужно посещать институт лично", "Доступен дистанционный вариант"]],
    ["documents", ["Какую бумагу выдадут после выпуска", "Диплом появится во ФРДО", "Чем подтверждается квалификация", "Какой итоговый документ получу", "Выдается ли диплом о переподготовке"]],
    ["enrollment", ["Куда нажать чтобы оформить обучение", "Как подать заявку на курс", "Хочу записаться что делать", "Как происходит поступление", "Кто поможет оформить зачисление"]],
    ["promo", ["Есть сейчас промокод на обучение", "Можно получить скидку", "Какие акции действуют", "Предусмотрена специальная цена", "Есть льготное предложение"]],
    ["practice", ["Будут задания на реальных кейсах", "Практика в программе предусмотрена", "Кто проверяет итоговую работу", "Нужно выполнять практические задания", "Есть обратная связь по кейсам"]],
    ["career", ["Поможете найти первые заказы", "Даете гарантию рабочего места после выпуска", "Как искать клиентов после выпуска", "Можно ли рассчитывать на доход", "Помогает ли обучение с трудоустройством"]],
    ["price", ["Назовите полную цену Стройэксперта", "Во сколько обойдется программа", "Какова стоимость всего курса", "Сколько денег нужно на Стройэксперт", "Озвучьте стоимость обучения"]],
    ["duration", ["Сколько академических часов занимает курс", "Какая длительность программы", "Сколько времени идет обучение", "Назовите объем курса в часах", "Долго ли учиться на Стройэксперта"]],
  ];
  const corpusQuestions = new Set(faq.map(row => row.question.toLowerCase())); let checked = 0;
  for (const [intent, questions] of variants) for (const question of questions) {
    assert.equal(corpusQuestions.has(question.toLowerCase()), false, question); const facts = runtime.prepare(answers, question);
    assert.equal(facts.faqMatch?.intent, intent, question); const reply = await runtime.reply(facts, []);
    assert.equal(reply.faqMatchUsed, true); assert.notEqual(reply.fallbackReason, "INSUFFICIENT_KNOWLEDGE"); checked++;
  }
  assert.equal(checked, 50);

  const changed = createArtemRuntime(markdown, provider, [...faq.slice(0, -1), { ...faq.at(-1), answer: faq.at(-1).answer + " обновлено" }]);
  assert.notEqual(runtime.resolver.resolve({ question: "Сколько стоит?" }).sourceVersion,
    changed.resolver.resolve({ question: "Сколько стоит?" }).sourceVersion);
  const conflicting = createArtemRuntime(markdown, provider, [{ id: "x", category: "Стоимость", intent: "price", policy: "KB",
    question: "Назовите цену", answer: "Стоимость — 123 456 ₽.", kbReference: "§12" }]);
  const conflictFacts = conflicting.prepare(answers, "Назовите цену"); const conflictReply = await conflicting.reply(conflictFacts, []);
  assert.doesNotMatch(conflictReply.message, /123\s*456/);
  console.log("PASS A-N: FAQ exact/paraphrase/threshold/reference/policy/context/conflict, shared runtime and 50 paraphrases.");
} finally { hooks.deregister(); }
