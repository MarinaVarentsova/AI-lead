import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { createRequire, registerHooks } from "node:module";
import { fileURLToPath } from "node:url";

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
      source: ts.transpileModule(readFileSync(new URL(url), "utf8"), { fileName: fileURLToPath(url),
        compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText };
    return next(url, context);
  },
});

try {
  const { formatGetCourseManagerComment, submitGetCourseManagerForm, GETCOURSE_ENDPOINT } =
    await import(new URL("apps/api/src/services/getcourse-manager-form.ts", root));
  const context = {
    sessionId: "11111111-1111-4111-8111-111111111111", recommendedProgram: "Стройэксперт",
    recommendationText: "Точная персональная рекомендация.",
    diagnostic: { currentArea: "Проектирование", currentRole: "Проектировщик", educationStatus: "Высшее",
      targetTasks: "Исследовать дефекты" }, dialogSummary: "Краткое резюме без домыслов.",
    transcript: [{ role: "user", text: "Сколько стоит?" }, { role: "assistant", text: "Подтверждённая цена." }],
    knowledgeBaseVersion: "inobr-artem-v3.9", createdAt: "2026-09-24T00:00:00.000Z", summarySource: "ai",
  };
  const comment = formatGetCourseManagerComment(context);
  for (const expected of [context.sessionId, context.recommendedProgram, context.recommendationText,
    "Сфера: Проектирование", "Роль: Проектировщик", "Пользователь: Сколько стоит?",
    "Артём: Подтверждённая цена.", context.knowledgeBaseVersion]) assert.match(comment, new RegExp(expected));
  assert.doesNotMatch(comment, /summarySource|system prompt|DATABASE_URL|token/i);

  const requests = [];
  const fetcher = async (url, init = {}) => {
    requests.push({ url, init });
    if (init.method === "POST") return new Response("{\"success\":true}", { status: 200 });
    return new Response('window.requestTime = 1770000000; window.requestSimpleSign = "abcdef012345";', { status: 200 });
  };
  await submitGetCourseManagerForm({ email: "test@example.com", fullName: "Тест", phone: "+70000000000",
    sourceUrl: "https://artem.inobr-expert.ru/", referrer: "https://inobr.ru.com/" }, comment, fetcher);
  assert.equal(requests.length, 2); assert.equal(requests[0].url, GETCOURSE_ENDPOINT);
  const body = requests[1].init.body;
  assert.equal(body.get("formParams[email]"), "test@example.com");
  assert.equal(body.get("formParams[full_name]"), "Тест"); assert.equal(body.get("formParams[phone]"), "+70000000000");
  assert.equal(body.get("formParams[dealCustomFields][11904802]"), comment);
  assert.equal(body.get("requestTime"), "1770000000"); assert.equal(body.get("requestSimpleSign"), "abcdef012345");
  assert.equal(body.get("__gc__internal__form__helper"), "https://artem.inobr-expert.ru/");
  assert.equal(body.get("__gc__internal__form__helper_ref"), "https://inobr.ru.com/");

  await assert.rejects(() => submitGetCourseManagerForm({ email: "a@b.c", fullName: "A", phone: "+7",
    sourceUrl: "https://example.test", referrer: "" }, comment,
    async (_url, init = {}) => init.method === "POST" ? new Response("Произошла ошибка", { status: 200 })
      : new Response('window.requestTime=1;window.requestSimpleSign="abc";', { status: 200 })), /GETCOURSE_SUBMIT_FAILED/);
  console.log("PASS A-F: exact manager context, fresh GetCourse signatures, complete form payload and failure handling.");
} finally { hooks.deregister(); }
