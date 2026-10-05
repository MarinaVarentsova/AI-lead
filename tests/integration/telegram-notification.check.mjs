import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { createRequire, registerHooks } from "node:module";
import { fileURLToPath } from "node:url";

const root = new URL("../../", import.meta.url);
const require = createRequire(new URL("package.json", root));
const ts = require("typescript");
const hooks = registerHooks({
  resolve(specifier, context, next) {
    if (specifier.startsWith(".") && context.parentURL?.startsWith("file:")) {
      for (const suffix of [".ts", "/index.ts"]) { const url = new URL(specifier + suffix, context.parentURL);
        if (existsSync(url)) return { url: url.href, shortCircuit: true }; }
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
  const { formatTelegramManagerLead, managerLeadContacts, sendTelegramIntegrationTest, sendTelegramManagerLead } =
    await import(new URL("apps/api/src/services/telegram-manager-notification.ts", root));
  const context = { sessionId: "11111111-1111-4111-8111-111111111111", recommendedProgram: "Стройэксперт",
    recommendationText: "Рекомендация на подтверждённых фактах.", diagnostic: { currentArea: "Проектирование и сметы",
      currentRole: "Инженер, проектировщик или сметчик", educationStatus: "Высшее",
      targetTasks: "Дефекты и качество строительных работ" }, dialogSummary: "Краткое резюме без домыслов.",
    transcript: [{ role: "user", text: "Вопрос клиента " + "длинный текст ".repeat(350) },
      { role: "assistant", text: "Ответ Артёма " + "подтверждённый ответ ".repeat(350) }],
    knowledgeBaseVersion: "inobr-artem-v4.3", createdAt: "2026-10-05T00:00:00.000Z", summarySource: "ai",
    utmSource: "yandex", utmMedium: "cpc", utmCampaign: "stroiexpert", utmContent: "hero" };
  const params = new URLSearchParams({ "formParams[full_name]": "ТЕСТ Артем_Экспертович_TG",
    "formParams[phone]": "+79807317327", "formParams[email]": "test@example.com" });
  const contacts = managerLeadContacts(params);
  assert.deepEqual(contacts, { name: "ТЕСТ Артем_Экспертович_TG", phone: "+79807317327", email: "test@example.com" });

  const messages = formatTelegramManagerLead(context, contacts);
  assert.ok(messages.length >= 2); assert.ok(messages.every(message => message.length <= 3900));
  assert.match(messages[0], /ТЕСТ Артем_Экспертович_TG/); assert.match(messages[0], /\+79807317327/);
  assert.match(messages[0], /test@example\.com/); assert.match(messages[0], /Стройэксперт/);
  assert.match(messages[0], /11111111-1111-4111-8111-111111111111/);
  const joined = messages.join("\n");
  assert.match(joined, /utm_source: yandex/); assert.match(joined, /utm_content: hero/);
  assert.match(joined, /Вопрос клиента/); assert.match(joined, /Ответ Артёма/);

  const logs = []; const trace = (stage, details) => logs.push({ stage, ...details });
  assert.deepEqual(await sendTelegramManagerLead(context, contacts, {}, async () => assert.fail("must skip"), trace),
    { status: "skipped", reason: "missing_token" });
  assert.deepEqual(await sendTelegramManagerLead(context, contacts, { TELEGRAM_BOT_TOKEN: "secret-token" },
    async () => assert.fail("must skip"), trace), { status: "skipped", reason: "missing_chat_id" });

  const requests = [];
  const sent = await sendTelegramManagerLead(context, contacts,
    { TELEGRAM_BOT_TOKEN: "secret-token", TELEGRAM_CHAT_ID: "-5538881072" }, async (url, init) => {
      requests.push({ url: String(url), body: JSON.parse(init.body) });
      return Response.json({ ok: true, result: { message_id: requests.length } });
    }, trace);
  assert.deepEqual(sent, { status: "sent", messageCount: messages.length });
  assert.equal(requests.length, messages.length);
  assert.ok(requests.every(request => request.body.chat_id === "-5538881072" && !request.body.parse_mode));
  assert.ok(requests.every(request => request.body.text.length <= 3900));

  const telegramFailure = await sendTelegramManagerLead(context, contacts,
    { TELEGRAM_BOT_TOKEN: "secret-token", TELEGRAM_CHAT_ID: "-5538881072" },
    async () => new Response("unavailable", { status: 503 }), trace);
  assert.deepEqual(telegramFailure, { status: "error", messageCount: 0, httpStatus: 503 });
  const networkFailure = await sendTelegramManagerLead(context, contacts,
    { TELEGRAM_BOT_TOKEN: "secret-token", TELEGRAM_CHAT_ID: "-5538881072" },
    async () => { throw new Error("network unavailable"); }, trace);
  assert.deepEqual(networkFailure, { status: "error", messageCount: 0 });
  assert.doesNotMatch(JSON.stringify(logs), /secret-token|api\.telegram\.org\/bot/);
  assert.ok(logs.some(item => item.stage === "telegram_notification_skipped"));
  assert.ok(logs.some(item => item.stage === "telegram_notification_start"));
  assert.ok(logs.some(item => item.stage === "telegram_notification_success"));
  assert.ok(logs.some(item => item.stage === "telegram_notification_error"));

  if (process.env.TELEGRAM_REAL_TEST === "1") {
    assert.ok(process.env.TELEGRAM_BOT_TOKEN); assert.ok(process.env.TELEGRAM_CHAT_ID);
    const real = await sendTelegramIntegrationTest(process.env, fetch, trace);
    assert.deepEqual(real, { status: "sent", messageCount: 1 });
    console.log("REAL PASS: Telegram integration test message accepted.");
  }
  console.log("PASS A-I: contacts/UTM, safe splitting, success, skip, isolation and secret-safe logs.");
} finally { hooks.deregister(); }
