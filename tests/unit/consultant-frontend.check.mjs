import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
const root = new URL("../../", import.meta.url);
const require = createRequire(new URL("package.json", root));
const ts = require("typescript");
const read = path => readFileSync(new URL(path, root), "utf8");
const moduleUrl = source => "data:text/javascript;base64," + Buffer.from(ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
}).outputText).toString("base64");
const api = moduleUrl(read("apps/web/src/lib/api.ts").replace("import.meta.env.VITE_API_BASE_URL", '"https://api.example.test/"'));
const { sendConsultantMessage } = await import(moduleUrl(read("apps/web/src/lib/consultant-chat.ts").replace('"./api"', JSON.stringify(api))));
const originalFetch = globalThis.fetch;
try {
  const sent = [];
  globalThis.fetch = async (url, options) => {
    assert.equal(url, "https://api.example.test/api/consultant-chat");
    const body = JSON.parse(options.body);
    assert.deepEqual(Object.keys(body), ["conversationId", "message"]);
    sent.push(body);
    return Response.json({ message: `Ответ: ${body.message}` });
  };
  for (const question of ["Цена?", "Документы?", "ИЖС?"]) {
    assert.equal(await sendConsultantMessage("same-conversation", question), `Ответ: ${question}`);
  }
  assert.equal(sent.length, 3);
  assert.ok(sent.every(row => row.conversationId === "same-conversation"));
  for (const response of [new Response("", { status: 500 }), Response.json({}), Response.json({ message: " " })]) {
    globalThis.fetch = async () => response;
    await assert.rejects(sendConsultantMessage("same-conversation", "Вопрос"));
  }
  globalThis.fetch = async () => { throw new TypeError("Network failed"); };
  await assert.rejects(sendConsultantMessage("same-conversation", "Вопрос"));
  globalThis.fetch = async () => Response.json({ message: "Ответ после повтора" });
  assert.equal(await sendConsultantMessage("same-conversation", "Вопрос"), "Ответ после повтора");
  console.log("PASS: 8 consultant frontend helper cases: 3 sequential questions, 4 errors, retry; mocked network only.");
} finally { globalThis.fetch = originalFetch; }
