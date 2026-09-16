// Integration-style route flow with an in-memory DB and deterministic provider boundary.
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { createRequire, registerHooks } from "node:module";
import { fileURLToPath } from "node:url";

const root = new URL("../../", import.meta.url);
const require = createRequire(new URL("package.json", root));
const ts = require("typescript");
let schema;
const store = { sessions: [], conversations: [], answers: new Map(), messages: [] };

const db = {
  async transaction(callback) { return callback(this); },
  async execute() {},
  insert(table) {
    return { values(value) {
      if (table === schema.aiDiagnosticAnswers) return { async onConflictDoUpdate() { store.answers.set(value.conversationId, { ...value }); } };
      return { async returning() {
        if (table === schema.aiSessions) {
          const row = { id: randomUUID(), sessionKey: value.sessionKey }; store.sessions.push(row); return [row];
        }
        if (table === schema.aiConversations) {
          const row = { id: randomUUID(), ...value }; store.conversations.push(row); return [row];
        }
        assert.equal(table, schema.aiMessages);
        const row = { id: value.id ?? randomUUID(), createdAt: value.createdAt ?? new Date(), ...value };
        store.messages.push(row); return [row];
      } };
    } };
  },
  update(table) {
    assert.equal(table, schema.aiConversations);
    return { set(value) { return { async where() { Object.assign(store.conversations.at(-1), value); } }; } };
  },
  select() {
    return { from(table) {
      if (table === schema.aiDiagnosticAnswers) return { where() { return { async limit() {
        const conversationId = store.conversations.at(-1)?.id;
        const row = store.answers.get(conversationId); return row ? [{
          currentArea: row.experienceArea, currentAreaOtherText: row.experienceAreaRaw,
          currentRole: row.experienceYears, educationStatus: row.educationType, targetTasks: row.goal,
        }] : [];
      } }; } };
      assert.equal(table, schema.aiMessages);
      return { where() { return { async orderBy() {
        const conversationId = store.conversations.at(-1)?.id;
        return store.messages.filter(row => row.conversationId === conversationId && row.step === "post_diagnostic_chat");
      } }; } };
    } };
  },
};
globalThis.__flowCheckDb = db;
const hooks = registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier === "@workspace/db") return { url: "flow-check:db", shortCircuit: true };
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
    if (url === "flow-check:db") return { format: "module", shortCircuit: true, source:
      `export const db = globalThis.__flowCheckDb;
       export { aiSessions, aiConversations, aiDiagnosticAnswers, aiMessages } from ${JSON.stringify(new URL("packages/db/src/schema/ai-sessions.ts", root).href)};` };
    if (url.startsWith("file:") && url.endsWith(".ts")) return { format: "module", shortCircuit: true,
      source: ts.transpileModule(readFileSync(new URL(url), "utf8"), {
        fileName: fileURLToPath(url), compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
      }).outputText };
    return nextLoad(url, context);
  },
});

const response = () => ({ statusCode: 200, status(code) { this.statusCode = code; return this; }, json(body) { this.body = body; return this; } });
const log = { info() {}, warn() {}, error() {} };
const invoke = async (router, path, body) => {
  const handle = router.stack.find(layer => layer.route?.path === path).route.stack[0].handle;
  const res = response(); await handle({ body, log }, res); return res;
};

try {
  schema = await import(new URL("packages/db/src/schema/ai-sessions.ts", root));
  const [{ default: sessions }, { default: conversations }, { default: answers }, { default: diagnose },
    { default: consultant }, { YandexAIProvider }] = await Promise.all([
    import(new URL("apps/api/src/routes/sessions.ts", root)),
    import(new URL("apps/api/src/routes/conversations.ts", root)),
    import(new URL("apps/api/src/routes/diagnostic-answers.ts", root)),
    import(new URL("apps/api/src/routes/diagnose.ts", root)),
    import(new URL("apps/api/src/routes/consultant-chat.ts", root)),
    import(new URL("apps/api/src/ai/yandex-provider.ts", root)),
  ]);
  YandexAIProvider.prototype.generateDiagnosticResult = async () => ({
    summary: "Диагностика завершена.", currentArea: "Ваша текущая сфера — Строительство и ремонт.",
    currentRole: "Ваша роль — прораб, мастер или специалист на объекте.", education: "У вас среднее профессиональное образование.",
    targetTasks: "Вы хотите работать с задачами: дефекты и качество строительных работ.",
    recommendation: "Стройэксперт подходит под вашу задачу. Ваша текущая сфера — Строительство и ремонт. Вы хотите работать с задачами: дефекты и качество строительных работ. На программе можно изучать дефекты и подготовку заключения. Для условий нажмите «Связаться с менеджером».",
    recommendedTrack: "construction_expertise", importantNote: null,
  });
  YandexAIProvider.prototype.generateConsultantReply = async input =>
    `Ответ Артёма на вопрос «${input.question}» сформирован по выбранным разделам базы знаний.`;

  const session = await invoke(sessions, "/sessions", {});
  assert.equal(session.statusCode, 201);
  const conversation = await invoke(conversations, "/conversations", { sessionId: session.body.sessionId });
  assert.equal(conversation.statusCode, 201);
  const conversationId = conversation.body.conversationId;
  const saved = await invoke(answers, "/diagnostic-answers", {
    conversationId, current_area: "construction_repair",
    current_role: "foreman_master_site_specialist", education_status: "secondary_vocational",
    target_tasks: "defects_quality",
  });
  assert.equal(saved.statusCode, 201);
  const diagnostic = await invoke(diagnose, "/diagnose", { conversationId });
  assert.equal(diagnostic.statusCode, 200);

  for (const question of ["Сколько стоит?", "Какие документы нужны?", "Когда начинается обучение?"]) {
    const result = await invoke(consultant, "/consultant-chat", { conversationId, message: question, requestId: randomUUID() });
    assert.equal(result.statusCode, 200); assert.ok(result.body.message.trim());
  }
  const fourth = await invoke(consultant, "/consultant-chat", {
    conversationId, message: "Можно задать ещё вопрос?", requestId: randomUUID(),
  });
  assert.equal(fourth.statusCode, 409); assert.equal(fourth.body.error, "FOLLOW_UP_LIMIT");
  assert.equal(store.messages.filter(row => row.step === "post_diagnostic_chat" && row.role === "user").length, 3);
  console.log("PASS: session → conversation → 4 answers → diagnose → consultant 200/200/200/409; non-empty price answer; limit persisted once.");
} finally {
  hooks.deregister(); delete globalThis.__flowCheckDb;
}
